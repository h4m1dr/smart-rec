async function sendCmd(action) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || tab.url.startsWith('chrome://')) {
        document.getElementById('p-tech').innerHTML = '<span style="color:#ef4444">Open your target React app tab (e.g. Mupra) first!</span>';
        return null;
    }
    try {
        return await chrome.tabs.sendMessage(tab.id, { action });
    } catch (e) {
        document.getElementById('p-tech').innerHTML = '<span style="color:#f59e0b">Please refresh (F5) the web page once!</span>';
        return null;
    }
}

function updatePopup(res) {
    if (!res) return;
    const b = document.getElementById('p-badge');
    b.textContent = res.isRecording ? 'REC' : 'IDLE';
    b.style.background = res.isRecording ? '#ef4444' : '#334155';

    document.getElementById('p-tech').innerHTML = `
        Framework: <b style="color:#38bdf8">${res.techStack?.framework || '...'}</b> (${res.componentCount || 0} comps)<br>
        UI Library: <b style="color:#fff">${res.techStack?.uiLibrary || '...'}</b>
    `;
    document.getElementById('p-pages').textContent = res.pagesCount || 0;
    document.getElementById('p-modals').textContent = res.modalsCount || 0;
    document.getElementById('p-apis').textContent = res.apisCount || 0;
    document.getElementById('log').textContent = res.lastLog || 'Ready';

    document.getElementById('p-init').style.display = res.isRecording ? 'none' : 'block';
    document.getElementById('p-active').style.display = res.isRecording ? 'grid' : 'none';
}

document.addEventListener('DOMContentLoaded', async () => {
    updatePopup(await sendCmd('GET_STATE'));
});

document.getElementById('btn-fresh').onclick = async () => {
    await sendCmd('START_FRESH');
    window.close();
};

document.getElementById('btn-cont').onclick = async () => {
    await sendCmd('CONTINUE_EXISTING');
    window.close();
};

document.getElementById('btn-save').onclick = async () => {
    updatePopup(await sendCmd('SAVE_NOW'));
};

document.getElementById('btn-stop').onclick = async () => {
    updatePopup(await sendCmd('STOP'));
};
