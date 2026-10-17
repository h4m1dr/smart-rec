let activeTab = null;
let currentHost = "";

async function sendToTab(action) {
    if (!activeTab || !activeTab.id) return null;
    try {
        return await chrome.tabs.sendMessage(activeTab.id, { action });
    } catch (e) {
        document.getElementById('wl-status').innerHTML = '<span style="color:#f59e0b">Please refresh (F5) this tab once!</span>';
        return null;
    }
}

function renderState(state) {
    if (!state) return;
    document.getElementById('status-badge').textContent = state.isRunning ? 'REC' : 'READY';
    document.getElementById('status-badge').style.background = state.isRunning ? '#ef4444' : '#10b981';
    document.getElementById('stack-info').innerHTML = `
        Engine: <b style="color:#38bdf8">${state.engine}</b> (${state.compCount} comps)<br>
        Styling: <b style="color:#fff">${state.uiLib}</b> | Rules: <b>${state.cssRulesCount || 0}</b>
    `;
    document.getElementById('p-count').textContent = state.pagesCount || 0;
    document.getElementById('m-count').textContent = state.modalsCount || 0;
    document.getElementById('log').textContent = state.lastLog || 'Ready';

    document.getElementById('init-view').style.display = state.isRunning ? 'none' : 'block';
    document.getElementById('active-view').style.display = state.isRunning ? 'block' : 'none';
}

async function init() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab;

    if (!tab || !tab.url || !tab.url.startsWith('http')) {
        document.getElementById('cur-domain').textContent = "Local / Browser Page";
        document.getElementById('wl-status').textContent = "Disabled on local file:/// and chrome:// pages.";
        document.getElementById('btn-toggle-wl').style.display = 'none';
        return;
    }

    currentHost = new URL(tab.url).hostname;
    document.getElementById('cur-domain').textContent = currentHost;

    const store = await chrome.storage.local.get(['whitelistedHosts', 'geminiApiKey']);
    const list = store.whitelistedHosts || [];
    if (store.geminiApiKey) document.getElementById('api-key').value = store.geminiApiKey;

    updateWhitelistUI(list);
}

async function updateWhitelistUI(list) {
    const isEnabled = list.includes(currentHost);
    const btn = document.getElementById('btn-toggle-wl');
    const sec = document.getElementById('controls-section');
    const st = document.getElementById('wl-status');

    document.getElementById('wl-list').innerHTML = list.length ? list.map(h => `<div>• ${h}</div>`).join('') : 'No sites added yet.';

    if (isEnabled) {
        st.innerHTML = '<span style="color:#10b981">✅ Whitelisted & Active</span>';
        btn.textContent = "🚫 Remove Site from Whitelist";
        btn.style.background = "#475569";
        btn.style.color = "#fff";
        sec.style.display = 'block';
        const res = await sendToTab('GET_STATE');
        renderState(res);
    } else {
        st.innerHTML = '<span style="color:#94a3b8">⏸ Not active on this site</span>';
        btn.textContent = "🔍 Analyze & Add Site to Whitelist";
        btn.style.background = "#38bdf8";
        btn.style.color = "#0f172a";
        sec.style.display = 'none';
    }
}

document.getElementById('btn-toggle-wl').onclick = async () => {
    if (!currentHost) return;
    const store = await chrome.storage.local.get(['whitelistedHosts']);
    let list = store.whitelistedHosts || [];

    if (list.includes(currentHost)) {
        list = list.filter(h => h !== currentHost);
        await chrome.storage.local.set({ whitelistedHosts: list });
        await sendToTab('DISABLE_ON_SITE');
        updateWhitelistUI(list);
    } else {
        list.push(currentHost);
        await chrome.storage.local.set({ whitelistedHosts: list });
        const res = await sendToTab('ENABLE_AND_ANALYZE');
        updateWhitelistUI(list);
        renderState(res);
    }
};

document.getElementById('btn-fresh').onclick = async () => {
    await sendToTab('START_FRESH');
    window.close();
};

document.getElementById('btn-continue').onclick = async () => {
    await sendToTab('CONTINUE_EXISTING');
    window.close();
};

document.getElementById('btn-save').onclick = async () => {
    renderState(await sendToTab('SAVE_NOW'));
};

document.getElementById('btn-stop').onclick = async () => {
    renderState(await sendToTab('STOP'));
};

document.getElementById('btn-save-key').onclick = async () => {
    const k = document.getElementById('api-key').value.trim();
    await chrome.storage.local.set({ geminiApiKey: k });
    const b = document.getElementById('btn-save-key');
    b.textContent = "✅ Saved!";
    setTimeout(() => b.textContent = "💾 Save AI Key", 1200);
};

document.addEventListener('DOMContentLoaded', init);
