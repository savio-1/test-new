"""Bundle Powergrade into one self-contained HTML file (CSS and JS inlined).

Usage: python3 tools/build_artifact.py [out_path]

The output has no <html>/<head>/<body> wrapper, so it can be published as a
claude.ai Artifact; open index.html over http for local use.

- Classic scripts are concatenated into one <script>. A script listed in index.html
  that does not exist yet (e.g. a data file still being assembled) is skipped.
- Google Fonts <link> tags from the head are kept.
- Photos (assets/photos/) and mockups (assets/mockups/) are loaded relative to the
  page, so publish those folders next to it as artifact files.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
args = [a for a in sys.argv[1:] if not a.startswith("--")]
out = Path(args[0]) if args else ROOT / "dist" / "powergrade.html"

html = (ROOT / "index.html").read_text()
css = (ROOT / "css" / "app.css").read_text()


def safe(js):
    return js.replace("</script", "<\\/script")


scripts = re.findall(r'<script src="([^"]+)"></script>', html)
present = [s for s in scripts if (ROOT / s).exists()]
skipped = [s for s in scripts if s not in present]
js = safe("\n".join((ROOT / s).read_text() for s in present))
fonts = "\n".join(re.findall(r'<link rel="(?:preconnect|stylesheet)" href="https://fonts\.(?:googleapis|gstatic)\.com[^>]*>', html))
body = re.search(r"<body>(.*?)<script", html, re.S).group(1).strip()

page = (
    "<title>Powergrade Studio</title>\n"
    + (fonts + "\n" if fonts else "")
    + f"<style>\n{css}\n</style>\n"
    + f"{body}\n"
    + f"<script>\n{js}\n</script>\n"
)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(page)
print(f"wrote {out} ({len(page) // 1024} KB, {len(present)} scripts)" + (f"; skipped missing: {', '.join(skipped)}" if skipped else ""))
