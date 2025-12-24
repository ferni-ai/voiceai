import Foundation
import ActivityKit
import Combine

#if os(iOS)

// MARK: - Ferni Live Activity Manager
/// Manages the lifecycle of Ferni's Dynamic Island Live Activity.
///
/// Usage:
/// 1. Call `startActivity()` when voice call connects
/// 2. Call `updateActivity()` periodically with new state
/// 3. Call `endActivity()` when call disconnects
///
/// The manager handles:
/// - Starting/stopping Live Activities
/// - Duration tracking via internal timer
/// - State updates from session events
/// - Graceful degradation on unsupported devices

@available(iOS 16.2, *)
public class FerniLiveActivityManager: ObservableObject {

    // MARK: - Singleton

    public static let shared = FerniLiveActivityManager()

    // MARK: - State

    /// Current active Live Activity
    private var currentActivity: Activity<FerniActivityAttributes>?

    /// Duration timer
    private var durationTimer: Timer?
    private var callStartTime: Date?

    /// Current content state
    @Published public private(set) var currentState: FerniActivityAttributes.ContentState?

    /// Whether Live Activities are supported
    public var isSupported: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    // MARK: - Initialization

    private init() {}

    // MARK: - Start Activity

    /// Starts a new Live Activity for a voice call
    public func startActivity(
        personaId: String,
        personaName: String,
        personaColorHex: String,
        sessionId: String,
        userName: String? = nil
    ) {
        // End any existing activity first
        endActivity(reason: .replaced)

        guard isSupported else {
            print("FerniLiveActivity: Live Activities not supported")
            return
        }

        let attributes = FerniActivityAttributes(
            personaId: personaId,
            personaName: personaName,
            personaColorHex: personaColorHex,
            sessionId: sessionId,
            userName: userName
        )

        let initialState = FerniActivityAttributes.ContentState(
            status: .connecting,
            durationSeconds: 0,
            isMuted: false,
            speakingState: .idle,
            emotionalTone: .neutral,
            showingConcern: false
        )

        do {
            let activity = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: initialState, staleDate: nil),
                pushType: nil  // We update locally, not via push
            )
            currentActivity = activity
            currentState = initialState
            print("FerniLiveActivity: Started activity \(activity.id)")
        } catch {
            print("FerniLiveActivity: Failed to start - \(error)")
        }
    }

    // MARK: - Connection Events

    /// Called when the call successfully connects
    public func onConnected() {
        callStartTime = Date()
        startDurationTimer()

        updateActivity { state in
            state.status = .connected
            state.durationSeconds = 0
        }
    }

    /// Called when the call is reconnecting
    public func onReconnecting() {
        updateActivity { state in
            state.status = .reconnecting
        }
    }

    // MARK: - Speaking State Updates

    /// Update who is currently speaking
    public func updateSpeakingState(_ state: SpeakingState) {
        updateActivity { contentState in
            contentState.speakingState = state
        }
    }

    /// Update with new transcript snippet
    public func updateTranscript(_ snippet: String) {
        // Truncate to ~50 chars for Dynamic Island display
        let truncated = snippet.count > 50
            ? String(snippet.prefix(47)) + "..."
            : snippet

        updateActivity { state in
            state.transcriptSnippet = truncated
        }
    }

    // MARK: - Mute Toggle

    public func updateMuteState(_ isMuted: Bool) {
        updateActivity { state in
            state.isMuted = isMuted
        }
    }

    // MARK: - Better Than Human State

    /// Update emotional tone (for subtle UI hints)
    public func updateEmotionalTone(_ tone: EmotionalTone) {
        updateActivity { state in
            state.emotionalTone = tone
        }
    }

    /// Show concern indicator
    public func showConcern() {
        updateActivity { state in
            state.showingConcern = true
        }

        // Auto-hide after 3 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
            self?.updateActivity { state in
                state.showingConcern = false
            }
        }
    }

    // MARK: - Handoff

    /// Update for persona handoff
    public func onHandoffStarted(toPersona personaName: String) {
        updateActivity { state in
            state.status = .handoff
            state.transcriptSnippet = "Connecting you to \(personaName)..."
        }
    }

    /// Update when handoff completes
    public func onHandoffComplete() {
        updateActivity { state in
            state.status = .connected
            state.transcriptSnippet = nil
        }
    }

    // MARK: - End Activity

    public enum EndReason {
        case userEnded
        case disconnected
        case error
        case replaced
    }

    /// Ends the current Live Activity
    public func endActivity(reason: EndReason = .userEnded) {
        stopDurationTimer()
        callStartTime = nil

        guard let activity = currentActivity else { return }

        // Final state
        var finalState = currentState ?? FerniActivityAttributes.ContentState()
        finalState.status = .ended
        finalState.speakingState = .idle

        // Dismissal policy based on reason
        let dismissalPolicy: ActivityUIDismissalPolicy = reason == .userEnded
            ? .immediate
            : .default  // Shows "Call ended" briefly

        Task {
            await activity.end(
                ActivityContent(state: finalState, staleDate: nil),
                dismissalPolicy: dismissalPolicy
            )
            await MainActor.run {
                self.currentActivity = nil
                self.currentState = nil
            }
            print("FerniLiveActivity: Ended activity (\(reason))")
        }
    }

    // MARK: - Internal Update

    private func updateActivity(_ transform: (inout FerniActivityAttributes.ContentState) -> Void) {
        guard var state = currentState else { return }
        transform(&state)
        currentState = state

        guard let activity = currentActivity else { return }

        Task {
            await activity.update(
                ActivityContent(state: state, staleDate: nil)
            )
        }
    }

    // MARK: - Duration Timer

    private func startDurationTimer() {
        stopDurationTimer()

        durationTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self = self,
                  let startTime = self.callStartTime else { return }

            let duration = Int(Date().timeIntervalSince(startTime))

            self.updateActivity { state in
                state.durationSeconds = duration
            }
        }
    }

    private func stopDurationTimer() {
        durationTimer?.invalidate()
        durationTimer = nil
    }
}

// MARK: - Convenience Extensions

@available(iOS 16.2, *)
public extension FerniLiveActivityManager {

    /// Quick start from a Persona
    func startActivity(for persona: Persona, sessionId: String, userName: String? = nil) {
        // Remove the # prefix from primaryHex for storage
        let colorHex = persona.primaryHex.hasPrefix("#")
            ? String(persona.primaryHex.dropFirst())
            : persona.primaryHex

        startActivity(
            personaId: persona.id,
            personaName: persona.name,
            personaColorHex: colorHex,
            sessionId: sessionId,
            userName: userName
        )
    }
}

#endif
