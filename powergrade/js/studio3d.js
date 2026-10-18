/* Powergrade Studio3D: photoreal product mockups rendered offscreen with three.js.

   Load it as an ES module after the classic scripts, with this import map before it:

   <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
   <script type="module" src="js/studio3d.js"></script>

   The module sets window.PG.Studio3D and then fires `pg:studio3d-ready` on window.
   Assets (HDRIs, surface textures) load from assets/3d/ next to index.html. Override the base with
   window.PG_STUDIO3D_ASSETS = 'some/url/' before the module runs. Units are centimetres.

   API (PG.Studio3D)
     OBJECTS[id]   { name, textures: {name: {w, h, safe:[x,y,w,h], wrap?, optional?}}, colors: [...roles], colorRoles,
                     variants: {id: {name, textures}}, defaultVariant, finishes, defaults, cameras, maxCount }
     SCENES[id]    { name, backdrop }        studio | table | concrete | linen | wall | outdoor
     CAMERAS[id]   { name }                  hero | front | top | close (each object tunes its own angles)
     ready         Promise, resolves when the HDRIs and surface textures are loaded
     textureSpec(object, variant) -> the textures map for that variant
     render(spec)  -> Promise<string> blob: URL (or data URL with output:'dataurl')
       spec = { object, variant?, textures: {name: canvas}, colors?: {body, metal, accent, glass, paper},
                finish?: 'matte'|'satin'|'gloss'|..., scene?: 'studio' | {preset, backdrop, light, lightAz, lightEl,
                envIntensity, exposure, vignette, gobo}, camera?: 'hero' | {preset?, az, el, fov, fill, zoom, focus},
                width=1600, height=1200, count=1..3, quality?: 'draft'|'final'|'high', samples?, dof?, grain?,
                format?: 'jpeg'|'png', output?: 'blob'|'dataurl', key? }
     Calls are queued on one renderer and cached by JSON(spec minus textures) + key (or a canvas fingerprint). */
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PG = (window.PG = window.PG || {});
const VERSION = '1.0.0';
const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ assets */
const ASSET_BASE = (() => {
  if (window.PG_STUDIO3D_ASSETS) return new URL(window.PG_STUDIO3D_ASSETS, document.baseURI).href;
  try { if (/\/js\/studio3d\.js(\?|$)/.test(import.meta.url)) return new URL('../assets/3d/', import.meta.url).href; } catch (e) { /* inlined */ }
  return new URL('assets/3d/', document.baseURI).href;
})();

/* window.PG_STUDIO3D_ASSET_URLS = { 'file.hdr': 'data:...' } overrides single files (used by the bundled artifact). */
const assetUrl = (f) => (window.PG_STUDIO3D_ASSET_URLS && window.PG_STUDIO3D_ASSET_URLS[f]) || ASSET_BASE + f;

/* Poly Haven HDRIs. `key` is the main light in equirect image coords (u across, r = row from top). */
const HDRS = {
  studio: { file: 'studio_small_03_1k.hdr', key: { u: 0.675, r: 0.46 }, rig: { base: 0.3 } },
  sky: { file: 'kloofendal_48d_partly_cloudy_puresky_1k.hdr', key: { u: 0.595, r: 0.232 } }
};
const SURFACES = {
  plaster: { diff: 'plastered_wall_04_diff_1k.jpg', nor: 'plastered_wall_04_nor_gl_1k.jpg', tint: true, contrast: 1.6 },
  concrete: { diff: 'concrete_floor_02_diff_1k.jpg', nor: 'concrete_floor_02_nor_gl_1k.jpg', tint: true, contrast: 0.7 },
  oak: { diff: 'oak_veneer_01_diff_1k.jpg', nor: 'oak_veneer_01_nor_gl_1k.jpg', tint: false },
  linen: { diff: 'rough_linen_diff_1k.jpg', nor: 'rough_linen_nor_gl_1k.jpg', tint: true, contrast: 1.4 }
};

/* ------------------------------------------------------------------ small utils */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const col = (hex, fallback) => new THREE.Color(hex || fallback || '#888888');
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/* Tileable value-noise fbm, returns Float32Array in roughly [0,1]. */
function fbm(size, cells, octaves, seed, gain = 0.5) {
  const out = new Float32Array(size * size);
  const rnd = mulberry(seed);
  let amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = cells << o;
    const g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * n, y0 = Math.floor(fy), ty = smooth(fy - y0), y1 = (y0 + 1) % n;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * n, x0 = Math.floor(fx), tx = smooth(fx - x0), x1 = (x0 + 1) % n;
        const a = g[y0 * n + x0], b = g[y0 * n + x1], c = g[y1 * n + x0], d = g[y1 * n + x1];
        out[y * size + x] += amp * lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
      }
    }
    norm += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}
/* Height field -> tangent-space normal map canvas (OpenGL convention). */
function normalCanvas(h, size, strength) {
  const c = mkCanvas(size, size), ctx = c.getContext('2d'), img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
    const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
    let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * size + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
function grayCanvas(v, size, lo, hi) {
  const c = mkCanvas(size, size), ctx = c.getContext('2d'), img = ctx.createImageData(size, size);
  for (let i = 0; i < v.length; i++) { const g = clamp(lo + (hi - lo) * v[i], 0, 1) * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ------------------------------------------------------------------ renderer + shared resources */
let renderer = null, pmrem = null, maxAniso = 4;
const ENV = {};           // name -> { env (PMREM), bg (equirect), keyDir (world Vector3) }
const SURF = {};          // name -> { map, normal, mean } (shared, never disposed)
const PROC = {};          // procedural shared textures
const supported = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();

function initRenderer() {
  if (renderer) return renderer;
  const canvas = document.createElement('canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.setPixelRatio(1);
  renderer.autoClear = false;
  maxAniso = renderer.capabilities.getMaxAnisotropy();
  pmrem = new THREE.PMREMGenerator(renderer);
  return renderer;
}

function shared(tex) { tex.userData.shared = true; return tex; }
function canvasTex(c, srgb, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = maxAniso;
  return t;
}
/* A repeat-tiled copy of a shared texture (shares the GPU source). */
function tiled(tex, rx, ry) { const t = tex.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.needsUpdate = true; return t; }

function dirFromEquirect(u, r) {
  const phi = (u - 0.5) * Math.PI * 2, th = (0.5 - r) * Math.PI;
  return new THREE.Vector3(Math.cos(phi) * Math.cos(th), Math.sin(th), Math.sin(phi) * Math.cos(th)).normalize();
}

function buildProcedural() {
  const N = 512;
  // paper: fine fibre noise + broad cloudiness
  const fib = fbm(N, 64, 3, 11, 0.55), cloud = fbm(N, 8, 3, 12);
  const rnd = mulberry(5);
  const h = new Float32Array(N * N);
  for (let i = 0; i < h.length; i++) h[i] = fib[i] * 0.8 + cloud[i] * 0.2;
  // fibres: short random strokes
  for (let k = 0; k < 2600; k++) {
    let x = rnd() * N, y = rnd() * N; const a = rnd() * Math.PI * 2, len = 6 + rnd() * 18, s = (rnd() - 0.5) * 0.35;
    for (let t = 0; t < len; t++) { x += Math.cos(a); y += Math.sin(a); const i = ((Math.floor(y) + N) % N) * N + ((Math.floor(x) + N) % N); h[i] += s; }
  }
  PROC.paperNormal = shared(canvasTex(normalCanvas(h, N, 1.2), false, true));
  PROC.paperRough = shared(canvasTex(grayCanvas(fbm(N, 6, 4, 21), N, 0.82, 1.12), false, true));
  // brushed metal: streaks along u
  const bm = new Float32Array(N * N), row = fbm(N, 128, 3, 31);
  for (let y = 0; y < N; y++) { const r0 = row[y * N] * 0.7 + row[((y * 7) % N) * N + 5] * 0.3; for (let x = 0; x < N; x++) bm[y * N + x] = r0 + fib[y * N + x] * 0.05; }
  PROC.brushedNormal = shared(canvasTex(normalCanvas(bm, N, 3.0), false, true));
  // rope twist
  const rp = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const t = ((x / N) * 3 + (y / N) * 6) % 1; rp[y * N + x] = Math.pow(Math.sin(t * Math.PI), 0.6) + fib[y * N + x] * 0.25; }
  PROC.ropeNormal = shared(canvasTex(normalCanvas(rp, N, 5.0), false, true));
  // page edges: fine horizontal lines
  const pg = mkCanvas(64, 512), pc = pg.getContext('2d');
  pc.fillStyle = '#f4f1ea'; pc.fillRect(0, 0, 64, 512);
  for (let y = 0; y < 512; y += 2) { pc.fillStyle = `rgba(120,110,95,${0.06 + rnd() * 0.12})`; pc.fillRect(0, y, 64, 1); }
  PROC.pageEdge = shared(canvasTex(pg, true, true));
  // crimp ridges for tubes / pouch seals (stripes along u)
  const cr = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) cr[y * N + x] = Math.sin((x / N) * Math.PI * 2 * 24) * 0.5 + 0.5;
  PROC.ribNormal = shared(canvasTex(normalCanvas(cr, N, 6), false, true));
  // film crinkle: ridged low-frequency noise
  const ck = fbm(N, 6, 4, 41, 0.55), ck2 = fbm(N, 3, 2, 43);
  for (let i = 0; i < ck.length; i++) ck[i] = 1 - Math.abs(ck[i] * 2 - 1) * 0.7 - Math.abs(ck2[i] * 2 - 1) * 0.3;
  PROC.crinkle = shared(canvasTex(normalCanvas(ck, N, 4), false, true));
}

/* Neutral detail textures from the Poly Haven diffuse maps so the backdrop colour can tint them. */
function detailize(img, contrast) {
  const S = 1024, c = mkCanvas(S, S), ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, S, S);
  const d = ctx.getImageData(0, 0, S, S), p = d.data;
  let sum = 0;
  for (let i = 0; i < p.length; i += 4) sum += 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
  const mean = sum / (p.length / 4);
  for (let i = 0; i < p.length; i += 4) {
    const l = 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
    const v = clamp(214 + (l - mean) * contrast, 0, 255);
    p[i] = p[i + 1] = p[i + 2] = v;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}


/* Studio rig: the Poly Haven HDRI (dimmed) plus soft-edged emissive panels, baked into one PMREM.
   Panels are placed relative to the key direction so reflections agree with the shadow-casting key light.
   Azimuths are measured from the key; elevation in degrees. */
function softboxTexture(round) {
  const S = 256, c = mkCanvas(S, S), x = c.getContext('2d');
  const g = round ? x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2) : null;
  if (round) { g.addColorStop(0, '#fff'); g.addColorStop(0.6, '#f4f4f4'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S); }
  else {
    const img = x.createImageData(S, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const u = Math.abs(i / (S - 1) - 0.5) * 2, v = Math.abs(j / (S - 1) - 0.5) * 2;
      const e = smooth((1 - u) / 0.22) * smooth((1 - v) / 0.22), core = 0.85 + 0.15 * (1 - Math.max(u, v) ** 2);
      const k = (j * S + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255 * core; img.data[k + 3] = 255 * e;
    }
    x.putImageData(img, 0, 0);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function buildRig(hdr, keyDir, o) {
  const sc = new THREE.Scene();
  sc.background = hdr; sc.backgroundIntensity = o.base;
  const phiK = Math.atan2(keyDir.z, keyDir.x);
  const panelTex = softboxTexture(false);
  const add = (azDeg, elDeg, dist, w, h, intensity, tint = '#ffffff') => {
    const a = phiK + azDeg * DEG, e = elDeg * DEG;
    const p = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).multiplyScalar(dist);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col(tint).multiplyScalar(intensity), map: panelTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.position.copy(p); m.lookAt(0, 0, 0); sc.add(m);
  };
  add(0, 32, 20, 22, 16, 9);          // key softbox
  add(118, 18, 20, 4.5, 26, 7);       // strip light, rim
  add(-110, 14, 20, 5, 22, 4.5);      // second strip, far side
  add(65, 6, 20, 18, 14, 1.5);        // white bounce card (fill)
  // bright sweep floor: what glossy undersides would really reflect
  const floorDisc = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(0.75), side: THREE.DoubleSide }));
  floorDisc.rotation.x = -Math.PI / 2; floorDisc.position.y = -4; sc.add(floorDisc);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(2.2), map: panelTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  top.position.set(0, 20, 0); top.lookAt(0, 0, 0); sc.add(top);
  const rt = pmrem.fromScene(sc, 0, 0.1, 100);
  sc.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
  panelTex.dispose();
  return rt.texture;
}

const loadImage = (url) => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('image ' + url)); i.src = url; });

async function loadAssets() {
  initRenderer();
  buildProcedural();
  const rgbe = new RGBELoader().setDataType(THREE.HalfFloatType);
  const hdrJobs = Object.entries(HDRS).map(async ([name, h]) => {
    try {
      const tex = await rgbe.loadAsync(assetUrl(h.file));
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const keyDir = dirFromEquirect(h.key.u, h.key.r);
      const env = h.rig ? buildRig(tex, keyDir, h.rig) : pmrem.fromEquirectangular(tex).texture;
      ENV[name] = { env: shared(env), bg: shared(tex), keyDir };
    } catch (e) {
      console.warn('[Studio3D] HDRI failed, using RoomEnvironment', e);
      const rt = pmrem.fromScene(new RoomEnvironment(renderer), 0.04);
      ENV[name] = { env: shared(rt.texture), bg: null, keyDir: new THREE.Vector3(-0.5, 0.7, 0.5).normalize() };
    }
  });
  const surfJobs = Object.entries(SURFACES).map(async ([name, s]) => {
    try {
      const [di, ni] = await Promise.all([loadImage(assetUrl(s.diff)), loadImage(assetUrl(s.nor))]);
      const map = s.tint ? canvasTex(detailize(di, s.contrast), true, true) : (() => { const t = new THREE.Texture(di); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; t.needsUpdate = true; return t; })();
      const normal = new THREE.Texture(ni); normal.wrapS = normal.wrapT = THREE.RepeatWrapping; normal.anisotropy = maxAniso; normal.needsUpdate = true;
      SURF[name] = { map: shared(map), normal: shared(normal), tint: s.tint };
    } catch (e) {
      console.warn('[Studio3D] surface failed', name, e);
      SURF[name] = { map: null, normal: PROC.paperNormal, tint: true };
    }
  });
  await Promise.all([...hdrJobs, ...surfJobs]);
}

