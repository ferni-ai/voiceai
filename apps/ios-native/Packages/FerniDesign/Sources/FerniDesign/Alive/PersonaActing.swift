import Foundation
import simd

/// How each teammate acts, so that with the colour taken away you can still
/// tell Maya from Alex (persona acting SPEC, voiceai-evidence/
/// avatar-persona-acting-2026-10-22). Seth: "Pixar range, each persona
/// lovable differently, calm is not flat." Behind `flagKey`, off by default:
/// off, every persona acts as `shared` (the values from before the spec).
public struct PersonaActing: Equatable, Sendable {
    /// The longest he goes without a blink (`BlinkTiming`'s floor).
    var blinkFloor: ClosedRange<Double>
    /// A blink's length against the shared one (Nayan's are slow).
    var blinkLength: Double
    /// Share of blinks that come as a double.
    var doubleBlinks: Double
    /// Seconds between saccades, and how far one goes (gaze units, x and y).
    var saccadeEvery: ClosedRange<Double>
    var saccadeRange: SIMD2<Double>
    /// Share of saccades that are a big jump (2.5x the range): Peter's scanning.
    var bigJumps: Double
    /// The eyes' spring: stiffer is quicker and more decisive.
    var eyeStiffness: Double, eyeDamping: Double
    /// A listening nod against the shared one.
    var nod: Double
    /// The breath at rest: its period against the shared one, and its depth.
    var breathPeriod: Double, breathDepth: Double
    /// The body's slow drift at rest (`Drift`): everyone bobs, Maya sways.
    var drift: Drift
    /// Eye spacing (body radii from the middle), eye size (x, y), body height
    /// (1 round, more taller), and how much lower the top lids rest.
    var eyeSpacing: Double, eyeSize: SIMD2<Double>, bodyHeight: Double, lidDrop: Double

    /// Everyone, before the spec (and with the flag off).
    static let shared = PersonaActing(
        blinkFloor: BlinkTiming.floor, blinkLength: 1, doubleBlinks: 0.16,
        saccadeEvery: 1.1...3.4, saccadeRange: SIMD2(0.2, 0.14), bigJumps: 0, eyeStiffness: 650, eyeDamping: 46,
        nod: 1, breathPeriod: 1, breathDepth: 1, drift: .bob,
        eyeSpacing: 0.36, eyeSize: SIMD2(1, 1), bodyHeight: 1, lidDrop: 0
    )

    /// The spec's table, row by row (the persona's bundle in a line each).
    public static func of(_ persona: WindowPersona) -> PersonaActing {
        var a = shared
        switch persona {
        case .ferni:   // warm, curious coach who learned ma: unhurried, steady
            a.blinkFloor = 4...7; a.saccadeEvery = 1.4...3.6; a.saccadeRange = SIMD2(0.18, 0.12)
            a.breathPeriod = 4.2 / 4
        case .maya:    // upbeat big sister, efficient: bright, quick, lifted
            a.blinkFloor = 3...5; a.saccadeEvery = 0.9...2.2; a.saccadeRange = SIMD2(0.22, 0.12)
            // Her own signature (the caretaker's grey-clip classifier had her 0 of 3,
            // taken for Ferni, Peter and Jordan): a breath of 3.3 s with her tempo,
            // between Peter's 2.9 and Ferni's 4.2, and a side-to-side sway where
            // everyone else bobs.
            a.nod = 1.2; a.breathPeriod = 3.5 / 4; a.drift = .sway
            a.eyeSpacing = 0.33; a.eyeSize = SIMD2(1.08, 1.08); a.bodyHeight = 1.04
        case .peter:   // the Quant, "wait wait wait!": scanning, sharp, solid
            a.blinkFloor = 3.5...6; a.doubleBlinks = 0.25; a.saccadeEvery = 0.7...1.8; a.saccadeRange = SIMD2(0.12, 0.08)
            a.bigJumps = 0.2; a.nod = 0.9; a.breathPeriod = 3.4 / 4
            a.eyeSpacing = 0.32; a.eyeSize = SIMD2(0.92, 0.92); a.bodyHeight = 0.96
        case .jordan:  // contagious, celebratory: wide, bouncy, tall
            a.blinkFloor = 3...5; a.doubleBlinks = 0.3; a.saccadeEvery = 1.0...2.4; a.saccadeRange = SIMD2(0.28, 0.18)
            a.nod = 1.35; a.breathPeriod = 2.8 / 4
            a.eyeSpacing = 0.39; a.eyeSize = SIMD2(1.12, 1.12); a.bodyHeight = 1.06
        case .alex:    // calm and crisp chief of staff: few moves, fast and decisive
            a.blinkFloor = 5...8; a.doubleBlinks = 0; a.saccadeEvery = 1.8...4.0; a.saccadeRange = SIMD2(0.12, 0.08)
            a.eyeStiffness = 900; a.eyeDamping = 60; a.nod = 0.7; a.breathPeriod = 4.8 / 4
            a.eyeSize = SIMD2(0.95, 0.92); a.bodyHeight = 0.97
        case .nayan:   // the long view: few moves, slow and deep
            a.blinkFloor = 6...10; a.blinkLength = 1.6; a.doubleBlinks = 0; a.saccadeEvery = 2.5...5.5
            a.saccadeRange = SIMD2(0.1, 0.08); a.eyeStiffness = 260; a.eyeDamping = 30; a.nod = 0.8
            a.breathPeriod = 6.0 / 4; a.breathDepth = 1.3
            a.eyeSpacing = 0.38; a.eyeSize = SIMD2(0.95, 0.95); a.bodyHeight = 0.95; a.lidDrop = 0.05
        }
        return a
    }

