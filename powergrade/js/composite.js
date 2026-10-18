/* Photo-mockup compositor.
   Places flat artwork onto a photographed surface (a quad of four corners) with a true perspective
   transform, then relights it with the photo's own shading so folds, grain, shadows and highlights
   stay visible. WebGL2 does the warp and blend per pixel; results come back as canvases.

   PG.Composite.render(baseImage, surfaces[{quad, art: canvas, blend, curve}], {maxW}) → canvas
   PG.Composite.homography(srcQuad, dstQuad) → 3×3 matrix (row-major)                            */
window.PG = window.PG || {};

(function () {
  /* Solve the 8-parameter homography mapping 4 src points to 4 dst points. */
  function homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    // Gaussian elimination
    for (let c = 0; c < 8; c++) {
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const h = b.map((v, i) => v / A[i][i]);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  const VS = `#version 300 es
  in vec2 p; out vec2 vPx; uniform vec2 uSize;
  void main(){ vPx = (p * 0.5 + 0.5) * uSize; vPx.y = uSize.y - vPx.y; gl_Position = vec4(p, 0.0, 1.0); }`;
  /* For each output pixel: map back to artwork UV with the inverse homography, sample, relight with the photo. */
  const FS = `#version 300 es
  precision highp float;
  in vec2 vPx; out vec4 o;
  uniform sampler2D uBase, uArt, uLight; uniform mat3 uH; uniform vec2 uSize;
  uniform float uWhite, uMode, uCurve, uMul, uGloss;
  void main(){
    vec2 buv = vPx / uSize;
    vec4 base = texture(uBase, buv);
    vec3 q = uH * vec3(vPx, 1.0);
    vec2 uv = q.xy / q.z;
    // Soft edge: fade over ~1 output pixel at the quad border (tested on the flat quad, before any curve).
    vec2 fw = fwidth(uv);
    vec2 e = smoothstep(vec2(0.0), fw, uv) * (1.0 - smoothstep(vec2(1.0) - fw, vec2(1.0), uv));
    float inside = e.x * e.y;
    if (inside <= 0.0) { o = base; return; }
    // Cylinder: the quad is the projected outline, so compress the artwork towards the sides.
    if (uCurve > 0.0) { float c = clamp(uCurve, 0.0, 0.95); float x = clamp(uv.x, 0.0, 1.0) * 2.0 - 1.0; uv.x = 0.5 + 0.5 * asin(x * sin(c * 1.5707963)) / (c * 1.5707963); }
    vec4 art = texture(uArt, vec2(uv.x, uv.y));
    float lum = dot(base.rgb, vec3(0.299, 0.587, 0.114));
    // Light for replaced surfaces comes from a blurred copy, so print already on the surface
    // (an old poster, a screen's content) doesn't show through, only the broad fall-off and glare.
    float llum = dot(texture(uLight, buv).rgb, vec3(0.299, 0.587, 0.114));
    vec3 shade = vec3(clamp(llum / max(uWhite, 0.05), 0.0, 1.35));
    vec3 col;
    if (uMode < 0.5) {
      // Multiply: light surfaces. White artwork reproduces the surface exactly.
      col = art.rgb * mix(vec3(1.0), base.rgb / max(uWhite, 0.05), uMul);
    } else {
      // Normal + relight: dark or coloured surfaces. Keep the photo's light falloff and folds.
      col = art.rgb * mix(vec3(1.0), shade, uMul);
      // Specular highlights from the photo (bright spots above the surface's white point).
      float spec = smoothstep(max(uWhite * 1.25, 0.6), 1.0, llum) * uGloss;
      col = col + (1.0 - col) * spec;
    }
    o = vec4(mix(base.rgb, col, inside * art.a), 1.0);
  }`;

  let gl = null, prog = null, cvs = null;
  function init() {
    if (gl) return gl;
    cvs = document.createElement('canvas');
    gl = cvs.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is not available in this browser');
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    return gl;
  }
  function tex(unit, src) {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  /* White point of a surface: a high percentile of luminance inside the quad, so the brightest
     unshadowed part of the surface maps to "paper white" and everything else becomes shading. */
  function whitePoint(img, quad, scale) {
    const xs = quad.map((p) => p[0] * scale), ys = quad.map((p) => p[1] * scale);
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const w = Math.max(1, Math.ceil(Math.max(...xs)) - x0), h = Math.max(1, Math.ceil(Math.max(...ys)) - y0);
    const c = document.createElement('canvas'), k = Math.min(1, 160 / Math.max(w, h));
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const g = c.getContext('2d'); g.drawImage(img, x0 / scale, y0 / scale, w / scale, h / scale, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data, L = [];
    for (let i = 0; i < d.length; i += 4) L.push((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255);
    L.sort((a, b) => a - b);
    return { white: L[Math.floor(L.length * 0.92)] || 1, mean: L[Math.floor(L.length * 0.5)] || 0.5 };
  }

  /* A blurred copy of the scene, radius scaled to the surface, for low-frequency lighting. */
  function blurred(src, quad) {
    const xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
    const r = Math.max(2, Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.3);
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d'); g.filter = `blur(${Math.round(r)}px)`; g.drawImage(src, 0, 0); g.filter = 'none';
    return c;
  }

  /* Render: base image + artwork on each surface. Returns a 2D canvas. */
  function render(baseImg, surfaces, opts) {
    opts = opts || {};
    init();
    const iw = baseImg.naturalWidth || baseImg.width, ih = baseImg.naturalHeight || baseImg.height;
    const scale = Math.min(1, (opts.maxW || 2000) / iw);
    const W = Math.round(iw * scale), H = Math.round(ih * scale);
    cvs.width = W; cvs.height = H; gl.viewport(0, 0, W, H);
    // Each surface is a pass; the previous pass's result becomes the next base.
    let base = document.createElement('canvas'); base.width = W; base.height = H;
    base.getContext('2d').drawImage(baseImg, 0, 0, W, H);
    for (const s of surfaces) {
      if (!s.art) continue;
      const aw = s.art.width, ah = s.art.height;
      const dst = s.quad.map(([x, y]) => [x * scale, y * scale]);
      // Map output pixels → normalised artwork UV.
      const H3 = homography(dst, [[0, 0], [1, 0], [1, 1], [0, 1]]);
      const wp = whitePoint(baseImg, s.quad, scale);
      const dark = s.blend === 'normal' || wp.white < 0.45;
      const light = dark ? blurred(base, dst) : base;
      const t0 = tex(0, base), t1 = tex(1, s.art), t2 = tex(2, light);
      gl.uniform1i(gl.getUniformLocation(prog, 'uBase'), 0);
      gl.uniform1i(gl.getUniformLocation(prog, 'uArt'), 1);
      gl.uniform1i(gl.getUniformLocation(prog, 'uLight'), 2);
      gl.uniformMatrix3fv(gl.getUniformLocation(prog, 'uH'), true, new Float32Array(H3));
      gl.uniform2f(gl.getUniformLocation(prog, 'uSize'), W, H);
      gl.uniform1f(gl.getUniformLocation(prog, 'uWhite'), dark ? Math.max(wp.mean, 0.08) : wp.white);
      gl.uniform1f(gl.getUniformLocation(prog, 'uMode'), dark ? 1 : 0);
      gl.uniform1f(gl.getUniformLocation(prog, 'uCurve'), s.curve || 0);
      gl.uniform1f(gl.getUniformLocation(prog, 'uMul'), s.shading != null ? s.shading : dark ? 0.55 : 0.9);
      gl.uniform1f(gl.getUniformLocation(prog, 'uGloss'), s.gloss != null ? s.gloss : 0.5);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.deleteTexture(t0); gl.deleteTexture(t1); gl.deleteTexture(t2);
      const next = document.createElement('canvas'); next.width = W; next.height = H;
      next.getContext('2d').drawImage(cvs, 0, 0);
      base = next;
      void aw; void ah;
    }
    return base;
  }

  /* Draw artwork into a quad on a 2D canvas with a given blend (used by the PSD importer, where the
     layers above the smart object already carry the shading). */
  function warpInto(ctx, art, quad, blend) {
    init();
    const xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
    const x0 = Math.floor(Math.min(...xs)), y0 = Math.floor(Math.min(...ys));
    const W = Math.ceil(Math.max(...xs)) - x0, H = Math.ceil(Math.max(...ys)) - y0;
    const empty = document.createElement('canvas'); empty.width = W; empty.height = H;
    const g = empty.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    const local = quad.map(([x, y]) => [x - x0, y - y0]);
    const out = render(empty, [{ quad: local, art, blend: 'multiply', shading: 0 }], { maxW: W });
    // Cut to the quad so the white fill outside it doesn't paint over the scene.
    const m = document.createElement('canvas'); m.width = W; m.height = H;
    const mg = m.getContext('2d'); mg.drawImage(out, 0, 0);
    mg.globalCompositeOperation = 'destination-in'; mg.beginPath(); local.forEach(([x, y], i) => (i ? mg.lineTo(x, y) : mg.moveTo(x, y))); mg.closePath(); mg.fill();
    ctx.save(); ctx.globalCompositeOperation = blend || 'source-over'; ctx.drawImage(m, x0, y0); ctx.restore();
  }

  PG.Composite = { homography, render, warpInto, supported: () => { try { init(); return true; } catch (e) { return false; } } };
})();
