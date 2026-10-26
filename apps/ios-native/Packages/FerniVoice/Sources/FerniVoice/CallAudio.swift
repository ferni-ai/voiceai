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
    func deactivate(systemOwned: Bool)
    /// The system's call service activated or deactivated the session. The
    /// audio engine may only run in between (LiveKit's CallKit contract).
    func systemAudio(active: Bool)
    /// Phone calls, alarms, Siri: the system takes the audio and gives it back.
    var interruptions: AsyncStream<AudioInterruption> { get }
}

public enum AudioInterruption: Sendable, Equatable {
    case began
    case ended(shouldResume: Bool)
}
