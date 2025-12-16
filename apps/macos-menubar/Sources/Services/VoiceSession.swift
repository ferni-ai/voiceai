import Foundation
import AVFoundation
import Combine
import AppKit

// MARK: - Voice Session Manager

/// Manages the voice session lifecycle, audio, and CLI subprocess
class VoiceSessionManager: ObservableObject {
    
    // MARK: - Published State
    
    @Published private(set) var state: VoiceState = .disconnected
    @Published var currentPersonaId: String = "ferni"
    @Published private(set) var audioLevels: [Float] = Array(repeating: 0.3, count: 8)
    @Published private(set) var transcriptions: [TranscriptionEntry] = []
    
    // MARK: - Claude Code Integration
    
    @Published var isClaudeCodeActive = false
    @Published var claudeCodeResponse: String?
    
    // Terminal bridge for visible terminal interaction
    private var terminalBridge: TerminalBridge {
        TerminalBridge.shared
    }
    
    private var claudeIntegration: ClaudeCodeIntegration {
        ClaudeCodeIntegration.shared
    }
    
    /// Current persona (computed from ID)
    var currentPersona: Persona {
        PersonaRegistry.get(currentPersonaId)
    }
    
    // MARK: - Configuration
    
    /// Cloud vs local mode
    var useCloudMode: Bool {
        get { UserDefaults.standard.bool(forKey: "useCloudMode") }
        set { UserDefaults.standard.set(newValue, forKey: "useCloudMode") }
    }
    
    private let cloudTokenServer = "https://app.ferni.ai"
    private let localTokenServer = "http://localhost:3001"
    
    var tokenServer: String {
        useCloudMode ? cloudTokenServer : localTokenServer
    }
    
    // MARK: - Private State
    
    private var process: Process?
    private var outputPipe: Pipe?
    private var audioPlayer: AVAudioPlayer?
    private var audioLevelTimer: Timer?
    private var cancellables = Set<AnyCancellable>()
    
    // Session metrics
    private var sessionStartTime: Date?
    private var turnCount = 0
    private var handoffCount = 0
    
    // MARK: - Initialization
    
    init() {
        // Set default cloud mode on first launch
        if !UserDefaults.standard.bool(forKey: "hasLaunched") {
            UserDefaults.standard.set(true, forKey: "hasLaunched")
            useCloudMode = true // Default to cloud for best experience
        }
    }
    
    deinit {
        audioLevelTimer?.invalidate()
        process?.interrupt()
    }
    
    // MARK: - Session Control
    
    /// Start a voice session
    func start() {
        guard state == .disconnected || state == .error("") else { return }
        
        state = .connecting
        sessionStartTime = Date()
        turnCount = 0
        handoffCount = 0
        
        // Clear previous transcriptions
        transcriptions = []
        
        setupProcess()
        
        do {
            try process?.run()
            startAudioLevelSimulation()
        } catch {
            state = .error("Failed to start: \(error.localizedDescription)")
        }
    }
    
    /// Stop the voice session
    func stop() {
        // Play disconnect sound if we were connected
        if state.isActive {
            playSound("disconnect")
        }
        
        audioLevelTimer?.invalidate()
        audioLevelTimer = nil
        
        process?.interrupt()
        
        // Force terminate after 2 seconds if still running
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            if self?.process?.isRunning == true {
                self?.process?.terminate()
            }
        }
        
        state = .disconnected
        
