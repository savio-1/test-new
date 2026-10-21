#version 300 es
#define STUDIO 1
// STUDIO 1 builds the program for the editor's looks (FilmLook.studio); other looks use the
// program without that code, so they pay nothing for it.
#ifndef STUDIO
#define STUDIO 0
#endif
precision highp float;
precision highp int;
precision mediump sampler3D;

// Film stock as a 3D LUT baked by tools/film-lab (negative + print model); grade() is the
// fallback for stocks without one. uIntensity blends the stock with the camera's picture.
uniform sampler3D uLut;
uniform float uLutOn;
uniform float uIntensity;
uniform float uExposureGain;  // digital exposure, for imported pictures (the camera's is real)
// Basic adjustments, after the stock: temperature, tint, contrast, saturation (-1..1)
uniform vec4 uAdjA;
// highlights, shadows, vibrance, clarity (-1..1)
uniform vec4 uAdjB;

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
uniform sampler2D uTextBackTex;  // text set behind the subject, same space as uTextTex
uniform float uTextBackOn;
uniform int uTextBlend;          // TextBlend.shaderId of the front text, and of the text behind
uniform int uTextBackBlend;
uniform sampler2D uSubject;      // subject matte: upright picture space, row 0 at the top
uniform float uSubjectOn;
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

// The photo editor's looks (FilmLook.studio): the effects above, drawn its way. In the studio program
// uGlowTight / uStreakTex hold the halation's two halos, uGlowWide the bloom, uDiffuseTex the
// graded picture blurred for tilt-shift or the soft blur, uClarTex blurred for clarity.
uniform sampler2D uClarTex;
uniform vec2 uStudioGain;   // halation halo gains
uniform float uStudioSoft;  // 1: uDiffuseTex holds the soft blur
uniform float uSharpen;     // 0..1
uniform float uClarity;     // -1..1
uniform int uSmearCap;      // most samples a zoom, spin or motion blur takes
// Effects any look can use
uniform float uNoise;
uniform float uHalftone;
uniform float uThreshold;   // two-tone: paper above this tone, ink below (0 off)
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uGhost;
uniform float uTilt;
uniform float uTiltY;       // 0 = top
uniform float uTiltSize;

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

// Photographic style (Original camera). See PhotoStyle.kt.
uniform float uStyleOn;
uniform vec4 uStyleA;       // warm, tint, saturation, contrast (the style's own, before palette)
uniform vec4 uStyleB;       // tone, brightness, fade, mono
uniform vec3 uStyleShadow;
uniform vec3 uStyleHigh;
uniform vec4 uStyleUser;    // pad tone, pad colour, palette, skin weight

// Log video: 0 off, 1 encode the camera's picture to S-Log3 (when the ISP can't),
// 2 show S-Log3 as Rec.709 (view assist), 3 both, 4 show 10-bit HLG as Rec.709. See LogCurve.kt.
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

// ---------------------------------------------------------------- film stock LUT and basics
vec3 applyLut(vec3 c) {
    // 33 points per side: sample at texel centres.
    vec3 uvw = clamp(c, 0.0, 1.0) * (32.0 / 33.0) + 0.5 / 33.0;
    return texture(uLut, uvw).rgb;
}

vec3 basicAdjust(vec3 c, float localLuma) {
    float t = uAdjA.x, ti = uAdjA.y;
    if (t != 0.0 || ti != 0.0) {
        float l0 = dot(c, LUMA);
        c *= vec3(1.0 + 0.12 * t + 0.03 * ti, 1.0 + 0.01 * t - 0.08 * ti, 1.0 - 0.16 * t + 0.03 * ti);
        c *= l0 / max(dot(c, LUMA), 1e-4);
    }
    // Highlights and shadows: move only their end of the scale, hue kept.
    float hi = uAdjB.x, sh = uAdjB.y;
    if (hi != 0.0 || sh != 0.0) {
        float l = max(dot(c, LUMA), 1e-4);
        float l2 = l + sh * 1.4 * l * pow(1.0 - l, 3.0) + hi * 1.4 * l * l * l * (1.0 - l) * (hi < 0.0 ? 1.6 : 1.0);
        c *= clamp(l2, 0.0, 1.2) / l;
    }
    // Clarity: local contrast in the mid-tones, against a wide blur of the picture.
    if (uAdjB.w != 0.0) {
        float l = dot(c, LUMA);
        float mid = 4.0 * l * (1.0 - l);
        c += (l - localLuma) * uAdjB.w * 0.9 * mid;
    }
    if (uAdjA.z != 0.0) {
        float k = 1.0 + 0.55 * uAdjA.z;
        c = vec3(sCurve(c.r, k), sCurve(c.g, k), sCurve(c.b, k));
    }
    float l = dot(c, LUMA);
    float s = 1.0 + uAdjA.w;
    if (uAdjB.z != 0.0) {
        float chroma = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
        s += uAdjB.z * (1.0 - chroma) * 0.9;
    }
    return clamp(mix(vec3(l), c, max(s, 0.0)), 0.0, 1.0);
}

