(function() {
    if (window.__SR_CONTENT_V6__) return;
    window.__SR_CONTENT_V6__ = true;

    // Do not run on local file:/// pages
    if (location.protocol === 'file:') return;

    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('page_hook.js');
    (document.head || document.documentElement).appendChild(s);

    let widget = null;
    let rootDir = null, pagesDir = null, modalsDir = null, staticDir = null;
    let isRunning = false, observer = null, timer = null, lastHash = "";

    const state = {
        engine: "Detecting...",
        uiLib: "Detecting...",
        compCount: 0,
        componentNames: [],
        cssRulesCount: 0,
        emotionTags: 0,
        internalLinksCount: 0,
        brokenImagesCount: 0,
        lastLog: "Site analyzed. Ready to start.",
        pages: new Map(),      // filename -> { route, comp, title, html, size }
        modals: new Map(),     // filename -> { route, comp, title, html, size }
        cssRules: new Set(),
        apiCalls: [],
        logs: []
    };

    function logEvent(msg, type = "INFO") {
        const t = new Date().toLocaleTimeString();
        state.lastLog = msg;
        state.logs.push(`[${t}] [${type}] ${msg}`);
        if (state.logs.length > 100) state.logs.shift();

        const box = document.getElementById('srw-console');
        if (box) {
            const color = type === "ERR" ? "#f87171" : (type === "WARN" ? "#fbbf24" : "#34d399");
            const line = document.createElement('div');
            line.style.color = color;
            line.style.marginBottom = "2px";
            line.textContent = `• [${type}] ${msg}`;
            box.appendChild(line);
            box.scrollTop = box.scrollHeight;
        }
        syncUI();
    }

    function buildWidget() {
        if (widget) {
            widget.style.display = 'block';
            window.postMessage({ type: "SR_V6_TRIGGER_AUDIT" }, "*");
            return;
        }

        widget = document.createElement('div');
        widget.id = "sr-v6-widget";
        widget.style.cssText = "position:fixed;bottom:18px;left:18px;width:330px;background:#0f172a;color:#f8fafc;border:1px solid #334155;border-radius:10px;padding:12px;z-index:2147483647;font-family:ui-monospace,Consolas,monospace;font-size:11px;direction:ltr;text-align:left;box-shadow:0 15px 40px rgba(0,0,0,0.85);user-select:none;";
        widget.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b;padding-bottom:6px;margin-bottom:8px;">
                <strong style="color:#38bdf8;font-size:12px;">⚛️ SMART-REC v6.0</strong>
                <div style="display:flex;gap:5px;align-items:center;">
                    <button id="srw-audit-btn" title="Re-analyze site structure" style="background:#1e293b;color:#38bdf8;border:1px solid #334155;padding:2px 6px;border-radius:4px;cursor:pointer;font-size:10px;">🔍 Audit</button>
                    <span id="srw-badge" style="background:#334155;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:bold;">READY</span>
                    <button id="srw-close" title="Hide Widget" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:12px;">✕</button>
                </div>
            </div>

            <!-- Pre-Flight Site Audit Box -->
            <div id="srw-stack" style="background:#1e293b;padding:7px;border-radius:6px;margin-bottom:8px;line-height:1.5;color:#cbd5e1;">
                Running pre-flight site audit...
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:8px;text-align:center;">
                <div style="background:#1e293b;padding:5px;border-radius:5px;">Pages<br><b id="srw-p" style="color:#38bdf8;font-size:13px;">0</b></div>
                <div style="background:#1e293b;padding:5px;border-radius:5px;">Modals<br><b id="srw-m" style="color:#a855f7;font-size:13px;">0</b></div>
                <div style="background:#1e293b;padding:5px;border-radius:5px;">APIs<br><b id="srw-a" style="color:#10b981;font-size:13px;">0</b></div>
            </div>

            <!-- Live Diagnostic & Error Console -->
            <div style="font-size:10px;color:#94a3b8;margin-bottom:3px;">Site Diagnostic & Error Log:</div>
            <div id="srw-console" style="height:75px;overflow-y:auto;background:#020617;border:1px solid #1e293b;padding:5px 7px;border-radius:5px;font-size:10px;margin-bottom:8px;line-height:1.4;"></div>

            <!-- VIEW 1: Start Fresh / Continue Existing -->
            <div id="srw-init" style="display:flex;flex-direction:column;gap:5px;">
                <button id="srw-fresh" style="background:#10b981;color:#0f172a;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:11px;">🚀 Start Fresh</button>
                <button id="srw-cont" style="background:#3b82f6;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:11px;">📂 Continue Existing</button>
            </div>

            <!-- VIEW 2: Save / Stop / AI Bundle -->
            <div id="srw-active" style="display:none;flex-direction:column;gap:5px;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                    <button id="srw-save" style="background:#10b981;color:#0f172a;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:11px;">💾 Save</button>
                    <button id="srw-stop" style="background:#ef4444;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:11px;">⏹ Stop</button>
                </div>
                <button id="srw-ai-btn" style="background:#8b5cf6;color:#fff;border:none;padding:7px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:10px;">
                    📄 Generate Single-File AI Bundle (For Chat / API)
                </button>
            </div>
        `;
        document.body.appendChild(widget);

        document.getElementById('srw-close').onclick = () => { widget.style.display = 'none'; };
        document.getElementById('srw-audit-btn').onclick = () => {
            logEvent("Re-scanning site architecture...", "INFO");
            window.postMessage({ type: "SR_V6_TRIGGER_AUDIT" }, "*");
        };
        document.getElementById('srw-fresh').onclick = () => startSession(false);
        document.getElementById('srw-cont').onclick = () => startSession(true);
        document.getElementById('srw-save').onclick = () => { lastHash = ""; snapToDisk("manual"); };
        document.getElementById('srw-stop').onclick = () => stopSession();
        document.getElementById('srw-ai-btn').onclick = () => buildAIMasterBundle(true);

        logEvent(`Enabled on ${location.hostname}. Running pre-flight audit...`, "INFO");
        window.postMessage({ type: "SR_V6_TRIGGER_AUDIT" }, "*");
    }

    function syncUI() {
        if (!widget) return;
        document.getElementById('srw-badge').textContent = isRunning ? "REC" : "READY";
        document.getElementById('srw-badge').style.background = isRunning ? "#ef4444" : "#334155";
        document.getElementById('srw-stack').innerHTML = `
            Engine: <b style="color:#38bdf8">${state.engine}</b> (${state.compCount} comps)<br>
            UI Lib: <b style="color:#fff">${state.uiLib}</b> | Rules: <b>${state.cssRulesCount}</b><br>
            Menu Links: <b>${state.internalLinksCount}</b> | Emotion Tags: <b>${state.emotionTags}</b>
        `;
        document.getElementById('srw-p').textContent = state.pages.size;
        document.getElementById('srw-m').textContent = state.modals.size;
        document.getElementById('srw-a').textContent = state.apiCalls.length;
        document.getElementById('srw-init').style.display = isRunning ? "none" : "flex";
        document.getElementById('srw-active').style.display = isRunning ? "flex" : "none";
    }

    // Only show widget automatically if current domain is in whitelistedHosts
    chrome.storage.local.get(['whitelistedHosts'], (res) => {
        const list = res.whitelistedHosts || [];
        if (list.includes(location.hostname)) {
            buildWidget();
        }
    });

    window.addEventListener('message', (e) => {
        if (!e.data) return;
        if (e.data.type === "SR_V6_STATUS") {
            const p = e.data.payload;
            Object.assign(state, p);
            syncUI();
            if (p.errors && p.errors.length) {
                p.errors.forEach(err => logEvent(err, "WARN"));
            }
        } else if (e.data.type === "SR_V6_ROUTE" && isRunning) {
            logEvent(`Route changed -> ${e.data.path}`, "INFO");
            setTimeout(() => snapToDisk("route"), 450);
        } else if (e.data.type === "SR_V6_API") {
            const entry = e.data.payload;
            if (!state.apiCalls.some(a => a.url === entry.url && a.method === entry.method)) {
                state.apiCalls.push(entry);
                syncUI();
            }
        } else if (e.data.type === "SR_V6_ERROR") {
            logEvent(`Site Error: ${e.data.message}`, "ERR");
        }
    });

    async function writeFile(dir, name, text) {
        const fh = await dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(text);
        await w.close();
    }

    // Sanitize cloned HTML: Fix broken relative images & prevent file:///C:/panel navigation errors!
    function prepareCleanDOM(el) {
        const clone = el.cloneNode(true);
        const w = clone.querySelector('#sr-v6-widget');
        if (w) w.remove();

        // 1. Convert relative image src="/..." to full absolute URLs
        clone.querySelectorAll('img').forEach(img => {
            const raw = img.getAttribute('src');
            if (raw && !raw.startsWith('data:')) {
                try { img.src = new URL(raw, location.origin).href; } catch (_) {}
            }
        });

        // 2. Convert relative links href="/panel/..." to hash links so offline click won't break!
        clone.querySelectorAll('a[href]').forEach(a => {
            const raw = a.getAttribute('href');
            if (raw && raw.startsWith('/')) {
                a.setAttribute('data-spa-route', raw);
                a.setAttribute('href', `#${raw}`);
            }
        });

        return clone;
    }

    async function loadExistingProject() {
        logEvent("Reading existing files from disk...", "INFO");
        state.pages.clear(); state.modals.clear(); state.cssRules.clear();

        for await (const [n, h] of pagesDir.entries()) {
            if (h.kind === 'file' && n.endsWith('.html')) {
                const txt = await (await h.getFile()).text();
                const routeMatch = txt.match(/ROUTE:\s*([^\s|]+)/);
                state.pages.set(n, { filename: n, route: routeMatch ? routeMatch[1] : '/loaded', html: txt, size: txt.length });
            }
        }
        for await (const [n, h] of modalsDir.entries()) {
            if (h.kind === 'file' && n.endsWith('.html')) {
                const txt = await (await h.getFile()).text();
                state.modals.set(n, { filename: n, route: location.pathname, html: txt, size: txt.length });
            }
        }
        try {
            const cf = await (await staticDir.getFileHandle('mupra_bundle.css')).getFile();
            (await cf.text()).split('\n').forEach(l => { if (l.trim()) state.cssRules.add(l.trim()); });
        } catch (_) {}

        logEvent(`Loaded ${state.pages.size} pages & ${state.modals.size} modals from folder.`, "INFO");
    }

    async function startSession(continueMode) {
        try {
            rootDir = await window.showDirectoryPicker({ mode: "readwrite" });
            pagesDir = await rootDir.getDirectoryHandle("pages", { create: true });
            modalsDir = await rootDir.getDirectoryHandle("modals", { create: true });
            staticDir = await rootDir.getDirectoryHandle("static", { create: true });

            if (continueMode) {
                await loadExistingProject();
            } else {
                state.pages.clear(); state.modals.clear(); state.cssRules.clear();
                try { await staticDir.getFileHandle("custom.css"); } catch (_) {
                    await writeFile(staticDir, "custom.css", "/* Custom CSS Overrides */\n");
                }
                logEvent("Started fresh project folder.", "INFO");
            }

            isRunning = true;
            syncUI();
            await snapToDisk("initial");

            observer = new MutationObserver(() => {
                if (!isRunning) return;
                clearTimeout(timer);
                timer = setTimeout(() => snapToDisk("mutation"), 450);
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-expanded', 'aria-hidden'] });
        } catch (e) {
            logEvent("Folder selection cancelled.", "WARN");
        }
    }

    function clean(s) {
        return (s || 'view').trim().replace(/[\/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_').replace(/^_+|_+$/g, '').slice(0, 65) || 'index';
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
            } catch (_) {
                if (sh.href && !state.cssRules.has(`/* ${sh.href} */`)) {
                    state.cssRules.add(`/* ${sh.href} */`);
                    try {
                        const res = await fetch(sh.href);
                        state.cssRules.add(await res.text());
                        added++;
                    } catch (err) {
                        logEvent(`Failed external CSS fetch: ${sh.href}`, "WARN");
                    }
                }
            }
        }
        if (added > 0 && staticDir) {
            await writeFile(staticDir, "mupra_bundle.css", Array.from(state.cssRules).join('\n'));
        }
    }

    // Build an interactive index.html with an embedded Offline Router so pages & sidebar links work without errors!
    async function rebuildInteractiveLayout(latestMainHtml) {
        const rootEl = document.querySelector('#root, #app') || document.body;
        const cleanRoot = prepareCleanDOM(rootEl);
        const mainArea = cleanRoot.querySelector('main, .main-body, [class*="mainContent"]');

        if (mainArea) {
            mainArea.setAttribute('id', 'sr-dynamic-outlet');
            mainArea.innerHTML = latestMainHtml; // Never leave blank white screen!
        }

        const pagesMap = {};
        for (const [k, v] of state.pages.entries()) {
            pagesMap[k] = { route: v.route, html: v.html };
        }

        const modalsMap = {};
        for (const [k, v] of state.modals.entries()) {
            modalsMap[k] = { route: v.route, html: v.html };
        }

        const fullDoc = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cloned React SPA (Offline Interactive)</title>
<link rel="stylesheet" href="static/mupra_bundle.css">
<link rel="stylesheet" href="static/custom.css">
<style>
  #sr-offline-bar { position:fixed; bottom:12px; left:12px; background:#0f172a; color:#f8fafc; padding:8px 12px; border-radius:8px; font-family:monospace; font-size:11px; z-index:2147483640; border:1px solid #334155; direction:ltr; display:flex; gap:8px; align-items:center; box-shadow:0 10px 25px rgba(0,0,0,0.6); }
  #sr-offline-bar select { background:#1e293b; color:#38bdf8; border:1px solid #475569; padding:4px 6px; border-radius:4px; font-size:11px; }
</style>
</head>
<body>
${cleanRoot.outerHTML}
<div id="sr-modal-host"></div>

<div id="sr-offline-bar">
  <span>⚡ View:</span>
  <select id="sr-page-select"></select>
  <span>🪟 Modal:</span>
  <select id="sr-modal-select"><option value="">-- None --</option></select>
</div>

<script>
  const PAGES = ${JSON.stringify(pagesMap)};
  const MODALS = ${JSON.stringify(modalsMap)};
  const outlet = document.getElementById('sr-dynamic-outlet') || document.querySelector('main, .main-body');
  const modalHost = document.getElementById('sr-modal-host');
  const pSelect = document.getElementById('sr-page-select');
  const mSelect = document.getElementById('sr-modal-select');

  Object.keys(PAGES).forEach(k => {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = k + " (" + PAGES[k].route + ")";
    pSelect.appendChild(o);
  });

  Object.keys(MODALS).forEach(k => {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = k;
    mSelect.appendChild(o);
  });

  pSelect.onchange = (e) => {
    if (PAGES[e.target.value] && outlet) outlet.innerHTML = PAGES[e.target.value].html;
  };

  mSelect.onchange = (e) => {
    modalHost.innerHTML = e.target.value ? MODALS[e.target.value].html : "";
  };

  // Intercept sidebar navigation clicks offline so it never goes to file:///C:/panel/
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) {
      e.preventDefault();
      const targetRoute = a.getAttribute('data-spa-route') || a.getAttribute('href')?.replace('#', '');
      const foundKey = Object.keys(PAGES).find(k => PAGES[k].route === targetRoute);
      if (foundKey && outlet) {
        outlet.innerHTML = PAGES[foundKey].html;
        pSelect.value = foundKey;
      } else {
        alert("Page for route '" + targetRoute + "' has not been recorded yet. Record it in the live site first!");
      }
    }
  });