        // Log session metrics
        if let startTime = sessionStartTime {
            let duration = Date().timeIntervalSince(startTime)
            print("[Session] Duration: \(formatDuration(duration)), Turns: \(turnCount), Handoffs: \(handoffCount)")
        }
    }
    
    /// Toggle the session on/off
    func toggle() {
        if state.isActive {
            stop()
        } else {
            start()
        }
    }
    
    /// Switch to a different persona
    func switchPersona(_ personaId: String) {
        let wasActive = state.isActive
        
        if wasActive {
            stop()
        }
        
        currentPersonaId = personaId
        
        if wasActive {
            // Small delay to let the UI update
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                self?.start()
            }
        }
    }
    
    // MARK: - Process Setup
    
    private func setupProcess() {
        process = Process()
        
        // Priority order for voice binary:
        // 1. Bundled binary in app Resources (truly independent)
        // 2. Global ferni CLI (/opt/homebrew/bin/ferni)
        // 3. Development fallback (npx tsx)
        
        let bundledBinary = Bundle.main.resourceURL?.appendingPathComponent("ferni-voice").path ?? ""
        let ferniBinary = "/opt/homebrew/bin/ferni"
        
        if FileManager.default.fileExists(atPath: bundledBinary) {
            // Use bundled standalone binary
            process?.executableURL = URL(fileURLWithPath: bundledBinary)
            process?.arguments = ["--persona", currentPersonaId]
            print("[Voice] Using bundled binary")
        } else if FileManager.default.fileExists(atPath: ferniBinary) {
            // Use global ferni CLI
            process?.executableURL = URL(fileURLWithPath: ferniBinary)
            process?.arguments = ["voice", "--persona", currentPersonaId]
            print("[Voice] Using global ferni CLI")
        } else {
            // Development fallback
            let projectRoot = findProjectRoot()
            process?.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process?.arguments = ["npx", "tsx", "apps/cli/src/features/voice/voice-live.ts", "--persona", currentPersonaId]
            process?.currentDirectoryURL = URL(fileURLWithPath: projectRoot)
            print("[Voice] Using development fallback (npx tsx)")
        }
        
        // Environment setup
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:" + (env["PATH"] ?? "")
        env["FERNI_SOUNDS"] = "mp3"
        env["CLI_TOKEN_SERVER"] = tokenServer
        
        // Bundled sounds path
        if let soundsPath = Bundle.main.resourceURL?.appendingPathComponent("sounds").path,
           FileManager.default.fileExists(atPath: soundsPath) {
            env["FERNI_SOUNDS_PATH"] = soundsPath
        }
        
        process?.environment = env
        
        // Output handling
        outputPipe = Pipe()
        process?.standardOutput = outputPipe
        process?.standardError = outputPipe
        
        outputPipe?.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if let output = String(data: data, encoding: .utf8), !output.isEmpty {
                DispatchQueue.main.async {
                    self?.handleOutput(output)
                }
            }
        }
        
        process?.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async {
                self?.state = .disconnected
            }
        }
    }
    
    // MARK: - Output Parsing
    
    private func handleOutput(_ output: String) {
        print("[Voice] \(output)")
        
        // Detect connection success
        if output.contains("Ready!") ||
           output.contains("Microphone active") ||
           output.contains("Connected to room") {
            guard state != .connected else { return }
            state = .connected
            playSound("connect")
        }
        
        // Detect speaking
        if output.contains("Ferni:") || output.contains("Speaking:") {
            state = .speaking
        }
        
        // Detect listening
        if output.contains("You:") || output.contains("Listening") {
            state = .listening
            turnCount += 1
        }
        
        // Detect thinking
        if output.contains("Thinking") || output.contains("Processing") {
            state = .thinking
        }
        
        // Detect handoff
        if output.contains("handing off to") || output.contains("joined") {
            handoffCount += 1
            // Extract new persona from output
            for persona in PersonaRegistry.all {
                if output.contains(persona.name) && persona.id != currentPersonaId {
                    currentPersonaId = persona.id
                    playSound("handoff")
                    break
                }
            }
        }
        
        // Detect errors
        if output.contains("Token server not running") {
            state = .error("Start token server first")
        } else if output.contains("ECONNREFUSED") {
            state = .error("Server not running")
        } else if output.contains("sox not installed") {
            state = .error("Install sox: brew install sox")
        }
        
        // Parse transcriptions
        parseTranscription(output)
    }
    
    private func parseTranscription(_ output: String) {
        // Simple transcription parsing
        // Format: "Ferni: text" or "You: text"
        let lines = output.components(separatedBy: "\n")
        for line in lines {
            if line.contains(":") {
                let parts = line.components(separatedBy: ":")
                if parts.count >= 2 {
                    let speaker = parts[0].trimmingCharacters(in: .whitespaces)
                    let text = parts.dropFirst().joined(separator: ":").trimmingCharacters(in: .whitespaces)
                    
                    if !text.isEmpty {
                        let isAgent = speaker != "You"
                        transcriptions.append(TranscriptionEntry(
                            speaker: speaker,
                            text: text,
                            isAgent: isAgent,
                            timestamp: Date()
                        ))
                        
                        // Check for Claude Code commands (user speech only)
                        if !isAgent {
                            checkForClaudeCodeCommand(text)
                        }
                        
                        // Keep only last 50 entries
                        if transcriptions.count > 50 {
                            transcriptions.removeFirst()
                        }
                    }
                }
            }
        }
    }
    
    // MARK: - Claude Code Integration
    
    /// Check if user's speech is a Claude Code command
    private func checkForClaudeCodeCommand(_ transcript: String) {
        guard claudeIntegration.isClaudeCodeCommand(transcript) else { return }
        
        // Extract the coding request
        let request = claudeIntegration.extractCodingRequest(transcript)
        guard !request.isEmpty else { return }
        
        // Route to Claude via Terminal
        isClaudeCodeActive = true
        
        // Process the voice command through the terminal bridge
        let response = terminalBridge.processVoiceCommand(request)
        
        claudeCodeResponse = response
        
        // Add response to transcriptions
        transcriptions.append(TranscriptionEntry(
            speaker: "Claude",
            text: response,
            isAgent: true,
            timestamp: Date()
        ))
        
        // Reset active state after a delay (terminal command is async)
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
            self?.isClaudeCodeActive = false
        }
    }
    
    /// Open Claude in Terminal
    func openClaudeTerminal() {
        terminalBridge.openInTerminal()
    }
    
    /// Send a command to Claude in Terminal
    func sendToClaudeTerminal(_ command: String) {
        isClaudeCodeActive = true
        terminalBridge.sendCommand(command)
        claudeCodeResponse = "Sent to Claude"
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            self?.isClaudeCodeActive = false
        }
    }
    
    /// Confirm Claude's prompt with "yes"
    func confirmClaude() {
        terminalBridge.confirmYes()
    }
    
    /// Cancel Claude's operation
    func cancelClaude() {
        terminalBridge.pressEscape()
    }
    
    /// Interrupt Claude (Ctrl+C)
    func interruptClaude() {
        terminalBridge.interrupt()
    }
    
    // MARK: - Audio Simulation
    
    private func startAudioLevelSimulation() {
        // Simulate audio levels when we don't have real audio data
        audioLevelTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            DispatchQueue.main.async { [weak self] in
                guard let self = self, self.state.isActive else { return }
                let baseLevel: Float = self.state == .speaking ? 0.5 : 0.3
                self.audioLevels = (0..<8).map { _ in
                    Float.random(in: (baseLevel - 0.2)...(baseLevel + 0.3))
                }
            }
        }
    }
    
    // MARK: - Sound Effects
    
    private func playSound(_ name: String) {
        let paths = [
            Bundle.main.resourcePath.map { "\($0)/sounds/\(name).mp3" },
            NSHomeDirectory() + "/Documents/voiceai/design-system/assets/sounds/\(name).mp3",
            "/Users/sethford/Documents/voiceai/design-system/assets/sounds/\(name).mp3"
        ].compactMap { $0 }
        
        guard let path = paths.first(where: { FileManager.default.fileExists(atPath: $0) }) else {
            print("[Sound] \(name).mp3 not found")
            return
        }
        
        do {
            audioPlayer = try AVAudioPlayer(contentsOf: URL(fileURLWithPath: path))
            audioPlayer?.play()
        } catch {
            print("[Sound] Error playing \(name): \(error)")
        }
    }
    
    // MARK: - Helpers
    
    private func findProjectRoot() -> String {
        let possiblePaths = [
            NSHomeDirectory() + "/Documents/voiceai",
            "/Users/sethford/Documents/voiceai",
            FileManager.default.currentDirectoryPath
        ]
        
        for path in possiblePaths {
            if FileManager.default.fileExists(atPath: path + "/apps/cli/src/features/voice/voice-live.ts") {
                return path
            }
        }
        
        return NSHomeDirectory() + "/Documents/voiceai"
    }
    
    private func formatDuration(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return mins > 0 ? "\(mins)m \(secs)s" : "\(secs)s"
    }
}

// MARK: - Transcription Entry

struct TranscriptionEntry: Identifiable {
    let id = UUID()
    let speaker: String
    let text: String
    let isAgent: Bool
    let timestamp: Date
}

