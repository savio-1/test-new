// GLSL for the render pipeline. All layers are premultiplied RGBA.

export const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const COMMON = /* glsl */ `
precision highp float;
precision highp sampler3D;
in vec2 vUv;
out vec4 outColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

// ---------------------------------------------------------------------------
// Grade: transform + colour correction + film emulation + per-pixel effects.
// ---------------------------------------------------------------------------
export const GRADE_FRAG = /* glsl */ `#version 300 es
${COMMON}
uniform sampler2D uSrc;
uniform vec2 uOut;
uniform vec2 uSrcSize;
uniform mat3 uXform;
uniform float uOpacity;
uniform float uTime;
uniform float uSeed;
uniform float uRes; // uOut.y / 1080

// colour
uniform float uExposure, uContrast, uHighlights, uShadows, uWhites, uBlacks;
uniform float uTemp, uTint, uSat, uVib;
uniform vec3 uLift, uGamma, uGain;
uniform float uLutAmt, uLutSize;
uniform sampler3D uLut;

// film
uniform float uFilmStrength, uFilmContrast, uFilmPivot, uToe, uShoulder, uFilmSat, uFilmFade, uMono;
uniform mat3 uFilmMix;
uniform vec3 uShadowTint, uHighTint;
uniform float uGrain, uGrainSize, uVignette, uFlicker;

// effects (0 = off)
uniform float uSharpen, uBW, uSepia, uTintAmt, uTintHue;
uniform float uDuoAmt, uDuoH1, uDuoH2, uInvert, uPosterize, uSketch;
uniform float uHalftoneSize, uHalftoneAmt, uPixelate, uMirror, uLens, uChroma;
uniform float uGlitch, uGlitchSpeed, uVhs, uCrt, uDust, uLeak, uLeakSpeed, uLeakHue;
uniform float uFxVig, uFxVigSoft, uLetterbox;

vec2 toSrc(vec2 uv) {
  vec2 px = (uv - 0.5) * uOut;
  vec3 s = uXform * vec3(px, 1.0);
  return s.xy / uSrcSize + 0.5;
}

vec3 fetch(vec2 suv) { return texture(uSrc, suv).rgb; }

float sig(float x, float k, float p) { return 1.0 / (1.0 + exp(-k * (x - p))); }
float filmCurve(float x) {
  float k = max(uFilmContrast, 0.05);
  float lo = sig(0.0, k, uFilmPivot);
  float hi = sig(1.0, k, uFilmPivot);
  float y = (sig(clamp(x, -0.2, 1.6), k, uFilmPivot) - lo) / (hi - lo);
  y -= uToe * 0.6 * y * (1.0 - y) * (1.0 - y);
  y += uShoulder * 0.6 * y * y * (1.0 - y);
  return y;
}

vec3 colourCorrect(vec3 c) {
  vec3 lin = pow(max(c, 0.0), vec3(2.2));
  lin *= exp2(uExposure + uFlicker);
  lin *= vec3(1.0 + uTemp * 0.28 + uTint * 0.06, 1.0 - uTint * 0.18, 1.0 - uTemp * 0.28 + uTint * 0.06);
  c = pow(max(lin, 0.0), vec3(1.0 / 2.2));

  float l = luma(c);
  float sh = 1.0 - smoothstep(0.0, 0.55, l);
  float hi = smoothstep(0.45, 1.0, l);
  c += uShadows * 0.28 * sh;
  c += uHighlights * 0.28 * hi;

  float bp = -uBlacks * 0.12;
  float wp = 1.0 - uWhites * 0.22;
  c = (c - bp) / max(wp - bp, 0.05);

  c = (c - 0.5) * (1.0 + uContrast) + 0.5;

  c = c * uGain + uLift * (1.0 - c);
  c = pow(max(c, 0.0), 1.0 / max(uGamma, vec3(0.05)));

  l = luma(c);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float s = (1.0 + uSat) * (1.0 + uVib * (1.0 - clamp(sat * 1.5, 0.0, 1.0)));
  c = mix(vec3(l), c, s);

  if (uLutAmt > 0.0) {
    vec3 lc = clamp(c, 0.0, 1.0);
    vec3 coord = lc * (uLutSize - 1.0) / uLutSize + 0.5 / uLutSize;
    c = mix(c, texture(uLut, coord).rgb, uLutAmt);
  }
  return c;
}

