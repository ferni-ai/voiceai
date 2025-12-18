import Foundation
import Combine

// MARK: - Voice Session Mode

enum VoiceBackendMode: String, CaseIterable, Identifiable {
    case native = "native"
    case cli = "cli"
    
    var id: String { rawValue }
    
    var displayName: String {
        switch self {
        case .native: return "Native SDK"
        case .cli: return "CLI Subprocess"
        }
    }
    
    var description: String {
        switch self {
        case .native:
            return "Direct LiveKit connection (lower latency, better performance)"
        case .cli:
            return "Via Node.js subprocess (easier debugging, see logs)"
        }
    }
    
    var icon: String {
        switch self {
        case .native:
            return "bolt.fill"
        case .cli:
            return "terminal.fill"
        }
    }
}

// MARK: - Dual Mode Voice Manager

/// Manages both Native and CLI voice sessions with runtime switching
class DualModeVoiceManager: ObservableObject {
    
    // MARK: - Published State (bridged from active session)
    
    @Published private(set) var state: VoiceState = .disconnected
    @Published var currentPersonaId: String = "ferni" {
        didSet {
            cliSession.currentPersonaId = currentPersonaId
            nativeSession.currentPersonaId = currentPersonaId
        }
    }
    @Published private(set) var audioLevels: [Float] = Array(repeating: 0.3, count: 8)
    @Published private(set) var transcriptions: [TranscriptionEntry] = []
    @Published private(set) var connectionProgress: String = ""
    @Published private(set) var retryCount: Int = 0
    
    // Handoff state (from native session)
    @Published private(set) var isHandoffInProgress: Bool = false
    @Published private(set) var handoffTargetPersona: String?
    
    var currentPersona: Persona {
        PersonaRegistry.get(currentPersonaId)
    }
    
    // MARK: - Mode Selection
    
    @Published var backendMode: VoiceBackendMode {
        didSet {
            UserDefaults.standard.set(backendMode.rawValue, forKey: "voiceBackendMode")
            // If active, restart with new mode
            if state.isActive {
                Task {
                    await stop()
                    try? await Task.sleep(nanoseconds: 300_000_000)
                    await start()
                }
            }
        }
    }
    
    // MARK: - Configuration (bridged)
    
    var useCloudMode: Bool {
        get { cliSession.useCloudMode }
        set {
            cliSession.useCloudMode = newValue
            nativeSession.useCloudMode = newValue
        }
    }
    
    var tokenServer: String {
        cliSession.tokenServer
    }
    
    // MARK: - Session Managers
    
    private let cliSession = VoiceSessionManager()
    private let nativeSession = NativeLiveKitSession()
    
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Initialization
    
    init() {
        // Load saved mode (default to CLI - native has SDK bugs on macOS 15)
        let savedMode = UserDefaults.standard.string(forKey: "voiceBackendMode") ?? "cli"
        self.backendMode = VoiceBackendMode(rawValue: savedMode) ?? .cli
        
        // Bridge Claude Code state from CLI session
        cliSession.$isClaudeCodeActive
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isActive in
                self?.isClaudeCodeActive = isActive
            }
            .store(in: &cancellables)
        
        // Bridge CLI session state
        cliSession.$state
            .receive(on: DispatchQueue.main)
            .sink { [weak self] newState in
                guard self?.backendMode == .cli else { return }
                self?.state = newState
                self?.updateWidgetState()
            }
            .store(in: &cancellables)
        
        cliSession.$audioLevels
            .receive(on: DispatchQueue.main)
            .sink { [weak self] levels in
                guard self?.backendMode == .cli else { return }
                self?.audioLevels = levels
            }
            .store(in: &cancellables)
        
        cliSession.$transcriptions
            .receive(on: DispatchQueue.main)
            .sink { [weak self] trans in
                guard self?.backendMode == .cli else { return }
                self?.transcriptions = trans
            }
            .store(in: &cancellables)
        
