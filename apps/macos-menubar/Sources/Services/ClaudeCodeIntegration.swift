import Foundation
import AppKit

// MARK: - Claude Code Integration

/**
 * Integration with Claude Code (Anthropic's coding assistant)
 * 
 * Features:
 * - Detect if Claude Code is running
 * - Send voice transcriptions to Claude Code
 * - Receive responses for voice synthesis
 * - Share context between Ferni and Claude Code
 */
class ClaudeCodeIntegration: ObservableObject {
    static let shared = ClaudeCodeIntegration()
    
    @Published var isClaudeCodeRunning = false
    @Published var isIntegrated = false
    @Published var lastSentMessage: String?
    
    // Claude Code process names to detect
    private let claudeCodeProcessNames = [
        "Claude",           // Main Claude app
        "claude",           // CLI version
        "claude-code",      // Claude Code specific
        "Cursor",           // Cursor IDE with Claude
    ]
    
    // Integration socket/pipe path
    private let integrationSocketPath = "/tmp/ferni-claude-bridge"
    
    init() {
        checkClaudeCodeRunning()
        
        // Monitor for Claude Code periodically
        Timer.scheduledTimer(withTimeInterval: 10.0, repeats: true) { [weak self] _ in
            self?.checkClaudeCodeRunning()
        }
    }
    
    /// Check if Claude Code or related apps are running
    func checkClaudeCodeRunning() {
        let workspace = NSWorkspace.shared
        let runningApps = workspace.runningApplications
        
        isClaudeCodeRunning = runningApps.contains { app in
            guard let name = app.localizedName else { return false }
            return claudeCodeProcessNames.contains { name.lowercased().contains($0.lowercased()) }
        }
    }
    
    /// Send a message/code request to Claude Code
    func sendToClaudeCode(_ message: String, context: [String: Any]? = nil) async -> Result<String, ClaudeCodeError> {
        guard isClaudeCodeRunning else {
            return .failure(.notRunning)
        }
        
        lastSentMessage = message
        
        // Try different integration methods
        
        // Method 1: Clipboard-based (simplest, always works)
        let clipboardResult = await sendViaClipboard(message)
        if case .success = clipboardResult {
            return clipboardResult
        }
        
        // Method 2: AppleScript (if Claude app supports it)
        let appleScriptResult = await sendViaAppleScript(message)
        if case .success = appleScriptResult {
            return appleScriptResult
        }
        
        // Method 3: Unix socket (if bridge is set up)
        let socketResult = await sendViaSocket(message, context: context)
        return socketResult
    }
    
    // MARK: - Integration Methods
    
    /// Send via clipboard - copy message and notify user
    private func sendViaClipboard(_ message: String) async -> Result<String, ClaudeCodeError> {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(message, forType: .string)
        
        return .success("Copied to clipboard! Paste in Claude Code with Cmd+V")
    }
    
    /// Send via AppleScript to Claude or Cursor
    private func sendViaAppleScript(_ message: String) async -> Result<String, ClaudeCodeError> {
        // Try to send to Cursor first (most common)
        let cursorScript = """
        tell application "Cursor"
            if it is running then
                activate
                delay 0.2
                tell application "System Events"
                    keystroke "l" using {command down, shift down}
                    delay 0.3
                end tell
            end if
        end tell
        """
        
        if let script = NSAppleScript(source: cursorScript) {
            var error: NSDictionary?
            script.executeAndReturnError(&error)
            
            if error == nil {
                // Copy to clipboard for paste
                let pasteboard = NSPasteboard.general
                pasteboard.clearContents()
                pasteboard.setString(message, forType: .string)
                
                return .success("Opened Claude panel in Cursor. Paste your message with Cmd+V")
            }
        }
        
        return .failure(.appleScriptFailed)
    }
    
    /// Send via Unix socket (for advanced integration)
    private func sendViaSocket(_ message: String, context: [String: Any]?) async -> Result<String, ClaudeCodeError> {
        // Check if socket exists
        guard FileManager.default.fileExists(atPath: integrationSocketPath) else {
            return .failure(.socketNotAvailable)
        }
        
        // Create socket connection
        // This would connect to a bridge service that communicates with Claude
        // For now, fall back to clipboard
        return .failure(.socketNotAvailable)
    }
    
    // MARK: - Context Sharing
    
