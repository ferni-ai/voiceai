import Foundation
import Combine
import FerniShared

// MARK: - Transcription Entry

struct TranscriptionEntry: Identifiable, Equatable {
    let id = UUID()
    let speaker: String
    let text: String
    let isAgent: Bool
    let timestamp: Date

    init(speaker: String, text: String, isAgent: Bool, timestamp: Date = Date()) {
        self.speaker = speaker
        self.text = text
        self.isAgent = isAgent
        self.timestamp = timestamp
    }
}

// MARK: - Voice Manager (Native LiveKit Only)

/// Manages native LiveKit voice sessions
class VoiceManager: ObservableObject {

    // MARK: - Published State

    @Published private(set) var state: VoiceState = .disconnected

    /// Better Than Human engine for superhuman EQ
    @Published private(set) var betterThanHumanState: BetterThanHumanState?
    private let betterThanHumanEngine = BetterThanHumanEngine()

    @Published var currentPersonaId: String = "ferni" {
        didSet {
            if _sessionInitialized {
                _session?.currentPersonaId = currentPersonaId
            }
        }
    }
    @Published private(set) var audioLevels: [Float] = Array(repeating: 0.3, count: 8)
    @Published private(set) var transcriptions: [TranscriptionEntry] = []
    @Published private(set) var connectionProgress: String = ""
    @Published private(set) var retryCount: Int = 0

    // Handoff state
    @Published private(set) var isHandoffInProgress: Bool = false
    @Published private(set) var handoffTargetPersona: String?

    var currentPersona: Persona {
        PersonaRegistry.get(currentPersonaId)
    }

    // MARK: - Configuration

    var useCloudMode: Bool {
        get {
            if _sessionInitialized {
                return _session?.useCloudMode ?? true
            }
            return UserDefaults.standard.bool(forKey: "useCloudMode")
        }
        set {
            UserDefaults.standard.set(newValue, forKey: "useCloudMode")
            if _sessionInitialized {
                _session?.useCloudMode = newValue
            }
        }
    }

    var tokenServer: String {
        useCloudMode ? "https://app.ferni.ai" : "http://localhost:3001"
    }

    // MARK: - Session Management

    // Native session - deferred init to avoid LiveKit SDK crashes at app startup
    private var _session: NativeLiveKitSession?
    private var _sessionInitialized = false

    /// Lazily create session only when needed
    private var session: NativeLiveKitSession {
        if _session == nil {
            _session = NativeLiveKitSession()
            _sessionInitialized = true
            setupSessionBindings()
        }
        return _session!
    }

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    init() {
        // Session bindings are set up lazily when session is first accessed
        // Initialize BetterThanHumanState from engine
        betterThanHumanState = betterThanHumanEngine.currentState
    }

    // MARK: - Better Than Human API

    /// Trigger micro-expression (e.g., voice recognition, memory spark)
    func triggerMicroExpression(_ type: MicroExpressionType) {
        betterThanHumanEngine.triggerMicroExpression(type)
        betterThanHumanState = betterThanHumanEngine.currentState
    }

    /// Signal concern level
    func signalConcern(level: ConcernLevel) {
        betterThanHumanEngine.signalConcern(level: level)
        betterThanHumanState = betterThanHumanEngine.currentState
    }

    /// Set whether user is speaking (activates active listening)
    func setUserSpeaking(_ speaking: Bool) {
        betterThanHumanEngine.isUserSpeaking = speaking
        betterThanHumanState = betterThanHumanEngine.currentState
    }

    /// Process partial transcript for emotion anticipation
    func processPartialTranscript(_ text: String, tone: VoiceTone? = nil) {
        betterThanHumanEngine.processPartialTranscript(text, tone: tone)
        betterThanHumanState = betterThanHumanEngine.currentState
    }

    // MARK: - Better Than Human Lifecycle

    /// Handle voice state changes for BetterThanHumanEngine lifecycle
    private func handleStateChange(from previousState: VoiceState, to newState: VoiceState) {
        // Connection established
        if !previousState.isActive && newState.isActive {
            betterThanHumanEngine.onConnectionEstablished()
            betterThanHumanState = betterThanHumanEngine.currentState
        }

        // Connection ended
        if previousState.isActive && !newState.isActive {
            betterThanHumanEngine.onConnectionEnded()
            betterThanHumanState = betterThanHumanEngine.currentState
        }

        // Update speaking state for active listening
        switch newState {
        case .listening:
            betterThanHumanEngine.isUserSpeaking = true
        case .speaking, .thinking, .connected:
            betterThanHumanEngine.isUserSpeaking = false
        default:
            break
        }
        betterThanHumanState = betterThanHumanEngine.currentState
    }

    /// Set up bindings to session
    private func setupSessionBindings() {
        guard let session = _session else { return }

        session.$state
            .receive(on: DispatchQueue.main)
            .sink { [weak self] newState in
                guard let self = self else { return }
                let previousState = self.state
                self.state = newState
                self.updateWidgetState()

                // Wire BetterThanHumanEngine lifecycle
                self.handleStateChange(from: previousState, to: newState)
            }
            .store(in: &cancellables)

        session.$audioLevels
            .receive(on: DispatchQueue.main)
            .sink { [weak self] levels in
                guard let self = self else { return }
                self.audioLevels = levels

                // Feed audio level to breath sync
                let avgLevel = levels.reduce(0, +) / Float(max(levels.count, 1))
                self.betterThanHumanEngine.audioLevel = avgLevel
                self.betterThanHumanState = self.betterThanHumanEngine.currentState
            }
            .store(in: &cancellables)

        session.$transcriptions
            .receive(on: DispatchQueue.main)
            .sink { [weak self] trans in
                self?.transcriptions = trans
            }
            .store(in: &cancellables)

        session.$connectionProgress
            .receive(on: DispatchQueue.main)
            .sink { [weak self] progress in
                self?.connectionProgress = progress
            }
            .store(in: &cancellables)

        session.$retryCount
            .receive(on: DispatchQueue.main)
            .sink { [weak self] count in
                self?.retryCount = count
            }
            .store(in: &cancellables)

        session.$isHandoffInProgress
            .receive(on: DispatchQueue.main)
            .sink { [weak self] inProgress in
                self?.isHandoffInProgress = inProgress
            }
            .store(in: &cancellables)

        session.$handoffTargetPersona
            .receive(on: DispatchQueue.main)
            .sink { [weak self] target in
                self?.handoffTargetPersona = target
            }
            .store(in: &cancellables)

        session.$currentPersonaId
            .receive(on: DispatchQueue.main)
            .sink { [weak self] personaId in
                if self?.currentPersonaId != personaId {
                    self?.currentPersonaId = personaId
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Actions

    @MainActor
    func start() async {
        await session.start()
    }

    @MainActor
    func stop() async {
        await session.stop()
    }

    @MainActor
    func toggle() async {
        if state.isActive {
            await stop()
        } else {
            await start()
        }
    }

    @MainActor
    func switchPersona(_ personaId: String) async {
        await session.switchPersona(personaId)
    }

    // MARK: - Widget Shared State

    private func updateWidgetState() {
        let defaults = UserDefaults(suiteName: "group.com.ferni.voice")
        defaults?.set(state.isActive, forKey: "isConnected")
        defaults?.set(currentPersonaId, forKey: "personaId")
        defaults?.synchronize()
    }
}

// MARK: - Backward Compatibility Alias

/// Alias for code that still references DualModeVoiceManager
typealias DualModeVoiceManager = VoiceManager
