(function() {
    if (window.__REACT_DISK_CLONER__) return;
    window.__REACT_DISK_CLONER__ = true;

    // Inject React Fiber Inspector
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('page_hook.js');
    (document.head || document.documentElement).appendChild(script);

    // State & File System Handles
    let rootDirHandle = null;
    let pagesDirHandle = null;
    let modalsDirHandle = null;
    let staticDirHandle = null;

    let isRunning = false;
    let observer = null;
    let debounceTimer = null;
    let lastHash = "";

    // In-Memory Knowledge of Existing Disk Files
    const knownFiles = {
        pages: new Map(),   // filename -> content hash/size
        modals: new Map(),  // filename -> content hash/size
        cssRules: new Set(),
        hasLayout: false
    };

    // Build Floating UI Panel (100% English)
    const panel = document.createElement('div');
    panel.id = "rdc-panel";
    panel.style.cssText = `
        position: fixed; bottom: 20px; left: 20px; width: 310px;
        background: #0f172a; color: #f8fafc; border: 1px solid #334155;
        border-radius: 10px; padding: 14px; z-index: 2147483647;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 12px; direction: ltr; text-align: left;
        box-shadow: 0 20px 40px rgba(0,0,0,0.85); user-select: none;
    `;

    panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b;padding-bottom:8px;margin-bottom:8px;">
            <strong style="color:#38bdf8;font-size:13px;">⚛️ REACT DISK CLONER</strong>
            <span id="rdc-badge" style="background:#334155;color:#cbd5e1;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:bold;">READY</span>
        </div>

        <div id="rdc-stack" style="background:#1e293b;padding:7px;border-radius:6px;margin-bottom:8px;font-size:11px;color:#94a3b8;line-height:1.4;">
            Scanning React Fiber...
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;text-align:center;font-size:11px;">
            <div style="background:#1e293b;padding:6px;border-radius:6px;">
                Pages on Disk<br><strong id="rdc-pages-count" style="color:#38bdf8;font-size:15px;">0</strong>
            </div>
            <div style="background:#1e293b;padding:6px;border-radius:6px;">
                Modals on Disk<br><strong id="rdc-modals-count" style="color:#a855f7;font-size:15px;">0</strong>
            </div>
        </div>

        <div id="rdc-log" style="background:#020617;color:#10b981;padding:6px 8px;border-radius:5px;margin-bottom:10px;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px solid #1e293b;">
            Select mode to connect local folder...
        </div>

        <!-- VIEW 1: Initial Start / Continue Buttons -->
        <div id="rdc-init-controls" style="display:flex;flex-direction:column;gap:6px;">
            <button id="rdc-btn-fresh" style="background:#10b981;color:#0f172a;border:none;padding:9px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">
                🚀 Start Fresh (New Folder)
            </button>
            <button id="rdc-btn-continue" style="background:#3b82f6;color:#fff;border:none;padding:9px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">
                📂 Continue Existing (Load Project)
            </button>
        </div>

        <!-- VIEW 2: Active Recording Controls (Hidden Initially) -->
        <div id="rdc-active-controls" style="display:none;flex-direction:column;gap:6px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                <button id="rdc-btn-save" style="background:#10b981;color:#0f172a;border:none;padding:9px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">
                    💾 Save Now
                </button>
                <button id="rdc-btn-stop" style="background:#ef4444;color:#fff;border:none;padding:9px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">
                    ⏹ Stop
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    const setStatus = (badgeText, badgeColor, logMsg) => {
        if (badgeText) {
            const b = document.getElementById('rdc-badge');
            b.textContent = badgeText;
            if (badgeColor) b.style.background = badgeColor;
        }
        if (logMsg) {
            document.getElementById('rdc-log').textContent = logMsg;
        }
        document.getElementById('rdc-pages-count').textContent = knownFiles.pages.size;
        document.getElementById('rdc-modals-count').textContent = knownFiles.modals.size;
    };

    // Listen to React Fiber Hook
    window.addEventListener('message', (e) => {
        if (!e.data) return;
        if (e.data.type === "RDC_REACT_STATUS") {
            const { isReact, isMUI, componentCount } = e.data.payload;
            document.getElementById('rdc-stack').innerHTML = `
                Engine: <b style="color:${isReact ? '#38bdf8' : '#f59e0b'}">${isReact ? 'React Fiber Detected' : 'Standard DOM'}</b><br>
                UI Styling: <b style="color:#e2e8f0">${isMUI ? 'MUI (Emotion CSSOM)' : 'CSS Standard'}</b> (${componentCount} comps)
            `;
        } else if (e.data.type === "RDC_ROUTE_CHANGED" && isRunning) {
            setTimeout(() => captureAndWriteToDisk("route_change"), 450);
        }
    });

    // Helper: Write text directly to a file inside a directory handle
    async function writeTextFile(dirHandle, filename, content) {
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
    }

    // Helper: Read existing project structure from disk so extension knows every file
    async function scanExistingDiskProject() {
        setStatus("READING", "#f59e0b", "Scanning existing files on disk...");
        knownFiles.pages.clear();
        knownFiles.modals.clear();
        knownFiles.cssRules.clear();

        // Check existing pages
        for await (const [name, handle] of pagesDirHandle.entries()) {
            if (handle.kind === 'file' && name.endsWith('.html')) {
                const file = await handle.getFile();
                knownFiles.pages.set(name, file.size);
            }
        }

        // Check existing modals
        for await (const [name, handle] of modalsDirHandle.entries()) {
            if (handle.kind === 'file' && name.endsWith('.html')) {
                const file = await handle.getFile();
                knownFiles.modals.set(name, file.size);
            }
        }

        // Check existing CSS bundle rules
        try {
            const cssHandle = await staticDirHandle.getFileHandle('mupra_bundle.css');
            const cssFile = await cssHandle.getFile();
            const cssText = await cssFile.text();
            cssText.split('\n').forEach(line => {
                if (line.trim()) knownFiles.cssRules.add(line.trim());
            });
        } catch (_) {}

        // Check if layout.html exists
        try {
            await rootDirHandle.getFileHandle('layout.html');
            knownFiles.hasLayout = true;
        } catch (_) {
            knownFiles.hasLayout = false;
        }

        setStatus("LOADED", "#3b82f6", `Loaded ${knownFiles.pages.size} pages & ${knownFiles.modals.size} modals.`);
    }

    // Initialize Folder Connection (Fresh or Continue)
    async function initWorkspace(isContinueMode) {
        try {
            if (!window.showDirectoryPicker) {
                alert("Your browser does not support File System Access API. Please use Chrome or Edge.");
                return;
            }

            rootDirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
            pagesDirHandle = await rootDirHandle.getDirectoryHandle("pages", { create: true });
            modalsDirHandle = await rootDirHandle.getDirectoryHandle("modals", { create: true });
            staticDirHandle = await rootDirHandle.getDirectoryHandle("static", { create: true });

            if (isContinueMode) {
                await scanExistingDiskProject();
            } else {
                knownFiles.pages.clear();
                knownFiles.modals.clear();
                knownFiles.cssRules.clear();
                knownFiles.hasLayout = false;
                // Create safe custom.css and app.js if not present
                try {
                    await staticDirHandle.getFileHandle("custom.css");
                } catch (_) {
                    await writeTextFile(staticDirHandle, "custom.css", "/* Custom CSS Overrides */\n");
                }
            }

            // Switch UI buttons to [Save Now] & [Stop]
            document.getElementById('rdc-init-controls').style.display = 'none';
            document.getElementById('rdc-active-controls').style.display = 'flex';

            startObserving();
        } catch (err) {
            setStatus("CANCELLED", "#64748b", "Folder selection cancelled.");
        }
    }

    function sanitizeName(str) {
        return (str || 'view')
            .trim()
            .replace(/[\/\\?%*:|"<>]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 65) || 'index';
    }

    // Harvest dynamic CSS-in-JS (Emotion / MUI) and sync directly to static/mupra_bundle.css
    async function syncCSSOMToDisk() {
        let newRulesAdded = 0;
        for (const sheet of Array.from(document.styleSheets)) {
            try {
                if (sheet.cssRules) {
                    for (const rule of Array.from(sheet.cssRules)) {
                        const txt = rule.cssText.trim();
                        if (txt && !knownFiles.cssRules.has(txt)) {
                            knownFiles.cssRules.add(txt);
                            newRulesAdded++;
                        }
                    }
                }
            } catch (_) {}
        }

        if (newRulesAdded > 0 && staticDirHandle) {
            const fullCss = Array.from(knownFiles.cssRules).join('\n');
            await writeTextFile(staticDirHandle, "mupra_bundle.css", fullCss);
        }
    }

    // Core Engine: Inspect React DOM & Write File-by-File to Disk
    async function captureAndWriteToDisk(trigger = "auto") {
        if (!rootDirHandle) return;
        panel.style.display = 'none';

        try {
            // 1. Save Layout Shell (Header + Sidebar) once
            if (!knownFiles.hasLayout) {
                const rootClone = document.querySelector('#root, #app')?.cloneNode(true);
                if (rootClone) {
                    const mainArea = rootClone.querySelector('main, .main-body, [class*="mainContent"]');
                    if (mainArea) {
                        mainArea.innerHTML = '<!-- {{PAGE_CONTENT_OUTLET}} -->';
                        const layoutDoc = `<!DOCTYPE html>\n<html lang="fa" dir="rtl">\n<head>\n<meta charset="UTF-8">\n<link rel="stylesheet" href="static/mupra_bundle.css">\n<link rel="stylesheet" href="static/custom.css">\n</head>\n<body>\n${rootClone.outerHTML}\n</body>\n</html>`;
                        await writeTextFile(rootDirHandle, "layout.html", layoutDoc);
                        knownFiles.hasLayout = true;
                    }
                }
            }

            // 2. Sync dynamic MUI CSS rules
            await syncCSSOMToDisk();

            const routeKey = sanitizeName(location.pathname || 'dashboard');

            // 3. Check for Open React Portals / MUI Modals / Drawers / Popovers
            const modalSelectors = '.MuiModal-root, .MuiDrawer-root, .MuiDialog-root, .MuiPopover-root, .MuiPopper-root, [role="dialog"], [role="presentation"], [role="listbox"]';
            const openModals = Array.from(document.querySelectorAll(modalSelectors)).filter(el => {
                const r = el.getBoundingClientRect();
                return r.width > 15 && r.height > 15 && el.innerText.trim().length > 0;
            });

            if (openModals.length > 0) {
                for (let i = 0; i < openModals.length; i++) {
                    const mod = openModals[i];
                    const compAttr = mod.querySelector('[data-react-component]')?.getAttribute('data-react-component') || '';
                    const titleText = mod.querySelector('h1, h2, h3, h4, [class*="title"], [class*="Header"]')?.innerText || '';
                    const filename = `${ sanitizeName(`${routeKey}_${compAttr || titleText || 'modal_' + i}`) }.html`;
                    const htmlContent = `<!-- REACT MODAL | ROUTE: ${location.pathname} | COMPONENT: ${compAttr} -->\n` + mod.outerHTML;

                    const sig = filename + "_" + htmlContent.length;
                    if (sig !== lastHash || trigger === "manual") {
                        lastHash = sig;
                        await writeTextFile(modalsDirHandle, filename, htmlContent);
                        knownFiles.modals.set(filename, htmlContent.length);
                        setStatus("SAVED", "#10b981", `Wrote modals/${filename}`);
                    }
                }
            } else {
                // 4. Save Main Page Component View
                const mainEl = document.querySelector('main, .main-body, [class*="mainContent"]') || document.querySelector('#root, #app') || document.body;
                const isSkeleton = mainEl.querySelector('.MuiSkeleton-root, [class*="skeleton"]');

                if (!isSkeleton || trigger === "manual") {
                    const compName = mainEl.getAttribute('data-react-component') || mainEl.querySelector('[data-react-component]')?.getAttribute('data-react-component') || '';
                    const pageTitle = document.querySelector('h1, h2, .dashboard-page-title .title')?.innerText || '';
                    const activeTab = document.querySelector('.Mui-selected, [aria-selected="true"]')?.innerText || '';

                    const filename = `${ sanitizeName(`${routeKey}_${compName}_${pageTitle}_${activeTab}`) }.html`;
                    const htmlContent = `<!-- REACT PAGE | URL: ${location.href} | COMPONENT: ${compName} -->\n` + mainEl.outerHTML;

                    const sig = filename + "_" + htmlContent.length;
                    if (sig !== lastHash || trigger === "manual") {
                        lastHash = sig;
                        await writeTextFile(pagesDirHandle, filename, htmlContent);
                        knownFiles.pages.set(filename, htmlContent.length);
                        setStatus("SAVED", "#10b981", `Wrote pages/${filename}`);
                    }
                }
            }
        } catch (err) {
            setStatus("ERROR", "#ef4444", err.message);
        } finally {
            panel.style.display = 'block';
        }
    }

    function startObserving() {
        isRunning = true;
        setStatus("REC", "#ef4444", "Watching React state changes...");
        captureAndWriteToDisk("initial");

        observer = new MutationObserver(() => {
            if (!isRunning) return;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => captureAndWriteToDisk("mutation"), 400);
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'aria-expanded', 'aria-hidden']
        });
    }

    // Wire Up Buttons
    document.getElementById('rdc-btn-fresh').onclick = () => initWorkspace(false);
    document.getElementById('rdc-btn-continue').onclick = () => initWorkspace(true);

    document.getElementById('rdc-btn-save').onclick = () => {
        lastHash = ""; // Force immediate overwrite of current file
        captureAndWriteToDisk("manual");
    };

    document.getElementById('rdc-btn-stop').onclick = () => {
        isRunning = false;
        if (observer) observer.disconnect();
        document.getElementById('rdc-active-controls').style.display = 'none';
        document.getElementById('rdc-init-controls').style.display = 'flex';
        setStatus("STOPPED", "#64748b", "Stopped. All files saved directly to folder.");
    };
})();
