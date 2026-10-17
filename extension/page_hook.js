(function() {
    if (window.__SR_HOOK_V10__) return;
    window.__SR_HOOK_V10__ = true;

    const origFetch = window.fetch;
    window.fetch = async function(...args) {
        const res = await origFetch.apply(this, args);
        try {
            const clone = res.clone();
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            if (url && !url.includes('googleapis.com') && !url.match(/\.(css|png|jpg|svg|ico|woff2)$/i)) {
                clone.json().then(data => {
                    window.postMessage({
                        type: "SR_V10_NET",
                        payload: { method: (args[1]?.method || 'GET').toUpperCase(), url, status: res.status, route: location.pathname, sample: data }
                    }, "*");
                }).catch(() => {});
            }
        } catch (_) {}
        return res;
    };

    function passport() {
        if (!document.body) return;
        const tech = { frameworks: [], uiLibraries: [], cssEngines: [] };
        const root = document.querySelector('#root, #app, #__next') || document.body;
        if (Object.keys(root).some(k => k.startsWith('__reactFiber$'))) tech.frameworks.push("React");
        if (document.querySelector('[class*="Mui"]')) tech.uiLibraries.push("Material-UI (MUI)");
        if (document.querySelector('style[data-emotion]')) tech.cssEngines.push("Emotion");

        const comps = new Set();
        document.querySelectorAll('*').forEach(el => {
            const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
            if (fk) {
                let f = el[fk];
                for (let i = 0; i < 5 && f; i++) {
                    const name = f.type?.displayName || f.type?.name;
                    if (name && name.length > 2 && /^[A-Z]/.test(name) && !name.startsWith('Styled')) {
                        comps.add(name);
                        el.setAttribute('data-react-component', name);
                        break;
                    }
                    f = f.return;
                }
            }
        });

        const nav = [];
        document.querySelectorAll('aside a, nav a, [class*="sidebar"] a').forEach(a => {
            const label = a.innerText.trim();
            const route = a.getAttribute('href');
            if (label || route) nav.push({ label, route: route || '#' });
        });

        window.postMessage({
            type: "SR_V10_PASSPORT",
            payload: { domain: location.hostname, title: document.title, technologies: tech, reactComponentsCount: comps.size, reactComponentNames: Array.from(comps), navigationTree: nav }
        }, "*");
    }

    window.addEventListener('message', e => {
        if (e.data && e.data.type === "SR_V10_RUN_PASS") passport();
    });

    setTimeout(passport, 800);
})();
