import Foundation
import Combine

// MARK: - Claude Code Bridge (Deep Integration)

/**
 * Deep integration with Claude Code's interactive CLI
 * 
 * This bridge allows Ferni to:
 * 1. Spawn and manage Claude CLI process
 * 2. Send coding requests directly
 * 3. Stream responses in real-time
 * 4. Detect completion and follow up
 * 5. Maintain conversation context
 */
@MainActor
class ClaudeCodeBridge: ObservableObject {
    static let shared = ClaudeCodeBridge()
    
    // MARK: - Published State
    
    @Published var isConnected = false
    @Published var isProcessing = false
    @Published var currentResponse = ""
    @Published var conversationHistory: [ConversationTurn] = []
    @Published var lastError: String?
    
    // MARK: - Process Management
    
    private var claudeProcess: Process?
    private var inputPipe: Pipe?
    private var outputPipe: Pipe?
    private var errorPipe: Pipe?
    
    private var outputBuffer = ""
    private var responseStarted = false
    private var responseComplete = false
    
    // Completion detection patterns
    private let completionPatterns = [
        "─────────────────────────",  // Claude's separator
        "claude>",                     // Prompt indicator
        "Continue?",                   // Continuation prompt
        "Would you like",              // Follow-up question
    ]
    
    // Callbacks
    var onResponseChunk: ((String) -> Void)?
    var onResponseComplete: ((String) -> Void)?
    var onError: ((String) -> Void)?
    
    // MARK: - Initialization
    
    init() {
        _ = detectClaudeCLI()
    }
    
    deinit {
        // Note: Can't call disconnect() directly from deinit in @MainActor context
        // The process will be cleaned up when the object is deallocated
    }
    
    // MARK: - CLI Detection
    
    /// Find the Claude CLI executable
    private func detectClaudeCLI() -> String? {
        let possiblePaths = [
            "/usr/local/bin/claude",
            "/opt/homebrew/bin/claude",
            "\(NSHomeDirectory())/.claude/bin/claude",
            "\(NSHomeDirectory())/.local/bin/claude",
            "/usr/bin/claude",
        ]
        
        for path in possiblePaths {
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }
        
        // Try which command
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        task.arguments = ["claude"]
        
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = FileHandle.nullDevice
        
        do {
            try task.run()
            task.waitUntilExit()
            
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
               !path.isEmpty {
                return path
            }
        } catch {
            // Ignore
        }
        
        return nil
    }
    
    // MARK: - Connection Management
    
    /// Connect to Claude CLI (spawn interactive session)
    func connect(workingDirectory: String? = nil) async -> Bool {
        guard let claudePath = detectClaudeCLI() else {
            lastError = "Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code"
            onError?(lastError!)
            return false
        }
        
        // Clean up any existing process
        disconnect()
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: claudePath)
        process.arguments = ["--interactive"]  // Interactive mode
        
        // Set working directory if provided
        if let workDir = workingDirectory {
            process.currentDirectoryURL = URL(fileURLWithPath: workDir)
        }
        
        // Set up pipes
        let input = Pipe()
        let output = Pipe()
        let error = Pipe()
        
        process.standardInput = input
        process.standardOutput = output
        process.standardError = error
        
        inputPipe = input
        outputPipe = output
        errorPipe = error
        
