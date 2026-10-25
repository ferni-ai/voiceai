import Foundation

/// The system's view of the call: the call UI and Lock Screen, AirPods mute,
/// the end button, and interruptions (design north star change 7). The app
/// tells it about the call; it tells the app what the person did outside it.
public protocol CallLifecycle: Sendable {
    var requests: AsyncStream<LifecycleRequest> { get }
    func begin(id: UUID, name: String) async throws
    func connected(id: UUID)
    func setMuted(id: UUID, muted: Bool) async
    func ended(id: UUID, failed: Bool) async
}

/// What the person asked for through the system (Lock Screen, AirPods, call UI).
public enum LifecycleRequest: Sendable, Equatable {
    case end
    case mute(Bool)
    /// The system activated (or took back) the call's audio session.
    case audio(active: Bool)
}