/* ------------------------------------------------------------------ materials */
const FINISH = {
  matte: { roughness: 0.62, clearcoat: 0, clearcoatRoughness: 0.5 },
  satin: { roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.32 },
  gloss: { roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.05 },
  soft: { roughness: 0.78, clearcoat: 0, clearcoatRoughness: 0.5, sheen: 0.35, sheenRoughness: 0.8 },
  uncoated: { roughness: 0.86, clearcoat: 0, clearcoatRoughness: 0.5 }
};
const M = {
  /* Printed paper/board/film carrying artwork. size = physical [w,h] cm of the mapped area for paper grain scale. */
  printed({ map, color = '#ffffff', finish = 'satin', size = [10, 10], grain = 0.35, metalness = 0 }) {
    const f = FINISH[finish] || FINISH.satin;
    const m = new THREE.MeshPhysicalMaterial({ color: col(color), map: map || null, metalness, roughness: f.roughness, clearcoat: f.clearcoat, clearcoatRoughness: f.clearcoatRoughness, envMapIntensity: 1 });
    if (f.sheen) { m.sheen = f.sheen; m.sheenRoughness = f.sheenRoughness; m.sheenColor = new THREE.Color(0xffffff); }
    if (grain > 0) {
      m.normalMap = tiled(PROC.paperNormal, size[0] / 6, size[1] / 6);
      m.normalScale.set(grain, grain);
      m.roughnessMap = tiled(PROC.paperRough, size[0] / 14, size[1] / 14);
      if (f.clearcoat > 0.5) m.clearcoatNormalMap = null;
    }
    return m;
  },
  plastic(color, finish = 'satin', extra = {}) {
    const f = FINISH[finish] || FINISH.satin;
    return new THREE.MeshPhysicalMaterial({ color: col(color), roughness: f.roughness, metalness: 0, clearcoat: f.clearcoat * 0.8, clearcoatRoughness: f.clearcoatRoughness, ...extra });
  },
  metal(color = '#c8cbd0', roughness = 0.28, aniso = 0.5, brushedScale = 1) {
    const m = new THREE.MeshPhysicalMaterial({ color: col(color), metalness: 1, roughness, anisotropy: aniso, anisotropyRotation: 0 });
    if (brushedScale) { m.normalMap = tiled(PROC.brushedNormal, brushedScale, 1); m.normalScale.set(0.08, 0.08); }
    return m;
  },
  glass(type = 'clear', thickness = 1) {
    const base = { transmission: 1, ior: 1.5, thickness, metalness: 0, specularIntensity: 1, envMapIntensity: 1.1, side: THREE.FrontSide };
    if (type === 'frosted') return new THREE.MeshPhysicalMaterial({ ...base, color: col('#f3f5f4'), roughness: 0.42, attenuationColor: col('#eef2f0'), attenuationDistance: 6 });
    if (type === 'amber') return new THREE.MeshPhysicalMaterial({ ...base, color: col('#f6c27a'), roughness: 0.04, attenuationColor: col('#b8681c'), attenuationDistance: 1.6 * thickness });
    if (type === 'opal') return new THREE.MeshPhysicalMaterial({ color: col('#f4f2ee'), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04, sheen: 0.2 });
    if (type === 'smoke') return new THREE.MeshPhysicalMaterial({ ...base, color: col('#9a9894'), roughness: 0.05, attenuationColor: col('#3a3836'), attenuationDistance: 1.2 * thickness });
    if (typeof type === 'string' && /^#|^rgb/.test(type)) return new THREE.MeshPhysicalMaterial({ ...base, color: col(type).lerp(new THREE.Color(1, 1, 1), 0.55), roughness: 0.04, attenuationColor: col(type), attenuationDistance: 1.4 * thickness });
    return new THREE.MeshPhysicalMaterial({ ...base, color: col('#ffffff'), roughness: 0.02, attenuationColor: col('#e9f2ee'), attenuationDistance: 8 });
  },
  rubber(color = '#1c1c1c') { return new THREE.MeshPhysicalMaterial({ color: col(color), roughness: 0.55, metalness: 0, sheen: 0.4, sheenRoughness: 0.6, sheenColor: col('#ffffff') }); },
  screen(map) {
    return new THREE.MeshPhysicalMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 1.25, roughness: 0.05, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.03, envMapIntensity: 0.3 });
  }
};

/* ------------------------------------------------------------------ geometry helpers */
/* Profile from a list of commands in (r, y): ['M',r,y], ['L',r,y], ['Q',cr,cy,r,y]. */
function profile(cmds, div = 8) {
  const p = new THREE.Path();
  for (const c of cmds) {
    if (c[0] === 'M') p.moveTo(c[1], c[2]);
    else if (c[0] === 'L') p.lineTo(c[1], c[2]);
    else if (c[0] === 'Q') p.quadraticCurveTo(c[1], c[2], c[3], c[4]);
  }
  const pts = p.getPoints(div);
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) if (pts[i].distanceTo(out[out.length - 1]) > 1e-5) out.push(pts[i]);
  return out;
}
/* Lathe with u = 0.5 facing +z (the front) and optional height-based v for labels. */
function lathe(points, segs = 128, band = null, phiStart = -Math.PI, phiLen = Math.PI * 2) {
  const g = new THREE.LatheGeometry(points, segs, phiStart, phiLen);
  if (band) {
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) - band[0]) / (band[1] - band[0]));
  }
  return g;
}
function splitPoints(pts, y) { // split profile where it first crosses height y going up
  for (let i = 1; i < pts.length; i++) if (pts[i].y >= y && pts[i - 1].y < y) {
    const t = (y - pts[i - 1].y) / (pts[i].y - pts[i - 1].y), m = pts[i - 1].clone().lerp(pts[i], t);
    return [[...pts.slice(0, i), m], [m.clone(), ...pts.slice(i)]];
  }
  return [pts, []];
}
function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }
function roundedRectShape(w, h, r, cx = 0, cy = 0) {
  const s = new THREE.Shape(), x = cx - w / 2, y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/* Proper superellipse-ish rounded rect with circular arcs (smoother than quadratic corners). */
function roundRect(w, h, r, segs = 10) {
  const s = new THREE.Shape(), hw = w / 2, hh = h / 2;
  r = Math.min(r, hw, hh);
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh); s.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hw, hh - r); s.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hw + r, hh); s.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hh + r); s.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
/* Extrude a shape (in XY) along +Z and split into groups: 0 = front cap (+z), 1 = back cap, 2 = sides.
   Caps get UVs normalised to the shape bounds. */
function slab(shape, depth, bevel = 0, curveSegs = 24, bevelSegs = 3) {
  const g0 = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, depth - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: bevelSegs, curveSegments: curveSegs });
  g0.translate(0, 0, bevel);
  const g = g0.index ? g0.toNonIndexed() : g0;
  g.computeBoundingBox();
  const bb = g.boundingBox, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const tris = { 0: [], 1: [], 2: [] };
  for (let t = 0; t < pos.count; t += 3) {
    let nz = 0, zAvg = 0; for (let k = 0; k < 3; k++) { nz += nor.getZ(t + k); zAvg += pos.getZ(t + k); }
    nz /= 3; zAvg /= 3;
    const flatFront = nz > 0.999 && zAvg > bb.max.z - 1e-4, flatBack = nz < -0.999 && zAvg < bb.min.z + 1e-4;
    tris[flatFront ? 0 : flatBack ? 1 : 2].push(t);
  }
  const out = new THREE.BufferGeometry();
  const P = [], Nn = [], U = [];
  let start = 0;
  for (const gi of [0, 1, 2]) {
    for (const t of tris[gi]) for (let k = 0; k < 3; k++) {
      const i = t + k, x = pos.getX(i), y = pos.getY(i);
      P.push(x, y, pos.getZ(i)); Nn.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      if (gi < 2) U.push((x - bb.min.x) / (bb.max.x - bb.min.x), (y - bb.min.y) / (bb.max.y - bb.min.y)); else U.push(uv.getX(i), uv.getY(i));
    }
    const n = tris[gi].length * 3; out.addGroup(start, n, gi); start += n;
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  // back cap UVs mirrored so artwork reads correctly when the slab is flipped over its X axis
  g0.dispose(); if (g !== g0) g.dispose();
  return out;
}
/* Parametric grid surface: f(u, v, target) for u,v in [0,1]; uv attribute = (u, v). */
function surface(nu, nv, f, uvf) {
  const P = [], U = [], I = [], v3 = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv; f(u, v, v3); P.push(v3.x, v3.y, v3.z);
    if (uvf) { const t = uvf(u, v, i, j); U.push(t[0], t[1]); } else U.push(u, v);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    I.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ objects
   Each object: name, colors (roles), finish, variants (dims + textures), cameras, scene, build(ctx) -> Group
   resting on y = 0 with its front facing +z. Textures: { w, h, wrap?, safe:[x,y,w,h], optional? }. */
const tex = (w, h, safe, extra) => ({ w: Math.round(w), h: Math.round(h), safe: safe.map(Math.round), ...extra });
const insetSafe = (w, h, fx, fy) => [w * fx, h * fy, w * (1 - 2 * fx), h * (1 - 2 * fy)];
const wrapSafe = (w, h, fy = 0.08) => [w / 3, h * fy, w / 3, h * (1 - 2 * fy)];
/* texture size with the longest side at `max`, keeping physical ratio a:b */
const fit = (a, b, max = 2048) => (a >= b ? [max, (max * b) / a] : [(max * a) / b, max]);

const O = {};

/* ---------- drinks can ---------- */
const CAN_DIMS = {
  standard: { name: '330 ml standard', r: 3.31, h: 11.52, lid: 2.69, band: [1.05, 9.95] },
  slim: { name: '250 ml slim', r: 2.65, h: 13.4, lid: 2.33, band: [1.0, 11.85] }
};
function canTextures(v) {
  const d = CAN_DIMS[v], C = 2 * Math.PI * d.r, H = d.band[1] - d.band[0];
  const w = 2048, h = Math.round((w * H) / C / 8) * 8;
  return { label: tex(w, h, wrapSafe(w, h, 0.07), { wrap: true }) };
}
O.can = {
  name: 'Drinks can', colors: { metal: 'lid, rim and tab (aluminium)', body: 'unused (neck carries the label edge colour)' },
  defaults: { variant: 'standard', finish: 'gloss', scene: 'studio', camera: 'hero', count: 1, colors: { metal: '#d4d7db' } },
  variants: { standard: { name: CAN_DIMS.standard.name, textures: canTextures('standard') }, slim: { name: CAN_DIMS.slim.name, textures: canTextures('slim') } },
  cameras: { hero: { az: 0, el: 9, fov: 24, fill: 0.74 }, front: { az: 0, el: 2, fov: 22, fill: 0.78 }, top: { az: 0, el: 89, fov: 26, fill: 0.7 }, close: { az: -12, el: 18, fov: 22, fill: 0.74, zoom: 1.9, focus: [0.5, 0.8, 0.5] } },
  arrange: [[[0, 0, 0, 0]], [[0, 0, 0, 0], [0.92, 0, -0.75, 35]], [[0, 0, 0, 0], [-0.98, 0, -0.95, -35], [0.98, 0, -0.95, 35]]],
  build({ t, c, v, finish }) {
    const d = CAN_DIMS[v], R = d.r * 10, H = d.h * 10, L = d.lid * 10; // work in mm, scale at end
    const g = new THREE.Group();
    const neckStart = H - 16.5;
    const pts = profile([
      ['M', 0, 8.6], ['Q', R * 0.55, 8.2, R * 0.74, 3.0], ['Q', R * 0.77, 0, R * 0.8, 0.05], ['Q', R * 0.84, 0, R * 0.86, 1.0],
      ['Q', R * 0.93, 4.0, R * 0.985, 7.2], ['Q', R, 8.6, R, 10.5],
      ['L', R, neckStart], ['Q', R, neckStart + 3.2, R - 2.2, neckStart + 6.8], ['Q', L + 0.6, H - 6.4, L + 0.15, H - 4.1],
      ['Q', L - 0.1, H - 2.6, L + 0.35, H - 1.6], ['Q', L + 0.75, H - 0.6, L + 0.45, H], ['Q', L, H + 0.25, L - 0.55, H - 0.25],
      ['Q', L - 0.8, H - 2.8, L - 1.6, H - 5.9], ['Q', L - 2.0, H - 6.6, L - 2.6, H - 5.8], ['Q', L - 3.0, H - 5.0, L - 4.0, H - 5.2], ['L', 0, H - 5.6]
    ], 10).map((p) => new THREE.Vector2(p.x / 10, p.y / 10));
    const [low, rest] = splitPoints(pts, 0.55);
    const [print, top] = splitPoints(rest, (neckStart + 6.2) / 10);
    const metal = M.metal(c.metal, 0.3, 0.6, 6);
    const printMat = M.printed({ map: t.label, finish, grain: 0, metalness: 0.35 });
    printMat.roughness = finish === 'matte' ? 0.5 : finish === 'satin' ? 0.32 : 0.2;
    g.add(mesh(lathe(low, 160), metal), mesh(lathe(print, 192, d.band), printMat), mesh(lathe(top, 160), metal));
    // pull tab, rivet and opening score on the lid panel
    const panelY = (H - 5.4) / 10;
    const tab = new THREE.Shape();
    const tw = 1.25, tl = 2.15;
    tab.absarc(0, -0.35, tw / 2, Math.PI, 0, true); tab.lineTo(tw / 2, 0.75); tab.absarc(0, 0.75, tw / 2, 0, Math.PI, false); tab.lineTo(-tw / 2, -0.35);
    const hole = new THREE.Path(); hole.absarc(0, 0.72, 0.36, 0, Math.PI * 2, true);
    const hole2 = new THREE.Path(); hole2.moveTo(-0.2, -0.05); hole2.absarc(0, -0.05, 0.2, Math.PI, 0, true); hole2.lineTo(0.2, -0.05); hole2.absarc(0, -0.05, 0.2, 0, Math.PI, true);
    tab.holes.push(hole);
    const tabGeo = new THREE.ExtrudeGeometry(tab, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.03, bevelSegments: 2, curveSegments: 24 });
    tabGeo.rotateX(-Math.PI / 2);
    const tabMesh = mesh(tabGeo, M.metal(c.metal, 0.22, 0.4, 0));
    tabMesh.position.set(0, panelY + 0.03, -0.45 * tl / 2);
    tabMesh.rotation.y = Math.PI; tabMesh.rotation.x = -0.02;
    tabMesh.scale.setScalar(L / 26.9);
    g.add(tabMesh);
    const rivet = mesh(lathe(profile([['M', 0, 0.09], ['Q', 0.17, 0.09, 0.19, 0], ['L', 0.2, -0.02]], 6), 32), M.metal(c.metal, 0.25, 0, 0));
    rivet.position.set(0, panelY, 0); g.add(rivet);
    const sc = new THREE.Shape(); sc.moveTo(-0.62, 0.35); sc.quadraticCurveTo(-0.75, 1.62, 0, 1.68); sc.quadraticCurveTo(0.75, 1.62, 0.62, 0.35); sc.quadraticCurveTo(0, 0.18, -0.62, 0.35);
    const scGeo = new THREE.ExtrudeGeometry(sc, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.035, bevelSegments: 2, curveSegments: 24 });
    scGeo.rotateX(-Math.PI / 2);
    const score = mesh(scGeo, M.metal(c.metal, 0.34, 0.3, 0)); score.position.set(0, panelY - 0.01, 0); score.scale.setScalar(L / 26.9);
    g.add(score);
    return g;
  }
};

