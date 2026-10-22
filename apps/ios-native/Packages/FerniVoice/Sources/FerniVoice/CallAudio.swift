import Foundation

/// The phone's audio for a call, behind a protocol so the session is testable.
/// `SystemCallAudio` is the real one.
public protocol CallAudio: Sendable {
    /// Asks once; later calls return the saved answer.
    func requestMicrophone() async -> Bool
    func activate() throws
    func deactivate()
    /// Phone calls, alarms, Siri: the system takes the audio and gives it back.
    var interruptions: AsyncStream<AudioInterruption> { get }
}

public enum AudioInterruption: Sendable, Equatable {
    case began
    case ended(shouldResume: Bool)
}
