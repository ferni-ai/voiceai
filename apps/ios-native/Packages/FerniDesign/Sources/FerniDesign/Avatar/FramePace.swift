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
/// - At a turn's end the top rate holds `speechHold` after he stops speaking,
///   or until he settles, whichever is later: the rate doesn't step down at
///   the moment the face changes to listening.
enum FramePace {
    static let fastest = 120, inCallFloor = 60, rest = 30, throttledCap = 60
    static let speechHold = 1.5

    /// Frames a second for this moment. `sinceSpeechEnd`: seconds since he
    /// last stopped speaking (nil if he hasn't this call).
    static func rate(inCall: Bool, speaking: Bool, fastMotion: Bool, settled: Bool, lowPower: Bool,
                     sinceSpeechEnd: Double? = nil) -> Int {
        let cap = lowPower ? throttledCap : fastest
        let justSpoke = sinceSpeechEnd.map { $0 < speechHold } ?? false
        if speaking || justSpoke || fastMotion || !settled { return cap }
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