/* ---------- folding carton ---------- */
const BOX_DIMS = {
  tall: { name: 'Tall carton', w: 7, h: 18, d: 5 },
  cube: { name: 'Cube carton', w: 10, h: 10, d: 10 },
  flat: { name: 'Flat carton', w: 18, h: 4.5, d: 13 }
};
function boxTextures(v) {
  const { w, h, d } = BOX_DIMS[v], k = 2048 / Math.max(w, h, d);
  const F = [w * k, h * k], S = [d * k, h * k], T = [w * k, d * k];
  return {
    front: tex(F[0], F[1], insetSafe(F[0], F[1], 0.08, 0.06)),
    side: tex(S[0], S[1], insetSafe(S[0], S[1], 0.1, 0.06)),
    top: tex(T[0], T[1], insetSafe(T[0], T[1], 0.08, 0.1)),
    back: tex(F[0], F[1], insetSafe(F[0], F[1], 0.08, 0.06), { optional: true })
  };
}
O.box = {
  name: 'Folding carton', colors: { body: 'board colour on the bottom and inside edges' },
  defaults: { variant: 'tall', finish: 'satin', scene: 'studio', camera: 'hero', count: 1, colors: { body: '#f4f2ee' } },
  variants: Object.fromEntries(Object.keys(BOX_DIMS).map((k) => [k, { name: BOX_DIMS[k].name, textures: boxTextures(k) }])),
  cameras: { hero: { az: -32, el: 16, fov: 24, fill: 0.72 }, front: { az: 0, el: 4, fov: 22, fill: 0.76 }, top: { az: 0, el: 89, fov: 26, fill: 0.72 }, close: { az: -24, el: 22, fov: 22, fill: 0.74, zoom: 1.7, focus: [0.4, 0.75, 0.6] } },
  cameraVariant: { flat: { hero: { az: -28, el: 34 } } },
  arrange: [[[0, 0, 0, 0]], [[0, 0, 0, 0], [1.05, 0, -0.9, -18]], [[0, 0, 0, 0], [-1.05, 0, -1.0, 14], [1.05, 0, -1.0, -14]]],
  build({ t, c, v, finish }) {
    const { w, h, d } = BOX_DIMS[v];
    const geo = new RoundedBoxGeometry(w, h, d, 3, 0.045);
    geo.translate(0, h / 2, 0);
    const P = (map, size) => M.printed({ map, finish, size, grain: 0.12, color: map ? '#ffffff' : c.body });
    const mats = [P(t.side, [d, h]), P(t.side, [d, h]), P(t.top, [w, d]), P(null, [w, d]), P(t.front, [w, h]), P(t.back || t.front, [w, h])];
    const g = new THREE.Group();
    g.add(mesh(geo, mats));
    // tuck-flap slit along the back of the top face and a subtle crease
    const slit = mesh(new THREE.BoxGeometry(w - 0.2, 0.004, 0.02), new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1, transparent: true, opacity: 0.35 }), false);
    slit.position.set(0, h + 0.001, -d / 2 + 0.06); g.add(slit);
    return g;
  }
};

/* ---------- cosmetic bottle (dropper or pump) ---------- */
const BOTTLE_DIMS = {
  dropper: { name: 'Dropper bottle 30 ml', r: 1.65, h: 6.6, neck: 0.82, band: [0.95, 5.15], span: 150 },
  pump: { name: 'Pump bottle 100 ml', r: 2.3, h: 9.6, neck: 1.1, band: [1.3, 7.7], span: 140 }
};
function bottleTextures(v) {
  const d = BOTTLE_DIMS[v], arc = (d.r + 0.012) * d.span * DEG, H = d.band[1] - d.band[0];
  const [w, h] = fit(arc, H, 1536);
  return { label: tex(w, h, insetSafe(w, h, 0.12, 0.08)) };
}
O.bottle = {
  name: 'Cosmetic bottle', colors: { glass: "'clear' | 'frosted' | 'amber' | 'smoke' | 'opal'", accent: 'bulb or pump head', metal: 'collar ring' },
  defaults: { variant: 'dropper', finish: 'matte', scene: 'studio', camera: 'hero', count: 1, colors: { glass: 'amber', accent: '#1e1e1e', metal: '#d9d4ca' } },
  variants: Object.fromEntries(Object.keys(BOTTLE_DIMS).map((k) => [k, { name: BOTTLE_DIMS[k].name, textures: bottleTextures(k) }])),
  cameras: { hero: { az: 0, el: 8, fov: 24, fill: 0.74 }, front: { az: 0, el: 2, fov: 22, fill: 0.78 }, top: { az: 0, el: 62, fov: 24, fill: 0.72 }, close: { az: -10, el: 12, fov: 22, fill: 0.74, zoom: 1.7, focus: [0.5, 0.45, 0.5] } },
  arrange: [[[0, 0, 0, 0]], [[-0.62, 0, 0.15, 0], [0.62, 0, -0.55, 25]], [[0, 0, 0, 0], [-1.05, 0, -0.9, -25], [1.05, 0, -0.9, 25]]],
  build({ t, c, v, finish }) {
    const d = BOTTLE_DIMS[v], R = d.r, H = d.h, N = d.neck;
    const g = new THREE.Group();
    const glassType = c.glass || 'amber';
    const pts = profile([['M', 0, 0], ['L', R - 0.28, 0], ['Q', R, 0, R, 0.3], ['L', R, H - R * 0.55], ['Q', R, H - 0.05, N + 0.25, H - 0.02], ['Q', N, H, N, H + 0.1], ['L', N, H + 0.9], ['L', 0, H + 0.9]], 14);
    const glass = mesh(lathe(pts, 128), M.glass(glassType, R * 1.6));
    g.add(glass);
    const lab = new THREE.CylinderGeometry(R + 0.012, R + 0.012, d.band[1] - d.band[0], 96, 1, true, -d.span * DEG / 2, d.span * DEG);
    lab.translate(0, (d.band[0] + d.band[1]) / 2, 0);
    g.add(mesh(lab, M.printed({ map: t.label, finish, size: [R * 2.6, d.band[1] - d.band[0]], grain: 0.18 })));
    const metal = M.metal(c.metal, 0.32, 0.3, 4);
    if (v === 'dropper') {
      const cr = N + 0.2, y0 = H + 0.02, ch = 1.55;
      g.add(mesh(lathe(profile([['M', N - 0.05, y0], ['L', cr - 0.05, y0], ['Q', cr, y0, cr, y0 + 0.06], ['L', cr, y0 + ch - 0.06], ['Q', cr, y0 + ch, cr - 0.06, y0 + ch], ['L', 0.5, y0 + ch]], 6), 96), metal));
      const b0 = y0 + ch, br = 0.66;
      const bulb = profile([['M', 0.5, b0], ['L', 0.62, b0], ['Q', 0.66, b0 + 0.05, 0.6, b0 + 0.35], ['Q', 0.52, b0 + 0.6, br, b0 + 1.25], ['Q', 0.74, b0 + 1.9, 0.5, b0 + 2.45], ['Q', 0.3, b0 + 2.75, 0, b0 + 2.78]], 10);
      g.add(mesh(lathe(bulb, 96), M.rubber(c.accent)));
    } else {
      const cr = N + 0.28, y0 = H + 0.02, ch = 1.05;
      g.add(mesh(lathe(profile([['M', N - 0.05, y0], ['L', cr - 0.06, y0], ['Q', cr, y0, cr, y0 + 0.08], ['L', cr, y0 + ch - 0.12], ['Q', cr, y0 + ch, cr - 0.12, y0 + ch], ['L', 0.42, y0 + ch], ['L', 0.38, y0 + ch + 0.45], ['L', 0, y0 + ch + 0.45]], 6), 96), metal));
      const hy = y0 + ch + 0.45, hr = 1.05, hh = 1.35;
      const plast = M.plastic(c.accent, 'satin');
      g.add(mesh(lathe(profile([['M', 0, hy], ['L', hr - 0.1, hy], ['Q', hr, hy, hr, hy + 0.1], ['L', hr, hy + hh - 0.25], ['Q', hr, hy + hh, hr - 0.3, hy + hh], ['L', 0, hy + hh]], 8), 96), plast));
      const noz = new THREE.CylinderGeometry(0.2, 0.24, 1.5, 32);
      noz.rotateZ(Math.PI / 2); noz.translate(hr + 0.55, hy + hh * 0.62, 0);
      g.add(mesh(noz, plast));
      const tip = new THREE.SphereGeometry(0.2, 24, 12); tip.translate(hr + 1.3, hy + hh * 0.62, 0); g.add(mesh(tip, plast));
    }
    return g;
  }
};

/* ---------- wide cosmetic jar ---------- */
const JAR = { r: 3.4, h: 4.6, band: [0.85, 3.65], lidR: 3.56, lidH: 1.9 };
O.jar = {
  name: 'Cosmetic jar', colors: { glass: "'frosted' | 'clear' | 'amber' | 'opal' | 'smoke'", accent: 'lid' },
  defaults: { variant: 'standard', finish: 'matte', scene: 'studio', camera: 'hero', count: 1, colors: { glass: 'frosted', accent: '#1f1f1f' } },
  variants: { standard: { name: 'Jar 50 ml', textures: (() => { const C = 2 * Math.PI * (JAR.r + 0.012), H = JAR.band[1] - JAR.band[0], w = 3072, h = Math.round((w * H) / C / 8) * 8; return { label: tex(w, h, wrapSafe(w, h, 0.1), { wrap: true }), top: tex(1024, 1024, [180, 180, 664, 664], { optional: true }) }; })() } },
  cameras: { hero: { az: 0, el: 16, fov: 24, fill: 0.72 }, front: { az: 0, el: 3, fov: 22, fill: 0.76 }, top: { az: 0, el: 89, fov: 24, fill: 0.7 }, close: { az: -8, el: 20, fov: 22, fill: 0.74, zoom: 1.6, focus: [0.5, 0.5, 0.7] } },
  arrange: [[[0, 0, 0, 0]], [[-0.55, 0, 0.2, 0], [0.55, 0, -0.5, 30]], [[0, 0, 0, 0], [-1.0, 0, -0.85, -30], [1.0, 0, -0.85, 30]]],
  build({ t, c, finish }) {
    const { r: R, h: H, lidR, lidH } = JAR;
    const g = new THREE.Group();
    const pts = profile([['M', 0, 0.02], ['L', R - 0.45, 0], ['Q', R, 0, R, 0.45], ['L', R, H - 0.55], ['Q', R, H - 0.12, R - 0.3, H - 0.1], ['L', R - 0.3, H + 0.3], ['L', 0, H + 0.3]], 12);
    g.add(mesh(lathe(pts, 160), M.glass(c.glass || 'frosted', 2.2)));
    const lab = new THREE.CylinderGeometry(R + 0.012, R + 0.012, JAR.band[1] - JAR.band[0], 192, 1, true, -Math.PI, Math.PI * 2);
    lab.translate(0, (JAR.band[0] + JAR.band[1]) / 2, 0);
    g.add(mesh(lab, M.printed({ map: t.label, finish, size: [2 * Math.PI * R, 3], grain: 0.15 })));
    const y0 = H - 0.08, L = lidR;
    const lidMat = M.plastic(c.accent, finish === 'gloss' ? 'gloss' : 'satin');
    g.add(mesh(lathe(profile([['M', L - 0.25, y0], ['L', L - 0.06, y0], ['Q', L, y0, L, y0 + 0.08], ['L', L, y0 + lidH - 0.3], ['Q', L, y0 + lidH, L - 0.32, y0 + lidH], ['L', 0, y0 + lidH]], 10), 160), lidMat));
    if (t.top) {
      const disc = new THREE.CircleGeometry(L - 0.36, 96); disc.rotateX(-Math.PI / 2); disc.translate(0, y0 + lidH + 0.002, 0);
      g.add(mesh(disc, M.printed({ map: t.top, finish: finish === 'gloss' ? 'gloss' : 'satin', size: [6, 6], grain: 0 })));
    }
    return g;
  }
};

/* ---------- squeeze tube (stands on its cap) ---------- */
const TUBE = { r: 1.75, cap: 2.2, shoulder: 0.7, body: 12.8, crimp: 1.25, capR: 1.82 };
O.tube = {
  name: 'Squeeze tube', colors: { body: 'tube plastic (back, sides, shoulder)', accent: 'cap' },
  defaults: { variant: 'standard', finish: 'satin', scene: 'studio', camera: 'hero', count: 1, colors: { body: '#f3f1ec', accent: '#f3f1ec' } },
  variants: { standard: { name: 'Tube 100 ml', textures: (() => { const w = Math.PI * TUBE.r, h = TUBE.body + TUBE.crimp; const [W, Hh] = fit(w, h, 2048); return { front: tex(W, Hh, [W * 0.1, Hh * 0.1, W * 0.8, Hh * 0.78]), back: tex(W, Hh, [W * 0.1, Hh * 0.1, W * 0.8, Hh * 0.78], { optional: true }) }; })() } },
  cameras: { hero: { az: -24, el: 11, fov: 24, fill: 0.76 }, front: { az: 0, el: 2, fov: 22, fill: 0.8 }, top: { az: 0, el: 60, fov: 24, fill: 0.74 }, close: { az: -30, el: 14, fov: 22, fill: 0.74, zoom: 1.7, focus: [0.5, 0.8, 0.5] } },
  arrange: [[[0, 0, 0, 14]], [[-0.62, 0, 0.2, -6], [0.62, 0, -0.6, 18]], [[0, 0, 0, 0], [-1.05, 0, -1.0, -18], [1.05, 0, -1.0, 18]]],
  build({ t, c, finish }) {
    const { r, cap, shoulder, body, crimp, capR } = TUBE;
    const g = new THREE.Group();
    const y0 = cap + shoulder, y1 = y0 + body, y2 = y1 + crimp, flatA = (Math.PI * r) / 2 + 0.06;
    const sect = (y) => {
      if (y >= y1) return [flatA, 0.05, 1];
      const tt = clamp((y - y0) / body, 0, 1), s = Math.pow(tt, 1.25);
      return [lerp(r, flatA, s), Math.max(0.05, r * (1 - s) + 0.05 * s), 0];
    };
    const NU = 72, NV = 140, tables = [];
    for (let j = 0; j <= NV; j++) {
      const y = lerp(y0, y2, j / NV), [a, b] = sect(y), acc = [0];
      for (let k = 1; k <= 200; k++) { const t0 = -Math.PI / 2 + ((k - 1) / 200) * Math.PI, t1 = -Math.PI / 2 + (k / 200) * Math.PI; acc.push(acc[k - 1] + Math.hypot(a * (Math.sin(t1) - Math.sin(t0)), b * (Math.cos(t1) - Math.cos(t0)))); }
      tables.push(acc);
    }
    const thetaAt = (j, u) => { const acc = tables[j], L = acc[200] * u; let k = 1; while (k < 200 && acc[k] < L) k++; const f = (L - acc[k - 1]) / Math.max(1e-6, acc[k] - acc[k - 1]); return -Math.PI / 2 + ((k - 1 + f) / 200) * Math.PI; };
    const half = (side) => surface(NU, NV, (u, v, o) => {
      const j = Math.round(v * NV), y = lerp(y0, y2, v), [a, b, cz] = sect(y), th = thetaAt(j, side > 0 ? u : 1 - u);
      let z = b * Math.cos(th) * side;
      const x = a * Math.sin(th);
      if (cz) z += side * 0.014 * Math.sin((x / 0.16) * Math.PI * 2) * smooth((y - y1) / 0.15);
      o.set(x, y, z);
    }, (u, v) => [u, v]);
    g.add(mesh(half(1), M.printed({ map: t.front, finish, size: [5.5, 14], grain: 0.06 })));
    g.add(mesh(half(-1), M.printed({ map: t.back || null, color: t.back ? '#ffffff' : c.body, finish, size: [5.5, 14], grain: 0.06 })));
    const plast = M.plastic(c.body, finish);
    g.add(mesh(lathe(profile([['M', 0.5, cap], ['Q', r * 0.62, cap + 0.02, r * 0.9, cap + shoulder * 0.55], ['Q', r, y0 - 0.12, r, y0]], 10), 96), plast));
    const capMat = M.plastic(c.accent, 'gloss');
    g.add(mesh(lathe(profile([['M', 0, 0], ['L', capR - 0.12, 0], ['Q', capR, 0, capR, 0.12], ['L', capR, 0.52], ['L', capR - 0.03, 0.56], ['L', capR - 0.03, 0.6], ['L', capR, 0.64], ['L', capR - 0.05, cap - 0.12], ['Q', capR - 0.06, cap, capR - 0.2, cap], ['L', 0.5, cap]], 6), 128), capMat));
    return g;
  }
};

