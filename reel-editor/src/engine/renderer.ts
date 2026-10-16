import type { Clip, ColorSettings, EffectInstance, FilmSettings, Lut, MediaClip, Project, TextClip, Vec2 } from '../model/types';
import { LETTERBOX_RATIOS, stockById } from '../model/presets';
import type { VisualLayer } from '../model/timeline';
import { visualLayersAt } from '../model/timeline';
import { BLUR_FRAG, BRIGHT_FRAG, COPY_FRAG, GRADE_FRAG, POST_FRAG, TRANSITION_FRAG, VERT } from './shaders';
import { drawTextClip } from './text';
import { noise1 } from './noise';

/** Supplies decoded frames for media clips at render time. */
export interface FrameSource {
  frame(clip: MediaClip, timelineTime: number): { image: TexImageSource; width: number; height: number; key?: unknown } | null;
}

interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

type Program = { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };

const TRANSITION_IDS: Record<string, number> = {
  crossfade: 1,
  'dip-black': 2,
  'dip-white': 3,
  'wipe-left': 4,
  'wipe-right': 5,
  'slide-left': 6,
  'slide-up': 7,
  zoom: 8,
  blur: 9,
  circle: 10,
};

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private programs: Record<string, Program> = {};
  private pool: Target[] = [];
  private inUse = new Set<Target>();
  private sourceTex = new Map<string, { tex: WebGLTexture; key: unknown; w: number; h: number }>();
  private lutTex = new Map<string, { tex: WebGLTexture; size: number }>();
  private dummyLut: WebGLTexture;
  private textCanvas: HTMLCanvasElement;
  private textTex: WebGLTexture;
  private halfFloat: boolean;
  width = 1;
  height = 1;

  constructor(readonly canvas: HTMLCanvasElement, opts: { preserveDrawingBuffer?: boolean } = {}) {
    const gl = canvas.getContext('webgl2', {
      premultipliedAlpha: true,
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.halfFloat = !!gl.getExtension('EXT_color_buffer_float');

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    this.programs.grade = this.compile(GRADE_FRAG);
    this.programs.blur = this.compile(BLUR_FRAG);
    this.programs.bright = this.compile(BRIGHT_FRAG);
    this.programs.post = this.compile(POST_FRAG);
    this.programs.copy = this.compile(COPY_FRAG);
    this.programs.transition = this.compile(TRANSITION_FRAG);

    this.dummyLut = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, this.dummyLut);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, 1, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]));

    this.textCanvas = document.createElement('canvas');
    this.textTex = this.createTexture();
  }

  setSize(w: number, h: number) {
    w = Math.max(2, Math.round(w));
    h = Math.max(2, Math.round(h));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    for (const t of this.pool) this.destroyTarget(t);
    this.pool = [];
    this.inUse.clear();
  }

  /** Free GPU resources. Offscreen renderers also drop their context; on-screen ones keep it for reuse. */
  dispose(loseContext = true) {
    const gl = this.gl;
    for (const t of this.pool) this.destroyTarget(t);
    for (const { tex } of this.sourceTex.values()) gl.deleteTexture(tex);
    for (const { tex } of this.lutTex.values()) gl.deleteTexture(tex);
    this.pool = [];
    this.sourceTex.clear();
    this.lutTex.clear();
    if (loseContext) gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  /** Forget cached textures for clips that no longer exist. */
  pruneSources(liveIds: Set<string>) {
    for (const [id, v] of this.sourceTex) {
      if (!liveIds.has(id)) {
        this.gl.deleteTexture(v.tex);
        this.sourceTex.delete(id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Frame rendering
  // -------------------------------------------------------------------------

  render(project: Project, t: number, frames: FrameSource) {
    const gl = this.gl;
    const W = this.width;
    const H = this.height;
    const layers = visualLayersAt(project, t);
    const accum = this.acquire();
    const bg = hexToRgb(project.settings.background);
    gl.bindFramebuffer(gl.FRAMEBUFFER, accum.fbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    for (const layer of layers) {
      const tex = this.renderLayer(project, layer, frames);
      if (!tex) continue;
      gl.bindFramebuffer(gl.FRAMEBUFFER, accum.fbo);
      gl.viewport(0, 0, W, H);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.drawCopy(tex.tex, 1);
      gl.disable(gl.BLEND);
      this.release(tex);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    this.drawCopy(accum.tex, 1);
    this.release(accum);
  }

  private renderLayer(project: Project, layer: VisualLayer, frames: FrameSource): Target | null {
    const b = this.renderClip(project, layer.clip, layer.time, frames);
    if (!layer.transition) return b;
    const a = layer.transition.from ? this.renderClip(project, layer.transition.from, layer.transition.fromTime, frames) : null;
    const out = this.acquire();
    const gl = this.gl;
    const p = this.use('transition');
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const ta = a ?? this.blank();
    const tb = b ?? this.blank();
    this.bindTex(0, ta.tex, p.u.uA);
    this.bindTex(1, tb.tex, p.u.uB);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.uniform1f(p.u.uP, Math.min(1, Math.max(0, layer.transition.progress)));
    gl.uniform1i(p.u.uType, TRANSITION_IDS[layer.clip.transitionIn.type] ?? 0);
    gl.uniform2f(p.u.uOut, this.width, this.height);
    this.draw();
    this.release(ta);
    this.release(tb);
    return out;
  }

  private renderClip(project: Project, clip: Clip, t: number, frames: FrameSource): Target | null {
    return clip.type === 'text' ? this.renderText(clip, t) : this.renderMedia(project, clip, t, frames);
  }

  private renderText(clip: TextClip, t: number): Target | null {
    const gl = this.gl;
    const W = this.width;
    const H = this.height;
    if (this.textCanvas.width !== W || this.textCanvas.height !== H) {
      this.textCanvas.width = W;
      this.textCanvas.height = H;
    }
    const ctx = this.textCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    drawTextClip(ctx, clip, t - clip.start, W, H);
    gl.bindTexture(gl.TEXTURE_2D, this.textTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.textCanvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const out = this.acquire();
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.drawCopy(this.textTex, clip.transform.opacity);
    return out;
  }

  private renderMedia(project: Project, clip: MediaClip, t: number, frames: FrameSource): Target | null {
    const fresh = frames.frame(clip, t);
    const gl = this.gl;
    const W = this.width;
    const H = this.height;
    const res = H / 1080;

    // Upload the source frame. While a video is seeking, keep showing its last frame.
    let entry = this.sourceTex.get(clip.id);
    if (!fresh || !fresh.width || !fresh.height) {
      if (!entry || !entry.w) return null;
    } else {
      if (!entry) {
        entry = { tex: this.createTexture(), key: undefined, w: 0, h: 0 };
        this.sourceTex.set(clip.id, entry);
      }
      gl.bindTexture(gl.TEXTURE_2D, entry.tex);
      if (fresh.key === undefined || entry.key !== fresh.key) {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fresh.image);
        entry.key = fresh.key;
        entry.w = fresh.width;
        entry.h = fresh.height;
      }
    }
    const src = { width: entry.w, height: entry.h };

    const local = t - clip.start;
    const fx = collectEffects(clip.effects);
    const film = clip.film;
    const stock = film.stock !== 'none' ? stockById(film.stock) : undefined;

    // Transform with camera effects folded in.
    let scale = clip.transform.scale;
    let ox = clip.transform.x * W;
    let oy = clip.transform.y * H;
    if (fx.kenburns) {
      const u = clip.duration > 0 ? Math.min(1, Math.max(0, local / clip.duration)) : 0;
      const z = fx.kenburns.zoom ?? 0;
      scale *= z >= 0 ? 1 + z * 0.3 * u : 1 + -z * 0.3 * (1 - u);
      ox += (fx.kenburns.panX ?? 0) * 0.08 * W * u;
      oy += (fx.kenburns.panY ?? 0) * 0.08 * H * u;
    }
    if (fx.shake) {
      const a = fx.shake.amount ?? 0;
      const f = 2 + (fx.shake.speed ?? 0.5) * 14;
      ox += (noise1(local * f) * 2 - 1) * a * 0.025 * H;
      oy += (noise1(local * f + 91.7) * 2 - 1) * a * 0.025 * H;
      scale *= 1 + a * 0.05; // hide edges
    }
    if (film.weave > 0) {
      ox += (noise1(local * 5 + 13) * 2 - 1) * film.weave * 0.0022 * W;
      oy += (noise1(local * 3.3 + 47) * 2 - 1) * film.weave * 0.0035 * H;
    }
    const fit =
      clip.transform.fit === 'cover'
        ? Math.max(W / src.width, H / src.height)
        : Math.min(W / src.width, H / src.height);
    const S = fit * scale;
    const th = (clip.transform.rotation * Math.PI) / 180;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const xform = new Float32Array([c / S, s / S, 0, -s / S, c / S, 0, -(c * ox - s * oy) / S, -(s * ox + c * oy) / S, 1]);

    const graded = this.acquire();
    const p = this.use('grade');
    gl.bindFramebuffer(gl.FRAMEBUFFER, graded.fbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.bindTex(0, entry.tex, p.u.uSrc);
    const u = p.u;
    gl.uniform2f(u.uOut, W, H);
    gl.uniform2f(u.uSrcSize, src.width, src.height);
    gl.uniformMatrix3fv(u.uXform, false, xform);
    gl.uniform1f(u.uOpacity, clip.transform.opacity);
    gl.uniform1f(u.uTime, local);
    gl.uniform1f(u.uSeed, Math.floor(t * project.settings.fps) % 997);
    gl.uniform1f(u.uRes, res);
    this.setColorUniforms(p, clip.color, project.luts);
    this.setFilmUniforms(p, film, stock, local);
    this.setEffectUniforms(p, fx);

    this.draw();

    // Neighbourhood passes: blur, glow, bloom, halation.
    const blurAmt = fx.blur?.amount ?? 0;
    const glow = fx.glow;
    const glowAmt = glow?.amount ?? 0;
    const hal = film.halation;
    const bloom = film.bloom;
    if (blurAmt <= 0 && glowAmt <= 0 && hal <= 0 && bloom <= 0) return graded;

    let blurred: Target | null = null;
    let bright: Target | null = null;
    if (blurAmt > 0) blurred = this.blur(graded, blurAmt * 48 * res);
    if (glowAmt > 0 || hal > 0 || bloom > 0) {
      const threshold = Math.min(glowAmt > 0 ? (glow!.threshold ?? 0.6) : 1, hal > 0 || bloom > 0 ? 0.8 : 1);
      const br = this.acquire();
      const bp = this.use('bright');
      gl.bindFramebuffer(gl.FRAMEBUFFER, br.fbo);
      gl.viewport(0, 0, W, H);
      this.bindTex(0, graded.tex, bp.u.uSrc);
      gl.uniform1f(bp.u.uThreshold, threshold);
      this.draw();
      const radius = Math.max(glowAmt > 0 ? 6 + (glow!.radius ?? 0.5) * 40 : 0, hal > 0 ? 14 : 0, bloom > 0 ? 30 : 0);
      bright = this.blur(br, radius * res);
      this.release(br);
    }
    const out = this.acquire();
    const pp = this.use('post');
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
    gl.viewport(0, 0, W, H);
    this.bindTex(0, graded.tex, pp.u.uBase);
    this.bindTex(1, (blurred ?? graded).tex, pp.u.uBlurred);
    this.bindTex(2, (bright ?? graded).tex, pp.u.uBright);
    gl.uniform1f(pp.u.uBlurMix, blurAmt > 0 ? 1 : 0);
    gl.uniform1f(pp.u.uHalation, hal);
    gl.uniform1f(pp.u.uBloom, bloom);
    gl.uniform1f(pp.u.uGlow, glowAmt);
    this.draw();
    this.release(graded);
    if (blurred) this.release(blurred);
    if (bright) this.release(bright);
    return out;
  }

  /** Blur at reduced resolution; returns a full-size target. */
  private blur(src: Target, radiusPx: number): Target {
    const gl = this.gl;
    const down = radiusPx > 24 ? 4 : radiusPx > 6 ? 2 : 1;
    const w = Math.max(2, Math.round(this.width / down));
    const h = Math.max(2, Math.round(this.height / down));
    const a = this.acquire(w, h);
    const b = this.acquire(w, h);
    const p = this.use('blur');
    // Downsample into a.
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
    gl.viewport(0, 0, w, h);
    this.drawCopy(src.tex, 1);
    const stepPx = Math.max(0.5, radiusPx / down / 4.5);
    for (let i = 0; i < 2; i++) {
      this.use('blur');
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
      this.bindTex(0, a.tex, p.u.uSrc);
      gl.uniform2f(p.u.uDir, stepPx / w, 0);
      this.draw();
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
      this.bindTex(0, b.tex, p.u.uSrc);
      gl.uniform2f(p.u.uDir, 0, stepPx / h);
      this.draw();
    }
    this.release(b);
    if (down === 1) return a;
    const out = this.acquire();
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
    gl.viewport(0, 0, this.width, this.height);
    this.drawCopy(a.tex, 1);
    this.release(a);
    return out;
  }

  // -------------------------------------------------------------------------
  // Uniform helpers
  // -------------------------------------------------------------------------

  private setColorUniforms(p: Program, col: ColorSettings, luts: Lut[]) {
    const gl = this.gl;
    const u = p.u;
    gl.uniform1f(u.uExposure, col.exposure);
    gl.uniform1f(u.uContrast, col.contrast);
    gl.uniform1f(u.uHighlights, col.highlights);
    gl.uniform1f(u.uShadows, col.shadows);
    gl.uniform1f(u.uWhites, col.whites);
    gl.uniform1f(u.uBlacks, col.blacks);
    gl.uniform1f(u.uTemp, col.temperature);
    gl.uniform1f(u.uTint, col.tint);
    gl.uniform1f(u.uSat, col.saturation);
    gl.uniform1f(u.uVib, col.vibrance);
    const lift = wheelOffset(col.lift);
    const gamma = wheelOffset(col.gamma);
    const gain = wheelOffset(col.gain);
    gl.uniform3f(u.uLift, lift[0] * 0.25 + col.liftMaster * 0.25, lift[1] * 0.25 + col.liftMaster * 0.25, lift[2] * 0.25 + col.liftMaster * 0.25);
    gl.uniform3f(u.uGamma, 1 + gamma[0] * 0.5 + col.gammaMaster * 0.6, 1 + gamma[1] * 0.5 + col.gammaMaster * 0.6, 1 + gamma[2] * 0.5 + col.gammaMaster * 0.6);
    gl.uniform3f(u.uGain, 1 + gain[0] * 0.5 + col.gainMaster * 0.6, 1 + gain[1] * 0.5 + col.gainMaster * 0.6, 1 + gain[2] * 0.5 + col.gainMaster * 0.6);

    const lut = col.lutId ? luts.find((l) => l.id === col.lutId) : undefined;
    gl.activeTexture(gl.TEXTURE5);
    if (lut) {
      const t = this.getLut(lut);
      gl.bindTexture(gl.TEXTURE_3D, t.tex);
      gl.uniform1f(u.uLutAmt, col.lutAmount);
      gl.uniform1f(u.uLutSize, t.size);
    } else {
      gl.bindTexture(gl.TEXTURE_3D, this.dummyLut);
      gl.uniform1f(u.uLutAmt, 0);
      gl.uniform1f(u.uLutSize, 1);
    }
    gl.uniform1i(u.uLut, 5);
  }

  private setFilmUniforms(p: Program, film: FilmSettings, stock: ReturnType<typeof stockById>, local: number) {
    const gl = this.gl;
    const u = p.u;
    gl.uniform1f(u.uFilmStrength, stock ? film.strength : 0);
    if (stock) {
      gl.uniform1f(u.uFilmContrast, stock.contrast);
      gl.uniform1f(u.uFilmPivot, stock.pivot);
      gl.uniform1f(u.uToe, stock.toe);
      gl.uniform1f(u.uShoulder, stock.shoulder);
      gl.uniform1f(u.uFilmSat, stock.saturation);
      gl.uniform1f(u.uFilmFade, Math.min(0.6, stock.fade + film.fade * 0.25));
      gl.uniform1f(u.uMono, stock.mono ? 1 : 0);
      const m = stock.mix; // row-major -> column-major
      gl.uniformMatrix3fv(u.uFilmMix, false, new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]));
      gl.uniform3fv(u.uShadowTint, stock.shadowTint);
      gl.uniform3fv(u.uHighTint, stock.highlightTint);
    } else {
      // Film extras (grain, vignette...) still work without a stock; fade needs the film pass.
      const fade = film.fade * 0.25;
      gl.uniform1f(u.uFilmStrength, fade > 0 ? 1 : 0);
      gl.uniform1f(u.uFilmContrast, 0.05);
      gl.uniform1f(u.uFilmPivot, 0.5);
      gl.uniform1f(u.uToe, 0);
      gl.uniform1f(u.uShoulder, 0);
      gl.uniform1f(u.uFilmSat, 1);
      gl.uniform1f(u.uFilmFade, fade);
      gl.uniform1f(u.uMono, 0);
      gl.uniformMatrix3fv(u.uFilmMix, false, new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]));
      gl.uniform3f(u.uShadowTint, 0, 0, 0);
      gl.uniform3f(u.uHighTint, 0, 0, 0);
    }
    gl.uniform1f(u.uGrain, film.grain);
    gl.uniform1f(u.uGrainSize, film.grainSize);
    gl.uniform1f(u.uVignette, film.vignette);
    gl.uniform1f(u.uFlicker, film.flicker > 0 ? (noise1(local * 11 + 5) * 2 - 1) * film.flicker * 0.15 : 0);
  }

  private setEffectUniforms(p: Program, fx: Record<string, Record<string, number>>) {
    const gl = this.gl;
    const u = p.u;
    const v = (id: string, key: string, def = 0) => (fx[id] ? (fx[id][key] ?? def) : 0);
    gl.uniform1f(u.uSharpen, v('sharpen', 'amount'));
    gl.uniform1f(u.uBW, v('bw', 'amount'));
    gl.uniform1f(u.uSepia, v('sepia', 'amount'));
    gl.uniform1f(u.uTintAmt, v('tint', 'amount'));
    gl.uniform1f(u.uTintHue, v('tint', 'hue', 200));
    gl.uniform1f(u.uDuoAmt, v('duotone', 'amount'));
    gl.uniform1f(u.uDuoH1, v('duotone', 'hue1', 250));
    gl.uniform1f(u.uDuoH2, v('duotone', 'hue2', 40));
    gl.uniform1f(u.uInvert, v('invert', 'amount'));
    gl.uniform1f(u.uPosterize, v('posterize', 'levels'));
    gl.uniform1f(u.uSketch, v('sketch', 'amount'));
    gl.uniform1f(u.uHalftoneSize, v('halftone', 'size', 8));
    gl.uniform1f(u.uHalftoneAmt, v('halftone', 'amount'));
    gl.uniform1f(u.uPixelate, v('pixelate', 'size'));
    gl.uniform1f(u.uMirror, fx.mirror ? (fx.mirror.mode ?? 0) : -1);
    gl.uniform1f(u.uLens, v('lens', 'amount'));
    gl.uniform1f(u.uChroma, v('chroma', 'amount'));
    gl.uniform1f(u.uGlitch, v('glitch', 'amount'));
    gl.uniform1f(u.uGlitchSpeed, v('glitch', 'speed', 0.5));
    gl.uniform1f(u.uVhs, v('vhs', 'amount'));
    gl.uniform1f(u.uCrt, v('crt', 'amount'));
    gl.uniform1f(u.uDust, v('dust', 'amount'));
    gl.uniform1f(u.uLeak, v('leak', 'amount'));
    gl.uniform1f(u.uLeakSpeed, v('leak', 'speed', 0.3));
    gl.uniform1f(u.uLeakHue, v('leak', 'hue', 25));
    gl.uniform1f(u.uFxVig, v('vignette', 'amount'));
    gl.uniform1f(u.uFxVigSoft, v('vignette', 'softness', 0.5));
    gl.uniform1f(u.uLetterbox, fx.letterbox ? LETTERBOX_RATIOS[Math.round(fx.letterbox.ratio ?? 0)] ?? 2.39 : 0);
  }

  private getLut(lut: Lut) {
    let t = this.lutTex.get(lut.id);
    if (t) return t;
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, tex);
    const data = new Float32Array(lut.data);
    const half = this.halfFloat || !!gl.getExtension('OES_texture_float_linear');
    if (half) {
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, lut.size, lut.size, lut.size, 0, gl.RGB, gl.FLOAT, data);
    } else {
      const bytes = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) bytes[i] = Math.max(0, Math.min(255, Math.round(data[i] * 255)));
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, lut.size, lut.size, lut.size, 0, gl.RGB, gl.UNSIGNED_BYTE, bytes);
    }
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    t = { tex, size: lut.size };
    this.lutTex.set(lut.id, t);
    return t;
  }

  // -------------------------------------------------------------------------
  // GL plumbing
  // -------------------------------------------------------------------------

  private compile(frag: string): Program {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader error: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Link error: ${gl.getProgramInfoLog(prog)}`);
    const u: Program['u'] = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i)!;
      u[info.name] = gl.getUniformLocation(prog, info.name);
    }
    return { prog, u: new Proxy(u, { get: (o, k: string) => o[k] ?? null }) };
  }

  private use(name: string) {
    const p = this.programs[name];
    this.gl.useProgram(p.prog);
    this.gl.enableVertexAttribArray(0);
    this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 0, 0);
    return p;
  }

  private draw() {
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  private drawCopy(tex: WebGLTexture, opacity: number) {
    const p = this.use('copy');
    this.bindTex(0, tex, p.u.uSrc);
    this.gl.uniform1f(p.u.uOpacity, opacity);
    this.draw();
  }

  private bindTex(unit: number, tex: WebGLTexture, loc: WebGLUniformLocation | null) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  private createTexture() {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    return tex;
  }

  private blank(): Target {
    // A transparent target owned by the pool for the duration of a draw.
    const t = this.acquire();
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, t.w, t.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return t;
  }

  private acquire(w = this.width, h = this.height): Target {
    let t = this.pool.find((x) => !this.inUse.has(x) && x.w === w && x.h === h);
    if (!t) {
      const gl = this.gl;
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (this.halfFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      t = { fbo, tex, w, h };
      this.pool.push(t);
    }
    this.inUse.add(t);
    return t;
  }

  private release(t: Target) {
    this.inUse.delete(t);
  }

  private destroyTarget(t: Target) {
    this.gl.deleteFramebuffer(t.fbo);
    this.gl.deleteTexture(t.tex);
  }
}

/** Last enabled instance of each effect type wins. */
export function collectEffects(effects: EffectInstance[]) {
  const out: Record<string, Record<string, number>> = {};
  for (const e of effects) if (e.enabled) out[e.type] = e.params;
  return out;
}

/** Colour wheel puck -> luminance-neutral RGB offset. */
export function wheelOffset(v: Vec2): [number, number, number] {
  const r = Math.min(1, Math.hypot(v.x, v.y));
  if (r < 1e-4) return [0, 0, 0];
  const hue = (Math.atan2(v.y, v.x) / (2 * Math.PI) + 1) % 1;
  const rgb = hsvToRgb(hue, 1, 1);
  const l = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return [(rgb[0] - l) * r, (rgb[1] - l) * r, (rgb[2] - l) * r];
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
