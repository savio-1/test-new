"""Bundle Powergrade into one self-contained HTML file (CSS and JS inlined).

Usage: python3 tools/build_artifact.py [out_path] [--embed-3d | --embed-hdr]

The output has no <html>/<head>/<body> wrapper, so it can be published as a
claude.ai Artifact; open index.html over http for local use.

- Classic scripts are concatenated into one <script>.
- The import map (three.js from cdn.jsdelivr.net) is kept, and each
  <script type="module" src=...> (js/studio3d.js) is inlined as <script type="module">.
- Studio3D loads its HDRIs and surface textures from assets/3d/ relative to the page,
  so publish that folder next to the page (as artifact files), or pass --embed-3d to
  inline them as data URIs (adds about 10 MB; the page limit is 16 MB).
"""
import base64
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
args = [a for a in sys.argv[1:] if not a.startswith("--")]
embed_3d = "--embed-3d" in sys.argv
# Artifact hosting does not serve .hdr files, so --embed-hdr inlines only the HDRIs and the
# JPG textures are published as ordinary files next to the page.
embed_hdr = "--embed-hdr" in sys.argv
out = Path(args[0]) if args else ROOT / "dist" / "powergrade.html"

html = (ROOT / "index.html").read_text()
css = (ROOT / "css" / "app.css").read_text()


def safe(js):
    return js.replace("</script", "<\\/script")


scripts = re.findall(r'<script src="([^"]+)"></script>', html)
js = safe("\n".join((ROOT / s).read_text() for s in scripts))
modules = re.findall(r'<script type="module" src="([^"]+)"></script>', html)
importmap = re.search(r'<script type="importmap">.*?</script>', html, re.S)
body = re.search(r"<body>(.*?)<script", html, re.S).group(1).strip()

assets = ""
if (embed_3d or embed_hdr) and modules:
    mime = {".hdr": "application/octet-stream", ".jpg": "image/jpeg", ".png": "image/png"}
    urls = {}
    for f in sorted((ROOT / "assets" / "3d").iterdir()):
        if f.suffix in mime and (embed_3d or f.suffix == ".hdr"):
            urls[f.name] = f"data:{mime[f.suffix]};base64," + base64.b64encode(f.read_bytes()).decode()
    entries = ",\n".join(f'"{k}":"{v}"' for k, v in urls.items())
    assets = f"<script>\nwindow.PG_STUDIO3D_ASSET_URLS = {{\n{entries}\n}};\n</script>\n"

page = (
    "<title>Powergrade Studio</title>\n"
    + (importmap.group(0) + "\n" if importmap else "")
    + f"<style>\n{css}\n</style>\n"
    + f"{body}\n"
    + f"<script>\n{js}\n</script>\n"
    + assets
    + "".join(f'<script type="module">\n{safe((ROOT / m).read_text())}\n</script>\n' for m in modules)
)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(page)
print(f"wrote {out} ({len(page) // 1024} KB; {len(modules)} module(s){', 3D assets embedded' if assets else ''})")
