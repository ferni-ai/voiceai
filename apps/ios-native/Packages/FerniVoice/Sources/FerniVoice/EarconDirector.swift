import Foundation

/// A short sound for a moment in the call (ios-motion-spec §6.9).
public enum Earcon: Equatable, Sendable {
    case arrival
    case handoff(to: String)
    case goodbye

    /// The bundled file (the web's own earcons, apps/web/public/sounds).
    public var fileName: String {
        switch self {
        case .arrival: "arrival"
        case .handoff(let to): "handoff-to-\(to)"
        case .goodbye: "goodbye"
        }
    }
}

/// When a sound may play (the web's sound-director rules): arrival once per
/// call and not again on a rejoin within two minutes, goodbye once, at most
/// four per call, 20 s apart, and never over anyone talking.
public struct EarconDirector: Sendable {
    public typealias Instant = Duration

    private var playedThisCall = 0
    private var lastPlayed: Instant?
    private var lastArrival: Instant?
    private var arrivalThisCall = false
    private var goodbyeThisCall = false

    public init() {}

    public mutating func newCall() {
        playedThisCall = 0
        lastPlayed = nil
        arrivalThisCall = false
        goodbyeThisCall = false
    }

    public mutating func allow(_ earcon: Earcon, now: Instant, agentSpeaking: Bool, userSpeaking: Bool) -> Bool {
        guard !agentSpeaking, !userSpeaking, playedThisCall < 4 else { return false }
        if let lastPlayed, now - lastPlayed < .seconds(20) { return false }
        switch earcon {
        case .arrival:
            if arrivalThisCall { return false }
            if let lastArrival, now - lastArrival < .seconds(120) { return false } // a rejoin
            arrivalThisCall = true
            lastArrival = now
        case .goodbye:
            if goodbyeThisCall { return false }
            goodbyeThisCall = true
        case .handoff:
            break
        }
        playedThisCall += 1
        lastPlayed = now
        return true
    }
}
