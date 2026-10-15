package app.filmcam.gl

/**
 * The film pipeline, pass by pass:
 *
 *  1. DEVELOP   camera (OES) or still (2D) -> working frame. Crops to the output aspect,
 *               applies gate weave, and blends with the previous frame for slow shutters.
 *  2. BRIGHT    working frame (sampled from its mip chain) -> small buffer of highlights.
 *  3. BLUR      separable Gaussian, run a few times: a tight glow (halation) and a wide one (bloom).
 *  4. FINAL     colour science of the stock, halation, bloom, light leaks, vignette, grain,
 *               dust and scratches, the frame (gate, instant print, negative strip) and the
 *               date stamp. Drawn once for the screen and once more for the video encoder.
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
in vec2 vUV;
out vec4 o;
void main() {
    vec3 c = textureLod(uSrc, vUV, uLod).rgb;
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
uniform sampler2D uGlowTight;
uniform sampler2D uGlowWide;
uniform sampler2D uStamp;

uniform vec2 uTargetSize;   // pixels of the surface being drawn
uniform int uTargetRot;     // quarter turns: target -> screen space
uniform int uFrameRot;      // quarter turns: screen space -> frame space
uniform vec2 uImageTexel;   // 1 / working frame size

// Stock
uniform float uTemp;
uniform float uTint;
uniform float uSat;
uniform float uContrast;
uniform float uFade;
uniform float uRolloff;
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
uniform float uGrain;
uniform float uGrainSize;
uniform float uLeak;
uniform float uVignette;
uniform float uDust;
uniform float uAberration;
uniform float uSoftness;
uniform float uGain;
uniform int uBorder;
uniform float uStampOn;
uniform float uStampAspect;

// Per-frame randomness from the CPU
uniform uint uSeed;
uniform float uTime;
uniform vec2 uLeakPos[3];
uniform float uLeakRadius[3];
uniform vec3 uLeakColor[3];
uniform int uBurnEdge;
uniform float uBurnStrength;
uniform float uBurnPhase;
uniform vec2 uScratchX;
uniform float uScratchAlpha;

in vec2 vUV;
out vec4 oColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// ---------------------------------------------------------------- coordinates
// rot(k, p): turn a unit-square point k quarter turns clockwise.
vec2 rot(int k, vec2 p) {
    k = k & 3;
    if (k == 1) return vec2(p.y, 1.0 - p.x);
    if (k == 2) return 1.0 - p;
    if (k == 3) return vec2(1.0 - p.y, p.x);
    return p;
}

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

// ---------------------------------------------------------------- colour
float sCurve(float x, float k) {
    x = clamp(x, 0.0, 1.0);
    return x < 0.5 ? 0.5 * pow(2.0 * x, k) : 1.0 - 0.5 * pow(2.0 * (1.0 - x), k);
}

vec3 grade(vec3 c) {
    // White balance.
    c *= vec3(1.0 + 0.10 * uTemp, 1.0 - 0.07 * uTint + 0.01 * uTemp, 1.0 - 0.13 * uTemp);
    // Dye crosstalk, then saturation.
    c = uMixer * c;
    float l = dot(c, LUMA);
    c = mix(vec3(l), c, uSat);
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

// ---------------------------------------------------------------- frame layout
// Works in "s units": the short side of the frame is 1.0. Returns the content rectangle
// (min.xy, max.xy) and writes the border colour and shape.
struct Layout { vec4 rect; vec3 borderColor; float inside; };

Layout layoutFrame(vec2 P, vec2 S) {
    Layout L;
    L.rect = vec4(0.0, 0.0, S);
    L.borderColor = vec3(0.0);
    L.inside = 1.0;
    float px = 1.0 / min(uTargetSize.x, uTargetSize.y); // one pixel in s units

    if (uBorder == 1) {
        // Projector gate: rounded, slightly soft-edged window in black.
        float m = 0.035;
        L.rect = vec4(m, m, S - m);
        vec2 c = (L.rect.xy + L.rect.zw) * 0.5;
        float d = sdRoundRect(P - c, (L.rect.zw - L.rect.xy) * 0.5, 0.075);
        L.inside = 1.0 - smoothstep(-0.006, 0.004 + px, d);
        L.borderColor = vec3(0.015, 0.012, 0.01);
    } else if (uBorder == 2) {
        // Instant print: cream paper, thick chin.
        float side = 0.06;
        L.rect = vec4(side, 0.24, S.x - side, S.y - side);
        vec2 c = (L.rect.xy + L.rect.zw) * 0.5;
        float d = sdRoundRect(P - c, (L.rect.zw - L.rect.xy) * 0.5, 0.004);
        L.inside = 1.0 - smoothstep(-px, px, d);
        float paper = vnoise(P * 900.0, 77u) * 0.025 + vnoise(P * 60.0, 78u) * 0.015;
        L.borderColor = vec3(0.94, 0.925, 0.89) - paper;
    } else if (uBorder == 3) {
        // 35mm negative strip on a lightbox: sprocket holes along the long edges.
        bool portrait = S.x < S.y;
        float across = portrait ? P.x : P.y;   // 0..1 across the film
        float along = portrait ? P.y : P.x;
        float alongLen = portrait ? S.y : S.x;
        float band = 0.157;
        float gap = 0.012;
        vec4 r = portrait ? vec4(band + gap, 0.02, 1.0 - band - gap, S.y - 0.02)
                          : vec4(0.02, band + gap, S.x - 0.02, 1.0 - band - gap);
        L.rect = r;
        vec2 c = (r.xy + r.zw) * 0.5;
        float d = sdRoundRect(P - c, (r.zw - r.xy) * 0.5, 0.012);
        L.inside = 1.0 - smoothstep(-px, px, d);
        // Perforations: 0.08 across, 0.057 along, pitch 0.136, inset 0.057 from the edge.
        float a = across > 0.5 ? 1.0 - across : across;
        float pitch = 0.1357;
        float k = mod(along - alongLen * 0.5 + pitch * 0.5, pitch) - pitch * 0.5;
        float hole = sdRoundRect(vec2(k, a - 0.097), vec2(0.0283, 0.04), 0.008);
        float holeMask = 1.0 - smoothstep(-px, px, hole);
        vec3 base = vec3(0.035, 0.028, 0.024);
        L.borderColor = mix(base, vec3(0.97, 0.95, 0.9), holeMask);
    } else if (uBorder == 4) {
        // Filed-out negative carrier: black border with a rough inner edge.
        float m = 0.045;
        vec2 c = S * 0.5;
        vec2 h = S * 0.5 - m;
        float rough = (vnoise(P * 55.0, 31u) - 0.5) * 0.012 + (vnoise(P * 9.0, 32u) - 0.5) * 0.01;
        float d = sdRoundRect(P - c, h, 0.004) + rough;
        L.rect = vec4(m, m, S - m);
        L.inside = 1.0 - smoothstep(-px, px, d);
        L.borderColor = vec3(0.012);
    }
    return L;
}

// ---------------------------------------------------------------- main
void main() {
    int frameK = uTargetRot + uFrameRot;
    vec2 f = rot(frameK, vUV);                                       // frame space 0..1
    vec2 framePx = ((frameK & 1) == 1) ? uTargetSize.yx : uTargetSize;
    float aspect = framePx.x / framePx.y;
    vec2 S = framePx / min(framePx.x, framePx.y);                    // frame size in s units
    vec2 P = f * S;

    Layout L = layoutFrame(P, S);
    vec2 rectSize = L.rect.zw - L.rect.xy;
    vec2 cp = (P - L.rect.xy) / rectSize;                            // content uv, upright

    // Cover-crop the whole picture into the content rectangle.
    float rectAspect = rectSize.x / rectSize.y;
    vec2 u = cp;
    if (rectAspect < aspect) u.x = 0.5 + (cp.x - 0.5) * rectAspect / aspect;
    else u.y = 0.5 + (cp.y - 0.5) * aspect / rectAspect;
    vec2 s = rot(4 - (uFrameRot & 3), u);                            // back to screen space

    // ---- lens: chromatic aberration and softness / sharpening
    vec2 dir = s - 0.5;
    float ca = uAberration * 0.006;
    vec3 c;
    c.r = texture(uImage, s + dir * ca).r;
    c.g = texture(uImage, s).g;
    c.b = texture(uImage, s - dir * ca).b;
    float spread = 1.0 + 2.5 * max(uSoftness, 0.0);
    vec2 o1 = uImageTexel * spread;
    vec3 blur = 0.25 * (texture(uImage, s + vec2(o1.x, o1.y)).rgb + texture(uImage, s + vec2(-o1.x, o1.y)).rgb
                      + texture(uImage, s + vec2(o1.x, -o1.y)).rgb + texture(uImage, s + vec2(-o1.x, -o1.y)).rgb);
    if (uSoftness > 0.0) c = mix(c, blur, min(uSoftness * 1.2, 1.0));
    else c = c + (c - blur) * (-uSoftness) * 1.5;
    c = clamp(c, 0.0, 1.0);

    // How much of this pixel is itself a highlight (same test as the bright pass).
    float l0 = dot(c * c, LUMA);
    float self = l0 * smoothstep(uHalThreshold, uHalThreshold + 0.3, l0);

    // ---- emulsion
    c = grade(c);

    // ---- halation and bloom, as light (then back to display space)
    vec3 gT = texture(uGlowTight, s).rgb;
    vec3 gW = texture(uGlowWide, s).rgb;
    vec3 lin = c * c;
    // Halation is light bouncing off the film base back into the red layer: a warm
    // fringe *around* highlights, so take the spread glow minus the highlight itself.
    float glowAround = dot(gT * 0.5 + gW * 0.5, LUMA);
    float halo = max(glowAround - self * 0.9, 0.0);
    lin += uHalColor * halo * uHalation * 2.6;
    vec3 bloomCol = mix(gW, vec3(dot(gW, LUMA)), uMono);
    lin = 1.0 - (1.0 - clamp(lin, 0.0, 1.0)) * (1.0 - clamp(bloomCol * uBloom * 0.7, 0.0, 1.0));
    c = sqrt(max(lin, 0.0));

    // ---- light leaks: exposures that sneaked in from the edges
    if (uLeak > 0.0) {
        vec3 leak = vec3(0.0);
        vec2 q = vec2(cp.x * rectAspect, cp.y);
        for (int i = 0; i < 3; i++) {
            vec2 d = q - vec2(uLeakPos[i].x * rectAspect, uLeakPos[i].y);
            float r = uLeakRadius[i];
            leak += uLeakColor[i] * exp(-dot(d, d) / (r * r));
        }
        float e = uBurnEdge == 0 ? cp.x : uBurnEdge == 1 ? 1.0 - cp.x : uBurnEdge == 2 ? cp.y : 1.0 - cp.y;
        float alongB = (uBurnEdge < 2) ? cp.y : cp.x;
        float burn = exp(-e / 0.09) * (0.55 + 0.45 * sin(alongB * 5.0 + uBurnPhase)) * uBurnStrength;
        leak += vec3(1.0, 0.3, 0.06) * burn;
        leak = mix(leak, vec3(dot(leak, LUMA)), uMono);
        c = 1.0 - (1.0 - c) * (1.0 - clamp(leak * uLeak, 0.0, 1.0));
    }

    // ---- vignette
    vec2 v = (cp - 0.5) * vec2(rectAspect, 1.0);
    float vd = length(v) / length(vec2(rectAspect, 1.0) * 0.5);
    c *= mix(1.0, 1.0 - smoothstep(0.3, 1.15, vd) * 0.85, uVignette);

    // ---- flicker
    c *= uGain;

    // ---- grain: two octaves of value noise, strongest in the mid-tones
    if (uGrain > 0.0) {
        vec2 gp = cp * rectSize * (1080.0 / uGrainSize);       // short side = 1080 px
        float g = (vnoise(gp, uSeed) - 0.5) + 0.55 * (vnoise(gp * 2.17 + 13.7, uSeed + 7u) - 0.5);
        vec3 grain = vec3(g);
        if (uColorGrain > 0.0) {
            vec3 ch = vec3(vnoise(gp * 1.31 + 3.1, uSeed + 19u), vnoise(gp * 1.29 + 7.7, uSeed + 23u),
                           vnoise(gp * 1.33 + 1.9, uSeed + 29u)) - 0.5;
            grain += ch * uColorGrain * 0.9;
        }
        float l = dot(c, LUMA);
        float w = mix(1.0, 4.0 * l * (1.0 - l), 0.65) + 0.15;
        c += grain * uGrain * 0.26 * w;
    }

    // ---- dust and scratches
    if (uDust > 0.0) {
        vec2 dp = vec2(cp.x * rectAspect, cp.y) * 16.0;
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
            float d = abs(cp.x - x) * framePx.x * rectSize.x / S.x;
            float line = 1.0 - smoothstep(0.4, 1.4, d);
            line *= 0.5 + 0.5 * vnoise(vec2(cp.y * 40.0, sx * 100.0), uSeed);
            c = mix(c, vec3(0.9, 0.88, 0.84), line * 0.55 * uScratchAlpha);
        }
    }

    // ---- date stamp, bottom right of the picture
    if (uStampOn > 0.5) {
        vec2 cpx = cp * rectSize;                         // s units inside the content
        float hgt = 0.055 * min(rectSize.x, rectSize.y);
        vec2 size = vec2(hgt * uStampAspect, hgt);
        vec2 origin = vec2(rectSize.x - size.x - 0.04 * min(rectSize.x, rectSize.y),
                           0.045 * min(rectSize.x, rectSize.y));
        vec2 t = (cpx - origin) / size;
        if (t.x >= 0.0 && t.x <= 1.0 && t.y >= 0.0 && t.y <= 1.0) {
            vec3 st = texture(uStamp, vec2(t.x, 1.0 - t.y)).rgb;
            c = 1.0 - (1.0 - c) * (1.0 - st * 0.95);
        }
    }

    c = mix(L.borderColor, c, L.inside);

    // A hair of dither so smooth skies never band.
    c += (rnd(uvec3(uvec2(gl_FragCoord.xy), uSeed + 99u)) - 0.5) / 255.0;
    oColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
"""
}
