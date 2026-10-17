(function() {
    if (window.__SR_CONTENT_V8__) return;
    window.__SR_CONTENT_V8__ = true;

    if (location.protocol === 'file:') return;

    // 1. Inject page_hook.js immediately at document_start to capture 100% of refresh Network traffic
    const hook = document.createElement('script');
    hook.src = chrome.runtime.getURL('page_hook.js');
    (document.head || document.documentElement).appendChild(hook);

    // 2. IndexedDB Helper to Persist Folder Handle across Page Refreshes (F5)!
    const DB_NAME = "SmartRecV8_DB";
    const STORE_NAME = "handles";

    function openHandleDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async function saveFolderHandleToIDB(key, dirHandle) {
        try {
            const db = await openHandleDB();
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).put(dirHandle, key);
        } catch (_) {}
    }

    async function loadFolderHandleFromIDB(key) {
        try {
            const db = await openHandleDB();
            return new Promise((resolve) => {
                const tx = db.transaction(STORE_NAME, "readonly");
                const req = tx.objectStore(STORE_NAME).get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch (_) { return null; }
    }

    let widget = null;
    let workspaceDir = null, siteDir = null, rawCloneDir = null, pagesDir = null, modalsDir = null, staticDir = null, screensDir = null, aiPacksDir = null;
    let isRunning = false, observer = null, debounceTimer = null, lastSig = "";
    let autoScreenshotEnabled = true;

    const state = {
        passport: null,
        pages: new Map(),
        modals: new Map(),
        cssRules: new Set(),
        networkLogs: [],
        logs: [],
        stepCounter: 2
    };

    // Strict Windows/Chrome Safe Filename Sanitizer (Fixes "Name is not allowed" error!)
    function safeFileName(str) {
        return (str || 'view')
            .trim()
            .replace(/[^a-zA-Z0-9_\u0600-\u06FF\-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 60) || 'item';
    }

    function addLog(msg, level = "INFO") {
        const time = new Date().toLocaleTimeString();
        state.logs.push(`[${time}] [${level}] ${msg}`);
        const c = document.getElementById('srv8-console');
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

    function updateCounters() {
        if (!widget) return;
        document.getElementById('srv8-p').textContent = state.pages.size;
        document.getElementById('srv8-m').textContent = state.modals.size;
        document.getElementById('srv8-n').textContent = state.networkLogs.length;
    }

    function renderPassportBox() {
        if (!widget || !state.passport) return;
        const p = state.passport;
        const t = p.technologies;
        const stack = [...t.frameworks, ...t.uiLibraries, ...t.cssEngines, ...t.jsUtilities].join(' • ') || 'Web App';
        document.getElementById('srv8-passport').innerHTML = `
            <div style="display:flex;justify-content:space-between;">
                <b style="color:#38bdf8;">🪪 ${p.domain}</b>
                <span style="color:#10b981;">${p.reactComponentsCount} React Comps</span>
            </div>
            <div style="color:#cbd5e1;margin-top:2px;">${stack}</div>
        `;
    }

    // Build Floating UI (Wait until document.body exists)
    function ensureBodyAndShowWidget() {
        if (!document.body) {
            window.addEventListener('DOMContentLoaded', () => showWidget(), { once: true });
        } else {
            showWidget();
        }
    }

    async function showWidget() {
        if (widget) {
            widget.style.display = 'block';
            window.postMessage({ type: "SR_V8_RUN_PASSPORT" }, "*");
            return;
        }

        widget = document.createElement('div');
        widget.id = "sr-v8-widget";
        widget.style.cssText = "position:fixed;bottom:14px;left:14px;width:360px;background:#0f172a;color:#f8fafc;border:1px solid #334155;border-radius:10px;padding:12px;z-index:2147483647;font-family:ui-monospace,Consolas,monospace;font-size:11px;direction:ltr;text-align:left;box-shadow:0 20px 50px rgba(0,0,0,0.9);user-select:none;";

        widget.innerHTML = `
            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b;padding-bottom:6px;margin-bottom:8px;">
                <strong style="color:#38bdf8;font-size:12px;">⚛️ SMART-REC v8.0 ARCHITECT</strong>
                <div style="display:flex;gap:5px;align-items:center;">
                    <button id="srv8-refresh" title="Smart Refresh: Reloads page & captures Network API calls from millisecond 0 without losing folder state!" style="background:#1e293b;color:#38bdf8;border:1px solid #334155;padding:2px 6px;border-radius:4px;cursor:pointer;font-size:10px;">🔄 Smart Refresh</button>
                    <span id="srv8-badge" style="background:#334155;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:bold;">READY</span>
                    <button id="srv8-hide" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:13px;">✕</button>
                </div>
            </div>

            <!-- Passport Box -->
            <div id="srv8-passport" style="background:#1e293b;padding:7px;border-radius:6px;margin-bottom:8px;font-size:10px;line-height:1.4;">
                Scanning site passport...
            </div>

            <!-- Stats Row -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:8px;text-align:center;">
                <div style="background:#1e293b;padding:5px;border-radius:5px;">Pages<br><b id="srv8-p" style="color:#38bdf8;font-size:13px;">0</b></div>
                <div style="background:#1e293b;padding:5px;border-radius:5px;">Modals<br><b id="srv8-m" style="color:#a855f7;font-size:13px;">0</b></div>
                <div style="background:#1e293b;padding:5px;border-radius:5px;">Net APIs<br><b id="srv8-n" style="color:#10b981;font-size:13px;">0</b></div>
            </div>

            <!-- Reconnect Banner (Shown automatically after page Refresh F5!) -->
            <div id="srv8-reconnect-bar" style="display:none;background:#1e3a8a;border:1px solid #3b82f6;padding:7px;border-radius:6px;margin-bottom:8px;text-align:center;">
                <div style="font-size:10px;color:#bfdbfe;margin-bottom:5px;">🔄 Page refreshed! Click below to resume your folder & keep all previous files:</div>
                <button id="srv8-btn-resume" style="width:100%;background:#38bdf8;color:#0f172a;border:none;padding:6px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:11px;">⚡ Resume Previous Folder Session</button>
            </div>

            <!-- Console Log -->
            <div id="srv8-console" style="height:68px;overflow-y:auto;background:#020617;border:1px solid #1e293b;padding:5px 7px;border-radius:5px;font-size:10px;margin-bottom:8px;line-height:1.4;"></div>

            <!-- Subfolder Picker (For Continue Mode) -->
            <div id="srv8-proj-picker" style="display:none;background:#1e293b;padding:8px;border-radius:6px;margin-bottom:8px;border:1px solid #38bdf8;">
                <div style="font-size:10px;color:#38bdf8;margin-bottom:4px;font-weight:bold;">Choose Project Folder:</div>
                <select id="srv8-proj-select" style="width:100%;background:#0f172a;color:#fff;border:1px solid #475569;padding:5px;border-radius:4px;margin-bottom:6px;font-size:11px;"></select>
                <button id="srv8-proj-confirm" style="width:100%;background:#10b981;color:#0f172a;border:none;padding:6px;border-radius:4px;cursor:pointer;font-weight:bold;">✅ Load Selected Folder</button>
            </div>

            <!-- VIEW 1: Initial Start / Continue -->
            <div id="srv8-init" style="display:flex;flex-direction:column;gap:5px;">
                <button id="srv8-btn-fresh" style="background:#10b981;color:#0f172a;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:11px;">
                    🚀 Start Fresh (New Workspace)
                </button>
                <button id="srv8-btn-cont" style="background:#3b82f6;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:11px;">
                    📂 Continue Existing (Load Previous Files)
                </button>
            </div>

            <!-- VIEW 2: Active Recording Controls -->
            <div id="srv8-active" style="display:none;flex-direction:column;gap:6px;">
                <div style="display:flex;justify-content:space-between;align-items:center;background:#1e293b;padding:4px 8px;border-radius:5px;font-size:10px;">
                    <label style="cursor:pointer;display:flex;align-items:center;gap:4px;">
                        <input type="checkbox" id="srv8-chk-autoshot" checked /> 📸 Auto-Screenshot Every State
                    </label>
                    <button id="srv8-btn-ai-toggle" style="background:#8b5cf6;color:#fff;border:none;padding:3px 7px;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;">💬 AI Chat</button>
                </div>

                <!-- Action Buttons Row 1: Save, Shot, Auto-Menus, Stop -->
                <div style="display:grid;grid-template-columns:1fr 1fr 1.2fr 0.8fr;gap:4px;">
                    <button id="srv8-btn-save" title="Save DOM + AI Spec" style="background:#10b981;color:#0f172a;border:none;padding:7px 4px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:10px;">💾 Save</button>
                    <button id="srv8-btn-shot" title="Take clean PNG Screenshot now" style="background:#38bdf8;color:#0f172a;border:none;padding:7px 4px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:10px;">📸 Shot</button>
                    <button id="srv8-btn-explore" title="Automatically open/close all React menus, dropdowns, tabs & modals on this page!" style="background:#f59e0b;color:#0f172a;border:none;padding:7px 4px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:10px;">🤖 Auto-Menus</button>
                    <button id="srv8-btn-stop" title="Stop Recording" style="background:#ef4444;color:#fff;border:none;padding:7px 4px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:10px;">⏹ Stop</button>
                </div>
            </div>

            <!-- Built-in AI Assistant & Token Drawer -->
            <div id="srv8-ai-drawer" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid #334155;">
                <div style="display:flex;gap:4px;margin-bottom:5px;">
                    <input type="password" id="srv8-api-key" placeholder="Gemini API Key (AIzaSy...)" style="flex:1;background:#020617;border:1px solid #334155;color:#fff;padding:5px;border-radius:4px;font-size:10px;" />
                    <button id="srv8-save-key" style="background:#334155;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:10px;">Save Key</button>
                </div>
                <div id="srv8-ai-reply" style="height:80px;overflow-y:auto;background:#020617;border:1px solid #1e293b;padding:6px;border-radius:4px;font-size:10px;color:#e2e8f0;margin-bottom:5px;white-space:pre-wrap;">Ask AI about this page or click "Send Current View to AI"...</div>
                <div style="display:flex;gap:4px;">
                    <input type="text" id="srv8-ai-input" placeholder="e.g. Build clean HTML/JS for this dashboard..." style="flex:1;background:#020617;border:1px solid #334155;color:#fff;padding:5px;border-radius:4px;font-size:10px;" />
                    <button id="srv8-ai-send" style="background:#8b5cf6;color:#fff;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:10px;">Send</button>
                </div>
            </div>
        `;
        document.body.appendChild(widget);

        // Load saved API key into drawer
        chrome.storage.local.get(['geminiApiKey'], (st) => {
            if (st.geminiApiKey) document.getElementById('srv8-api-key').value = st.geminiApiKey;
        });

        // Check if we have a saved Folder Handle in IndexedDB from before a page refresh!
        const savedHandle = await loadFolderHandleFromIDB("lastWorkspaceHandle");
        if (savedHandle) {
            document.getElementById('srv8-reconnect-bar').style.display = 'block';
            document.getElementById('srv8-btn-resume').onclick = async () => {
                try {
                    const perm = await savedHandle.requestPermission({ mode: "readwrite" });
                    if (perm === "granted") {
                        workspaceDir = savedHandle;
                        document.getElementById('srv8-reconnect-bar').style.display = 'none';
                        const defaultFolder = safeFileName(location.hostname);
                        await setupSiteFoldersAndStart(defaultFolder, true);
                    }
                } catch (e) {
                    addLog("Could not resume handle: " + e.message, "WARN");
                }
            };
        }

        // Wire UI Events
        document.getElementById('srv8-hide').onclick = () => { widget.style.display = 'none'; };
        document.getElementById('srv8-refresh').onclick = () => {
            chrome.storage.local.set({ autoResumeAfterRefresh: true }, () => location.reload());
        };
        document.getElementById('srv8-chk-autoshot').onchange = (e) => { autoScreenshotEnabled = e.target.checked; };
        document.getElementById('srv8-btn-fresh').onclick = () => openWorkspace(false);
        document.getElementById('srv8-btn-cont').onclick = () => openWorkspace(true);
        document.getElementById('srv8-btn-save').onclick = () => { lastSig = ""; captureFullState("manual", true); };
        document.getElementById('srv8-btn-shot').onclick = () => takeStandaloneScreenshot();
        document.getElementById('srv8-btn-explore').onclick = () => autoExploreMenusAndDropdowns();
        document.getElementById('srv8-btn-stop').onclick = () => stopRecording();

        document.getElementById('srv8-btn-ai-toggle').onclick = () => {
            const dr = document.getElementById('srv8-ai-drawer');
            dr.style.display = dr.style.display === 'none' ? 'block' : 'none';
        };
        document.getElementById('srv8-save-key').onclick = () => {
            const k = document.getElementById('srv8-api-key').value.trim();
            chrome.storage.local.set({ geminiApiKey: k });
            addLog("Gemini API token saved.");
        };
        document.getElementById('srv8-ai-send').onclick = () => askBuiltInAI();

        window.postMessage({ type: "SR_V8_RUN_PASSPORT" }, "*");
    }

    // Check whitelist on load
    chrome.storage.local.get(['whitelistedHosts'], (res) => {
        if ((res.whitelistedHosts || []).includes(location.hostname)) {
            ensureBodyAndShowWidget();
        }
    });

    window.addEventListener('message', async (e) => {
        if (!e.data) return;
        if (e.data.type === "SR_V8_PASSPORT") {
            state.passport = e.data.payload;
            renderPassportBox();
            const st = await chrome.storage.local.get(['sitesRegistry']);
            const reg = st.sitesRegistry || {};
            reg[location.hostname] = state.passport;
            await chrome.storage.local.set({ sitesRegistry: reg });
        } else if (e.data.type === "SR_V8_NETWORK_LOG") {
            const entry = e.data.payload;
            if (!state.networkLogs.some(n => n.method === entry.method && n.url === entry.url)) {
                state.networkLogs.push(entry);
                updateCounters();
                if (isRunning && siteDir) {
                    writeText(siteDir, "01_NETWORK_API_LOG.json", JSON.stringify(state.networkLogs, null, 2)).catch(() => {});
                }
            }
        } else if (e.data.type === "SR_V8_ROUTE_CHANGE" && isRunning) {
            addLog(`Route -> ${e.data.path}`);
            setTimeout(() => captureFullState("route", autoScreenshotEnabled), 650);
        }
    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === "ANALYZE_AND_SHOW_WIDGET") {
            ensureBodyAndShowWidget();
            setTimeout(() => sendResponse({ ok: true, passport: state.passport }), 300);
            return true;
        }
    });

    // Safe File System Writers
    async function writeText(dir, rawName, text) {
        if (!dir) return;
        const extMatch = rawName.match(/\.(html|json|md|css|txt|js)$/i);
        const ext = extMatch ? extMatch[0] : "";
        const base = ext ? rawName.slice(0, -ext.length) : rawName;
        const cleanName = safeFileName(base) + ext;

        const fh = await dir.getFileHandle(cleanName, { create: true });
        const w = await fh.createWritable();
        await w.write(text);
        await w.close();
    }

    async function writePng(dir, rawName, dataUrl) {
        if (!dir || !dataUrl) return;
        const cleanName = safeFileName(rawName.replace(/\.png$/i, '')) + ".png";
        const base64 = dataUrl.split(',')[1];
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const fh = await dir.getFileHandle(cleanName, { create: true });
        const w = await fh.createWritable();
        await w.write(bytes);
        await w.close();
    }

    // Recursive Scanner: Finds ALL existing .html & .css files anywhere inside the selected folder!
    async function scanExistingFilesRecursively(dirHandle, depth = 0) {
        if (depth > 3) return;
        for await (const [name, handle] of dirHandle.entries()) {
            if (handle.kind === 'file') {
                if (name.endsWith('.html') && name !== 'index.html' && name !== 'layout.html') {
                    const txt = await (await handle.getFile()).text();
                    if (name.toLowerCase().includes('modal') || name.toLowerCase().includes('popup') || name.toLowerCase().includes('drawer')) {
                        state.modals.set(name, { filename: name, route: location.pathname, html: txt });
                    } else {
                        state.pages.set(name, { filename: name, route: location.pathname, html: txt });
                    }
                } else if (name.endsWith('.css') && name !== 'custom.css') {
                    const cssTxt = await (await handle.getFile()).text();
                    cssTxt.split('\n').forEach(l => { if (l.trim()) state.cssRules.add(l.trim()); });
                }
            } else if (handle.kind === 'directory' && name !== 'screenshots' && name !== 'ai_Prompt_Packs') {
                await scanExistingFilesRecursively(handle, depth + 1);
            }
        }
    }

    async function openWorkspace(isContinueMode) {
        try {
            workspaceDir = await window.showDirectoryPicker({ mode: "readwrite" });
            await saveFolderHandleToIDB("lastWorkspaceHandle", workspaceDir);
            document.getElementById('srv8-reconnect-bar').style.display = 'none';

            // Check if user selected a specific project folder directly OR a parent workspace
            const subfolders = [];
            let hasDirectHtmlOrRawClone = false;
            for await (const [name, handle] of workspaceDir.entries()) {
                if (handle.kind === 'directory') {
                    subfolders.push(name);
                    if (name === 'raw_clone' || name === 'pages' || name === 'templates') hasDirectHtmlOrRawClone = true;
                }
            }

            const defaultSiteFolder = safeFileName(location.hostname);

            if (isContinueMode && !hasDirectHtmlOrRawClone && subfolders.length > 0) {
                const picker = document.getElementById('srv8-proj-picker');
                const sel = document.getElementById('srv8-proj-select');
                sel.innerHTML = `<option value="__ROOT__">[Use Selected Folder Directly]</option>`;
                subfolders.forEach(f => {
                    const o = document.createElement('option');
                    o.value = f;
                    o.textContent = f;
                    if (f === defaultSiteFolder) o.selected = true;
                    sel.appendChild(o);
                });
                picker.style.display = 'block';
                document.getElementById('srv8-proj-confirm').onclick = async () => {
                    picker.style.display = 'none';
                    await setupSiteFoldersAndStart(sel.value === "__ROOT__" ? null : sel.value, true);
                };
            } else {
                await setupSiteFoldersAndStart(hasDirectHtmlOrRawClone ? null : defaultSiteFolder, isContinueMode);
            }
        } catch (err) {
            addLog("Folder selection cancelled.", "WARN");
        }
    }

    async function setupSiteFoldersAndStart(subfolderName, isContinueMode) {
        try {
            siteDir = subfolderName ? await workspaceDir.getDirectoryHandle(safeFileName(subfolderName), { create: true }) : workspaceDir;
            rawCloneDir = await siteDir.getDirectoryHandle("raw_clone", { create: true });
            pagesDir = await rawCloneDir.getDirectoryHandle("pages", { create: true });
            modalsDir = await rawCloneDir.getDirectoryHandle("modals", { create: true });
            staticDir = await rawCloneDir.getDirectoryHandle("static", { create: true });
            screensDir = await siteDir.getDirectoryHandle("screenshots", { create: true });
            aiPacksDir = await siteDir.getDirectoryHandle("ai_Prompt_Packs", { create: true });

            if (isContinueMode) {
                addLog("Scanning existing files in folder...");
                state.pages.clear(); state.modals.clear(); state.cssRules.clear();
                await scanExistingFilesRecursively(siteDir, 0);
                state.stepCounter = state.pages.size + state.modals.size + 2;
                updateCounters();
                addLog(`Loaded ${state.pages.size} previous pages & ${state.modals.size} modals!`);
            } else {
                state.pages.clear(); state.modals.clear(); state.cssRules.clear();
                await writeText(staticDir, "custom.css", "/* Custom CSS Overrides */\n");
            }

            // Save Site Passport (Notice: No '&' in filename so Chrome NEVER throws Name is not allowed!)
            if (state.passport) {
                await writeText(siteDir, "00_SITE_PASSPORT.json", JSON.stringify(state.passport, null, 2));
                const passMd = buildPassportMarkdown(state.passport);
                await writeText(siteDir, "00_SITE_PASSPORT.md", passMd);
                await writeText(aiPacksDir, "01_Global_Theme_And_Layout_Spec.md", passMd);
            }

            if (state.networkLogs.length > 0) {
                await writeText(siteDir, "01_NETWORK_API_LOG.json", JSON.stringify(state.networkLogs, null, 2));
            }

            isRunning = true;
            document.getElementById('srv8-badge').textContent = "REC";
            document.getElementById('srv8-badge').style.background = "#ef4444";
            document.getElementById('srv8-init').style.display = 'none';
            document.getElementById('srv8-active').style.display = 'flex';

            await captureFullState("initial", autoScreenshotEnabled);

            observer = new MutationObserver(() => {
                if (!isRunning) return;
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => captureFullState("mutation", autoScreenshotEnabled), 600);
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-expanded', 'aria-hidden'] });
        } catch (err) {
            addLog(`Setup Error: ${err.message}`, "ERR");
        }
    }

    // Take Clean Screenshot (Hides widget before snapping so widget is never in the photo!)
    async function captureCleanPNG(filePrefix) {
        if (!screensDir) return null;
        if (widget) widget.style.display = 'none';
        await new Promise(r => setTimeout(r, 120)); // Wait for repaint
        const shotRes = await chrome.runtime.sendMessage({ type: "SR_CAPTURE_SCREENSHOT" });
        if (widget) widget.style.display = 'block';

        if (shotRes && shotRes.ok) {
            const fname = `${safeFileName(filePrefix)}.png`;
            await writePng(screensDir, fname, shotRes.dataUrl);
            return fname;
        }
        return null;
    }

    async function takeStandaloneScreenshot() {
        const name = `manual_${location.pathname}_${Date.now()}`;
        const saved = await captureCleanPNG(name);
        if (saved) addLog(`Screenshot saved: screenshots/${saved}`);
    }

    // 🤖 Auto-Menus Explorer: Automatically clicks through tabs, dropdowns, drawers & popups on current page!
    async function autoExploreMenusAndDropdowns() {
        if (!isRunning || !siteDir) {
            addLog("Start or Continue a folder session first!", "WARN");
            return;
        }
        addLog("🤖 Auto-Exploring interactive menus, tabs & dropdowns...");
        const sleep = ms => new Promise(r => setTimeout(r, ms));

        const selectors = [
            '[role="tab"]',
            '[class*="SwitchButton"]',
            '[aria-haspopup="true"]',
            '[aria-expanded="false"]',
            'button[class*="IconButton"]',
            '[class*="select"]',
            '[class*=" filter"]'
        ];

        const candidates = Array.from(document.querySelectorAll(selectors.join(', '))).filter(el => {
            if (el.closest('#sr-v8-widget') || el.closest('aside') || el.closest('nav')) return false;
            const tag = el.tagName.toLowerCase();
            if (tag === 'a' && el.getAttribute('href') && !el.getAttribute('href').startsWith('#')) return false;
            const r = el.getBoundingClientRect();
            return r.width > 10 && r.height > 10;
        }).slice(0, 18); // Safe limit per page

        addLog(`Found ${candidates.length} interactive triggers on this view.`);

        for (let i = 0; i < candidates.length; i++) {
            if (!isRunning) break;
            const el = candidates[i];
            try {
                el.click();
                await sleep(750);
                await captureFullState(`auto_explore_${i + 1}`, true);

                // If a modal/popover opened, press Escape or click backdrop to close it before next trigger
                const backdrop = document.querySelector('.MuiBackdrop-root, [class*="Backdrop"]');
                if (backdrop) {
                    backdrop.click();
                    await sleep(400);
                } else {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    await sleep(300);
                }
            } catch (_) {}
        }
        addLog("✅ Auto-Explore finished for this page!");
    }

    // 💬 Built-in AI Chat & Code Generator
    async function askBuiltInAI() {
        const key = document.getElementById('srv8-api-key').value.trim();
        const promptInput = document.getElementById('srv8-ai-input').value.trim();
        const replyBox = document.getElementById('srv8-ai-reply');

        if (!key) {
            replyBox.textContent = "⚠️ Please paste your Gemini API Key above and click Save Key first.";
            return;
        }

        replyBox.textContent = "⏳ Sending current page structure & design tokens to Gemini AI...";
        const micro = await requestMicroScan();
        const mainEl = document.querySelector('main, .main-body, [class*="mainContent"]') || document.body;

        const fullPrompt = `You are a Senior React & WebUI Architect.
Site: ${location.href}
Passport & Design Tokens: ${JSON.stringify(state.passport?.designSystem || {})}
Micro-Elements on Current View: ${JSON.stringify(micro)}
Current View HTML Snippet:
${mainEl.outerHTML.slice(0, 14000)}

User Request: ${promptInput || "Analyze this page and write clean, modular HTML/CSS/JS code for it with 100% visual accuracy."}`;

        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] })
            });
            const data = await res.json();
            const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(data.error || "No response");
            replyBox.textContent = answer;

            if (aiPacksDir) {
                const fname = `AI_Response_${safeFileName(location.pathname)}_${Date.now()}.md`;
                await writeText(aiPacksDir, fname, answer);
                addLog(`AI response saved to ai_Prompt_Packs/${fname}`);
            }
        } catch (err) {
            replyBox.textContent = "Error calling Gemini API: " + err.message;
        }
    }

    function requestMicroScan(selector = null) {
        return new Promise((resolve) => {
            const reqId = "m_" + Date.now();
            const listener = (e) => {
                if (e.data && e.data.type === "SR_V8_MICRO_RESULT" && e.data.reqId === reqId) {
                    window.removeEventListener('message', listener);
                    resolve(e.data.payload);
                }
            };
            window.addEventListener('message', listener);
            window.postMessage({ type: "SR_V8_SCAN_MICRO", selector, reqId }, "*");
            setTimeout(() => { window.removeEventListener('message', listener); resolve({}); }, 1000);
        });
    }

    function buildPassportMarkdown(p) {
        return `# Site Passport & Design System: ${p.domain}
- **Title:** ${p.title}
- **Direction:** ${p.direction} | **Viewport:** ${p.viewport}
- **Stack:** ${JSON.stringify(p.technologies)}
- **Fonts:** ${p.designSystem.fonts.join(', ')}
- **Background Colors:** ${p.designSystem.backgroundColors.join(', ')}
- **Text Colors:** ${p.designSystem.textColors.join(', ')}
- **Border Radii:** ${p.designSystem.borderRadii.join(', ')}

## Navigation Tree (${p.navigationTree.length} links)
\`\`\`json
${JSON.stringify(p.navigationTree, null, 2)}
\`\`\`

## React Fiber Components (${p.reactComponentsCount})
${p.reactComponentNames.join(', ')}
`;
    }

    function buildModularSpecMarkdown(type, name, route, pngName, micro, html) {
        return `# AI Modular Specification: ${name}
- **Type:** ${type} | **Route:** ${route}
- **Screenshot File:** ../screenshots/${pngName || 'none'}
- **Raw HTML File:** ../raw_clone/${type === 'MODAL' ? 'modals' : 'pages'}/${name}.html

## 1. Micro-Elements Breakdown (Buttons, Checkboxes, Inputs, Tabs, Tables)
\`\`\`json
${JSON.stringify(micro, null, 2)}
\`\`\`

## 2. Clean HTML Structure
\`\`\`html
${html.slice(0, 15000)}
\`\`\`
`;
    }

    function sanitizeDomClone(el) {
        const clone = el.cloneNode(true);
        const w = clone.querySelector('#sr-v8-widget');
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

    async function captureFullState(trigger = "auto", takeShot = true) {
        if (!siteDir) return;
        try {
            await harvestCSS();
            const routeKey = safeFileName(location.pathname || 'dashboard');
            const mSel = '.MuiModal-root, .MuiDrawer-root, .MuiDialog-root, .MuiPopover-root, .MuiPopper-root, [role="dialog"], [role="presentation"], [role="listbox"]';
            const openModals = Array.from(document.querySelectorAll(mSel)).filter(el => {
                if (el.closest('#sr-v8-widget')) return false;
                const r = el.getBoundingClientRect();
                return r.width > 15 && r.height > 15 && el.innerText.trim().length > 0;
            });

            if (openModals.length > 0) {
                for (let i = 0; i < openModals.length; i++) {
                    const cleanMod = sanitizeDomClone(openModals[i]);
                    const comp = cleanMod.querySelector('[data-react-component]')?.getAttribute('data-react-component') || 'Modal';
                    const title = cleanMod.querySelector('h1, h2, h3, h4, [class*="title"]')?.innerText || `popup_${i}`;
                    const baseName = safeFileName(`${routeKey}_${comp}_${title}`);
                    const html = cleanMod.outerHTML;
                    const sig = baseName + "_" + html.length;

                    if (sig !== lastSig || trigger === "manual") {
                        lastSig = sig;
                        await writeText(modalsDir, `${baseName}.html`, html);
                        state.modals.set(`${baseName}.html`, { filename: `${baseName}.html`, route: location.pathname, html });

                        const pngName = takeShot ? await captureCleanPNG(`modal_${baseName}`) : null;
                        const micro = await requestMicroScan(mSel);
                        const specMd = buildModularSpecMarkdown("MODAL", baseName, location.pathname, pngName, micro, html);
                        const num = String(state.stepCounter++).padStart(2, '0');
                        await writeText(aiPacksDir, `${num}_Modal_${baseName}_Spec.md`, specMd);

                        addLog(`Saved Modal: ${baseName}`);
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
                    const baseName = safeFileName(`${routeKey}_${comp}_${title}_${tab}`);
                    const html = cleanMain.innerHTML;
                    const sig = baseName + "_" + html.length;

                    if (sig !== lastSig || trigger === "manual") {
                        lastSig = sig;
                        await writeText(pagesDir, `${baseName}.html`, html);
                        state.pages.set(`${baseName}.html`, { filename: `${baseName}.html`, route: location.pathname, html });
                        await updateOfflineIndex(html);

                        const pngName = takeShot ? await captureCleanPNG(`page_${baseName}`) : null;
                        const micro = await requestMicroScan();
                        const specMd = buildModularSpecMarkdown("PAGE", baseName, location.pathname, pngName, micro, html);
                        const num = String(state.stepCounter++).padStart(2, '0');
                        await writeText(aiPacksDir, `${num}_Page_${baseName}_Spec.md`, specMd);

                        addLog(`Saved Page: ${baseName}`);
                    }
                }
            }
            updateCounters();
        } catch (err) {
            addLog(`Error: ${err.message}`, "ERR");
        }
    }

    function stopRecording() {
        isRunning = false;
        if (observer) observer.disconnect();
        document.getElementById('srv8-badge').textContent = "STOPPED";
        document.getElementById('srv8-badge').style.background = "#64748b";
        document.getElementById('srv8-active').style.display = 'none';
        document.getElementById('srv8-init').style.display = 'flex';
        addLog("Session stopped. All files, PNGs, Network logs & AI Specs saved.");
    }
})();
