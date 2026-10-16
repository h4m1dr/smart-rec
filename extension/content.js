(function() {
    if (window.__SMART_REC_CONTENT_ACTIVE__) return;
    window.__SMART_REC_CONTENT_ACTIVE__ = true;

    // Inject Main-World React Inspector
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('page_hook.js');
    (document.head || document.documentElement).appendChild(script);

    // Directory Handles for Direct Disk Access
    let rootDirHandle = null;
    let pagesDirHandle = null;
    let modalsDirHandle = null;
    let staticDirHandle = null;
    let iconsDirHandle = null;

    // Live Knowledge of Existing Project Files on Disk
    const diskState = {
        techStack: { framework: "Detecting...", uiLibrary: "Detecting..." },
        componentCount: 0,
        pages: new Map(),      // filename -> content signature
        modals: new Map(),     // filename -> content signature
        svgs: new Map(),       // hash -> filename
        cssRules: new Set(),   // unique CSSOM rule strings
        apiEndpoints: [],      // logged API schemas
        hasLayout: false,
        lastActionLog: "Choose Start Fresh or Continue Existing"
    };

    let isRecording = false;
    let observer = null;
    let debounceTimer = null;
    let lastCaptureSig = "";

    // Build Floating On-Page Control Panel (100% English UI)
    const panel = document.createElement('div');
    panel.id = "smart-rec-panel";
    panel.style.cssText = `
        position: fixed; bottom: 20px; left: 20px; width: 320px;
        background: #0f172a; color: #f8fafc; border: 1px solid #334155;
        border-radius: 10px; padding: 14px; z-index: 2147483647;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px; direction: ltr; text-align: left;
        box-shadow: 0 20px 40px rgba(0,0,0,0.85); user-select: none;
    `;
    panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b;padding-bottom:8px;margin-bottom:8px;">
            <strong style="color:#38bdf8;font-size:13px;">⚛️ SMART-REC v4.0</strong>
            <div style="display:flex;gap:6px;align-items:center;">
                <button id="sr-btn-reload" title="Reload Extension" style="background:#1e293b;color:#94a3b8;border:1px solid #334155;padding:2px 6px;border-radius:4px;cursor:pointer;font-size:10px;">🔄 Reload</button>
                <span id="sr-status" style="background:#334155;color:#cbd5e1;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:bold;">IDLE</span>
            </div>
        </div>

        <div id="sr-tech" style="background:#1e293b;padding:7px 9px;border-radius:6px;margin-bottom:8px;line-height:1.5;color:#94a3b8;font-size:11px;">
            Framework: <b style="color:#fff">Detecting...</b><br>
            UI Library: <b style="color:#fff">Detecting...</b>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:6px;margin-bottom:8px;text-align:center;font-size:11px;">
            <div style="background:#1e293b;padding:5px;border-radius:6px;">Pages<br><strong id="sr-pages" style="color:#38bdf8;font-size:14px;">0</strong></div>
            <div style="background:#1e293b;padding:5px;border-radius:6px;">Modals<br><strong id="sr-modals" style="color:#a855f7;font-size:14px;">0</strong></div>
            <div style="background:#1e293b;padding:5px;border-radius:6px;">APIs<br><strong id="sr-apis" style="color:#10b981;font-size:14px;">0</strong></div>
        </div>

        <div id="sr-last-item" style="background:#020617;color:#10b981;padding:6px 8px;border-radius:5px;font-size:10px;margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px solid #1e293b;">
            Choose Start Fresh or Continue Existing
        </div>

        <!-- STATE 1: Initial Mode Selection (Start Fresh / Continue Existing) -->
        <div id="sr-init-group" style="display:flex;flex-direction:column;gap:6px;">
            <button id="sr-btn-fresh" style="background:#10b981;color:#0f172a;border:none;padding:9px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">
                🚀 Start Fresh
            </button>
            <button id="sr-btn-continue" style="background:#3b82f6;color:#fff;border:none;padding:9px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">
                📂 Continue Existing
            </button>
        </div>

        <!-- STATE 2: Active Session Controls (Save / Stop) -->
        <div id="sr-active-group" style="display:none;grid-template-columns:1fr 1fr;gap:6px;">
            <button id="sr-btn-save" title="Immediately save/update current page or modal file on disk" style="background:#10b981;color:#0f172a;border:none;padding:9px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">
                💾 Save
            </button>
            <button id="sr-btn-stop" title="Stop recording and finalize session" style="background:#ef4444;color:#fff;border:none;padding:9px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">
                ⏹ Stop
            </button>
        </div>
    `;
    document.body.appendChild(panel);

    function updatePanelUI(statusText = null, statusColor = null, logMessage = null) {
        if (logMessage) diskState.lastActionLog = logMessage;

        document.getElementById('sr-tech').innerHTML = `
            Framework: <b style="color:#38bdf8">${diskState.techStack.framework}</b> (${diskState.componentCount} comps)<br>
            UI Library: <b style="color:#e2e8f0">${diskState.techStack.uiLibrary}</b>
        `;
        document.getElementById('sr-pages').textContent = diskState.pages.size;
        document.getElementById('sr-modals').textContent = diskState.modals.size;
        document.getElementById('sr-apis').textContent = diskState.apiEndpoints.length;
        document.getElementById('sr-last-item').textContent = diskState.lastActionLog;

        document.getElementById('sr-init-group').style.display = isRecording ? 'none' : 'flex';
        document.getElementById('sr-active-group').style.display = isRecording ? 'grid' : 'none';

        if (statusText) {
            const st = document.getElementById('sr-status');
            st.textContent = statusText;
            if (statusColor) st.style.background = statusColor;
        }
    }

    // Listen to messages from page_hook.js
    window.addEventListener('message', (event) => {
        if (!event.data || !event.data.type) return;
        if (event.data.type === "SR_TECH_UPDATE") {
            diskState.techStack = event.data.payload.techStack;
            diskState.componentCount = event.data.payload.componentCount || 0;
            updatePanelUI();
        } else if (event.data.type === "SR_API_LOG") {
            const entry = event.data.payload;
            const exists = diskState.apiEndpoints.some(a => a.method === entry.method && a.url === entry.url);
            if (!exists && diskState.apiEndpoints.length < 300) {
                diskState.apiEndpoints.push(entry);
                if (isRecording && rootDirHandle) {
                    writeTextFile(rootDirHandle, "api_schema_log.json", JSON.stringify(diskState.apiEndpoints, null, 2)).catch(() => {});
                }
                updatePanelUI();
            }
        } else if (event.data.type === "SR_ROUTE_CHANGE" && isRecording) {
            setTimeout(() => captureAndSyncToDisk("route_change"), 450);
        }
    });

    // Helper: Write a text file directly into a local DirectoryHandle
    async function writeTextFile(dirHandle, filename, content) {
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
    }

    // Read all existing files in the selected folder so extension has 100% awareness of previous work
    async function indexExistingProjectOnDisk() {
        updatePanelUI("SCANNING", "#f59e0b", "Reading existing project files from disk...");
        diskState.pages.clear();
        diskState.modals.clear();
        diskState.cssRules.clear();

        // 1. Read existing pages/*.html
        for await (const [name, handle] of pagesDirHandle.entries()) {
            if (handle.kind === 'file' && name.endsWith('.html')) {
                const f = await handle.getFile();
                diskState.pages.set(name, `${name}_${f.size}`);
            }
        }

        // 2. Read existing modals/*.html
        for await (const [name, handle] of modalsDirHandle.entries()) {
            if (handle.kind === 'file' && name.endsWith('.html')) {
                const f = await handle.getFile();
                diskState.modals.set(name, `${name}_${f.size}`);
            }
        }

        // 3. Read existing static/mupra_bundle.css rules
        try {
            const cssHandle = await staticDirHandle.getFileHandle("mupra_bundle.css");
            const cssText = await (await cssHandle.getFile()).text();
            cssText.split('\n').forEach(line => {
                if (line.trim()) diskState.cssRules.add(line.trim());
            });
        } catch (_) {}

        // 4. Read existing api_schema_log.json
        try {
            const apiHandle = await rootDirHandle.getFileHandle("api_schema_log.json");
            const apiText = await (await apiHandle.getFile()).text();
            diskState.apiEndpoints = JSON.parse(apiText) || [];
        } catch (_) {}

        // 5. Check if layout.html already exists
        try {
            await rootDirHandle.getFileHandle("layout.html");
            diskState.hasLayout = true;
        } catch (_) {
            diskState.hasLayout = false;
        }

        updatePanelUI("LOADED", "#3b82f6", `Loaded ${diskState.pages.size} pages & ${diskState.modals.size} modals from disk.`);
    }

    // Start Session (Fresh or Continue)
    async function startSession(isContinueMode) {
        try {
            rootDirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
            const templatesDir = await rootDirHandle.getDirectoryHandle("templates", { create: true });
            pagesDirHandle = await templatesDir.getDirectoryHandle("pages", { create: true });
            modalsDirHandle = await templatesDir.getDirectoryHandle("modals", { create: true });
            staticDirHandle = await rootDirHandle.getDirectoryHandle("static", { create: true });
            iconsDirHandle = await staticDirHandle.getDirectoryHandle("icons", { create: true });

            if (isContinueMode) {
                await indexExistingProjectOnDisk();
            } else {
                diskState.pages.clear();
                diskState.modals.clear();
                diskState.cssRules.clear();
                diskState.svgs.clear();
                diskState.hasLayout = false;

                // Create safe custom.css & app.js if not existing
                try { await staticDirHandle.getFileHandle("custom.css"); } catch (_) {
                    await writeTextFile(staticDirHandle, "custom.css", "/* Safe file for manual CSS overrides */\n");
                }
                try { await staticDirHandle.getFileHandle("app.js"); } catch (_) {
                    await writeTextFile(staticDirHandle, "app.js", "// Safe file for custom JS router logic\n");
                }
            }

            isRecording = true;
            updatePanelUI("REC", "#ef4444", "Recording active! Click around or press Save.");

            await captureAndSyncToDisk("initial");

            observer = new MutationObserver(() => {
                if (!isRecording) return;
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => captureAndSyncToDisk("mutation"), 400);
            });
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style', 'aria-expanded', 'aria-hidden']
            });
        } catch (err) {
            updatePanelUI("IDLE", "#334155", "Folder selection cancelled.");
        }
    }

    function cleanKey(str) {
        return (str || 'view')
            .trim()
            .replace(/[\/\\?%*:|"<>]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 70) || 'index';
    }

    // Extract active CSSOM rules (crucial for MUI/Emotion dynamic styles) and write to static/mupra_bundle.css
    async function syncCSSOMToDisk() {
        let added = 0;
        for (const sheet of Array.from(document.styleSheets)) {
            try {
                if (sheet.cssRules) {
                    for (const rule of Array.from(sheet.cssRules)) {
                        const txt = rule.cssText.trim();
                        if (txt && !diskState.cssRules.has(txt)) {
                            diskState.cssRules.add(txt);
                            added++;
                        }
                    }
                }
            } catch (e) {
                if (sheet.href && !diskState.cssRules.has(sheet.href)) {
                    diskState.cssRules.add(sheet.href);
                    try {
                        const res = await fetch(sheet.href);
                        const text = await res.text();
                        diskState.cssRules.add(`/* External: ${sheet.href} */\n` + text);
                        added++;
                    } catch (_) {}
                }
            }
        }
        if (added > 0 && staticDirHandle) {
            await writeTextFile(staticDirHandle, "mupra_bundle.css", Array.from(diskState.cssRules).join('\n'));
        }
    }

    // Core Capture & Direct File Writer
    async function captureAndSyncToDisk(triggerSource = "auto") {
        if (!rootDirHandle) return;
        panel.style.display = 'none';

        try {
            // 1. Save Base Layout Shell (Header + Sidebar) once
            if (!diskState.hasLayout) {
                const rootClone = document.querySelector('#root, #app')?.cloneNode(true);
                if (rootClone) {
                    const mainArea = rootClone.querySelector('main, .main-body, [class*="mainContent"]');
                    if (mainArea) {
                        mainArea.innerHTML = '<!-- {{DYNAMIC_PAGE_OUTLET}} -->';
                        const layoutHtml = `<!DOCTYPE html>\n<html lang="fa" dir="rtl">\n<head>\n<meta charset="UTF-8">\n<title>Cloned WebUI</title>\n<link rel="stylesheet" href="static/mupra_bundle.css">\n<link rel="stylesheet" href="static/custom.css">\n</head>\n<body>\n${rootClone.outerHTML}\n<script src="static/app.js"></script>\n</body>\n</html>`;
                        await writeTextFile(rootDirHandle, "layout.html", layoutHtml);
                        diskState.hasLayout = true;
                    }
                }
            }

            // 2. Sync New SVG Icons
            const svgs = Array.from(document.querySelectorAll('svg'));
            for (const svg of svgs) {
                const html = svg.outerHTML;
                const hash = html.length + "_" + html.slice(0, 35) + html.slice(-35);
                if (!diskState.svgs.has(hash) && iconsDirHandle) {
                    const hint = cleanKey(svg.getAttribute('data-testid') || svg.getAttribute('aria-label') || 'icon');
                    const svgFile = `${hint}_${diskState.svgs.size + 1}.svg`;
                    diskState.svgs.set(hash, svgFile);
                    await writeTextFile(iconsDirHandle, svgFile, html);
                }
            }

            // 3. Sync CSSOM (MUI Dynamic Styles)
            await syncCSSOMToDisk();

            // 4. Check for Open React Portals / Modals / Drawers / Popovers
            const modalSelectors = '.MuiModal-root, .MuiDrawer-root, .MuiDialog-root, .MuiPopover-root, .MuiPopper-root, [role="dialog"], [role="presentation"], [role="listbox"], .dropdown-menu.show';
            const openPopups = Array.from(document.querySelectorAll(modalSelectors)).filter(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 12 && rect.height > 12 && el.innerText.trim().length > 0;
            });

            const pathName = cleanKey(location.pathname || 'dashboard');

            if (openPopups.length > 0) {
                for (let idx = 0; idx < openPopups.length; idx++) {
                    const pop = openPopups[idx];
                    const reactComp = pop.querySelector('[data-react-component]')?.getAttribute('data-react-component') || '';
                    const heading = pop.querySelector('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="Header"]')?.innerText || '';
                    const roleAttr = pop.getAttribute('role') || 'modal';
                    const filename = `${cleanKey(`${pathName}_${reactComp \vert{}\vert{} roleAttr}_${heading || idx}`)}.html`;

                    const fileContent = `<!-- MODAL | PATH: ${location.pathname} | REACT_COMPONENT: ${reactComp} | UPDATED: ${new Date().toISOString()} -->\n` + pop.outerHTML;
                    const sig = `${filename}_${fileContent.length}`;

                    if (diskState.modals.get(filename) !== sig || triggerSource === "manual") {
                        diskState.modals.set(filename, sig);
                        await writeTextFile(modalsDirHandle, filename, fileContent);
                        updatePanelUI("SAVED", "#10b981", `Saved: modals/${filename}`);
                    }
                }
            } else {
                // 5. Save Main Page View (Skip if skeleton loader is active)
                const mainEl = document.querySelector('main, .main-body, [class*="mainContent"]') || document.querySelector('#root, #app') || document.body;
                const hasSkeleton = mainEl.querySelector('.MuiSkeleton-root, [class*="skeleton"]');

                if (!hasSkeleton || triggerSource === "manual") {
                    const reactComp = mainEl.getAttribute('data-react-component') || mainEl.querySelector('[data-react-component]')?.getAttribute('data-react-component') || '';
                    const viewTitle = document.querySelector('h1, h2, .dashboard-page-title .title')?.innerText || '';
                    const activeTab = document.querySelector('.Mui-selected, [aria-selected="true"], [class*="active"]')?.innerText || '';
                    const filename = `${cleanKey(`${pathName}_${reactComp}_${viewTitle}_${activeTab}`)}.html`;

                    const fileContent = `<!-- PAGE | URL: ${location.href} | REACT_COMPONENT: ${reactComp} | UPDATED: ${new Date().toISOString()} -->\n` + mainEl.outerHTML;
                    const sig = `${filename}_${fileContent.length}`;

                    if (diskState.pages.get(filename) !== sig || triggerSource === "manual") {
                        diskState.pages.set(filename, sig);
                        await writeTextFile(pagesDirHandle, filename, fileContent);
                        updatePanelUI("SAVED", "#10b981", `Saved: pages/${filename}`);
                    }
                }
            }
        } catch (err) {
            updatePanelUI("ERROR", "#ef4444", `Error: ${err.message}`);
        } finally {
            panel.style.display = 'block';
            updatePanelUI();
        }
    }

    function stopSession() {
        isRecording = false;
        if (observer) observer.disconnect();
        updatePanelUI("STOPPED", "#64748b", "Session stopped. All files synced on disk.");
    }

    // Wire Up Panel Buttons
    document.getElementById('sr-btn-reload').onclick = () => {
        chrome.runtime.sendMessage({ type: "SR_RELOAD_EXTENSION" });
        setTimeout(() => location.reload(), 250);
    };

    document.getElementById('sr-btn-fresh').onclick = () => startSession(false);
    document.getElementById('sr-btn-continue').onclick = () => startSession(true);

    document.getElementById('sr-btn-save').onclick = () => {
        lastCaptureSig = "";
        captureAndSyncToDisk("manual");
    };

    document.getElementById('sr-btn-stop').onclick = () => stopSession();

    // Listen to Toolbar Popup Commands (when clicking the extension icon in Chrome toolbar)
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg || !msg.action) return;

        if (msg.action === "GET_STATE") {
            sendResponse({
                isRecording,
                techStack: diskState.techStack,
                componentCount: diskState.componentCount,
                pagesCount: diskState.pages.size,
                modalsCount: diskState.modals.size,
                apisCount: diskState.apiEndpoints.length,
                lastLog: diskState.lastActionLog
            });
        } else if (msg.action === "START_FRESH") {
            startSession(false);
            sendResponse({ ok: true });
        } else if (msg.action === "CONTINUE_EXISTING") {
            startSession(true);
            sendResponse({ ok: true });
        } else if (msg.action === "SAVE_NOW") {
            captureAndSyncToDisk("manual").then(() => {
                sendResponse({
                    isRecording,
                    techStack: diskState.techStack,
                    componentCount: diskState.componentCount,
                    pagesCount: diskState.pages.size,
                    modalsCount: diskState.modals.size,
                    apisCount: diskState.apiEndpoints.length,
                    lastLog: diskState.lastActionLog
                });
            });
            return true;
        } else if (msg.action === "STOP") {
            stopSession();
            sendResponse({
                isRecording: false,
                techStack: diskState.techStack,
                componentCount: diskState.componentCount,
                pagesCount: diskState.pages.size,
                modalsCount: diskState.modals.size,
                apisCount: diskState.apiEndpoints.length,
                lastLog: diskState.lastActionLog
            });
        }
    });
})();
