import Foundation
import AVFoundation
import Combine
import AppKit

// MARK: - Voice Session Manager

/// Manages the voice session lifecycle, audio, and CLI subprocess
/// With automatic retry, health checks, and graceful error handling
class VoiceSessionManager: ObservableObject {
    
    // MARK: - Published State
    
    @Published private(set) var state: VoiceState = .disconnected
    @Published var currentPersonaId: String = "ferni"
    @Published private(set) var audioLevels: [Float] = Array(repeating: 0.3, count: 8)
    @Published private(set) var transcriptions: [TranscriptionEntry] = []
    @Published private(set) var connectionProgress: String = ""
    @Published private(set) var retryCount: Int = 0
    
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
        get {
            // Default to true (cloud mode) if never set
            if UserDefaults.standard.object(forKey: "useCloudMode") == nil {
                return true
            }
            return UserDefaults.standard.bool(forKey: "useCloudMode")
        }
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
    private var connectionTimeoutTimer: Timer?
    private var isRetrying = false
    
    // Retry configuration
    private let maxRetries = 3
    private let baseRetryDelay: TimeInterval = 1.0
    private let connectionTimeout: TimeInterval = 15.0
    
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
        connectionTimeoutTimer?.invalidate()
        process?.interrupt()
    }
    
    // MARK: - Session Control
    
    /// Start a voice session with health check and auto-retry
    func start() {
        // Allow starting from disconnected OR any error state
        switch state {
        case .disconnected, .error:
            break  // OK to start
        default:
            return  // Already active, don't restart
        }
        
        retryCount = 0
        startWithHealthCheck()
    }
    
    /// Internal start with health check
    private func startWithHealthCheck() {
        state = .connecting
        connectionProgress = "Checking connection..."
        
        // Quick health check first
        checkServerHealth { [weak self] isHealthy, error in
            guard let self = self else { return }
            
            if isHealthy {
                self.connectionProgress = "Connecting to Ferni..."
                self.startVoiceProcess()
            } else {
                // Server not healthy - show helpful message
                let message = self.formatConnectionError(error)
                
                if self.retryCount < self.maxRetries {
                    self.retryCount += 1
                    self.connectionProgress = "Retrying... (\(self.retryCount)/\(self.maxRetries))"
                    
                    // Exponential backoff
                    let delay = self.baseRetryDelay * pow(2.0, Double(self.retryCount - 1))
                    DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                        self?.startWithHealthCheck()
                    }
                } else {
                    self.state = .error(message)
                    self.connectionProgress = ""
                }
            }
        }
    }
    
    /// Check if the server is reachable
    private func checkServerHealth(completion: @escaping (Bool, String?) -> Void) {
        let healthURL = URL(string: "\(tokenServer)/health")!
        
        var request = URLRequest(url: healthURL)
        request.timeoutInterval = 5.0
        request.httpMethod = "GET"
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(false, error.localizedDescription)
                    return
                }
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    completion(false, "Invalid response")
                    return
                }
                
                if httpResponse.statusCode == 200 {
                    completion(true, nil)
                } else {
                    completion(false, "Server returned \(httpResponse.statusCode)")
                }
            }
        }.resume()
    }
    
    /// Format error message for user
    private func formatConnectionError(_ error: String?) -> String {
        guard let error = error?.lowercased() else {
            return "Connection failed"
        }
        
        if error.contains("offline") || error.contains("network") || error.contains("internet") {
            return "Check your internet connection"
        } else if error.contains("timeout") {
            return "Server is slow - try again"
        } else if error.contains("refused") {
            return useCloudMode ? "Ferni is waking up..." : "Start local server first"
        } else {
            return "Connection issue - retrying..."
        }
    }
    
    /// Start the actual voice process
    private func startVoiceProcess() {
        sessionStartTime = Date()
        turnCount = 0
        handoffCount = 0
        transcriptions = []
        
        setupProcess()
        
        guard let process = process else {
            state = .error("Failed to create process")
            return
        }
        
        do {
            try process.run()
            startAudioLevelSimulation()
            startConnectionTimeout()
            print("[Voice] Process started successfully")
        } catch {
            print("[Voice] Failed to start process: \(error)")
            handleConnectionFailure("Failed to start voice")
        }
    }
    
    /// Start timeout timer for connection
    private func startConnectionTimeout() {
        connectionTimeoutTimer?.invalidate()
        connectionTimeoutTimer = Timer.scheduledTimer(withTimeInterval: connectionTimeout, repeats: false) { [weak self] _ in
            guard let self = self else { return }
            if case .connecting = self.state {
                self.handleConnectionFailure("Connection timed out")
            }
        }
    }
    
    /// Handle connection failure with potential retry
    private func handleConnectionFailure(_ message: String) {
        connectionTimeoutTimer?.invalidate()
        process?.interrupt()
        
        if retryCount < maxRetries && !isRetrying {
            isRetrying = true
            retryCount += 1
            connectionProgress = "Retrying... (\(retryCount)/\(maxRetries))"
            
            let delay = baseRetryDelay * pow(2.0, Double(retryCount - 1))
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                self?.isRetrying = false
                self?.startWithHealthCheck()
            }
        } else {
            state = .error(message)
            connectionProgress = ""
            isRetrying = false
        }
    }
    
    /// Stop the voice session
    func stop() {
        // Cancel any pending retries
        isRetrying = false
        connectionTimeoutTimer?.invalidate()
        connectionTimeoutTimer = nil
        
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
        connectionProgress = ""
        retryCount = 0
        
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
        // 2. Known app bundle location (for dev builds)
        // 3. Global ferni CLI (/opt/homebrew/bin/ferni)
        // 4. Development fallback (npx tsx)
        
        let bundledBinary = Bundle.main.resourceURL?.appendingPathComponent("ferni-voice").path ?? ""
        let projectRoot = findProjectRoot()
        let appBundleBinary = "\(projectRoot)/apps/macos-menubar/.build/Ferni Voice.app/Contents/Resources/ferni-voice"
        let ferniBinary = "/opt/homebrew/bin/ferni"
        let devScript = "\(projectRoot)/apps/cli/src/features/voice/voice-live.ts"
        
        print("[Voice] Checking for voice binary...")
        print("[Voice] Bundle.main.resourceURL: \(Bundle.main.resourceURL?.path ?? "nil")")
        print("[Voice] Bundled: \(bundledBinary) exists: \(FileManager.default.fileExists(atPath: bundledBinary))")
        print("[Voice] AppBundle: \(appBundleBinary) exists: \(FileManager.default.fileExists(atPath: appBundleBinary))")
        print("[Voice] Global: \(ferniBinary) exists: \(FileManager.default.fileExists(atPath: ferniBinary))")
        print("[Voice] Dev script: \(devScript) exists: \(FileManager.default.fileExists(atPath: devScript))")
        print("[Voice] Token server: \(tokenServer)")
        
        var binaryPath: String?
        var binaryArgs: [String] = []
        var workingDir: String?
        
        if FileManager.default.isExecutableFile(atPath: bundledBinary) {
            // Use bundled standalone binary (when running as .app)
            binaryPath = bundledBinary
            binaryArgs = ["--persona", currentPersonaId]
            print("[Voice] ✓ Using bundled binary")
        } else if FileManager.default.isExecutableFile(atPath: appBundleBinary) {
            // Use app bundle binary (for dev builds)
            binaryPath = appBundleBinary
            binaryArgs = ["--persona", currentPersonaId]
            print("[Voice] ✓ Using app bundle binary (dev)")
        } else if FileManager.default.isExecutableFile(atPath: ferniBinary) {
            // Use global ferni CLI
            binaryPath = ferniBinary
            binaryArgs = ["voice", "--persona", currentPersonaId]
            print("[Voice] ✓ Using global ferni CLI")
        } else if FileManager.default.fileExists(atPath: devScript) {
            // Development fallback - use npx tsx
            binaryPath = "/usr/bin/env"
            binaryArgs = ["npx", "tsx", devScript, "--persona", currentPersonaId]
            workingDir = projectRoot
            print("[Voice] ✓ Using development fallback (npx tsx)")
        } else {
            print("[Voice] ✗ No voice binary found!")
            state = .error("Voice binary not found")
            return
        }
        
        guard let path = binaryPath else {
            state = .error("No voice binary")
            return
        }
        
        process?.executableURL = URL(fileURLWithPath: path)
        process?.arguments = binaryArgs
        if let dir = workingDir {
            process?.currentDirectoryURL = URL(fileURLWithPath: dir)
        }
        
        print("[Voice] Launching: \(path) \(binaryArgs.joined(separator: " "))")
        
        // Environment setup - make sure we have all needed paths
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:" + (env["PATH"] ?? "")
        env["FERNI_SOUNDS"] = "mp3"
        env["CLI_TOKEN_SERVER"] = tokenServer
        env["HOME"] = NSHomeDirectory()  // Ensure HOME is set
        env["TERM"] = "xterm-256color"   // Terminal emulation
        
        print("[Voice] Token server: \(tokenServer)")
        print("[Voice] PATH includes: /opt/homebrew/bin")
        
        // Bundled sounds path
        if let soundsPath = Bundle.main.resourceURL?.appendingPathComponent("sounds").path,
           FileManager.default.fileExists(atPath: soundsPath) {
            env["FERNI_SOUNDS_PATH"] = soundsPath
        }
        
        process?.environment = env
        
        // Output handling - capture both stdout and stderr separately for better debugging
        outputPipe = Pipe()
        let errorPipe = Pipe()
        process?.standardOutput = outputPipe
        process?.standardError = errorPipe
        
        // Capture stdout
        outputPipe?.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if let output = String(data: data, encoding: .utf8), !output.isEmpty {
                print("[Voice stdout] \(output)")
                DispatchQueue.main.async {
                    self?.handleOutput(output)
                }
            }
        }
        
        // Capture stderr separately for errors
        errorPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if let output = String(data: data, encoding: .utf8), !output.isEmpty {
                print("[Voice stderr] \(output)")
                DispatchQueue.main.async {
                    self?.handleOutput(output)
                }
            }
        }
        
        process?.terminationHandler = { [weak self] process in
            DispatchQueue.main.async {
                guard let self = self else { return }
                
                let exitCode = process.terminationStatus
                print("[Voice] Process terminated with exit code: \(exitCode)")
                
                // If we were connecting and process terminated, it's an error
                if case .connecting = self.state {
                    // Get the last error message if available
                    let lastOutput = self.transcriptions.last?.text ?? "Unknown error"
                    self.state = .error("Failed: \(lastOutput.prefix(50))")
                } else if self.state.isActive {
                    // If we were active and it terminated unexpectedly
                    self.state = .error("Connection lost")
                } else {
                    // Normal disconnect
                    self.state = .disconnected
                }
            }
        }
    }
    
    // MARK: - Output Parsing
    
    private func handleOutput(_ output: String) {
        print("[Voice] \(output)")
        
        // Update connection progress based on output
        if output.contains("Fetching token") {
            connectionProgress = "Getting access token..."
        } else if output.contains("Connecting to LiveKit") {
            connectionProgress = "Connecting to voice server..."
        } else if output.contains("Enabling microphone") {
            connectionProgress = "Starting microphone..."
        } else if output.contains("Waiting for agent") {
            connectionProgress = "Waiting for Ferni..."
        }
        
        // Detect connection success
        if output.contains("Ready!") ||
           output.contains("Microphone active") ||
           output.contains("Connected to room") ||
           output.contains("Agent joined") {
            guard state != .connected else { return }
            connectionTimeoutTimer?.invalidate()
            connectionTimeoutTimer = nil
            connectionProgress = ""
            retryCount = 0
            state = .connected
            playSound("connect")
        }
        
        // Detect speaking (filter out SSML tags for cleaner display)
        if output.contains("Ferni:") || output.contains("Speaking:") {
            if state == .connected || state == .listening || state == .thinking {
                state = .speaking
            }
        }
        
        // Detect listening
        if output.contains("You:") && !output.contains("<noise>") {
            state = .listening
            turnCount += 1
        }
        
        // Detect thinking
        if output.contains("Thinking") || output.contains("Processing") {
            state = .thinking
        }
        
        // Detect handoff (be specific - "Agent joined" is NOT a handoff)
        if output.contains("handing off to") || output.contains("Handoff to") {
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
        
        // Detect errors - but don't immediately fail, let retry handle it
        if output.contains("Token server not running") {
            handleConnectionFailure("Token server unavailable")
        } else if output.contains("ECONNREFUSED") {
            handleConnectionFailure("Server connection refused")
        } else if output.contains("sox not installed") && output.contains("ffplay") == false {
            state = .error("Install audio tools: brew install sox ffmpeg")
        } else if output.contains("ffplay") && output.contains("not found") {
            state = .error("Install ffmpeg: brew install ffmpeg")
        }
        
        // Parse transcriptions
        parseTranscription(output)
        
        // Parse audio levels (if present in output)
        parseAudioLevel(output)
    }
    
    /// Parse audio level data from CLI output
    private func parseAudioLevel(_ output: String) {
        // Look for audio level indicators in output
        // Format: "[audio] level: 0.XX" or "VAD: 0.XX" or similar
        let patterns = [
            "level:\\s*([0-9.]+)",
            "VAD:\\s*([0-9.]+)",
            "volume:\\s*([0-9.]+)",
            "amplitude:\\s*([0-9.]+)"
        ]
        
        for pattern in patterns {
            if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
               let match = regex.firstMatch(in: output, range: NSRange(output.startIndex..., in: output)),
               let range = Range(match.range(at: 1), in: output),
               let level = Float(output[range]) {
                updateAudioLevel(min(1.0, max(0.0, level)))
                return
            }
        }
        
        // Estimate level from content patterns
        if output.contains("Speaking:") || output.contains("Ferni:") {
            // Agent is speaking - moderate level
            updateAudioLevel(Float.random(in: 0.4...0.7))
        } else if output.contains("You:") && !output.contains("<noise>") {
            // User is speaking - higher level
            updateAudioLevel(Float.random(in: 0.5...0.8))
        }
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
    
    // MARK: - Audio Level Management
    
    private var lastAudioLevelUpdate = Date()
    private var realAudioLevel: Float = 0.0
    
    private func startAudioLevelSimulation() {
        // Mix real audio levels with organic variation for visual appeal
        audioLevelTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            DispatchQueue.main.async { [weak self] in
                guard let self = self, self.state.isActive else { return }
                
                // Use real audio level if we have recent data, otherwise simulate
                let timeSinceLastUpdate = Date().timeIntervalSince(self.lastAudioLevelUpdate)
                let baseLevel: Float
                
                if timeSinceLastUpdate < 0.5 {
                    // Use real audio level with some smoothing
                    baseLevel = self.realAudioLevel
                } else {
                    // Fall back to state-based simulation
                    baseLevel = self.state == .speaking ? 0.5 : 0.3
                }
                
                // Create 8 bars with organic variation
                self.audioLevels = (0..<8).map { index in
                    // Add phase offset for wave effect
                    let phase = Float(index) * 0.15
                    let time = Float(Date().timeIntervalSince1970)
                    let wave = sin(time * 5 + phase) * 0.1
                    
                    // Combine base level with wave and random variation
                    let variation = Float.random(in: -0.1...0.15)
                    return max(0.1, min(1.0, baseLevel + wave + variation))
                }
            }
        }
    }
    
    /// Update audio levels from real data (called when parsing CLI output)
    private func updateAudioLevel(_ level: Float) {
        realAudioLevel = level
        lastAudioLevelUpdate = Date()
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

