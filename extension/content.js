(function() {
    if (window.__SR_CONTENT_V7__) return;
    window.__SR_CONTENT_V7__ = true;

    if (location.protocol === 'file:') return;

    const hook = document.createElement('script');
    hook.src = chrome.runtime.getURL('page_hook.js');
    (document.head || document.documentElement).appendChild(hook);

    let widget = null;
    let workspaceDir = null;   // Root workspace folder holding all sites
    let siteDir = null;        // Current site folder (e.g. mupra.ir/)
    let rawCloneDir = null;    // raw_clone/
    let pagesDir = null;       // raw_clone/pages/
    let modalsDir = null;      // raw_clone/modals/
    let staticDir = null;      // raw_clone/static/
    let screensDir = null;     // screenshots/
    let aiPacksDir = null;     // ai_Prompt_Packs/

    let isRunning = false, observer = null, debounceTimer = null, lastSig = "";

    const state = {
        passport: null,
        existingProjectsInWorkspace: [],
        pages: new Map(),
        modals: new Map(),
        cssRules: new Set(),
        logs: [],
        stepCounter: 2
    };

    function addLog(msg, level = "INFO") {
        const time = new Date().toLocaleTimeString();
        state.logs.push(`[${time}] [${level}] ${msg}`);
        const c = document.getElementById('srv7-console');
        if (c) {
            const color = level === "ERR" ? "#f87171" : (level === "WARN" ? "#fbbf24" : "#34d399");
            const d = document.createElement('div');
            d.style.color = color;
            d.style.marginBottom = "2px";
            d.textContent = `• ${msg}`;
            c.appendChild(d);
            c.scrollTop = c.scrollHeight;
        }
    }

    function showWidget() {
        if (widget) {
            widget.style.display = 'block';
            window.postMessage({ type: "SR_V7_RUN_PASSPORT" }, "*");
            return;
        }

        widget = document.createElement('div');
        widget.id = "sr-v7-widget";
        widget.style.cssText = "position:fixed;bottom:16px;left:16px;width:345px;background:#0f172a;color:#f8fafc;border:1px solid #334155;border-radius:10px;padding:12px;z-index:2147483647;font-family:ui-monospace,Consolas,monospace;font-size:11px;direction:ltr;text-align:left;box-shadow:0 20px 50px rgba(0,0,0,0.85);user-select:none;";
        widget.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b;padding-bottom:6px;margin-bottom:8px;">
                <strong style="color:#38bdf8;font-size:12px;">⚛️ SMART-REC v7.0 ARCHITECT</strong>
                <div style="display:flex;gap:5px;align-items:center;">
                    <span id="srv7-badge" style="background:#334155;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:bold;">READY</span>
                    <button id="srv7-hide" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:13px;">✕</button>
                </div>
            </div>

            <!-- Site Passport Summary (Wappalyzer Style) -->
            <div id="srv7-passport" style="background:#1e293b;padding:8px;border-radius:6px;margin-bottom:8px;line-height:1.5;font-size:10px;color:#cbd5e1;">
                Building Site Passport...
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:8px;text-align:center;">
                <div style="background:#1e293b;padding:5px;border-radius:5px;">Pages<br><b id="srv7-p" style="color:#38bdf8;font-size:13px;">0</b></div>
                <div style="background:#1e293b;padding:5px;border-radius:5px;">Modals<br><b id="srv7-m" style="color:#a855f7;font-size:13px;">0</b></div>
                <div style="background:#1e293b;padding:5px;border-radius:5px;">AI Specs<br><b id="srv7-s" style="color:#10b981;font-size:13px;">0</b></div>
            </div>

            <div id="srv7-console" style="height:70px;overflow-y:auto;background:#020617;border:1px solid #1e293b;padding:5px 7px;border-radius:5px;font-size:10px;margin-bottom:8px;line-height:1.4;"></div>

            <!-- Project Selector Modal (Shown when clicking Continue Existing) -->
            <div id="srv7-proj-picker" style="display:none;background:#1e293b;padding:8px;border-radius:6px;margin-bottom:8px;border:1px solid #38bdf8;">
                <div style="font-size:10px;color:#38bdf8;margin-bottom:4px;font-weight:bold;">Select Project Folder in Workspace:</div>
                <select id="srv7-proj-select" style="width:100%;background:#0f172a;color:#fff;border:1px solid #475569;padding:5px;border-radius:4px;margin-bottom:6px;font-size:11px;"></select>
                <button id="srv7-proj-confirm" style="width:100%;background:#10b981;color:#0f172a;border:none;padding:6px;border-radius:4px;cursor:pointer;font-weight:bold;">✅ Load Selected Project</button>
            </div>

            <!-- VIEW 1: Start Fresh / Continue Existing -->
            <div id="srv7-init" style="display:flex;flex-direction:column;gap:6px;">
                <button id="srv7-btn-fresh" style="background:#10b981;color:#0f172a;border:none;padding:9px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:11px;">
                    🚀 Start Fresh (Select Workspace Folder)
                </button>
                <button id="srv7-btn-cont" style="background:#3b82f6;color:#fff;border:none;padding:9px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:11px;">
                    📂 Continue Existing (Browse Projects)
                </button>
            </div>

            <!-- VIEW 2: Save (HTML + Screenshot + AI Spec) / Stop -->
            <div id="srv7-active" style="display:none;grid-template-columns:1fr 1fr;gap:6px;">
                <button id="srv7-btn-save" style="background:#10b981;color:#0f172a;border:none;padding:9px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">
                    💾 Save + 📸 Snap
                </button>
                <button id="srv7-btn-stop" style="background:#ef4444;color:#fff;border:none;padding:9px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">
                    ⏹ Stop
                </button>
            </div>
        `;
        document.body.appendChild(widget);

        document.getElementById('srv7-hide').onclick = () => { widget.style.display = 'none'; };
        document.getElementById('srv7-btn-fresh').onclick = () => openWorkspace(false);
        document.getElementById('srv7-btn-cont').onclick = () => openWorkspace(true);
        document.getElementById('srv7-btn-save').onclick = () => { lastSig = ""; captureFullState("manual"); };
        document.getElementById('srv7-btn-stop').onclick = () => stopRecording();

        window.postMessage({ type: "SR_V7_RUN_PASSPORT" }, "*");
    }

    function renderPassportBox() {
        if (!widget || !state.passport) return;
        const p = state.passport;
        const t = p.technologies;
        const stackList = [...t.frameworks, ...t.uiLibraries, ...t.cssEngines, ...t.jsUtilities].join(' • ') || 'Standard HTML/CSS';
        document.getElementById('srv7-passport').innerHTML = `
            <div style="color:#38bdf8;font-weight:bold;margin-bottom:2px;">🪪 Site Passport: ${p.domain}</div>
            <div><b>Tech Stack:</b> <span style="color:#10b981">${stackList}</span></div>
            <div><b>React Comps:</b> ${p.reactComponentsCount} | <b>Fonts:</b> ${p.designSystem.fonts.slice(0, 2).join(', ') || 'Default'}</div>
            <div><b>Colors:</b> ${p.designSystem.backgroundColors.length} BG / ${p.designSystem.textColors.length} Text | <b>Routes:</b> ${p.navigationTree.length}</div>
        `;
    }

    function updateCounters() {
        if (!widget) return;
        document.getElementById('srv7-p').textContent = state.pages.size;
        document.getElementById('srv7-m').textContent = state.modals.size;
        document.getElementById('srv7-s').textContent = state.pages.size + state.modals.size + (state.passport ? 1 : 0);
    }

    chrome.storage.local.get(['whitelistedHosts'], (res) => {
        if ((res.whitelistedHosts || []).includes(location.hostname)) showWidget();
    });

    window.addEventListener('message', async (e) => {
        if (!e.data) return;
        if (e.data.type === "SR_V7_PASSPORT") {
            state.passport = e.data.payload;
            renderPassportBox();
            // Save passport to Chrome storage registry automatically
            const store = await chrome.storage.local.get(['sitesRegistry']);
            const reg = store.sitesRegistry || {};
            reg[location.hostname] = state.passport;
            await chrome.storage.local.set({ sitesRegistry: reg });
        } else if (e.data.type === "SR_V7_ROUTE_CHANGE" && isRunning) {
            addLog(`Route changed -> ${e.data.path}`);
            setTimeout(() => captureFullState("route"), 650);
        }
    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === "ANALYZE_AND_SHOW_WIDGET") {
            showWidget();
            setTimeout(() => sendResponse({ ok: true, passport: state.passport }), 300);
            return true;
        } else if (msg.action === "HIDE_WIDGET") {
            if (widget) widget.style.display = 'none';
            sendResponse({ ok: true });
        }
    });

    // File System Helpers
    async function writeText(dir, name, text) {
        const fh = await dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(text);
        await w.close();
    }

    async function writeBase64Png(dir, name, dataUrl) {
        const base64 = dataUrl.split(',')[1];
        const binStr = atob(base64);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
        const fh = await dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(bytes);
        await w.close();
    }

    // Request micro-elements breakdown from page_hook.js
    function requestMicroElementsScan(selector = null) {
        return new Promise((resolve) => {
            const reqId = "req_" + Date.now() + "_" + Math.random();
            const handler = (e) => {
                if (e.data && e.data.type === "SR_V7_ELEMENTS_RESULT" && e.data.reqId === reqId) {
                    window.removeEventListener('message', handler);
                    resolve(e.data.payload);
                }
            };
            window.addEventListener('message', handler);
            window.postMessage({ type: "SR_V7_SCAN_ELEMENTS", selector, reqId }, "*");
            setTimeout(() => { window.removeEventListener('message', handler); resolve({}); }, 1200);
        });
    }

    // Open Workspace & Either Create Site Folder or Let User Pick from Existing Projects
    async function openWorkspace(isContinueMode) {
        try {
            addLog("Select your main Workspace folder in the dialog...");
            workspaceDir = await window.showDirectoryPicker({ mode: "readwrite" });

            // Scan existing site folders in this workspace
            const subfolders = [];
            for await (const [name, handle] of workspaceDir.entries()) {
                if (handle.kind === 'directory') subfolders.push(name);
            }

            const defaultFolderName = location.hostname.replace(/[^a-zA-Z0-9.-]/g, '_');

            if (isContinueMode && subfolders.length > 0) {
                const pickerDiv = document.getElementById('srv7-proj-picker');
                const selectEl = document.getElementById('srv7-proj-select');
                selectEl.innerHTML = "";

                if (!subfolders.includes(defaultFolderName)) subfolders.unshift(defaultFolderName);
                subfolders.forEach(folder => {
                    const opt = document.createElement('option');
                    opt.value = folder;
                    opt.textContent = folder === defaultFolderName ? `${folder} (Current Site)` : folder;
                    selectEl.appendChild(opt);
                });

                pickerDiv.style.display = 'block';
                document.getElementById('srv7-proj-confirm').onclick = async () => {
                    pickerDiv.style.display = 'none';
                    await setupSiteFoldersAndStart(selectEl.value, true);
                };
            } else {
                await setupSiteFoldersAndStart(defaultFolderName, isContinueMode);
            }
        } catch (err) {
            addLog("Folder selection cancelled.", "WARN");
        }
    }

    async function setupSiteFoldersAndStart(folderName, isContinueMode) {
        siteDir = await workspaceDir.getDirectoryHandle(folderName, { create: true });
        rawCloneDir = await siteDir.getDirectoryHandle("raw_clone", { create: true });
        pagesDir = await rawCloneDir.getDirectoryHandle("pages", { create: true });
        modalsDir = await rawCloneDir.getDirectoryHandle("modals", { create: true });
        staticDir = await rawCloneDir.getDirectoryHandle("static", { create: true });
        screensDir = await siteDir.getDirectoryHandle("screenshots", { create: true });
        aiPacksDir = await siteDir.getDirectoryHandle("ai_Prompt_Packs", { create: true });

        // 1. Update Master sites_registry.json in Root Workspace
        const store = await chrome.storage.local.get(['sitesRegistry']);
        const reg = store.sitesRegistry || {};
        if (state.passport) reg[location.hostname] = state.passport;
        await writeText(workspaceDir, "sites_registry.json", JSON.stringify(reg, null, 2));

        // 2. Write 00_SITE_PASSPORT.json & 00_SITE_PASSPORT.md inside the site's folder
        if (state.passport) {
            await writeText(siteDir, "00_SITE_PASSPORT.json", JSON.stringify(state.passport, null, 2));
            const passportMd = buildPassportMarkdown(state.passport);
            await writeText(siteDir, "00_SITE_PASSPORT.md", passportMd);
            await writeText(aiPacksDir, "01_Global_Theme_&_Layout_Spec.md", passportMd);
            addLog(`Saved 00_SITE_PASSPORT.json & .md in ${folderName}/`);
        }

        // 3. If Continue Mode, load existing pages/modals so we never overwrite or lose count
        if (isContinueMode) {
            state.pages.clear(); state.modals.clear(); state.cssRules.clear();
            for await (const [n, h] of pagesDir.entries()) {
                if (h.kind === 'file' && n.endsWith('.html')) {
                    const txt = await (await h.getFile()).text();
                    state.pages.set(n, { filename: n, route: location.pathname, html: txt });
                }
            }
            for await (const [n, h] of modalsDir.entries()) {
                if (h.kind === 'file' && n.endsWith('.html')) {
                    const txt = await (await h.getFile()).text();
                    state.modals.set(n, { filename: n, route: location.pathname, html: txt });
                }
            }
            try {
                const cssTxt = await (await (await staticDir.getFileHandle("mupra_bundle.css")).getFile()).text();
                cssTxt.split('\n').forEach(l => { if (l.trim()) state.cssRules.add(l.trim()); });
            } catch (_) {}
            state.stepCounter = state.pages.size + state.modals.size + 2;
            addLog(`Loaded ${state.pages.size} existing pages & ${state.modals.size} modals.`);
        } else {
            await writeText(staticDir, "custom.css", "/* Custom CSS Overrides */\n");
        }

        isRunning = true;
        document.getElementById('srv7-badge').textContent = "REC";
        document.getElementById('srv7-badge').style.background = "#ef4444";
        document.getElementById('srv7-init').style.display = 'none';
        document.getElementById('srv7-active').style.display = 'grid';

        await captureFullState("initial");

        observer = new MutationObserver(() => {
            if (!isRunning) return;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => captureFullState("mutation"), 550);
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-expanded', 'aria-hidden'] });
    }

    function buildPassportMarkdown(p) {
        return `# 🪪 Site Passport & Global Design Specification: \`${p.domain}\`
- **Page Title:** ${p.title}
- **Direction & Layout:** \`${p.direction}\` | **Viewport:** \`${p.viewport}\`
- **Frameworks:** ${p.technologies.frameworks.join(', ') || 'SPA'}
- **UI & CSS System:** ${[...p.technologies.uiLibraries, ...p.technologies.cssEngines].join(', ') || 'CSS'}
- **JS Libraries:** ${p.technologies.jsUtilities.join(', ') || 'None'}
- **Analytics / CDN / PWA:** ${p.technologies.analyticsAndCDN.join(', ')} (PWA: ${p.technologies.pwa})

## 🎨 Extracted Design Tokens (Fonts, Colors, Radii)
- **Fonts Used:** \`${p.designSystem.fonts.join('`, `')}\`
- **Background Palette:** \`${p.designSystem.backgroundColors.join('`, `')}\`
- **Text Color Palette:** \`${p.designSystem.textColors.join('`, `')}\`
- **Border Radii:** \`${p.designSystem.borderRadii.join('`, `')}\`

## 🧭 Sidebar & Navigation Routes (${p.navigationTree.length} links)
\`\`\`json
${JSON.stringify(p.navigationTree, null, 2)}
\`\`\`

## 🧩 React Fiber Components (${p.reactComponentsCount} detected)
\`${p.reactComponentNames.join('`, `')}\`
`;
    }

    function buildViewAIMarkdown(type, name, route, screenshotName, microDetails, cleanHtml) {
        return `# 🧩 AI Modular Reconstruction Spec: \`${name}\`
- **View Type:** ${type}
- **Route / URL:** \`${route}\`
- **Visual Reference Screenshot:** \`../screenshots/${screenshotName}\`
- **Raw HTML Reference:** \`../raw_clone/${type === 'MODAL' ? 'modals' : 'pages'}/${name}.html\`

---

## 1. Micro-Element Inventory (Every Button, Checkbox, Input, Tab & Card)

### 🔘 Buttons & Action Triggers (${microDetails.buttons?.length || 0})
\`\`\`json
${JSON.stringify(microDetails.buttons || [], null, 2)}
\`\`\`

### ☑️ Checkboxes, Switches & Radio Toggles (${microDetails.checkboxesAndSwitches?.length || 0})
\`\`\`json
${JSON.stringify(microDetails.checkboxesAndSwitches || [], null, 2)}
\`\`\`

### 🔽 Dropdowns, Selects & Text Inputs (${microDetails.inputsAndDropdowns?.length || 0})
\`\`\`json
${JSON.stringify(microDetails.inputsAndDropdowns || [], null, 2)}
\`\`\`

### 🗂️ Tabs & View Switchers (${microDetails.tabs?.length || 0})
\`\`\`json
${JSON.stringify(microDetails.tabs || [], null, 2)}
\`\`\`

### 📊 Cards, Widgets, Tables & Charts
- **Cards/Boxes (${microDetails.cardsAndWidgets?.length || 0}):**
\`\`\`json
${JSON.stringify(microDetails.cardsAndWidgets || [], null, 2)}
\`\`\`
- **Tables (${microDetails.tables?.length || 0}):**
\`\`\`json
${JSON.stringify(microDetails.tables || [], null, 2)}
\`\`\`
- **Charts/Canvas (${microDetails.chartsAndCanvas?.length || 0}):**
\`\`\`json
${JSON.stringify(microDetails.chartsAndCanvas || [], null, 2)}
\`\`\`

---

## 2. Clean DOM Structure (For Exact UI Replication)
\`\`\`html
${cleanHtml.slice(0, 12000)}
\`\`\`
`;
    }

    function cleanFileName(s) {
        return (s || 'view').trim().replace(/[\/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'index';
    }

    function sanitizeDomClone(el) {
        const clone = el.cloneNode(true);
        const w = clone.querySelector('#sr-v7-widget');
        if (w) w.remove();

        clone.querySelectorAll('img').forEach(img => {
            const raw = img.getAttribute('src');
            if (raw && !raw.startsWith('data:')) {
                try { img.src = new URL(raw, location.origin).href; } catch (_) {}
            }
        });

        clone.querySelectorAll('a[href]').forEach(a => {
            const raw = a.getAttribute('href');
            if (raw && raw.startsWith('/')) {
                a.setAttribute('data-spa-route', raw);
                a.setAttribute('href', `#${raw}`);
            }
        });
        return clone;
    }

    async function harvestCSS() {
        let added = 0;
        for (const sh of Array.from(document.styleSheets)) {
            try {
                if (sh.cssRules) {
                    for (const r of Array.from(sh.cssRules)) {
                        const t = r.cssText.trim();
                        if (t && !state.cssRules.has(t)) { state.cssRules.add(t); added++; }
                    }
                }
            } catch (_) {}
        }
        if (added > 0 && staticDir) {
            await writeText(staticDir, "mupra_bundle.css", Array.from(state.cssRules).join('\n'));
        }
    }

    async function updateOfflineIndex(latestMainHtml) {
        const rootEl = document.querySelector('#root, #app') || document.body;
        const cleanRoot = sanitizeDomClone(rootEl);
        const mainArea = cleanRoot.querySelector('main, .main-body, [class*="mainContent"]');
        if (mainArea) {
            mainArea.setAttribute('id', 'sr-dynamic-outlet');
            mainArea.innerHTML = latestMainHtml;
        }

        const pMap = {};
        for (const [k, v] of state.pages.entries()) pMap[k] = { route: v.route, html: v.html };

        const doc = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<title>Cloned WebUI - ${location.hostname}</title>
<link rel="stylesheet" href="static/mupra_bundle.css">
<link rel="stylesheet" href="static/custom.css">
</head>
<body>
${cleanRoot.outerHTML}
<script>
  const PAGES = ${JSON.stringify(pMap)};
  const outlet = document.getElementById('sr-dynamic-outlet') || document.querySelector('main, .main-body');
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) {
      e.preventDefault();
      const r = a.getAttribute('data-spa-route') || a.getAttribute('href')?.replace('#', '');
      const key = Object.keys(PAGES).find(k => PAGES[k].route === r);
      if (key && outlet) outlet.innerHTML = PAGES[key].html;
    }
  });
</script>
</body>
</html>`;
        await writeText(rawCloneDir, "index.html", doc);
    }

    // Core Capture: Saves HTML + Takes Screenshot PNG + Writes Detailed AI Spec Markdown
    async function captureFullState(trigger = "auto") {
        if (!siteDir) return;
        if (widget) widget.style.display = 'none';

        try {
            await harvestCSS();
            const routeKey = cleanFileName(location.pathname || 'dashboard');
            const mSel = '.MuiModal-root, .MuiDrawer-root, .MuiDialog-root, .MuiPopover-root, .MuiPopper-root, [role="dialog"], [role="presentation"], [role="listbox"]';
            const openModals = Array.from(document.querySelectorAll(mSel)).filter(el => {
                const r = el.getBoundingClientRect();
                return r.width > 15 && r.height > 15 && el.innerText.trim().length > 0;
            });

            if (openModals.length > 0) {
                for (let i = 0; i < openModals.length; i++) {
                    const modEl = openModals[i];
                    const cleanMod = sanitizeDomClone(modEl);
                    const comp = cleanMod.querySelector('[data-react-component]')?.getAttribute('data-react-component') || 'Modal';
                    const title = cleanMod.querySelector('h1, h2, h3, h4, [class*="title"]')?.innerText || `popup_${i}`;
                    const baseName = cleanFileName(`${routeKey}_${comp}_${title}`);
                    const html = cleanMod.outerHTML;
                    const sig = baseName + "_" + html.length;

                    if (sig !== lastSig || trigger === "manual") {
                        lastSig = sig;
                        // 1. Save Raw HTML
                        await writeText(modalsDir, `${baseName}.html`, html);
                        state.modals.set(`${baseName}.html`, { filename: `${baseName}.html`, route: location.pathname, html });

                        // 2. Capture PNG Screenshot
                        const shotRes = await chrome.runtime.sendMessage({ type: "SR_CAPTURE_SCREENSHOT" });
                        const pngName = `modal_${baseName}.png`;
                        if (shotRes && shotRes.ok) await writeBase64Png(screensDir, pngName, shotRes.dataUrl);

                        // 3. Scan Micro-Elements & Save AI Prompt Spec
                        const micro = await requestMicroElementsScan(mSel);
                        const specMd = buildViewAIMarkdown("MODAL", baseName, location.pathname, pngName, micro, html);
                        const num = String(state.stepCounter++).padStart(2, '0');
                        await writeText(aiPacksDir, `${num}_Modal_${baseName}_Spec.md`, specMd);

                        addLog(`Saved Modal + PNG + AI Spec: ${baseName}`);
                    }
                }
            } else {
                const mainOrig = document.querySelector('main, .main-body, [class*="mainContent"]') || document.querySelector('#root, #app') || document.body;
                const skel = mainOrig.querySelector('.MuiSkeleton-root, [class*="skeleton"]');

                if (!skel || trigger === "manual") {
                    const cleanMain = sanitizeDomClone(mainOrig);
                    const comp = cleanMain.getAttribute('data-react-component') || cleanMain.querySelector('[data-react-component]')?.getAttribute('data-react-component') || 'Page';
                    const title = document.querySelector('h1, h2, .dashboard-page-title .title')?.innerText || '';
                    const tab = document.querySelector('.Mui-selected, [aria-selected="true"]')?.innerText || '';
                    const baseName = cleanFileName(`${routeKey}_${comp}_${title}_${tab}`);
                    const html = cleanMain.innerHTML;
                    const sig = baseName + "_" + html.length;

                    if (sig !== lastSig || trigger === "manual") {
                        lastSig = sig;
                        // 1. Save Raw Page HTML & Update Offline index.html
                        await writeText(pagesDir, `${baseName}.html`, html);
                        state.pages.set(`${baseName}.html`, { filename: `${baseName}.html`, route: location.pathname, html });
                        await updateOfflineIndex(html);

                        // 2. Capture PNG Screenshot
                        const shotRes = await chrome.runtime.sendMessage({ type: "SR_CAPTURE_SCREENSHOT" });
                        const pngName = `page_${baseName}.png`;
                        if (shotRes && shotRes.ok) await writeBase64Png(screensDir, pngName, shotRes.dataUrl);

                        // 3. Scan Micro-Elements & Save AI Prompt Spec
                        const micro = await requestMicroElementsScan();
                        const specMd = buildViewAIMarkdown("PAGE", baseName, location.pathname, pngName, micro, html);
                        const num = String(state.stepCounter++).padStart(2, '0');
                        await writeText(aiPacksDir, `${num}_Page_${baseName}_Spec.md`, specMd);

                        addLog(`Saved Page + PNG + AI Spec: ${baseName}`);
                    }
                }
            }
            updateCounters();
        } catch (err) {
            addLog(`Error: ${err.message}`, "ERR");
        } finally {
            if (widget) widget.style.display = 'block';
        }
    }

    function stopRecording() {
        isRunning = false;
        if (observer) observer.disconnect();
        document.getElementById('srv7-badge').textContent = "STOPPED";
        document.getElementById('srv7-badge').style.background = "#64748b";
        document.getElementById('srv7-active').style.display = 'none';
        document.getElementById('srv7-init').style.display = 'flex';
        addLog("Stopped! Check '00_SITE_PASSPORT.md', 'screenshots/', and 'ai_Prompt_Packs/' in your folder.");
    }
})();
