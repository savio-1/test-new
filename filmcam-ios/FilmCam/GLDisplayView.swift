import UIKit
import OpenGLES

/// The viewfinder: a CAEAGLLayer the render queue draws the final pass into.
final class GLDisplayView: UIView {
    override class var layerClass: AnyClass { CAEAGLLayer.self }
    var eaglLayer: CAEAGLLayer { layer as! CAEAGLLayer }

    /// Called with the drawable's pixel size whenever it changes.
    var onResize: ((Int, Int) -> Void)?
    private var lastSize = CGSize.zero

    override init(frame: CGRect) {
        super.init(frame: frame)
        isOpaque = true
        backgroundColor = .black
        // Retina is costly for a full-screen film pass; 2x is sharp enough on every iPhone.
        contentScaleFactor = min(UIScreen.main.scale, 2)
        eaglLayer.isOpaque = true
        eaglLayer.drawableProperties = [kEAGLDrawablePropertyRetainedBacking: false,
                                        kEAGLDrawablePropertyColorFormat: kEAGLColorFormatRGBA8]
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layoutSubviews() {
        super.layoutSubviews()
        let s = CGSize(width: (bounds.width * contentScaleFactor).rounded(), height: (bounds.height * contentScaleFactor).rounded())
        if s != lastSize, s.width > 0, s.height > 0 {
            lastSize = s
            onResize?(Int(s.width), Int(s.height))
        }
    }
}

/// Renderbuffer + framebuffer backed by the view's layer (render queue only).
final class LayerTarget {
    private(set) var fbo: GLuint = 0
    private var rbo: GLuint = 0
    private(set) var width = 0
    private(set) var height = 0

    func attach(_ context: EAGLContext, _ layer: CAEAGLLayer) {
        release()
        glGenFramebuffers(1, &fbo)
        glGenRenderbuffers(1, &rbo)
        glBindFramebuffer(E(GL_FRAMEBUFFER), fbo)
        glBindRenderbuffer(E(GL_RENDERBUFFER), rbo)
        context.renderbufferStorage(Int(GL_RENDERBUFFER), from: layer)
        glFramebufferRenderbuffer(E(GL_FRAMEBUFFER), E(GL_COLOR_ATTACHMENT0), E(GL_RENDERBUFFER), rbo)
        var w: GLint = 0, h: GLint = 0
        glGetRenderbufferParameteriv(E(GL_RENDERBUFFER), E(GL_RENDERBUFFER_WIDTH), &w)
        glGetRenderbufferParameteriv(E(GL_RENDERBUFFER), E(GL_RENDERBUFFER_HEIGHT), &h)
        width = Int(w); height = Int(h)
        glBindFramebuffer(E(GL_FRAMEBUFFER), 0)
    }

    func present(_ context: EAGLContext) {
        glBindRenderbuffer(E(GL_RENDERBUFFER), rbo)
        context.presentRenderbuffer(Int(GL_RENDERBUFFER))
    }

    func release() {
        if fbo != 0 { glDeleteFramebuffers(1, &fbo); fbo = 0 }
        if rbo != 0 { glDeleteRenderbuffers(1, &rbo); rbo = 0 }
        width = 0; height = 0
    }
}
