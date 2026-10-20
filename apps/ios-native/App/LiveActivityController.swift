@preconcurrency import ActivityKit
import FerniDesign
import FerniKit
import FerniVoice
import Foundation

/// Keeps the call's Live Activity in step with the call: started when the
/// call connects, updated on state changes no more than once a second (the
/// latest state wins), ended with the call and dismissed five seconds later.
@MainActor
final class LiveActivityController {
    private var activity: Activity<CallActivityAttributes>?
    private var lastSent: Date = .distantPast
    private var pending: Task<Void, Never>?
    private var latest: CallActivityAttributes.ContentState?

    /// What the activity should show for the call right now; nil when there's no call.
    static func content(for call: CallSession) -> CallActivityAttributes.ContentState? {
        content(phase: call.phase, onHold: call.isOnHold, pose: call.avatar.pose, personaID: call.avatar.personaID, muted: call.isMuted)
    }

    static func content(
        phase: CallSession.Phase, onHold: Bool, pose: AvatarPose, personaID: String, muted: Bool = false
    ) -> CallActivityAttributes.ContentState? {
        let state: CallActivityState
        switch phase {
        case .connecting: state = .calling
        case .waitingForFerni: state = .arriving
        // Ferni never came: say so on the Lock Screen too, then end there.
        case .failed(.ferniDidNotJoin): state = .couldNotJoin
        case .reconnecting: state = .reconnecting
        case .live:
            if onHold { state = .onHold } else {
                switch pose {
                case .speaking: state = .speaking
                case .thinking: state = .thinking
                default: state = .listening
                }
            }
        default: return nil
        }
        return .init(state: state, personaID: personaID, personaName: PersonaRegistry.get(personaID).name, muted: muted)
    }

    /// What the activity shows once the call is over: a short goodbye from the
    /// same person, with nothing to press (gap 6).
    static func final(after latest: CallActivityAttributes.ContentState) -> CallActivityAttributes.ContentState {
        latest.state == .couldNotJoin ? latest : .init(state: .ended, personaID: latest.personaID, personaName: latest.personaName)
    }

    func follow(_ content: CallActivityAttributes.ContentState?, startedAt: Date?) {
        guard let content else { return end() }
        latest = content
        // The call's last word: shown as the activity ends (and goes 4 s later).
        if !content.state.hasControls { return end() }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        if activity == nil {
            activity = try? Activity.request(
                attributes: CallActivityAttributes(startedAt: startedAt ?? .now),
                content: ActivityContent(state: content, staleDate: nil)
            )
            lastSent = .now
            return
        }
        scheduleUpdate()
    }

    private func scheduleUpdate() {
        guard pending == nil else { return } // the pending update sends the latest state
        let wait = max(0, 1 - Date.now.timeIntervalSince(lastSent))
        pending = Task { [weak self] in
            try? await Task.sleep(for: .seconds(wait))
            guard let self, !Task.isCancelled, let activity = self.activity, let latest = self.latest else { return }
            await activity.update(ActivityContent(state: latest, staleDate: nil))
            self.lastSent = .now
            self.pending = nil
        }
    }

    private func end() {
        pending?.cancel()
        pending = nil
        guard let activity else { return }
        self.activity = nil
        let final = latest.map { ActivityContent(state: Self.final(after: $0), staleDate: nil) }
        Task { await activity.end(final, dismissalPolicy: .after(.now + 4)) }
    }
}
