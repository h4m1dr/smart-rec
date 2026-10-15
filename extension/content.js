(function() {
    if (window.__SMART_REC_CONTENT_ACTIVE__) return;
    window.__SMART_REC_CONTENT_ACTIVE__ = true;

    const LOCAL_SERVER_URL = "http://127.0.0.1:8765/sync";

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('page_hook.js');
    (document.head || document.documentElement).appendChild(script);

    const store = {
        domain: location.hostname,
        exportedAt: null,
        techStack: { framework: "Detecting...", uiLibrary: "Detecting..." },
        cssRules: [],
        layoutShell: "",
        pages: {},
        modals: {},
        svgs: {},
        apiEndpoints: []
    };

    const seenCssRules = new Set();
    const captureHistory = []; // Stack for Undo functionality
    let isRecording = false;
    let observer = null;
    let debounceTimer = null;
    let lastCaptureHash = "";

    // Build Floating Control Panel (English UI)
    const panel = document.createElement('div');
    panel.id = "smart-rec-panel";
    panel.style.cssText = `
        position: fixed; bottom: 20px; left: 20px; width: 325px;
        background: #0f172a; color: #f8fafc; border: 1px solid #334155;
        border-radius: 10px; padding: 14px; z-index: 2147483647;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px; direction: ltr; text-align: left;
        box-shadow: 0 20px 35px rgba(0,0,0,0.8); user-select: none;
    `;
    panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b;padding-bottom:8px;margin-bottom:8px;">
            <strong style="color:#38bdf8;font-size:13px;">⚡ SMART-REC v3.0</strong>
            <div style="display:flex;gap:6px;align-items:center;">
                <button id="sr-btn-reload" title="Reload Extension Code" style="background:#1e293b;color:#94a3b8;border:1px solid #334155;padding:2px 6px;border-radius:4px;cursor:pointer;font-size:10px;">🔄 Reload Ext</button>
                <span id="sr-status" style="background:#334155;color:#cbd5e1;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:bold;">IDLE</span>
            </div>
        </div>
        <div id="sr-tech" style="background:#1e293b;padding:7px;border-radius:6px;margin-bottom:8px;line-height:1.4;color:#94a3b8;font-size:11px;">
            Stack: <b style="color:#e2e8f0">Detecting...</b>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:6px;margin-bottom:8px;text-align:center;font-size:11px;">
            <div style="background:#1e293b;padding:5px;border-radius:6px;">Pages<br><strong id="sr-pages" style="color:#38bdf8;font-size:14px;">0</strong></div>
            <div style="background:#1e293b;padding:5px;border-radius:6px;">Modals<br><strong id="sr-modals" style="color:#a855f7;font-size:14px;">0</strong></div>
            <div style="background:#1e293b;padding:5px;border-radius:6px;">APIs<br><strong id="sr-apis" style="color:#10b981;font-size:14px;">0</strong></div>
        </div>
        <div id="sr-last-item" style="font-size:10px;color:#64748b;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            Last: None
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
            <button id="sr-btn-record" style="background:#10b981;color:#0f172a;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">▶ Start Recording</button>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;">
                <button id="sr-btn-snap" title="Force snap current state" style="background:#3b82f6;color:#fff;border:none;padding:6px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:11px;">📸 Snap</button>
                <button id="sr-btn-crawl" title="Auto-click tabs on this page" style="background:#f59e0b;color:#0f172a;border:none;padding:6px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:11px;">🤖 Tabs</button>
                <button id="sr-btn-undo" title="Remove last captured item" style="background:#475569;color:#fff;border:none;padding:6px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:11px;">🗑️ Undo</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:2px;">
                <button id="sr-btn-patch" title="Hotfix: Immediately overwrite ONLY the currently visible view/modal on disk" style="background:#ec4899;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:11px;">🛠️ Patch View</button>
                <button id="sr-btn-sync" title="Push all captured states directly to builder.py local server" style="background:#06b6d4;color:#0f172a;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:11px;">🔄 Sync to Disk</button>
            </div>
            <button id="sr-btn-export" style="background:#334155;color:#cbd5e1;border:none;padding:6px;border-radius:6px;cursor:pointer;font-size:11px;">💾 Download Fallback JSON</button>
        </div>
    `;
    document.body.appendChild(panel);

    function updatePanelUI(statusText = null, statusColor = null) {
        document.getElementById('sr-tech').innerHTML = `
            Framework: <b style="color:#fff">${store.techStack.framework}</b><br>
            UI Lib: <b style="color:#fff">${store.techStack.uiLibrary}</b>
        `;
        document.getElementById('sr-pages').textContent = Object.keys(store.pages).length;
        document.getElementById('sr-modals').textContent = Object.keys(store.modals).length;
        document.getElementById('sr-apis').textContent = store.apiEndpoints.length;

        const lastEntry = captureHistory[captureHistory.length - 1];
        document.getElementById('sr-last-item').textContent = lastEntry
            ? `Last: [${lastEntry.bucket}] ${lastEntry.key}`
            : `Last: None`;

        if (statusText) {
            const st = document.getElementById('sr-status');
            st.textContent = statusText;
            if (statusColor) st.style.background = statusColor;
        }
    }

    window.addEventListener('message', (event) => {
        if (!event.data || !event.data.type) return;
        if (event.data.type === "SR_TECH_UPDATE") {
            store.techStack = event.data.payload.techStack;
            updatePanelUI();
        } else if (event.data.type === "SR_API_LOG") {
            const entry = event.data.payload;
            const exists = store.apiEndpoints.some(a => a.method === entry.method && a.url === entry.url);
            if (!exists && store.apiEndpoints.length < 300) {
                store.apiEndpoints.push(entry);
                updatePanelUI();
            }
        } else if (event.data.type === "SR_ROUTE_CHANGE" && isRecording) {
            setTimeout(() => captureCurrentDOM("route_change"), 500);
        }
    });

    async function harvestCSSOM() {
        for (const sheet of Array.from(document.styleSheets)) {
            try {
                if (sheet.cssRules) {
                    for (const rule of Array.from(sheet.cssRules)) {
                        if (!seenCssRules.has(rule.cssText)) {
                            seenCssRules.add(rule.cssText);
                            store.cssRules.push(rule.cssText);
                        }
                    }
                }
            } catch (e) {
                if (sheet.href && !seenCssRules.has(sheet.href)) {
                    seenCssRules.add(sheet.href);
                    try {
                        const res = await fetch(sheet.href);
                        const text = await res.text();
                        store.cssRules.push(`/* External: ${sheet.href} */\n` + text);
                    } catch (_) {}
                }
            }
        }
    }

    function cleanKey(str) {
        return (str || 'item')
            .trim()
            .replace(/[\/\\?%*:|"<>]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 70) || 'root';
    }

    function captureCurrentDOM(triggerSource = "auto") {
        panel.style.display = 'none';
        let latestCaptured = null;

        try {
            if (!store.layoutShell) {
                const rootClone = document.querySelector('#root, #app')?.cloneNode(true);
                if (rootClone) {
                    const mainArea = rootClone.querySelector('main, .main-body, [class*="mainContent"]');
                    if (mainArea) {
                        mainArea.innerHTML = '<!-- {{DYNAMIC_PAGE_OUTLET}} -->';
                        store.layoutShell = rootClone.outerHTML;
                    }
                }
            }

            document.querySelectorAll('svg').forEach(svg => {
                const idHint = svg.getAttribute('data-testid') || svg.getAttribute('aria-label') || svg.className?.baseVal || 'icon';
                const html = svg.outerHTML;
                const hash = html.length + "_" + html.slice(0, 40) + html.slice(-40);
                if (!store.svgs[hash]) {
                    store.svgs[hash] = { name: cleanKey(idHint), html: html };
                }
            });

            harvestCSSOM();

            const modalSelectors = '.MuiModal-root, .MuiDrawer-root, .MuiDialog-root, .MuiPopover-root, .MuiPopper-root, [role="dialog"], [role="presentation"], [role="listbox"], .dropdown-menu.show';
            const openPopups = Array.from(document.querySelectorAll(modalSelectors))
                .filter(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 10 && rect.height > 10 && el.innerText.trim().length > 0;
                });

            const pathName = cleanKey(location.pathname || 'home');

            if (openPopups.length > 0) {
                openPopups.forEach((pop, idx) => {
                    const heading = pop.querySelector('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="Header"]')?.innerText;
                    const roleAttr = pop.getAttribute('role') || 'modal';
                    const modalKey = cleanKey(`${pathName}_${roleAttr}_${heading || idx}`);
                    
                    const sig = modalKey + "_" + pop.innerHTML.length;
                    if (sig !== lastCaptureHash || triggerSource === "patch") {
                        lastCaptureHash = sig;
                        const itemData = {
                            url: location.href,
                            path: location.pathname,
                            capturedAt: new Date().toISOString(),
                            trigger: triggerSource,
                            html: pop.outerHTML
                        };
                        store.modals[modalKey] = itemData;
                        captureHistory.push({ bucket: 'modals', key: modalKey });
                        latestCaptured = { bucket: 'modals', key: modalKey, data: itemData };
                    }
                });
            } else {
                const mainEl = document.querySelector('main, .main-body, [class*="mainContent"]') || document.querySelector('#root, #app') || document.body;
                const hasSkeleton = mainEl.querySelector('.MuiSkeleton-root, [class*="skeleton"]');

                if (!hasSkeleton || triggerSource === "manual" || triggerSource === "patch") {
                    const viewTitle = document.querySelector('h1, h2, .dashboard-page-title .title')?.innerText || '';
                    const activeTab = document.querySelector('.Mui-selected, [aria-selected="true"], [class*="active"]')?.innerText || '';
                    const pageKey = cleanKey(`${pathName}_${viewTitle}_${activeTab}`);

                    const htmlContent = mainEl.outerHTML;
                    const sig = pageKey + "_" + htmlContent.length;

                    if (sig !== lastCaptureHash || triggerSource === "patch") {
                        lastCaptureHash = sig;
                        const itemData = {
                            url: location.href,
                            path: location.pathname,
                            capturedAt: new Date().toISOString(),
                            trigger: triggerSource,
                            html: htmlContent
                        };
                        store.pages[pageKey] = itemData;
                        captureHistory.push({ bucket: 'pages', key: pageKey });
                        latestCaptured = { bucket: 'pages', key: pageKey, data: itemData };
                    }
                }
            }
        } finally {
            panel.style.display = 'block';
            updatePanelUI();
        }
        return latestCaptured;
    }

    // Push data directly to local Python daemon (builder.py --serve)
    async function pushToLocalServer(payload, statusLabel = "SYNCED!") {
        updatePanelUI("SYNCING...", "#06b6d4");
        try {
            const res = await fetch(LOCAL_SERVER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                updatePanelUI(statusLabel, "#10b981");
                return true;
            } else {
                updatePanelUI("SYNC ERR", "#ef4444");
                return false;
            }
        } catch (err) {
            alert("Local Builder Server is not running!\nRun 'python builder.py' in your terminal first, or use 'Download Fallback JSON'.");
            updatePanelUI("OFFLINE", "#ef4444");
            return false;
        }
    }

    // Button: Reload Extension
    document.getElementById('sr-btn-reload').onclick = () => {
        chrome.runtime.sendMessage({ type: "SR_RELOAD_EXTENSION" });
        setTimeout(() => location.reload(), 300);
    };

    // Button: Start / Stop Recording
    document.getElementById('sr-btn-record').onclick = () => {
        const btn = document.getElementById('sr-btn-record');
        if (!isRecording) {
            isRecording = true;
            btn.textContent = "⏹ Stop Recording";
            btn.style.background = "#ef4444";
            btn.style.color = "#fff";
            updatePanelUI("REC", "#ef4444");

            captureCurrentDOM("initial");

            observer = new MutationObserver(() => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => captureCurrentDOM("mutation"), 350);
            });
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style', 'aria-expanded', 'aria-hidden']
            });
        } else {
            isRecording = false;
            if (observer) observer.disconnect();
            btn.textContent = "▶ Resume Recording";
            btn.style.background = "#10b981";
            btn.style.color = "#0f172a";
            updatePanelUI("PAUSED", "#f59e0b");
        }
    };

    // Button: Force Manual Snap
    document.getElementById('sr-btn-snap').onclick = () => {
        lastCaptureHash = "";
        captureCurrentDOM("manual");
        updatePanelUI("SNAPPED", "#3b82f6");
    };

    // Button: Undo Last Capture
    document.getElementById('sr-btn-undo').onclick = () => {
        const last = captureHistory.pop();
        if (last && store[last.bucket]) {
            delete store[last.bucket][last.key];
            lastCaptureHash = "";
            updatePanelUI("UNDONE", "#f59e0b");
        }
    };

    // Button: Auto-Click Tabs
    document.getElementById('sr-btn-crawl').onclick = async () => {
        updatePanelUI("CRAWLING", "#f59e0b");
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        captureCurrentDOM("pre_crawl");

        const tabSelectors = '[role="tab"], [class*="SwitchButton"], [class*="Tab-root"]';
        const tabs = Array.from(document.querySelectorAll(tabSelectors)).filter(el => !panel.contains(el));

        for (const tab of tabs) {
            try {
                tab.click();
                await sleep(700);
                captureCurrentDOM("auto_tab");
            } catch (e) {}
        }
        updatePanelUI("DONE", "#10b981");
    };

    // Button: Hotfix / Patch ONLY Current View directly to disk
    document.getElementById('sr-btn-patch').onclick = async () => {
        await harvestCSSOM();
        const latest = captureCurrentDOM("patch");
        if (!latest) return;

        const patchPayload = {
            domain: store.domain,
            techStack: store.techStack,
            cssRules: store.cssRules,
            pages: latest.bucket === 'pages' ? { [latest.key]: latest.data } : {},
            modals: latest.bucket === 'modals' ? { [latest.key]: latest.data } : {},
            svgs: store.svgs,
            apiEndpoints: store.apiEndpoints
        };
        await pushToLocalServer(patchPayload, "PATCHED!");
    };

    // Button: Sync All States to Local Disk
    document.getElementById('sr-btn-sync').onclick = async () => {
        await harvestCSSOM();
        captureCurrentDOM("sync_all");
        store.exportedAt = new Date().toISOString();
        await pushToLocalServer(store, "ALL SYNCED!");
    };

    // Button: Fallback JSON Download
    document.getElementById('sr-btn-export').onclick = async () => {
        await harvestCSSOM();
        captureCurrentDOM("final_export");
        store.exportedAt = new Date().toISOString();

        const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smart_rec_${store.domain}_${Date.now()}.json`;
        a.click();
        updatePanelUI("EXPORTED", "#10b981");
    };
})();
