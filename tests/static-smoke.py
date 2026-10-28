"""FogOS offline/static package sanity checks; standard-library only."""
from __future__ import annotations
import json
import re
import shutil
import subprocess
import threading
import urllib.request
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
HTML = SITE / "index.html"
JS = SITE / "app.js"

class ParsedHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids: list[str] = []
        self.resources: list[str] = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            self.ids.append(attrs["id"])
        for attr in ("src", "href"):
            value = attrs.get(attr, "")
            if value.startswith("./"):
                self.resources.append(value)

parser = ParsedHTML()
parser.feed(HTML.read_text(encoding="utf-8"))
parser.close()
assert len(parser.ids) == len(set(parser.ids)), "Duplicate HTML id found"
script = JS.read_text(encoding="utf-8")
mentioned_ids = set(re.findall(r"\$\('([^']+)'\)", script))
assert not (mentioned_ids - set(parser.ids)), f"JavaScript references missing IDs: {sorted(mentioned_ids-set(parser.ids))}"
for resource in parser.resources:
    local_path = SITE / resource[2:].split("#", 1)[0]
    if resource in ("./", "./#dashboard", "./#tasks", "./#notes"):
        continue
    assert local_path.exists(), f"Missing local resource: {resource}"
manifest = json.loads((SITE / "manifest.webmanifest").read_text(encoding="utf-8"))
assert manifest["display"] == "standalone"
for icon in manifest["icons"]:
    assert (SITE / icon["src"][2:]).exists(), f"Missing PWA icon: {icon['src']}"
assert JS.stat().st_size > 10000 and (SITE / "styles.css").stat().st_size > 10000
assert (ROOT / ".github/workflows/deploy.yml").exists()
assert (ROOT / "README.md").exists() and (ROOT / "README-EN.md").exists()
if shutil.which("node"):
    subprocess.run(["node", "--check", str(JS)], check=True)

class QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE), **kwargs)
    def log_message(self, *_args):
        pass
server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    base = f"http://127.0.0.1:{server.server_port}"
    for path, content_type in (("/", "text/html"), ("/app.js", "javascript"), ("/styles.css", "text/css"), ("/manifest.webmanifest", "application/manifest+json"), ("/sw.js", "javascript"), ("/assets/icon-192.png", "image/png")):
        with urllib.request.urlopen(base + path, timeout=5) as response:
            body = response.read()
            assert response.status == 200 and body, f"Bad response for {path}"
            assert content_type in response.headers.get("Content-Type", ""), f"Wrong MIME for {path}: {response.headers.get('Content-Type')}"
finally:
    server.shutdown()
    server.server_close()
print("FogOS static smoke checks passed: HTML IDs, JS syntax/references, local assets, PWA manifest/icons, HTTP assets.")
