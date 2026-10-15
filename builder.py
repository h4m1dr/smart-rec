import json
import os
import glob
import re

def sanitize_filename(name: str) -> str:
    # Keep alphanumeric, underscores, hyphens, and Persian/Arabic chars if present in titles
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

def build_or_update_project(json_path: str, output_dir: str = "cloned_panel"):
    print(f"[*] Reading state bundle: {json_path}")
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    pages_dir = os.path.join(output_dir, "templates", "pages")
    modals_dir = os.path.join(output_dir, "templates", "modals")
    icons_dir = os.path.join(output_dir, "static", "icons")
    static_dir = os.path.join(output_dir, "static")

    for d in [pages_dir, modals_dir, icons_dir, static_dir]:
        os.makedirs(d, exist_ok=True)

    # 1. Incremental CSS Merge
    css_bundle_path = os.path.join(static_dir, "mupra_bundle.css")
    added_css = merge_css_rules(css_bundle_path, data.get("cssRules", []))
    print(f"[+] CSS Bundle updated: {added_css} new rules merged into static/mupra_bundle.css")

    # 2. Preserve user custom files (never overwrite if they already exist)
    custom_css = os.path.join(static_dir, "custom.css")
    if not os.path.exists(custom_css):
        with open(custom_css, "w", encoding="utf-8") as f:
            f.write("/* Put your manual CSS overrides here. Builder will NEVER overwrite this file. */\n")

    custom_js = os.path.join(static_dir, "app.js")
    if not os.path.exists(custom_js):
        with open(custom_js, "w", encoding="utf-8") as f:
            f.write("// Put your custom router and interactivity logic here. Safe from overwrites.\n")

    # 3. Save Base Layout Shell (if captured and not already customized)
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
        print("[+] Base layout shell created at templates/layout.html")

    # 4. Save / Update Modular Pages
    pages = data.get("pages", {})
    for key, page_obj in pages.items():
        safe_name = sanitize_filename(key)
        file_path = os.path.join(pages_dir, f"{safe_name}.html")
        html_body = page_obj.get("html", "") if isinstance(page_obj, dict) else str(page_obj)
        header_comment = f"<!-- SOURCE URL: {page_obj.get('url', '')} | CAPTURED: {page_obj.get('capturedAt', '')} -->\n"
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(header_comment + html_body)
    print(f"[+] Pages synced: {len(pages)} views written to templates/pages/")

    # 5. Save / Update Modals & Drawers
    modals = data.get("modals", {})
    for key, modal_obj in modals.items():
        safe_name = sanitize_filename(key)
        file_path = os.path.join(modals_dir, f"{safe_name}.html")
        html_body = modal_obj.get("html", "") if isinstance(modal_obj, dict) else str(modal_obj)
        header_comment = f"<!-- MODAL SOURCE: {modal_obj.get('path', '')} | CAPTURED: {modal_obj.get('capturedAt', '')} -->\n"
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(header_comment + html_body)
    print(f"[+] Modals synced: {len(modals)} popups/drawers written to templates/modals/")

    # 6. Save Unique SVGs
    svgs = data.get("svgs", {})
    for idx, (hash_key, svg_obj) in enumerate(svgs.items()):
        name_hint = sanitize_filename(svg_obj.get("name", "icon"))
        svg_path = os.path.join(icons_dir, f"{name_hint}_{idx}.svg")
        with open(svg_path, "w", encoding="utf-8") as f:
            f.write(svg_obj.get("html", ""))
    print(f"[+] SVGs synced: {len(svgs)} icons written to static/icons/")

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
    print(f"[+] API Schema updated: {len(existing_apis)} total unique endpoints logged in api_schema_log.json")

if __name__ == "__main__":
    bundles = sorted(glob.glob("smart_rec_*.json"), key=os.path.getmtime, reverse=True)
    if not bundles:
        print("[!] Error: No 'smart_rec_*.json' file found in current directory.")
    else:
        build_or_update_project(bundles[0])
