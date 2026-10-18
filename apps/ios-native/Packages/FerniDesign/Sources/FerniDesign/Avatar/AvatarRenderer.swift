import SwiftUI

/// What the avatar is doing, as far as drawing it is concerned.
public enum AvatarActivity: Equatable, Sendable {
    case idle, arriving, listening, thinking, speaking, reconnecting, error

    /// Breath period (ios-motion-spec §6.2).
    var breath: Double {
        switch self {
        case .idle, .error: 5
        case .arriving: 4.5
        case .listening: 4
        case .thinking: 4 / 0.75
        case .speaking: 3
        case .reconnecting: 6
        }
    }
}

/// Everything one frame of the avatar needs, so drawing is a pure function of
/// it (snapshot tests build these by hand).
public struct AvatarFrame: Equatable, Sendable {
    public var persona: WindowPersona = .ferni
    public var expression: AvatarExpression = .neutral
    public var activity: AvatarActivity = .idle
    /// Ferni's smoothed voice level, 0...1.
    public var level: Double = 0
    /// Seconds since the view appeared (drives breath, blink and gaze).
    public var time: Double = 10
    /// Seconds since `activity` last changed (the arriving ring fades in).
    public var activityAge: Double = 10
    public var reduceMotion = false
    /// Low Power or a hot device: no glow or halo waves.
    public var lowPower = false

    public init() {}
}

/// Draws the avatar into a Canvas (§6.3): glow, halo, the face clipped by its
/// lids (a clip, never a background-colored cover, so it works on any
/// background), then the eyes. Lid curves scale with the size.
enum AvatarRenderer {
    static func draw(_ f: AvatarFrame, in context: inout GraphicsContext, size: CGSize) {
        let s = min(size.width, size.height)
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        let config = f.expression.config
        let wake = min(1, f.time / 0.6) // glow and eyes come up over the first 600 ms
        let motion = f.reduceMotion ? 0 : 1.0
        let v = f.activity == .speaking ? f.level : 0
        let muted = f.activity == .reconnecting
        // Reduce Motion wakes with a 200 ms fade instead of opening eyes.
        if f.reduceMotion { context.opacity = min(1, f.time / 0.2) }

        // Glow
        if !f.lowPower {
            // Stays inside the frame, so its edge never shows as a square.
            let glow = Path(ellipseIn: CGRect(x: center.x - s * 0.5, y: center.y - s * 0.5, width: s, height: s))
            context.fill(glow, with: .radialGradient(
                Gradient(colors: [f.persona.primaryColor.opacity(0.28 * wake), .clear]),
                center: center, startRadius: s * 0.38, endRadius: s * 0.5))
        }

        // Halo while speaking; a quiet orbit while arriving.
        if f.activity == .speaking {
            let rings = f.lowPower ? 1 : 3
            for ring in 0..<rings {
                let extra = Double(ring) * 0.04 * motion
                let r = s * 0.45 * (1 + (v * 0.015 + extra) * motion)
                let alpha = (0.3 + 0.2 * v) * pow(0.5, Double(ring))
                context.stroke(Path(ellipseIn: CGRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2)),
                               with: .color(f.persona.primaryColor.opacity(alpha)), lineWidth: 1.5)
            }
        } else if f.activity == .arriving, f.activityAge > 0.3 {
            let fade = min(1, (f.activityAge - 0.3) / 0.3)
            let r = s * 0.48
            if f.reduceMotion {
                let pulse = 0.45 + 0.15 * sin(f.time * 2 * .pi / 1.5)
                context.stroke(Path(ellipseIn: CGRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2)),
                               with: .color(f.persona.primaryColor.opacity(pulse * fade)), lineWidth: 1.5)
            } else {
                let start = Angle.degrees(f.time / 1.5 * 360)
                var arc = Path()
                arc.addArc(center: center, radius: r, startAngle: start, endAngle: start + .degrees(90), clockwise: false)
                context.stroke(arc, with: .color(f.persona.primaryColor.opacity(0.8 * fade)),
                               style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
            }
        }

        // Body: breath, and squash with the voice.
        let breath = 1 + 0.015 * sin(f.time * 2 * .pi / f.activity.breath) * motion
        let sx = breath * (1 - v * 0.032 * motion)
        let sy = breath * (1 + v * 0.08 * motion)
        var body = context
        body.translateBy(x: center.x, y: center.y)
        body.scaleBy(x: sx, y: sy)
        body.translateBy(x: -center.x, y: -center.y)
        if muted { body.addFilter(.saturation(0.5)) }