/* ---------- stand-up pouch ---------- */
const POUCH = { w: 13, h: 20, seal: 0.45, zip: 2.9 };
O.pouch = {
  name: 'Stand-up pouch', colors: { body: 'back panel when no back art' },
  defaults: { variant: 'standard', finish: 'matte', scene: 'studio', camera: 'hero', count: 1, colors: { body: '#efece6' } },
  variants: { standard: { name: 'Pouch 13 × 20 cm', textures: (() => { const [w, h] = fit(POUCH.w, POUCH.h, 2048); return { front: tex(w, h, [w * 0.08, h * 0.2, w * 0.84, h * 0.72]), back: tex(w, h, [w * 0.08, h * 0.2, w * 0.84, h * 0.72], { optional: true }) }; })() } },
  cameras: { hero: { az: -20, el: 12, fov: 24, fill: 0.76 }, front: { az: 0, el: 3, fov: 22, fill: 0.8 }, top: { az: 0, el: 60, fov: 24, fill: 0.74 }, close: { az: -24, el: 12, fov: 22, fill: 0.74, zoom: 1.6, focus: [0.5, 0.6, 0.6] } },
  arrange: [[[0, 0, 0, 0]], [[-0.55, 0, 0.3, -8], [0.55, 0, -0.6, 14]], [[0, 0, 0, 0], [-0.95, 0, -1.1, -14], [0.95, 0, -1.1, 14]]],
  build({ t, c, finish }) {
    const { w: W, h: H, seal, zip } = POUCH;
    const g = new THREE.Group();
    const keys = [[0, 2.15], [0.08, 2.25], [0.3, 1.85], [0.55, 1.35], [0.72, 0.75], [0.8, 0.32], [(H - zip - 0.25) / H, 0.1], [(H - zip + 0.6) / H, 0.03], [1, 0.02]];
    const T = (v) => { for (let i = 1; i < keys.length; i++) if (v <= keys[i][0]) { const f = (v - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]); return lerp(keys[i - 1][1], keys[i][1], smooth(f)); } return 0.02; };
    const prof = (u) => { const s = seal / W; if (u <= s || u >= 1 - s) return 0; const q = (u - s) / (1 - 2 * s); return Math.pow(Math.sin(Math.PI * q), 0.5); };
    const NU = 90, NV = 120, rows = [];
    for (let j = 0; j <= NV; j++) {
      const v = j / NV, y = v * H, zz = [], xs = [0];
      const zipBump = 0.09 * Math.exp(-(((y - (H - zip)) / 0.22) ** 2)) + 0.05 * Math.exp(-(((y - (H - zip - 0.55)) / 0.15) ** 2));
      for (let i = 0; i <= NU; i++) zz.push(T(v) * prof(i / NU) + (prof(i / NU) > 0 ? zipBump * Math.min(1, prof(i / NU) * 3) : 0));
      const ds = W / NU;
      for (let i = 1; i <= NU; i++) { const dz = zz[i] - zz[i - 1]; xs.push(xs[i - 1] + Math.sqrt(Math.max(ds * ds - dz * dz, ds * ds * 0.2))); }
      const off = xs[NU] / 2;
      rows.push({ xs: xs.map((x) => x - off), zz });
    }
    const panel = (side) => surface(NU, NV, (u, v, o) => {
      const j = Math.round(v * NV), i = Math.round((side > 0 ? u : 1 - u) * NU), rw = rows[j];
      o.set(rw.xs[i], v * H, side * rw.zz[i] + side * 0.004);
    }, (u, v) => [u, v]);
    const f = finish === 'gloss' ? 'gloss' : finish === 'satin' ? 'satin' : 'matte';
    // die-cut outline: rounded top corners and tear notches, as an alpha mask
    const AW = 520, AH = Math.round((AW * H) / W), ac = mkCanvas(AW, AH), ax = ac.getContext('2d'), k = AW / W;
    ax.fillStyle = '#000'; ax.fillRect(0, 0, AW, AH); ax.fillStyle = '#fff';
    ax.beginPath(); ax.roundRect(0, 0, AW, AH, [0.7 * k, 0.7 * k, 0.25 * k, 0.25 * k]); ax.fill();
    ax.fillStyle = '#000'; const ny = (zip - 1.15) * k;
    [[0, 1], [AW, -1]].forEach(([x0, d]) => { ax.beginPath(); ax.moveTo(x0, ny - 0.18 * k); ax.lineTo(x0 + d * 0.32 * k, ny); ax.lineTo(x0, ny + 0.18 * k); ax.fill(); });
    const alpha = new THREE.CanvasTexture(ac);
    const film = (map, color, mirror) => {
      const m = M.printed({ map, color, finish: f, size: [W, H], grain: 0 }); m.normalMap = tiled(PROC.crinkle, 1.1, 1.6); m.normalScale.set(0.22, 0.22);
      m.alphaMap = mirror ? (() => { const a = alpha.clone(); a.wrapS = THREE.RepeatWrapping; a.repeat.x = -1; a.needsUpdate = true; return a; })() : alpha; m.alphaTest = 0.5; m.side = THREE.DoubleSide;
      return m;
    };
    g.add(mesh(panel(1), film(t.front, '#ffffff')));
    g.add(mesh(panel(-1), film(t.back || null, t.back ? '#ffffff' : c.body, true)));
    // base gusset
    const base = new THREE.Shape(), r0 = rows[0];
    r0.xs.forEach((x, i) => (i ? base.lineTo(x, r0.zz[i]) : base.moveTo(x, r0.zz[i])));
    for (let i = NU; i >= 0; i--) base.lineTo(r0.xs[i], -r0.zz[i]);
    const bg = new THREE.ShapeGeometry(base); bg.rotateX(Math.PI / 2); bg.translate(0, 0.01, 0);
    g.add(mesh(bg, M.plastic(c.body, 'matte')));
    return g;
  }
};

/* ---------- paper coffee cup ---------- */
const CUP = { rb: 2.95, rt: 4.45, h: 10.9, band: [0.4, 10.55] };
O.cup = {
  name: 'Coffee cup', colors: { body: 'cup paper (inside, rim, unprinted)', accent: 'lid plastic' },
  defaults: { variant: 'standard', finish: 'satin', scene: 'studio', camera: 'hero', count: 1, colors: { body: '#f4f1ea', accent: '#f6f5f2' } },
  variants: { standard: { name: '12 oz cup', textures: (() => { const rm = (CUP.rb + CUP.rt) / 2, C = 2 * Math.PI * rm, H = CUP.band[1] - CUP.band[0], w = 2048, h = Math.round((w * H) / C / 8) * 8; return { label: tex(w, h, wrapSafe(w, h, 0.1), { wrap: true }) }; })() } },
  cameras: { hero: { az: 0, el: 12, fov: 24, fill: 0.74 }, front: { az: 0, el: 3, fov: 22, fill: 0.78 }, top: { az: 0, el: 62, fov: 24, fill: 0.72 }, close: { az: -10, el: 18, fov: 22, fill: 0.74, zoom: 1.6, focus: [0.5, 0.7, 0.5] } },
  arrange: [[[0, 0, 0, 0]], [[-0.55, 0, 0.25, 0], [0.55, 0, -0.55, 35]], [[0, 0, 0, 0], [-1.0, 0, -0.9, -35], [1.0, 0, -0.9, 35]]],
  build({ t, c, finish }) {
    const { rb, rt, h } = CUP;
    const g = new THREE.Group();
    const rAt = (y) => lerp(rb, rt, y / h);
    const pts = profile([['M', rb - 0.25, 0.25], ['Q', rb - 0.05, 0.25, rb - 0.04, 0.0], ['Q', rb + 0.02, -0.02, rb + 0.03, 0.12], ['L', rAt(h - 0.1), h - 0.1]], 6);
    g.add(mesh(lathe(pts, 192, CUP.band), M.printed({ map: t.label, finish, size: [25, 11], grain: 0.1 })));
    const paper = M.printed({ color: c.body, finish: 'satin', size: [8, 8], grain: 0.1 });
    const rim = new THREE.TorusGeometry(rt + 0.02, 0.13, 16, 160); rim.rotateX(Math.PI / 2); rim.translate(0, h + 0.02, 0);
    g.add(mesh(rim, paper));
    // lid
    const L = rt + 0.2, y = h;
    const lid = profile([['M', L - 0.18, y - 0.45], ['L', L, y - 0.45], ['Q', L + 0.06, y - 0.1, L + 0.02, y + 0.18], ['Q', L - 0.02, y + 0.36, L - 0.3, y + 0.36], ['L', L - 0.5, y + 0.34], ['Q', L - 0.65, y + 0.12, L - 0.8, y + 0.14], ['L', L - 0.92, y + 0.2], ['Q', L - 1.05, y + 0.28, L - 1.1, y + 0.75], ['L', L - 1.25, y + 1.1], ['Q', L - 1.32, y + 1.22, L - 1.6, y + 1.22], ['L', 0, y + 1.24]], 8);
    const lidMat = M.plastic(c.accent, 'satin', { roughness: 0.36 });
    g.add(mesh(lathe(lid, 192), lidMat));
    const sip = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2); sip.scale(1.05, 0.32, 0.55); sip.translate(0, y + 1.2, L - 2.05);
    g.add(mesh(sip, lidMat));
    const hole = new THREE.CircleGeometry(1, 32); hole.scale(0.32, 0.08, 1); hole.rotateX(-0.85); hole.translate(0, y + 1.42, L - 1.68);
    g.add(mesh(hole, new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 0.6 }), false));
    return g;
  }
};

/* ---------- paper shopping bag ---------- */
const BAG = { w: 24, h: 30, d: 11 };
O.bag = {
  name: 'Shopping bag', colors: { body: 'paper inside and edges', accent: 'rope handles' },
  defaults: { variant: 'standard', finish: 'matte', scene: 'studio', camera: 'hero', count: 1, colors: { body: '#efe9df', accent: '#1d1d1d' } },
  variants: { standard: { name: 'Bag 24 × 30 × 11 cm', textures: (() => { const k = 2048 / BAG.h; const F = [BAG.w * k, BAG.h * k], S = [BAG.d * k, BAG.h * k]; return { front: tex(F[0], F[1], [F[0] * 0.08, F[1] * 0.14, F[0] * 0.84, F[1] * 0.78]), side: tex(S[0], S[1], [S[0] * 0.18, S[1] * 0.14, S[0] * 0.64, S[1] * 0.74]), back: tex(F[0], F[1], [F[0] * 0.08, F[1] * 0.14, F[0] * 0.84, F[1] * 0.78], { optional: true }) }; })() } },
  cameras: { hero: { az: -30, el: 14, fov: 24, fill: 0.76 }, front: { az: 0, el: 5, fov: 22, fill: 0.8 }, top: { az: -20, el: 55, fov: 24, fill: 0.74 }, close: { az: -24, el: 18, fov: 22, fill: 0.74, zoom: 1.6, focus: [0.5, 0.55, 0.8] } },
  arrange: [[[0, 0, 0, 0]], [[-0.38, 0, 0.35, 0], [0.42, 0, -0.75, -18]], [[0, 0, 0, 0], [-0.8, 0, -1.2, 14], [0.8, 0, -1.2, -14]]],
  build({ t, c, finish }) {
    const { w: W, h: H, d: D } = BAG;
    const g = new THREE.Group();
    const f = finish === 'gloss' ? 'satin' : finish;
    const ao = (geo) => { const p = geo.attributes.position, cl = []; for (let i = 0; i < p.count; i++) { const k = 0.3 + 0.62 * Math.pow(p.getY(i) / H, 0.9); cl.push(k, k, k); } geo.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); return geo; };
    const inner = new THREE.MeshStandardMaterial({ color: col(c.body), roughness: 0.9, side: THREE.BackSide, vertexColors: true });
    const wall = (geo, map, size) => { ao(geo); g.add(mesh(geo, M.printed({ map, finish: f, size, grain: 0.25, color: map ? '#ffffff' : c.body }))); g.add(mesh(geo, inner, false)); };
    const bow = (u, v) => 0.18 * Math.sin(Math.PI * u) * Math.sin(Math.PI * clamp(v, 0, 1)) ** 0.6;
    wall(surface(24, 24, (u, v, o) => o.set((u - 0.5) * W, v * H, D / 2 + bow(u, v))), t.front, [W, H]);
    wall(surface(24, 24, (u, v, o) => o.set((0.5 - u) * W, v * H, -D / 2 - bow(u, v))), t.back || t.front, [W, H]);
    const crease = (u, v) => 0.55 * (1 - Math.abs(2 * u - 1)) * smooth((v - 0.25) / 0.75);
    wall(surface(16, 24, (u, v, o) => o.set(W / 2 - crease(u, v), v * H, (0.5 - u) * D)), t.side, [D, H]);
    wall(surface(16, 24, (u, v, o) => o.set(-W / 2 + crease(u, v), v * H, (u - 0.5) * D)), t.side, [D, H]);
    const floor = new THREE.PlaneGeometry(W - 0.1, D - 0.1); floor.rotateX(-Math.PI / 2); floor.translate(0, 0.08, 0);
    g.add(mesh(floor, new THREE.MeshStandardMaterial({ color: col(c.body).multiplyScalar(0.3), roughness: 0.95 }), false));
    // top hem: a slightly thicker turned-over edge
    const hemMat = M.printed({ color: c.body, finish: 'matte', size: [10, 1], grain: 0.2 });
    [[W, 0, D / 2, 0], [W, 0, -D / 2, 0], [D, W / 2, 0, Math.PI / 2], [D, -W / 2, 0, Math.PI / 2]].forEach(([len, x, z, ry]) => {
      const hb = new THREE.BoxGeometry(len, 0.05, 0.06); hb.rotateY(ry); hb.translate(x, H - 0.02, z); g.add(mesh(hb, hemMat));
    });
    // rope handles
    const rope = M.plastic(c.accent, 'matte', { roughness: 0.82, clearcoat: 0 });
    rope.normalMap = tiled(PROC.ropeNormal, 26, 1); rope.normalScale.set(0.9, 0.9);
    [1, -1].forEach((s) => {
      const z = s * (D / 2 + 0.05), sx = 4.6;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-sx, H - 2.3, z), new THREE.Vector3(-sx - 0.5, H + 1.5, z + s * 0.35), new THREE.Vector3(-sx + 0.6, H + 7.2, z + s * 0.9),
        new THREE.Vector3(0, H + 8.6, z + s * 1.05), new THREE.Vector3(sx - 0.6, H + 7.2, z + s * 0.9), new THREE.Vector3(sx + 0.5, H + 1.5, z + s * 0.35), new THREE.Vector3(sx, H - 2.3, z)
      ]);
      g.add(mesh(new THREE.TubeGeometry(curve, 160, 0.21, 14, false), rope));
      [-sx, sx].forEach((x) => {
        const holeG = new THREE.CircleGeometry(0.33, 24); if (s < 0) holeG.rotateY(Math.PI); holeG.translate(x, H - 2.3, s * (D / 2 + 0.012) + s * 0.17);
        g.add(mesh(holeG, new THREE.MeshStandardMaterial({ color: 0x15110d, roughness: 1 }), false));
        const knot = new THREE.SphereGeometry(0.3, 16, 12); knot.translate(x, H - 2.3, s * (D / 2 + 0.06) + s * 0.17);
        g.add(mesh(knot, rope));
      });
    });
    return g;
  }
};

