(function() {
    if (window.__SMART_REC_CONTENT_ACTIVE__) return;
    window.__SMART_REC_CONTENT_ACTIVE__ = true;

    // Inject Main World Hook
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('page_hook.js');
    (document.head || document.documentElement).appendChild(script);

    // Central State Repository
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
    let isRecording = false;
    let observer = null;
    let debounceTimer = null;
    let lastCaptureHash = "";

    // Build Floating Control Panel (English UI)
    const panel = document.createElement('div');
    panel.id = "smart-rec-panel";
    panel.style.cssText = `
        position: fixed; bottom: 20px; left: 20px; width: 310px;
        background: #0f172a; color: #f8fafc; border: 1px solid #334155;
        border-radius: 10px; padding: 14px; z-index: 2147483647;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px; direction: ltr; text-align: left;
        box-shadow: 0 20px 35px rgba(0,0,0,0.75); user-select: none;
    `;
    panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b;padding-bottom:8px;margin-bottom:10px;">
            <strong style="color:#38bdf8;font-size:13px;">⚡ SMART-REC v2.0</strong>
            <span id="sr-status" style="background:#334155;color:#cbd5e1;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:bold;">IDLE</span>
        </div>
        <div id="sr-tech" style="background:#1e293b;padding:8px;border-radius:6px;margin-bottom:10px;line-height:1.5;color:#94a3b8;font-size:11px;">
            Stack: <b style="color:#e2e8f0">Detecting...</b>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:6px;margin-bottom:12px;text-align:center;font-size:11px;">
            <div style="background:#1e293b;padding:6px;border-radius:6px;">Pages<br><strong id="sr-pages" style="color:#38bdf8;font-size:14px;">0</strong></div>
            <div style="background:#1e293b;padding:6px;border-radius:6px;">Modals<br><strong id="sr-modals" style="color:#a855f7;font-size:14px;">0</strong></div>
            <div style="background:#1e293b;padding:6px;border-radius:6px;">APIs<br><strong id="sr-apis" style="color:#10b981;font-size:14px;">0</strong></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
            <button id="sr-btn-record" style="background:#10b981;color:#0f172a;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">▶ Start Recording</button>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                <button id="sr-btn-snap" style="background:#3b82f6;color:#fff;border:none;padding:7px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:11px;">📸 Snap Now</button>
                <button id="sr-btn-crawl" style="background:#f59e0b;color:#0f172a;border:none;padding:7px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:11px;">🤖 Auto-Tabs</button>
            </div>
            <button id="sr-btn-export" style="background:#6366f1;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;margin-top:2px;">💾 Export Bundle (JSON)</button>
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

        if (statusText) {
            const st = document.getElementById('sr-status');
            st.textContent = statusText;
            if (statusColor) st.style.background = statusColor;
        }
    }

    // Listen for messages from page_hook.js
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

    // Harvest active CSSOM rules (crucial for Emotion / Styled-Components)
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
                // Cross-origin stylesheet fallback
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

    // Clean & sanitize keys for file naming
    function cleanKey(str) {
        return (str || 'item')
            .trim()
            .replace(/[\/\\?%*:|"<>]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 70) || 'root';
    }

    // Main DOM & State Capture Engine
    function captureCurrentDOM(triggerSource = "auto") {
        panel.style.display = 'none'; // Hide panel during snapshot

        try {
            // 1. Capture Layout Shell once (Header + Sidebar without main dynamic view)
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

            // 2. Harvest unique SVGs
            document.querySelectorAll('svg').forEach(svg => {
                const idHint = svg.getAttribute('data-testid') || svg.getAttribute('aria-label') || svg.className?.baseVal || 'icon';
                const html = svg.outerHTML;
                const hash = html.length + "_" + html.slice(0, 40) + html.slice(-40);
                if (!store.svgs[hash]) {
                    store.svgs[hash] = { name: cleanKey(idHint), html: html };
                }
            });

            // 3. Harvest Newly Injected CSSOM Rules (MUI Modals inject CSS on open)
            harvestCSSOM();

            // 4. Detect Open Modals / Drawers / Popovers / Dialogs
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
                    if (sig !== lastCaptureHash) {
                        lastCaptureHash = sig;
                        store.modals[modalKey] = {
                            url: location.href,
                            path: location.pathname,
                            capturedAt: new Date().toISOString(),
                            trigger: triggerSource,
                            html: pop.outerHTML
                        };
                    }
                });
            } else {
                // 5. Capture Main Page View (if not showing loading skeletons)
                const mainEl = document.querySelector('main, .main-body, [class*="mainContent"]') || document.querySelector('#root, #app') || document.body;
                const hasSkeleton = mainEl.querySelector('.MuiSkeleton-root, [class*="skeleton"]');

                if (!hasSkeleton || triggerSource === "manual") {
                    const viewTitle = document.querySelector('h1, h2, .dashboard-page-title .title')?.innerText || '';
                    const activeTab = document.querySelector('.Mui-selected, [aria-selected="true"], [class*="active"]')?.innerText || '';
                    const pageKey = cleanKey(`${pathName}_${viewTitle}_${activeTab}`);

                    const htmlContent = mainEl.outerHTML;
                    const sig = pageKey + "_" + htmlContent.length;

                    if (sig !== lastCaptureHash) {
                        lastCaptureHash = sig;
                        store.pages[pageKey] = {
                            url: location.href,
                            path: location.pathname,
                            capturedAt: new Date().toISOString(),
                            trigger: triggerSource,
                            html: htmlContent
                        };
                    }
                }
            }
        } finally {
            panel.style.display = 'block';
            updatePanelUI();
        }
    }

    // Button: Start / Stop Auto-Recording
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

    // Button: Manual Immediate Snapshot
    document.getElementById('sr-btn-snap').onclick = () => {
        lastCaptureHash = ""; // Force capture
        captureCurrentDOM("manual");
        updatePanelUI("SNAPPED!", "#3b82f6");
    };

    // Button: Safe Auto-Tabs Crawler (Clicks in-page tabs & switches without leaving the page)
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

    // Button: Export Modular JSON Bundle
    document.getElementById('sr-btn-export').onclick = async () => {
        const btn = document.getElementById('sr-btn-export');
        btn.textContent = "⏳ Harvesting CSS...";
        await harvestCSSOM();
        captureCurrentDOM("final_export");

        store.exportedAt = new Date().toISOString();
        const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smart_rec_${store.domain}_${Date.now()}.json`;
        a.click();

        btn.textContent = "✅ Exported!";
        updatePanelUI("EXPORTED", "#10b981");
        setTimeout(() => { btn.textContent = "💾 Export Bundle (JSON)"; }, 2000);
    };
})();
