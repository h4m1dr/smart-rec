(function() {
    if (window.__SMART_REC_HOOK_ACTIVE__) return;
    window.__SMART_REC_HOOK_ACTIVE__ = true;

    const hookData = {
        techStack: { framework: "Detecting...", uiLibrary: "Standard CSS" },
        componentsFound: []
    };

    // 1. Deep React Fiber & UI Library Inspection
    function inspectFiberAndTech() {
        const rootEl = document.querySelector('#root, #app, [data-reactroot]') || document.body;
        const allElements = document.querySelectorAll('*');
        
        let fiberDetected = !!(window.__REACT_DEVTOOLS_GLOBAL_HOOK__);
        const compSet = new Set(hookData.componentsFound);

        allElements.forEach(el => {
            const fKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
            if (fKey) {
                fiberDetected = true;
                let curr = el[fKey];
                // Walk up the Fiber tree to find the nearest meaningful React Component name
                for (let depth = 0; depth < 6 && curr; depth++) {
                    const typeObj = curr.type;
                    const rawName = typeof typeObj === 'function'
                        ? (typeObj.displayName || typeObj.name)
                        : (typeof typeObj === 'object' && typeObj !== null ? (typeObj.displayName || typeObj.render?.name) : null);

                    if (rawName && rawName.length > 2 && /^[A-Z]/.test(rawName) && !rawName.startsWith('WithStyles') && !rawName.startsWith('Styled')) {
                        compSet.add(rawName);
                        if (!el.hasAttribute('data-react-component')) {
                            el.setAttribute('data-react-component', rawName);
                        }
                        break;
                    }
                    curr = curr.return;
                }
            }
        });

        if (fiberDetected || Object.keys(rootEl).some(k => k.startsWith('__reactContainer$'))) {
            hookData.techStack.framework = "React";
        } else if (window.__VUE__) {
            hookData.techStack.framework = "Vue.js";
        } else {
            hookData.techStack.framework = "SPA / Standard DOM";
        }

        if (document.querySelector('[class*="Mui"], [class*="muirtl-"], [class*="css-"], style[data-emotion]')) {
            hookData.techStack.uiLibrary = "Material-UI (MUI + Emotion)";
        } else if (document.querySelector('[class*="ant-"]')) {
            hookData.techStack.uiLibrary = "Ant Design";
        }

        hookData.componentsFound = Array.from(compSet);

        window.postMessage({
            type: "SR_TECH_UPDATE",
            payload: {
                techStack: hookData.techStack,
                componentCount: hookData.componentsFound.length
            }
        }, "*");
    }

    // 2. Intercept SPA Router Navigation (React Router pushState / replaceState / popstate)
    const wrapHistory = (method) => {
        const orig = history[method];
        return function(...args) {
            const rv = orig.apply(this, args);
            window.postMessage({ type: "SR_ROUTE_CHANGE", payload: { path: location.pathname } }, "*");
            setTimeout(inspectFiberAndTech, 300);
            return rv;
        };
    };
    history.pushState = wrapHistory('pushState');
    history.replaceState = wrapHistory('replaceState');
    window.addEventListener('popstate', () => {
        window.postMessage({ type: "SR_ROUTE_CHANGE", payload: { path: location.pathname } }, "*");
        setTimeout(inspectFiberAndTech, 300);
    });

    // 3. Intercept Fetch & XHR API Calls for Backend Schema Discovery
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await origFetch.apply(this, args);
        try {
            const clone = response.clone();
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            if (url && !url.match(/\.(css|png|jpg|jpeg|svg|ico|woff|woff2|ttf|map)$/i)) {
                clone.json().then(data => {
                    window.postMessage({
                        type: "SR_API_LOG",
                        payload: {
                            method: (args[1]?.method || 'GET').toUpperCase(),
                            url: url,
                            path: location.pathname,
                            timestamp: new Date().toISOString(),
                            sampleResponse: data
                        }
                    }, "*");
                }).catch(() => {});
            }
        } catch (err) {}
        return response;
    };

    setTimeout(inspectFiberAndTech, 800);
    window.addEventListener('click', () => setTimeout(inspectFiberAndTech, 350));
})();
