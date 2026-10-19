import FerniDesign
import Foundation

/// What Ferni's face is doing, highest priority first:
/// error > reconnecting > handoff > arriving > departing > speaking > thinking > listening > idle.
public enum AvatarPose: Equatable, Sendable {
    case idle, arriving, listening, thinking, speaking
    case handoffArriving(to: String)
    case reconnecting, error, departing
}

/// Everything about a call the avatar reacts to (ios-motion-spec §6.1).
public enum CallEvent: Equatable, Sendable {
    /// A call to `personaID` (the teammate the person chose).
    case connectTapped(personaID: String)
    case agentJoined
    case agentState(AgentSignals.AgentActivity)
    case expression(AvatarExpression, hold: Duration?)
    case handoffStarted(to: String)
    case handoffCompleted(to: String, name: String)
    case handoffFailed
    case reconnecting, reconnected
    case failed
    case ended
}

/// Feedback a pose change asks for; the model plays it, views never do (one per event at most).
public enum AvatarEffect: Equatable, Sendable {
    case haptic(HapticCue)
    /// Played only if the sound director allows it (EarconDirector).
    case earcon(Earcon)
    case announce(String)
}


/// The avatar's state machine, pure and clocked by the caller so tests control
/// time. Turn poses settle for 150 ms (400 ms under Reduce Motion) so a quick
/// speaking→listening→speaking flicker never shows; the first turn of a call
/// shows at once. Expressions hold 2.5 s by default, then the turn face returns.
public struct AvatarDirector: Equatable, Sendable {
    public typealias Instant = Duration // time since the model started

    enum Turn: Equatable, Sendable { case idle, listening, thinking, speaking }
    enum Connection: Equatable, Sendable { case none, arriving, reconnecting, error, departing }

    public var reduceMotion = false
    public private(set) var personaID = "ferni"
    private(set) var turn = Turn.idle
    private var pendingTurn: (turn: Turn, at: Instant)?
    private var connection = Connection.none
    private var reconnectingShowsAt: Instant?
    private var departingUntil: Instant?
    private var handoffTo: String?
    private var expressionOverride: (face: AvatarExpression, until: Instant)?
    private var firstTurnSeen = false
    private var firstWordPlayed = false
    private var presencePlayed = false

    public init() {}

    static let settle = Duration.milliseconds(150)
    static let settleReducedMotion = Duration.milliseconds(400)
    static let defaultHold = Duration.seconds(2.5)
    static let reconnectingDelay = Duration.seconds(1)
    static let departing = Duration.milliseconds(1500)

    public var pose: AvatarPose {
        switch connection {
        case .error: return .error
        case .reconnecting where reconnectingShowsAt == nil: return .reconnecting
        default: break
        }
        if let handoffTo { return .handoffArriving(to: handoffTo) }
        if connection == .arriving { return .arriving }
        if connection == .departing { return .departing }
        switch turn {
        case .idle: return .idle
        case .listening: return .listening
        case .thinking: return .thinking
        case .speaking: return .speaking
        }
    }

    public var expression: AvatarExpression {
        if let expressionOverride { return expressionOverride.face }
        switch pose {
        case .idle, .departing: return .neutral
        case .arriving, .listening, .handoffArriving: return .listening
        case .thinking: return .thinking
        case .speaking: return .speaking
        case .reconnecting: return .sleepy
        case .error: return .concerned
        }
    }

    public var isSpeaking: Bool { pose == .speaking }

    /// When `tick` next has something to do, if anything.
    public var nextDeadline: Instant? {
        [pendingTurn?.at, expressionOverride?.until, reconnectingShowsAt, departingUntil]
            .compactMap { $0 }.min()
    }

