(function() {
    if (window.__SR_HOOK_V8__) return;
    window.__SR_HOOK_V8__ = true;

    // 1. Immediate Network Sniffer (Captures Fetch & XHR from millisecond 0 on page refresh!)
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
        const startTime = Date.now();
        const res = await origFetch.apply(this, args);
        try {
            const clone = res.clone();
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            if (url && !url.includes('generativelanguage.googleapis.com') && !url.match(/\.(css|png|jpg|jpeg|svg|ico|woff|woff2|ttf)$/i)) {
                clone.json().then(data => {
                    window.postMessage({
                        type: "SR_V8_NETWORK_LOG",
                        payload: {
                            type: "FETCH",
                            method: (args[1]?.method || 'GET').toUpperCase(),
                            url,
                            status: res.status,
                            durationMs: Date.now() - startTime,
                            route: location.pathname,
                            responseSample: data
                        }
                    }, "*");
                }).catch(() => {});
            }
        } catch (_) {}
        return res;
    };

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.__srMethod = method ? method.toUpperCase() : "GET";
        this.__srUrl = url;
        return origOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function(...args) {
        this.addEventListener('load', function() {
            try {
                if (this.__srUrl && !this.__srUrl.match(/\.(css|png|jpg|svg|woff2)$/i)) {
                    const data = JSON.parse(this.responseText);
                    window.postMessage({
                        type: "SR_V8_NETWORK_LOG",
                        payload: {
                            type: "XHR",
                            method: this.__srMethod,
                            url: this.__srUrl,
                            status: this.status,
                            route: location.pathname,
                            responseSample: data
                        }
                    }, "*");
                }
            } catch (_) {}
        });
        return origSend.apply(this, args);
    };

    // 2. Wappalyzer-Grade Site Passport & React Fiber Annotator
    function generateSitePassport() {
        if (!document.body) return;
        const tech = { frameworks: [], uiLibraries: [], cssEngines: [], jsUtilities: [], analytics: [] };
        const root = document.querySelector('#root, #app, #__next, [data-reactroot]') || document.body;
        const hasFiber = Object.keys(root).some(k => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'));

        if (hasFiber || window.React || window.__REACT_DEVTOOLS_GLOBAL_HOOK__) tech.frameworks.push("React");
        if (document.querySelector('[class*="Mui"], [class*="muirtl-"]')) tech.uiLibraries.push("Material-UI (MUI)");
        if (document.querySelector('style[data-emotion], [class*="css-"]')) tech.cssEngines.push("Emotion");
        if (document.querySelector('style#_goober')) tech.cssEngines.push("Goober");
        if (window._) tech.jsUtilities.push(window._.VERSION ? `Lodash ${window._.VERSION}` : "Lodash");
        if (window['__core-js_shared__']) tech.jsUtilities.push("core-js");
        if (window.clarity) tech.analytics.push("Microsoft Clarity");
        if (window.gtag || window.dataLayer) tech.analytics.push("Google Analytics");

        const comps = new Set();
        document.querySelectorAll('*').forEach(el => {
            const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
            if (fk) {
                let curr = el[fk];
                for (let i = 0; i < 6 && curr; i++) {
                    const t = curr.type;
                    const name = typeof t === 'function' ? (t.displayName || t.name) : (typeof t === 'object' && t ? (t.displayName || t.render?.name) : null);
                    if (name && name.length > 2 && /^[A-Z]/.test(name) && !name.startsWith('Styled') && !name.startsWith('WithStyles')) {
                        comps.add(name);
                        el.setAttribute('data-react-component', name);
                        break;
                    }
                    curr = curr.return;
                }
            }
        });

        const fonts = new Set(), bgColors = new Set(), textColors = new Set(), radii = new Set();
        document.querySelectorAll('body, header, aside, main, button, input, h1, h2, h3, a, [class*="Card"], [class*="Paper"]').forEach(el => {
            const cs = getComputedStyle(el);
            if (cs.fontFamily) fonts.add(cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim());
            if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') bgColors.add(cs.backgroundColor);
            if (cs.color) textColors.add(cs.color);
            if (cs.borderRadius && cs.borderRadius !== '0px') radii.add(cs.borderRadius);
        });

        const navTree = [];
        document.querySelectorAll('aside a, nav a, [class*="sidebar"] a, [class*="Menu"] a').forEach(a => {
            const label = a.innerText.trim();
            const route = a.getAttribute('href');
            if (label || route) navTree.push({ label, route: route || '#' });
        });

        window.postMessage({
            type: "SR_V8_PASSPORT",
            payload: {
                domain: location.hostname,
                title: document.title,
                direction: getComputedStyle(document.body).direction || 'rtl',
                viewport: `${window.innerWidth}x${window.innerHeight}`,
                technologies: tech,
                reactComponentsCount: comps.size,
                reactComponentNames: Array.from(comps),
                designSystem: {
                    fonts: Array.from(fonts).slice(0, 8),
                    backgroundColors: Array.from(bgColors).slice(0, 15),
                    textColors: Array.from(textColors).slice(0, 12),
                    borderRadii: Array.from(radii).slice(0, 8)
                },
                navigationTree: navTree
            }
        }, "*");
    }

    // 3. Micro-Element Detail Scanner
    function scanMicroElements(selector) {
        const root = (selector && document.querySelector(selector)) || document.querySelector('main, .main-body, [class*="mainContent"]') || document.body;
        const details = { buttons: [], checkboxesAndSwitches: [], inputsAndDropdowns: [], tabs: [], cards: [], tables: [] };
        if (!root) return details;

        const dim = el => { const r = el.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}px`; };

        root.querySelectorAll('button, [role="button"]').forEach(b => {
            if (b.closest('#sr-v8-widget')) return;
            const cs = getComputedStyle(b);
            details.buttons.push({ text: b.innerText?.trim() || b.getAttribute('aria-label') || 'IconBtn', comp: b.getAttribute('data-react-component') || '', bg: cs.backgroundColor, color: cs.color, size: dim(b) });
        });

        root.querySelectorAll('input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="switch"], [class*="MuiCheckbox"], [class*="MuiSwitch"]').forEach(c => {
            if (c.closest('#sr-v8-widget')) return;
            details.checkboxesAndSwitches.push({
                label: c.closest('label')?.innerText?.trim() || c.parentElement?.innerText?.trim() || 'Toggle',
                checked: !!(c.checked || c.classList.contains('Mui-checked') || c.getAttribute('aria-checked') === 'true')
            });
        });

        root.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]), select, [role="combobox"]').forEach(i => {
            if (i.closest('#sr-v8-widget')) return;
            details.inputsAndDropdowns.push({ tag: i.tagName, placeholder: i.getAttribute('placeholder') || i.innerText?.trim() || '', size: dim(i) });
        });

        root.querySelectorAll('[role="tab"], [class*="Tab-root"], [class*="SwitchButton"]').forEach(t => {
            details.tabs.push({ label: t.innerText?.trim(), active: t.classList.contains('Mui-selected') || t.getAttribute('aria-selected') === 'true' });
        });

        root.querySelectorAll('table, [role="grid"]').forEach(tb => {
            const cols = Array.from(tb.querySelectorAll('th, [role="columnheader"]')).map(x => x.innerText.trim());
            details.tables.push({ columns: cols, rows: tb.querySelectorAll('tr, [role="row"]').length });
        });

        return details;
    }

    window.addEventListener('message', (e) => {
        if (!e.data) return;
        if (e.data.type === "SR_V8_RUN_PASSPORT") generateSitePassport();
        if (e.data.type === "SR_V8_SCAN_MICRO") {
            window.postMessage({ type: "SR_V8_MICRO_RESULT", reqId: e.data.reqId, payload: scanMicroElements(e.data.selector) }, "*");
        }
    });

    const wrap = m => {
        const orig = history[m];
        return function(...args) {
            const r = orig.apply(this, args);
            window.postMessage({ type: "SR_V8_ROUTE_CHANGE", path: location.pathname }, "*");
            setTimeout(generateSitePassport, 400);
            return r;
        };
    };
    history.pushState = wrap('pushState');
    history.replaceState = wrap('replaceState');
    window.addEventListener('popstate', () => window.postMessage({ type: "SR_V8_ROUTE_CHANGE", path: location.pathname }, "*"));

    window.addEventListener('DOMContentLoaded', () => setTimeout(generateSitePassport, 700));
    window.addEventListener('load', () => setTimeout(generateSitePassport, 1000));
})();
