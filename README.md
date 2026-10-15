
# ⚡ Smart-Rec — React/MUI SPA State Harvester

An automated Chrome Extension and Local Live-Sync Daemon designed to reverse-engineer and clone complex React / Material-UI (Emotion CSS-in-JS) single-page applications into clean, modular HTML/CSS templates.

---

## 🚀 Quick Install & Auto-Update

> **Note:** Due to Chrome Manifest V3 security policies, unpacked developer extensions cannot be installed directly via a web URL click. Use one of the two fast methods below:

[![Download ZIP](https://img.shields.io/badge/⬇_Download_Latest_Release-ZIP-2ea44f?style=for-the-badge)](../../archive/refs/heads/main.zip)
[![Launch Script](https://img.shields.io/badge/⚡_One_Click_Launcher-run__smart__rec.bat-007ec6?style=for-the-badge)](#method-1-one-click-launcher-windows)

### Method 1: One-Click Launcher (Windows)
1. Clone this repository once:
```bash
   git clone [https://github.com/YOUR_USERNAME/smart-rec.git](https://github.com/YOUR_USERNAME/smart-rec.git)

```

2. Double-click **`run_smart_rec.bat`**.
* It automatically pulls the latest changes from GitHub (`git pull`).
* Launches Chrome with the `extension/` folder pre-loaded.
* Starts the local Python Live-Sync server on `http://127.0.0.1:8765`.



### Method 2: Drag & Drop Installation (30 Seconds)

1. Copy and paste this address into your Chrome address bar:
```text
chrome://extensions

```


2. Enable **Developer mode** (toggle in the top-right corner).
3. Drag and drop the **`extension`** folder directly onto the page (or click **Load unpacked** and select the `extension` folder).

---

## 🔄 How to Update After Fixing Bugs (Zero Re-install)

Because Chrome links directly to your local `extension/` folder, **you never need to reinstall the extension**:

1. Edit the code or run `git pull` to get the latest updates.
2. Inside your target web page, click the **`🔄 Reload Ext`** button on the top-right of the Smart-Rec floating panel.
3. The extension will instantly reload its background worker and refresh the page with the new code.

---

## 🛠️ Panel Controls & Features

| Button | Action | Description |
| --- | --- | --- |
| **`▶ Start Recording`** | Auto-Capture | Activates `MutationObserver` & History API hooks to record views and modals automatically as you click around. |
| **`📸 Snap`** | Manual Capture | Forces an immediate snapshot of the current DOM & CSSOM state. |
| **`🤖 Tabs`** | In-Page Crawler | Automatically clicks through all tabs/switches on the current page and records each view. |
| **`🗑️ Undo`** | Revert State | Removes the last captured page or modal from memory if clicked by mistake. |
| **`🛠️ Patch View`** | Instant Hotfix | Overwrites **only** the currently visible page or open modal directly onto your local disk via the Python server. |
| **`🔄 Sync to Disk`** | Full Live Sync | Pushes all captured pages, modals, SVGs, CSSOM rules, and API logs directly to `cloned_panel/`. |
| **`🔄 Reload Ext`** | Hot Reload | Reloads the Chrome extension itself after code modifications. |

---

## 📂 Output Architecture (`cloned_panel/`)

When you click **`Sync to Disk`** or **`Patch View`**, `builder.py` generates and incrementally updates the following modular structure without touching your custom edits:

```text
cloned_panel/
├── api_schema_log.json          # Captured Fetch/XHR requests & sample JSON responses
├── static/
│   ├── mupra_bundle.css         # Incremental CSSOM dump (includes dynamic Emotion/MUI styles)
│   ├── custom.css               # Safe file for your manual CSS overrides (never overwritten)
│   ├── app.js                   # Safe file for your custom JS router (never overwritten)
│   └── icons/                   # Extracted unique SVG icons
└── templates/
    ├── layout.html              # Main shell (Header + Sidebar)
    ├── pages/                   # Individual HTML files for each route/tab
    └── modals/                  # Isolated HTML files for each Drawer, Dialog, and Popover

```
