chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;

    // 1. Capture high-res PNG screenshot of current visible tab
    if (msg.type === "SR_CAPTURE_SCREENSHOT") {
        chrome.tabs.captureVisibleTab(sender.tab ? sender.tab.windowId : null, { format: "png" }, (dataUrl) => {
            if (chrome.runtime.lastError || !dataUrl) {
                sendResponse({ ok: false, error: chrome.runtime.lastError?.message || "Screenshot failed" });
            } else {
                sendResponse({ ok: true, dataUrl });
            }
        });
        return true; // Async response
    }

    // 2. Ensure content.js is injected without requiring manual F5 refresh
    if (msg.type === "SR_ENSURE_INJECTED" && msg.tabId) {
        chrome.scripting.executeScript({
            target: { tabId: msg.tabId },
            files: ["content.js"]
        }).then(() => {
            sendResponse({ ok: true });
        }).catch((err) => {
            sendResponse({ ok: false, error: err.message });
        });
        return true;
    }

    if (msg.type === "SR_RELOAD_EXTENSION") {
        sendResponse({ ok: true });
        setTimeout(() => chrome.runtime.reload(), 100);
        return true;
    }
});
