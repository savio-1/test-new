#version 300 es
precision highp float;
precision mediump sampler3D;
uniform sampler2D uSrc;
uniform float uLod;
uniform float uThreshold;
// Studio looks (FilmLook.studio), from the look's graded colour as the editor does it:
// 1 the bloom mask, 2 the halation mask in uCol, 3 the graded picture itself.
uniform int uMode;
uniform sampler3D uLut;
uniform float uLutOn;
uniform float uIntensity;
uniform vec3 uCol;
in vec2 vTex;
out vec4 o;
void main() {
    vec3 c = textureLod(uSrc, vTex, uLod).rgb;
    if (uMode == 0) {
        vec3 lin = c * c;                       // close enough to linear light
        float l = dot(lin, vec3(0.2126, 0.7152, 0.0722));
        float k = smoothstep(uThreshold, uThreshold + 0.3, l);
        o = vec4(lin * k, 1.0);
        return;
    }
    if (uLutOn > 0.5) c = mix(c, texture(uLut, clamp(c, 0.0, 1.0) * (32.0 / 33.0) + 0.5 / 33.0).rgb, uIntensity);
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    if (uMode == 1) {
        o = vec4(c * clamp((l - uThreshold) / (1.0 - uThreshold), 0.0, 1.0), 1.0);
    } else if (uMode == 2) {
        float h = 0.6 * max(c.r, max(c.g, c.b)) + 0.4 * l;
        o = vec4(uCol * pow(clamp((h - uThreshold) / (1.0 - uThreshold), 0.0, 1.0), 0.8), 1.0);
    } else {
        o = vec4(c, 1.0);
    }
}

