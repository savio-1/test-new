// Mirrors FilmRenderer + FilmEngine.developStill in WebGL2, using the app's own shader text.
// opts: w/h (output), cam (preset id), override (look fields), rot (sensor rotation to undo,
// 0/90/180/270: the source is pre-rotated the other way to test the still path), frameRot,
// targetRot/targetW/targetH (encoder path), tile (tile size, to test tiled output), fx.
async function runFilm(DATA, imgUrl, camId, opts) {
  const cam = DATA.cameras.find(c => c.id === camId);
  if (!cam) throw new Error('no camera ' + camId);
  const look = Object.assign({}, cam.look, opts.override || {});
  const S = DATA.shaders;
  const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = imgUrl; });

  // Upright source cropped to the asked aspect, then turned into "sensor orientation".
  const W = opts.w, H = opts.h, rot = opts.rot || 0;
  const up = document.createElement('canvas'); up.width = W; up.height = H;
  const uc = up.getContext('2d');
  const ia = img.width / img.height, oa = W / H;
  let sw = img.width, sh = img.height;
  if (ia > oa) sw = img.height * oa; else sh = img.width / oa;
  uc.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, W, H);
  const odd = (rot / 90) % 2 === 1;
  const src = document.createElement('canvas'); src.width = odd ? H : W; src.height = odd ? W : H;
  const sc = src.getContext('2d');
  sc.translate(src.width / 2, src.height / 2); sc.rotate(-rot * Math.PI / 180); sc.drawImage(up, -W / 2, -H / 2);

  const targetRot = opts.targetRot || 0, frameRot = opts.frameRot || 0;
  const tw = opts.targetW || W, th = opts.targetH || H;
  const canvas = document.createElement('canvas'); canvas.width = tw; canvas.height = th;
  document.body.appendChild(canvas);
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
  if (!gl) throw new Error('no webgl2');
  const hasF = !!gl.getExtension('EXT_color_buffer_float');
  const glowFmt = hasF ? gl.RGBA16F : gl.RGBA8;

  function prog(vs, fs) {
    const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('compile: ' + gl.getShaderInfoLog(sh)); return sh; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    return p;
  }
  const P = { bright: prog(S.VERTEX, S.BRIGHT), blur: prog(S.VERTEX, S.BLUR), gauss: prog(S.VERTEX, S.GAUSS), fin: prog(S.VERTEX, S.FINAL),
              dev: prog(S.VERTEX, S.DEVELOP_2D_MRT) };
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,0,0, 1,-1,1,0, -1,1,0,1, 1,1,1,1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
  const draw = () => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  const U = (p, n) => gl.getUniformLocation(p, n);

  function tex(w, h, fmt, mips) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    let levels = 1; if (mips) { let s = Math.max(w, h); while (s > 1) { s >>= 1; levels++; } }
    gl.texStorage2D(gl.TEXTURE_2D, levels, fmt, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function texFrom(canvasEl, repeat) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvasEl);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function fbo(...ts) {
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    ts.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
    gl.drawBuffers(ts.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER); if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo ' + st);
    return f;
  }
  const ident = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

  // FilmEngine.stillMatrix: screen uv (y up) -> texture uv of the sensor-oriented still.
  function stillMatrix(rotCw, mirror) {
    const map = (x, y) => { let ox = x; const oy = 1 - y; if (mirror) ox = 1 - ox;
      switch ((rotCw / 90) & 3) { case 1: return [oy, 1 - ox]; case 2: return [1 - ox, 1 - oy]; case 3: return [1 - oy, ox]; default: return [ox, oy]; } };
    const [tx, ty] = map(0, 0), [ax, ay] = map(1, 0), [bx, by] = map(0, 1);
    const m = new Float32Array(ident); m[0] = ax - tx; m[1] = ay - ty; m[4] = bx - tx; m[5] = by - ty; m[12] = tx; m[13] = ty; return m;
  }

  // Upload, as FilmRenderer.uploadMipmapped.
  const srcTex = tex(src.width, src.height, gl.RGBA8, true);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.generateMipmap(gl.TEXTURE_2D);
  const imageMatrix = stillMatrix(rot, false);

  // Film stock LUT (33^3 strip: x = b*33 + r, y = g) as a 3D texture, as FilmRenderer does.
  const lutUrl = DATA.luts && DATA.luts[look.stock.id];
  const lutTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE10); gl.bindTexture(gl.TEXTURE_3D, lutTex);
  if (lutUrl && !opts.noLut) {
    const li = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = lutUrl; });
    const n = li.height, cv = document.createElement('canvas'); cv.width = li.width; cv.height = n;
    const cx = cv.getContext('2d'); cx.drawImage(li, 0, 0); const px = cx.getImageData(0, 0, li.width, n).data;
    const buf = new Uint8Array(n * n * n * 4);
    for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
      const si = (g * n * n + b * n + r) * 4, di = ((b * n + g) * n + r) * 4;
      buf[di] = px[si]; buf[di + 1] = px[si + 1]; buf[di + 2] = px[si + 2]; buf[di + 3] = 255;
    }
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, n, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  } else {
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  const lutOn = lutUrl && !opts.noLut ? 1 : 0;

  // Glow, as FilmRenderer.glow.
  const scale = Math.min(480 / Math.max(W, H), 0.5);
  const gw = Math.max(8, Math.round(W * scale)), gh = Math.max(8, Math.round(H * scale));
  const gT = tex(gw, gh, glowFmt), gW = tex(gw, gh, glowFmt), gX = tex(gw, gh, glowFmt), gS = tex(gw, gh, glowFmt), gD = tex(gw, gh, glowFmt);
  const gM = tex(gw, gh, glowFmt), gC = tex(gw, gh, glowFmt);
  const gTF = fbo(gT), gWF = fbo(gW), gXF = fbo(gX), gSF = fbo(gS), gDF = fbo(gD), gMF = fbo(gM), gCF = fbo(gC);
  const thr = 0.62 - 0.2 * look.halation;
  gl.viewport(0, 0, gw, gh);
  gl.useProgram(P.bright); gl.uniform1i(U(P.bright, 'uLut'), 10); gl.uniform1i(U(P.bright, 'uMode'), 0);
  const softSigma = look.blurMode === 'GAUSSIAN' ? look.blur * 0.04 : 0;
  if (look.studio) {
    // FilmRenderer.studioGlow
    const long = Math.max(gw, gh);
    const mask = (mode, t, col) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, gMF); gl.useProgram(P.bright);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex); gl.uniform1i(U(P.bright, 'uSrc'), 0);
      gl.uniform1f(U(P.bright, 'uLutOn'), lutOn); gl.uniform1f(U(P.bright, 'uIntensity'), look.intensity === undefined ? 1 : look.intensity);
      gl.uniformMatrix4fv(U(P.bright, 'uTexMatrix'), false, imageMatrix);
      gl.uniform1f(U(P.bright, 'uLod'), Math.max(0, Math.log2(Math.max(W, H) / Math.max(gw, gh))));
      gl.uniform1i(U(P.bright, 'uMode'), mode); gl.uniform1f(U(P.bright, 'uThreshold'), t || 0); gl.uniform3fv(U(P.bright, 'uCol'), col || [0, 0, 0]);
      draw();
    };
    const gaussian = (from, toF, sigma, blackEdge = true) => {
      const sg = Math.max(0.3, sigma); gl.useProgram(P.gauss); gl.uniform1i(U(P.gauss, 'uBlackEdge'), blackEdge ? 1 : 0);
      gl.uniform1i(U(P.gauss, 'uSrc'), 0); gl.uniformMatrix4fv(U(P.gauss, 'uTexMatrix'), false, ident);
      gl.uniform1f(U(P.gauss, 'uSigma'), sg); gl.uniform1i(U(P.gauss, 'uTaps'), Math.min(64, Math.ceil(sg * 3)));
      gl.bindFramebuffer(gl.FRAMEBUFFER, gXF); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, from); gl.uniform2f(U(P.gauss, 'uStep'), 1 / gw, 0); draw();
      gl.bindFramebuffer(gl.FRAMEBUFFER, toF); gl.bindTexture(gl.TEXTURE_2D, gX); gl.uniform2f(U(P.gauss, 'uStep'), 0, 1 / gh); draw();
    };
    if (look.bloom > 0) { const k = Math.min(1, look.bloom); mask(1, 0.62 - 0.22 * k); gaussian(gM, gWF, long * (0.012 + 0.025 * k)); }
    if (look.halation > 0) { const k = Math.min(1, look.halation); mask(2, 0.72 - 0.2 * k, look.stock.halationColor);
      gaussian(gM, gTF, long * (0.003 + 0.007 * k)); gaussian(gM, gSF, long * (0.012 + 0.02 * k)); }
    const soft = softSigma * long;
    if (look.clarity !== 0 || look.tiltShift > 0 || soft >= 1) {
      mask(3);
      if (look.clarity !== 0) gaussian(gM, gCF, long * 0.018, false);
      if (look.tiltShift > 0) gaussian(gM, gDF, long * 0.018 * look.tiltShift); else if (soft >= 1) gaussian(gM, gDF, soft);
    }
  } else {
  gl.bindFramebuffer(gl.FRAMEBUFFER, gTF); gl.useProgram(P.bright);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex); gl.uniform1i(U(P.bright, 'uSrc'), 0);
  gl.uniformMatrix4fv(U(P.bright, 'uTexMatrix'), false, imageMatrix);
  gl.uniform1f(U(P.bright, 'uLod'), Math.max(0, Math.log2(Math.max(W, H) / Math.max(gw, gh)))); gl.uniform1f(U(P.bright, 'uThreshold'), thr);
  draw();
  gl.useProgram(P.blur); gl.uniform1i(U(P.blur, 'uSrc'), 0); gl.uniformMatrix4fv(U(P.blur, 'uTexMatrix'), false, ident);
  const pass = (s, d, x, y) => { gl.bindFramebuffer(gl.FRAMEBUFFER, d); gl.bindTexture(gl.TEXTURE_2D, s); gl.uniform2f(U(P.blur, 'uStep'), x, y); draw(); };
  const sx = 1 / gw, sy = 1 / gh, size = 0.6 + look.halationSize * 1.6;
  pass(gT, gXF, sx * 1.6 * size, 0); pass(gX, gTF, 0, sy * 1.6 * size);
  pass(gT, gXF, sx * 2.4, 0); pass(gX, gWF, 0, sy * 2.4);
  pass(gW, gXF, sx * 4.5, 0); pass(gX, gWF, 0, sy * 4.5);
  if (look.streak > 0) {
    gl.useProgram(P.bright); gl.bindFramebuffer(gl.FRAMEBUFFER, gSF); gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1f(U(P.bright, 'uThreshold'), 0.8); draw(); gl.useProgram(P.blur);
    let from = gS; [2, 6, 16, 40].forEach((step, i) => {
      pass(from, i % 2 === 0 ? gXF : gSF, sx * step, 0); from = i % 2 === 0 ? gX : gS; });
  }
  if (look.diffusion > 0) {
    gl.useProgram(P.bright); gl.bindFramebuffer(gl.FRAMEBUFFER, gDF); gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1f(U(P.bright, 'uThreshold'), -0.31); draw(); gl.useProgram(P.blur);
    pass(gD, gXF, sx * 3, 0); pass(gX, gDF, 0, sy * 3); pass(gD, gXF, sx * 7, 0); pass(gX, gDF, 0, sy * 7);
  }
  }

  // Overlay textures (ports of DateStamp, CamcorderOsd, EdgePrint).
  const st = document.createElement('canvas'); st.width = 512; st.height = 112;
  { const c2 = st.getContext('2d'); c2.fillStyle = '#000'; c2.fillRect(0, 0, 512, 112);
    const path = new Path2D(); const DIG = [0b1111110,0b0110000,0b1101101,0b1111001,0b0110011,0b1011011,0b1011111,0b1110000,0b1111111,0b1111011];
    const hSeg = (x, y, w, t) => { const g = 2; path.moveTo(x+g+t/2, y+t/2); path.lineTo(x+g+t, y); path.lineTo(x+w-g-t, y); path.lineTo(x+w-g-t/2, y+t/2); path.lineTo(x+w-g-t, y+t); path.lineTo(x+g+t, y+t); path.closePath(); };
    const vSeg = (x, y, h, t) => { const g = 2; path.moveTo(x+t/2, y+g+t/2); path.lineTo(x+t, y+g+t); path.lineTo(x+t, y+h-g-t); path.lineTo(x+t/2, y+h-g-t/2); path.lineTo(x, y+h-g-t); path.lineTo(x, y+g+t); path.closePath(); };
    let x = 20; const dw = 46, dh = 78, y0 = (112 - dh) / 2;
    for (const ch of (look.stamp === 2 ? "'98 10 15" : "'26 10 15")) {
      if (ch >= '0' && ch <= '9') { const b = DIG[+ch], on = i => (b & (1 << (6 - i))) !== 0, t = 8, h2 = dh / 2;
        if (on(0)) hSeg(x, y0, dw, t); if (on(1)) vSeg(x+dw-t, y0, h2, t); if (on(2)) vSeg(x+dw-t, y0+h2, h2, t);
        if (on(3)) hSeg(x, y0+dh-t, dw, t); if (on(4)) vSeg(x, y0+h2, h2, t); if (on(5)) vSeg(x, y0, h2, t); if (on(6)) hSeg(x, y0+h2-t/2, dw, t);
        x += dw + 14; }
      else if (ch === "'") { path.rect(x, y0, 7, 18); x += 16; } else x += dw * 0.55;
    }
    c2.setTransform(1, 0, -0.12, 1, 0.12 * 56, 0);
    c2.filter = 'blur(7px)'; c2.fillStyle = 'rgba(255,92,20,0.8)'; c2.fill(path);
    c2.filter = 'none'; c2.fillStyle = 'rgb(255,168,70)'; c2.fill(path); }
  const osd = document.createElement('canvas'); osd.width = 1024; osd.height = 256;
  { const c = osd.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, 1024, 256);
    c.fillStyle = 'rgb(245,245,240)'; c.font = 'bold 84px monospace'; c.fillText('▶ PLAY', 12, 94); c.fillText('SP', 600, 94);
    c.font = 'bold 66px monospace'; c.fillText('OCT.15 2026  10:15:32 PM', 12, 214); }
  const edge = document.createElement('canvas'); edge.width = 1024; edge.height = 64;
  { const c = edge.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, 1024, 64); c.fillStyle = 'rgb(232,150,70)';
    c.font = 'bold 40px sans-serif'; c.fillText('▸ 14', 30, 46); c.fillText('FC 400-5', 250, 46); c.fillText('▸ 14A', 560, 46); c.fillText('SAFETY FILM', 760, 46); }
  const stampTex = texFrom(st), osdTex = texFrom(osd), edgeTex = texFrom(edge, true);
  // Text overlay (opts.text = [{text, x, y, size, rotation}]), drawn in upright frame space
  // like TextRenderer, premultiplied like an Android bitmap upload.
  let textTex = null;
  if (opts.text) {
    const odd = ((targetRot + frameRot) & 1) === 1;
    const fw = odd ? th : tw, fh = odd ? tw : th;
    const tc = document.createElement('canvas'); tc.width = fw; tc.height = fh;
    const x = tc.getContext('2d');
    for (const l of opts.text) {
      x.save(); x.translate(l.x * fw, l.y * fh); x.rotate((l.rotation || 0) * Math.PI / 180);
      x.font = `${Math.round(l.size * Math.min(fw, fh))}px serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = l.color || '#fff'; x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 6; x.fillText(l.text, 0, 0); x.restore();
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    textTex = texFrom(tc);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  const fx = Object.assign({
    seed: 12345, time: 3.0, gain: [1, 1, 1], slip: 0,
    leakPos: [0.0, 0.62, -0.02, 0.3, 1.02, 0.85], leakRadius: [0.45, 0.33, 0.3],
    leakColor: [0.8, 0.29, 0.06, 0.66, 0.1, 0.06, 0.6, 0.47, 0.23],
    burnEdge: 0, burnStrength: 0.8, burnPhase: 1.3, scratchX: [0.31, -1], scratchAlpha: look.dust,
    prismBand: [0.85, 0.75, 0.7071, 0.7071], prismGhost: [0.04, 0.02], tracking: 0.4, rollBurn: 0,
  }, opts.fx || {});

  // Final, as FilmRenderer.drawFinal; optionally in tiles like renderTiled.
  const f = P.fin; gl.useProgram(f);
  const f1s = (n, v) => gl.uniform1f(U(f, n), v);
  const bind = (u, t, n) => { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(U(f, n), u); };
  bind(0, srcTex, 'uImage'); bind(1, srcTex, 'uPrevImage'); bind(2, gT, 'uGlowTight'); bind(3, gW, 'uGlowWide');
  bind(4, gS, 'uStreakTex'); bind(8, gD, 'uDiffuseTex'); bind(9, textTex || edgeTex, 'uTextTex'); gl.uniform1f(U(f, 'uTextOn'), textTex ? 1 : 0); bind(5, stampTex, 'uStamp'); bind(6, osdTex, 'uOsd'); bind(7, edgeTex, 'uEdge');
  gl.uniformMatrix4fv(U(f, 'uTexMatrix'), false, ident); gl.uniformMatrix4fv(U(f, 'uImageMatrix'), false, imageMatrix);
  gl.uniform2f(U(f, 'uTargetSize'), tw, th);
  gl.uniform1i(U(f, 'uTargetRot'), targetRot); gl.uniform1i(U(f, 'uFrameRot'), frameRot);
  const [iw, ih] = targetRot % 2 === 0 ? [tw, th] : [th, tw];
  gl.uniform2f(U(f, 'uImageTexel'), 1 / W, 1 / H);
  gl.uniform1f(U(f, 'uBaseLod'), Math.max(0, Math.log2(Math.min(W, H) / Math.min(iw, ih))));
  gl.uniform1f(U(f, 'uRefScale'), opts.refScale || Math.max(1, Math.min(iw, ih) / 1080));
  gl.uniform1i(U(f, 'uLogMode'), opts.logMode || 0); gl.uniform1f(U(f, 'uLogGain'), opts.logGain || 1);
  // Photographic style: opts.style = {id, tone, color, palette}
  const ps = opts.style ? DATA.styles.find(x => x.id === opts.style.id) : null;
  const sTone = opts.style ? (opts.style.tone || 0) : 0, sColor = opts.style ? (opts.style.color || 0) : 0;
  const sPal = opts.style && opts.style.palette !== undefined ? opts.style.palette : 1;
  const sOn = ps && !((ps.id === 'standard' || sPal === 0) && sTone === 0 && sColor === 0);
  gl.uniform1f(U(f, 'uStyleOn'), sOn ? 1 : 0);
  if (ps) {
    gl.uniform4f(U(f, 'uStyleA'), ps.warm, ps.tint, ps.sat, ps.contrast);
    gl.uniform4f(U(f, 'uStyleB'), ps.tone, ps.bright, ps.fade, ps.mono);
    gl.uniform3fv(U(f, 'uStyleShadow'), ps.shadowTint); gl.uniform3fv(U(f, 'uStyleHigh'), ps.highTint);
    gl.uniform4f(U(f, 'uStyleUser'), sTone, sColor, sPal, ps.skin);
  }
  gl.activeTexture(gl.TEXTURE10); gl.bindTexture(gl.TEXTURE_3D, lutTex);
  gl.useProgram(f);
  gl.uniform1i(U(f, 'uLut'), 10); gl.uniform1f(U(f, 'uLutOn'), lutOn);
  bind(13, gC, 'uClarTex');
  const studio = !!look.studio;
  f1s('uStudio', studio ? 1 : 0); f1s('uSharpen', studio ? look.sharpness : 0); f1s('uClarity', studio ? look.clarity : 0);
  const hk = Math.min(1, look.halation);
  gl.uniform2f(U(f, 'uStudioGain'), Math.pow(2, 1 + Math.round(hk * 2)), Math.pow(2, 1 + Math.round(hk * 3)));
  f1s('uStudioSoft', look.tiltShift <= 0 && softSigma * Math.max(gw, gh) >= 1 ? 1 : 0);
  gl.uniform1i(U(f, 'uSmearCap'), opts.smearCap || 16);
  f1s('uNoise', look.noise || 0); f1s('uHalftone', studio ? look.halftone : 0); f1s('uThreshold', studio ? (look.threshold || 0) : 0);
  const rgbOf = v => [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
  gl.uniform3fv(U(f, 'uInk'), rgbOf(look.halftoneInk || 0x111111)); gl.uniform3fv(U(f, 'uPaper'), rgbOf(look.halftonePaper || 0xf4f1ea));
  f1s('uGhost', studio ? look.ghost : 0); f1s('uTilt', studio ? look.tiltShift : 0); f1s('uTiltY', look.tiltY ?? 0.5); f1s('uTiltSize', look.tiltSize ?? 0.25);
  gl.uniform1f(U(f, 'uIntensity'), look.intensity === undefined ? 1 : look.intensity);
  gl.uniform1f(U(f, 'uExposureGain'), 1);
  gl.uniform4f(U(f, 'uAdjA'), look.warmth || 0, look.tint || 0, look.contrast || 0, look.saturation || 0);
  gl.uniform4f(U(f, 'uAdjB'), look.highlights || 0, look.shadows || 0, look.vibrance || 0, look.studio ? 0 : look.clarity || 0);
  const s = look.stock;
  const f1 = (n, v) => gl.uniform1f(U(f, n), v), f3 = (n, v) => gl.uniform3fv(U(f, n), v);
  f1('uTemp', s.temperature); f1('uTint', s.tint); f1('uSat', s.saturation);
  f1('uSatShadow', s.satShadows); f1('uSatHigh', s.satHighlights); f1('uContrast', s.contrast);
  f1('uFade', Math.min(s.fade + look.fade * 0.18, 0.35)); f1('uRolloff', s.highlightRolloff); f1('uBleach', s.bleach);
  f3('uGamma', s.gamma); f3('uHueShift', s.hueShift); f3('uShadowTint', s.shadowTint); f3('uHighTint', s.highlightTint);
  const m = s.mixer; gl.uniformMatrix3fv(U(f, 'uMixer'), false, [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
  f1('uMono', s.monochrome ? 1 : 0); f3('uHalColor', s.halationColor); f1('uColorGrain', s.colorGrain);
  f1('uHalation', look.halation); f1('uHalThreshold', thr); f1('uBloom', look.bloom); f1('uStreak', look.streak);
  f1('uGrain', look.grain); f1('uGrainSize', Math.min(4, Math.max(0.5, look.grainSize))); f1('uLeak', look.lightLeak);
  f1('uPrism', look.prism); f1('uVignette', look.vignette); f1('uDust', look.dust); f1('uAberration', look.aberration);
  f1('uSoftness', look.studio ? look.softness : look.softness - 0.8 * (look.sharpness || 0)); f1('uCornerBlur', look.cornerBlur); f1('uDistortion', look.distortion);
  f1('uCircle', look.circleMask ? 1 : 0); f1('uAnaglyph', look.anaglyph); f1('uFlash', look.flash); f1('uVhs', look.vhs);
  f1('uInterlace', 0); f1('uLowRes', look.lowRes); f1('uDiffusion', look.diffusion);
  const BLUR = { NONE: 0, GAUSSIAN: 1, ZOOM: 2, SPIN: 3, MOTION: 4 };
  gl.uniform1i(U(f, 'uBlurMode'), BLUR[look.blurMode] || 0); f1('uBlur', look.blur); f1('uBlurFocus', look.blurFocus);
  const ba = look.blurAngle * Math.PI / 180; gl.uniform2f(U(f, 'uBlurDir'), Math.cos(ba), Math.sin(ba));
  gl.uniform3fv(U(f, 'uGain'), fx.gain); gl.uniform1i(U(f, 'uBorder'), look.frame); gl.uniform1i(U(f, 'uStampStyle'), look.stamp);
  f1('uStampAspect', 512 / 112);
  gl.uniform1ui(U(f, 'uSeed'), fx.seed); f1('uTime', fx.time); f1('uSlip', fx.slip);
  gl.uniform2fv(U(f, 'uLeakPos'), fx.leakPos); gl.uniform1fv(U(f, 'uLeakRadius'), fx.leakRadius); gl.uniform3fv(U(f, 'uLeakColor'), fx.leakColor);
  gl.uniform1i(U(f, 'uBurnEdge'), fx.burnEdge); f1('uBurnStrength', fx.burnStrength); f1('uBurnPhase', fx.burnPhase);
  gl.uniform2f(U(f, 'uScratchX'), fx.scratchX[0], fx.scratchX[1]); f1('uScratchAlpha', fx.scratchAlpha);
  gl.uniform4fv(U(f, 'uPrismBand'), fx.prismBand); gl.uniform2fv(U(f, 'uPrismGhost'), fx.prismGhost);
  f1('uTracking', fx.tracking); f1('uRollBurn', fx.rollBurn);

  const tile = opts.tile || Math.max(tw, th);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const out = document.createElement('canvas'); out.width = tw; out.height = th; const oc = out.getContext('2d');
  for (let y0 = 0; y0 < th; y0 += tile) for (let x0 = 0; x0 < tw; x0 += tile) {
    const w = Math.min(tile, tw - x0), h = Math.min(tile, th - y0);
    gl.uniform2f(U(f, 'uTileOffset'), x0, y0);
    gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT); draw();
    // canvas row 0 is the top; GL tile rows count from the bottom of the whole image
    oc.drawImage(canvas, 0, th - h, w, h, x0, th - y0 - h, w, h);
  }
  return { url: out.toDataURL('image/png'), err: gl.getError(), glowFmt: hasF ? 'RGBA16F' : 'RGBA8' };
}
