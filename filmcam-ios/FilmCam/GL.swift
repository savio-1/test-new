import Foundation
import OpenGLES
import CoreGraphics

// OpenGL ES 3 runs the same GLSL ES 3.00 shaders as Android (filmcam-shared/shaders), so both
// apps render identical looks. Thin helpers over the C API.

@inline(__always) func E(_ v: Int32) -> GLenum { GLenum(v) }

enum GLError: Error { case compile(String), link(String) }

final class Program {
    let id: GLuint
    private var locations: [String: GLint] = [:]

    init(vertex: String, fragment: String) throws {
        func compile(_ type: Int32, _ src: String) throws -> GLuint {
            let s = glCreateShader(E(type))
            src.withCString { cs in
                var p: UnsafePointer<GLchar>? = cs
                glShaderSource(s, 1, &p, nil)
            }
            glCompileShader(s)
            var ok: GLint = 0
            glGetShaderiv(s, E(GL_COMPILE_STATUS), &ok)
            if ok == 0 {
                var len: GLint = 0
                glGetShaderiv(s, E(GL_INFO_LOG_LENGTH), &len)
                var log = [GLchar](repeating: 0, count: Int(max(len, 1)))
                glGetShaderInfoLog(s, len, nil, &log)
                throw GLError.compile(String(cString: log))
            }
            return s
        }
        let vs = try compile(GL_VERTEX_SHADER, vertex)
        let fs = try compile(GL_FRAGMENT_SHADER, fragment)
        id = glCreateProgram()
        glAttachShader(id, vs)
        glAttachShader(id, fs)
        glLinkProgram(id)
        var ok: GLint = 0
        glGetProgramiv(id, E(GL_LINK_STATUS), &ok)
        if ok == 0 {
            var log = [GLchar](repeating: 0, count: 2048)
            glGetProgramInfoLog(id, 2048, nil, &log)
            throw GLError.link(String(cString: log))
        }
        glDeleteShader(vs)
        glDeleteShader(fs)
    }

    func use() { glUseProgram(id) }

    func loc(_ name: String) -> GLint {
        if let l = locations[name] { return l }
        let l = glGetUniformLocation(id, name)
        locations[name] = l
        return l
    }

    func i(_ n: String, _ v: Int32) { glUniform1i(loc(n), v) }
    func ui(_ n: String, _ v: UInt32) { glUniform1ui(loc(n), v) }
    func f(_ n: String, _ v: Float) { glUniform1f(loc(n), v) }
    func f2(_ n: String, _ a: Float, _ b: Float) { glUniform2f(loc(n), a, b) }
    func f3(_ n: String, _ a: Float, _ b: Float, _ c: Float) { glUniform3f(loc(n), a, b, c) }
    func f3(_ n: String, _ v: RGB) { glUniform3f(loc(n), v.r, v.g, v.b) }
    func f4(_ n: String, _ a: Float, _ b: Float, _ c: Float, _ d: Float) { glUniform4f(loc(n), a, b, c, d) }
    func mat4(_ n: String, _ m: [Float]) { m.withUnsafeBufferPointer { glUniformMatrix4fv(loc(n), 1, GLboolean(GL_FALSE), $0.baseAddress) } }
    /// Row-major 3x3 (as the spec stores the mixer) -> GL's column-major.
    func mat3RowMajor(_ n: String, _ m: [Float]) {
        let t: [Float] = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]
        t.withUnsafeBufferPointer { glUniformMatrix3fv(loc(n), 1, GLboolean(GL_FALSE), $0.baseAddress) }
    }
    func f1v(_ n: String, _ v: [Float]) { v.withUnsafeBufferPointer { glUniform1fv(loc(n), GLsizei(v.count), $0.baseAddress) } }
    func f2v(_ n: String, _ v: [Float]) { v.withUnsafeBufferPointer { glUniform2fv(loc(n), GLsizei(v.count / 2), $0.baseAddress) } }
    func f3v(_ n: String, _ v: [Float]) { v.withUnsafeBufferPointer { glUniform3fv(loc(n), GLsizei(v.count / 3), $0.baseAddress) } }
}

enum GLU {
    static func texture(_ w: Int, _ h: Int, format: Int32 = GL_RGBA8, mipmapped: Bool = false, repeatS: Bool = false) -> GLuint {
        var t: GLuint = 0
        glGenTextures(1, &t)
        glBindTexture(E(GL_TEXTURE_2D), t)
        var levels: GLsizei = 1
        if mipmapped { var s = max(w, h); while s > 1 { s >>= 1; levels += 1 } }
        glTexStorage2D(E(GL_TEXTURE_2D), levels, E(format), GLsizei(w), GLsizei(h))
        glTexParameteri(E(GL_TEXTURE_2D), E(GL_TEXTURE_MIN_FILTER), mipmapped ? GL_LINEAR_MIPMAP_LINEAR : GL_LINEAR)
        glTexParameteri(E(GL_TEXTURE_2D), E(GL_TEXTURE_MAG_FILTER), GL_LINEAR)
        glTexParameteri(E(GL_TEXTURE_2D), E(GL_TEXTURE_WRAP_S), repeatS ? GL_REPEAT : GL_CLAMP_TO_EDGE)
        glTexParameteri(E(GL_TEXTURE_2D), E(GL_TEXTURE_WRAP_T), GL_CLAMP_TO_EDGE)
        return t
    }