vec3 film(vec3 c) {
  if (uFilmStrength <= 0.0) return c;
  vec3 x = uFilmMix * c;
  vec3 y = vec3(filmCurve(x.r), filmCurve(x.g), filmCurve(x.b));
  float l = luma(y);
  y += uShadowTint * (1.0 - smoothstep(0.0, 0.55, l));
  y += uHighTint * smoothstep(0.45, 1.0, l);
  if (uMono < 0.5) y = mix(vec3(luma(y)), y, uFilmSat);
  y = uFilmFade + y * (1.0 - uFilmFade);
  return mix(c, y, uFilmStrength);
}

vec3 grain(vec3 c, vec2 px) {
  float size = max(uGrainSize, 0.3) * 1.15 * max(uRes, 0.25);
  vec2 gp = px / size + vec2(uSeed * 17.13, uSeed * 7.77);
  float n = vnoise(gp) + 0.5 * vnoise(gp * 2.07 + 13.1);
  n = n / 1.5 - 0.5;
  vec3 nc = vec3(n);
  if (uMono < 0.5) {
    vec3 cn = vec3(vnoise(gp + 31.7), vnoise(gp + 71.3), vnoise(gp + 113.9)) - 0.5;
    nc = mix(nc, cn, 0.35);
  }
  float l = clamp(luma(c), 0.0, 1.0);
  float w = 0.2 + 3.2 * l * (1.0 - l);
  return c + nc * uGrain * 0.24 * w;
}

vec2 mirrorUv(vec2 uv, float mode) {
  if (mode < 0.5) uv.x = uv.x > 0.5 ? 1.0 - uv.x : uv.x;
  else if (mode < 1.5) uv.x = uv.x < 0.5 ? 1.0 - uv.x : uv.x;
  else if (mode < 2.5) uv.y = uv.y < 0.5 ? 1.0 - uv.y : uv.y;
  else uv = 0.5 - abs(uv - 0.5);
  return uv;
}

