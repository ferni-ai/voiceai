import Foundation

/// When a listener nods: in the caller's pauses, not on a clock (avatar red
/// team 2026-10-22). Listeners backchannel a beat into a pause, 200-600 ms
/// after the speaker stops, never over a word; a nod every 1.6-3 s regardless
/// read as a metronome and landed mid-word.
enum NodTiming {
    /// How far into a pause the nod comes (each pause draws its own).
    static let delay = 0.2...0.6
    /// Past this into a pause a missed nod is dropped: late, it reads as random.
    static let latest = 0.8
    /// At least this long between nods, however choppy the voice detection.
    static let minGap = 1.2

    /// Whether to nod now. `pauseStart`: when the caller's current pause
    /// began (nil while they speak, or before they first have); `delay`:
    /// this pause's own delay; `nodded`: already nodded in this pause.
    static func due(now: Double, personSpeaking: Bool, pauseStart: Double?, delay: Double, nodded: Bool, lastNod: Double) -> Bool {
        guard !personSpeaking, !nodded, let start = pauseStart else { return false }
        let into = now - start
        return into >= delay && into <= latest && now - lastNod >= minGap
    }
}
