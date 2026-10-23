import Metal
import os
import QuartzCore
import SwiftUI

/// The Metal canvas for Ferni, and THE avatar clock (motion spec §6.10, red
/// team item 3). A CAMetalDisplayLink on the canvas's layer asks for each
/// frame with the moment it will reach the glass; the frame's motion is
/// computed for that moment (`FrameClock`), drawn into the link's drawable,
/// and the pace that frame leaves (`FramePace`) goes straight back to the
/// link's preferred frame rate, with no SwiftUI round trip. This is the one
/// file allowed a CAMetalDisplayLink (scripts/check-motion-rules.sh).
struct AliveMetalView: UIViewRepresentable {
    let renderer: AliveRenderer
    /// Ferni's radius and offset below the canvas centre, as fractions of the canvas width.
    let radius: Float
    let below: Float
    /// Pixels per point (lower when throttled).
    let scale: CGFloat
    /// Host time Ferni woke at: frame times count from here.
    let origin: Double
    /// The app isn't active or something covers Ferni: no frames at all.
    let paused: Bool
    /// Changes when something asks for a new rate at once (a request, a touch).
    var kick = 0
    /// This frame's uniforms, `seconds` after he woke, on screen at the date.
    let frame: @MainActor (_ seconds: Double, _ date: Date) -> AliveUniforms
    /// Frames a second after a frame on screen at the date (`FramePace`).
    let pace: @MainActor (_ date: Date) -> Int

    func makeCoordinator() -> Coordinator { Coordinator(renderer: renderer, origin: origin) }

    func makeUIView(context: Context) -> Canvas {
        let view = Canvas()
        let layer = view.metalLayer
        layer.device = renderer.device
        layer.pixelFormat = AliveRenderer.pixelFormat
        layer.framebufferOnly = true
        layer.isOpaque = false
        view.isOpaque = false
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = false
        view.onPlaced = { [weak coordinator = context.coordinator] in coordinator?.updatePause() }
        context.coordinator.attach(to: view)
        return view
    }

    func updateUIView(_ view: Canvas, context: Context) {
        if view.contentScaleFactor != scale {
            view.contentScaleFactor = scale
            view.setNeedsLayout()
        }
        let c = context.coordinator
        c.frame = frame
        c.pace = pace
        c.radius = radius
        c.below = below
        c.paused = paused
        c.updatePause()
        c.apply(pace(.now))
        // After the view update, never during it: a frame writes the particle feed.
        Task { @MainActor [weak c] in c?.refresh() }
    }

    static func dismantleUIView(_ view: Canvas, coordinator: Coordinator) { coordinator.stop() }

    /// A view whose layer is the Metal layer the link draws into.
    final class Canvas: UIView {
        override class var layerClass: AnyClass { CAMetalLayer.self }
        /// Always a CAMetalLayer (`layerClass`).
        var metalLayer: CAMetalLayer { layer as! CAMetalLayer }
        /// Moved to or from a window, or resized: whether there's anything to draw into changed.
        var onPlaced: (() -> Void)?

