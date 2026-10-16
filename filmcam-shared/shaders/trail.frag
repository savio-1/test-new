#version 300 es
precision mediump float;
uniform sampler2D uAccum;
uniform sampler2D uRaw;
in vec2 vUV;
out vec4 o;
void main() {
    vec3 d = texture(uAccum, vUV).rgb - texture(uRaw, vUV).rgb;
    o = vec4(d * 0.5 + 0.5, 1.0);
}

