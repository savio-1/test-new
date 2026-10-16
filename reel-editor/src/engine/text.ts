import type { TextAnimation, TextClip } from '../model/types';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

interface AnimState {
  alpha: number;
  dx: number;
  dy: number;
  scale: number;
  blur: number;
  tracking: number;
  chars: number; // fraction of characters visible
}

function applyAnim(state: AnimState, anim: TextAnimation, p: number, k: number, entering: boolean) {
  if (anim === 'none' || p >= 1) return;
  const e = easeOut(p);
  switch (anim) {
    case 'fade':
      state.alpha *= p;
      break;
    case 'slide-up':
      state.alpha *= p;
      state.dy += (1 - e) * 70 * k * (entering ? 1 : -1);
      break;
    case 'slide-left':
      state.alpha *= p;
      state.dx += (1 - e) * -120 * k * (entering ? 1 : -1);
      break;
    case 'pop':
      state.alpha *= Math.min(1, p * 2.5);
      state.scale *= entering ? Math.max(0.01, easeOutBack(p)) : 0.6 + 0.4 * e;
      break;
    case 'blur-in':
      state.alpha *= p;
      state.blur += (1 - e) * 24 * k;
      break;
    case 'tracking':
      state.alpha *= p;
      state.tracking += (1 - e) * 40 * k;
      break;
    case 'typewriter':
      if (entering) state.chars = p;
      else state.alpha *= p;
      break;
  }
}

/** Draw a text clip at local time `t` onto a canvas the size of the output frame. */
export function drawTextClip(ctx: CanvasRenderingContext2D, clip: TextClip, t: number, W: number, H: number) {
  const s = clip.style;
  const k = H / 1080;
  const animDur = Math.max(0.01, clip.animDuration);
  const state: AnimState = { alpha: 1, dx: 0, dy: 0, scale: 1, blur: 0, tracking: 0, chars: 1 };
  applyAnim(state, clip.animIn, clamp01(t / animDur), k, true);
  applyAnim(state, clip.animOut, clamp01((clip.duration - t) / animDur), k, false);
  if (state.alpha <= 0.001) return;

  const raw = s.uppercase ? clip.text.toUpperCase() : clip.text;
  let text = raw;
  if (state.chars < 1) text = raw.slice(0, Math.floor(raw.length * state.chars));
  const lines = text.split('\n');
  const allLines = raw.split('\n');

  const size = s.fontSize * k;
  ctx.save();
  ctx.font = `${s.italic ? 'italic ' : ''}${s.fontWeight} ${size}px ${s.fontFamily}`;
  ctx.letterSpacing = `${(s.letterSpacing + state.tracking) * k}px`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = s.align;

  // Measure the full text so typewriter reveals don't shift the layout.
  const widths = allLines.map((l) => ctx.measureText(l).width);
  const blockW = Math.max(1, ...widths);
  const lineH = size * s.lineHeight;
  const blockH = lineH * allLines.length;

  const cx = W / 2 + clip.transform.x * W + state.dx;
  const cy = H / 2 - clip.transform.y * H + state.dy;
  ctx.translate(cx, cy);
  ctx.rotate((clip.transform.rotation * Math.PI) / 180);
  const sc = state.scale * clip.transform.scale;
  ctx.scale(sc, sc);
  ctx.globalAlpha = state.alpha;
  if (state.blur > 0.3) ctx.filter = `blur(${state.blur}px)`;

  if (s.backgroundOpacity > 0) {
    const pad = s.backgroundPadding * k;
    ctx.save();
    ctx.globalAlpha = state.alpha * s.backgroundOpacity;
    ctx.fillStyle = s.background;
    ctx.beginPath();
    ctx.roundRect(-blockW / 2 - pad, -blockH / 2 - pad * 0.6, blockW + pad * 2, blockH + pad * 1.2, Math.min(pad, 18 * k));
    ctx.fill();
    ctx.restore();
  }

  const xFor = () => (s.align === 'left' ? -blockW / 2 : s.align === 'right' ? blockW / 2 : 0);
  const x = xFor();
  if (s.shadow > 0) {
    ctx.shadowColor = `rgba(0,0,0,${0.75 * s.shadow})`;
    ctx.shadowBlur = 24 * k * s.shadow;
    ctx.shadowOffsetY = 5 * k * s.shadow;
  }
  lines.forEach((line, i) => {
    const y = -blockH / 2 + lineH * (i + 0.5);
    if (s.outlineWidth > 0) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = s.outlineWidth * k * 2;
      ctx.strokeStyle = s.outlineColor;
      ctx.strokeText(line, x, y);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = s.color;
    ctx.fillText(line, x, y);
  });
  ctx.restore();
}
