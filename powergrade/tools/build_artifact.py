"""Bundle Powergrade into one self-contained HTML file (CSS and JS inlined).

Usage: python3 tools/build_artifact.py [out_path]
The output has no <html>/<head>/<body> wrapper, so it can be published as a
claude.ai Artifact; open index.html directly for local use.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist" / "powergrade.html"

html = (ROOT / "index.html").read_text()
css = (ROOT / "css" / "app.css").read_text()
scripts = re.findall(r'<script src="([^"]+)"></script>', html)
js = "\n".join((ROOT / s).read_text() for s in scripts).replace("</script", "<\\/script")
body = re.search(r"<body>(.*?)<script", html, re.S).group(1).strip()

page = (
    "<title>Powergrade Studio</title>\n"
    f"<style>\n{css}\n</style>\n"
    f"{body}\n"
    f"<script>\n{js}\n</script>\n"
)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(page)
print(f"wrote {out} ({len(page) // 1024} KB)")
