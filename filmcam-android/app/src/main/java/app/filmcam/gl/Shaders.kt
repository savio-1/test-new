package app.filmcam.gl

/**
 * The film pipeline, pass by pass:
 *
 *  1. DEVELOP   camera (OES) or still (2D) -> working frame. Crops to the output aspect,
 *               applies gate weave, and blends with the previous frame for slow shutters.
 *  2. BRIGHT    working frame (sampled from its mip chain) -> small buffer of highlights.
 *  3. BLUR      separable Gaussian, run a few times: a tight glow (halation), a wide one
 *               (bloom) and a long one-directional one (anamorphic streaks).
 *  4. FINAL     lens (distortion, fisheye, toy-lens blur, fringing, 3D split, prism ghost),
 *               tape (line jitter, chroma bleed, interlace), the stock's colour science,
 *               halation, bloom, streaks, flash, light leaks, vignette, grain, dust, scratches,
 *               frame slips, roll burns, stamps and the border. Drawn once for the screen,
 *               once more for the video encoder, and in tiles for full-resolution stills.
 *
 * Coordinates: "screen space" is the working frame as it appears on the portrait display.
 * "Frame space" is that picture turned upright for however the phone is held, so borders,
 * light leaks and the date stamp always sit the right way up in the saved file.
 */
object Shaders {

    const val VERTEX = """#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUV;
uniform mat4 uTexMatrix;
out vec2 vUV;
out vec2 vTex;
void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
    vUV = aUV;
    vTex = (uTexMatrix * vec4(aUV, 0.0, 1.0)).xy;
}
"""

    private const val DEVELOP_BODY = """
uniform sampler2D uPrev;
uniform float uPersistence;
uniform sampler2D uTrail;
uniform mat4 uTrailMatrix;
uniform float uTrailAmount;
in vec2 vUV;
in vec2 vTex;
layout(location = 0) out vec4 oAccum;
#ifdef MRT
layout(location = 1) out vec4 oRaw;
#endif
void main() {
    vec3 c = texture(uSource, vTex).rgb;
#ifdef MRT
    oRaw = vec4(c, 1.0);
#endif
    if (uPersistence > 0.0) {
        // Slow shutter: light from the last frames is still landing on the film.
        vec3 prev = texture(uPrev, vUV).rgb;
        c = mix(c, prev, uPersistence);
    }
    if (uTrailAmount > 0.0) {
        // Stills: motion trail lifted from the live preview at the moment of capture.
        vec2 tuv = (uTrailMatrix * vec4(vUV, 0.0, 1.0)).xy;
        c += (texture(uTrail, tuv).rgb - 0.5) * 2.0 * uTrailAmount;
    }
    oAccum = vec4(clamp(c, 0.0, 1.0), 1.0);
}
"""

    const val DEVELOP_OES = """#version 300 es
#extension GL_OES_EGL_image_external_essl3 : require
precision highp float;
#define MRT 1
uniform samplerExternalOES uSource;
$DEVELOP_BODY"""

    const val DEVELOP_2D = """#version 300 es
precision highp float;
uniform sampler2D uSource;
$DEVELOP_BODY"""

    /** Difference between the accumulated and the raw frame: the motion trail alone. */
    const val TRAIL = """#version 300 es
precision mediump float;
uniform sampler2D uAccum;
uniform sampler2D uRaw;
in vec2 vUV;
out vec4 o;
void main() {
    vec3 d = texture(uAccum, vUV).rgb - texture(uRaw, vUV).rgb;
    o = vec4(d * 0.5 + 0.5, 1.0);
}
"""

    const val BRIGHT = """#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform float uLod;
uniform float uThreshold;
in vec2 vTex;
out vec4 o;
void main() {
    vec3 c = textureLod(uSrc, vTex, uLod).rgb;
    vec3 lin = c * c;                       // close enough to linear light
    float l = dot(lin, vec3(0.2126, 0.7152, 0.0722));
    float k = smoothstep(uThreshold, uThreshold + 0.3, l);
    o = vec4(lin * k, 1.0);
}
"""

    const val BLUR = """#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uStep;
in vec2 vUV;
out vec4 o;
void main() {
    // 9-tap Gaussian folded into 5 bilinear fetches.
    vec3 s = texture(uSrc, vUV).rgb * 0.2270270270;
    s += texture(uSrc, vUV + uStep * 1.3846153846).rgb * 0.3162162162;
    s += texture(uSrc, vUV - uStep * 1.3846153846).rgb * 0.3162162162;
    s += texture(uSrc, vUV + uStep * 3.2307692308).rgb * 0.0702702703;
    s += texture(uSrc, vUV - uStep * 3.2307692308).rgb * 0.0702702703;
    o = vec4(s, 1.0);
}
"""


