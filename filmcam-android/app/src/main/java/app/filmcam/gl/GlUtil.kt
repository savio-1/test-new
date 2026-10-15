package app.filmcam.gl

import android.opengl.GLES11Ext
import android.opengl.GLES30
import android.util.Log

object GlUtil {
    private const val TAG = "FilmCamGL"

    fun compile(type: Int, source: String): Int {
        val shader = GLES30.glCreateShader(type)
        GLES30.glShaderSource(shader, source)
        GLES30.glCompileShader(shader)
        val ok = IntArray(1)
        GLES30.glGetShaderiv(shader, GLES30.GL_COMPILE_STATUS, ok, 0)
        if (ok[0] == 0) {
            val log = GLES30.glGetShaderInfoLog(shader)
            GLES30.glDeleteShader(shader)
            throw RuntimeException("Shader compile failed: $log")
        }
        return shader
    }

    fun link(vertex: String, fragment: String): Int {
        val vs = compile(GLES30.GL_VERTEX_SHADER, vertex)
        val fs = compile(GLES30.GL_FRAGMENT_SHADER, fragment)
        val program = GLES30.glCreateProgram()
        GLES30.glAttachShader(program, vs)
        GLES30.glAttachShader(program, fs)
        GLES30.glLinkProgram(program)
        GLES30.glDeleteShader(vs)
        GLES30.glDeleteShader(fs)
        val ok = IntArray(1)
        GLES30.glGetProgramiv(program, GLES30.GL_LINK_STATUS, ok, 0)
        if (ok[0] == 0) {
            val log = GLES30.glGetProgramInfoLog(program)
            GLES30.glDeleteProgram(program)
            throw RuntimeException("Program link failed: $log")
        }
        return program
    }

    fun createOesTexture(): Int {
        val t = IntArray(1)
        GLES30.glGenTextures(1, t, 0)
        GLES30.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, t[0])
        GLES30.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
        GLES30.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
        return t[0]
    }

    /** An immutable-storage 2D texture with optional mip chain. */
    fun createTexture(width: Int, height: Int, internalFormat: Int, mipmapped: Boolean = false): Int {
        val t = IntArray(1)
        GLES30.glGenTextures(1, t, 0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, t[0])
        val levels = if (mipmapped) mipLevels(width, height) else 1
        GLES30.glTexStorage2D(GLES30.GL_TEXTURE_2D, levels, internalFormat, width, height)
        GLES30.glTexParameteri(
            GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER,
            if (mipmapped) GLES30.GL_LINEAR_MIPMAP_LINEAR else GLES30.GL_LINEAR,
        )
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
        return t[0]
    }

    fun mipLevels(width: Int, height: Int): Int {
        var size = maxOf(width, height)
        var levels = 1
        while (size > 1) { size = size shr 1; levels++ }
        return levels
    }

    fun createFramebuffer(vararg colorTextures: Int): Int {
        val f = IntArray(1)
        GLES30.glGenFramebuffers(1, f, 0)
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, f[0])
        val buffers = IntArray(colorTextures.size)
        colorTextures.forEachIndexed { i, tex ->
            GLES30.glFramebufferTexture2D(
                GLES30.GL_FRAMEBUFFER, GLES30.GL_COLOR_ATTACHMENT0 + i, GLES30.GL_TEXTURE_2D, tex, 0,
            )
            buffers[i] = GLES30.GL_COLOR_ATTACHMENT0 + i
        }
        GLES30.glDrawBuffers(buffers.size, buffers, 0)
        val status = GLES30.glCheckFramebufferStatus(GLES30.GL_FRAMEBUFFER)
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
        check(status == GLES30.GL_FRAMEBUFFER_COMPLETE) { "Framebuffer incomplete: 0x${Integer.toHexString(status)}" }
        return f[0]
    }

    fun deleteTextures(vararg ids: Int) {
        if (ids.isNotEmpty()) GLES30.glDeleteTextures(ids.size, ids, 0)
    }

    fun deleteFramebuffers(vararg ids: Int) {
        if (ids.isNotEmpty()) GLES30.glDeleteFramebuffers(ids.size, ids, 0)
    }

    fun checkError(op: String) {
        val e = GLES30.glGetError()
        if (e != GLES30.GL_NO_ERROR) Log.w(TAG, "$op: glError 0x${Integer.toHexString(e)}")
    }

    fun hasExtension(name: String): Boolean {
        val n = IntArray(1)
        GLES30.glGetIntegerv(GLES30.GL_NUM_EXTENSIONS, n, 0)
        for (i in 0 until n[0]) if (GLES30.glGetStringi(GLES30.GL_EXTENSIONS, i) == name) return true
        return false
    }

    fun maxTextureSize(): Int {
        val v = IntArray(1)
        GLES30.glGetIntegerv(GLES30.GL_MAX_TEXTURE_SIZE, v, 0)
        return v[0]
    }
}

/** A linked program with a cached uniform lookup. */
class Program(vertex: String, fragment: String) {
    val id = GlUtil.link(vertex, fragment)
    private val locations = HashMap<String, Int>()

    fun use() = GLES30.glUseProgram(id)

    fun loc(name: String): Int = locations.getOrPut(name) { GLES30.glGetUniformLocation(id, name) }

    fun set1f(name: String, v: Float) = GLES30.glUniform1f(loc(name), v)
    fun set1i(name: String, v: Int) = GLES30.glUniform1i(loc(name), v)
    fun set1ui(name: String, v: Int) = GLES30.glUniform1ui(loc(name), v)
    fun set2f(name: String, a: Float, b: Float) = GLES30.glUniform2f(loc(name), a, b)
    fun set3f(name: String, a: Float, b: Float, c: Float) = GLES30.glUniform3f(loc(name), a, b, c)
    fun set2fv(name: String, v: FloatArray) = GLES30.glUniform2fv(loc(name), v.size / 2, v, 0)
    fun set3fv(name: String, v: FloatArray) = GLES30.glUniform3fv(loc(name), v.size / 3, v, 0)
    fun set1fv(name: String, v: FloatArray) = GLES30.glUniform1fv(loc(name), v.size, v, 0)
    fun setMat4(name: String, m: FloatArray) = GLES30.glUniformMatrix4fv(loc(name), 1, false, m, 0)
    /** Row-major input; GLES 3 can transpose on upload. */
    fun setMat3RowMajor(name: String, m: FloatArray) = GLES30.glUniformMatrix3fv(loc(name), 1, true, m, 0)

    fun release() = GLES30.glDeleteProgram(id)
}
