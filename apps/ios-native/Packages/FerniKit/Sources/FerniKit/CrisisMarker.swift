import Foundation

/// A crisis during a call (#2868 item 38): the server's `concernLevel: "crisis"`
/// signal (CallSession), and 988 opened during the call (`isCrisisLine`; hooked up
/// with the final crisis call screen after the landing train). Such a call is never
/// a "good call", and the check-in ask stays away until a later good call without one.
@MainActor
public enum CrisisMarker {
    /// Set during the current call; read and cleared as the call ends.
    public private(set) static var thisCall = false

    public static func mark() {
        thisCall = true
        CheckInAsk.afterCrisis.withLock { $0 = true }
    }

    /// Forgets any mark (tests). It's in memory only, so the app's end forgets it too.
    public static func reset() {
        thisCall = false
        CheckInAsk.afterCrisis.withLock { $0 = false }
    }

    /// Whether this call had a crisis, cleared for the next one. A call that
    /// fails never gets here, so its mark carries to the next call: that one
    /// isn't counted either, which errs toward not asking.
    public static func endCall() -> Bool {
        defer { thisCall = false }
        return thisCall
    }

    /// The server's crisis signal (the same message ExpressionEventMapper reads).
    public static func isCrisisSignal(_ json: [String: Any]) -> Bool {
        json["type"] as? String == "humanization_signal" && json["concernLevel"] as? String == "crisis"
    }

    /// tel:988 or sms:988, the Suicide & Crisis Lifeline.
    public static func isCrisisLine(_ url: URL) -> Bool {
        ["tel", "sms"].contains(url.scheme?.lowercased() ?? "") && url.absoluteString.hasSuffix(":988")
    }
}
