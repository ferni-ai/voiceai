import Foundation

/// The phone's audio for a call, behind a protocol so the session is testable.
/// `SystemCallAudio` is the real one.
public protocol CallAudio: Sendable {
    /// Asks once; later calls return the saved answer.
    func requestMicrophone() async -> Bool
    /// Sets up the session, including haptics while recording; the session
    /// calls it before it turns the mic on. `systemOwned`: the system's call
    /// service (LiveCommunicationKit) activates the session for this call, so
    /// the app must not; the audio engine waits for `systemAudio(active:)`.
    func activate(systemOwned: Bool) throws
    /// A room was left: between the rooms of one call (a rejoin, a retry when
    /// Ferni didn't join) as well as at the end.
    func deactivate(systemOwned: Bool)
    /// The system's call service activated or deactivated the session. The
    /// audio engine may only run in between (LiveKit's CallKit contract).
    func systemAudio(active: Bool)
    /// The call is over (hung up, failed, or stepped aside for the waitlist):
    /// ready for the next one, which waits for the system again.
    func callEnded()
    /// The audio engine's state, for the call log after each join.
    var engineState: String { get }
    /// Phone calls, alarms, Siri: the system takes the audio and gives it back.
    var interruptions: AsyncStream<AudioInterruption> { get }
}

public extension CallAudio {
    func callEnded() {}
    var engineState: String { "-" }
}

public enum AudioInterruption: Sendable, Equatable {
    case began
    case ended(shouldResume: Bool)
}
