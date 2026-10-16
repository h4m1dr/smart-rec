chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;

    if (msg.type === "SR_RELOAD_EXTENSION") {
        sendResponse({ ok: true });
        setTimeout(() => chrome.runtime.reload(), 100);
        return true;
    }
});