// ---------------------------------------------------------------- photographic style
// How skin-like a colour is: warm hues of moderate saturation in the mid-tones.
float skinWeight(vec3 c) {
    vec3 hsv = rgb2hsv(clamp(c, 0.0, 1.0));
    float hue = hsv.x;
    float h = 1.0 - smoothstep(0.02, 0.06, abs(hue - 0.07));
    if (hue > 0.95) h = 1.0 - smoothstep(0.02, 0.06, 1.07 - hue);
    return h * smoothstep(0.1, 0.22, hsv.y) * (1.0 - smoothstep(0.62, 0.85, hsv.y))
             * smoothstep(0.12, 0.3, hsv.z);
}

vec3 photoStyle(vec3 c) {
    float p = uStyleUser.z;
    float skin = skinWeight(c);
    float l0 = dot(c, LUMA);

    // Undertone: a white-balance shift. Undertone styles lean on skin a little harder.
    float k = 1.0 + (uStyleUser.w - 1.0) * skin;
    float warm = uStyleA.x * p * k;
    float tint = uStyleA.y * p * k;
    c *= vec3(1.0 + 0.10 * warm + 0.035 * tint, 1.0 + 0.015 * warm - 0.07 * tint, 1.0 - 0.15 * warm + 0.03 * tint);
    c *= l0 / max(dot(c, LUMA), 1e-4);          // keep brightness: only the colour moves

    // Tone: lifted shadows and a softer curve going up the pad, deeper and punchier going down.
    float t = clamp(uStyleUser.x + uStyleB.x * p, -1.0, 1.0);
    float l = max(dot(c, LUMA), 1e-4);
    float l1 = pow(l, exp2(-0.55 * t));
    float kc = max(0.55, 1.0 + uStyleA.w * p - 0.22 * t);
    l1 = sCurve(l1, kc);
    float b = uStyleB.y * p;
    l1 = l1 * (1.0 + b) / (1.0 + b * l1);
    // Half hue-preserving (scale by the luma change), half per channel: strong colours don't
    // turn neon when brightened or go to mud when deepened.
    vec3 perChannel = clamp(c, 0.0, 1.0);
    perChannel = pow(perChannel, vec3(exp2(-0.55 * t)));
    perChannel = vec3(sCurve(perChannel.r, kc), sCurve(perChannel.g, kc), sCurve(perChannel.b, kc));
    perChannel = perChannel * (1.0 + b) / (1.0 + b * perChannel);
    c = mix(c * (l1 / l), perChannel, 0.5);
    // Anything pushed past white rolls toward white instead of shifting hue.
    float over = max(max(c.r, c.g), c.b);
    if (over > 1.0) c = mix(c / over, vec3(1.0), clamp((over - 1.0) * 0.5, 0.0, 1.0));

    // Colour: vibrance that spares colours already strong, and spares skin when boosting.
    l = dot(c, LUMA);
    float userSat = uStyleUser.y >= 0.0 ? 0.6 * uStyleUser.y : 0.92 * uStyleUser.y;
    float s = 1.0 + uStyleA.z * p + userSat;
    if (s > 1.0) {
        float chroma = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
        s = 1.0 + (s - 1.0) * (1.0 - 0.55 * chroma) * (1.0 - 0.5 * skin);
    }
    c = mix(vec3(l), c, max(s, 0.0));
    c = mix(c, vec3(l), uStyleB.w * p);

    // Split tints and faded blacks.
    c += (uStyleShadow * (1.0 - smoothstep(0.0, 0.5, l)) + uStyleHigh * smoothstep(0.5, 1.0, l)) * p;
    float fade = uStyleB.z * p;
    return clamp(fade + c * (1.0 - fade), 0.0, 1.0);
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

// 10-bit HLG (BT.2100, Rec.2020 primaries) shown on an SDR screen: the same filmic view.
float hlgInv(float e) {
    return e <= 0.5 ? e * e / 3.0 : (exp((e - 0.55991073) / 0.17883277) + 0.28466892) / 12.0;
}
vec3 hlgView(vec3 e) {
    vec3 lin = vec3(hlgInv(e.r), hlgInv(e.g), hlgInv(e.b)) * (0.18 / (0.38 * 0.38 / 3.0));
    // Columns of the BT.2020 -> BT.709 matrix.
    lin = mat3(1.6605, -0.1246, -0.0182, -0.5876, 1.1329, -0.1006, -0.0728, -0.0083, 1.1187) * lin;
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
/** Premultiplied text [t] over [b] in one of the TextBlend modes (0 is plain over). */
vec3 blendText(vec3 b, vec4 t, int mode) {
    if (mode == 0 || t.a < 0.0005) return b * (1.0 - t.a) + t.rgb;
    vec3 s = clamp(t.rgb / t.a, 0.0, 1.0);
    vec3 bb = clamp(b, 0.0, 1.0);
    vec3 r;
    if (mode == 1) r = 1.0 - (1.0 - bb) * (1.0 - s);
    else if (mode == 2) r = min(bb + s, 1.0);
    else if (mode == 3) r = mix(2.0 * bb * s, 1.0 - 2.0 * (1.0 - bb) * (1.0 - s), step(0.5, bb));
    else if (mode == 4) r = (1.0 - 2.0 * s) * bb * bb + 2.0 * s * bb;
    else if (mode == 5) r = bb * s;
    else if (mode == 6) r = abs(bb - s);
    else r = min(bb / max(1.0 - s, 0.001), 1.0);
    return mix(b, r, t.a);
}

// ---------------------------------------------------------------- the photo editor's looks
// FilmLook.studio: the editor's effects, in its order (colour, noise, halftone, sharpen and
// clarity, bloom, halation, fringing, motion / double / zoom / spin, tilt-shift, fisheye, soft
// blur, then leak, vignette, grain, dust), worked backwards from each output pixel. Sizes are
// in output pixels of the picture (gM is its long side), as the editor sizes them.
vec2 gContent;      // picture size in output pixels
float gM;           // its long side
float gRectAspect;
float gAspect;
vec2 gUPerPx;       // picture uv (u) per output pixel
float gExtraLod;    // the lens's low-res and toy-corner softening

const vec3 LUMA601 = vec3(0.299, 0.587, 0.114);

vec2 coverCrop(vec2 q) {
    vec2 u = q;
    if (gRectAspect < gAspect) u.x = 0.5 + (q.x - 0.5) * gRectAspect / gAspect;
    else u.y = 0.5 + (q.y - 0.5) * gAspect / gRectAspect;
    return u;
}
bool insidePic(vec2 q) { return q.x >= 0.0 && q.y >= 0.0 && q.x <= 1.0 && q.y <= 1.0; }
vec3 screenA(vec3 d, vec3 g, float a) { return d + (1.0 - (1.0 - d) * (1.0 - g) - d) * a; }

#if STUDIO
// The camera's picture at q (picture uv, y up), softened by about sigma output pixels.
vec3 srcAt(vec2 q, float sigma) {
    vec2 u = coverCrop(q);
    if (sigma < 0.6) return sampleLod(u, uBaseLod + gExtraLod);
    float lod = max(uBaseLod, uBaseLod + log2(2.0 * sigma)) + gExtraLod;
    vec2 d = gUPerPx * sigma * 1.2;
    vec3 acc = sampleLod(u, lod) * 0.25;
    acc += (sampleLod(u + vec2(d.x, 0.0), lod) + sampleLod(u - vec2(d.x, 0.0), lod)
          + sampleLod(u + vec2(0.0, d.y), lod) + sampleLod(u - vec2(0.0, d.y), lod)) * 0.125;
    acc += (sampleLod(u + d, lod) + sampleLod(u - d, lod)
          + sampleLod(u + vec2(d.x, -d.y), lod) + sampleLod(u + vec2(-d.x, d.y), lod)) * 0.0625;
    return acc;
}

// The look's colour: its LUT, at the strength asked for.
vec3 studioColour(vec3 c) {
    if (uExposureGain != 1.0) c = linearToSrgb(srgbToLinear(clamp(c, 0.0, 1.0)) * uExposureGain);
    return uLutOn > 0.5 ? mix(c, applyLut(c), uIntensity) : c;
}

// What the generic effects resample is graded too, so they match the look.
vec3 graded(vec3 c) { return studioColour(c); }
#else
vec3 graded(vec3 c) { return c; }
#endif

// Grey noise in cells of a 1080 p picture, re-dealt every frame.
float noiseAt(vec2 q) {
    vec2 cell = floor(q * gContent / max(1.0, min(gContent.x, gContent.y) / 1080.0));
    return (rnd(uvec3(uvec2(ivec2(cell) + 8192), uSeed + 71u)) - 0.5) * uNoise * (120.0 / 255.0);
}

#if STUDIO
// Colour, noise, sharpening, clarity, bloom and halation at one point.
vec3 studioPoint(vec2 q, float soft) {
    vec3 a = studioColour(srcAt(q, soft));
    if (uThreshold > 0.0) a = clamp(dot(a, LUMA601), 0.0, 1.0) > uThreshold ? uPaper : uInk;
    if (uNoise > 0.0) a += noiseAt(q);
    a = clamp(a, 0.0, 1.0);
    float sharpen = uSharpen + max(-uSoftness, 0.0) * 0.6;
    if (sharpen > 0.0) {
        vec3 b = studioColour(srcAt(q, max(soft, max(0.8, gM / 1100.0))));
        a = clamp(a + (a - b) * sharpen * 1.6, 0.0, 1.0);
    }
    vec2 s = toScreen(coverCrop(q));
    if (uClarity != 0.0) {
        float w = 1.0 - abs(2.0 * clamp(dot(a, LUMA601), 0.0, 1.0) - 1.0) * 0.7;
        a = clamp(a + (a - texture(uClarTex, s).rgb) * uClarity * (uClarity > 0.0 ? 0.9 : 0.75) * w, 0.0, 1.0);
    }
    if (uBloom > 0.0) {
        vec3 g = min(texture(uGlowWide, s).rgb, 1.0);
        a = screenA(a, g, 0.5 + 0.5 * uBloom);
        if (uBloom > 0.5) a = screenA(a, g, (uBloom - 0.5) * 1.2);
    }
    if (uHalation > 0.0) {
        a = screenA(a, min(texture(uGlowTight, s).rgb * uStudioGain.x, 1.0), 0.45 + 0.55 * uHalation);
        a = screenA(a, min(texture(uStreakTex, s).rgb * uStudioGain.y, 1.0), 0.35 + 0.4 * uHalation);
    }
    return a;
}

// Colour fringing: red and green scaled out from the centre.
vec3 studioFringed(vec2 q, float soft) {
    if (uAberration <= 0.0) return studioPoint(q, soft);
    float e = 0.012 * uAberration;
    return vec3(studioPoint(0.5 + (q - 0.5) / (1.0 + e), soft).r,
                studioPoint(0.5 + (q - 0.5) / (1.0 + e * 0.45), soft).g,
                studioPoint(q, soft).b);
}

// Halftone: a hexagonal screen of ink dots on paper, each sized by the tone at its centre.
vec3 halftoneAt(vec2 q) {
    vec2 p = vec2(q.x, 1.0 - q.y) * gContent;                   // y down, like the editor
    float cell = max(3.0, floor(gM * (0.004 + 0.022 * uHalftone) + 0.5));
    float rowH = cell * 0.866;
    float row = floor((p.y - cell * 0.5) / rowH + 0.5);
    float ink = 0.0;
    for (int dr = -1; dr <= 1; dr++) {
        float rr = row + float(dr);
        float y = cell * 0.5 + rr * rowH;
        float off = mod(rr, 2.0) * cell * 0.5;
        float cx = off + floor((p.x - off) / cell + 0.5) * cell;
        for (int dc = -1; dc <= 1; dc++) {
            vec2 c = vec2(cx + float(dc) * cell, y);
            vec2 cq = clamp(vec2(c.x, gContent.y - c.y) / gContent, 0.0, 1.0);
            float tone = clamp(dot(studioColour(srcAt(cq, 0.0)), LUMA601), 0.0, 1.0);
            float r = cell * 0.56 * sqrt(1.0 - tone);
            if (r > 0.35) ink = max(ink, clamp(r - length(p - c) + 0.5, 0.0, 1.0));
        }
    }
    return mix(uPaper, uInk, ink);
}

// Tilt-shift: how much of the sharp picture shows at height y (0 = top).
float tiltAlpha(float y) {
    float h = clamp(uTiltSize, 0.02, 1.0) * 0.5;
    float c = clamp(uTiltY, 0.0, 1.0);
    float p[6] = float[6](0.0, clamp(c - h - 0.12, 0.0, 1.0), clamp(c - h, 0.0, 1.0), clamp(c + h, 0.0, 1.0),
                          clamp(c + h + 0.12, 0.0, 1.0), 1.0);
    float al[6] = float[6](c - h - 0.12 <= 0.0 ? 1.0 : 0.0, 0.0, 1.0, 1.0, 0.0, c + h + 0.12 >= 1.0 ? 1.0 : 0.0);
    float a = al[0];
    for (int i = 0; i < 5; i++) {
        if (y >= p[i]) a = p[i + 1] > p[i] ? mix(al[i], al[i + 1], clamp((y - p[i]) / (p[i + 1] - p[i]), 0.0, 1.0)) : al[i + 1];
    }
    return a;
}

// The picture up to the finishes at q (after the fisheye). bw: how much blur the sharp centre allows.
vec3 studioImage(vec2 q, float bw) {
    if (uHalftone > 0.0) return halftoneAt(q);
    bool softTex = uBlurMode == 1 && uStudioSoft > 0.5;
    float soft = (uBlurMode == 1 && !softTex ? uBlur * 0.04 * gM * bw : 0.0) + max(uSoftness, 0.0) * 2.5 * uRefScale;
    vec3 c;
    float k = uBlur * bw;
    if (uBlurMode >= 2 && k > 0.0) {
        // Motion, zoom and spin: equal-weight copies; copies off the picture don't count.
        float len = gM * k * 0.09;
        int n = uBlurMode == 4 ? int(clamp(floor(len / 3.0 + 0.5), 6.0, 40.0)) : int(clamp(floor(10.0 + 26.0 * k + 0.5), 8.0, 36.0));
        n = min(n, uSmearCap);
        vec2 dpx = (q - 0.5) * gContent;
        float gap = (uBlurMode == 4 ? len : length(dpx) * (uBlurMode == 2 ? 0.32 : 0.22) * k) / float(n - 1);
        float ss = soft + max(gap - 3.0, 0.0) * 0.4;     // fewer copies than the editor: soften between them
        vec3 acc = studioFringed(q, soft);
        float cnt = 1.0;
        for (int i = 1; i < 40; i++) {
            if (i >= n) break;
            float t = float(i) / float(n - 1);
            vec2 p;
            if (uBlurMode == 4) p = q + uBlurDir * len * (t - 0.5) / gContent;
            else if (uBlurMode == 2) p = 0.5 + (q - 0.5) / (1.0 + k * 0.32 * t);
            else {
                float th = (t - 0.5) * k * 0.22;
                p = 0.5 + vec2(dpx.x * cos(th) - dpx.y * sin(th), dpx.x * sin(th) + dpx.y * cos(th)) / gContent;
            }
            if (!insidePic(p)) continue;
            acc += studioFringed(p, ss);
            cnt += 1.0;
        }
        c = acc / cnt;
    } else {
        c = studioFringed(q, soft);
    }
    if (uGhost > 0.0) {
        // Double exposure: a copy one step along the direction, then a fainter one two steps.
        vec2 off = uBlurDir * gM * uGhost * 0.12 / gContent;
        if (insidePic(q + off)) c = mix(c, studioFringed(q + off, soft), 0.42);
        if (insidePic(q + 2.0 * off)) c = mix(c, studioFringed(q + 2.0 * off, soft), 0.2);
    }
    vec2 s = toScreen(coverCrop(q));
    if (uTilt > 0.0) c = mix(texture(uDiffuseTex, s).rgb, c, tiltAlpha(1.0 - q.y));
    else if (softTex) c = mix(c, texture(uDiffuseTex, s).rgb, bw);
    return c;
}

// A radial gradient ellipse with three stops: colour and alpha at t (0 centre, 1 edge).
vec4 leakBlob(vec2 p, vec2 c, vec2 r, vec3 c0, float a0, float p1, vec3 c1, float a1, float a2) {
    float t = length((p - c) / r);
    if (t >= 1.0) return vec4(c1, a2);
    if (t < p1) return vec4(mix(c0, c1, t / p1), mix(a0, a1, t / p1));
    return vec4(c1, mix(a1, a2, (t - p1) / (1.0 - p1)));
}
#endif

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
    gContent = L.size * min(framePx.x, framePx.y);
    gM = max(gContent.x, gContent.y);
    gRectAspect = rectAspect;
    gAspect = aspect;
    gUPerPx = (rectAspect < aspect ? vec2(rectAspect / aspect, 1.0) : vec2(1.0, aspect / rectAspect)) / gContent;

    // ---- lens distortion: barrel, up to a full circular fisheye
    vec2 q = cp;
#if STUDIO
    if (uDistortion > 0.0) {
        // The editor's fisheye: barrel over the whole picture; outside it stays black.
        vec2 n = cp * 2.0 - 1.0;
        q = (n * (1.0 + 0.6 * uDistortion * (dot(n, n) - 1.0)) + 1.0) * 0.5;
        if (!insidePic(q)) mask = 0.0;
        q = clamp(q, 0.0, 1.0);
    }
#else
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
#endif

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
    gExtraLod = lod;
    vec3 c;
#if STUDIO
    {
        // The editor's look: its colour and effects in its order (see studioImage).
        float bw = 1.0;
        if (uBlurFocus > 0.0) {
            vec2 ua = vec2(aspect, 1.0);
            float r = length((u - 0.5) * ua) / (0.5 * length(ua));
            bw = smoothstep(uBlurFocus * 0.7, uBlurFocus * 0.7 + 0.45, r);
        }
        c = studioImage(q, bw);
    }
#else
    {
        vec2 dir = u - 0.5;
        float ca = uAberration * 0.006;
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
    }
#endif

    // ---- interlace: odd lines still show the previous field
    if (uInterlace > 0.0) {
        float field = floor(f.y * framePx.y / max(1.0, framePx.y / 540.0));
        if (mod(field, 2.0) > 0.5) {
            vec3 prev = graded(textureLod(uPrevImage, toImage(s), lodOf(lod)).rgb);
            c = mix(c, prev, uInterlace);
        }
    }

    // ---- tape chroma: colour smeared sideways and lagging behind the luma
    if (uVhs > 0.0) {
        vec3 cc = vec3(0.0);
        for (int i = 1; i <= 4; i++) cc += sampleAt(u - vec2(0.0035 * float(i), 0.0), lod + 0.5);
        cc = graded(cc * 0.25);
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
        vec3 le = graded(sampleAt(u + vec2(off, 0.0), lod));
        vec3 re = graded(sampleAt(u - vec2(off, 0.0), lod));
        c = mix(c, vec3(dot(le, LUMA), re.g, re.b), min(1.0, uAnaglyph * 2.0));
    }

    // ---- prism ghost: a faint shifted copy tinted by the spectrum
    if (uPrism > 0.0) {
        vec3 ghost = graded(sampleAt(u + uPrismGhost, lod + 1.0));
        vec3 tint = spectrum(dot(cp - uPrismBand.xy, uPrismBand.zw) * 1.6 + uTime * 0.03);
        c = screenBlend(c, ghost * tint * 0.4 * uPrism);
    }

    // How much of this pixel is itself a highlight (same test as the bright pass).
    float l0 = dot(c * c, LUMA);
    float self = l0 * smoothstep(uHalThreshold, uHalThreshold + 0.3, l0);

    // ---- emulsion (a studio look's colour is already in)
#if !STUDIO
    {
        if (uExposureGain != 1.0) c = linearToSrgb(srgbToLinear(clamp(c, 0.0, 1.0)) * uExposureGain);
        vec3 stock = uLutOn > 0.5 ? applyLut(c) : grade(c);
        c = mix(c, stock, uIntensity);
        if (uNoise > 0.0) c += noiseAt(q);
    }
#endif
    if (uStyleOn > 0.5) c = photoStyle(c);
    if (dot(abs(uAdjA), vec4(1.0)) + dot(abs(uAdjB), vec4(1.0)) > 0.0) {
        float localLuma = uAdjB.w != 0.0 ? dot(sampleAt(u, 4.5), LUMA) : 0.0;
        c = basicAdjust(c, localLuma);
    }

    // ---- halation, bloom and streaks, as light (then back to display space)
#if !STUDIO
    {
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
    }
#endif

    // ---- on-camera flash: hot centre, fast fall-off
    if (uFlash > 0.0) {
        float r2 = cornerDist * cornerDist;
        c *= mix(1.0, 1.4 - 1.05 * r2, uFlash);
        c = mix(c, c * c * (3.0 - 2.0 * c), uFlash * 0.35);
    }

#if STUDIO
    // The editor's finishes work in picture pixels, y down.
    vec2 Pp = vec2(cp.x, 1.0 - cp.y) * gContent;
    float W = gContent.x, H = gContent.y;
#endif

    // ---- light leaks: exposures that sneaked in from the edges
#if STUDIO
    if (uLeak > 0.0) {
        // Three soft blobs of light from the left edge, drifting and pulsing.
        float y1 = H * (0.36 + sin(uTime * 0.45) * 0.12), y2 = H * (0.78 + sin(uTime * 0.6 + 2.0) * 0.08);
        vec3 lc = vec3(1.0, 90.0 / 255.0, 31.0 / 255.0), pink = vec3(1.0, 40.0 / 255.0, 90.0 / 255.0);
        vec4 b1 = leakBlob(Pp, vec2(-W * 0.04, y1), vec2(W * 0.62, H * 0.7), lc, 0.95, 0.45, lc, 0.4, 0.0);
        vec4 b2 = leakBlob(Pp, vec2(-W * 0.02, y2), vec2(W * 0.45, H * 0.4), pink, 0.7, 0.5, pink, 0.22, 0.0);
        vec4 b3 = leakBlob(Pp, vec2(-W * 0.03, y1 + H * 0.04), vec2(W * 0.2, H * 0.32), vec3(1.0, 236.0 / 255.0, 190.0 / 255.0),
                           0.95, 0.6, vec3(1.0, 190.0 / 255.0, 120.0 / 255.0), 0.35, 0.0);
        float k = uLeak * (0.78 + 0.22 * sin(uTime * 1.3));
        c = screenA(c, b1.rgb, b1.a * k);
        c = screenA(c, b2.rgb, b2.a * k);
        c = screenA(c, b3.rgb, b3.a * k);
    }
#else
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
#endif

    // ---- prism rainbow: an arc bending across the frame
    if (uPrism > 0.0) {
        vec2 arcCentre = uPrismBand.xy - uPrismBand.zw * 0.85;
        float d = (length((cp - arcCentre) * asp) - 0.85) / max(rectAspect, 1.0);
        // A pale band of light with the spectrum split along its edges.
        vec3 rainbow = mix(vec3(1.0, 0.96, 0.9), spectrum(d * 5.0 + 0.1), 0.55) * exp(-d * d / 0.006);
        c = screenBlend(c, rainbow * 0.75 * uPrism);
    }

    // ---- vignette
#if STUDIO
    float r0 = min(W, H) * 0.25, r1 = length(vec2(W, H)) * 0.5;
    c *= 1.0 - clamp((length(Pp - vec2(W, H) * 0.5) - r0) / (r1 - r0), 0.0, 1.0) * uVignette * 0.75;
#else
    c *= mix(1.0, 1.0 - smoothstep(0.3, 1.15, cornerDist) * 0.85, uVignette);
#endif

    // ---- flicker and colour density pumping
    c *= uGain;

    // ---- grain: two octaves of value noise, strongest in the mid-tones
#if STUDIO
    if (uGrain > 0.0) {
        // The editor's grain: grey cells laid on with an overlay blend.
        vec2 cell = floor(Pp / max(1.0, uGrainSize * min(W, H) / 1080.0));
        float g = rnd(uvec3(uvec2(ivec2(cell) + 8192), uSeed + 83u));
        vec3 d = clamp(c, 0.0, 1.0);
        vec3 ov = mix(2.0 * d * g, 1.0 - 2.0 * (1.0 - d) * (1.0 - g), step(0.5, d));
        c = mix(d, ov, min(uGrain, 1.0) * 0.55);
    }
#else
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
#endif

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
#if STUDIO
    if (uDust > 0.0) {
        // Specks dealt 12 times a second (as many as on a 1080 p picture), and a few thin
        // scratches that stay for 9 of those frames.
        uint frame = uint(max(uTime, 0.0) * 12.0);
        float area = 1080.0 * 1080.0 * max(W, H) / min(W, H);
        float n = floor(min(uDust, 1.0) * (10.0 + 34.0 * area / (1080.0 * 1350.0)));
        for (int i = 0; i < 60; i++) {
            if (float(i) >= n) break;
            uvec3 h = uvec3(uint(i), frame, 0x5eedu);
            vec2 sc = vec2(rnd(h), rnd(h + uvec3(0u, 0u, 1u))) * vec2(W, H);
            float rr = gM * (0.0007 + pow(rnd(h + uvec3(0u, 0u, 2u)), 3.0) * 0.0045);
            float e = length((Pp - sc) / vec2(rr, rr * (0.5 + rnd(h + uvec3(0u, 0u, 3u)) * 0.7)));
            if (e < 1.0) {
                bool white = rnd(h + uvec3(0u, 0u, 4u)) < 0.6;
                c = mix(c, white ? vec3(1.0, 252.0 / 255.0, 240.0 / 255.0) : vec3(14.0, 10.0, 6.0) / 255.0,
                        white ? 0.45 + rnd(h + uvec3(0u, 0u, 5u)) * 0.5 : 0.4 + rnd(h + uvec3(0u, 0u, 6u)) * 0.5);
            }
        }
        uint blk = frame / 9u;
        float lines = floor(min(uDust, 1.0) * 2.5 + rnd(uvec3(blk, 7u, 0x5eedu)) * 1.2);
        for (int i = 0; i < 4; i++) {
            if (float(i) >= lines) break;
            uvec3 h = uvec3(uint(i), blk, 0xcafeu);
            float x = rnd(h) * W + (rnd(uvec3(uint(i), frame, 0xbeefu)) - 0.5) * gM * 0.003;
            float lw = gM * (0.0006 + rnd(h + uvec3(0u, 0u, 1u)) * 0.0012);
            bool seg = rnd(uvec3(uint(floor(Pp.y / (H * 0.2))), blk * 4u + uint(i), 0xfaceu)) >= 0.35;
            if (abs(Pp.x - x) < lw * 0.5 && seg) {
                c = mix(c, rnd(h + uvec3(0u, 0u, 2u)) < 0.75 ? vec3(1.0, 252.0 / 255.0, 240.0 / 255.0) : vec3(10.0, 8.0, 6.0) / 255.0,
                        0.2 + rnd(h + uvec3(0u, 0u, 3u)) * 0.3);
            }
        }
    }
#else
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
#endif

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

    // ---- text set behind the subject: the subject's matte cuts it away
    if (uTextBackOn > 0.5) {
        vec4 t = texture(uTextBackTex, vec2(f.x, 1.0 - f.y));
        float m = uSubjectOn > 0.5 ? smoothstep(0.3, 0.7, texture(uSubject, vec2(u.x, 1.0 - u.y)).r) * L.inside : 0.0;
        c = blendText(c, t * (1.0 - m), uTextBackBlend);
    }

    // ---- text overlays, on top of everything (border included)
    if (uTextOn > 0.5) {
        vec4 t = texture(uTextTex, vec2(f.x, 1.0 - f.y));
        c = blendText(c, t, uTextBlend);
    }

    if (uLogMode == 1 || uLogMode == 3) {
        vec3 lin = srgbToLinear(clamp(c, 0.0, 1.0)) * uLogGain;
        c = vec3(slog3(lin.r), slog3(lin.g), slog3(lin.b));
    }
    if (uLogMode == 2 || uLogMode == 3) c = logView(clamp(c, 0.0, 1.0));
    if (uLogMode == 4) c = hlgView(clamp(c, 0.0, 1.0));

    // A hair of dither so smooth skies never band.
    c += (rnd(uvec3(uvec2(gl_FragCoord.xy + uTileOffset), uSeed + 99u)) - 0.5) / 255.0;
    oColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}

