(function() {
    if (window.__SR_CONTENT_V11__) return;
    window.__SR_CONTENT_V11__ = true;
    if (location.protocol === 'file:') return;

    const hook = document.createElement('script');
    hook.src = chrome.runtime.getURL('page_hook.js');
    (document.head || document.documentElement).appendChild(hook);

    let widget = null;
    let siteDir = null, rawCloneDir = null, pagesDir = null, modalsDir = null, staticDir = null, screensDir = null, aiPacksDir = null;
    let isRunning = false, observer = null, timer = null, lastSig = "";
    let autoShot = true;

    const state = { passport: null, pages: new Map(), modals: new Map(), cssRules: new Set(), logs: [], stepCounter: 2 };

    function safeFileName(s) {
        return (s || 'view').trim().replace(/[^a-zA-Z0-9_\u0600-\u06FF\-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'item';
    }

    function addLog(msg) {
        state.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
        const c = document.getElementById('srv11-console');
        if (c) { const d = document.createElement('div'); d.textContent = `• ${msg}`; c.appendChild(d); c.scrollTop = c.scrollHeight; }
    }

    function buildWidget() {
        if (widget) { widget.style.display = 'block'; return; }
        widget = document.createElement('div');
        widget.id = "srv11-widget";
        widget.style.cssText = "position:fixed;bottom:14px;left:14px;width:350px;background:#0f172a;color:#f8fafc;border:1px solid #334155;border-radius:10px;padding:12px;z-index:2147483647;font-family:monospace;font-size:11px;direction:ltr;text-align:left;box-shadow:0 20px 50px rgba(0,0,0,0.9);user-select:none;";
        widget.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b;padding-bottom:6px;margin-bottom:8px;">
                <strong style="color:#38bdf8;">⚛️ SMART-REC v11.0</strong>
                <button id="srv11-close" style="background:none;border:none;color:#94a3b8;cursor:pointer;">✕</button>
            </div>
            <div id="srv11-pass" style="background:#1e293b;padding:6px;border-radius:5px;margin-bottom:8px;font-size:10px;">Scanning passport...</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:8px;text-align:center;">
                <div style="background:#1e293b;padding:4px;border-radius:4px;">Pages: <b id="srv11-p" style="color:#38bdf8;">0</b></div>
                <div style="background:#1e293b;padding:4px;border-radius:4px;">Modals: <b id="srv11-m" style="color:#a855f7;">0</b></div>
            </div>
            <div id="srv11-console" style="height:55px;overflow-y:auto;background:#020617;border:1px solid #1e293b;padding:4px;border-radius:4px;font-size:10px;margin-bottom:8px;"></div>
            
            <div id="srv11-init" style="display:flex;flex-direction:column;gap:5px;">
                <button id="srv11-start" style="background:#10b981;color:#0f172a;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;">🚀 Start Recording</button>
            </div>
            
            <div id="srv11-active" style="display:none;flex-direction:column;gap:5px;">
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;">
                    <label><input type="checkbox" id="srv11-chk-shot" checked /> Auto-Shot</label>
                    <button id="srv11-ai-toggle" style="background:#8b5cf6;color:#fff;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:10px;">💬 AI Chat</button>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;">
                    <button id="srv11-save" style="background:#10b981;color:#0f172a;border:none;padding:6px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:10px;">💾 Save</button>
                    <button id="srv11-explore" style="background:#f59e0b;color:#0f172a;border:none;padding:6px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:10px;" title="Auto-click menus/tabs">🤖 Auto-Menus</button>
                    <button id="srv11-stop" style="background:#ef4444;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:10px;">⏹ Stop</button>
                </div>
            </div>

            <div id="srv11-ai-drawer" style="display:none;margin-top:6px;padding-top:6px;border-top:1px solid #334155;">
                <input type="password" id="srv11-apikey" placeholder="Gemini API Key..." style="width:100%;background:#020617;border:1px solid #334155;color:#fff;padding:4px;border-radius:3px;font-size:10px;margin-bottom:4px;" />
                <div id="srv11-aireply" style="height:60px;overflow-y:auto;background:#020617;padding:4px;border-radius:3px;font-size:9px;color:#e2e8f0;margin-bottom:4px;">Ask AI about this page...</div>
                <div style="display:flex;gap:4px;">
                    <input type="text" id="srv11-aiinput" placeholder="Prompt..." style="flex:1;background:#020617;border:1px solid #334155;color:#fff;padding:4px;border-radius:3px;font-size:10px;" />
                    <button id="srv11-aisend" style="background:#8b5cf6;color:#fff;border:none;padding:4px 8px;border-radius:3px;cursor:pointer;font-size:10px;">Send</button>
                </div>
            </div>
        `;
        document.body.appendChild(widget);

        document.getElementById('srv11-close').onclick = () => widget.style.display = 'none';
        document.getElementById('srv11-start').onclick = () => startSession();
        document.getElementById('srv11-stop').onclick = () => stopSession();
        document.getElementById('srv11-save').onclick = () => { lastSig = ""; captureState("manual", autoShot); };
        document.getElementById('srv11-explore').onclick = () => autoExploreMenus();
        document.getElementById('srv11-chk-shot').onchange = e => { autoShot = e.target.checked; };
        document.getElementById('srv11-ai-toggle').onclick = () => {
            const dr = document.getElementById('srv11-ai-drawer');
            dr.style.display = dr.style.display === 'none' ? 'block' : 'none';
        };
        document.getElementById('srv11-aisend').onclick = () => askAI();

        chrome.storage.local.get(['geminiApiKey'], st => { if (st.geminiApiKey) document.getElementById('srv11-apikey').value = st.geminiApiKey; });
        window.postMessage({ type: "SR_V11_RUN_PASS" }, "*");
    }

    chrome.storage.local.get(['whitelistedHosts'], res => {
        if ((res.whitelistedHosts || []).includes(location.hostname)) buildWidget();
    });

    window.addEventListener('message', e => {
        if (!e.data) return;
        if (e.data.type === "SR_V11_PASSPORT") {
            state.passport = e.data.payload;
            document.getElementById('srv11-pass').innerHTML = `<b>🪪 ${state.passport.domain}</b> (${state.passport.reactComponentsCount} Comps)`;
        } else if (e.data.type === "SR_V11_ROUTE_CHANGE" && isRunning) {
            setTimeout(() => captureState("route", autoShot), 600);
        }
    });

    chrome.runtime.onMessage.addListener((msg, sender, resp) => {
        if (msg.action === "SHOW_WIDGET") { buildWidget(); resp({ ok: true }); }
        if (msg.action === "HIDE_WIDGET") { if (widget) widget.style.display = 'none'; resp({ ok: true }); }
    });

    async function writeText(dir, name, text) {
        const fh = await dir.getFileHandle(safeFileName(name) + ".html", { create: true });
        const w = await fh.createWritable(); await w.write(text); await w.close();
    }

    async function writePng(dir, name, dataUrl) {
        const bin = atob(dataUrl.split(',')[1]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const fh = await dir.getFileHandle(safeFileName(name) + ".png", { create: true });
        const w = await fh.createWritable(); await w.write(bytes); await w.close();
    }

    async function startSession() {
        try {
            const root = await window.showDirectoryPicker({ mode: "readwrite" });
            siteDir = await root.getDirectoryHandle(safeFileName(location.hostname), { create: true });
            rawCloneDir = await siteDir.getDirectoryHandle("raw_clone", { create: true });
            pagesDir = await rawCloneDir.getDirectoryHandle("pages", { create: true });
            modalsDir = await rawCloneDir.getDirectoryHandle("modals", { create: true });
            screensDir = await siteDir.getDirectoryHandle("screenshots", { create: true });
            aiPacksDir = await siteDir.getDirectoryHandle("ai_Prompt_Packs", { create: true });

            if (state.passport) {
                const fh = await siteDir.getFileHandle("00_SITE_PASSPORT.json", { create: true });
                const w = await fh.createWritable(); await w.write(JSON.stringify(state.passport, null, 2)); await w.close();
            }

            isRunning = true;
            document.getElementById('srv11-start').style.display = 'none';
            document.getElementById('srv11-active').style.display = 'flex';
            addLog("Recording started!");

            await captureState("initial", autoShot);

            observer = new MutationObserver(() => {
                if (!isRunning) return;
                clearTimeout(timer);
                timer = setTimeout(() => captureState("mutation", autoShot), 500);
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        } catch (_) { addLog("Folder selection cancelled."); }
    }

    async function captureCleanPNG(prefix) {
        if (!screensDir) return null;
        if (widget) widget.style.display = 'none';
        await new Promise(r => setTimeout(r, 100));
        const res = await chrome.runtime.sendMessage({ type: "SR_CAPTURE_SCREENSHOT" });
        if (widget) widget.style.display = 'block';
        if (res && res.ok) {
            const name = safeFileName(prefix);
            await writePng(screensDir, name, res.dataUrl);
            return name + ".png";
        }
        return null;
    }

    // 🤖 Auto-Menus Explorer Bot
    async function autoExploreMenus() {
        if (!isRunning || !siteDir) { addLog("Start session first!"); return; }
        addLog("🤖 Auto-Exploring tabs & dropdowns...");
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const items = Array.from(document.querySelectorAll('[role="tab"], [class*="SwitchButton"], [aria-haspopup="true"]')).filter(el => !el.closest('#srv11-widget')).slice(0, 15);
        for (let i = 0; i < items.length; i++) {
            if (!isRunning) break;
            try { items[i].click(); await sleep(700); await captureState("auto", autoShot); } catch (_) {}
        }
        addLog("✅ Auto-Explore complete!");
    }

    async function requestMicroScan(sel) {
        return new Promise(res => {
            const reqId = "m_" + Date.now();
            const fn = e => {
                if (e.data && e.data.type === "SR_V11_MICRO_RES" && e.data.reqId === reqId) {
                    window.removeEventListener('message', fn); res(e.data.payload);
                }
            };
            window.addEventListener('message', fn);
            window.postMessage({ type: "SR_V11_SCAN_MICRO", selector: sel, reqId }, "*");
            setTimeout(() => { window.removeEventListener('message', fn); res({}); }, 800);
        });
    }

    async function askAI() {
        const key = document.getElementById('srv11-apikey').value.trim();
        const prompt = document.getElementById('srv11-aiinput').value.trim();
        const box = document.getElementById('srv11-aireply');
        if (!key) { box.textContent = "Enter Gemini API Key."; return; }
        box.textContent = "⏳ Querying Gemini AI...";
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt || "Analyze this React WebUI page structure." }] }] })
            });
            const data = await res.json();
            box.textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
        } catch (e) { box.textContent = "Error: " + e.message; }
    }

    async function captureState(trigger = "auto", takeShot = true) {
        if (!siteDir) return;
        try {
            const route = safeFileName(location.pathname || 'dashboard');
            const main = document.querySelector('main, .main-body') || document.body;
            const cln = main.cloneNode(true);
            const w = cln.querySelector('#srv11-widget'); if (w) w.remove();
            const fname = `${route}_page`;
            const html = cln.innerHTML;
            const sig = fname + "_" + html.length;

            if (sig !== lastSig || trigger === "manual") {
                lastSig = sig;
                await writeText(pagesDir, fname, html);
                state.pages.set(fname, true);
                if (takeShot) await captureCleanPNG(`page_${fname}`);
                document.getElementById('srv11-p').textContent = state.pages.size;
                addLog(`Saved: ${fname}`);
            }
        } catch (e) { addLog(`Error: ${e.message}`); }
    }

    function stopSession() {
        isRunning = false;
        if (observer) observer.disconnect();
        document.getElementById('srv11-active').style.display = 'none';
        document.getElementById('srv11-init').style.display = 'flex';
        addLog("Session stopped & saved.");
    }
})();
