"""Merge research/studios-*.json into js/data/studios.js (PG.STUDIOS) for the References → Studios tab.

Usage: python3 tools/build_studios.py
Each research entry: id, name, city, url, philosophy, type{faces,notes}, palette, imagery,
presentation[], signatures[], projects[{client,year,what,url}], layouts[{name,for,recipe}].
"""
import glob, json, os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
studios, seen = [], set()
for path in sorted(glob.glob(os.path.join(root, 'research', 'studios-*.json'))):
    for s in json.load(open(path)):
        if s.get('id') in seen:
            continue
        seen.add(s.get('id'))
        studios.append(s)
studios.sort(key=lambda s: s['name'].lower().lstrip('.'))
out = os.path.join(root, 'js', 'data', 'studios.js')
with open(out, 'w') as f:
    f.write('/* Studio research: how leading identity studios design and present work. Generated from\n'
            '   research/studios-*.json by tools/build_studios.py; the notes per studio are in research/studios/. */\n')
    f.write('window.PG = window.PG || {};\nPG.STUDIOS = ')
    json.dump(studios, f, ensure_ascii=False, indent=0)
    f.write(';\n')
print(len(studios), 'studios →', os.path.relpath(out, root))