/* ---------- business cards ---------- */
const CARD = { w: 8.5, h: 5.5, t: 0.045 };
O.cards = {
  name: 'Business cards', colors: { paper: 'card stock edge (falls back to body)' },
  defaults: { variant: 'standard', finish: 'uncoated', scene: 'studio', camera: 'hero', count: 2, colors: { paper: '#f5f3ee' } },
  finishes: ['uncoated', 'matte', 'soft', 'satin', 'gloss'],
  variants: { standard: { name: '85 × 55 mm', textures: { front: tex(1700, 1100, insetSafe(1700, 1100, 0.07, 0.1)), back: tex(1700, 1100, insetSafe(1700, 1100, 0.07, 0.1)) } } },
  cameras: { hero: { az: 0, el: 42, fov: 24, fill: 0.84 }, front: { az: 0, el: 60, fov: 22, fill: 0.86 }, top: { az: 0, el: 89, fov: 24, fill: 0.84 }, close: { az: -12, el: 30, fov: 22, fill: 0.84, zoom: 1.9, focus: [0.3, 0.5, 0.55] } },
  arrange: [[[0, 0, 0, 0]], [[0, 0, 0, 0]], [[0, 0, 0, 0]]],
  contact: 1.1,
  build({ t, c, finish, count }) {
    const g = new THREE.Group(), rnd = mulberry(7);
    const paperC = c.paper || c.body || '#f5f3ee';
    const edge = M.printed({ color: paperC, finish: 'uncoated', size: [1, 1], grain: 0.2 });
    const front = M.printed({ map: t.front, finish, size: [CARD.w, CARD.h], grain: finish === 'gloss' ? 0.04 : 0.22 });
    const back = M.printed({ map: t.back || t.front, finish, size: [CARD.w, CARD.h], grain: finish === 'gloss' ? 0.04 : 0.22 });
    const geo = new THREE.BoxGeometry(CARD.w, CARD.t, CARD.h);
    const card = (flip) => { const m = mesh(geo, [edge, edge, front, back, edge, edge]); if (flip) m.rotation.x = Math.PI; return m; };
    const place = (m, x, y, z, ry) => { const p = new THREE.Group(); p.add(m); m.position.y = CARD.t / 2; p.position.set(x, y, z); p.rotation.y = ry * DEG; g.add(p); return p; };
    const stack = count >= 2 ? 5 : 1;
    const fx = count >= 2 ? -2.4 : 0, fz = count >= 2 ? 1.1 : 0;
    for (let i = 0; i < stack; i++) place(card(false), fx + (rnd() - 0.5) * 0.08, i * CARD.t, fz + (rnd() - 0.5) * 0.08, -9 + (rnd() - 0.5) * 1.6);
    if (count >= 2) place(card(true), 3.4, 0, -2.3, 11);
    if (count >= 3) place(card(true), -1.6, 0, -4.6, -24);
    return g;
  }
};

/* ---------- payment card ---------- */
const PAY = { w: 8.56, h: 5.398, t: 0.076, r: 0.318 };
function chipTexture() {
  const W = 320, H = 250, cv = mkCanvas(W, H), x = cv.getContext('2d');
  const gr = x.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#e9cf8f'); gr.addColorStop(0.5, '#c9a35a'); gr.addColorStop(1, '#e2c27e');
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#6d5124'; x.lineWidth = 7; x.lineCap = 'round';
  const ln = (a, b, c2, d) => { x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d); x.stroke(); };
  ln(W * 0.36, 0, W * 0.36, H); ln(W * 0.64, 0, W * 0.64, H);
  [0.27, 0.5, 0.73].forEach((f) => { ln(0, H * f, W * 0.36, H * f); ln(W * 0.64, H * f, W, H * f); });
  x.strokeRect(W * 0.36, H * 0.3, W * 0.28, H * 0.4);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t;
}
O.paycard = {
  name: 'Payment card', colors: { body: 'card core / edge', metal: 'chip (default gold)' },
  defaults: { variant: 'standard', finish: 'satin', scene: 'studio', camera: 'hero', count: 1, colors: { body: '#e6e6e6', metal: '#d8b86e' } },
  finishes: ['matte', 'satin', 'gloss', 'metal'],
  variants: { standard: { name: 'ISO ID-1', textures: { front: tex(2048, 1292, [130, 110, 1788, 1072]), back: tex(2048, 1292, [130, 110, 1788, 1072], { optional: true }) } } },
  cameras: { hero: { az: -14, el: 40, fov: 24, fill: 0.8 }, front: { az: 0, el: 62, fov: 22, fill: 0.84 }, top: { az: 0, el: 89, fov: 24, fill: 0.8 }, close: { az: -20, el: 28, fov: 22, fill: 0.8, zoom: 1.9, focus: [0.3, 0.5, 0.45] } },
  arrange: [[[0, 0, 0, -8]], [[-0.18, 1, 0.25, -12], [0.22, 0, -0.32, 10, 'flip']], [[0, 2, 0.3, -10], [0.3, 1, -0.3, 12, 'flip'], [-0.35, 0, -0.55, -30]]],
  contact: 1.1,
  build({ t, c, finish, place }) {
    const g = new THREE.Group();
    const flip = place && place[4] === 'flip';
    const geo = slab(roundRect(PAY.w, PAY.h, PAY.r, 12), PAY.t, 0.012, 12, 2);
    // back cap UVs mirrored vertically so the back reads upright when the card is flipped over X
    const uv = geo.attributes.uv; const g1 = geo.groups[1];
    for (let i = g1.start; i < g1.start + g1.count; i++) uv.setY(i, 1 - uv.getY(i));
    const f = finish === 'metal' ? 'satin' : finish;
    const face = M.printed({ map: t.front, finish: f, size: [8.5, 5.4], grain: 0, metalness: finish === 'metal' ? 0.85 : 0 });
    const backM = M.printed({ map: t.back || null, color: t.back ? '#ffffff' : c.body, finish: f, size: [8.5, 5.4], grain: 0 });
    const edge = M.plastic(c.body, 'satin');
    const card = mesh(geo, [face, backM, edge]);
    card.rotation.x = -Math.PI / 2;
    const chip = mesh(slab(roundRect(1.18, 0.92, 0.13, 6), 0.012, 0.003, 6, 1), [new THREE.MeshPhysicalMaterial({ color: col(c.metal), map: chipTexture(), metalness: 1, roughness: 0.28 }), M.metal(c.metal, 0.3, 0, 0), M.metal(c.metal, 0.3, 0, 0)]);
    chip.rotation.x = -Math.PI / 2; chip.position.set(-PAY.w / 2 + 1.55, PAY.t - 0.004, -(PAY.h / 2 - 2.32));
    const inner = new THREE.Group(); inner.add(card, chip);
    if (flip) { inner.rotation.x = Math.PI; inner.position.y = PAY.t; }
    g.add(inner);
    return g;
  }
};


/* ---------- hardcover book / notebook (lies cover up, spine on the left) ---------- */
const BOOK = { w: 15.2, h: 21.6, t: 2.2, board: 0.26, bulge: 0.42 };
O.book = {
  name: 'Book / notebook', colors: { body: 'board edges and back when no back art', paper: 'page block' },
  defaults: { variant: 'standard', finish: 'matte', scene: 'studio', camera: 'hero', count: 1, colors: { body: '#2b2b2b', paper: '#f3efe6' } },
  finishes: ['matte', 'soft', 'satin', 'gloss', 'cloth'],
  variants: { standard: { name: 'A5 hardcover', textures: (() => { const cw = BOOK.w - BOOK.bulge, [w, h] = fit(cw, BOOK.h, 2048); const sw = Math.round((h * (Math.PI * BOOK.t / 2 * 0.86)) / BOOK.h); return { cover: tex(w, h, insetSafe(w, h, 0.09, 0.07)), spine: tex(sw, h, [sw * 0.12, h * 0.05, sw * 0.76, h * 0.9]), back: tex(w, h, insetSafe(w, h, 0.09, 0.07), { optional: true }) }; })() } },
  cameras: { hero: { az: -24, el: 36, fov: 24, fill: 0.8 }, front: { az: 0, el: 62, fov: 22, fill: 0.84 }, top: { az: 0, el: 89, fov: 24, fill: 0.8 }, close: { az: -40, el: 22, fov: 22, fill: 0.8, zoom: 1.8, focus: [0.15, 0.5, 0.7] } },
  arrange: [[[0, 0, 0, 0]], [[0.02, 1, 0.04, -5], [0, 0, 0, 6]], [[0.02, 2, 0.03, -4], [-0.03, 1, 0.02, 7], [0.02, 0, 0, -2]]],
  build({ t, c, finish }) {
    const { w: W, h: H, t: T, board: B, bulge } = BOOK;
    const g = new THREE.Group();
    const f = finish === 'cloth' ? 'matte' : finish;
    const cover = M.printed({ map: t.cover, finish: f, size: [W, H], grain: 0.2 });
    if (finish === 'cloth' && SURF.linen && SURF.linen.normal) { cover.normalMap = tiled(SURF.linen.normal, W / 8, H / 8); cover.normalScale.set(0.5, 0.5); cover.roughness = 0.82; }
    const edge = M.printed({ color: c.body, finish: f, size: [W, 1], grain: 0.2 });
    const backM = M.printed({ map: t.back || null, color: t.back ? '#ffffff' : c.body, finish: f, size: [W, H], grain: 0.2 });
    const bw = W - bulge, bx = (W - bw) / 2;
    const top = new RoundedBoxGeometry(bw, B, H, 2, 0.07); top.translate(bx / 1, T - B / 2, 0);
    g.add(mesh(top, [edge, edge, cover, edge, edge, edge]));
    const bot = new RoundedBoxGeometry(bw, B, H, 2, 0.07); bot.translate(bx, B / 2, 0);
    g.add(mesh(bot, [edge, edge, edge, backM, edge, edge]));
    // spine: crescent extruded along the book height
    const x0 = -W / 2 + bulge, cy = T / 2, ro = T / 2, sh = new THREE.Shape(), n = 32;
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI; const px = x0 - Math.cos(a) * bulge, py = cy + Math.sin(a) * ro; i ? sh.lineTo(px, py) : sh.moveTo(px, py); }
    for (let i = n; i >= 0; i--) { const a = -Math.PI / 2 + (i / n) * Math.PI; sh.lineTo(x0 + 0.02 - Math.cos(a) * (bulge - B * 0.9), cy + Math.sin(a) * (ro - B * 0.9)); }
    const sp = slab(sh, H, 0, 64, 1);
    sp.translate(0, 0, -H / 2);
    const pos = sp.attributes.position, uv = sp.attributes.uv, side = sp.groups[2];
    for (let i = side.start; i < side.start + side.count; i++) {
      const a = Math.atan2(pos.getY(i) - cy, ro); // -pi/2 .. pi/2 bottom->top
      uv.setXY(i, clamp((pos.getY(i) - 0) / T, 0, 1), (H / 2 - pos.getZ(i)) / H);
    }
    const spineM = M.printed({ map: t.spine, finish: f, size: [3, H], grain: 0.2 });
    g.add(mesh(sp, [edge, edge, spineM]));
    // page block
    const pw = bw - 0.32, ph = T - 2 * B - 0.02, pd = H - 0.5;
    const pages = new THREE.BoxGeometry(pw, ph, pd); pages.translate(x0 + 0.02 + pw / 2 - 0.08, T / 2, 0);
    const edgeTex = (rx, ry) => { const m = new THREE.MeshStandardMaterial({ color: col(c.paper || '#f3efe6'), map: tiled(PROC.pageEdge, rx, ry), roughness: 0.9 }); return m; };
    const pe = edgeTex(1, 1.6), pf = edgeTex(1, 1.6);
    g.add(mesh(pages, [pe, pe, pf, pf, pe, pe]));
    return g;
  }
};

/* ---------- smartphone (lies screen up) ---------- */
const PHONE = { w: 7.16, h: 14.76, t: 0.78, r: 1.18, sw: 6.48, sh: 6.48 * 2556 / 1179, sr: 0.98 };
O.phone = {
  name: 'Smartphone', colors: { metal: 'frame', body: 'back glass' },
  defaults: { variant: 'standard', finish: 'gloss', scene: 'studio', camera: 'hero', count: 1, colors: { metal: '#2a2a2c', body: '#1c1c1e' } },
  variants: { standard: { name: '6.1 inch', textures: { screen: tex(1179, 2556, [60, 160, 1059, 2290]) } } },
  cameras: { hero: { az: -16, el: 50, fov: 24, fill: 0.82 }, front: { az: 0, el: 89, fov: 22, fill: 0.86 }, top: { az: 0, el: 89, fov: 24, fill: 0.86 }, close: { az: -22, el: 34, fov: 22, fill: 0.82, zoom: 1.8, focus: [0.5, 0.5, 0.25] } },
  arrange: [[[0, 0, 0, -8]], [[-0.62, 0, 0.06, -6], [0.62, 0, -0.06, 6]], [[0, 0, 0.05, 0], [-1.22, 0, -0.05, -6], [1.22, 0, -0.05, 6]]],
  build({ t, c }) {
    const g = new THREE.Group(), P = PHONE;
    const geo = slab(roundRect(P.w, P.h, P.r, 24), P.t, 0.13, 32, 5);
    const bezel = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 });
    const back = new THREE.MeshPhysicalMaterial({ color: col(c.body), roughness: 0.35, clearcoat: 0.6 });
    const frame = M.metal(c.metal, 0.3, 0.2, 0);
    const body = mesh(geo, [bezel, back, frame]);
    body.rotation.x = -Math.PI / 2;
    g.add(body);
    const sg = new THREE.ShapeGeometry(roundRect(P.sw, P.sh, P.sr, 24), 24);
    { const p = sg.attributes.position, uv = sg.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / P.sw + 0.5, p.getY(i) / P.sh + 0.5); }
    sg.rotateX(-Math.PI / 2); sg.translate(0, P.t + 0.0015, 0);
    g.add(mesh(sg, M.screen(t.screen), false));
    const isl = new THREE.ShapeGeometry(roundRect(1.95, 0.56, 0.28, 12)); isl.rotateX(-Math.PI / 2); isl.translate(0, P.t + 0.0025, -(P.sh / 2 - 0.62));
    g.add(mesh(isl, new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.35, envMapIntensity: 0.15 }), false));
    const btn = (len, x, z) => { const b = new RoundedBoxGeometry(0.08, 0.26, len, 2, 0.035); b.translate(x, P.t / 2, z); g.add(mesh(b, frame)); };
    btn(1.7, P.w / 2 + 0.02, -2.6); btn(1.05, -P.w / 2 - 0.02, -2.9); btn(1.05, -P.w / 2 - 0.02, -1.6); btn(0.55, -P.w / 2 - 0.02, -4.3);
    return g;
  }
};

