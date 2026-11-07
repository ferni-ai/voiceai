import Foundation

/// Gets Ferni out of the way the moment the caller starts talking, the way a
/// person does, without stopping for a cough (IOS_LOCAL_DUCK, off by default).
///
/// Barge-in is otherwise the server's call: it hears the caller, then stops
/// Ferni. This answers first, on the phone. When the caller's voice (the mic
/// after echo cancellation) stays above the room's noise for `onset` while
/// Ferni is speaking, Ferni's playout drops by `duckDB` at once and the
/// existing `user_interrupt` goes to the agent, once. If the agent stops
/// speaking, the duck holds until its next turn. If it doesn't within
/// `confirmWindow` (a cough, a door, a word the server chose not to stop
/// for), the volume comes back over `restoreRamp` and the caller hears Ferni
/// carry on.
///
/// Pure: levels, the agent's state and the time come in, actions go out. It
/// never sees audio, only one loudness number per frame.
public struct LocalDuckController: Sendable {
    /// Every timing and level in one place.
    public struct Tuning: Sendable, Equatable {
        /// How long the voice must stay up. A cough or a clap is shorter;
        /// a word ("wait", "no") is longer.
        public var onset: Duration
        /// How far Ferni drops: well under the caller, still audible.
        public var duckDB: Float
        /// How long the agent gets to stop before the volume comes back.
        public var confirmWindow: Duration
        /// How long the volume takes to come back: a fade, not a jump.
        public var restoreRamp: Duration
        /// After Ferni starts a turn, echo cancellation is still settling and
        /// some of Ferni's voice reaches the mic; nothing counts until then.
        public var echoSettle: Duration
        /// How far above the room's noise counts as the caller talking.
        public var aboveFloorDB: Float
        /// Nothing quieter than this counts, however still the room is.
        public var minLevelDB: Float
        /// How fast the noise estimate climbs (it drops at once): a fan
        /// turned on is learned in seconds, a voice is not.
        public var floorRiseDBPerSecond: Float

        public static let standard = Tuning(
            onset: .milliseconds(150), duckDB: -18, confirmWindow: .milliseconds(600),
            restoreRamp: .milliseconds(120), echoSettle: .milliseconds(300),
            aboveFloorDB: 12, minLevelDB: -50, floorRiseDBPerSecond: 3
        )

        public init(onset: Duration, duckDB: Float, confirmWindow: Duration, restoreRamp: Duration,
                    echoSettle: Duration, aboveFloorDB: Float, minLevelDB: Float, floorRiseDBPerSecond: Float) {
            self.onset = onset
            self.duckDB = duckDB
            self.confirmWindow = confirmWindow
            self.restoreRamp = restoreRamp
            self.echoSettle = echoSettle
            self.aboveFloorDB = aboveFloorDB
            self.minLevelDB = minLevelDB
            self.floorRiseDBPerSecond = floorRiseDBPerSecond
        }
    }

    public enum Action: Equatable, Sendable {
        /// Drop Ferni's playout to this many dB, now.
        case duck(db: Float)
        /// Bring Ferni's playout back to full over this long (zero: at once).
        case restore(over: Duration)
        /// Send the call's existing interrupt.
        case sendInterrupt
    }

    enum State: Equatable, Sendable {
        case armed
        case ducked(since: ContinuousClock.Instant)
        /// The agent stopped: stay down until its next turn.
        case held
        /// Restored without a stop: a new onset needs the voice to drop first,
        /// so a caller the server chose not to stop doesn't pump Ferni's volume.
        case waitingForQuiet
    }

    public let tuning: Tuning
    private(set) var state = State.armed
    private var agentSpeaking = false
    private var speakingSince: ContinuousClock.Instant?
    private var loudSince: ContinuousClock.Instant?
    private var floorDB: Float?
    private var lastLevelAt: ContinuousClock.Instant?

    public init(tuning: Tuning = .standard) { self.tuning = tuning }

    /// Ferni started or stopped speaking (the agent's `lk.agent.state`).
    /// Stopping while ducked is the server's confirmation.
    public mutating func agentSpeaking(_ speaking: Bool, at now: ContinuousClock.Instant) -> [Action] {
        defer { agentSpeaking = speaking }
        guard speaking != agentSpeaking else { return [] }
        loudSince = nil
        if !speaking {
            if case .ducked = state { state = .held }
            return []
        }
        // A new turn starts at full volume, whatever the last one ended in.
        speakingSince = now
        let wasDown = state == .held || { if case .ducked = state { true } else { false } }()
        state = .armed
        return wasDown ? [.restore(over: .zero)] : []
    }

    /// One frame of the caller's mic, in dBFS, after echo cancellation.
    public mutating func level(_ db: Float, at now: ContinuousClock.Instant) -> [Action] {
        let loud = isLoud(db, at: now)
        guard agentSpeaking else { return [] }
        switch state {
        case .armed:
            if let since = speakingSince, now - since < tuning.echoSettle { loudSince = nil; return [] }
            guard loud else { loudSince = nil; return [] }
            let since = loudSince ?? now
            loudSince = since
            guard now - since >= tuning.onset else { return [] }
            state = .ducked(since: now)
            loudSince = nil
            return [.duck(db: tuning.duckDB), .sendInterrupt]
        case .ducked(let since):
            guard now - since >= tuning.confirmWindow else { return [] }
            state = .waitingForQuiet
            return [.restore(over: tuning.restoreRamp)]
        case .waitingForQuiet:
            if !loud { state = .armed }
            return []
        case .held:
            return []
        }
    }

    /// Whether this frame stands out from the room, and the room's noise
    /// estimate moved along: down at once, up slowly.
    private mutating func isLoud(_ db: Float, at now: ContinuousClock.Instant) -> Bool {
        let floor = floorDB ?? db
        let loud = db >= max(floor + tuning.aboveFloorDB, tuning.minLevelDB)
        let elapsed = lastLevelAt.map { Self.seconds(now - $0) } ?? 0
        floorDB = db < floor ? db : floor + min(db - floor, tuning.floorRiseDBPerSecond * elapsed)
        lastLevelAt = now
        return loud
    }

    static func seconds(_ d: Duration) -> Float {
        Float(d.components.seconds) + Float(d.components.attoseconds) / 1e18
    }
}

/// Whether the local duck is on: the `FerniLocalDuck` Info.plist key, set
/// from the `IOS_LOCAL_DUCK` build setting in project.yml (NO by default).
public enum LocalDuckFlag {
    public static let infoKey = "FerniLocalDuck"

    public static func isOn(_ info: [String: Any]? = Bundle.main.infoDictionary) -> Bool {
        (info?[infoKey] as? String) == "YES" || (info?[infoKey] as? Bool) == true
    }
}
