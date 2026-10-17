let activeTab = null;
let currentHost = "";

async function sendToTab(action) {
    if (!activeTab || !activeTab.id) return null;
    try {
        return await chrome.tabs.sendMessage(activeTab.id, { action });
    } catch (err) {
        await chrome.runtime.sendMessage({ type: "SR_ENSURE_INJECTED", tabId: activeTab.id });
        await new Promise(r => setTimeout(r, 350));
        try { return await chrome.tabs.sendMessage(activeTab.id, { action }); } catch (_) { return null; }
    }
}

function renderRegistry(reg) {
    const box = document.getElementById('registry-list');
    const hosts = Object.keys(reg || {});
    if (!hosts.length) {
        box.innerHTML = '<div style="color:#64748b;padding:4px;">No sites analyzed yet.</div>';
        return;
    }
    box.innerHTML = hosts.map(h => {
        const p = reg[h];
        const tags = [...(p.technologies?.frameworks || []), ...(p.technologies?.uiLibraries || []), ...(p.technologies?.cssEngines || [])]
            .map(t => `<span class="tag">${t}</span>`).join('');
        return `<div class="site-card">
            <div><b style="color:#fff">${h}</b> (${p.reactComponentsCount || 0} comps)<br>${tags}</div>
            <button data-del="${h}" style="background:#334155;color:#f87171;border:none;padding:3px 6px;border-radius:4px;cursor:pointer;">✕</button>
        </div>`;
    }).join('');

    box.querySelectorAll('button[data-del]').forEach(b => {
        b.onclick = async () => {
            const h = b.getAttribute('data-del');
            const st = await chrome.storage.local.get(['sitesRegistry', 'whitelistedHosts']);
            const r = st.sitesRegistry || {};
            delete r[h];
            const wl = (st.whitelistedHosts || []).filter(x => x !== h);
            await chrome.storage.local.set({ sitesRegistry: r, whitelistedHosts: wl });
            renderRegistry(r);
        };
    });
}

async function init() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab;
    const st = await chrome.storage.local.get(['sitesRegistry', 'geminiApiKey']);
    renderRegistry(st.sitesRegistry || {});
    if (st.geminiApiKey) document.getElementById('inp-token').value = st.geminiApiKey;

    if (!tab || !tab.url || !tab.url.startsWith('http')) {
        document.getElementById('cur-domain').textContent = "Local / System Tab";
        document.getElementById('btn-analyze').disabled = true;
        return;
    }
    currentHost = new URL(tab.url).hostname;
    document.getElementById('cur-domain').textContent = currentHost;
}

document.getElementById('btn-analyze').onclick = async () => {
    if (!currentHost) return;
    const st = await chrome.storage.local.get(['whitelistedHosts', 'sitesRegistry']);
    const wl = new Set(st.whitelistedHosts || []);
    wl.add(currentHost);
    await chrome.storage.local.set({ whitelistedHosts: Array.from(wl) });

    const res = await sendToTab("ANALYZE_AND_SHOW_WIDGET");
    if (res && res.passport) {
        const reg = st.sitesRegistry || {};
        reg[currentHost] = res.passport;
        await chrome.storage.local.set({ sitesRegistry: reg });
        renderRegistry(reg);
    }
    window.close();
};

document.getElementById('btn-save-token').onclick = async () => {
    const key = document.getElementById('inp-token').value.trim();
    await chrome.storage.local.set({ geminiApiKey: key });
    const btn = document.getElementById('btn-save-token');
    btn.textContent = "✅ Token Saved!";
    if (activeTab?.id) chrome.tabs.sendMessage(activeTab.id, { action: "TOKEN_UPDATED" }).catch(() => {});
    setTimeout(() => btn.textContent = "💾 Save AI Token", 1200);
};

document.getElementById('btn-export-reg').onclick = async () => {
    const st = await chrome.storage.local.get(['sitesRegistry']);
    const blob = new Blob([JSON.stringify(st.sitesRegistry || {}, null, 2)], { type: "application/json" });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = "smart_rec_sites_registry.json";
    a.click();
};

document.addEventListener('DOMContentLoaded', init);
