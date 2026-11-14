# Car Factory Tycoon — © 2026 Brakeco Games. All rights reserved.
"""Bundelt het spel tot één HTML-bestand (alle CSS en JS inline).
Gebruik: python3 tools/build-single.py  ->  dist/car-factory-tycoon.html (+ dist/artifact.html)"""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'css/style.css').read_text(encoding='utf-8')
css += "\n:root { color-scheme: dark; }\n#app { top: env(safe-area-inset-top, 0px); bottom: env(safe-area-inset-bottom, 0px); }\n"
html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '\n</style>')
html = re.sub(r'\s*<link rel="icon"[^>]*>', '', html)
def inline(m):
    js = (root / m.group(1)).read_text(encoding='utf-8').replace('</script', '<\\/script')
    return '<script>\n' + js + '\n</script>'
# artifact-versie laadt three.js van een CDN; het losse bestand heeft alles inline
THREE_TAG = '<script src="js/three.min.js"></script>'
THREE_CDN = '<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>'
html_cdn = re.sub(r'<script src="(js/[^"]+)"></script>', inline, html.replace(THREE_TAG, '@@THREE@@')).replace('@@THREE@@', THREE_CDN)
html = re.sub(r'<script src="(js/[^"]+)"></script>', inline, html)
out = root / 'dist'; out.mkdir(exist_ok=True)
(out / 'car-factory-tycoon.html').write_text(html, encoding='utf-8')
# artifact-versie: zonder doctype/html/head/body (wordt door de host toegevoegd)
art = re.sub(r'<!DOCTYPE html>\s*|</?html[^>]*>|</?head>|</?body>', '', html_cdn)
art = re.sub(r'\s*<meta charset="utf-8">|\s*<meta name="viewport"[^>]*>|\s*<meta name="theme-color"[^>]*>', '', art)
title = re.search(r'<title>.*?</title>', art).group(0)
NOTICE = '<!-- Car Factory Tycoon — © 2026 Brakeco Games. All rights reserved. -->'
art = title + '\n' + NOTICE + '\n' + art.replace(title, '', 1).replace(NOTICE, '', 1).lstrip()
(out / 'artifact.html').write_text(art, encoding='utf-8')
print('ok', len(html), len(art))
