chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;

    if (msg.type === "SR_CAPTURE_SCREENSHOT") {
        chrome.tabs.captureVisibleTab(sender.tab ? sender.tab.windowId : null, { format: "png" }, (dataUrl) => {
            if (chrome.runtime.lastError || !dataUrl) {
                sendResponse({ ok: false, error: chrome.runtime.lastError?.message || "Screenshot failed" });
            } else {
                sendResponse({ ok: true, dataUrl });
            }
        });
        return true;
    }

    if (msg.type === "SR_ENSURE_INJECTED" && msg.tabId) {
        chrome.scripting.executeScript({
            target: { tabId: msg.tabId },
            files: ["content.js"]
        }).then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }
});