</script>
</body>
</html>`;

        await writeFile(rootDir, "index.html", fullDoc);
        await writeFile(rootDir, "layout.html", fullDoc);
    }

    async function snapToDisk(trigger = "auto") {
        if (!rootDir) return;
        if (widget) widget.style.display = 'none';

        try {
            await harvestCSS();
            const route = clean(location.pathname || 'dashboard');
            const mSel = '.MuiModal-root, .MuiDrawer-root, .MuiDialog-root, .MuiPopover-root, .MuiPopper-root, [role="dialog"], [role="presentation"], [role="listbox"]';
            const modals = Array.from(document.querySelectorAll(mSel)).filter(el => {
                const r = el.getBoundingClientRect();
                return r.width > 15 && r.height > 15 && el.innerText.trim().length > 0;
            });

            if (modals.length > 0) {
                for (let i = 0; i < modals.length; i++) {
                    const cleanMod = prepareCleanDOM(modals[i]);
                    const comp = cleanMod.querySelector('[data-react-component]')?.getAttribute('data-react-component') || 'Modal';
                    const title = cleanMod.querySelector('h1, h2, h3, h4, [class*="title"], [class*="Header"]')?.innerText || `popup_${i}`;
                    const fname = `${clean(`${route}_${comp}_${title}`)}.html`;
                    const html = `<!-- REACT MODAL | ROUTE: ${location.pathname} | COMP: ${comp} -->\n` + cleanMod.outerHTML;
                    const sig = fname + "_" + html.length;

                    if (sig !== lastHash || trigger === "manual") {
                        lastHash = sig;
                        await writeFile(modalsDir, fname, html);
                        state.modals.set(fname, { filename: fname, route: location.pathname, comp, title, html, size: html.length });
                        logEvent(`Saved modals/${fname}`, "INFO");
                    }
                }
            } else {
                const mainOrig = document.querySelector('main, .main-body, [class*="mainContent"]') || document.querySelector('#root, #app') || document.body;
                const skel = mainOrig.querySelector('.MuiSkeleton-root, [class*="skeleton"]');

                if (!skel || trigger === "manual") {
                    const cleanMain = prepareCleanDOM(mainOrig);
                    const comp = cleanMain.getAttribute('data-react-component') || cleanMain.querySelector('[data-react-component]')?.getAttribute('data-react-component') || 'Page';
                    const title = document.querySelector('h1, h2, .dashboard-page-title .title')?.innerText || '';
                    const tab = document.querySelector('.Mui-selected, [aria-selected="true"]')?.innerText || '';
                    const fname = `${clean(`${route}_${comp}_${title}_${tab}`)}.html`;
                    const html = `<!-- REACT PAGE | ROUTE: ${location.pathname} | COMP: ${comp} -->\n` + cleanMain.innerHTML;
                    const sig = fname + "_" + html.length;

                    if (sig !== lastHash || trigger === "manual") {
                        lastHash = sig;
                        await writeFile(pagesDir, fname, html);
                        state.pages.set(fname, { filename: fname, route: location.pathname, comp, title, html, size: html.length });
                        await rebuildInteractiveLayout(html);
                        logEvent(`Saved pages/${fname} & updated index.html`, "INFO");
                    }
                } else {
                    logEvent("Waiting for skeleton loader to finish...", "WARN");
                }
            }
        } catch (e) {
            logEvent(`Save Error: ${e.message}`, "ERR");
        } finally {
            if (widget) widget.style.display = 'block';
            syncUI();
        }
    }

    // Build Single-File Master Bundle (For sending to AI chat or automated Gemini API repair)
    async function buildAIMasterBundle(callApiIfKeyPresent = false) {
        if (!rootDir) return;
        logEvent("Generating AI_MASTER_BUNDLE.md...", "INFO");

        let bundle = `# AI MASTER PROJECT BUNDLE (${location.hostname})\n`;
        bundle += `- **Engine:** ${state.engine} | **UI Library:** ${state.uiLib}\n`;
        bundle += `- **React Components (${state.compCount}):** ${state.componentNames.join(', ')}\n`;
        bundle += `- **Captured Pages:** ${state.pages.size} | **Captured Modals:** ${state.modals.size} | **CSS Rules:** ${state.cssRules.size}\n\n`;

        bundle += `## 1. Diagnostic & Error Logs\n\`\`\`text\n${state.logs.join('\n')}\n\`\`\`\n\n`;
        bundle += `## 2. Discovered API Endpoints\n\`\`\`json\n${JSON.stringify(state.apiCalls.slice(0, 30), null, 2)}\n\`\`\`\n\n`;

        bundle += `## 3. Captured Pages (Modular Files)\n`;
        for (const [fname, p] of state.pages.entries()) {
            bundle += `### FILE: pages/${fname} (Route: ${p.route})\n\`\`\`html\n${p.html.slice(0, 3500)}\n<!-- [Total Size:${p.size} bytes] -->\n\`\`\`\n\n`;
        }

        bundle += `## 4. Captured Modals & Drawers\n`;
        for (const [fname, m] of state.modals.entries()) {
            bundle += `### FILE: modals/${fname} (Route: ${m.route})\n\`\`\`html\n${m.html.slice(0, 2500)}\n\`\`\`\n\n`;
        }

        await writeFile(rootDir, "AI_MASTER_BUNDLE.md", bundle);
        logEvent("Saved 'AI_MASTER_BUNDLE.md'! Send this single file to AI chat.", "INFO");

        if (callApiIfKeyPresent) {
            const store = await chrome.storage.local.get(['geminiApiKey']);
            if (store.geminiApiKey) {
                logEvent("Calling Gemini API to analyze & complete code...", "INFO");
                try {
                    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${store.geminiApiKey}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: "You are an expert React/MUI reverse-engineer. Read this AI_MASTER_BUNDLE.md from a cloned web panel. Provide complete, clean JS/CSS fixes to make all modals, drawers, tabs, and routes 100% functional:\n\n" + bundle.slice(0, 30000) }] }]
                        })
                    });
                    const data = await res.json();
                    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (reply) {
                        await writeFile(rootDir, "AI_COMPLETED_SOLUTION.md", reply);
                        logEvent("AI solution written to 'AI_COMPLETED_SOLUTION.md'!", "INFO");
                    }
                } catch (err) {
                    logEvent(`AI API Error: ${err.message}`, "ERR");
                }
            }
        }
    }

    async function stopSession() {
        isRunning = false;
        if (observer) observer.disconnect();
        await buildAIMasterBundle(false);
        logEvent("Stopped! Open 'index.html' or upload 'AI_MASTER_BUNDLE.md'.", "INFO");
    }

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === "ENABLE_AND_ANALYZE") {
            buildWidget();
            sendResponse({
                isRunning,
                engine: state.engine,
                uiLib: state.uiLib,
                compCount: state.compCount,
                cssRulesCount: state.cssRulesCount,
                pagesCount: state.pages.size,
                modalsCount: state.modals.size,
                lastLog: state.lastLog
            });
        } else if (msg.action === "DISABLE_ON_SITE") {
            if (widget) widget.style.display = 'none';
            sendResponse({ ok: true });
        } else if (msg.action === "GET_STATE") {
            sendResponse({
                isRunning,
                engine: state.engine,
                uiLib: state.uiLib,
                compCount: state.compCount,
                cssRulesCount: state.cssRulesCount,
                pagesCount: state.pages.size,
                modalsCount: state.modals.size,
                lastLog: state.lastLog
            });
        } else if (msg.action === "START_FRESH") {
            buildWidget();
            startSession(false);
            sendResponse({ isRunning: true });
        } else if (msg.action === "CONTINUE_EXISTING") {
            buildWidget();
            startSession(true);
            sendResponse({ isRunning: true });
        } else if (msg.action === "SAVE_NOW") {
            lastHash = "";
            snapToDisk("manual").then(() => {
                sendResponse({
                    isRunning,
                    engine: state.engine,
                    uiLib: state.uiLib,
                    compCount: state.compCount,
                    cssRulesCount: state.cssRulesCount,
                    pagesCount: state.pages.size,
                    modalsCount: state.modals.size,
                    lastLog: state.lastLog
                });
            });
            return true;
        } else if (msg.action === "STOP") {
            stopSession().then(() => {
                sendResponse({
                    isRunning: false,
                    engine: state.engine,
                    uiLib: state.uiLib,
                    compCount: state.compCount,
                    cssRulesCount: state.cssRulesCount,
                    pagesCount: state.pages.size,
                    modalsCount: state.modals.size,
                    lastLog: state.lastLog
                });
            });
            return true;
        }
    });
})();
