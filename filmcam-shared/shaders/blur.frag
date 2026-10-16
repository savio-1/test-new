#version 300 es
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

