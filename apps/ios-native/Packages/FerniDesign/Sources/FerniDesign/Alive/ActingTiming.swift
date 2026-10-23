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

/// When he blinks: at changes of thought, the way people do (avatar red team
/// 2026-10-22). A blink comes as a turn changes hands and as one of Ferni's
/// phrases ends; a slow random floor keeps a long turn from staring. They
/// came every 3-7 s at random, unrelated to anything he said or heard.
enum BlinkTiming {
    /// The longest he goes without a blink: a random floor within this.
    static let floor = 4.0...8.0
    /// At least this long between blinks, however many cues come at once.
    static let minGap = 0.8
    /// A cued blink lands this soon after its change of thought.
    static let cueDelay = 0.05...0.2
    /// Share of phrase ends that bring a blink (every one reads as a tic).
    static let phraseShare = 0.7
    /// His voice envelope (0...1) counts as voiced over this, silent under
    /// that; a phrase is at least `phraseMin` seconds voiced.
    static let voiced = 0.35, silent = 0.1, phraseMin = 0.5

    /// Whether a blink starts now: a cue that has come due, or the floor.
    static func due(now: Double, lastBlink: Double, cue: Double?, floorAt: Double) -> Bool {
        guard now - lastBlink >= minGap else { return false }
        return (cue.map { now >= $0 } ?? false) || now >= floorAt
    }

    /// The turn changed hands: between listening, thinking and speaking.
    static func isTurnChange(from: AvatarActivity, to: AvatarActivity) -> Bool {
        let turns: Set<AvatarActivity> = [.listening, .thinking, .speaking]
        return from != to && turns.contains(from) && turns.contains(to)
    }

    /// Follows his voice envelope through a phrase: whether one just ended,
    /// and when the voicing in progress began (nil when silent).
    static func phrase(env: Double, voicedSince: Double?, now: Double) -> (ended: Bool, voicedSince: Double?) {
        if env > voiced { return (false, voicedSince ?? now) }
        if env < silent, let since = voicedSince { return (now - since >= phraseMin, nil) }
        return (false, voicedSince)
    }
}
