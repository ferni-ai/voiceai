import MetalKit
import SwiftUI

/// The Metal canvas for one frame of Ferni. Paused: it draws only when SwiftUI
/// hands it new uniforms from the TimelineView clock (one clock, motion spec §6.10).
struct AliveMetalView: UIViewRepresentable {
    let renderer: AliveRenderer
    let uniforms: AliveUniforms
    /// Ferni's radius and offset below the canvas centre, as fractions of the canvas width.
    let radius: Float
    let below: Float
    /// Pixels per point (lower when throttled).
    let scale: CGFloat

    func makeCoordinator() -> Coordinator { Coordinator(renderer: renderer) }

    func makeUIView(context: Context) -> MTKView {
        let view = MTKView(frame: .zero, device: renderer.device)
        view.isPaused = true
        view.enableSetNeedsDisplay = false
        view.framebufferOnly = true
        view.colorPixelFormat = AliveRenderer.pixelFormat
        view.isOpaque = false
        view.layer.isOpaque = false
        view.backgroundColor = .clear
        view.clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
        view.delegate = context.coordinator
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ view: MTKView, context: Context) {
        if view.contentScaleFactor != scale { view.contentScaleFactor = scale }
        context.coordinator.uniforms = uniforms
        context.coordinator.radius = radius
        context.coordinator.below = below
        view.draw()
    }

    @MainActor
    final class Coordinator: NSObject, MTKViewDelegate {
        let renderer: AliveRenderer
        var uniforms = AliveUniforms()
        var radius: Float = 0.18, below: Float = 0

        init(renderer: AliveRenderer) { self.renderer = renderer }

        func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

        func draw(in view: MTKView) {
            let size = view.drawableSize
            guard size.width > 0, let pass = view.currentRenderPassDescriptor, let drawable = view.currentDrawable,
                  let buffer = renderer.queue.makeCommandBuffer() else { return }
            var u = uniforms
            let w = Float(size.width), h = Float(size.height)
            u.frame(size: SIMD2(w, h), radius: radius * w, below: below * w)
            renderer.encode(u, pass: pass, into: buffer)
            buffer.present(drawable)
            buffer.commit()
        }
    }
}
