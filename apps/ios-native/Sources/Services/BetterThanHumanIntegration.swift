import SwiftUI
import Combine
import FerniShared

// MARK: - Better Than Human Integration
/// Integration layer that wires all "Better Than Human" iOS features to the app lifecycle.
///
/// This manager coordinates:
/// - Late Night Mode (automatic time-aware theming)
/// - Breath Sync Haptics (during voice calls)
/// - Celebration Particles (on achievements)
/// - Spatial Audio (for immersive voice)
/// - Voice Recognition Celebrations
///
/// Usage:
/// 1. Create once at app level: `@StateObject private var bthi = BetterThanHumanIntegration()`
/// 2. Inject as environment object: `.environmentObject(bthi)`
/// 3. Apply view modifier: `.betterThanHumanEnabled(bthi)`

public class BetterThanHumanIntegration: ObservableObject {

    // MARK: - Core Engine

    /// BetterThanHumanEngine for superhuman EQ (micro-expressions, active listening, etc.)
    public let engine = BetterThanHumanEngine()

    /// Current state for avatar/orb animations
    @Published public private(set) var betterThanHumanState: BetterThanHumanState

    // MARK: - Managers

    /// Late night mode for time-aware theming
    public let lateNightMode = LateNightModeManager.shared

    /// Breath-synchronized haptics for voice calls
    #if os(iOS)
    public let breathHaptics = BreathSyncHaptics()
    #endif

    /// Spatial audio for immersive voice positioning
    public let spatialAudio = SpatialAudioManager()

    /// Voice recognition celebration coordinator
    public let voiceRecognition = VoiceRecognitionCelebration()

    // MARK: - State

    /// Whether voice call is active (enables haptics, spatial audio)
    @Published public var isVoiceCallActive: Bool = false {
        didSet {
            handleVoiceCallStateChange()
        }
    }

    /// Current voice state (for lifecycle management)
    @Published public var voiceState: VoiceState = .disconnected {
        didSet {
            handleVoiceStateChange(from: oldValue, to: voiceState)
        }
    }

    /// Current audio level (0-1) for breath sync
    @Published public var audioLevel: Float = 0 {
        didSet {
            engine.audioLevel = audioLevel
            betterThanHumanState = engine.currentState
        }
    }

    /// Whether to show celebration particles
    @Published public var showCelebration: Bool = false

    /// Type of celebration to show
    @Published public var celebrationType: CelebrationType = .sparkles

    // MARK: - Private

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    public init() {
        // Initialize state from engine
        self.betterThanHumanState = engine.currentState
        setupBindings()
    }

    // MARK: - Setup

    private func setupBindings() {
        // LateNightModeManager.shared starts monitoring automatically in its init
        // Link voice recognition to BetterThanHumanEngine when available
        // This will be connected when the engine is injected
    }

    // MARK: - Voice State Lifecycle

    /// Handle voice state changes for engine lifecycle
    private func handleVoiceStateChange(from previousState: VoiceState, to newState: VoiceState) {
        // Connection established
        if !previousState.isActive && newState.isActive {
            engine.onConnectionEstablished()
            isVoiceCallActive = true
        }

        // Connection ended
        if previousState.isActive && !newState.isActive {
            engine.onConnectionEnded()
            isVoiceCallActive = false
        }

        // Update speaking state for active listening
        switch newState {
        case .listening:
            engine.isUserSpeaking = true
        case .speaking, .thinking, .connected:
            engine.isUserSpeaking = false
        default:
            break
        }

        betterThanHumanState = engine.currentState
    }

    // MARK: - Engine API

    /// Trigger micro-expression (called from backend emotion events)
    public func triggerMicroExpression(_ type: FerniShared.MicroExpressionType) {
        engine.triggerMicroExpression(type)
        betterThanHumanState = engine.currentState
    }

    /// Signal concern level (called from backend)
    public func signalConcern(level: FerniShared.ConcernLevel) {
        engine.signalConcern(level: level)
        betterThanHumanState = engine.currentState
    }