        override func layoutSubviews() {
            super.layoutSubviews()
            let s = contentScaleFactor
            metalLayer.drawableSize = CGSize(width: bounds.width * s, height: bounds.height * s)
            onPlaced?()
        }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            onPlaced?()
        }
    }

    @MainActor
    final class Coordinator: NSObject, @preconcurrency CAMetalDisplayLinkDelegate {
        let renderer: AliveRenderer
        var frame: (@MainActor (Double, Date) -> AliveUniforms)?
        var pace: (@MainActor (Date) -> Int)?
        var radius: Float = 0.18, below: Float = 0
        var paused = false
        /// The rate the link is asking for now.
        private(set) var hz = FramePace.rest
        private var clock: FrameClock
        private var link: CAMetalDisplayLink?
        private weak var view: Canvas?
        private var meter = FrameMeter()
        private let log = Logger(subsystem: "com.sethdford.ferni", category: "avatar")
        /// Each draw as an interval in Instruments (Points of Interest: avatar).
        private let signposter = OSSignposter(subsystem: "com.sethdford.ferni", category: .pointsOfInterest)
        /// When each frame really reached the glass (debug builds).
        private let presented = OSAllocatedUnfairLock(initialState: PresentStats())

        init(renderer: AliveRenderer, origin: Double) {
            self.renderer = renderer
            clock = FrameClock(origin: origin)
        }

        func attach(to view: Canvas) {
            self.view = view
            let link = CAMetalDisplayLink(metalLayer: view.metalLayer)
            link.delegate = self
            link.preferredFrameRateRange = FramePace.range(for: hz)
            link.isPaused = true
            link.add(to: .main, forMode: .common)
            self.link = link
        }

        func stop() {
            link?.invalidate()
            link = nil
        }

        /// A still frame is due: the link runs for one frame while paused.
        private var owesStill = false

        /// Something to draw into: in a window, with a size.
        private var placed: Bool {
            guard let view, view.window != nil else { return false }
            return view.bounds.width > 0 && view.bounds.height > 0
        }

        /// Frames only while wanted (or one still frame is owed) and placed.
        func updatePause() {
            let off = (paused && !owesStill) || !placed
            if link?.isPaused != off { link?.isPaused = off }
        }

        /// After a view update. While the link runs, its next frame sees the
        /// new inputs. While it's paused (covered, inactive) it draws one still
        /// frame with them, as a paused clock redraws on an update; with nothing
        /// to draw into, the rig still hears them (and its requests are kept).
        func refresh() {
            guard link?.isPaused ?? true else { return }
            if placed {
                owesStill = true
                updatePause()
            } else if let frame {
                _ = frame(clock.seconds(presentingAt: CACurrentMediaTime()), .now)
            }
        }

        /// The rate, straight to the link (only when it changes).
        func apply(_ next: Int) {
            guard next != hz else { return }
            hz = next
            link?.preferredFrameRateRange = FramePace.range(for: next)
        }

        func metalDisplayLink(_ link: CAMetalDisplayLink, needsUpdate update: CAMetalDisplayLink.Update) {
            guard let frame else { return }
            let target = update.targetPresentationTimestamp
            let date = FrameClock.date(presentingAt: target, hostNow: CACurrentMediaTime(), wallNow: .now)
            var u = frame(clock.seconds(presentingAt: target), date)
            draw(&u, into: update.drawable)
            if let pace { apply(pace(date)) }
            if owesStill {
                owesStill = false
                updatePause()
            }
        }

        private func draw(_ uniforms: inout AliveUniforms, into drawable: CAMetalDrawable) {
            let texture = drawable.texture
            guard texture.width > 0, let buffer = renderer.queue.makeCommandBuffer() else { return }
            let signpost = signposter.beginInterval("avatar draw", id: signposter.makeSignpostID(), "\(self.hz) Hz")
            defer { signposter.endInterval("avatar draw", signpost) }
            let pass = MTLRenderPassDescriptor()
            pass.colorAttachments[0].texture = texture
            pass.colorAttachments[0].storeAction = .store
            let w = Float(texture.width), h = Float(texture.height)
            uniforms.frame(size: SIMD2(w, h), radius: radius * w, below: below * w)
            renderer.encode(uniforms, pass: pass, into: buffer)
            #if DEBUG && !targetEnvironment(simulator)
            // The period this frame is due in: the link's rate, at most the
            // screen's. (The simulator's Metal has no presented handler.)
            let screenMax = view?.window?.windowScene?.screen.maximumFramesPerSecond ?? FramePace.fastest
            let expected = 1 / Double(max(1, min(hz, screenMax)))
            drawable.addPresentedHandler { [presented] shown in
                presented.withLock { $0.presented(at: shown.presentedTime, expected: expected) }
            }
            #endif
            buffer.present(drawable)
            buffer.commit()
            report(drawable: texture)
        }

        /// Every 5 s: the real draw rate and what shaped it (device test evidence).
        private func report(drawable texture: MTLTexture) {
            guard let fps = meter.tick(at: CACurrentMediaTime()) else { return }
            let info = ProcessInfo.processInfo
            log.notice("""
            avatar fps=\(fps, format: .fixed(precision: 1), privacy: .public) \
            target=\(self.hz, privacy: .public)Hz \
            scale=\(Double(self.view?.contentScaleFactor ?? 0), format: .fixed(precision: 1), privacy: .public) \
            drawable=\(texture.width, privacy: .public)x\(texture.height, privacy: .public) \
            thermal=\(FrameMeter.words(info.thermalState), privacy: .public) \
            lowPower=\(info.isLowPowerModeEnabled, privacy: .public)
            """)
            #if DEBUG
            if let s = presented.withLock({ $0.report() }) {
                log.notice("""
                avatar presented target=\(self.hz, privacy: .public)Hz \
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
