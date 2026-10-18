#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uStep;
uniform float uSigma;
uniform int uTaps;
uniform int uBlackEdge;
in vec2 vUV;
out vec4 o;
vec3 at(vec2 p) {
    return uBlackEdge == 1 && (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) ? vec3(0.0) : texture(uSrc, p).rgb;
}
void main() {
    vec3 acc = texture(uSrc, vUV).rgb;
    float wsum = 1.0;
    for (int i = 1; i <= 64; i++) {
        if (i > uTaps) break;
        float w = exp(-float(i * i) / (2.0 * uSigma * uSigma));
        acc += (at(vUV + uStep * float(i)) + at(vUV - uStep * float(i))) * w;
        wsum += 2.0 * w;
    }
    o = vec4(acc / wsum, 1.0);
}

