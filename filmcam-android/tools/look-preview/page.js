// Mirrors FilmRenderer + FilmEngine.developStill in WebGL2, using the app's own shader text.
async function runFilm(DATA, imgUrl, camId, opts) {
  const cam = DATA.cameras.find(c => c.id === camId);
  const look = Object.assign({}, cam.look, opts.override || {});
  const S = DATA.shaders;
  const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = imgUrl; });

  // Source crop: emulate the still / preview by cropping the reference image to the asked aspect.
  const outW = opts.w, outH = opts.h;
  const src = document.createElement('canvas'); src.width = outW; src.height = outH;
  const sc = src.getContext('2d');
  const ia = img.width / img.height, oa = outW / outH;
  let sw = img.width, sh = img.height;
  if (ia > oa) sw = img.height * oa; else sh = img.width / oa;
  sc.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, outW, outH);

  const tw = opts.targetW || outW, th = opts.targetH || outH;
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
  const P = {
    dev: prog(S.VERTEX, S.DEVELOP_2D), devMrt: prog(S.VERTEX, S.DEVELOP_2D_MRT), trail: prog(S.VERTEX, S.TRAIL),
    bright: prog(S.VERTEX, S.BRIGHT), blur: prog(S.VERTEX, S.BLUR), fin: prog(S.VERTEX, S.FINAL),
  };
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
  function fbo(...ts) {
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    ts.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
    gl.drawBuffers(ts.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER); if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo ' + st);
    return f;
  }
  const ident = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  const flip = new Float32Array([1,0,0,0, 0,-1,0,0, 0,0,1,0, 0,1,0,1]);

  // Source upload (row 0 = top, like GLUtils.texImage2D)
  const srcTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const W = outW, H = outH;
  const acc = tex(W, H, gl.RGBA8, true), raw = tex(W, H, gl.RGBA8, false);
  const useMrt = !!opts.mrt;
  const accF = useMrt ? fbo(acc, raw) : fbo(acc);
  const scale = Math.min(480 / Math.max(W, H), 0.5);
  const sw2 = Math.max(8, Math.round(W * scale)), sh2 = Math.max(8, Math.round(H * scale));
  const gT = tex(sw2, sh2, glowFmt), gW = tex(sw2, sh2, glowFmt), gX = tex(sw2, sh2, glowFmt);
  const gTF = fbo(gT), gWF = fbo(gW), gXF = fbo(gX);

  // develop
  const dp = useMrt ? P.devMrt : P.dev;
  gl.bindFramebuffer(gl.FRAMEBUFFER, accF); gl.viewport(0, 0, W, H); gl.useProgram(dp);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.uniform1i(U(dp, 'uSource'), 0); gl.uniform1i(U(dp, 'uPrev'), 1); gl.uniform1i(U(dp, 'uTrail'), 2);
  gl.uniformMatrix4fv(U(dp, 'uTexMatrix'), false, flip); gl.uniformMatrix4fv(U(dp, 'uTrailMatrix'), false, ident);
  gl.uniform1f(U(dp, 'uPersistence'), 0); gl.uniform1f(U(dp, 'uTrailAmount'), 0);
  draw();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, acc); gl.generateMipmap(gl.TEXTURE_2D);

  // glow
  const thr = 0.62 - 0.2 * look.halation;
  gl.viewport(0, 0, sw2, sh2); gl.bindFramebuffer(gl.FRAMEBUFFER, gTF); gl.useProgram(P.bright);
  gl.bindTexture(gl.TEXTURE_2D, acc); gl.uniform1i(U(P.bright, 'uSrc'), 0);
  gl.uniformMatrix4fv(U(P.bright, 'uTexMatrix'), false, ident);
  gl.uniform1f(U(P.bright, 'uLod'), Math.max(0, Math.log2(H / sh2))); gl.uniform1f(U(P.bright, 'uThreshold'), thr);
  draw();
  gl.useProgram(P.blur); gl.uniform1i(U(P.blur, 'uSrc'), 0); gl.uniformMatrix4fv(U(P.blur, 'uTexMatrix'), false, ident);
  const pass = (s, d, x, y) => { gl.bindFramebuffer(gl.FRAMEBUFFER, d); gl.bindTexture(gl.TEXTURE_2D, s); gl.uniform2f(U(P.blur, 'uStep'), x, y); draw(); };
  const sx = 1 / sw2, sy = 1 / sh2;
  pass(gT, gXF, sx * 1.6, 0); pass(gX, gTF, 0, sy * 1.6);
  pass(gT, gXF, sx * 2.4, 0); pass(gX, gWF, 0, sy * 2.4);
  pass(gW, gXF, sx * 4.5, 0); pass(gX, gWF, 0, sy * 4.5);

  // stamp (port of DateStamp.render)
  const st = document.createElement('canvas'); st.width = 512; st.height = 112;
  const c2 = st.getContext('2d'); c2.fillStyle = '#000'; c2.fillRect(0, 0, 512, 112);
  const path = new Path2D(); const DIG = [0b1111110,0b0110000,0b1101101,0b1111001,0b0110011,0b1011011,0b1011111,0b1110000,0b1111111,0b1111011];
  const hSeg = (x, y, w, t) => { const g = 2; path.moveTo(x+g+t/2, y+t/2); path.lineTo(x+g+t, y); path.lineTo(x+w-g-t, y); path.lineTo(x+w-g-t/2, y+t/2); path.lineTo(x+w-g-t, y+t); path.lineTo(x+g+t, y+t); path.closePath(); };
  const vSeg = (x, y, h, t) => { const g = 2; path.moveTo(x+t/2, y+g+t/2); path.lineTo(x+t, y+g+t); path.lineTo(x+t, y+h-g-t); path.lineTo(x+t/2, y+h-g-t/2); path.lineTo(x, y+h-g-t); path.lineTo(x, y+g+t); path.closePath(); };
  let x = 20; const dw = 46, dh = 78, y0 = (112 - dh) / 2;
  for (const ch of "'26 10 15") {
    if (ch >= '0' && ch <= '9') { const b = DIG[+ch], on = i => (b & (1 << (6 - i))) !== 0, t = 8, h2 = dh / 2;
      if (on(0)) hSeg(x, y0, dw, t); if (on(1)) vSeg(x+dw-t, y0, h2, t); if (on(2)) vSeg(x+dw-t, y0+h2, h2, t);
      if (on(3)) hSeg(x, y0+dh-t, dw, t); if (on(4)) vSeg(x, y0+h2, h2, t); if (on(5)) vSeg(x, y0, h2, t); if (on(6)) hSeg(x, y0+h2-t/2, dw, t);
      x += dw + 14; }
    else if (ch === "'") { path.rect(x, y0, 7, 18); x += 16; } else x += dw * 0.55;
  }
  c2.setTransform(1, 0, -0.12, 1, 0.12 * 56, 0);
  c2.filter = 'blur(7px)'; c2.fillStyle = 'rgba(255,92,20,0.8)'; c2.fill(path);
  c2.filter = 'none'; c2.fillStyle = 'rgb(255,168,70)'; c2.fill(path);
  const stampTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, stampTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, st);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // fx (fixed, representative values)
  const fx = opts.fx || {
    seed: 12345, time: 3.0, gain: 1.0,
    leakPos: [0.0, 0.62, -0.02, 0.3, 1.02, 0.85], leakRadius: [0.45, 0.33, 0.3],
    leakColor: [1.0*0.8, 0.36*0.8, 0.08*0.8, 0.95*0.7, 0.14*0.7, 0.08*0.7, 1.0*0.6, 0.78*0.6, 0.38*0.6],
    burnEdge: 0, burnStrength: 0.8, burnPhase: 1.3, scratchX: [0.31, -1], scratchAlpha: look.dust,
  };

  // final
  const f = P.fin; gl.useProgram(f); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, tw, th);
  const bind = (u, t, n) => { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(U(f, n), u); };
  bind(0, acc, 'uImage'); bind(1, gT, 'uGlowTight'); bind(2, gW, 'uGlowWide'); bind(3, stampTex, 'uStamp');
  gl.uniformMatrix4fv(U(f, 'uTexMatrix'), false, ident);
  gl.uniform2f(U(f, 'uTargetSize'), tw, th);
  gl.uniform1i(U(f, 'uTargetRot'), opts.targetRot || 0); gl.uniform1i(U(f, 'uFrameRot'), opts.frameRot || 0);
  gl.uniform2f(U(f, 'uImageTexel'), 1 / W, 1 / H);
  const s = look.stock;
  gl.uniform1f(U(f, 'uTemp'), s.temperature + look.warmth * 0.6); gl.uniform1f(U(f, 'uTint'), s.tint);
  gl.uniform1f(U(f, 'uSat'), s.saturation); gl.uniform1f(U(f, 'uContrast'), s.contrast);
  gl.uniform1f(U(f, 'uFade'), Math.min(s.fade + look.fade * 0.18, 0.35)); gl.uniform1f(U(f, 'uRolloff'), s.highlightRolloff);
  gl.uniform3fv(U(f, 'uShadowTint'), s.shadowTint); gl.uniform3fv(U(f, 'uHighTint'), s.highlightTint);
  const m = s.mixer; gl.uniformMatrix3fv(U(f, 'uMixer'), false, [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
  gl.uniform1f(U(f, 'uMono'), s.monochrome ? 1 : 0); gl.uniform3fv(U(f, 'uHalColor'), s.halationColor);
  gl.uniform1f(U(f, 'uColorGrain'), s.colorGrain);
  for (const [u, k] of [['uHalation','halation'],['uBloom','bloom'],['uGrain','grain'],['uLeak','lightLeak'],['uVignette','vignette'],['uDust','dust'],['uAberration','aberration'],['uSoftness','softness']])
    gl.uniform1f(U(f, u), look[k]);
  gl.uniform1f(U(f, 'uHalThreshold'), thr);
  gl.uniform1f(U(f, 'uGrainSize'), Math.min(4, Math.max(0.5, look.grainSize)));
  gl.uniform1f(U(f, 'uGain'), fx.gain); gl.uniform1i(U(f, 'uBorder'), look.frame);
  gl.uniform1f(U(f, 'uStampOn'), look.dateStamp ? 1 : 0); gl.uniform1f(U(f, 'uStampAspect'), 512 / 112);
  gl.uniform1ui(U(f, 'uSeed'), fx.seed); gl.uniform1f(U(f, 'uTime'), fx.time);
  gl.uniform2fv(U(f, 'uLeakPos'), fx.leakPos); gl.uniform1fv(U(f, 'uLeakRadius'), fx.leakRadius); gl.uniform3fv(U(f, 'uLeakColor'), fx.leakColor);
  gl.uniform1i(U(f, 'uBurnEdge'), fx.burnEdge); gl.uniform1f(U(f, 'uBurnStrength'), fx.burnStrength); gl.uniform1f(U(f, 'uBurnPhase'), fx.burnPhase);
  gl.uniform2f(U(f, 'uScratchX'), fx.scratchX[0], fx.scratchX[1]); gl.uniform1f(U(f, 'uScratchAlpha'), fx.scratchAlpha);
  draw();
  const err = gl.getError();
  return { url: canvas.toDataURL('image/png'), err, glowFmt: hasF ? 'RGBA16F' : 'RGBA8' };
}
