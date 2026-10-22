import Foundation

/// How often Ferni draws (avatar red team 2026-10-22: the springs were good,
/// the rate policy wasn't). At the old 30 fps whenever he wasn't speaking,
/// blinks (45-80 ms), micro-expressions, nods, saccades and the keyed moments
/// (keyed at 60 fps) lost frames, and a blink's closed frame was often
/// skipped, a flicker.
///
/// - Speaking, something quick in flight, or a spring still moving: the
///   display's best (120 Hz on ProMotion).
/// - In a call and at rest: never below 60.
/// - At home and at rest: 30.
/// - Low Power Mode or a hot device: at most 60.
enum FramePace {
    static let fastest = 120, inCallFloor = 60, rest = 30, throttledCap = 60

    /// Frames a second for this moment.
    static func rate(inCall: Bool, speaking: Bool, fastMotion: Bool, settled: Bool, lowPower: Bool) -> Int {
        let cap = lowPower ? throttledCap : fastest
        if speaking || fastMotion || !settled { return cap }
        return min(cap, inCall ? inCallFloor : rest)
    }

    /// The TimelineView's minimum interval for a rate: nil (the display's own
    /// rate) at the top, otherwise a little under the period so a frame that
    /// arrives a hair early isn't held a whole refresh longer.
    static func interval(for hz: Int) -> Double? {
        hz >= fastest ? nil : 0.9 / Double(hz)
    }

    /// Whether Ferni is in a call (anything but at home or the error screen).
    static func inCall(_ activity: AvatarActivity) -> Bool {
        activity != .idle && activity != .error
    }
}
