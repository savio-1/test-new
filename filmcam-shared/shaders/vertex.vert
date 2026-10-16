#version 300 es
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

