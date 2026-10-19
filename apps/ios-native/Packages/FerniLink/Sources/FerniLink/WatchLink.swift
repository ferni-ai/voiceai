import Foundation

/// What the watch asks the phone to do.
public enum RemoteCommand: String, Sendable, CaseIterable {
    /// Start a call with whoever answers next (through the phone's consent).
    case talk
    case mute
    case end

    static let key = "command"

    public var message: [String: Any] { [Self.key: rawValue] }

    /// The command in a WatchConnectivity message; nil for anything else.
    public init?(message: [String: Any]) {
        guard let raw = message[Self.key] as? String, let command = RemoteCommand(rawValue: raw) else { return nil }
        self = command
    }
}

/// The call as the watch shows it, published by the phone (application context).
/// Only who's on and what's happening: never captions or anything said.
public struct RemoteState: Equatable, Sendable {
    public enum Phase: String, Sendable { case idle, connecting, live, onHold, ended }

    public var phase: Phase
    public var muted: Bool
    /// The teammate's first name ("Ferni").
    public var name: String

    public init(phase: Phase = .idle, muted: Bool = false, name: String = "Ferni") {
        self.phase = phase
        self.muted = muted
        self.name = name
    }

    public var inCall: Bool { phase == .connecting || phase == .live || phase == .onHold }

    public var context: [String: Any] { ["phase": phase.rawValue, "muted": muted, "name": name] }

    /// From the phone's application context; idle for anything unreadable.
    public init(context: [String: Any]) {
        phase = (context["phase"] as? String).flatMap(Phase.init(rawValue:)) ?? .idle
        muted = context["muted"] as? Bool ?? false
        let name = (context["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.name = name.isEmpty ? "Ferni" : String(name.prefix(24))
    }
}