        cliSession.$connectionProgress
            .receive(on: DispatchQueue.main)
            .sink { [weak self] progress in
                guard self?.backendMode == .cli else { return }
                self?.connectionProgress = progress
            }
            .store(in: &cancellables)
        
        cliSession.$retryCount
            .receive(on: DispatchQueue.main)
            .sink { [weak self] count in
                guard self?.backendMode == .cli else { return }
                self?.retryCount = count
            }
            .store(in: &cancellables)
        
        // Bridge Native session state
        nativeSession.$state
            .receive(on: DispatchQueue.main)
            .sink { [weak self] newState in
                guard self?.backendMode == .native else { return }
                self?.state = newState
                self?.updateWidgetState()
            }
            .store(in: &cancellables)
        
        nativeSession.$audioLevels
            .receive(on: DispatchQueue.main)
            .sink { [weak self] levels in
                guard self?.backendMode == .native else { return }
                self?.audioLevels = levels
            }
            .store(in: &cancellables)
        
        nativeSession.$transcriptions
            .receive(on: DispatchQueue.main)
            .sink { [weak self] trans in
                guard self?.backendMode == .native else { return }
                self?.transcriptions = trans
            }
            .store(in: &cancellables)
        
        nativeSession.$connectionProgress
            .receive(on: DispatchQueue.main)
            .sink { [weak self] progress in
                guard self?.backendMode == .native else { return }
                self?.connectionProgress = progress
            }
            .store(in: &cancellables)
        
        nativeSession.$retryCount
            .receive(on: DispatchQueue.main)
            .sink { [weak self] count in
                guard self?.backendMode == .native else { return }
                self?.retryCount = count
            }
            .store(in: &cancellables)
        
        // Bridge handoff state from native session
        nativeSession.$isHandoffInProgress
            .receive(on: DispatchQueue.main)
            .sink { [weak self] inProgress in
                guard self?.backendMode == .native else { return }
                self?.isHandoffInProgress = inProgress
            }
            .store(in: &cancellables)
        
        nativeSession.$handoffTargetPersona
            .receive(on: DispatchQueue.main)
            .sink { [weak self] target in
                guard self?.backendMode == .native else { return }
                self?.handoffTargetPersona = target
            }
            .store(in: &cancellables)
        
        // Bridge persona changes from native session (after handoff)
        nativeSession.$currentPersonaId
            .receive(on: DispatchQueue.main)
            .sink { [weak self] personaId in
                guard self?.backendMode == .native else { return }
                if self?.currentPersonaId != personaId {
                    self?.currentPersonaId = personaId
                }
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Actions
    
    @MainActor
    func start() async {
        switch backendMode {
        case .native:
            await nativeSession.start()
        case .cli:
            cliSession.start()
        }
    }
    
    @MainActor
    func stop() async {
        switch backendMode {
        case .native:
            await nativeSession.stop()
        case .cli:
            cliSession.stop()
        }
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
        switch backendMode {
        case .native:
            await nativeSession.switchPersona(personaId)
        case .cli:
            cliSession.switchPersona(personaId)
        }
    }
    
    // MARK: - Claude Code Integration (CLI only)
    
    @Published private(set) var isClaudeCodeActive: Bool = false
    
    /// Claude Code is only available in CLI mode
    var isClaudeCodeAvailable: Bool {
        backendMode == .cli
    }
    
    func openClaudeTerminal() {
        guard backendMode == .cli else {
            print("[DualMode] Claude Code requires CLI mode")
            return
        }
        cliSession.openClaudeTerminal()
    }
    
    func sendToClaudeTerminal(_ command: String) {
        guard backendMode == .cli else { return }
        cliSession.sendToClaudeTerminal(command)
    }
    
    // MARK: - Widget Shared State
    
    private func updateWidgetState() {
        // Write to shared UserDefaults for Widget
        let defaults = UserDefaults(suiteName: "group.com.ferni.voice")
        defaults?.set(state.isActive, forKey: "isConnected")
        defaults?.set(currentPersonaId, forKey: "personaId")
        defaults?.synchronize()
    }
}

