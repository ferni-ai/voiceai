import FerniKit
import FerniLink
import FerniVoice
import WatchConnectivity

/// The Apple Watch as a remote for the call on this phone: Talk, Mute and End
/// arrive as commands, and the call's state goes back to the watch. The watch
/// never carries the call itself, and never sees what's said.
@MainActor
final class WatchRemote: NSObject {
    private weak var model: AppModel?

    init(model: AppModel) {
        self.model = model
        super.init()
    }

    func start() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// Tell the watch what the call is doing now.
    func publish(_ state: RemoteState) {
        let session = WCSession.default
        guard WCSession.isSupported(), session.activationState == .activated,
              session.isPaired, session.isWatchAppInstalled else { return }
        try? session.updateApplicationContext(state.context)
    }

    /// A command from the wrist, through the same doors as the phone's buttons:
    /// Talk asks for consent first, Mute only while live, End always.
    static func handle(_ command: RemoteCommand, model: AppModel) {
        let call = model.call
        switch command {
        case .talk:
            if !call.isActive { model.talk(to: model.team.chosen) }
        case .mute:
            if call.phase == .live { Task { await call.toggleMute() } }
        case .end:
            if call.isActive { Task { await call.end() } }
        }
    }
}

extension WatchRemote: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: (any Error)?) {
        Task { @MainActor in if let model = self.model { self.publish(model.remoteState) } }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate() // a different watch was paired
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        guard let command = RemoteCommand(message: message) else { return }
        Task { @MainActor in if let model = self.model { Self.handle(command, model: model) } }
    }
}

extension AppModel {
    /// The call as the watch shows it.
    var remoteState: RemoteState {
        let phase: RemoteState.Phase = switch call.phase {
        case .connecting, .waitingForFerni, .reconnecting: .connecting
        case .live: call.isOnHold ? .onHold : .live
        case .ended, .failed: .ended
        case .idle: .idle
        }
        return RemoteState(phase: phase, muted: call.isMuted, name: PersonaRegistry.get(call.avatar.personaID).name)
    }
}