        // Handle output asynchronously
        output.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            
            if let text = String(data: data, encoding: .utf8) {
                Task { @MainActor [weak self] in
                    self?.handleOutput(text)
                }
            }
        }
        
        // Handle errors
        error.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            
            if let text = String(data: data, encoding: .utf8) {
                Task { @MainActor [weak self] in
                    self?.handleError(text)
                }
            }
        }
        
        // Handle termination
        process.terminationHandler = { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.isConnected = false
                self?.isProcessing = false
            }
        }
        
        do {
            try process.run()
            claudeProcess = process
            isConnected = true
            
            // Wait for initial prompt
            try? await Task.sleep(nanoseconds: 500_000_000)
            
            return true
        } catch {
            lastError = "Failed to start Claude CLI: \(error.localizedDescription)"
            onError?(lastError!)
            return false
        }
    }
    
    /// Disconnect from Claude CLI
    func disconnect() {
        outputPipe?.fileHandleForReading.readabilityHandler = nil
        errorPipe?.fileHandleForReading.readabilityHandler = nil
        
        if claudeProcess?.isRunning == true {
            // Send exit command
            send("/exit")
            
            // Give it a moment to exit gracefully
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                if self?.claudeProcess?.isRunning == true {
                    self?.claudeProcess?.terminate()
                }
            }
        }
        
        claudeProcess = nil
        inputPipe = nil
        outputPipe = nil
        errorPipe = nil
        isConnected = false
        isProcessing = false
    }
    
    // MARK: - Request Handling
    
    /// Send a coding request to Claude
    func sendRequest(_ prompt: String) async -> String {
        if !isConnected {
            // Auto-connect if not connected
            let connected = await connect()
            if !connected {
                return "Failed to connect to Claude Code: \(lastError ?? "Unknown error")"
            }
        }
        
        // Reset state
        outputBuffer = ""
        currentResponse = ""
        responseStarted = false
        responseComplete = false
        isProcessing = true
        
        // Add to conversation history
        conversationHistory.append(ConversationTurn(role: .user, content: prompt))
        
        // Send the prompt
        send(prompt)
        
        // Wait for response to complete
        let response = await waitForCompletion()
        
        // Add response to history
        conversationHistory.append(ConversationTurn(role: .assistant, content: response))
        
        isProcessing = false
        return response
    }
    
    /// Send raw text to Claude CLI
    private func send(_ text: String) {
        guard let inputPipe = inputPipe else { return }
        
        let input = text + "\n"
        if let data = input.data(using: .utf8) {
            inputPipe.fileHandleForWriting.write(data)
        }
    }
    
    /// Wait for Claude to finish responding
    private func waitForCompletion() async -> String {
        let timeout: TimeInterval = 120  // 2 minute timeout
        let startTime = Date()
        
        while !responseComplete {
            // Check timeout
            if Date().timeIntervalSince(startTime) > timeout {
                lastError = "Response timed out"
                break
            }
            
            // Check for completion patterns
            for pattern in completionPatterns {
                if outputBuffer.contains(pattern) && responseStarted {
                    responseComplete = true
                    break
                }
            }
            
            // Small delay to avoid busy-waiting
            try? await Task.sleep(nanoseconds: 100_000_000)  // 100ms
        }
        
        // Clean up the response
        let response = cleanResponse(outputBuffer)
        currentResponse = response
        onResponseComplete?(response)
        
        return response
    }
    
    // MARK: - Output Processing
    
    /// Handle output from Claude CLI
    private func handleOutput(_ text: String) {
        outputBuffer += text
        
        // Detect when actual response starts (after echo of input)
        if !responseStarted && outputBuffer.count > 10 {
            responseStarted = true
        }
        
        // Stream to callback
        onResponseChunk?(text)
        
        // Update current response (cleaned)
        currentResponse = cleanResponse(outputBuffer)
    }
    
    /// Handle error output
    private func handleError(_ text: String) {
        lastError = text
        onError?(text)
    }
    
    /// Clean up Claude's response
    private func cleanResponse(_ raw: String) -> String {
        var cleaned = raw
        
        // Remove ANSI escape codes
        let ansiPattern = "\\x1B\\[[0-9;]*[a-zA-Z]"
        if let regex = try? NSRegularExpression(pattern: ansiPattern) {
            let range = NSRange(cleaned.startIndex..., in: cleaned)
            cleaned = regex.stringByReplacingMatches(in: cleaned, range: range, withTemplate: "")
        }
        
        // Remove control characters
        cleaned = cleaned.components(separatedBy: .controlCharacters).joined()
        
        // Remove prompt indicators
        cleaned = cleaned.replacingOccurrences(of: "claude>", with: "")
        
        // Trim whitespace
        cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
        
        return cleaned
    }
    
    // MARK: - Follow-up Support
    
    /// Send a follow-up question
    func followUp(_ question: String) async -> String {
        return await sendRequest(question)
    }
    
    /// Ask Claude to explain the last response
    func explainLast() async -> String {
        return await sendRequest("Can you explain that in simpler terms?")
    }
    
    /// Ask Claude to show code
    func showCode() async -> String {
        return await sendRequest("Show me the code for that")
    }
    
    /// Apply the suggested changes
    func applyChanges() async -> String {
        return await sendRequest("Yes, apply those changes")
    }
    
    /// Reject and try different approach
    func tryDifferent() async -> String {
        return await sendRequest("Let's try a different approach")
    }
    
    // MARK: - Context Commands
    
    /// Add file context
    func addFileContext(_ filePath: String) async -> String {
        return await sendRequest("/add \(filePath)")
    }
    
    /// Get current context
    func getContext() async -> String {
        return await sendRequest("/context")
    }
    
    /// Clear conversation
    func clearConversation() async {
        conversationHistory.removeAll()
        outputBuffer = ""
        currentResponse = ""
        _ = await sendRequest("/clear")
    }
}

