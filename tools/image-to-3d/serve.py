"""
Run Depth Studio locally: fetch the depth model and the ONNX runtime once, then serve the page.

    python3 serve.py               # prepare (first run only) and serve on http://localhost:8000
    python3 serve.py --port 9000
    python3 serve.py --prepare     # only download and split the model, then exit

The model is Depth Anything V2 Small (Apache-2.0), int8-quantised ONNX from onnx-community on Hugging Face.
It is split into two parts so each stays under the artifact host's 15 MB per-file limit; the page joins them.
The parts carry a .wasm extension only because that is a binary type the artifact host serves; they are raw ONNX bytes.
Downloads land next to this file in model/ and ort/, which git ignores.
"""

import argparse
import hashlib
import http.server
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))

MODEL_URL = 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx'
MODEL_SHA256 = 'fcf51f1b230362b28690bb9d1809bf0431f29cad20534e3f589bd7285547f20d'
MODEL_PARTS = ['model/depth-anything-v2-small-q8.part1.wasm', 'model/depth-anything-v2-small-q8.part2.wasm']

# Must match the onnxruntime-web version the page imports.
ORT_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort-wasm-simd-threaded.wasm'
ORT_PATH = 'ort/ort-wasm-simd-threaded.wasm'


def download(url):
    print(f'downloading {url}', flush=True)
    with urllib.request.urlopen(url) as r:
        return r.read()


def prepare():
    parts = [os.path.join(HERE, p) for p in MODEL_PARTS]
    if not all(os.path.exists(p) for p in parts):
        data = download(MODEL_URL)
        digest = hashlib.sha256(data).hexdigest()
        if digest != MODEL_SHA256:
            sys.exit(f'model checksum mismatch: got {digest}')
        half = (len(data) + 1) // 2
        os.makedirs(os.path.dirname(parts[0]), exist_ok=True)
        for i, p in enumerate(parts):
            with open(p, 'wb') as f:
                f.write(data[i * half:(i + 1) * half])
        print(f'model: {len(data) / 1e6:.1f} MB in {len(parts)} parts', flush=True)
    ort = os.path.join(HERE, ORT_PATH)
    if not os.path.exists(ort):
        data = download(ORT_URL)
        os.makedirs(os.path.dirname(ort), exist_ok=True)
        with open(ort, 'wb') as f:
            f.write(data)
        print(f'runtime: {len(data) / 1e6:.1f} MB', flush=True)


# index.html is written for the claude.ai artifact host, which adds the document skeleton at publish time.
# Locally we add the same skeleton so the page renders in standards mode.
SKELETON = ('<!doctype html><html><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<style>body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}'
            '[hidden]{display:none!important}</style></head><body>')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=HERE, **kw)

    def do_GET(self):
        if self.path.split('?')[0] in ('/', '/index.html'):
            with open(os.path.join(HERE, 'index.html'), 'rb') as f:
                body = SKELETON.encode() + f.read() + b'</body></html>'
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8000)
    ap.add_argument('--prepare', action='store_true', help='download the model and runtime, then exit')
    args = ap.parse_args()
    prepare()
    if args.prepare:
        return
    print(f'Depth Studio on http://localhost:{args.port}', flush=True)
    http.server.ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
