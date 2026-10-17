let activeTab = null;
let currentHost = "";

async function ensureContentScriptAndSend(action) {
    if (!activeTab || !activeTab.id) return null;
    try {
        return await chrome.tabs.sendMessage(activeTab.id, { action });
    } catch (err) {
        // Automatically inject content.js so user NEVER sees "Please refresh F5"!
        await chrome.runtime.sendMessage({ type: "SR_ENSURE_INJECTED", tabId: activeTab.id });
        await new Promise(r => setTimeout(r, 350));
        try {
            return await chrome.tabs.sendMessage(activeTab.id, { action });
        } catch (e2) {
            return null;
        }
    }
}

function renderRegistry(registryObj) {
    const container = document.getElementById('registry-list');
    const hosts = Object.keys(registryObj || {});
    if (hosts.length === 0) {
        container.innerHTML = '<div style="color:#64748b;padding:6px;">No sites analyzed yet.</div>';
        return;
    }

    container.innerHTML = hosts.map(host => {
        const p = registryObj[host];
        const allTech = [
            ...(p.technologies?.frameworks || []),
            ...(p.technologies?.uiLibraries || []),
            ...(p.technologies?.cssEngines || []),
            ...(p.technologies?.jsUtilities || [])
        ];
        const tagsHtml = allTech.map(t => `<span class="tag">${t}</span>`).join('');
        return `
            <div class="site-card">
                <div>
                    <strong style="color:#fff;">${host}</strong>
                    <span style="color:#64748b;font-size:9px;">(${p.reactComponentsCount || 0} comps)</span><br>
                    ${tagsHtml || '<span class="tag">Standard Web</span>'}
                </div>
                <button data-remove="${host}" style="background:#334155;color:#f87171;border:none;padding:3px 6px;border-radius:4px;cursor:pointer;font-size:10px;">✕</button>
            </div>
        `;
    }).join('');

    container.querySelectorAll('button[data-remove]').forEach(btn => {
        btn.onclick = async () => {
            const h = btn.getAttribute('data-remove');
            const store = await chrome.storage.local.get(['sitesRegistry', 'whitelistedHosts']);
            const reg = store.sitesRegistry || {};
            delete reg[h];
            const wl = (store.whitelistedHosts || []).filter(x => x !== h);
            await chrome.storage.local.set({ sitesRegistry: reg, whitelistedHosts: wl });
            renderRegistry(reg);
            if (h === currentHost && activeTab) {
                chrome.tabs.sendMessage(activeTab.id, { action: "HIDE_WIDGET" }).catch(() => {});
            }
        };
    });
}

async function init() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab;

    const store = await chrome.storage.local.get(['sitesRegistry']);
    const reg = store.sitesRegistry || {};
    renderRegistry(reg);

    if (!tab || !tab.url || !tab.url.startsWith('http')) {
        document.getElementById('cur-domain').textContent = "Local / System Tab";
        document.getElementById('btn-analyze').disabled = true;
        document.getElementById('btn-analyze').style.opacity = "0.4";
        return;
    }

    currentHost = new URL(tab.url).hostname;
    document.getElementById('cur-domain').textContent = currentHost;

    if (reg[currentHost]) {
        const p = reg[currentHost];
        document.getElementById('passport-preview').innerHTML = `✅ Passport Saved (${p.reactComponentsCount} React comps, ${p.navigationTree?.length || 0} routes)`;
    }
}

document.getElementById('btn-analyze').onclick = async () => {
    if (!currentHost) return;
    document.getElementById('passport-preview').innerHTML = '<span style="color:#38bdf8">Scanning site & opening on-page widget...</span>';

    const store = await chrome.storage.local.get(['whitelistedHosts', 'sitesRegistry']);
    const wl = new Set(store.whitelistedHosts || []);
    wl.add(currentHost);
    await chrome.storage.local.set({ whitelistedHosts: Array.from(wl) });

    const res = await ensureContentScriptAndSend("ANALYZE_AND_SHOW_WIDGET");
    if (res && res.passport) {
        const reg = store.sitesRegistry || {};
        reg[currentHost] = res.passport;
        await chrome.storage.local.set({ sitesRegistry: reg });
        renderRegistry(reg);
        document.getElementById('passport-preview').innerHTML = `✅ Passport Updated! Widget is now open on the page.`;
    }
};

document.getElementById('btn-export-reg').onclick = async () => {
    const store = await chrome.storage.local.get(['sitesRegistry']);
    const blob = new Blob([JSON.stringify(store.sitesRegistry || {}, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart_rec_sites_registry_backup.json`;
    a.click();
};

document.addEventListener('DOMContentLoaded', init);