/* ---------- laptop ---------- */
const LAP = { w: 30.4, d: 21.5, t: 1.1, lid: 0.5, sw: 28.6, sh: 17.875, open: 112 };
O.laptop = {
  name: 'Laptop', colors: { metal: 'aluminium body' },
  defaults: { variant: 'standard', finish: 'gloss', scene: 'studio', camera: 'hero', count: 1, colors: { metal: '#c7c9cc' } },
  variants: { standard: { name: '13 inch', textures: { screen: tex(2560, 1600, [120, 90, 2320, 1420]) } } },
  cameras: { hero: { az: -26, el: 17, fov: 24, fill: 0.8 }, front: { az: 0, el: 9, fov: 22, fill: 0.84 }, top: { az: 0, el: 55, fov: 24, fill: 0.8 }, close: { az: -16, el: 12, fov: 22, fill: 0.8, zoom: 1.6, focus: [0.5, 0.7, 0.2] } },
  arrange: [[[0, 0, 0, 0]]],
  build({ t, c }) {
    const g = new THREE.Group(), L = LAP;
    const alu = M.metal(c.metal, 0.3, 0.45, 0);
    const base = new RoundedBoxGeometry(L.w, L.t, L.d, 3, 0.32); base.translate(0, L.t / 2, 0);
    g.add(mesh(base, alu));
    // keyboard well + keys
    const kw = new THREE.ShapeGeometry(roundRect(28.2, 11.6, 0.35, 8)); kw.rotateX(-Math.PI / 2); kw.translate(0, L.t + 0.006, -3.9);
    g.add(mesh(kw, new THREE.MeshStandardMaterial({ color: col(c.metal).multiplyScalar(0.18), roughness: 0.7, metalness: 0.3 }), false));
    const u = 1.86, rows = [[[14, 1]], [[13, 1], [1, 1.5]], [[1, 1.5], [13, 1]], [[1, 1.8], [11, 1], [1, 1.8]], [[1, 2.35], [10, 1], [1, 2.35]], [[3, 1], [1, 1.25], [1, 5.05], [1, 1.25], [1, 1], [3, 1]]];
    const keys = [];
    rows.forEach((row, ri) => {
      let total = 0; row.forEach(([n, wv]) => (total += n * wv));
      let x = -total * u / 2; const z = ri === 0 ? -8.85 : -7.36 + (ri - 1) * u;
      row.forEach(([n, wv]) => { for (let k = 0; k < n; k++) { keys.push([x + (wv * u) / 2, z, wv * u - 0.26, ri === 0 ? 0.62 : u - 0.28]); x += wv * u; } });
    });
    const kg = new RoundedBoxGeometry(1, 0.08, 1, 2, 0.03);
    const km = new THREE.MeshPhysicalMaterial({ color: 0x151517, roughness: 0.55, sheen: 0.2 });
    const inst = new THREE.InstancedMesh(kg, km, keys.length); inst.castShadow = true; inst.receiveShadow = true;
    const mtx = new THREE.Matrix4();
    keys.forEach(([x, z, w, d], i) => { mtx.compose(new THREE.Vector3(x, L.t + 0.03, z), new THREE.Quaternion(), new THREE.Vector3(w, 1, d)); inst.setMatrixAt(i, mtx); });
    g.add(inst);
    const tp = new THREE.ShapeGeometry(roundRect(12.4, 7.8, 0.5, 10)); tp.rotateX(-Math.PI / 2); tp.translate(0, L.t + 0.006, L.d / 2 - 1.0 - 3.9);
    g.add(mesh(tp, new THREE.MeshPhysicalMaterial({ color: col(c.metal).multiplyScalar(0.92), roughness: 0.22, metalness: 0.7, clearcoat: 0.3 }), false));
    // lid on a hinge
    const hinge = new THREE.Group(); hinge.position.set(0, L.t, -L.d / 2 + 0.25);
    const lidG = new RoundedBoxGeometry(L.w, L.lid, L.d - 0.3, 3, 0.22); lidG.translate(0, L.lid / 2, (L.d - 0.3) / 2);
    hinge.add(mesh(lidG, alu));
    const bz = new THREE.ShapeGeometry(roundRect(L.w - 0.5, L.d - 0.8, 0.5, 10)); bz.rotateX(Math.PI / 2); bz.translate(0, -0.002, (L.d - 0.3) / 2);
    hinge.add(mesh(bz, new THREE.MeshPhysicalMaterial({ color: 0x060606, roughness: 0.08, clearcoat: 1 }), false));
    const sg = new THREE.ShapeGeometry(roundRect(L.sw, L.sh, 0.25, 8), 8);
    { const p = sg.attributes.position, uvA = sg.attributes.uv; for (let i = 0; i < p.count; i++) uvA.setXY(i, p.getX(i) / L.sw + 0.5, p.getY(i) / L.sh + 0.5); }
    sg.rotateX(Math.PI / 2); sg.translate(0, -0.004, 1.35 + L.sh / 2);
    hinge.add(mesh(sg, M.screen(t.screen), false));
    hinge.rotation.x = -(L.open * DEG);
    g.add(hinge);
    const hg = new THREE.CylinderGeometry(0.42, 0.42, 26, 32); hg.rotateZ(Math.PI / 2); hg.translate(0, L.t - 0.05, -L.d / 2 + 0.2);
    g.add(mesh(hg, M.metal(c.metal, 0.45, 0, 0)));
    return g;
  }
};

/* ---------- poster on a wall (framed, framed with mat, or hanger rails) ---------- */
const POSTER = { w: 42, h: 59.4, frame: 2.0, depth: 2.6, mat: 6, y: 95 };
O.poster = {
  name: 'Poster', colors: { accent: 'frame or hanger rails', paper: 'mat board' },
  defaults: { variant: 'frame', finish: 'matte', scene: 'wall', camera: 'hero', count: 1, colors: { accent: '#1b1b1b', paper: '#f7f5f0' } },
  variants: Object.fromEntries([['frame', 'Framed A2'], ['mat', 'Framed A2 with mat'], ['hanger', 'Hanger rails A2']].map(([k, n]) => [k, { name: n, textures: { poster: tex(1448, 2048, insetSafe(1448, 2048, 0.07, 0.06)) } }])),
  cameras: { hero: { az: -20, el: 4, fov: 24, fill: 0.74, yBias: 0 }, front: { az: 0, el: 0, fov: 22, fill: 0.78, yBias: 0 }, top: { az: 0, el: 0, fov: 22, fill: 0.62, yBias: 0 }, close: { az: -28, el: 6, fov: 22, fill: 0.74, zoom: 2.2, focus: [0.25, 0.75, 1] } },
  arrange: [[[0, 0, 0, 0]], [[-0.56, 0, 0, 0], [0.56, 0, 0, 0]], [[0, 0, 0, 0], [-1.08, 0, 0, 0], [1.08, 0, 0, 0]]],
  wallMounted: true,
  build({ t, c, v }) {
    const g = new THREE.Group(), P = POSTER;
    const paper = M.printed({ map: t.poster, finish: 'matte', size: [P.w, P.h], grain: 0.12 });
    paper.roughness = 0.8;
    if (v === 'hanger') {
      const wood = new THREE.MeshStandardMaterial({ color: col(c.accent === '#1b1b1b' ? '#c8a476' : c.accent), roughness: 0.6 });
      if (SURF.oak && SURF.oak.map && !(c.accent && c.accent !== '#1b1b1b')) { wood.map = tiled(SURF.oak.map, 0.5, 0.05); wood.color.set(0xffffff); }
      const pg = surface(30, 40, (u, vv, o) => o.set((u - 0.5) * P.w, (vv - 0.5) * P.h, 0.9 + 0.25 * Math.sin(u * Math.PI * 2.3 + 0.4) * Math.sin(vv * Math.PI)), (u, vv) => [u, vv]);
      g.add(mesh(pg, paper));
      [P.h / 2, -P.h / 2].forEach((y) => { const r = new RoundedBoxGeometry(P.w + 1.6, 1.5, 1.0, 2, 0.2); r.translate(0, y, 1.0); g.add(mesh(r, wood)); });
      const str = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-P.w / 2 + 2, P.h / 2 + 0.6, 0.9), new THREE.Vector3(0, P.h / 2 + 12, 0.25), new THREE.Vector3(P.w / 2 - 2, P.h / 2 + 0.6, 0.9)], false, 'catmullrom', 0.05), 64, 0.07, 6, false);
      g.add(mesh(str, new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.9 })));
      const nail = new THREE.CylinderGeometry(0.18, 0.18, 0.4, 16); nail.rotateX(Math.PI / 2); nail.translate(0, P.h / 2 + 12, 0.2); g.add(mesh(nail, M.metal('#888', 0.4, 0, 0)));
      g.position.y = P.y; return g;
    }
    const mat = v === 'mat' ? P.mat : 0, iw = P.w + 2 * mat, ih = P.h + 2 * mat, F = P.frame;
    const outer = roundRect(iw + 2 * F, ih + 2 * F, 0.08, 2), hole = new THREE.Path();
    hole.moveTo(-iw / 2, -ih / 2); hole.lineTo(-iw / 2, ih / 2); hole.lineTo(iw / 2, ih / 2); hole.lineTo(iw / 2, -ih / 2); hole.lineTo(-iw / 2, -ih / 2);
    outer.holes.push(hole);
    const fm = M.plastic(c.accent, 'satin', { roughness: 0.5, clearcoat: 0.15 });
    g.add(mesh(slab(outer, P.depth, 0.06, 2, 2), fm));
    const back = new THREE.PlaneGeometry(iw, ih); back.translate(0, 0, 0.4);
    if (mat) {
      const ms = new THREE.Shape(); ms.moveTo(-iw / 2, -ih / 2); ms.lineTo(iw / 2, -ih / 2); ms.lineTo(iw / 2, ih / 2); ms.lineTo(-iw / 2, ih / 2); ms.lineTo(-iw / 2, -ih / 2);
      const mh = new THREE.Path(); mh.moveTo(-P.w / 2 + 0.3, -P.h / 2 + 0.3); mh.lineTo(-P.w / 2 + 0.3, P.h / 2 - 0.3); mh.lineTo(P.w / 2 - 0.3, P.h / 2 - 0.3); mh.lineTo(P.w / 2 - 0.3, -P.h / 2 + 0.3); mh.lineTo(-P.w / 2 + 0.3, -P.h / 2 + 0.3); ms.holes.push(mh);
      const mg = slab(ms, 0.2, 0.03, 1, 1); mg.translate(0, 0, 0.62);
      g.add(mesh(mg, M.printed({ color: c.paper || '#f7f5f0', finish: 'uncoated', size: [iw, ih], grain: 0.15 })));
    }
    const art = new THREE.PlaneGeometry(P.w, P.h); art.translate(0, 0, 0.6);
    g.add(mesh(art, paper));
    const glass = new THREE.PlaneGeometry(iw, ih); glass.translate(0, 0, P.depth - 0.35);
    const gl = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.03, metalness: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 1.4 });
    const gm = mesh(glass, gl, false); gm.receiveShadow = false; gm.userData.noFit = true; g.add(gm);
    g.position.y = P.y;
    return g;
  },
  settingHints: (b) => ({ _wallZ: b.min.z })
};

/* ---------- billboard (outdoor) ---------- */
const BB = { w: 1200, h: 400, pole: 620, frame: 18, depth: 40 };
O.billboard = {
  name: 'Billboard', colors: { metal: 'structure' },
  defaults: { variant: 'standard', finish: 'matte', scene: 'outdoor', camera: 'hero', count: 1, colors: { metal: '#6f7378' } },
  variants: { standard: { name: '12 × 4 m', textures: { art: tex(3072, 1024, insetSafe(3072, 1024, 0.04, 0.08)) } } },
  cameras: { hero: { az: -26, el: -12, fov: 26, fill: 0.8, yBias: 0.04 }, front: { az: 0, el: -6, fov: 24, fill: 0.82, yBias: 0 }, top: { az: -10, el: -20, fov: 30, fill: 0.7, yBias: 0 }, close: { az: -34, el: -8, fov: 22, fill: 0.8, zoom: 1.8, focus: [0.3, 0.6, 0.8] } },
  arrange: [[[0, 0, 0, 0]]],
  shadowScale: 0.8,
  contact: 0,
  build({ t, c }) {
    const g = new THREE.Group(), B = BB, y0 = B.pole;
    const steel = M.metal(c.metal, 0.55, 0, 0); steel.metalness = 0.6;
    const dark = M.metal('#3b3e42', 0.6, 0, 0); dark.metalness = 0.5;
    const outer = new THREE.Shape(); const W2 = B.w / 2 + B.frame, H2 = B.h / 2 + B.frame;
    outer.moveTo(-W2, -H2); outer.lineTo(W2, -H2); outer.lineTo(W2, H2); outer.lineTo(-W2, H2); outer.lineTo(-W2, -H2);
    const hole = new THREE.Path(); hole.moveTo(-B.w / 2, -B.h / 2); hole.lineTo(-B.w / 2, B.h / 2); hole.lineTo(B.w / 2, B.h / 2); hole.lineTo(B.w / 2, -B.h / 2); hole.lineTo(-B.w / 2, -B.h / 2);
    outer.holes.push(hole);
    const fr = slab(outer, B.depth, 2, 1, 1); fr.translate(0, y0 + H2, 0);
    g.add(mesh(fr, steel));
    const face = new THREE.PlaneGeometry(B.w, B.h); face.translate(0, y0 + H2, B.depth - 8);
    const vinyl = M.printed({ map: t.art, finish: 'matte', size: [100, 33], grain: 0 }); vinyl.roughness = 0.7;
    g.add(mesh(face, vinyl));
    const backBox = new THREE.BoxGeometry(B.w + 2 * B.frame, B.h + 2 * B.frame, 4); backBox.translate(0, y0 + H2, 2);
    g.add(mesh(backBox, dark));
    // rear trusses and the T-head
    for (let i = -3; i <= 3; i++) { const v = new THREE.BoxGeometry(10, B.h + 2 * B.frame, 14); v.translate(i * 190, y0 + H2, -8); g.add(mesh(v, dark)); }
    [0.25, 0.75].forEach((f) => { const hb = new THREE.BoxGeometry(B.w, 12, 12); hb.translate(0, y0 + 2 * H2 * f, -20); g.add(mesh(hb, dark)); });
    const tHead = new THREE.BoxGeometry(700, 40, 40); tHead.translate(0, y0 + 40, -45); g.add(mesh(tHead, steel));
    const pole = new THREE.CylinderGeometry(40, 46, y0 + 60, 48); pole.translate(0, (y0 + 60) / 2, -45);
    const pm = mesh(pole, steel); pm.userData.noFit = true; g.add(pm);
    // catwalk + railing
    const deck = new THREE.BoxGeometry(B.w + 2 * B.frame, 6, 90); deck.translate(0, y0 - 14, 45);
    const grate = M.metal('#55595e', 0.6, 0, 0); grate.normalMap = tiled(PROC.ribNormal, 30, 1); grate.normalScale.set(0.6, 0.6);
    g.add(mesh(deck, grate));
    for (let i = 0; i <= 8; i++) { const p = new THREE.CylinderGeometry(2.2, 2.2, 95, 10); p.translate(-B.w / 2 - B.frame + i * (B.w + 2 * B.frame) / 8, y0 - 14 + 48, 86); g.add(mesh(p, steel)); }
    [95, 50].forEach((hh) => { const r = new THREE.CylinderGeometry(2.4, 2.4, B.w + 2 * B.frame, 10); r.rotateZ(Math.PI / 2); r.translate(0, y0 - 14 + hh, 86); g.add(mesh(r, steel)); });
    // lamps on goose-neck arms
    const lampM = M.plastic('#2c2f33', 'satin');
    [-450, -150, 150, 450].forEach((x) => {
      const top = y0 + 2 * H2;
      const arm = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x, top - 10, 10), new THREE.Vector3(x, top + 45, 30), new THREE.Vector3(x, top + 70, 90), new THREE.Vector3(x, top + 62, 140)]), 32, 3, 8, false);
      g.add(mesh(arm, steel));
      const head = new RoundedBoxGeometry(60, 12, 30, 2, 4); head.rotateX(0.5); head.translate(x, top + 58, 150);
      g.add(mesh(head, lampM));
    });
    return g;
  },
  settingHints: () => ({ _groundY: 0 })
};