    /// Get current code context from editor
    func getCurrentCodeContext() async -> CodeContext? {
        // Try to get context from active editor
        let activeApp = NSWorkspace.shared.frontmostApplication
        
        guard let appName = activeApp?.localizedName else { return nil }
        
        return CodeContext(
            activeApp: appName,
            timestamp: Date(),
            workingDirectory: FileManager.default.currentDirectoryPath
        )
    }
    
    /// Share conversation context with Claude Code
    func shareContext(transcript: String, personaId: String) {
        // Store context for Claude Code to pick up
        let context = [
            "transcript": transcript,
            "persona": personaId,
            "timestamp": ISO8601DateFormatter().string(from: Date())
        ]
        
        // Write to shared file
        let contextPath = "/tmp/ferni-context.json"
        if let data = try? JSONSerialization.data(withJSONObject: context) {
            try? data.write(to: URL(fileURLWithPath: contextPath))
        }
    }
}

// MARK: - Supporting Types

enum ClaudeCodeError: Error, LocalizedError {
    case notRunning
    case appleScriptFailed
    case socketNotAvailable
    case timeout
    case unknown(String)
    
    var errorDescription: String? {
        switch self {
        case .notRunning:
            return "Claude Code is not running"
        case .appleScriptFailed:
            return "Could not connect via AppleScript"
        case .socketNotAvailable:
            return "Integration socket not available"
        case .timeout:
            return "Connection timed out"
        case .unknown(let msg):
            return msg
        }
    }
}

struct CodeContext {
    let activeApp: String
    let timestamp: Date
    let workingDirectory: String
    var selectedCode: String?
    var fileName: String?
    var language: String?
}

// MARK: - Voice Commands for Claude Code

extension ClaudeCodeIntegration {
    /// Check if a voice command is for Claude Code
    func isClaudeCodeCommand(_ transcript: String) -> Bool {
        let lowered = transcript.lowercased()
        
        // Direct Claude commands - "Claude, [command]" or "Hey Claude, [command]"
        if lowered.hasPrefix("claude") || lowered.hasPrefix("hey claude") {
            return true
        }
        
        // Command triggers - direct imperatives to Claude
        let directTriggers = [
            "ask claude",
            "tell claude", 
            "have claude",
            "get claude to",
            "make claude",
            "let claude",
            "claude should",
            "claude can you",
            "claude please",
            "send to claude",
            "pass to claude",
        ]
        
        if directTriggers.contains(where: { lowered.contains($0) }) {
            return true
        }
        
        // Coding-specific triggers (implies Claude)
        let codingTriggers = [
            "write code",
            "write a function",
            "write a class",
            "write a script",
            "create a function",
            "create a class", 
            "fix this code",
            "fix the code",
            "debug this",
            "debug the",
            "refactor this",
            "refactor the",
            "explain this code",
            "explain the code",
            "review this code",
            "review the code",
            "optimize this",
            "improve this code",
            "add tests",
            "write tests",
            "implement",
            "coding help",
            "help me code",
        ]
        
        return codingTriggers.contains(where: { lowered.contains($0) })
    }
    
    /// Extract the coding request from voice command
    func extractCodingRequest(_ transcript: String) -> String {
        var request = transcript
        let lowered = transcript.lowercased()
        
        // Remove "Hey Claude" or "Claude" prefix
        if lowered.hasPrefix("hey claude") {
            request = String(request.dropFirst(10))
        } else if lowered.hasPrefix("claude") {
            request = String(request.dropFirst(6))
        }
        
        // Remove command triggers but keep the actual request
        let triggersToRemove = [
            "ask claude to",
            "tell claude to",
            "have claude",
            "get claude to",
            "make claude",
            "let claude",
            "claude should",
            "claude can you",
            "claude please",
            "send to claude",
            "pass to claude",
            "ask claude",
            "tell claude",
        ]
        
        let requestLowered = request.lowercased()
        for trigger in triggersToRemove {
            if let range = requestLowered.range(of: trigger) {
                let startIndex = request.index(request.startIndex, offsetBy: requestLowered.distance(from: requestLowered.startIndex, to: range.lowerBound))
                let endIndex = request.index(request.startIndex, offsetBy: requestLowered.distance(from: requestLowered.startIndex, to: range.upperBound))
                request.removeSubrange(startIndex..<endIndex)
                break  // Only remove first match
            }
        }
        
        // Clean up any leading punctuation or whitespace
        request = request.trimmingCharacters(in: .whitespacesAndNewlines)
        if request.hasPrefix(",") || request.hasPrefix(":") {
            request = String(request.dropFirst())
        }
        
        return request.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