    public mutating func send(_ event: CallEvent, now: Instant) -> [AvatarEffect] {
        var effects = tick(now: now)
        switch event {
        case .connectTapped(let chosen):
            self = AvatarDirector(reduceMotion: reduceMotion, personaID: chosen)
            connection = .arriving
        case .agentJoined:
            if connection == .arriving { connection = .none }
            if !presencePlayed {
                presencePlayed = true
                // Ferni's body plays the join and asks for the note and the tap on
                // its landing (AvatarView, KeyedMoment.join). Under Reduce Motion
                // there's no keyed join, so they play here.
                if reduceMotion { effects += [.haptic(.presence), .earcon(.arrival)] }
            }
        case .agentState(let activity):
            effects += setTurn(Self.turn(for: activity), now: now)
        case .expression(let face, let hold):
            expressionOverride = (face, now + (hold ?? Self.defaultHold))
        case .handoffStarted(let to):
            handoffTo = to
        case .handoffCompleted(let to, let name):
            handoffTo = nil
            personaID = to
            firstWordPlayed = false
            effects += [.haptic(.handoff), .earcon(.handoff(to: to)), .announce("\(name) joined.")]
        case .handoffFailed:
            handoffTo = nil
            expressionOverride = (.concerned, now + .milliseconds(1500))
        case .reconnecting:
            connection = .reconnecting
            reconnectingShowsAt = now + Self.reconnectingDelay // blips don't flash
        case .reconnected:
            if connection == .reconnecting {
                let wasShown = reconnectingShowsAt == nil
                connection = .none
                reconnectingShowsAt = nil
                if wasShown { effects.append(.haptic(.reconnected)) }
            }
        case .failed:
            connection = .error
            pendingTurn = nil
            effects.append(.haptic(.error))
        case .ended:
            let wasInCall = presencePlayed
            connection = .departing
            departingUntil = now + Self.departing
            turn = .idle
            pendingTurn = nil
            handoffTo = nil
            if wasInCall { effects += [.haptic(.goodbye), .earcon(.goodbye)] }
        }
        return effects
    }

    /// Applies whatever came due by `now`: a settled turn, an expired
    /// expression, a reconnect that lasted long enough to show, the end of departing.
    public mutating func tick(now: Instant) -> [AvatarEffect] {
        var effects: [AvatarEffect] = []
        if let pending = pendingTurn, pending.at <= now {
            pendingTurn = nil
            effects += show(pending.turn)
        }
        if let until = expressionOverride?.until, until <= now { expressionOverride = nil }
        if let at = reconnectingShowsAt, at <= now { reconnectingShowsAt = nil }
        if let until = departingUntil, until <= now {
            departingUntil = nil
            if connection == .departing { connection = .none }
        }
        return effects
    }

    private mutating func setTurn(_ next: Turn, now: Instant) -> [AvatarEffect] {
        if !firstTurnSeen {
            firstTurnSeen = true
            pendingTurn = nil
            return show(next)
        }
        if next == turn {
            pendingTurn = nil // flickered back before it settled
            return []
        }
        if pendingTurn?.turn != next {
            pendingTurn = (next, now + (reduceMotion ? Self.settleReducedMotion : Self.settle))
        }
        return []
    }

    private mutating func show(_ next: Turn) -> [AvatarEffect] {
        turn = next
        guard next == .speaking, !firstWordPlayed, connection != .error else { return [] }
        firstWordPlayed = true
        return [.haptic(.firstWord)]
    }

    private static func turn(for activity: AgentSignals.AgentActivity) -> Turn {
        switch activity {
        case .speaking: .speaking
        case .thinking: .thinking
        case .listening, .idle, .initializing: .listening
        }
    }

    private init(reduceMotion: Bool, personaID: String) {
        self.reduceMotion = reduceMotion
        self.personaID = personaID
    }

    public static func == (lhs: AvatarDirector, rhs: AvatarDirector) -> Bool {
        lhs.pose == rhs.pose && lhs.expression == rhs.expression && lhs.personaID == rhs.personaID
            && lhs.nextDeadline == rhs.nextDeadline
    }
}
