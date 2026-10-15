(function() {
    if (window.__SMART_REC_HOOK_ACTIVE__) return;
    window.__SMART_REC_HOOK_ACTIVE__ = true;

    const hookData = {
        techStack: { framework: "Unknown", uiLibrary: "Unknown" },
        componentsFound: []
    };

    // 1. Detect Framework & Annotate React Fiber Nodes
    function inspectFiberAndTech() {
        const rootEl = document.querySelector('#root, #app, [data-reactroot]') || document.body;
        const fiberKey = Object.keys(rootEl).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'));

        if (fiberKey || window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
            hookData.techStack.framework = "React";
        } else if (window.__VUE__) {
            hookData.techStack.framework = "Vue.js";
        }

        if (document.querySelector('[class*="Mui"], [class*="muirtl-"], [class*="css-"]')) {
            hookData.techStack.uiLibrary = "MUI (Emotion CSS-in-JS)";
        } else if (document.querySelector('[class*="ant-"]')) {
            hookData.techStack.uiLibrary = "Ant Design";
        }

        const compSet = new Set(hookData.componentsFound);
        document.querySelectorAll('*').forEach(el => {
            const fKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
            if (fKey && el[fKey]?.return?.type?.name) {
                const compName = el[fKey].return.type.name;
                if (compName.length > 2 && /^[A-Z]/.test(compName)) {
                    compSet.add(compName);
                    el.setAttribute('data-react-component', compName);
                }
            }
        });
        hookData.componentsFound = Array.from(compSet);

        window.postMessage({ type: "SR_TECH_UPDATE", payload: hookData }, "*");
    }

    // 2. Intercept SPA Router Navigation
    const wrapHistory = (type) => {
        const orig = history[type];
        return function(...args) {
            const rv = orig.apply(this, args);
            window.postMessage({ type: "SR_ROUTE_CHANGE", payload: { path: location.pathname } }, "*");
            return rv;
        };
    };
    history.pushState = wrapHistory('pushState');
    history.replaceState = wrapHistory('replaceState');
    window.addEventListener('popstate', () => {
        window.postMessage({ type: "SR_ROUTE_CHANGE", payload: { path: location.pathname } }, "*");
    });

    // 3. Intercept Fetch API Calls
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await origFetch.apply(this, args);
        try {
            const clone = response.clone();
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            if (url && !url.includes('127.0.0.1:8765') && !url.match(/\.(css|png|jpg|jpeg|svg|ico|woff|woff2|ttf)$/i)) {
                clone.json().then(data => {
                    window.postMessage({
                        type: "SR_API_LOG",
                        payload: {
                            method: args[1]?.method || 'GET',
                            url: url,
                            timestamp: new Date().toISOString(),
                            sampleResponse: data
                        }
                    }, "*");
                }).catch(() => {});
            }
        } catch (err) {}
        return response;
    };

    setTimeout(inspectFiberAndTech, 1200);
    window.addEventListener('click', () => setTimeout(inspectFiberAndTech, 400));
})();
