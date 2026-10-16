#version 300 es
precision highp float;
uniform sampler2D uImage;
uniform mat4 uImageMatrix;
uniform int uFrameRot;
uniform float uLod;
in vec2 vUV;
out vec4 o;
vec2 rot(int k, vec2 p) {
    k = k & 3;
    if (k == 1) return vec2(p.y, 1.0 - p.x);
    if (k == 2) return 1.0 - p;
    if (k == 3) return vec2(1.0 - p.y, p.x);
    return p;
}
void main() {
    vec2 u = vec2(vUV.x, 1.0 - vUV.y);
    vec2 s = rot(4 - (uFrameRot & 3), u);
    o = vec4(textureLod(uImage, (uImageMatrix * vec4(s, 0.0, 1.0)).xy, uLod).rgb, 1.0);
}