/* ------------------------------------------------------------------ scenes */
const SC = {
  studio: { name: 'Studio sweep', env: 'studio', envIntensity: 0.8, floorEnv: 0.1, floorGain: 1.4, backdrop: '#EDEBE6', floor: 'cyc', surface: 'plaster', detail: 0.25, key: { az: -48, el: 52, intensity: 3.4, color: '#fff7ee', soft: 0.12 }, exposure: 0.9, vignette: 0.16, contact: 0.9 },
  table: { name: 'Oak table', env: 'studio', envIntensity: 0.8, floorEnv: 0.25, backdrop: '#E4DED4', floor: 'table', surface: 'oak', key: { az: -55, el: 42, intensity: 3.2, color: '#fff1e0', soft: 0.12 }, exposure: 0.9, vignette: 0.2, contact: 1.0, dof: 1.6 },
  concrete: { name: 'Concrete', env: 'studio', envIntensity: 0.8, floorEnv: 0.12, floorGain: 1.3, backdrop: '#C9C6C1', floor: 'cyc', surface: 'concrete', detail: 0.55, tile: 120, key: { az: -42, el: 50, intensity: 3.4, color: '#f6f7ff', soft: 0.1 }, exposure: 0.9, vignette: 0.22, contact: 1.0 },
  linen: { name: 'Linen sweep', env: 'studio', envIntensity: 0.8, floorEnv: 0.12, floorGain: 1.35, backdrop: '#E6DFD4', floor: 'cyc', surface: 'linen', detail: 1, tile: 26, key: { az: -50, el: 50, intensity: 3.4, color: '#fff5e8', soft: 0.14 }, exposure: 0.9, vignette: 0.18, contact: 1.0 },
  wall: { name: 'Wall and floor', env: 'studio', envIntensity: 0.75, backdrop: '#E9E5DE', floor: 'wall', surface: 'plaster', key: { az: -42, el: 38, intensity: 2.6, color: '#fff3e4', soft: 0.1 }, exposure: 1.0, vignette: 0.18, contact: 0.9, gobo: 'window' },
  outdoor: { name: 'Outdoor sky', env: 'sky', envIntensity: 1.0, backdrop: '#9DB7D5', floor: 'ground', surface: 'concrete', key: { az: -35, el: 48, intensity: 3.2, color: '#fff4e2', soft: 0.04 }, exposure: 0.9, vignette: 0.1, contact: 0.7, sky: true }
};

/* Seamless sweep: floor (z from +front to 0), quarter curve, vertical wall. Built in local space, scaled later. */
function cycGeometry(width, front, curveZ, radius, height, segs = 32) {
  const prof = [];
  prof.push([front, 0]);
  prof.push([curveZ, 0]);
  for (let i = 1; i <= segs; i++) { const a = (i / segs) * Math.PI / 2; prof.push([curveZ - Math.sin(a) * radius, radius - Math.cos(a) * radius]); }
  prof.push([curveZ - radius, height]);
  const P = [], U = [], I = [];
  let acc = 0;
  prof.forEach((p, j) => {
    if (j) acc += Math.hypot(p[0] - prof[j - 1][0], p[1] - prof[j - 1][1]);
    for (let i = 0; i <= 8; i++) { const x = (i / 8 - 0.5) * width; P.push(x, p[1], p[0]); U.push(x, -acc + front); }
  });
  for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < 8; i++) { const a = j * 9 + i, b = a + 1, c2 = a + 9, d = c2 + 1; I.push(a, b, c2, b, d, c2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}

/* Plane with UVs in centimetres so tiled surfaces keep their real-world scale. */
function cmPlane(w, h) { const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h); return g; }
function surfaceMaterial(name, tint, tileCm, detail = 1) {
  const s = SURF[name] || {};
  const m = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.92, metalness: 0 });
  if (s.map) { m.map = tiled(s.map, 1 / tileCm, 1 / tileCm); if (s.tint) m.color.multiplyScalar(1 / Math.pow(214 / 255, 2.2)); }
  if (s.normal) { m.normalMap = tiled(s.normal, 1 / tileCm, 1 / tileCm); m.normalScale.set(detail, detail); }
  if (s.map && s.tint && detail < 1) {
    // fade detail toward flat colour
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n diffuseColor.rgb = mix( diffuseColor.rgb / max(texture2D(map, vMapUv).rgb, vec3(0.001)) * vec3(${Math.pow(214 / 255, 2.2).toFixed(4)}), diffuseColor.rgb, ${detail.toFixed(3)} );`); };
    m.customProgramCacheKey = () => 'detail' + detail.toFixed(3);
  }
  return m;
}

/* Build backdrop + lights into root. b = product bounds (Box3), S = product size. */
function buildSetting(root, def, spec, b, S, envInfo) {
  const backdrop = col(spec.scene && spec.scene.backdrop, def.backdrop);
  const gain = def.floorGain || 1;
  const env = new THREE.Group(); env.name = 'setting'; root.add(env);
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  const add = (m) => { m.receiveShadow = true; m.castShadow = false; env.add(m); return m; };
  const F = 40 * S;
  if (def.floor === 'cyc') {
    const g = cycGeometry(F * 2, F, b.min.z - 1.6 * S, 2.2 * S, 30 * S);
    g.translate(cx, 0, 0);
    add(new THREE.Mesh(g, surfaceMaterial(def.surface, backdrop.clone().multiplyScalar(gain), def.tile || 60, def.detail)));
  } else if (def.floor === 'table' || def.floor === 'slab') {
    const fl = new THREE.Mesh(cmPlane(F, F), surfaceMaterial(def.surface, def.floor === 'table' && !(spec.scene && spec.scene.backdrop) ? new THREE.Color(1, 1, 1) : backdrop, def.surface === 'oak' ? 70 : def.surface === 'linen' ? 22 : 60, 1));
    if (def.surface === 'oak') fl.material.color.set(0xffffff), fl.material.roughness = 0.6;
    fl.rotation.x = -Math.PI / 2; fl.position.set(cx, 0, cz); add(fl);
    const wall = new THREE.Mesh(cmPlane(F, F), surfaceMaterial('plaster', def.surface === 'oak' ? backdrop : backdrop.clone().multiplyScalar(0.92), 80, 0.6));
    wall.position.set(cx, F / 2 - 1, b.min.z - 7 * S); add(wall);
  } else if (def.floor === 'wall') {
    const wallZ = spec._wallZ != null ? spec._wallZ : b.min.z - 0.35 * S;
    const fl = new THREE.Mesh(cmPlane(F, F), surfaceMaterial(def.surface || 'plaster', backdrop.clone().multiplyScalar(0.86), 70, 0.7));
    fl.rotation.x = -Math.PI / 2; fl.position.set(cx, 0, wallZ + F / 2); add(fl);
    const wall = new THREE.Mesh(cmPlane(F, F), surfaceMaterial(def.surface || 'plaster', backdrop.clone().multiplyScalar(gain), 70, 1));
    wall.position.set(cx, F / 2, wallZ); add(wall);
  } else if (def.floor === 'ground') {
    const fl = new THREE.Mesh(cmPlane(60 * S, 60 * S), surfaceMaterial('concrete', col('#7f8572'), 900, 0.6));
    fl.rotation.x = -Math.PI / 2; fl.position.set(cx, spec._groundY || 0, cz); add(fl);
  }
  return { env, backdrop };
}

/* ------------------------------------------------------------------ contact shadows (blurred depth from below a plane) */
let CS = null;
function contactShadowKit() {
  if (CS) return CS;
  const size = 512;
  const rt = new THREE.WebGLRenderTarget(size, size), rtBlur = new THREE.WebGLRenderTarget(size, size);
  rt.texture.generateMipmaps = rtBlur.texture.generateMipmaps = false;
  const depthMat = new THREE.MeshDepthMaterial();
  depthMat.userData.dark = { value: 1 };
  depthMat.onBeforeCompile = (sh) => {
    sh.uniforms.dark = depthMat.userData.dark;
    sh.fragmentShader = 'uniform float dark;\n' + sh.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4( vec3( 0.0 ), pow( 1.0 - fragCoordZ, 1.6 ) * dark );');
  };
  depthMat.depthTest = false; depthMat.depthWrite = false; depthMat.side = THREE.DoubleSide;
  const hb = new THREE.ShaderMaterial(HorizontalBlurShader), vb = new THREE.ShaderMaterial(VerticalBlurShader);
  hb.depthTest = vb.depthTest = false;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), hb);
  const qScene = new THREE.Scene(); qScene.add(quad);
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); qCam.position.z = 0.5;
  CS = { size, rt, rtBlur, depthMat, hb, vb, quad, qScene, qCam };
  return CS;
}
/* Renders the product's contact shadow onto a plane. basis: { origin, normal, up } in root space. Returns a mesh. */
function makeContactShadow(scene, root, product, hide, basis, extent, height, blur, opacity) {
  const k = contactShadowKit(), r = renderer;
  const tex = new THREE.WebGLRenderTarget(k.size, k.size); tex.texture.generateMipmaps = false;
  const eps = height * 0.02;
  const cam = new THREE.OrthographicCamera(-extent[0] / 2, extent[0] / 2, extent[1] / 2, -extent[1] / 2, 0, height + eps);
  root.add(cam);
  cam.position.copy(basis.origin).addScaledVector(basis.normal, -eps);
  cam.up.copy(basis.up);
  cam.lookAt(basis.origin.clone().add(basis.normal));
  cam.updateMatrixWorld(); root.updateMatrixWorld(true);
  // looking from the plane outwards: the image is mirrored, flip when applying
  const prevBg = scene.background, prevEnv = scene.environment;
  scene.background = null; scene.overrideMaterial = k.depthMat;
  hide.forEach((o) => (o.visible = false));
  const prevClear = r.getClearAlpha(); r.setClearAlpha(0);
  r.setRenderTarget(k.rt); r.clear(); r.render(scene, cam);
  scene.overrideMaterial = null; scene.background = prevBg; scene.environment = prevEnv;
  hide.forEach((o) => (o.visible = true));
  // blur passes
  const pass = (src, dst, mat, amount) => { k.quad.material = mat; mat.uniforms.tDiffuse.value = src.texture; if (mat === k.hb) mat.uniforms.h.value = amount / 256; else mat.uniforms.v.value = amount / 256; r.setRenderTarget(dst); r.render(k.qScene, k.qCam); };
  pass(k.rt, k.rtBlur, k.hb, blur); pass(k.rtBlur, k.rt, k.vb, blur);
  pass(k.rt, k.rtBlur, k.hb, blur * 0.4); pass(k.rtBlur, tex, k.vb, blur * 0.4);
  r.setRenderTarget(null); r.setClearAlpha(prevClear);
  root.remove(cam);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(extent[0], extent[1]), new THREE.MeshBasicMaterial({ map: tex.texture, transparent: true, opacity, depthWrite: false, color: 0x000000, toneMapped: false }));
  plane.material.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', 'vec4 sampledDiffuseColor = texture2D( map, vMapUv ); diffuseColor.a *= sampledDiffuseColor.a;'); };
  plane.userData.rt = tex;
  plane.renderOrder = 1;
  plane.position.copy(basis.origin).addScaledVector(basis.normal, 0.003 * (extent[0] + extent[1]) / 2 * 0.05 + 0.002);
  plane.up.copy(basis.up);
  plane.lookAt(plane.position.clone().add(basis.normal));
  { const uv = plane.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); } // camera image is mirrored
  plane.castShadow = false; plane.receiveShadow = false;
  return plane;
}

/* ------------------------------------------------------------------ camera fit */
function samplePoints(obj, max = 6000) {
  const pts = [];
  obj.updateMatrixWorld(true);
  obj.traverse((m) => {
    if (!m.isMesh || m.userData.noFit) return;
    const p = m.geometry.attributes.position; const step = Math.max(1, Math.floor(p.count / 800));
    for (let i = 0; i < p.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
  });
  if (pts.length > max) { const s = pts.length / max; return pts.filter((_, i) => i % Math.ceil(s) === 0); }
  return pts;
}
function fitCamera(cam, pts, center, az, el, fill, aspect, yBias = 0) {
  const dir = new THREE.Vector3(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), Math.cos(az * DEG) * Math.cos(el * DEG));
  cam.aspect = aspect; cam.updateProjectionMatrix();
  if (el > 85) cam.up.set(0, 0, -1); else cam.up.set(0, 1, 0);
  const target = center.clone();
  let dist = 4 * center.distanceTo(pts[0] || center) + 10;
  const v = new THREE.Vector3();
  for (let it = 0; it < 8; it++) {
    cam.position.copy(target).addScaledVector(dir, dist); cam.lookAt(target); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { v.copy(p).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    const sx = (x1 - x0) / 2, sy = (y1 - y0) / 2, s = Math.max(sx, sy) / fill;
    // recentre: shift target by the ndc centre offset
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - yBias;
    const hh = Math.tan((cam.fov * DEG) / 2) * dist, hw = hh * cam.aspect;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    target.addScaledVector(right, mx * hw).addScaledVector(up, my * hh);
    dist *= s;
  }
  cam.position.copy(target).addScaledVector(dir, dist); cam.lookAt(target);
  cam.near = Math.max(0.05, dist * 0.05); cam.far = dist * 60; cam.updateProjectionMatrix();
  return { target, dist, dir };
}

/* ------------------------------------------------------------------ accumulation renderer */
let FS = null;
function fsKit() {
  if (FS) return FS;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  const scene = new THREE.Scene(); scene.add(quad);
  const acc = new THREE.ShaderMaterial({
    uniforms: { t: { value: null }, w: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D t; uniform float w; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(t, vUv).rgb * w, w); }',
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
    depthTest: false, depthWrite: false, toneMapped: false
  });
  const out = new THREE.ShaderMaterial({
    uniforms: { t: { value: null }, vignette: { value: 0.15 }, grain: { value: 0.012 }, res: { value: new THREE.Vector2(1, 1) }, seed: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D t; uniform float vignette; uniform float grain; uniform vec2 res; uniform float seed; varying vec2 vUv;
      float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      void main(){
        vec3 c = texture2D(t, vUv).rgb;
        vec2 d = (vUv - 0.5) * vec2(res.x / res.y, 1.0);
        c *= 1.0 - vignette * smoothstep(0.25, 1.0, length(d) * 1.15);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        float n = h12(gl_FragCoord.xy + seed) + h12(gl_FragCoord.yx * 1.37 + seed) - 1.0;
        gl_FragColor.rgb += n * grain;
      }`,
    depthTest: false, depthWrite: false
  });
  FS = { cam, quad, scene, acc, out, rtA: null, rtF: null };
  return FS;
}
function ensureTargets(w, h) {
  const k = fsKit();
  if (!k.rtA || k.rtA.width !== w || k.rtA.height !== h) {
    if (k.rtA) { k.rtA.dispose(); k.rtF.dispose(); }
    k.rtA = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
    k.rtF = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true });
    k.rtA.texture.generateMipmaps = k.rtF.texture.generateMipmaps = false;
  }
  return k;
}

/* ------------------------------------------------------------------ render */
function textureFromCanvas(c, wrap) {
  if (!c) return null;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.wrapS = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function disposeTree(o) {
  o.traverse((m) => {
    if (m.geometry) m.geometry.dispose();
    if (m.userData && m.userData.rt) m.userData.rt.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mt of mats) {
      for (const k in mt) { const v = mt[k]; if (v && v.isTexture && !v.userData.shared) v.dispose(); }
      mt.dispose();
    }
  });
}

function resolveSpec(spec) {
  const obj = O[spec.object];
  if (!obj) throw new Error('Studio3D: unknown object ' + spec.object);
  const variant = obj.variants[spec.variant] ? spec.variant : obj.defaults.variant;
  const sceneIn = typeof spec.scene === 'string' ? { preset: spec.scene } : spec.scene || {};
  const preset = SC[sceneIn.preset] ? sceneIn.preset : obj.defaults.scene;
  const camName = typeof spec.camera === 'string' ? spec.camera : (spec.camera && spec.camera.preset) || obj.defaults.camera;
  const camBase = obj.cameras[camName] || obj.cameras.hero;
  const camVar = (obj.cameraVariant && obj.cameraVariant[variant] && obj.cameraVariant[variant][camName]) || {};
  const camOver = typeof spec.camera === 'object' ? spec.camera : {};
  const cam = { ...camBase, ...camVar, ...camOver };
  const colors = { ...obj.defaults.colors };
  for (const [k, v] of Object.entries(spec.colors || {})) if (v != null && v !== '') colors[k] = v;
  const count = clamp(Math.round(spec.count || obj.defaults.count || 1), 1, (obj.arrange && obj.arrange.length) || 1);
  return { obj, variant, preset, sceneIn: { ...sceneIn, preset }, camName, cam, colors, count, finish: spec.finish || obj.defaults.finish, width: Math.round(spec.width || 1600), height: Math.round(spec.height || 1200) };
}