        let faceRect = CGRect(x: center.x - s * 0.45, y: center.y - s * 0.45, width: s * 0.9, height: s * 0.9)
        var face = body
        face.clip(to: lids(config, rect: faceRect, size: s, level: v))
        face.fill(Path(ellipseIn: faceRect), with: .linearGradient(
            Gradient(colors: [f.persona.primaryColor, f.persona.secondaryColor]),
            startPoint: faceRect.origin, endPoint: CGPoint(x: faceRect.maxX, y: faceRect.maxY)))

        // Eyes: blink, gaze (none under Reduce Motion), and a catchlight.
        let opening = f.reduceMotion ? 1 : min(1, f.time / 0.25)
        let openness = opening * AvatarMotion.blink(at: f.time, heavy: muted)
        let look = AvatarMotion.gaze(at: f.time, thinking: f.activity == .thinking)
        let reach = motion * s * 0.04
        let gaze = CGSize(width: look.width * reach, height: look.height * reach)
        let eyeW = s * 0.18 * config.effectiveEyeScaleX
        let eyeH = s * 0.18 * config.effectiveEyeScaleY * max(0.06, openness)
        for side in [-1.0, 1.0] {
            let cx: CGFloat = center.x + side * s * 0.19 + gaze.width
            let cy: CGFloat = center.y - s * 0.05 + gaze.height
            let c = CGPoint(x: cx, y: cy)
            let eye = CGRect(x: c.x - eyeW / 2, y: c.y - eyeH / 2, width: eyeW, height: eyeH)
            face.fill(Path(ellipseIn: eye), with: .color(.white))
            let glint = s * 0.035
            face.fill(Path(ellipseIn: CGRect(x: c.x + eyeW * 0.12, y: c.y - eyeH * 0.28, width: glint, height: glint * openness)),
                      with: .color(f.persona.secondaryColor.opacity(0.35)))
        }
    }

    /// The visible band of the face: below the top lid, above the bottom lid.
    /// The bottom lid opens with the voice (the "mouth"), capped at 35%.
    static func lids(_ c: ExpressionConfig, rect: CGRect, size s: CGFloat, level v: Double) -> Path {
        let h = rect.height
        let tilt = c.asymmetry * s * 0.04
        let top = rect.minY + h * c.topCutoff
        let bottomCutoff = min(c.bottomCutoff + v * 0.23, 0.35)
        let bottom = rect.maxY - h * bottomCutoff
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: top + tilt))
        p.addQuadCurve(to: CGPoint(x: rect.maxX, y: top - tilt),
                       control: CGPoint(x: rect.midX, y: top + c.topCurve * 0.15 * s))
        p.addLine(to: CGPoint(x: rect.maxX, y: bottom - tilt / 2))
        p.addQuadCurve(to: CGPoint(x: rect.minX, y: bottom + tilt / 2),
                       control: CGPoint(x: rect.midX, y: bottom + c.bottomCurve * 0.15 * s))
        p.closeSubpath()
        return p
    }
}

/// Blink and gaze as pure functions of time: the same moment always draws the
/// same face (deterministic snapshots), and nothing needs a timer.
enum AvatarMotion {
    /// 1 = open, toward 0 = closed. A blink roughly every 3.2 s (2-8 s), jittered.
    static func blink(at t: Double, heavy: Bool = false) -> Double {
        let duration = heavy ? 0.4 : 0.15
        let slot = 3.2
        let k = (t / slot).rounded(.down)
        for index in [k - 1, k] where index >= 1 {
            let at = index * slot + (hash(index) - 0.5) * 2.4
            let x = (t - at) / duration
            if (0...1).contains(x) { return 1 - 0.9 * sin(x * .pi) }
        }
        return 1
    }

    /// A small look-around, a new target every ~2 s; thinking looks up and aside.
    static func gaze(at t: Double, thinking: Bool) -> CGSize {
        if thinking { return CGSize(width: 0.375, height: -0.375) }
        let k = (t / 2).rounded(.down)
        let target = CGSize(width: hash(k) * 2 - 1, height: (hash(k + 0.5) * 2 - 1) * 0.5)
        let previous = CGSize(width: hash(k - 1) * 2 - 1, height: (hash(k - 0.5) * 2 - 1) * 0.5)
        let x = min(1, (t - k * 2) / 0.15) // a quick saccade
        let ease = x * x * (3 - 2 * x)
        return CGSize(width: previous.width + (target.width - previous.width) * ease,
                      height: previous.height + (target.height - previous.height) * ease)
    }

    /// 0...1, stable for a given input.
    static func hash(_ x: Double) -> Double {
        let v = sin(x * 12.9898 + 78.233) * 43758.5453
        return v - v.rounded(.down)
    }
}
