import json
import os
import glob
import re
from http.server import HTTPServer, BaseHTTPRequestHandler

OUTPUT_DIR = "cloned_panel"
PORT = 8765

def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[^a-zA-Z0-9_\u0600-\u06FF\-]', '_', name)
    cleaned = re.sub(r'_+', '_', cleaned).strip('_')
    return cleaned[:80] or "unnamed"

def merge_css_rules(css_file_path: str, new_rules: list) -> int:
    existing_content = ""
    if os.path.exists(css_file_path):
        with open(css_file_path, "r", encoding="utf-8") as f:
            existing_content = f.read()

    added_count = 0
    with open(css_file_path, "a", encoding="utf-8") as f:
        for rule in new_rules:
            rule_str = rule.strip()
            if rule_str and rule_str not in existing_content:
                f.write(rule_str + "\n")
                existing_content += rule_str + "\n"
                added_count += 1
    return added_count

def process_bundle_data(data: dict, output_dir: str = OUTPUT_DIR) -> dict:
    pages_dir = os.path.join(output_dir, "templates", "pages")
    modals_dir = os.path.join(output_dir, "templates", "modals")
    icons_dir = os.path.join(output_dir, "static", "icons")
    static_dir = os.path.join(output_dir, "static")

    for d in [pages_dir, modals_dir, icons_dir, static_dir]:
        os.makedirs(d, exist_ok=True)

    # 1. Incremental CSS Merge
    css_bundle_path = os.path.join(static_dir, "mupra_bundle.css")
    added_css = merge_css_rules(css_bundle_path, data.get("cssRules", []))

    # 2. Preserve user custom files
    custom_css = os.path.join(static_dir, "custom.css")
    if not os.path.exists(custom_css):
        with open(custom_css, "w", encoding="utf-8") as f:
            f.write("/* Manual CSS overrides - Safe from Builder overwrites */\n")

    custom_js = os.path.join(static_dir, "app.js")
    if not os.path.exists(custom_js):
        with open(custom_js, "w", encoding="utf-8") as f:
            f.write("// Custom router and UI logic - Safe from Builder overwrites\n")

    # 3. Base Layout Shell
    layout_path = os.path.join(output_dir, "templates", "layout.html")
    if data.get("layoutShell") and not os.path.exists(layout_path):
        layout_html = f"""<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloned WebUI</title>
    <link rel="stylesheet" href="../static/mupra_bundle.css">
    <link rel="stylesheet" href="../static/custom.css">
</head>
<body>
    {data.get("layoutShell")}
    <script src="../static/app.js"></script>
</body>
</html>"""
        with open(layout_path, "w", encoding="utf-8") as f:
            f.write(layout_html)

    # 4. Write / Overwrite Pages
    pages = data.get("pages", {})
    updated_pages = []
    for key, page_obj in pages.items():
        safe_name = sanitize_filename(key)
        file_path = os.path.join(pages_dir, f"{safe_name}.html")
        html_body = page_obj.get("html", "") if isinstance(page_obj, dict) else str(page_obj)
        header_comment = f"<!-- SOURCE URL: {page_obj.get('url', '')} | SYNCED: {page_obj.get('capturedAt', '')} -->\n"
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(header_comment + html_body)
        updated_pages.append(f"{safe_name}.html")

    # 5. Write / Overwrite Modals
    modals = data.get("modals", {})
    updated_modals = []
    for key, modal_obj in modals.items():
        safe_name = sanitize_filename(key)
        file_path = os.path.join(modals_dir, f"{safe_name}.html")
        html_body = modal_obj.get("html", "") if isinstance(modal_obj, dict) else str(modal_obj)
        header_comment = f"<!-- MODAL SOURCE: {modal_obj.get('path', '')} | SYNCED: {modal_obj.get('capturedAt', '')} -->\n"
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(header_comment + html_body)
        updated_modals.append(f"{safe_name}.html")

    # 6. Write Unique SVGs
    svgs = data.get("svgs", {})
    for idx, (hash_key, svg_obj) in enumerate(svgs.items()):
        name_hint = sanitize_filename(svg_obj.get("name", "icon"))
        svg_path = os.path.join(icons_dir, f"{name_hint}_{idx}.svg")
        if not os.path.exists(svg_path):
            with open(svg_path, "w", encoding="utf-8") as f:
                f.write(svg_obj.get("html", ""))

    # 7. Merge API Discovery Log
    arch_path = os.path.join(output_dir, "api_schema_log.json")
    existing_apis = []
    if os.path.exists(arch_path):
        try:
            with open(arch_path, "r", encoding="utf-8") as f:
                existing_apis = json.load(f).get("apiEndpoints", [])
        except Exception:
            pass

    seen_endpoints = {(a.get("method"), a.get("url")) for a in existing_apis}
    for api in data.get("apiEndpoints", []):
        sig = (api.get("method"), api.get("url"))
        if sig not in seen_endpoints:
            seen_endpoints.add(sig)
            existing_apis.append(api)

    with open(arch_path, "w", encoding="utf-8") as f:
        json.dump({
            "domain": data.get("domain"),
            "techStack": data.get("techStack"),
            "totalEndpointsDiscovered": len(existing_apis),
            "apiEndpoints": existing_apis
        }, f, ensure_ascii=False, indent=2)

    summary = {
        "addedCssRules": added_css,
        "updatedPages": updated_pages,
        "updatedModals": updated_modals,
        "totalApis": len(existing_apis)
    }
    print(f"[+] Sync Complete -> Pages: {len(updated_pages)} | Modals: {len(updated_modals)} | New CSS: {added_css}")
    return summary

class SyncHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self._send_cors_headers()
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        html = "<h3>⚡ Smart-Rec Live Sync Server is Running!</h3><p>Extension is connected and ready to sync states.</p>"
        self.wfile.write(html.encode("utf-8"))

    def do_POST(self):
        if self.path == "/sync":
            length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(length).decode("utf-8")
            try:
                data = json.loads(raw_body)
                summary = process_bundle_data(data)
                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "summary": summary}).encode("utf-8"))
            except Exception as e:
                print(f"[!] Sync Error: {e}")
                self.send_response(500)
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        return  # Keep terminal output clean

if __name__ == "__main__":
    bundles = sorted(glob.glob("smart_rec_*.json"), key=os.path.getmtime, reverse=True)
    if bundles:
        print(f"[*] Found local JSON bundle: {bundles[0]}")
        with open(bundles[0], "r", encoding="utf-8") as f:
            process_bundle_data(json.load(f))

    print(f"[*] Live Sync Daemon listening on http://127.0.0.1:{PORT}/sync")
    print("[*] Ready! Click 'Sync to Disk' or 'Patch View' inside Chrome.")
    server = HTTPServer(("127.0.0.1", PORT), SyncHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Stopping Live Sync Daemon.")
