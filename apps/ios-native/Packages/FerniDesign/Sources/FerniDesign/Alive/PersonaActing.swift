import Foundation

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
    /// Eye spacing (body radii from the middle), eye size (x, y), body height
    /// (1 round, more taller), and how much lower the top lids rest.
    var eyeSpacing: Double, eyeSize: SIMD2<Double>, bodyHeight: Double, lidDrop: Double

    /// Everyone, before the spec (and with the flag off).
    static let shared = PersonaActing(
        blinkFloor: BlinkTiming.floor, blinkLength: 1, doubleBlinks: 0.16,
        saccadeEvery: 1.1...3.4, saccadeRange: SIMD2(0.2, 0.14), bigJumps: 0, eyeStiffness: 650, eyeDamping: 46,
        nod: 1, breathPeriod: 1, breathDepth: 1,
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
            a.nod = 1.2; a.breathPeriod = 3.2 / 4
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

    /// The flag (UserDefaults; `-ferni.avatar.personaActing YES` at launch turns it on).
    public static let flagKey = "ferni.avatar.personaActing"

    /// How a persona acts with the flag `on` or off.
    static func resolved(_ persona: WindowPersona, on: Bool) -> PersonaActing { on ? of(persona) : shared }
}