    static func framebuffer(_ tex: GLuint) -> GLuint {
        var f: GLuint = 0
        glGenFramebuffers(1, &f)
        glBindFramebuffer(E(GL_FRAMEBUFFER), f)
        glFramebufferTexture2D(E(GL_FRAMEBUFFER), E(GL_COLOR_ATTACHMENT0), E(GL_TEXTURE_2D), tex, 0)
        glBindFramebuffer(E(GL_FRAMEBUFFER), 0)
        return f
    }

    static func delete(textures: [GLuint]) { var t = textures.filter { $0 != 0 }; if !t.isEmpty { glDeleteTextures(GLsizei(t.count), &t) } }
    static func delete(framebuffers: [GLuint]) { var f = framebuffers.filter { $0 != 0 }; if !f.isEmpty { glDeleteFramebuffers(GLsizei(f.count), &f) } }

    static func hasExtension(_ name: String) -> Bool {
        var n: GLint = 0
        glGetIntegerv(E(GL_NUM_EXTENSIONS), &n)
        for i in 0..<n {
            if let s = glGetStringi(E(GL_EXTENSIONS), GLuint(i)), String(cString: s) == name { return true }
        }
        return false
    }

    static var maxTextureSize: Int { var v: GLint = 0; glGetIntegerv(E(GL_MAX_TEXTURE_SIZE), &v); return Int(v) }

    /// RGBA8 pixels of an image, row 0 at the top (premultiplied; our pictures are opaque).
    static func rgba(_ image: CGImage, width: Int? = nil, height: Int? = nil) -> (data: [UInt8], w: Int, h: Int) {
        let w = width ?? image.width, h = height ?? image.height
        var data = [UInt8](repeating: 0, count: w * h * 4)
        data.withUnsafeMutableBytes { buf in
            let ctx = CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
            ctx.interpolationQuality = .high
            ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        }
        return (data, w, h)
    }

    /// Uploads an image into a new texture (row 0 = v 0 = the top of the picture).
    static func texture(from image: CGImage, mipmapped: Bool = false, repeatS: Bool = false, maxSide: Int? = nil) -> (tex: GLuint, w: Int, h: Int) {
        var w = image.width, h = image.height
        if let m = maxSide, max(w, h) > m { let k = Double(m) / Double(max(w, h)); w = Int(Double(w) * k); h = Int(Double(h) * k) }
        let px = rgba(image, width: w, height: h)
        let t = texture(w, h, mipmapped: mipmapped, repeatS: repeatS)
        glBindTexture(E(GL_TEXTURE_2D), t)
        px.data.withUnsafeBytes { glTexSubImage2D(E(GL_TEXTURE_2D), 0, 0, 0, GLsizei(w), GLsizei(h), E(GL_RGBA), E(GL_UNSIGNED_BYTE), $0.baseAddress) }
        if mipmapped { glGenerateMipmap(E(GL_TEXTURE_2D)) }
        return (t, w, h)
    }
}

enum Mat {
    static let identity: [Float] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

    /// a * b (column-major 4x4): b applies first.
    static func multiply(_ a: [Float], _ b: [Float]) -> [Float] {
        var out = [Float](repeating: 0, count: 16)
        for c in 0..<4 { for r in 0..<4 {
            var v: Float = 0
            for k in 0..<4 { v += a[k * 4 + r] * b[c * 4 + k] }
            out[c * 4 + r] = v
        } }
        return out
    }

    /// Upright image uv (row 0 first) -> uv of a frame that still needs [turnsCW] clockwise
    /// quarter turns, and then a left-right mirror when [mirror], to be upright.
    static func turned(_ turnsCW: Int, mirror: Bool) -> [Float] {
        // (u, v) -> raw: 1 turn (v, 1-u), 2 turns (1-u, 1-v), 3 turns (1-v, u).
        let r: [Float]
        switch turnsCW & 3 {
        case 1: r = [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1]
        case 2: r = [-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1]
        case 3: r = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1]
        default: r = identity
        }
        guard mirror else { return r }
        let m: [Float] = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1]
        return multiply(r, m)
    }

    /// Screen uv (y up) -> uv of an upright image stored row 0 first, showing its central
    /// [sx] x [sy], shifted by ([dx], [dy]) and optionally mirrored.
    static func image(sx: Float, sy: Float, dx: Float = 0, dy: Float = 0, mirror: Bool = false) -> [Float] {
        let ax = mirror ? -sx : sx
        return [ax, 0, 0, 0,
                0, -sy, 0, 0,
                0, 0, 1, 0,
                0.5 - 0.5 * ax + dx, 0.5 + 0.5 * sy - dy, 0, 1]
    }
}
