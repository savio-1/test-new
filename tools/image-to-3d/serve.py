"""
Photo to 3D, the local app: upload a photo in the browser, get a full textured 3D model back, render it photoreal.

    export HF_TOKEN=hf_...          # a Hugging Face read token (huggingface.co/settings/tokens)
    python3 serve.py                # http://localhost:8000
    python3 serve.py --port 9000

Needs: pip install gradio_client          (conversion, see convert.py)
       pip install bpy                    (optional: photoreal Cycles renders, see render.py)

The page (index.html) is the same file that is published as the claude.ai artifact. There it can only view models;
here it finds this server's /api and can convert and render too. Results land in out/<job id>/.
"""

import argparse
import http.server
import json
import os
import re
import subprocess
import sys
import threading
import time
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
sys.path.insert(0, HERE)
import convert as conv  # noqa: E402

JOBS = {}
LOCK = threading.Lock()
MAX_UPLOAD = 40 * 1024 * 1024
IMAGE_EXT = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'}


def has_bpy():
    try:
        import importlib.util
        return importlib.util.find_spec('bpy') is not None
    except Exception:
        return False


def new_job(kind, **extra):
    jid = time.strftime('%Y%m%d-%H%M%S-') + uuid.uuid4().hex[:6]
    job = {'id': jid, 'kind': kind, 'state': 'queued', 'steps': [], 'started': time.time(), 'error': None, **extra}
    with LOCK:
        JOBS[jid] = job
    return job


def step(job, text):
    with LOCK:
        job['state'] = 'running'
        job['steps'].append({'text': text, 't': round(time.time() - job['started'], 1)})


def run_convert(job, image, model, texture, seed):
    out_dir = os.path.join(OUT, job['id'])
    try:
        meta = conv.convert(image, model, out_dir, seed=seed, texture=texture, step=lambda s: step(job, s))
        with LOCK:
            job.update(state='done', meta=meta, glb=f'out/{job["id"]}/model.glb', input=f'out/{job["id"]}/{meta["input"]}')
    except conv.ConvertError as e:
        with LOCK:
            job.update(state='error', error=str(e))


def run_render(job, glb, shots, res, samples):
    out_dir = os.path.join(os.path.dirname(glb), 'renders')
    step(job, f'Rendering {len(shots)} studio shots with Cycles')
    cmd = [sys.executable, os.path.join(HERE, 'render.py'), glb, '--out', out_dir, '--shots', ','.join(shots),
           '--res', str(res), '--samples', str(samples)]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    done = 0
    tail = []
    for line in p.stdout:
        tail = (tail + [line.rstrip()])[-8:]
        if line.strip().endswith('.png'):
            done += 1
            step(job, f'Rendered {done} of {len(shots)}')
    p.wait()
    rel = os.path.relpath(out_dir, HERE).replace(os.sep, '/')
    with LOCK:
        if p.returncode == 0:
            job.update(state='done', images=[f'{rel}/{s}.png?v={int(time.time())}' for s in shots])
        else:
            job.update(state='error', error='Blender stopped: ' + ' / '.join(tail[-3:]))


# index.html is written for the claude.ai artifact host, which adds the document skeleton at publish time.
# Locally we add the same skeleton so the page renders in standards mode.
SKELETON = ('<!doctype html><html><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<style>body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}'
            '[hidden]{display:none!important}</style></head><body>')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=HERE, **kw)

    def log_message(self, fmt, *args):
        if '/api/jobs/' not in (args[0] if args else ''):
            super().log_message(fmt, *args)

    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split('?')[0]
        if path in ('/', '/index.html'):
            with open(os.path.join(HERE, 'index.html'), 'rb') as f:
                body = SKELETON.encode() + f.read() + b'</body></html>'
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == '/api/health':
            return self.send_json({'ok': True, 'token': bool(os.environ.get('HF_TOKEN') or os.environ.get('HUGGING_FACE_HUB_TOKEN')),
                                   'models': conv.MODELS, 'render': has_bpy()})
        m = re.fullmatch(r'/api/jobs/([\w-]+)', path)
        if m:
            with LOCK:
                job = JOBS.get(m.group(1))
                snap = dict(job, elapsed=round(time.time() - job['started'], 1)) if job else None
            return self.send_json(snap or {'error': 'no such job'}, 200 if snap else 404)
        super().do_GET()

    def do_POST(self):
        path, _, query = self.path.partition('?')
        q = dict(kv.split('=', 1) for kv in query.split('&') if '=' in kv)
        if path == '/api/convert':
            n = int(self.headers.get('Content-Length') or 0)
            ctype = (self.headers.get('Content-Type') or '').split(';')[0]
            if ctype not in IMAGE_EXT:
                return self.send_json({'error': 'Send a JPG, PNG or WebP image.'}, 415)
            if not 0 < n <= MAX_UPLOAD:
                return self.send_json({'error': 'The image must be under 40 MB.'}, 413)
            model = q.get('model', 'trellis2')
            if model not in conv.MODELS:
                return self.send_json({'error': f'Unknown model {model}.'}, 400)
            texture = int(q.get('texture', 2048)) if q.get('texture', '').isdigit() else 2048
            seed = int(q.get('seed', 0)) if q.get('seed', '').isdigit() else 0
            job = new_job('convert', model=model)
            os.makedirs(os.path.join(OUT, job['id']), exist_ok=True)
            img = os.path.join(OUT, job['id'], 'input' + IMAGE_EXT[ctype])
            with open(img, 'wb') as f:
                f.write(self.rfile.read(n))
            threading.Thread(target=run_convert, args=(job, img, model, texture, seed), daemon=True).start()
            return self.send_json({'job': job['id']})
        m = re.fullmatch(r'/api/render/([\w-]+)', path)
        if m:
            if not has_bpy():
                return self.send_json({'error': 'Blender is not installed here: pip install bpy'}, 501)
            glb = os.path.join(OUT, m.group(1), 'model.glb')
            if not os.path.exists(glb):
                return self.send_json({'error': 'Convert a photo first.'}, 404)
            shots = [s for s in q.get('shots', 'hero,front,side,back').split(',') if s in ('hero', 'front', 'side', 'back', 'top')]
            res = min(4096, int(q.get('res', 1400))) if q.get('res', '').isdigit() else 1400
            samples = min(1024, int(q.get('samples', 128))) if q.get('samples', '').isdigit() else 128
            job = new_job('render')
            threading.Thread(target=run_render, args=(job, glb, shots or ['hero'], res, samples), daemon=True).start()
            return self.send_json({'job': job['id']})
        self.send_json({'error': 'not found'}, 404)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8000)
    args = ap.parse_args()
    if not (os.environ.get('HF_TOKEN') or os.environ.get('HUGGING_FACE_HUB_TOKEN')):
        print('note: HF_TOKEN is not set, so conversions use the small anonymous GPU allowance', flush=True)
    print(f'Photo to 3D on http://localhost:{args.port}', flush=True)
    http.server.ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
