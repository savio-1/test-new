#version 300 es
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