void main() {
  vec2 uv = vUv;
  float aspect = uOut.x / uOut.y;
  float frame = floor(uSeed);

  // ---- output-space distortions
  if (uMirror >= 0.0) uv = mirrorUv(uv, uMirror);
  if (uLens != 0.0) {
    vec2 d = (uv - 0.5) * vec2(aspect, 1.0);
    float r2 = dot(d, d);
    d *= 1.0 + uLens * 0.35 * r2;
    uv = d / vec2(aspect, 1.0) + 0.5;
  }
  float crtMask = 1.0;
  if (uCrt > 0.0) {
    vec2 d = uv - 0.5;
    d *= 1.0 + uCrt * 0.18 * dot(d, d) * 4.0;
    uv = d + 0.5;
    vec2 e = smoothstep(0.0, 0.004, uv) * smoothstep(0.0, 0.004, 1.0 - uv);
    crtMask = e.x * e.y;
  }
  if (uPixelate > 1.0) {
    vec2 block = vec2(uPixelate * uRes) / uOut;
    uv = (floor(uv / block) + 0.5) * block;
  }
  float glitchBand = 0.0;
  float glitchSwap = 0.0;
  if (uGlitch > 0.0) {
    float t = floor(uTime * (4.0 + uGlitchSpeed * 26.0));
    float rows = 6.0 + floor(30.0 * hash12(vec2(t, 3.1)));
    float row = floor(uv.y * rows);
    float h = hash12(vec2(row, t) + 0.37);
    if (h < uGlitch * 0.5) {
      glitchBand = 1.0;
      uv.x += (hash12(vec2(row * 1.7, t + 9.0)) - 0.5) * 0.25 * uGlitch;
      glitchSwap = step(0.7, hash12(vec2(row, t + 5.0)));
    }
  }
  if (uVhs > 0.0) {
    uv.x += sin(uv.y * 300.0 + uTime * 9.0) * 0.0008 * uVhs;
    float band = fract(uTime * 0.13);
    float inBand = smoothstep(0.03, 0.0, abs(uv.y - band));
    uv.x += inBand * (hash12(vec2(floor(uv.y * 200.0), frame)) - 0.5) * 0.03 * uVhs;
  }

  vec2 suv = toSrc(uv);
  vec2 e = min(suv, 1.0 - suv);
  vec2 fw = max(fwidth(suv), vec2(1e-5));
  float inside = clamp(e.x / fw.x + 0.5, 0.0, 1.0) * clamp(e.y / fw.y + 0.5, 0.0, 1.0);
  inside *= crtMask;

  // ---- sampling (with channel splits)
  // Lens-style aberration grows towards the edges; glitch and VHS split horizontally.
  vec2 o = (uv - 0.5) * uChroma * 0.04 + vec2(glitchBand * uGlitch * 0.02 + uVhs * 0.004, 0.0);
  vec3 c;
  if (dot(o, o) > 0.0) {
    c.r = fetch(toSrc(uv + o)).r;
    c.g = fetch(suv).g;
    c.b = fetch(toSrc(uv - o)).b;
  } else {
    c = fetch(suv);
  }
  if (glitchSwap > 0.0) c = c.brg;

  vec2 texel = 1.0 / uSrcSize;
  if (uSharpen > 0.0 || uSketch > 0.0) {
    vec3 n = fetch(suv + vec2(0.0, texel.y));
    vec3 s = fetch(suv - vec2(0.0, texel.y));
    vec3 ea = fetch(suv + vec2(texel.x, 0.0));
    vec3 w = fetch(suv - vec2(texel.x, 0.0));
    if (uSharpen > 0.0) c += (c * 4.0 - n - s - ea - w) * uSharpen * 0.5;
    if (uSketch > 0.0) {
      float gx = luma(ea) - luma(w);
      float gy = luma(n) - luma(s);
      float edge = clamp(length(vec2(gx, gy)) * 4.0, 0.0, 1.0);
      vec3 paper = vec3(0.96, 0.95, 0.92);
      c = mix(c, paper * (1.0 - edge), uSketch);
    }
  }

  // ---- colour pipeline
  c = colourCorrect(c);
  c = film(c);
  vec2 px = uv * uOut;
  if (uGrain > 0.0) c = grain(c, px);

  float dist = length((uv - 0.5) * vec2(aspect, 1.0));
  if (uVignette > 0.0) c *= 1.0 - uVignette * 0.85 * smoothstep(0.3, 1.05, dist);
  if (uFxVig > 0.0) {
    float inner = mix(0.55, 0.15, uFxVigSoft);
    c *= 1.0 - uFxVig * smoothstep(inner, 0.95, dist);
  }

  // ---- stylize
  float l = luma(c);
  if (uBW > 0.0) c = mix(c, vec3(l), uBW);
  if (uSepia > 0.0) {
    vec3 s = vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131)));
    c = mix(c, s, uSepia);
  }
  if (uTintAmt > 0.0) c = mix(c, l * hsv2rgb(vec3(uTintHue / 360.0, 0.55, 1.0)) * 1.25, uTintAmt);
  if (uDuoAmt > 0.0) {
    vec3 d = mix(hsv2rgb(vec3(uDuoH1 / 360.0, 0.75, 0.3)), hsv2rgb(vec3(uDuoH2 / 360.0, 0.55, 1.0)), smoothstep(0.0, 1.0, l));
    c = mix(c, d, uDuoAmt);
  }
  if (uPosterize >= 2.0) c = floor(c * uPosterize + 0.5) / uPosterize;
  if (uHalftoneAmt > 0.0) {
    float cell = uHalftoneSize * max(uRes, 0.25);
    mat2 rot = mat2(0.7071, -0.7071, 0.7071, 0.7071);
    vec2 g = rot * px / cell;
    vec2 f = fract(g) - 0.5;
    float r = sqrt(clamp(1.0 - l, 0.0, 1.0)) * 0.62;
    float ink = smoothstep(r + 0.06, r - 0.06, length(f));
    vec3 ht = mix(vec3(0.97, 0.96, 0.93), c * 0.55, ink);
    c = mix(c, ht, uHalftoneAmt);
  }
  if (uInvert > 0.0) c = mix(c, 1.0 - c, uInvert);

  // ---- overlays
  if (uVhs > 0.0) {
    c = mix(c, vec3(luma(c)) * vec3(1.05, 0.98, 1.08), 0.25 * uVhs);
    c *= 1.0 - 0.12 * uVhs * (0.5 + 0.5 * sin(px.y / max(uRes, 0.25) * 3.14159));
    c += (hash12(px + frame * 13.0) - 0.5) * 0.12 * uVhs;
  }
  if (uCrt > 0.0) {
    float scan = 0.5 + 0.5 * sin(px.y / max(uRes, 0.25) * 2.2);
    c *= 1.0 - uCrt * 0.35 * (1.0 - scan);
    float m = mod(floor(px.x / max(uRes, 0.4)), 3.0);
    vec3 mask = m < 1.0 ? vec3(1.0, 0.75, 0.75) : m < 2.0 ? vec3(0.75, 1.0, 0.75) : vec3(0.75, 0.75, 1.0);
    c *= mix(vec3(1.0), mask, uCrt * 0.6);
    c *= 1.0 + uCrt * 0.15;
  }
  if (uDust > 0.0) {
    vec2 cellSize = vec2(70.0 * max(uRes, 0.25));
    vec2 cell = floor(px / cellSize);
    float h = hash12(cell + frame * 1.37);
    if (h < uDust * 0.06) {
      vec2 centre = (cell + vec2(hash12(cell + 7.1 + frame), hash12(cell + 3.3 + frame))) * cellSize;
      float rad = (1.0 + 3.0 * hash12(cell + frame + 5.0)) * max(uRes, 0.25);
      float spot = smoothstep(rad, rad * 0.3, length(px - centre));
      c = mix(c, hash12(cell + 11.0) > 0.3 ? vec3(0.05) : vec3(0.95), spot * 0.85);
    }
    for (int i = 0; i < 2; i++) {
      float sh = hash12(vec2(frame, float(i) * 17.0));
      if (sh < uDust * 0.7) {
        float x = hash12(vec2(frame * 0.37, float(i) + 3.0)) * uOut.x;
        float line = smoothstep(1.2 * max(uRes, 0.4), 0.0, abs(px.x - x));
        c = mix(c, vec3(0.85), line * 0.5 * (0.5 + 0.5 * vnoise(vec2(px.y * 0.02, frame))));
      }
    }
  }
  if (uLeak > 0.0) {
    float t = uTime * (0.1 + uLeakSpeed * 0.6);
    vec2 a = vec2(0.15 + 0.3 * sin(t * 0.7), 0.8 + 0.2 * cos(t * 0.5));
    vec2 b = vec2(0.9 + 0.15 * cos(t * 0.9), 0.2 + 0.4 * sin(t * 0.6));
    vec2 q = uv * vec2(aspect, 1.0);
    float m1 = exp(-4.0 * length(q - a * vec2(aspect, 1.0)));
    float m2 = exp(-5.0 * length(q - b * vec2(aspect, 1.0)));
    vec3 leak = hsv2rgb(vec3(uLeakHue / 360.0, 0.85, 1.0)) * m1 + hsv2rgb(vec3((uLeakHue + 25.0) / 360.0, 0.7, 1.0)) * m2;
    leak *= uLeak * (0.8 + 0.2 * sin(t * 3.0));
    c = 1.0 - (1.0 - clamp(c, 0.0, 1.0)) * (1.0 - clamp(leak, 0.0, 1.0));
  }

  float alpha = inside * uOpacity;
  c = clamp(c, 0.0, 1.0);

  if (uLetterbox > 0.0) {
    float bar = 0.0;
    if (uLetterbox > aspect) bar = step(0.5 * aspect / uLetterbox, abs(vUv.y - 0.5));
    else bar = step(0.5 * uLetterbox / aspect, abs(vUv.x - 0.5));
    c = mix(c * alpha, vec3(0.0), bar);
    alpha = max(alpha, bar);
    outColor = vec4(c, alpha);
    return;
  }
  outColor = vec4(c * alpha, alpha);
}`;

// ---------------------------------------------------------------------------
// Separable gaussian blur. uDir is the step in UV units.
// ---------------------------------------------------------------------------
export const BLUR_FRAG = /* glsl */ `#version 300 es
${COMMON}
uniform sampler2D uSrc;
uniform vec2 uDir;
void main() {
  vec4 s = texture(uSrc, vUv) * 0.2270270270;
  s += texture(uSrc, vUv + uDir * 1.3846153846) * 0.3162162162;
  s += texture(uSrc, vUv - uDir * 1.3846153846) * 0.3162162162;
  s += texture(uSrc, vUv + uDir * 3.2307692308) * 0.0702702703;
  s += texture(uSrc, vUv - uDir * 3.2307692308) * 0.0702702703;
  outColor = s;
}`;

// Extract highlights for glow / bloom / halation.
export const BRIGHT_FRAG = /* glsl */ `#version 300 es
${COMMON}
uniform sampler2D uSrc;
uniform float uThreshold;
void main() {
  vec4 c = texture(uSrc, vUv);
  vec3 rgb = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
  float l = luma(rgb);
  float k = smoothstep(uThreshold, min(uThreshold + 0.25, 1.0), l);
  outColor = vec4(rgb * k * c.a, c.a);
}`;

// Combine base layer with blurred base and blurred highlights.
export const POST_FRAG = /* glsl */ `#version 300 es
${COMMON}
uniform sampler2D uBase;
uniform sampler2D uBlurred;
uniform sampler2D uBright;
uniform float uBlurMix, uHalation, uBloom, uGlow;
void main() {
  vec4 base = texture(uBase, vUv);
  vec4 c = base;
  if (uBlurMix > 0.0) c = mix(base, texture(uBlurred, vUv), uBlurMix);
  if (uHalation + uBloom + uGlow > 0.0) {
    vec3 b = texture(uBright, vUv).rgb;
    vec3 add = b * vec3(1.0, 0.3, 0.1) * uHalation * 1.6 + b * uBloom * 0.9 + b * uGlow * 1.4;
    c.rgb = 1.0 - (1.0 - c.rgb) * (1.0 - clamp(add * max(c.a, 0.0), 0.0, 1.0));
  }
  outColor = c;
}`;

// Draw a texture with opacity (used for text layers and final output).
export const COPY_FRAG = /* glsl */ `#version 300 es
${COMMON}
uniform sampler2D uSrc;
uniform float uOpacity;
void main() {
  outColor = texture(uSrc, vUv) * uOpacity;
}`;

// Transition between two full-frame layers.
export const TRANSITION_FRAG = /* glsl */ `#version 300 es
${COMMON}
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uP;
uniform int uType;
uniform vec2 uOut;
vec4 A(vec2 uv) { return (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec4(0.0) : texture(uA, uv); }
vec4 B(vec2 uv) { return (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec4(0.0) : texture(uB, uv); }
vec4 blur9(sampler2D t, vec2 uv, float r) {
  vec4 s = vec4(0.0);
  for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++) s += texture(t, uv + vec2(float(x), float(y)) * r / uOut);
  return s / 9.0;
}
void main() {
  vec2 uv = vUv;
  float p = uP * uP * (3.0 - 2.0 * uP);
  vec4 o;
  if (uType == 1) o = mix(A(uv), B(uv), p);
  else if (uType == 2 || uType == 3) {
    vec4 mid = uType == 2 ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(1.0);
    o = uP < 0.5 ? mix(A(uv), mid, uP * 2.0) : mix(mid, B(uv), uP * 2.0 - 1.0);
  }
  else if (uType == 4) o = mix(A(uv), B(uv), smoothstep(1.0 - p - 0.01, 1.0 - p + 0.01, uv.x));
  else if (uType == 5) o = mix(B(uv), A(uv), smoothstep(p - 0.01, p + 0.01, uv.x));
  else if (uType == 6) o = uv.x < 1.0 - p ? A(uv + vec2(p, 0.0)) : B(uv - vec2(1.0 - p, 0.0));
  else if (uType == 7) o = uv.y < p ? B(uv + vec2(0.0, 1.0 - p)) : A(uv - vec2(0.0, p));
  else if (uType == 8) {
    vec4 a = A((uv - 0.5) / (1.0 + p * 0.6) + 0.5);
    vec4 b = B((uv - 0.5) / (0.75 + 0.25 * p) + 0.5);
    o = mix(a, b, smoothstep(0.25, 0.75, uP));
  }
  else if (uType == 9) {
    float r = sin(uP * 3.14159) * 14.0;
    o = mix(blur9(uA, uv, r), blur9(uB, uv, r), p);
  }
  else if (uType == 10) {
    float aspect = uOut.x / uOut.y;
    float d = length((uv - 0.5) * vec2(aspect, 1.0));
    float rad = p * length(vec2(aspect, 1.0)) * 0.5;
    o = mix(B(uv), A(uv), smoothstep(rad - 0.005, rad + 0.005, d));
  }
  else o = B(uv);
  outColor = o;
}`;