    const val FINAL = """#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uImage;
uniform sampler2D uPrevImage;
uniform sampler2D uGlowTight;
uniform sampler2D uGlowWide;
uniform sampler2D uStreakTex;
uniform sampler2D uStamp;
uniform sampler2D uOsd;
uniform sampler2D uEdge;
uniform sampler2D uDiffuseTex;
uniform sampler2D uTextTex;  // text overlays, premultiplied, upright frame space
uniform float uTextOn;
uniform mat4 uImageMatrix;  // screen uv -> image texture uv (rotation of unrotated stills)

uniform vec2 uTargetSize;   // pixels of the whole output (all tiles)
uniform vec2 uTileOffset;   // pixel offset of the tile being drawn
uniform int uTargetRot;     // quarter turns: target -> screen space
uniform int uFrameRot;      // quarter turns: screen space -> frame space
uniform vec2 uImageTexel;   // 1 / image size
uniform float uBaseLod;     // mip level that matches the output resolution
uniform float uRefScale;    // output short side / 1080: effects are sized for a 1080 p picture

// Stock
uniform float uTemp;
uniform float uTint;
uniform float uSat;
uniform float uSatShadow;
uniform float uSatHigh;
uniform float uContrast;
uniform float uFade;
uniform float uRolloff;
uniform float uBleach;
uniform vec3 uGamma;
uniform vec3 uHueShift;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform mat3 uMixer;
uniform float uMono;
uniform vec3 uHalColor;
uniform float uColorGrain;

// Effects
uniform float uHalation;
uniform float uHalThreshold;
uniform float uBloom;
uniform float uStreak;
uniform float uGrain;
uniform float uGrainSize;
uniform float uLeak;
uniform float uPrism;
uniform float uVignette;
uniform float uDust;
uniform float uAberration;
uniform float uSoftness;
uniform float uCornerBlur;
uniform float uDistortion;
uniform float uCircle;
uniform float uAnaglyph;
uniform float uFlash;
uniform float uVhs;
uniform float uInterlace;
uniform float uLowRes;
uniform float uDiffusion;
uniform int uBlurMode;      // 0 off, 1 soft (gaussian), 2 zoom, 3 spin, 4 motion
uniform float uBlur;
uniform vec2 uBlurDir;      // motion direction in the upright frame
uniform float uBlurFocus;   // radius of the sharp centre
uniform vec3 uGain;
uniform int uBorder;
uniform int uStampStyle;
uniform float uStampAspect;

// Per-frame randomness from the CPU
uniform uint uSeed;
uniform float uTime;
uniform float uSlip;
uniform vec2 uLeakPos[3];
uniform float uLeakRadius[3];
uniform vec3 uLeakColor[3];
uniform int uBurnEdge;
uniform float uBurnStrength;
uniform float uBurnPhase;
uniform vec2 uScratchX;
uniform float uScratchAlpha;
uniform vec4 uPrismBand;
uniform vec2 uPrismGhost;
uniform float uTracking;
uniform float uRollBurn;

// Log video: 0 off, 1 encode the camera's picture to S-Log3 (when the ISP can't),
// 2 show S-Log3 as Rec.709 (view assist), 3 both. See LogCurve.kt.
uniform int uLogMode;
uniform float uLogGain;     // 2^stops of underexposure to give back

out vec4 oColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float PI = 3.14159265;

// ---------------------------------------------------------------- coordinates
// rot(k, p): turn a unit-square point k quarter turns clockwise.
vec2 rot(int k, vec2 p) {
    k = k & 3;
    if (k == 1) return vec2(p.y, 1.0 - p.x);
    if (k == 2) return 1.0 - p;
    if (k == 3) return vec2(1.0 - p.y, p.x);
    return p;
}
vec2 toScreen(vec2 u) { return rot(4 - (uFrameRot & 3), u); }
vec2 toImage(vec2 s) { return (uImageMatrix * vec4(s, 0.0, 1.0)).xy; }
// Mip level for an effect blur of 'lod' levels, as it would look at 1080 p. At lod 0 this is
// the native level, so a 50 MP still stays sharp; blurs grow with the output so a still
// looks like the viewfinder, only finer.
float lodOf(float lod) {
    return lod <= 0.0 ? uBaseLod : uBaseLod + log2(1.0 + (exp2(lod) - 1.0) * uRefScale);
}
vec3 sampleLod(vec2 u, float level) { return textureLod(uImage, toImage(toScreen(u)), level).rgb; }
vec3 sampleAt(vec2 u, float lod) { return sampleLod(u, lodOf(lod)); }

// ---------------------------------------------------------------- noise
uint hash(uint x) {
    x ^= x >> 16; x *= 0x7feb352du;
    x ^= x >> 15; x *= 0x846ca68bu;
    x ^= x >> 16;
    return x;
}
float rnd(uvec3 v) {
    return float(hash(v.x ^ hash(v.y + hash(v.z)))) * (1.0 / 4294967295.0);
}
float vnoise(vec2 p, uint seed) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    uvec2 c = uvec2(ivec2(i) + 65536);
    float a = rnd(uvec3(c, seed));
    float b = rnd(uvec3(c + uvec2(1u, 0u), seed));
    float d = rnd(uvec3(c + uvec2(0u, 1u), seed));
    float e = rnd(uvec3(c + uvec2(1u, 1u), seed));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(d, e, u.x), u.y);
}

// ---------------------------------------------------------------- shapes
float sdRoundRect(vec2 p, vec2 halfSize, float r) {
    vec2 q = abs(p) - halfSize + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
vec3 screenBlend(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - clamp(b, 0.0, 1.0)); }
vec3 spectrum(float x) { return clamp(abs(fract(x + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }

// ---------------------------------------------------------------- colour
vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
float hueBump(float h, float centre) {
    float d = abs(fract(h - centre + 0.5) - 0.5);
    return max(0.0, 1.0 - d * 6.0);
}

float sCurve(float x, float k) {
    x = clamp(x, 0.0, 1.0);
    return x < 0.5 ? 0.5 * pow(2.0 * x, k) : 1.0 - 0.5 * pow(2.0 * (1.0 - x), k);
}

vec3 grade(vec3 c) {
    // White balance.
    c *= vec3(1.0 + 0.10 * uTemp, 1.0 - 0.07 * uTint + 0.01 * uTemp, 1.0 - 0.13 * uTemp);
    // Dye crosstalk, then each layer's own curve (the crossovers that tint shadows and highlights).
    c = max(uMixer * c, 0.0);
    c = pow(c, uGamma);
    // Film's take on particular hues: greens drift to olive, blues to cyan, and so on.
    if (dot(abs(uHueShift), vec3(1.0)) > 0.0) {
        vec3 hsv = rgb2hsv(clamp(c, 0.0, 1.0));
        float h = hsv.x;
        h += (uHueShift.r * hueBump(h, 0.0) + uHueShift.g * hueBump(h, 1.0 / 3.0) + uHueShift.b * hueBump(h, 2.0 / 3.0)) / 12.0;
        c = hsv2rgb(vec3(fract(h), hsv.yz));
    }
    // Saturation, lower in the deep shadows and the highlights like a real emulsion.
    float l = dot(c, LUMA);
    float sat = uSat * mix(uSatShadow, 1.0, smoothstep(0.0, 0.3, l)) * mix(1.0, uSatHigh, smoothstep(0.65, 1.0, l));
    c = mix(vec3(l), c, sat);
    // Bleach bypass: silver laid over the colour.
    if (uBleach > 0.0) {
        vec3 silver = vec3(l);
        vec3 ov = mix(2.0 * c * silver, 1.0 - 2.0 * (1.0 - c) * (1.0 - silver), step(0.5, silver));
        c = mix(c, mix(silver, ov, 0.45), uBleach);
    }
    // Gentle shoulder before the S-curve so blown highlights roll instead of clip.
    c = c / (1.0 + uRolloff * c * c);
    c = vec3(sCurve(c.r, uContrast), sCurve(c.g, uContrast), sCurve(c.b, uContrast));
    // Split toning.
    l = dot(c, LUMA);
    c += uShadowTint * (1.0 - smoothstep(0.0, 0.55, l)) + uHighTint * smoothstep(0.45, 1.0, l);
    // Faded blacks, slightly lowered whites.
    vec3 black = vec3(uFade) * vec3(1.0, 0.97, 1.03);
    vec3 white = vec3(1.0 - uFade * 0.25 - uRolloff * 0.3);
    return black + clamp(c, 0.0, 1.0) * (white - black);
}

// ---------------------------------------------------------------- log
float slog3(float x) {
    return x >= 0.01125 ? (420.0 + log(max((x + 0.01) / 0.19, 1e-6)) / log(10.0) * 261.5) / 1023.0
                        : (x * (171.2102946929 - 95.0) / 0.01125 + 95.0) / 1023.0;
}
float slog3Inv(float y) {
    float v = y * 1023.0;
    return v >= 171.2102946929 ? pow(10.0, (v - 420.0) / 261.5) * 0.19 - 0.01
                               : (v - 95.0) * 0.01125 / (171.2102946929 - 95.0);
}
vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 linearToSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 logView(vec3 y) {
    vec3 lin = vec3(slog3Inv(y.r), slog3Inv(y.g), slog3Inv(y.b));
    return linearToSrgb(1.0 - exp(-max(lin, 0.0) * 1.6));
}

// ---------------------------------------------------------------- frame layout
// P is the position in "s units" (the frame's short side is 1.0), S the frame size.
// Works out which picture cell P falls in, the uv inside it, and the border around it.
struct Layout {
    vec2 cp;          // content uv, upright
    vec2 size;        // content size in s units
    float inside;     // 1 inside the picture, 0 on the border
    vec3 border;      // border colour at P
};

Layout rectLayout(vec2 P, vec4 r, float radius, float soft) {
    Layout L;
    L.size = r.zw - r.xy;
    L.cp = (P - r.xy) / L.size;
    vec2 c = (r.xy + r.zw) * 0.5;
    float d = sdRoundRect(P - c, L.size * 0.5, radius);
    L.inside = 1.0 - smoothstep(-soft, soft, d);
    L.border = vec3(0.0);
    return L;
}

// Picture fitted to an aspect ratio and centred in a box.
vec4 fitRect(vec2 lo, vec2 hi, float aspect) {
    vec2 sz = hi - lo;
    vec2 s = sz.x / sz.y > aspect ? vec2(sz.y * aspect, sz.y) : vec2(sz.x, sz.x / aspect);
    vec2 c = (lo + hi) * 0.5;
    return vec4(c - s * 0.5, c + s * 0.5);
}

// Edge printing in a band [a0, a1] across the film, running along it. On an upright
// (portrait) strip the text reads bottom to top, so the letters' tops face the edge.
float edgePrint(float across, float along, float a0, float a1, bool portrait) {
    if (across < a0 || across > a1) return 0.0;
    float t = (across - a0) / (a1 - a0);
    float len = (a1 - a0) * 16.0;
    return texture(uEdge, vec2(fract(along / len), portrait ? t : 1.0 - t)).r;
}

Layout layoutFrame(vec2 P, vec2 S) {
    float px = 1.0 / min(uTargetSize.x, uTargetSize.y); // one output pixel in s units
    bool portrait = S.x < S.y;
    float across = portrait ? P.x : P.y;
    float along = portrait ? P.y : P.x;
    float alongLen = portrait ? S.y : S.x;
    Layout L = rectLayout(P, vec4(0.0, 0.0, S), 0.0, px);
    L.inside = 1.0;

    if (uBorder == 1) {
        // Projector gate: rounded, slightly soft-edged window in black.
        float m = 0.035;
        L = rectLayout(P, vec4(m, m, S - m), 0.075, 0.006);
        L.border = vec3(0.015, 0.012, 0.01);
    } else if (uBorder == 2) {
        // Instant print: cream paper, thick chin.
        L = rectLayout(P, vec4(0.06, 0.24, S.x - 0.06, S.y - 0.06), 0.004, px);
        L.border = vec3(0.94, 0.925, 0.89) - vnoise(P * 900.0, 77u) * 0.025 - vnoise(P * 60.0, 78u) * 0.015;
    } else if (uBorder == 3) {
        // 35mm negative strip on a lightbox: sprocket holes and edge printing.
        float band = 0.157;
        vec4 r = portrait ? vec4(band + 0.012, 0.02, 1.0 - band - 0.012, S.y - 0.02)
                          : vec4(0.02, band + 0.012, S.x - 0.02, 1.0 - band - 0.012);
        L = rectLayout(P, r, 0.012, px);
        float a = across > 0.5 ? 1.0 - across : across;
        float pitch = 0.1357;
        float k = mod(along - alongLen * 0.5 + pitch * 0.5, pitch) - pitch * 0.5;
        float hole = 1.0 - smoothstep(-px, px, sdRoundRect(vec2(k, a - 0.097), vec2(0.0283, 0.04), 0.008));
        vec3 base = vec3(0.035, 0.028, 0.024);
        base += vec3(0.9, 0.55, 0.25) * edgePrint(across, along, 0.012, 0.05, portrait);
        L.border = mix(base, vec3(0.97, 0.95, 0.9), hole);
    } else if (uBorder == 4) {
        // Filed-out negative carrier: black border with a rough inner edge.
        float m = 0.045;
        L = rectLayout(P, vec4(m, m, S - m), 0.004, px);
        float rough = (vnoise(P * 55.0, 31u) - 0.5) * 0.012 + (vnoise(P * 9.0, 32u) - 0.5) * 0.01;
        L.inside = 1.0 - smoothstep(-px, px, sdRoundRect(P - S * 0.5, S * 0.5 - m, 0.004) + rough);
        L.border = vec3(0.012);
    } else if (uBorder == 5 || uBorder == 6) {
        // Instant square / instant mini: window of a fixed shape, the rest is chin.
        float side = 0.065;
        float aspect = uBorder == 5 ? 1.0 : 0.74;
        float w = S.x - side * 2.0;
        float h = w / aspect;
        float maxH = S.y - side * 1.15 - 0.16;
        if (h > maxH) { h = maxH; w = h * aspect; }
        float x0 = (S.x - w) * 0.5;
        float top = S.y - side * 1.15;
        L = rectLayout(P, vec4(x0, top - h, x0 + w, top), 0.006, px);
        L.border = vec3(0.95, 0.94, 0.91) - vnoise(P * 900.0, 77u) * 0.02 - vnoise(P * 60.0, 78u) * 0.012;
    } else if (uBorder == 7) {
        L = rectLayout(P, vec4(0.035, 0.035, S - 0.035), 0.0, px);
        L.border = vec3(0.97, 0.965, 0.95);
    } else if (uBorder == 8) {
        // Gallery mat: deep white mat, thin dark keyline.
        L = rectLayout(P, vec4(0.12, 0.12, S - 0.12), 0.0, px);
        float d = sdRoundRect(P - S * 0.5, S * 0.5 - 0.12, 0.0);
        float key = 1.0 - smoothstep(0.002, 0.002 + px, abs(d - 0.006));
        L.border = mix(vec3(0.96, 0.955, 0.94), vec3(0.18), key * 0.6);
    } else if (uBorder == 9) {
        L = rectLayout(P, vec4(0.035, 0.035, S - 0.035), 0.0, px);
        L.border = vec3(0.01);
    } else if (uBorder == 10 || uBorder == 11) {
        // Roll film seen on a lightbox: picture cells repeat along the strip.
        bool s8 = uBorder == 11;
        float a0 = s8 ? 0.19 : 0.075;                    // picture starts this far across
        float a1 = s8 ? 0.97 : 0.925;
        float cellAcross = a1 - a0;
        float cellAlong = s8 ? cellAcross * 0.75 : cellAcross;   // Super 8 frames are 4:3, 120 is square
        float gap = s8 ? 0.06 : 0.045;
        float pitch = cellAlong + gap;
        float k = mod(along - alongLen * 0.5 + pitch * 0.5, pitch) - pitch * 0.5;  // -pitch/2..pitch/2
        vec2 local = vec2(across - a0, k + cellAlong * 0.5);          // across, along inside the cell
        vec2 cellSize = vec2(cellAcross, cellAlong);
        float d = sdRoundRect(local - cellSize * 0.5, cellSize * 0.5, s8 ? 0.05 : 0.01);
        L.inside = 1.0 - smoothstep(-px, px, d);
        vec2 uvA = local / cellSize;                                     // (across, along) 0..1
        L.cp = portrait ? vec2(uvA.x, uvA.y) : vec2(uvA.y, uvA.x);
        L.size = portrait ? cellSize : cellSize.yx;
        vec3 base = s8 ? vec3(0.05, 0.035, 0.025) : vec3(0.025);
        if (s8) {
            float hole = 1.0 - smoothstep(-px, px, sdRoundRect(vec2(across - 0.075, k), vec2(0.032, 0.045), 0.012));
            base = mix(base, vec3(0.97, 0.95, 0.9), hole);
        } else {
            base += vec3(0.85, 0.55, 0.3) * edgePrint(across, along, 0.018, 0.058, portrait);
        }
        L.border = base;
    } else if (uBorder == 12) {
        // Plastic slide mount with a rounded window and an inner bevel.
        vec4 r = fitRect(S * 0.14, S * 0.86, portrait ? 2.0 / 3.0 : 1.5);
        L = rectLayout(P, r, 0.025, px);
        float d = sdRoundRect(P - S * 0.5, (r.zw - r.xy) * 0.5, 0.025);
        vec3 plastic = vec3(0.93, 0.92, 0.89) - vnoise(P * 400.0, 55u) * 0.02;
        plastic *= 1.0 - 0.3 * exp(-max(d, 0.0) / 0.012);                // shadow into the window
        plastic *= 0.9 + 0.1 * smoothstep(0.0, 0.03, min(min(P.x, S.x - P.x), min(P.y, S.y - P.y)));
        L.border = plastic;
    } else if (uBorder == 13 || uBorder == 14) {
        // Letterbox to 2.39:1, or pillar/letterbox to Academy 4:3, in black.
        float aspect = uBorder == 13 ? 2.39 : (portrait ? 0.75 : 4.0 / 3.0);
        L = rectLayout(P, fitRect(vec2(0.0), S, aspect), 0.0, px);
        L.border = vec3(0.0);
    } else if (uBorder == 15) {
        // Deckle-edged print on a dark table.
        float m = 0.03;
        float scallop = 0.006 * (abs(sin(P.x * 95.0)) + abs(sin(P.y * 95.0)));
        float paperD = sdRoundRect(P - S * 0.5, S * 0.5 - m, 0.0) + scallop;
        float paper = 1.0 - smoothstep(-px, px, paperD);
        L = rectLayout(P, vec4(0.085, 0.085, S - 0.085), 0.0, px);
        L.inside *= paper;
        vec3 paperCol = vec3(0.95, 0.93, 0.88) - vnoise(P * 700.0, 66u) * 0.03;
        L.border = mix(vec3(0.09, 0.08, 0.075), paperCol, paper);
    } else if (uBorder == 16) {
        L = rectLayout(P, vec4(0.03, 0.03, S - 0.03), 0.07, px);
        L.border = vec3(0.0);
    }
    return L;
}

// ---------------------------------------------------------------- main
void main() {
    vec2 fragUV = (gl_FragCoord.xy + uTileOffset) / uTargetSize;
    int frameK = uTargetRot + uFrameRot;
    vec2 f = rot(frameK, fragUV);                                    // frame space 0..1
    vec2 framePx = ((frameK & 1) == 1) ? uTargetSize.yx : uTargetSize;
    float aspect = framePx.x / framePx.y;
    vec2 S = framePx / min(framePx.x, framePx.y);                    // frame size in s units
    vec2 P = f * S;

    Layout L = layoutFrame(P, S);
    vec2 cp = L.cp;
    float rectAspect = L.size.x / L.size.y;
    vec2 asp = vec2(rectAspect, 1.0);
    float cornerDist = length((cp - 0.5) * asp) / (0.5 * length(asp));  // 0 centre, 1 corner
    float mask = 1.0;

    // ---- lens distortion: barrel, up to a full circular fisheye
    vec2 q = cp;
    if (uDistortion > 0.0) {
        vec2 d = (cp - 0.5) * asp;
        float norm = uCircle > 0.5 ? 0.5 * min(rectAspect, 1.0) : 0.5 * length(asp);
        float rn = length(d) / norm;
        float k = uDistortion * (uCircle > 0.5 ? 1.4 : 0.7);
        d *= (1.0 + k * rn * rn) / (1.0 + k);
        q = 0.5 + d / asp;
        if (uCircle > 0.5) {
            float px = 1.0 / min(uTargetSize.x, uTargetSize.y);
            mask *= 1.0 - smoothstep(1.0 - 3.0 * px / norm, 1.0, rn);
        }
    }

    // ---- frame slip: the frame line rolls into the gate
    if (uSlip != 0.0) {
        float y = q.y + uSlip;
        float gap = 0.07;
        if (y > 1.0) y -= 1.0 + gap; else if (y < 0.0) y += 1.0 + gap;
        if (y < 0.0 || y > 1.0) mask = 0.0;
        q.y = clamp(y, 0.0, 1.0);
    }

    // ---- tape: line jitter, tracking band, head-switching noise
    float lineCount = 480.0;
    float line = floor(q.y * lineCount);
    float band = 0.0;
    if (uVhs > 0.0) {
        band = exp(-pow((q.y - uTracking) / 0.035, 2.0));
        q.x += (rnd(uvec3(uint(line), uSeed, 3u)) - 0.5) * 0.0025 * uVhs;
        q.x += band * 0.02 * uVhs * (rnd(uvec3(uint(line), uSeed, 5u)) - 0.3);
        if (q.y < 0.022) q.x += (0.022 - q.y) * 1.4 * uVhs;
    }

    // ---- cover-crop the picture into the content cell
    vec2 u = q;
    if (rectAspect < aspect) u.x = 0.5 + (q.x - 0.5) * rectAspect / aspect;
    else u.y = 0.5 + (q.y - 0.5) * aspect / rectAspect;
    vec2 s = toScreen(u);

    // ---- sampling: fringing, toy-lens corners, low resolution
    float lod = uLowRes * 2.6 + uCornerBlur * 4.0 * smoothstep(0.25, 1.0, cornerDist);
    vec2 dir = u - 0.5;
    float ca = uAberration * 0.006;
    vec3 c;
    c.r = sampleAt(u + dir * ca, lod).r;
    c.g = sampleAt(u, lod).g;
    c.b = sampleAt(u - dir * ca, lod).b;

    // Softness and sharpening work on a 1080 p-sized neighbourhood at any output size.
    float softLod = uBaseLod + lod + log2(uRefScale);
    vec2 o1 = uImageTexel * (1.0 + 2.5 * max(uSoftness, 0.0)) * exp2(softLod);
    vec2 ti = toImage(s);
    vec3 blur = 0.25 * (textureLod(uImage, ti + vec2(o1.x, o1.y), softLod).rgb
                      + textureLod(uImage, ti + vec2(-o1.x, o1.y), softLod).rgb
                      + textureLod(uImage, ti + vec2(o1.x, -o1.y), softLod).rgb
                      + textureLod(uImage, ti + vec2(-o1.x, -o1.y), softLod).rgb);
    if (uSoftness > 0.0) c = mix(c, blur, min(uSoftness * 1.2, 1.0));
    else c = c + (c - blur) * (-uSoftness) * 1.5;
    c = clamp(c, 0.0, 1.0);

    // ---- camera-movement blurs: soft, zoom, spin, motion. The centre can stay sharp.
    if (uBlurMode > 0 && uBlur > 0.0) {
        vec2 ua = vec2(aspect, 1.0);
        vec2 d = (u - 0.5) * ua;
        float r = length(d) / (0.5 * length(ua));                       // 0 centre, 1 corner
        float w = uBlurFocus > 0.0 ? smoothstep(uBlurFocus * 0.7, uBlurFocus * 0.7 + 0.45, r) : 1.0;
        if (w > 0.001) {
            float jitter = rnd(uvec3(uvec2(gl_FragCoord.xy + uTileOffset), uSeed + 61u));
            float span = uBlur * w * (uBlurMode == 1 ? 0.06 : uBlurMode == 4 ? 0.15 : 0.12 * max(r, 0.2));
            // Sample from a mip level matching the tap spacing, so the streaks stay smooth.
            float imagePx = 1.0 / min(uImageTexel.x, uImageTexel.y);
            float blurLod = max(0.0, log2(span * imagePx / 12.0) - 0.5);
            vec3 acc = vec3(0.0);
            for (int i = 0; i < 12; i++) {
                float t = (float(i) + jitter) / 12.0 - 0.5;
                vec2 p;
                if (uBlurMode == 2) {
                    p = 0.5 + (u - 0.5) * (1.0 + t * uBlur * 0.32 * w);
                } else if (uBlurMode == 3) {
                    float a = t * uBlur * 0.55 * w;
                    p = 0.5 + vec2(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a)) / ua;
                } else if (uBlurMode == 4) {
                    p = u + uBlurDir / ua * t * uBlur * 0.15 * w;
                } else {
                    float ang = float(i) * 2.39996 + jitter * 6.2832;
                    float rad = sqrt((float(i) + 0.5) / 12.0) * uBlur * 0.03 * w;
                    p = u + vec2(cos(ang), sin(ang)) * rad / ua;
                }
                acc += sampleLod(p, lodOf(lod) + blurLod);
            }
            c = acc / 12.0;
        }
    }

    // ---- interlace: odd lines still show the previous field
    if (uInterlace > 0.0) {
        float field = floor(f.y * framePx.y / max(1.0, framePx.y / 540.0));
        if (mod(field, 2.0) > 0.5) {
            vec3 prev = textureLod(uPrevImage, toImage(s), lodOf(lod)).rgb;
            c = mix(c, prev, uInterlace);
        }
    }

    // ---- tape chroma: colour smeared sideways and lagging behind the luma
    if (uVhs > 0.0) {
        vec3 cc = vec3(0.0);
        for (int i = 1; i <= 4; i++) cc += sampleAt(u - vec2(0.0035 * float(i), 0.0), lod + 0.5);
        cc *= 0.25;
        mat3 toYiq = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
        mat3 toRgb = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
        vec3 yiq = toYiq * c;
        vec3 yiqC = toYiq * cc;
        yiq.yz = mix(yiq.yz, yiqC.yz * 1.15, uVhs);
        c = clamp(toRgb * yiq, 0.0, 1.0);
    }

    // ---- stereo split: left eye in red, right eye in cyan
    if (uAnaglyph > 0.0) {
        float off = 0.004 + 0.016 * uAnaglyph;
        vec3 le = sampleAt(u + vec2(off, 0.0), lod);
        vec3 re = sampleAt(u - vec2(off, 0.0), lod);
        c = mix(c, vec3(dot(le, LUMA), re.g, re.b), min(1.0, uAnaglyph * 2.0));
    }

    // ---- prism ghost: a faint shifted copy tinted by the spectrum
    if (uPrism > 0.0) {
        vec3 ghost = sampleAt(u + uPrismGhost, lod + 1.0);
        vec3 tint = spectrum(dot(cp - uPrismBand.xy, uPrismBand.zw) * 1.6 + uTime * 0.03);
        c = screenBlend(c, ghost * tint * 0.4 * uPrism);
    }

    // How much of this pixel is itself a highlight (same test as the bright pass).
    float l0 = dot(c * c, LUMA);
    float self = l0 * smoothstep(uHalThreshold, uHalThreshold + 0.3, l0);

    // ---- emulsion
    c = grade(c);

    // ---- halation, bloom and streaks, as light (then back to display space)
    vec3 gT = texture(uGlowTight, s).rgb;
    vec3 gW = texture(uGlowWide, s).rgb;
    vec3 lin = c * c;
    // Halation is light bouncing off the film base back into the red layer: a warm
    // fringe *around* highlights, so take the spread glow minus the highlight itself.
    float glowAround = dot(gT * 0.5 + gW * 0.5, LUMA);
    float halo = max(glowAround - self * 0.9, 0.0);
    lin += uHalColor * halo * uHalation * 2.6;
    if (uStreak > 0.0) {
        // A point light spread this wide is faint, a window is not: compress the response
        // so both read as a streak and neither blows out.
        float st = dot(texture(uStreakTex, s).rgb, LUMA);
        st = (1.0 - exp(-st * 14.0)) * 0.55;
        lin += mix(vec3(0.35, 0.55, 1.0), vec3(0.8), uMono) * st * uStreak;
    }
    vec3 bloomCol = mix(gW, vec3(dot(gW, LUMA)), uMono);
    lin = 1.0 - (1.0 - clamp(lin, 0.0, 1.0)) * (1.0 - clamp(bloomCol * uBloom * 0.7, 0.0, 1.0));
    if (uDiffusion > 0.0) {
        // Mist filter: a soft copy of the whole picture laid over it. Highlights spread,
        // shadows lift and contrast drops, like shooting through a diffusion glass.
        vec3 dif = texture(uDiffuseTex, s).rgb;
        dif = mix(dif, vec3(dot(dif, LUMA)), uMono);
        lin = mix(lin, dif, uDiffusion * 0.18);
        lin = 1.0 - (1.0 - clamp(lin, 0.0, 1.0)) * (1.0 - clamp(dif * dif * 1.1 * uDiffusion, 0.0, 1.0));
    }
    c = sqrt(max(lin, 0.0));

    // ---- on-camera flash: hot centre, fast fall-off
    if (uFlash > 0.0) {
        float r2 = cornerDist * cornerDist;
        c *= mix(1.0, 1.4 - 1.05 * r2, uFlash);
        c = mix(c, c * c * (3.0 - 2.0 * c), uFlash * 0.35);
    }

    // ---- light leaks: exposures that sneaked in from the edges
    if (uLeak > 0.0) {
        vec3 leak = vec3(0.0);
        vec2 qq = cp * asp;
        for (int i = 0; i < 3; i++) {
            vec2 d = qq - uLeakPos[i] * asp;
            float r = uLeakRadius[i];
            leak += uLeakColor[i] * exp(-dot(d, d) / (r * r));
        }
        float e = uBurnEdge == 0 ? cp.x : uBurnEdge == 1 ? 1.0 - cp.x : uBurnEdge == 2 ? cp.y : 1.0 - cp.y;
        float alongB = (uBurnEdge < 2) ? cp.y : cp.x;
        float burn = exp(-e / 0.09) * (0.55 + 0.45 * sin(alongB * 5.0 + uBurnPhase)) * uBurnStrength;
        leak += vec3(1.0, 0.3, 0.06) * burn;
        leak = mix(leak, vec3(dot(leak, LUMA)), uMono);
        c = screenBlend(c, leak * uLeak);
    }

    // ---- prism rainbow: an arc bending across the frame
    if (uPrism > 0.0) {
        vec2 arcCentre = uPrismBand.xy - uPrismBand.zw * 0.85;
        float d = (length((cp - arcCentre) * asp) - 0.85) / max(rectAspect, 1.0);
        // A pale band of light with the spectrum split along its edges.
        vec3 rainbow = mix(vec3(1.0, 0.96, 0.9), spectrum(d * 5.0 + 0.1), 0.55) * exp(-d * d / 0.006);
        c = screenBlend(c, rainbow * 0.75 * uPrism);
    }

    // ---- vignette
    c *= mix(1.0, 1.0 - smoothstep(0.3, 1.15, cornerDist) * 0.85, uVignette);

    // ---- flicker and colour density pumping
    c *= uGain;

    // ---- grain: two octaves of value noise, strongest in the mid-tones
    if (uGrain > 0.0) {
        vec2 gp = cp * L.size * (1080.0 / uGrainSize);       // short side = 1080 px
        float g = (vnoise(gp, uSeed) - 0.5) + 0.55 * (vnoise(gp * 2.17 + 13.7, uSeed + 7u) - 0.5);
        // Clumping: grain is not uniform, it gathers in soft patches.
        g *= 0.75 + 0.5 * vnoise(gp * 0.21 + 5.3, uSeed + 11u);
        vec3 grain = vec3(g);
        if (uColorGrain > 0.0) {
            vec3 ch = vec3(vnoise(gp * 1.31 + 3.1, uSeed + 19u), vnoise(gp * 1.29 + 7.7, uSeed + 23u),
                           vnoise(gp * 0.83 + 1.9, uSeed + 29u)) - 0.5;   // blue layer: coarsest grain
            grain += ch * uColorGrain * 0.9;
        }
        float l = dot(c, LUMA);
        float w = mix(1.0, 4.0 * l * (1.0 - l), 0.65) + 0.15;
        c += grain * uGrain * 0.26 * w;
    }

    // ---- tape noise and scanlines
    if (uVhs > 0.0) {
        // Noise cells sized for a 1080 p picture, so a still shows the same tape noise.
        float n = rnd(uvec3(uvec2((gl_FragCoord.xy + uTileOffset) / (vec2(2.0, 1.0) * uRefScale)), uSeed + 41u)) - 0.5;
        c += n * (0.05 + 0.5 * band) * uVhs;
        c += band * uVhs * 0.12 * step(0.93, rnd(uvec3(uint(line), uint(fragUV.x * 60.0), uSeed)));
        float scan = 0.5 + 0.5 * cos(f.y * framePx.y * PI / max(1.0, framePx.y / 480.0));
        c *= 1.0 - 0.14 * uVhs * scan;
    }

    // ---- dust and scratches
    if (uDust > 0.0) {
        vec2 dp = cp * asp * 16.0;
        vec2 cell = floor(dp);
        uvec3 h = uvec3(uvec2(ivec2(cell) + 4096), uSeed);
        if (rnd(h) < uDust * 0.09) {
            vec2 centre = 0.2 + 0.6 * vec2(rnd(h + uvec3(0u, 0u, 101u)), rnd(h + uvec3(0u, 0u, 202u)));
            vec2 stretch = vec2(1.0, 1.0 + 3.0 * rnd(h + uvec3(0u, 0u, 404u)));
            float rad = mix(0.012, 0.07, pow(rnd(h + uvec3(0u, 0u, 303u)), 2.0));
            float d = length((fract(dp) - centre) * stretch);
            float speck = 1.0 - smoothstep(rad * 0.5, rad, d);
            bool bright = rnd(h + uvec3(0u, 0u, 505u)) < 0.3;
            c = mix(c, bright ? vec3(0.92) : vec3(0.03), speck * 0.9);
        }
        for (int i = 0; i < 2; i++) {
            float sx = uScratchX[i];
            if (sx < 0.0) continue;
            float x = sx + 0.0015 * sin(cp.y * 31.0 + sx * 50.0);
            float d = abs(cp.x - x) * framePx.x * L.size.x / S.x;
            float ln = 1.0 - smoothstep(0.4, 1.4, d);
            ln *= 0.5 + 0.5 * vnoise(vec2(cp.y * 40.0, sx * 100.0), uSeed);
            c = mix(c, vec3(0.9, 0.88, 0.84), ln * 0.55 * uScratchAlpha);
        }
    }

    // ---- roll burn: the leader flaring out when the camera starts and stops
    if (uRollBurn > 0.0) {
        float b = uRollBurn * 1.7 - (1.0 - cp.x) * 0.7 + (vnoise(cp * 3.0 + uTime * 0.7, 91u) - 0.5) * 0.7;
        b = clamp(b, 0.0, 1.0);
        vec3 fire = mix(vec3(1.0, 0.42, 0.08), vec3(1.0, 0.96, 0.86), b * b);
        c = screenBlend(c, fire * b);
    }

    // ---- stamps
    float shortSide = min(L.size.x, L.size.y);
    vec2 cpx = cp * L.size;                                  // s units inside the content
    if (uStampStyle == 1 || uStampStyle == 2) {
        // Seven-segment date, bottom right.
        float hgt = 0.055 * shortSide;
        vec2 size = vec2(hgt * uStampAspect, hgt);
        vec2 origin = vec2(L.size.x - size.x - 0.04 * shortSide, 0.045 * shortSide);
        vec2 t = (cpx - origin) / size;
        if (t.x >= 0.0 && t.x <= 1.0 && t.y >= 0.0 && t.y <= 1.0) {
            vec3 st = texture(uStamp, vec2(t.x, 1.0 - t.y)).rgb;
            c = screenBlend(c, st * 0.95);
        }
    } else if (uStampStyle == 3) {
        // Camcorder display: REC top left, date and time bottom left.
        float hgt = 0.06 * shortSide;
        vec2 size = vec2(hgt * 8.0, hgt);
        vec2 m = vec2(0.06 * shortSide);
        vec2 tA = (cpx - vec2(m.x, L.size.y - m.y - hgt)) / size;
        vec2 tB = (cpx - m) / size;
        vec2 sh = vec2(0.004, -0.02);
        for (int i = 0; i < 2; i++) {
            vec2 t = i == 0 ? tA : tB;
            if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0) continue;
            float base = i == 0 ? 0.0 : 0.5;
            vec3 o = texture(uOsd, vec2(t.x, base + (1.0 - t.y) * 0.5)).rgb;
            float shadow = texture(uOsd, vec2(t.x - sh.x, base + (1.0 - t.y + sh.y) * 0.5)).r;
            c *= 1.0 - 0.55 * shadow;
            c = mix(c, o, max(o.r, max(o.g, o.b)));
        }
    }

    c *= mask;                      // fisheye circle and the frame line during a slip are black
    c = mix(L.border, c, L.inside);

    // ---- text overlays, on top of everything (border included)
    if (uTextOn > 0.5) {
        vec4 t = texture(uTextTex, vec2(f.x, 1.0 - f.y));
        c = c * (1.0 - t.a) + t.rgb;
    }

    if (uLogMode == 1 || uLogMode == 3) {
        vec3 lin = srgbToLinear(clamp(c, 0.0, 1.0)) * uLogGain;
        c = vec3(slog3(lin.r), slog3(lin.g), slog3(lin.b));
    }
    if (uLogMode == 2 || uLogMode == 3) c = logView(clamp(c, 0.0, 1.0));

    // A hair of dither so smooth skies never band.
    c += (rnd(uvec3(uvec2(gl_FragCoord.xy + uTileOffset), uSeed + 99u)) - 0.5) / 255.0;
    oColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
"""
}
