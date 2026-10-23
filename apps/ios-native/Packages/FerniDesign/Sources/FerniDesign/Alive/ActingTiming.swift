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

    /// A friend nods smaller when you're telling them something hard: the
    /// families of a quiet, caring face (persona acting SPEC, decision 2).
    static let hushedFamilies: Set<String> = ["presence", "concern"]
    static let hushed = 0.5

    /// How big a nod is: the persona's own size, hushed under a caring face.
    /// With persona acting off, every nod is the shared one.
    static func gain(_ persona: WindowPersona, family: String, acting on: Bool) -> Double {
        guard on else { return 1 }
        return PersonaActing.of(persona).nod * (hushedFamilies.contains(family) ? hushed : 1)
    }

    /// The good news Maya nods "yes, yes!" to: the small win's own signals
    /// (high_engagement brings both; decision 3, no new signal).
    enum GoodNews { case delight, smallWin }
    static let smallWinMoment = "celebration_small"
    /// Her double nod's two beats, seconds apart, and how soon another may come.
    static let doubleNodGap = 0.22, doubleNodRest = 1.0

    /// Whether good news brings Maya's double nod.
    static func doubleNod(_ persona: WindowPersona, acting on: Bool, news: GoodNews?) -> Bool {
        on && persona == .maya && news != nil
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

/// Where each persona looks while thinking, for how long, and when the eyes
/// come back (avatar red team 2026-10-22). Every persona looked up and to the
/// right for every think, held no longer for a long one, and came back
/// whenever the next random saccade fell.
enum ThinkingGaze {
    /// The spot each one looks to while thinking (gaze units: x right, y up).
    /// Ferni keeps his up-and-aside; the rest turn away their own way.
    static func spot(_ persona: WindowPersona) -> SIMD2<Double> {
        switch persona {
        case .ferni: SIMD2(0.5, 0.42)      // up and aside, curious
        case .maya: SIMD2(-0.45, 0.38)     // up the other way, a quick plan
        case .peter: SIMD2(-0.3, -0.32)    // down at the numbers
        case .jordan: SIMD2(0.05, 0.62)    // straight up and high, picturing it
        case .alex: SIMD2(-0.55, 0.05)     // level and aside, composing
        case .nayan: SIMD2(0.25, -0.4)     // down and inward, the long view
        }
    }

    /// He looks away this soon after he starts thinking.
    static let onset = 0.15
    /// A think this long is a tool call or a long search (no tool signal
    /// reaches the app): the look holds instead of wandering.
    static let longThink = 1.5

    /// How long each look holds while thinking.
    static func hold(thinkingFor: Double) -> ClosedRange<Double> {
        thinkingFor >= longThink ? 3.0...5.0 : 1.1...3.4
    }

    /// His voice counts as started over this level (0...1).
    static let voiceStarted: Float = 0.02
    /// After coming back he holds the caller's eyes this long.
    static let contactHold = 0.9

    /// The eyes come back to the caller as his first word comes: the turn
    /// turns to speaking, or his voice starts while still marked thinking.
    static func backToCaller(thinking: Bool, activity: AvatarActivity, voiceLevel: Float) -> Bool {
        thinking && (activity == .speaking || voiceLevel > voiceStarted)
    }
}

/// Each persona's idle quirk (persona acting SPEC): a small, characteristic
/// move at rest, every 10-20 s. At-rest charm only: never in a call (the
/// lead's decision 1; nods and blinks carry listening), never over anything
/// else he's doing, and not under Reduce Motion.
enum IdleQuirk {
    enum Kind: Equatable, Sendable {
        case humTilt      // Ferni: a two-step head tilt, like humming while he thinks
        case lift         // Maya: a little lift and settle, ready to go
        case eureka       // Peter: eyes widen for an instant
        case sway         // Jordan: a gentle side-to-side sway
        case checkList    // Alex: a glance down at the list, and back
        case sinkLids     // Nayan: lids sink halfway, then a tiny amused crease
    }

    static func kind(_ persona: WindowPersona) -> Kind {
        switch persona {
        case .ferni: .humTilt
        case .maya: .lift
        case .peter: .eureka
        case .jordan: .sway
        case .alex: .checkList
        case .nayan: .sinkLids
        }
    }

    /// Seconds between quirks.
    static let every = 10.0...20.0

    /// How long each plays.
    static func length(_ kind: Kind) -> Double {
        switch kind {
        case .humTilt: 0.9
        case .lift: 0.6
        case .eureka: 0.15
        case .sway: 1.4
        case .checkList: 0.7
        case .sinkLids: 1.6
        }
    }

    /// Whether a quirk starts now: persona acting on, at home, nothing else going on, and its time.
    static func due(now: Double, nextAt: Double, activity: AvatarActivity, acting on: Bool, busy: Bool) -> Bool {
        on && activity == .idle && !busy && now >= nextAt
    }
}