    /// The breath's period at rest, in seconds, for a face whose own breath is
    /// `base` seconds (4 for the neutral faces), at the persona's tempo.
    static func restBreath(_ persona: WindowPersona, on: Bool, base: Double = 4) -> Double {
        base * resolved(persona, on: on).breathPeriod * (AliveRig.tempo[persona] ?? 1)
    }

    /// The flag (UserDefaults; `-ferni.avatar.personaActing YES` at launch turns it on).
    public static let flagKey = "ferni.avatar.personaActing"

    /// How a persona acts with the flag `on` or off.
    static func resolved(_ persona: WindowPersona, on: Bool) -> PersonaActing { on ? of(persona) : shared }
}

/// The body's slow drift at rest, one unhurried cycle about every 6 s
/// (1.05 rad/s). `bob` and `sway` are on-screen amplitudes (orb positions,
/// as `posY` is); `lift` raises the body at each end of a sway, as a
/// pendulum rises, so it never reads as a slide.
public struct Drift: Equatable, Sendable {
    var bob: Double, sway: Double, lift: Double

    /// Up and down: everyone, before the spec.
    static let bob = Drift(bob: 0.03, sway: 0, lift: 0)
    /// Side to side, with a little lift: Maya. Gentle: its fastest is under
    /// the rig's settled speed (`AliveRig.settledSpeed`), so the frame rate
    /// still counts her as at rest.
    static let sway = Drift(bob: 0, sway: 0.024, lift: 0.008)

    enum Axis: Equatable { case vertical, sideways }
    var axis: Axis { sway > bob ? .sideways : .vertical }

    /// The drift's offset at time `t` (seconds): x and y, on screen.
    func offset(at t: Double) -> SIMD2<Double> {
        let w = t * Self.rate
        return SIMD2(sway * sin(w), bob * sin(w) + lift * (1 - cos(2 * w)) / 2)
    }

    /// Radians a second: one cycle about every 6 s.
    static let rate = 1.05
}

/// A persona's shape within the round family (persona acting SPEC): eye
/// spacing, eye size, body height and how much lower the top lids rest.
struct PersonaShape: Equatable, Sendable {
    var eyeSpacing: Double, eyeSize: SIMD2<Double>, bodyHeight: Double, lidDrop: Double

    init(_ a: PersonaActing) {
        (eyeSpacing, eyeSize, bodyHeight, lidDrop) = (a.eyeSpacing, a.eyeSize, a.bodyHeight, a.lidDrop)
    }

    /// Moves toward `target`, most of the way in about half a second; there
    /// once under a tenth of a pixel away (so the shared shape is exactly the
    /// shared shape again).
    mutating func ease(toward target: PersonaShape, dt: Double) {
        guard self != target else { return }
        let k = dt.isFinite ? min(1, dt * 6) : 1
        eyeSpacing += (target.eyeSpacing - eyeSpacing) * k
        eyeSize += (target.eyeSize - eyeSize) * k
        bodyHeight += (target.bodyHeight - bodyHeight) * k
        lidDrop += (target.lidDrop - lidDrop) * k
        let far = abs(target.eyeSpacing - eyeSpacing) + simd_reduce_add(abs(target.eyeSize - eyeSize))
            + abs(target.bodyHeight - bodyHeight) + abs(target.lidDrop - lidDrop)
        if far < 2e-3 { self = target }
    }
}
