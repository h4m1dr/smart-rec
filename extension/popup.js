let activeTab = null;
let currentHost = "";

document.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.pane').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        document.getElementById(t.getAttribute('data-target')).classList.add('active');
    };
});

async function init() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab;

    const st = await chrome.storage.local.get(['sitesRegistry', 'whitelistedHosts', 'customWorkspaceName']);
    renderReg(st.sitesRegistry || {}, st.whitelistedHosts || []);
    if (st.customWorkspaceName) document.getElementById('path-display').textContent = `Custom: ${st.customWorkspaceName}`;

    if (!tab || !tab.url || !tab.url.startsWith('http')) {
        document.getElementById('cur-domain').textContent = "Local Tab";
        document.getElementById('btn-toggle-site').disabled = true;
        return;
    }
    currentHost = new URL(tab.url).hostname;
    document.getElementById('cur-domain').textContent = currentHost;

    const isWl = (st.whitelistedHosts || []).includes(currentHost);
    const btn = document.getElementById('btn-toggle-site');
    const stEl = document.getElementById('domain-state');
    if (isWl) {
        stEl.innerHTML = '<span style="color:#10b981">✅ Active</span>';
        btn.textContent = "Disable / Hide Panel";
        btn.style.background = "#ef4444";
        btn.style.color = "#fff";
    } else {
        stEl.innerHTML = '<span style="color:#94a3b8">⏸ Standby</span>';
        btn.textContent = "🔍 Enable & Open Panel";
        btn.style.background = "#38bdf8";
        btn.style.color = "#0f172a";
    }
}

function renderReg(reg, wl) {
    const box = document.getElementById('registry-list');
    const hosts = Object.keys(reg || {});
    if (!hosts.length) { box.innerHTML = '<div style="color:#64748b;padding:4px;">No sites saved.</div>'; return; }
    box.innerHTML = hosts.map(h => `
        <div class="site-row">
            <div><b>${h}</b> (${reg[h].reactComponentsCount || 0} comps)</div>
            <button data-del="${h}" style="background:#1e293b;color:#f87171;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;">✕</button>
        </div>
    `).join('');

    box.querySelectorAll('button[data-del]').forEach(b => {
        b.onclick = async () => {
            const h = b.getAttribute('data-del');
            const s = await chrome.storage.local.get(['sitesRegistry', 'whitelistedHosts']);
            const r = s.sitesRegistry || {}; delete r[h];
            const w = (s.whitelistedHosts || []).filter(x => x !== h);
            await chrome.storage.local.set({ sitesRegistry: r, whitelistedHosts: w });
            renderReg(r, w);
        };
    });
}

document.getElementById('btn-toggle-site').onclick = async () => {
    if (!currentHost) return;
    const st = await chrome.storage.local.get(['whitelistedHosts']);
    let wl = st.whitelistedHosts || [];
    if (wl.includes(currentHost)) {
        wl = wl.filter(x => x !== currentHost);
        await chrome.storage.local.set({ whitelistedHosts: wl });
        if (activeTab?.id) chrome.tabs.sendMessage(activeTab.id, { action: "HIDE_WIDGET" }).catch(() => {});
    } else {
        wl.push(currentHost);
        await chrome.storage.local.set({ whitelistedHosts: wl });
        if (activeTab?.id) chrome.tabs.sendMessage(activeTab.id, { action: "SHOW_WIDGET" }).catch(() => {});
    }
    window.close();
};

document.getElementById('btn-change-path').onclick = async () => {
    try {
        const dir = await window.showDirectoryPicker({ mode: "readwrite" });
        await chrome.storage.local.set({ customWorkspaceName: dir.name });
        document.getElementById('path-display').textContent = `Custom: ${dir.name}`;
        alert("Workspace directory updated!");
    } catch (_) {}
};

document.getElementById('btn-backup').onclick = async () => {
    const st = await chrome.storage.local.get(['sitesRegistry', 'whitelistedHosts']);
    const blob = new Blob([JSON.stringify(st, null, 2)], { type: "application/json" });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = "smart_rec_comprehensive_backup.json"; a.click();
};

document.getElementById('btn-restore').onclick = () => document.getElementById('inp-file').click();
document.getElementById('inp-file').onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async evt => {
        try {
            const data = JSON.parse(evt.target.result);
            await chrome.storage.local.set(data);
            renderReg(data.sitesRegistry || {}, data.whitelistedHosts || []);
            alert("Backup restored successfully!");
        } catch (_) { alert("Invalid backup file!"); }
    };
    reader.readAsText(file);
};

document.getElementById('btn-github-upd').onclick = async () => {
    const btn = document.getElementById('btn-github-upd');
    btn.textContent = "⏳ Downloading ZIP from GitHub...";
    const res = await chrome.runtime.sendMessage({ type: "SR_DOWNLOAD_GITHUB_ZIP" });
    btn.textContent = res?.ok ? "✅ Downloaded to Downloads folder!" : "❌ Download failed";
    setTimeout(() => btn.textContent = "🚀 Download Latest from GitHub", 3000);
};

document.addEventListener('DOMContentLoaded', init);
