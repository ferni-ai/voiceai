import MetalKit
import os
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
    /// The rate the clock is asking for (`FramePace`), for the pacing measurements.
    var targetHz = FramePace.fastest

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
        context.coordinator.targetHz = targetHz
        view.draw()
    }

    @MainActor
    final class Coordinator: NSObject, MTKViewDelegate {
        let renderer: AliveRenderer
        var uniforms = AliveUniforms()
        var radius: Float = 0.18, below: Float = 0
        var targetHz = FramePace.fastest
        private var meter = FrameMeter()
        private let log = Logger(subsystem: "com.sethdford.ferni", category: "avatar")
        /// Each draw as an interval in Instruments (Points of Interest: avatar).
        private let signposter = OSSignposter(subsystem: "com.sethdford.ferni", category: .pointsOfInterest)
        /// When each frame really reached the glass (debug builds).
        private let presented = OSAllocatedUnfairLock(initialState: PresentStats())

        init(renderer: AliveRenderer) { self.renderer = renderer }

        func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

        func draw(in view: MTKView) {
            let size = view.drawableSize
            guard size.width > 0, let pass = view.currentRenderPassDescriptor, let drawable = view.currentDrawable,
                  let buffer = renderer.queue.makeCommandBuffer() else { return }
            let signpost = signposter.beginInterval("avatar draw", id: signposter.makeSignpostID(), "\(self.targetHz) Hz")
            defer { signposter.endInterval("avatar draw", signpost) }
            #if DEBUG && !targetEnvironment(simulator)
            // The period this frame is due in: the clock's rate, at most the
            // screen's. (The simulator's Metal has no presented handler.)
            let screenMax = view.window?.windowScene?.screen.maximumFramesPerSecond ?? FramePace.fastest
            let expected = 1 / Double(max(1, min(targetHz, screenMax)))
            drawable.addPresentedHandler { [presented] shown in
                presented.withLock { $0.presented(at: shown.presentedTime, expected: expected) }
            }
            #endif
            var u = uniforms
            let w = Float(size.width), h = Float(size.height)
            u.frame(size: SIMD2(w, h), radius: radius * w, below: below * w)
            renderer.encode(u, pass: pass, into: buffer)
            buffer.present(drawable)
            buffer.commit()
            // Every 5 s: the real draw rate and what shaped it (device test evidence).
            if let fps = meter.tick(at: CACurrentMediaTime()) {
                let info = ProcessInfo.processInfo
                log.notice("""
                avatar fps=\(fps, format: .fixed(precision: 1), privacy: .public) \
                scale=\(Double(view.contentScaleFactor), format: .fixed(precision: 1), privacy: .public) \
                drawable=\(Int(size.width), privacy: .public)x\(Int(size.height), privacy: .public) \
                thermal=\(FrameMeter.words(info.thermalState), privacy: .public) \
                lowPower=\(info.isLowPowerModeEnabled, privacy: .public)
                """)
                #if DEBUG
                if let s = presented.withLock({ $0.report() }) {
                    log.notice("""
                    avatar presented target=\(self.targetHz, privacy: .public)Hz \
                    p50=\(s.p50 * 1000, format: .fixed(precision: 2), privacy: .public)ms \
                    p99=\(s.p99 * 1000, format: .fixed(precision: 2), privacy: .public)ms \
                    hitch=\(s.hitchMsPerSecond, format: .fixed(precision: 2), privacy: .public)ms/s \
                    frames=\(s.frames, privacy: .public)
                    """)
                }
                #endif
            }
        }
    }
}

/// When frames reached the glass (drawable presentedTime): the interval
/// between them at p50 and p99, and the hitch ratio, ms of lateness a second
/// (a frame later than one and a half periods of the rate it was due at
/// counts its lateness past one period). Targets: hitch < 1 ms/s, p99 <=
/// 16.7 ms while speaking at 120 Hz, >= 60 Hz listening or thinking.
struct PresentStats: Sendable {
    /// A gap longer than this is a pause (covered, in the background), not a hitch.
    static let pause = 0.25
    private var last: Double?
    private var intervals: [Double] = []
    private var late = 0.0, span = 0.0

    struct Report: Equatable, Sendable {
        let p50: Double, p99: Double, hitchMsPerSecond: Double, frames: Int
    }

    /// A frame shown at `time` (seconds, 0 if it never was), due `expected` after the last.
    mutating func presented(at time: Double, expected: Double) {
        guard time > 0 else { return }
        defer { last = time }
        guard let last, case let gap = time - last, gap > 0, gap < Self.pause else { return }
        intervals.append(gap)
        span += gap
        if gap > expected * 1.5 { late += gap - expected }
    }

    /// The window so far, then a fresh one; nil before two frames.
    mutating func report() -> Report? {
        defer { intervals.removeAll(keepingCapacity: true); late = 0; span = 0 }
        guard !intervals.isEmpty, span > 0 else { return nil }
        let sorted = intervals.sorted()
        func at(_ q: Double) -> Double { sorted[min(sorted.count - 1, Int((Double(sorted.count - 1) * q).rounded()))] }
        return Report(p50: at(0.5), p99: at(0.99), hitchMsPerSecond: late * 1000 / span, frames: sorted.count)
    }
}

/// Draws per second over a window, reported once per window.
struct FrameMeter {
    var window: Double = 5
    private var start: Double?
    private var frames = 0

    /// Counts a frame at `now` (seconds); the frame rate once each window is full.
    mutating func tick(at now: Double) -> Double? {
        guard let begun = start else { start = now; frames = 0; return nil }
        frames += 1
        guard now - begun >= window else { return nil }
        defer { start = now; frames = 0 }
        return Double(frames) / (now - begun)
    }

    static func words(_ state: ProcessInfo.ThermalState) -> String {
        switch state {
        case .nominal: "nominal"
        case .fair: "fair"
        case .serious: "serious"
        case .critical: "critical"
        @unknown default: "unknown"
        }
    }
}
