import SwiftUI
import Combine

// MARK: - Better Than Human Engine
/// Coordinates all five superhuman emotional intelligence capabilities.
/// This is what makes Ferni feel more present than any human friend.
///
/// Capabilities:
/// 1. Micro-Expressions - 40-150ms subliminal emotional flashes
/// 2. Active Listening - Real-time visual feedback during user speech
/// 3. Breath Sync - Neural mirroring through breathing rhythm
/// 4. Concern Detection - Guardian presence for distress signals
/// 5. Anticipation - Predict emotions before fully expressed

public class BetterThanHumanEngine: ObservableObject {

    // MARK: - Sub-Engines

    public let activeListening: ActiveListeningEngine
    public let microExpressions: MicroExpressionEngine
    public let breathSync: BreathSyncEngine
    public let anticipation: AnticipationEngine

    /// Emotional sound feedback (subliminal audio)
    public let sounds: EmotionalSoundEngine

    #if os(iOS)
    public let haptics: EmotionalHapticsEngine
    #endif

    // MARK: - Published State

    /// Current emotional state to apply to avatar
    @Published public private(set) var currentState: BetterThanHumanState

    /// Whether user is currently speaking
    @Published public var isUserSpeaking: Bool = false {
        didSet {
            if isUserSpeaking {
                activeListening.startListening()
            } else {
                activeListening.stopListening()
            }
        }
    }

    /// Current speech pause duration (updated during user speech)
    @Published public var speechPauseDuration: TimeInterval = 0 {
        didSet {
            activeListening.updatePauseDuration(speechPauseDuration)
        }
    }

    /// Current audio level (0-1)
    @Published public var audioLevel: Float = 0 {
        didSet {
            breathSync.updateFromAudioLevel(audioLevel)
        }
    }

    // MARK: - Private

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    public init() {
        self.activeListening = ActiveListeningEngine()
        self.microExpressions = MicroExpressionEngine()
        self.breathSync = BreathSyncEngine()
        self.anticipation = AnticipationEngine()
        self.sounds = EmotionalSoundEngine()

        #if os(iOS)
        self.haptics = EmotionalHapticsEngine()
        #endif

        self.currentState = BetterThanHumanState()

        setupBindings()
    }

    // MARK: - Setup

    private func setupBindings() {
        // Active listening -> state updates + haptics + sounds
        activeListening.$currentGesture
            .receive(on: DispatchQueue.main)
            .sink { [weak self] gesture in
                self?.currentState.listeningGesture = gesture
                if gesture != .none {
                    self?.sounds.playListeningAck(gesture)
                    #if os(iOS)
                    self?.haptics.playListeningGesture(gesture)
                    #endif
                }
            }
            .store(in: &cancellables)

        // Micro-expressions -> state updates
        microExpressions.$activeExpression
            .receive(on: DispatchQueue.main)
            .sink { [weak self] expression in
                self?.currentState.microExpression = expression
            }
            .store(in: &cancellables)

        // Breath sync -> state updates + subtle breath sounds
        breathSync.$currentBreathPhase
            .receive(on: DispatchQueue.main)
            .sink { [weak self] phase in
                self?.currentState.breathPhase = phase
                // Subtle breath pulse at peak
                self?.sounds.playBreathPulse(phase: phase)
            }
            .store(in: &cancellables)

        breathSync.$syncedBreathRate
            .receive(on: DispatchQueue.main)
            .sink { [weak self] rate in
                self?.currentState.breathRate = rate
            }
            .store(in: &cancellables)

        // Anticipation -> state updates + sounds
        anticipation.$anticipatedEmotion
            .receive(on: DispatchQueue.main)
            .sink { [weak self] emotion in
                self?.currentState.anticipatedEmotion = emotion
                if let emotion = emotion {
                    self?.sounds.playAnticipation(emotion)
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Public API

    /// Process partial transcript for anticipation
    public func processPartialTranscript(_ text: String, tone: VoiceTone? = nil) {
        anticipation.analyze(partialText: text, tone: tone)
    }

    /// Trigger a micro-expression (called from backend emotion events)
    public func triggerMicroExpression(_ type: MicroExpressionType) {
        microExpressions.trigger(type)
        sounds.playMicroExpression(type)
        #if os(iOS)
        haptics.playMicroExpression(type)
        #endif
    }

    /// Signal concern detected from backend
    public func signalConcern(level: ConcernLevel) {
        currentState.concernLevel = level
        sounds.playConcern(level: level)
        #if os(iOS)
        haptics.playConcern(level: level)
        #endif

        // Auto-clear after duration
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            self?.currentState.concernLevel = .none
        }
    }

    /// Trigger memory spark effect
    public func triggerMemorySpark() {
        sounds.playMemorySpark()
    }

    /// Called when connection is established
    public func onConnectionEstablished() {
        breathSync.start()
        sounds.playConnectionEstablished()
        #if os(iOS)
        haptics.prepareEngine()
        haptics.playConnectionEstablished()
        #endif
    }

    /// Called when connection ends
    public func onConnectionEnded() {
        breathSync.stop()
        activeListening.stopListening()
        sounds.playConnectionClosed()
        currentState = BetterThanHumanState()
    }
}

// MARK: - State Container

/// Unified state from all Better Than Human capabilities
public struct BetterThanHumanState {
    // Active listening
    public var listeningGesture: ListeningGesture = .none

    // Micro-expressions
    public var microExpression: MicroExpressionType? = nil

    // Breath sync
    public var breathPhase: CGFloat = 0
    public var breathRate: TimeInterval = 6.0  // Default idle rate

    // Anticipation
    public var anticipatedEmotion: AnticipatedEmotion? = nil

    // Concern
    public var concernLevel: ConcernLevel = .none

    public init() {}
}

// MARK: - Voice Tone

/// Detected tone from voice analysis
public enum VoiceTone: String {
    case neutral
    case rising      // Excitement, questions
    case falling     // Sadness, statements
    case breaking    // Emotional distress
    case strained    // Stress, tension
}

// MARK: - Concern Level

public enum ConcernLevel: String {
    case none
    case mild        // Subtle shift in expression
    case moderate    // Visible empathy
    case high        // Active check-in mode
}