async function renderNow(spec) {
  const R = resolveSpec(spec);
  const { obj, variant } = R;
  let def = { ...SC[R.preset], ...(obj.sceneOverrides && obj.sceneOverrides[R.preset]) };
  if (obj.wallMounted && def.floor !== 'wall' && def.floor !== 'ground') def = { ...def, floor: 'wall', surface: def.surface === 'concrete' ? 'concrete' : 'plaster', floorGain: 1, key: { ...def.key, el: 38 } };
  const W = R.width, H = R.height;
  const r = initRenderer();
  const t0 = performance.now();

  // textures
  const decl = obj.variants[variant].textures, t = {};
  for (const k of Object.keys(decl)) t[k] = textureFromCanvas(spec.textures && spec.textures[k], decl[k].wrap);

  const scene = new THREE.Scene();
  const root = new THREE.Group(); scene.add(root);
  const product = new THREE.Group(); product.name = 'product'; root.add(product);
  const ctx = { t, c: R.colors, v: variant, finish: R.finish, spec, count: R.count };
  const layout = (obj.arrange && obj.arrange[R.count - 1]) || [[0, 0, 0, 0]];
  let unit = null;
  layout.forEach((pl, i) => {
    const item = obj.build({ ...ctx, index: i, place: pl });
    if (!unit) { const bb = new THREE.Box3().setFromObject(item); unit = bb.getSize(new THREE.Vector3()); }
    item.position.x += pl[0] * unit.x; item.position.y += pl[1] * unit.y; item.position.z += pl[2] * Math.max(unit.z, unit.x * 0.6);
    item.rotation.y += (pl[3] || 0) * DEG;
    product.add(item);
  });
  product.traverse((m) => { if (m.isMesh && m.castShadow !== false) m.castShadow = true; });
  root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(product);
  const size = b.getSize(new THREE.Vector3()), S = Math.max(size.x, size.y, size.z);
  const center = b.getCenter(new THREE.Vector3());

  // environment, oriented so the HDRI key matches the key light azimuth. Everything is laid out in root space
  // with root unrotated; root (and the camera, which is not parented) are rotated by `yaw` at the end.
  const envInfo = ENV[def.env] || ENV.studio;
  scene.environment = envInfo.env;
  const userScene = R.sceneIn;
  const keyAz = (userScene.lightAz != null ? userScene.lightAz : def.key.az) + (R.cam.az || 0) * 0.5;
  const kd = envInfo.keyDir, phiW = Math.atan2(kd.z, kd.x);
  const yaw = Math.PI / 2 - phiW - keyAz * DEG;
  if (def.sky && envInfo.bg) { scene.background = envInfo.bg; scene.backgroundIntensity = 1; scene.backgroundBlurriness = 0; }
  const setting = buildSetting(root, def, { ...spec, ...(obj.settingHints ? obj.settingHints(b, S, variant) : {}) }, b, S, envInfo);
  if (!scene.background) scene.background = setting.backdrop.clone();
  const envI = def.envIntensity * (userScene.envIntensity || 1);
  scene.traverse((m) => { if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach((mt) => { if ('envMapIntensity' in mt) mt.envMapIntensity *= envI; }); });
  setting.env.traverse((m) => { if (m.isMesh && 'envMapIntensity' in m.material) m.material.envMapIntensity = envI * (def.floorEnv != null ? def.floorEnv : 0.4); });

  // key light (jittered per frame for soft shadows)
  const key = new THREE.DirectionalLight(col(def.key.color), def.key.intensity * (userScene.light || 1));
  const kEl = (userScene.lightEl != null ? userScene.lightEl : def.key.el) * DEG, kAz = keyAz * DEG;
  const keyDir = new THREE.Vector3(Math.sin(kAz) * Math.cos(kEl), Math.sin(kEl), Math.cos(kAz) * Math.cos(kEl));
  const lightDist = S * 12;
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const sr = S * (obj.shadowScale || 1.2) + def.key.soft * lightDist;
  Object.assign(key.shadow.camera, { left: -sr, right: sr, top: sr, bottom: -sr, near: lightDist * 0.3, far: lightDist * 2.2 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0004; key.shadow.normalBias = S * 0.001; key.shadow.radius = def.key.blur || 10; key.shadow.blurSamples = 16;
  root.add(key); root.add(key.target); key.target.position.copy(center);

  // gobo (window frame casting shadows on the wall), invisible to the camera
  if (def.gobo && obj.gobo !== false && userScene.gobo !== false) {
    const gm = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const gob = new THREE.Group(); gob.name = 'gobo';
    const bar = (w, h) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, S * 0.05), gm); m.castShadow = true; m.userData.noFit = true; return m; };
    const span = S * 3.2;
    for (let i = -2; i <= 2; i++) { const m = bar(S * 0.1, span * 2); m.position.x = i * S * 0.9; gob.add(m); }
    const hbar = bar(span * 2, S * 0.1); gob.add(hbar);
    gob.position.copy(center).addScaledVector(keyDir, S * 1.6);
    gob.lookAt(center); gob.rotateZ(0.12);
    root.add(gob);
    const gr = S * 2.6 + def.key.soft * lightDist;
    key.shadow.camera.left = key.shadow.camera.bottom = -gr; key.shadow.camera.right = key.shadow.camera.top = gr; key.shadow.camera.updateProjectionMatrix();
    key.shadow.mapSize.set(2048, 2048);
  }

  // contact shadows: tight + ambient, on the floor (and on the wall when the object hangs on it)
  const hide = [setting.env]; root.children.forEach((ch) => { if (ch.name === 'gobo') hide.push(ch); });
  const contact = def.contact * (obj.contact != null ? obj.contact : 1);
  const shadows = [];
  if (!obj.wallMounted && def.floor !== 'ground') {
    const ext = [size.x + S * 0.9, size.z + S * 0.9];
    const basis = { origin: new THREE.Vector3(center.x, b.min.y, center.z), normal: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) };
    shadows.push(makeContactShadow(scene, root, product, hide, basis, ext, Math.max(size.y * 0.06, S * 0.02), 1.0, 0.75 * contact));
    shadows.push(makeContactShadow(scene, root, product, hide, basis, ext.map((e) => e * 1.3), Math.max(size.y * 0.5, S * 0.2), 4.0, 0.5 * contact));
  }
  if (obj.wallMounted) {
    const ext = [size.x + S * 0.6, size.y + S * 0.6];
    const basis = { origin: new THREE.Vector3(center.x, center.y, b.min.z), normal: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) };
    shadows.push(makeContactShadow(scene, root, product, hide, basis, ext, size.z * 1.2, 2.0, 0.55 * contact));
  }
  shadows.forEach((s) => root.add(s));

  // camera, fitted in root space, then moved to world space with the yaw
  const camDef = R.cam;
  const cam = new THREE.PerspectiveCamera(camDef.fov || 24, W / H, 0.1, 1000);
  const pts = samplePoints(product);
  const fitRes = fitCamera(cam, pts, center, camDef.az || 0, camDef.el || 10, camDef.fill || 0.75, W / H, camDef.yBias != null ? camDef.yBias : -0.04);
  if (camDef.zoom) {
    const f = camDef.focus || [0.5, 0.6, 0.5];
    const fp = new THREE.Vector3(lerp(b.min.x, b.max.x, f[0]), lerp(b.min.y, b.max.y, f[1]), lerp(b.min.z, b.max.z, f[2]));
    fitRes.target.copy(fp); fitRes.dist /= camDef.zoom;
  }
  const Y = new THREE.Vector3(0, 1, 0);
  const basePos = fitRes.target.clone().addScaledVector(fitRes.dir, fitRes.dist).applyAxisAngle(Y, yaw);
  const targetW = fitRes.target.clone().applyAxisAngle(Y, yaw);
  // focus a little in front of the centre (the face the viewer reads)
  const focusW = basePos.clone().add(targetW.clone().sub(basePos).normalize().multiplyScalar(Math.max(fitRes.dist * 0.5, fitRes.dist - 0.3 * Math.min(size.x, size.z))));
  cam.up.applyAxisAngle(Y, yaw);
  root.rotation.y = yaw; root.updateMatrixWorld(true);
  cam.near = Math.max(0.05, fitRes.dist * 0.15); cam.far = fitRes.dist + S * (def.sky ? 40 : 14); cam.updateProjectionMatrix();

  // accumulate
  r.setSize(W, H, false);
  r.toneMappingExposure = (def.exposure || 1) * (userScene.exposure || 1);
  const k = ensureTargets(W, H);
  const N = clamp(Math.round(spec.samples || ({ draft: 4, final: 14, high: 32 }[spec.quality] || (W * H > 2.5e6 ? 10 : 14))), 1, 64);
  const aperture = (spec.dof != null ? spec.dof : camDef.dof != null ? camDef.dof : def.dof != null ? def.dof : 0.25) * fitRes.dist * 0.004;
  const right = new THREE.Vector3(), upv = new THREE.Vector3(), lightRight = new THREE.Vector3(), lightUp = new THREE.Vector3();
  lightRight.crossVectors(keyDir, new THREE.Vector3(0, 1, 0)).normalize(); lightUp.crossVectors(lightRight, keyDir).normalize();
  r.setRenderTarget(k.rtA); r.setClearColor(0x000000, 1); r.clear();
  for (let i = 0; i < N; i++) {
    const ga = i * 2.39996, gr = Math.sqrt((i + 0.5) / N);
    // light on a disc
    const lj = def.key.soft * lightDist;
    key.position.copy(center).addScaledVector(keyDir, lightDist).addScaledVector(lightRight, Math.cos(ga) * gr * lj).addScaledVector(lightUp, Math.sin(ga) * gr * lj);
    // lens: subpixel jitter + tiny aperture
    cam.position.copy(basePos);
    cam.lookAt(targetW); cam.updateMatrixWorld();
    right.setFromMatrixColumn(cam.matrixWorld, 0); upv.setFromMatrixColumn(cam.matrixWorld, 1);
    const ab = (i * 1.7 + 0.3) * 2.39996, arr = Math.sqrt(((i * 7) % N + 0.5) / N) * aperture;
    cam.position.addScaledVector(right, Math.cos(ab) * arr).addScaledVector(upv, Math.sin(ab) * arr);
    cam.lookAt(focusW);
    cam.setViewOffset(W, H, halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5, W, H);
    root.updateMatrixWorld(true);
    r.setRenderTarget(k.rtF); r.setClearColor(scene.background && scene.background.isColor ? scene.background : 0x000000, 1); r.clear();
    r.render(scene, cam);
    k.quad.material = k.acc; k.acc.uniforms.t.value = k.rtF.texture; k.acc.uniforms.w.value = 1 / N;
    r.setRenderTarget(k.rtA); r.render(k.scene, k.cam);
    if (i % 4 === 3) await new Promise((res) => setTimeout(res, 0));
  }
  cam.clearViewOffset();
  k.quad.material = k.out;
  k.out.uniforms.t.value = k.rtA.texture; k.out.uniforms.vignette.value = userScene.vignette != null ? userScene.vignette : def.vignette;
  k.out.uniforms.res.value.set(W, H); k.out.uniforms.grain.value = spec.grain != null ? spec.grain : 0.01; k.out.uniforms.seed.value = Math.random() * 100;
  r.setRenderTarget(null); r.render(k.scene, k.cam);

  const fmt = spec.format === 'png' ? 'image/png' : 'image/jpeg';
  const url = await new Promise((res) => {
    if (spec.output === 'dataurl') return res(r.domElement.toDataURL(fmt, 0.92));
    r.domElement.toBlob((blob) => res(URL.createObjectURL(blob)), fmt, 0.92);
  });
  // cleanup
  disposeTree(scene);
  Object.values(t).forEach((x) => x && x.dispose());
  scene.environment = null; scene.background = null;
  API.lastStats = { ms: Math.round(performance.now() - t0), samples: N, width: W, height: H };
  return url;
}

/* ------------------------------------------------------------------ queue + cache */
const cache = new Map();
const CACHE_MAX = 80;
let queue = Promise.resolve();
const fpCanvas = mkCanvas(16, 16), fpCtx = fpCanvas.getContext('2d', { willReadFrequently: true });
function fingerprint(textures) {
  if (!textures) return '';
  const parts = [];
  for (const k of Object.keys(textures).sort()) {
    const c = textures[k]; if (!c) continue;
    try { fpCtx.clearRect(0, 0, 16, 16); fpCtx.drawImage(c, 0, 0, 16, 16); parts.push(k + c.width + 'x' + c.height + hashStr(Array.from(fpCtx.getImageData(0, 0, 16, 16).data).join(','))); } catch (e) { parts.push(k + Math.random()); }
  }
  return parts.join('|');
}
function render(spec) {
  if (!supported) return Promise.reject(new Error('Studio3D: WebGL is not available'));
  const { textures, key, ...rest } = spec;
  const ck = JSON.stringify(rest) + '#' + (key != null ? 'k:' + key : fingerprint(textures)) + '#' + VERSION;
  if (cache.has(ck)) { const v = cache.get(ck); cache.delete(ck); cache.set(ck, v); return v; }
  const p = (queue = queue.then(() => API.ready).then(() => renderNow(spec)));
  queue = queue.catch(() => {});
  cache.set(ck, p);
  p.catch(() => cache.delete(ck));
  while (cache.size > CACHE_MAX) { const [oldK, oldV] = cache.entries().next().value; cache.delete(oldK); oldV.then((u) => { if (u && u.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(u), 60000); }).catch(() => {}); }
  return p;
}

/* ------------------------------------------------------------------ public API */
const OBJECTS = {}, CAMERAS = { hero: { name: 'Hero 3/4' }, front: { name: 'Front' }, top: { name: 'Flat lay' }, close: { name: 'Close-up' } }, SCENES = {};
function publishCatalog() {
  for (const [id, o] of Object.entries(O)) {
    const dv = o.defaults.variant;
    OBJECTS[id] = {
      name: o.name, textures: o.variants[dv].textures, colors: Object.keys(o.colors), colorRoles: o.colors,
      variants: Object.fromEntries(Object.entries(o.variants).map(([k, v]) => [k, { name: v.name, textures: v.textures }])),
      defaultVariant: dv, finishes: o.finishes || ['matte', 'satin', 'gloss'], defaults: { ...o.defaults },
      cameras: Object.fromEntries(Object.entries(o.cameras).map(([k, v]) => [k, { ...v }])), maxCount: (o.arrange && o.arrange.length) || 1
    };
  }
  for (const [id, s] of Object.entries(SC)) SCENES[id] = { name: s.name, backdrop: s.backdrop };
}
publishCatalog();

const API = {
  version: VERSION, supported, OBJECTS, SCENES, CAMERAS, render,
  textureSpec(object, variant) { const o = O[object]; if (!o) return null; return (o.variants[variant] || o.variants[o.defaults.variant]).textures; },
  clearCache() { cache.clear(); },
  lastStats: null,
  _three: THREE
};
API.ready = supported ? loadAssets().then(() => API) : Promise.resolve(API);
PG.Studio3D = API;
window.dispatchEvent(new Event('pg:studio3d-ready'));
