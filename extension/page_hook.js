(function() {
    if (window.__SR_HOOK_V6__) return;
    window.__SR_HOOK_V6__ = true;

    const apiLogs = [];

    function analyzeSiteArchitecture() {
        const audit = {
            engine: "Standard DOM",
            uiLib: "Standard CSS",
            compCount: 0,
            componentNames: [],
            styleSheetsCount: document.styleSheets.length,
            cssRulesCount: 0,
            emotionTags: document.querySelectorAll('style[data-emotion]').length,
            internalLinksCount: 0,
            brokenImagesCount: 0,
            errors: []
        };

        try {
            const root = document.querySelector('#root, #app, [data-reactroot]') || document.body;
            const fiberKey = Object.keys(root).find(k => k.startsWith('__reactFiber$') \vert{}\vert{} k.startsWith('__reactContainer$'));
            const isReact = !!(fiberKey || window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || document.querySelector('[class*="Mui"]'));
            const isMUI = !!document.querySelector('[class*="Mui"], [class*="muirtl-"], [class*="css-"]');

            if (isReact) audit.engine = "React Fiber";
            if (isMUI) audit.uiLib = "MUI (Emotion CSSOM)";

            const comps = new Set();
            document.querySelectorAll('*').forEach(el => {
                const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$') \vert{}\vert{} k.startsWith('__reactInternalInstance$'));
                if (fk) {
                    let f = el[fk];
                    for (let i = 0; i < 5 && f; i++) {
                        const t = f.type;
                        const name = typeof t === 'function' ? (t.displayName || t.name) : (typeof t === 'object' && t ? (t.displayName || t.render?.name) : null);
                        if (name && name.length > 2 && /^[A-Z]/.test(name) && !name.startsWith('Styled(') && !name.startsWith('WithStyles')) {
                            comps.add(name);
                            el.setAttribute('data-react-component', name);
                            break;
                        }
                        f = f.return;
                    }
                }
            });

            audit.compCount = comps.size;
            audit.componentNames = Array.from(comps);

            for (const sh of Array.from(document.styleSheets)) {
                try {
                    if (sh.cssRules) audit.cssRulesCount += sh.cssRules.length;
                } catch (e) {
                    audit.errors.push(`CORS CSS blocked: ${sh.href || 'inline'}`);
                }
            }

            document.querySelectorAll('a[href]').forEach(a => {
                const h = a.getAttribute('href');
                if (h && h.startsWith('/')) audit.internalLinksCount++;
            });

            document.querySelectorAll('img').forEach(img => {
                if (!img.complete || img.naturalWidth === 0) audit.brokenImagesCount++;
            });

        } catch (err) {
            audit.errors.push(`Analyze Error: ${err.message}`);
        }

        window.postMessage({ type: "SR_V6_STATUS", payload: audit }, "*");
    }

    // Intercept SPA Route Changes
    const wrap = (m) => {
        const orig = history[m];
        return function(...args) {
            const r = orig.apply(this, args);
            window.postMessage({ type: "SR_V6_ROUTE", path: location.pathname }, "*");
            setTimeout(analyzeSiteArchitecture, 350);
            return r;
        };
    };
    history.pushState = wrap('pushState');
    history.replaceState = wrap('replaceState');
    window.addEventListener('popstate', () => {
        window.postMessage({ type: "SR_V6_ROUTE", path: location.pathname }, "*");
        setTimeout(analyzeSiteArchitecture, 350);
    });

    // Intercept Fetch API Requests
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
        const res = await origFetch.apply(this, args);
        try {
            const clone = res.clone();
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            if (url && !url.includes('generativelanguage.googleapis.com') && !url.match(/\.(css|png|jpg|jpeg|svg|ico|woff|woff2|ttf)$/i)) {
                clone.json().then(data => {
                    const entry = { method: (args[1]?.method || 'GET').toUpperCase(), url, path: location.pathname, sample: data };
                    if (apiLogs.length < 150) apiLogs.push(entry);
                    window.postMessage({ type: "SR_V6_API", payload: entry }, "*");
                }).catch(() => {});
            }
        } catch (_) {}
        return res;
    };

    // Catch Page Runtime Errors
    window.addEventListener('error', (e) => {
        window.postMessage({ type: "SR_V6_ERROR", message: e.message || "Runtime script error" }, "*");
    });

    // Listen for On-Demand Re-Analyze Request
    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === "SR_V6_TRIGGER_AUDIT") analyzeSiteArchitecture();
    });

    setTimeout(analyzeSiteArchitecture, 600);
    window.addEventListener('click', () => setTimeout(analyzeSiteArchitecture, 400));
})();
