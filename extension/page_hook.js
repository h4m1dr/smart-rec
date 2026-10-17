(function() {
    if (window.__SR_HOOK_V7__) return;
    window.__SR_HOOK_V7__ = true;

    // 1. Wappalyzer-Style Deep Technology & Design System Fingerprinter
    function generateSitePassport() {
        const tech = {
            frameworks: [],
            uiLibraries: [],
            cssEngines: [],
            jsUtilities: [],
            analyticsAndCDN: [],
            pwa: false
        };

        // Detect React / Vue / Angular / Next
        const root = document.querySelector('#root, #app, #__next, [data-reactroot]') || document.body;
        const hasFiber = Object.keys(root).some(k => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'));
        if (hasFiber || window.React || window.__REACT_DEVTOOLS_GLOBAL_HOOK__) tech.frameworks.push("React");
        if (window.__NEXT_DATA__) tech.frameworks.push("Next.js");
        if (window.__VUE__) tech.frameworks.push("Vue.js");

        // Detect UI Frameworks & CSS-in-JS (MUI, Emotion, Goober, AntD, Tailwind)
        if (document.querySelector('[class*="Mui"], [class*="muirtl-"]')) tech.uiLibraries.push("Material-UI (MUI)");
        if (document.querySelector('style[data-emotion], [class*="css-"]')) tech.cssEngines.push("Emotion");
        if (document.querySelector('style#_goober, [class*="go"]')) tech.cssEngines.push("Goober");
        if (document.querySelector('[class*="ant-"]')) tech.uiLibraries.push("Ant Design");

        // Detect JS Libraries (Lodash, core-js, Axios, Clarity, GA)
        if (window._ && typeof window._.VERSION === 'string') tech.jsUtilities.push(`Lodash (${window._.VERSION})`);
        else if (window._) tech.jsUtilities.push("Lodash");
        if (window['__core-js_shared__']) tech.jsUtilities.push("core-js");
        if (window.clarity) tech.analyticsAndCDN.push("Microsoft Clarity");
        if (window.gtag || window.ga || window.dataLayer) tech.analyticsAndCDN.push("Google Analytics / Tag Manager");
        if (document.querySelector('link[rel="manifest"]')) tech.pwa = true;

        // Annotate React Fiber Components
        const components = new Set();
        document.querySelectorAll('*').forEach(el => {
            const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$') \vert{}\vert{} k.startsWith('__reactInternalInstance$'));
            if (fk) {
                let curr = el[fk];
                for (let i = 0; i < 6 && curr; i++) {
                    const t = curr.type;
                    const name = typeof t === 'function' ? (t.displayName || t.name) : (typeof t === 'object' && t ? (t.displayName || t.render?.name) : null);
                    if (name && name.length > 2 && /^[A-Z]/.test(name) && !name.startsWith('Styled') && !name.startsWith('WithStyles')) {
                        components.add(name);
                        el.setAttribute('data-react-component', name);
                        break;
                    }
                    curr = curr.return;
                }
            }
        });

        // Extract Global Design Tokens (Fonts, Color Palette, Border Radius, Layout Dimensions)
        const fonts = new Set();
        const bgColors = new Set();
        const textColors = new Set();
        const radii = new Set();

        const sampleNodes = document.querySelectorAll('body, header, nav, aside, main, button, input, h1, h2, h3, a, [class*="Card"], [class*="Paper"]');
        sampleNodes.forEach(el => {
            const cs = window.getComputedStyle(el);
            if (cs.fontFamily) fonts.add(cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim());
            if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') bgColors.add(cs.backgroundColor);
            if (cs.color) textColors.add(cs.color);
            if (cs.borderRadius && cs.borderRadius !== '0px') radii.add(cs.borderRadius);
        });

        // Extract Navigation Tree
        const navTree = [];
        document.querySelectorAll('aside a, nav a, .sidebar a, [class*="sidebar"] a, [class*="Menu"] a').forEach(a => {
            const text = a.innerText.trim();
            const href = a.getAttribute('href');
            if (text || href) navTree.push({ label: text, route: href || '#' });
        });

        const passport = {
            domain: location.hostname,
            title: document.title,
            direction: document.dir || document.documentElement.dir || window.getComputedStyle(document.body).direction || 'rtl',
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            lastUpdated: new Date().toISOString(),
            technologies: tech,
            reactComponentsCount: components.size,
            reactComponentNames: Array.from(components),
            designSystem: {
                fonts: Array.from(fonts).slice(0, 8),
                backgroundColors: Array.from(bgColors).slice(0, 15),
                textColors: Array.from(textColors).slice(0, 12),
                borderRadii: Array.from(radii).slice(0, 8)
            },
            navigationTree: navTree
        };

        window.postMessage({ type: "SR_V7_PASSPORT", payload: passport }, "*");
    }

    // 2. Micro-Element Scanner (Extracts every Button, Checkbox, Dropdown, Input, Tab, Card, Table for AI Reconstruction)
    function scanViewMicroElements(containerSelector) {
        const root = containerSelector ? document.querySelector(containerSelector) : (document.querySelector('main, .main-body, [class*="mainContent"]') || document.body);
        if (!root) return {};

        const details = {
            headings: [],
            buttons: [],
            checkboxesAndSwitches: [],
            inputsAndDropdowns: [],
            tabs: [],
            cardsAndWidgets: [],
            tables: [],
            chartsAndCanvas: []
        };

        const rectStr = (el) => {
            const r = el.getBoundingClientRect();
            return `${Math.round(r.width)}x${Math.round(r.height)}px at (${Math.round(r.left)},${Math.round(r.top)})`;
        };

        // Headings
        root.querySelectorAll('h1, h2, h3, h4, .title, [class*="Title"]').forEach(h => {
            const txt = h.innerText?.trim();
            if (txt && txt.length < 100) details.headings.push({ tag: h.tagName, text: txt, color: getComputedStyle(h).color, fontSize: getComputedStyle(h).fontSize });
        });

        // Buttons
        root.querySelectorAll('button, [role="button"], .btn').forEach(btn => {
            if (btn.closest('#sr-v7-widget')) return;
            const cs = getComputedStyle(btn);
            details.buttons.push({
                text: btn.innerText?.trim() || btn.getAttribute('aria-label') || 'IconButton',
                component: btn.getAttribute('data-react-component') || '',
                hasSvgIcon: !!btn.querySelector('svg'),
                bg: cs.backgroundColor,
                color: cs.color,
                radius: cs.borderRadius,
                size: rectStr(btn)
            });
        });

        // Checkboxes, Switches & Radios
        root.querySelectorAll('input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="switch"], [class*="MuiCheckbox"], [class*="MuiSwitch"]').forEach(chk => {
            const label = chk.closest('label')?.innerText?.trim() || chk.parentElement?.innerText?.trim() || 'Unnamed Toggle';
            const isChecked = chk.checked || chk.classList.contains('Mui-checked') || chk.getAttribute('aria-checked') === 'true';
            details.checkboxesAndSwitches.push({ label, checked: isChecked, classes: chk.className });
        });

        // Inputs, Selects & Dropdowns
        root.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]), select, textarea, [role="combobox"], [class*="Select"]').forEach(inp => {
            if (inp.closest('#sr-v7-widget')) return;
            details.inputsAndDropdowns.push({
                tag: inp.tagName,
                type: inp.getAttribute('type') || 'select/dropdown',
                placeholder: inp.getAttribute('placeholder') || inp.innerText?.trim() || '',
                value: inp.value || '',
                size: rectStr(inp)
            });
        });

        // Tabs
        root.querySelectorAll('[role="tab"], [class*="Tab-root"], [class*="SwitchButton"]').forEach(tab => {
            details.tabs.push({
                label: tab.innerText?.trim(),
                active: tab.classList.contains('Mui-selected') || tab.getAttribute('aria-selected') === 'true' || tab.className.includes('active')
            });
        });

        // Cards / Metric Boxes
        root.querySelectorAll('[class*="Card"], [class*="Paper"], [class*="stat"], [class*="box"]').forEach(card => {
            const text = card.innerText?.trim().replace(/\s+/g, ' ').slice(0, 120);
            if (text && card.children.length > 0 && details.cardsAndWidgets.length < 35) {
                const cs = getComputedStyle(card);
                details.cardsAndWidgets.push({
                    component: card.getAttribute('data-react-component') || 'Card',
                    summaryText: text,
                    bg: cs.backgroundColor,
                    radius: cs.borderRadius,
                    size: rectStr(card)
                });
            }
        });

        // Tables
        root.querySelectorAll('table, [role="grid"], [class*="Table"]').forEach(tbl => {
            const headers = Array.from(tbl.querySelectorAll('th, [role="columnheader"]')).map(th => th.innerText.trim());
            const rowCount = tbl.querySelectorAll('tr, [role="row"]').length;
            if (headers.length > 0 || rowCount > 0) {
                details.tables.push({ columns: headers, rowsCount: rowCount, size: rectStr(tbl) });
            }
        });

        // Charts (Canvas / SVG Charts)
        root.querySelectorAll('canvas, .recharts-wrapper, [class*="chart"], [class*="Chart"]').forEach(ch => {
            details.chartsAndCanvas.push({ type: ch.tagName, classes: ch.className?.baseVal || ch.className, size: rectStr(ch) });
        });

        return details;
    }

    window.addEventListener('message', (e) => {
        if (!e.data) return;
        if (e.data.type === "SR_V7_RUN_PASSPORT") {
            generateSitePassport();
        } else if (e.data.type === "SR_V7_SCAN_ELEMENTS") {
            const micro = scanViewMicroElements(e.data.selector);
            window.postMessage({ type: "SR_V7_ELEMENTS_RESULT", payload: micro, reqId: e.data.reqId }, "*");
        }
    });

    // Hook SPA Router
    const wrap = (m) => {
        const orig = history[m];
        return function(...args) {
            const r = orig.apply(this, args);
            window.postMessage({ type: "SR_V7_ROUTE_CHANGE", path: location.pathname }, "*");
            setTimeout(generateSitePassport, 400);
            return r;
        };
    };
    history.pushState = wrap('pushState');
    history.replaceState = wrap('replaceState');
    window.addEventListener('popstate', () => window.postMessage({ type: "SR_V7_ROUTE_CHANGE", path: location.pathname }, "*"));

    setTimeout(generateSitePassport, 700);
    window.addEventListener('click', () => setTimeout(generateSitePassport, 400));
})();