    /// Process partial transcript for anticipation
    public func processPartialTranscript(_ text: String, tone: VoiceTone? = nil) {
        engine.processPartialTranscript(text, tone: tone)
        betterThanHumanState = engine.currentState
    }

    // MARK: - Voice Call Lifecycle

    private func handleVoiceCallStateChange() {
        if isVoiceCallActive {
            startVoiceCallFeatures()
        } else {
            stopVoiceCallFeatures()
        }
    }

    private func startVoiceCallFeatures() {
        #if os(iOS)
        // Start breath-synchronized haptics
        breathHaptics.startSync()
        #endif

        // Setup spatial audio
        if spatialAudio.isAvailable && spatialAudio.isEnabled {
            spatialAudio.setupEngine()
            spatialAudio.startHeadTracking()
            spatialAudio.setContextualPosition(for: .conversation)
        }
    }

    private func stopVoiceCallFeatures() {
        #if os(iOS)
        breathHaptics.stopSync()
        #endif

        spatialAudio.stopHeadTracking()
        spatialAudio.stop()
    }

    // MARK: - Celebration API

    /// Trigger a celebration effect
    public func celebrate(_ type: CelebrationType, duration: TimeInterval = 3.0) {
        celebrationType = type
        showCelebration = true

        DispatchQueue.main.asyncAfter(deadline: .now() + duration) { [weak self] in
            self?.showCelebration = false
        }
    }

    /// Celebrate a milestone achievement
    public func celebrateMilestone() {
        celebrate(.milestone, duration: 4.0)
    }

    /// Celebrate voice recognition
    public func celebrateVoiceRecognition(name: String?, isReturning: Bool = false) {
        voiceRecognition.celebrate(name: name, isReturningUser: isReturning)
    }

    /// Celebrate voice enrollment completion
    public func celebrateEnrollment(name: String) {
        voiceRecognition.celebrateEnrollment(name: name)
        celebrate(.sparkles, duration: 2.0)
    }

    // MARK: - Context-Aware Audio Positioning

    /// Update spatial audio based on emotional context
    public func setEmotionalContext(_ context: SpatialAudioManager.EmotionalContext) {
        spatialAudio.setContextualPosition(for: context)
    }

    // MARK: - Breath Sync

    /// Update breath rate from detected user breathing
    public func updateBreathRate(_ rate: Double) {
        #if os(iOS)
        breathHaptics.updateFromDetectedBreathing(rate: rate)
        #endif
    }

    // MARK: - Late Night Mode

    /// Check if late night mode is currently active
    public var isLateNightActive: Bool {
        lateNightMode.isEffectivelyActive
    }

    /// Current time phase
    public var currentTimePhase: LateNightModeManager.TimePhase {
        lateNightMode.phase
    }
}

// MARK: - View Modifier

/// Applies all Better Than Human visual effects to a view
public struct BetterThanHumanEnabledModifier: ViewModifier {
    @ObservedObject var integration: BetterThanHumanIntegration

    public func body(content: Content) -> some View {
        content
            // Late night mode warm overlay
            .lateNightMode()
            // Celebration particles overlay
            .overlay(
                Group {
                    if integration.showCelebration {
                        CelebrationOverlay(
                            type: integration.celebrationType,
                            isActive: .constant(true)
                        )
                    }
                }
            )
    }
}

public extension View {
    /// Apply Better Than Human features to this view
    func betterThanHumanEnabled(_ integration: BetterThanHumanIntegration) -> some View {
        self.modifier(BetterThanHumanEnabledModifier(integration: integration))
    }
}

// MARK: - Preview

#if DEBUG
struct BetterThanHumanIntegration_Previews: PreviewProvider {
    static var previews: some View {
        Text("Better Than Human Integration")
            .padding()
            .background(Color.black)
            .betterThanHumanEnabled(BetterThanHumanIntegration())
    }
}
#endif
