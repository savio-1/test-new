#version 300 es
precision highp float;
uniform sampler2D uSource;

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

