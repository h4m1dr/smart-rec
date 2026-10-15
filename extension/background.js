chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "SR_RELOAD_EXTENSION") {
        chrome.runtime.reload();
    }
});