// MARK: - Supporting Types

struct ConversationTurn: Identifiable {
    let id = UUID()
    let role: ConversationRole
    let content: String
    let timestamp = Date()
}

enum ConversationRole {
    case user
    case assistant
    case system
}

// MARK: - Ferni Voice Integration

extension ClaudeCodeBridge {
    /// Process a voice command for Claude Code
    func processVoiceCommand(_ transcript: String) async -> VoiceResponse {
        let lowered = transcript.lowercased()
        
        // Check for special commands
        if lowered.contains("explain") || lowered.contains("what does that mean") {
            let response = await explainLast()
            return VoiceResponse(
                text: response,
                shouldSpeak: true,
                action: .explained
            )
        }
        
        if lowered.contains("apply") || lowered.contains("do it") || lowered.contains("yes") {
            let response = await applyChanges()
            return VoiceResponse(
                text: "Applied the changes. \(summarize(response))",
                shouldSpeak: true,
                action: .applied
            )
        }
        
        if lowered.contains("try something else") || lowered.contains("different") {
            let response = await tryDifferent()
            return VoiceResponse(
                text: response,
                shouldSpeak: true,
                action: .alternative
            )
        }
        
        if lowered.contains("show me the code") || lowered.contains("show code") {
            let response = await showCode()
            return VoiceResponse(
                text: "Here's the code. I've put it in your editor.",
                shouldSpeak: true,
                action: .showedCode,
                codeSnippet: extractCode(from: response)
            )
        }
        
        if lowered.contains("clear") || lowered.contains("start over") {
            await clearConversation()
            return VoiceResponse(
                text: "Cleared the conversation. What would you like to work on?",
                shouldSpeak: true,
                action: .cleared
            )
        }
        
        // Default: send as a request
        let response = await sendRequest(transcript)
        let summary = summarize(response)
        
        return VoiceResponse(
            text: summary,
            shouldSpeak: true,
            action: .responded,
            fullResponse: response
        )
    }
    
    /// Summarize a long response for speaking
    private func summarize(_ response: String) -> String {
        // If response is short, return as-is
        if response.count < 200 {
            return response
        }
        
        // Extract first meaningful sentence
        let sentences = response.components(separatedBy: ". ")
        if let first = sentences.first, !first.isEmpty {
            return first + ". I can explain more if you'd like."
        }
        
        // Truncate
        let truncated = String(response.prefix(150))
        return truncated + "... There's more. Say 'explain' for details."
    }
    
    /// Extract code blocks from response
    private func extractCode(from response: String) -> String? {
        // Look for code blocks
        let codePattern = "```[\\s\\S]*?```"
        if let regex = try? NSRegularExpression(pattern: codePattern),
           let match = regex.firstMatch(in: response, range: NSRange(response.startIndex..., in: response)),
           let range = Range(match.range, in: response) {
            var code = String(response[range])
            code = code.replacingOccurrences(of: "```", with: "")
            // Remove language identifier on first line
            let lines = code.components(separatedBy: "\n")
            if lines.count > 1 {
                code = lines.dropFirst().joined(separator: "\n")
            }
            return code.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return nil
    }
}

// MARK: - Voice Response

struct VoiceResponse {
    let text: String
    let shouldSpeak: Bool
    let action: ResponseAction
    var fullResponse: String?
    var codeSnippet: String?
    
    enum ResponseAction {
        case responded
        case explained
        case applied
        case alternative
        case showedCode
        case cleared
        case error
    }
}

