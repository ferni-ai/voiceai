import Foundation
import AppKit

// MARK: - Terminal Bridge (Visible Terminal Integration)

/**
 * Integrates with Claude Code via visible Terminal windows
 * 
 * This approach:
 * 1. Opens Claude in Terminal.app or iTerm
 * 2. Sends commands via AppleScript keystrokes
 * 3. User can see and interact with Claude directly
 * 4. Ferni can still voice-trigger commands
 */
class TerminalBridge: ObservableObject {
    static let shared = TerminalBridge()
    
    // MARK: - Published State
    
    @Published var isTerminalOpen = false
    @Published var lastCommand: String?
    @Published var preferredTerminal: TerminalApp = .terminal
    
    enum TerminalApp: String, CaseIterable {
        case terminal = "Terminal"
        case iterm = "iTerm"
        case warp = "Warp"
    }
    
    // MARK: - Open Claude in Terminal
    
    /// Open Claude CLI in Terminal.app
    func openInTerminal(workingDirectory: String? = nil) {
        var script = """
        tell application "Terminal"
            activate
        """
        
        if let dir = workingDirectory {
            script += """
            
            do script "cd '\(dir)' && claude"
            """
        } else {
            script += """
            
            do script "claude"
            """
        }
        
        script += """
        
        end tell
        """
        
        executeAppleScript(script)
        isTerminalOpen = true
        preferredTerminal = .terminal
    }
    
    /// Open Claude CLI in iTerm
    func openInITerm(workingDirectory: String? = nil) {
        var command = "claude"
        if let dir = workingDirectory {
            command = "cd '\(dir)' && claude"
        }
        
        let script = """
        tell application "iTerm"
            activate
            if (count of windows) = 0 then
                create window with default profile
            end if
            tell current window
                create tab with default profile
                tell current session
                    write text "\(command)"
                end tell
            end tell
        end tell
        """
        
        executeAppleScript(script)
        isTerminalOpen = true
        preferredTerminal = .iterm
    }
    
    /// Open Claude CLI in Warp
    func openInWarp(workingDirectory: String? = nil) {
        var command = "claude"
        if let dir = workingDirectory {
            command = "cd '\(dir)' && claude"
        }
        
        let script = """
        tell application "Warp"
            activate
        end tell
        delay 0.5
        tell application "System Events"
            tell process "Warp"
                keystroke "t" using {command down}
                delay 0.3
                keystroke "\(command)"
                keystroke return
            end tell
        end tell
        """
        
        executeAppleScript(script)
        isTerminalOpen = true
        preferredTerminal = .warp
    }
    
    // MARK: - Send Commands
    
    /// Send a command to Claude in the open terminal
    func sendCommand(_ command: String) {
        lastCommand = command
        
        // Escape special characters for AppleScript
        let escaped = command
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        
        let script: String
        
        switch preferredTerminal {
        case .terminal:
            script = """
            tell application "Terminal"
                activate
                tell application "System Events"
                    keystroke "\(escaped)"
                    keystroke return
                end tell
            end tell
            """
            
        case .iterm:
            script = """
            tell application "iTerm"
                activate
                tell current window
                    tell current session
                        write text "\(escaped)"
                    end tell
                end tell
            end tell
            """
            
        case .warp:
            script = """
            tell application "Warp"
                activate
            end tell
            tell application "System Events"
                keystroke "\(escaped)"
                keystroke return
            end tell
            """
        }
        
        executeAppleScript(script)
    }
    
    /// Send text followed by Enter
    func type(_ text: String, pressEnter: Bool = true) {
        let escaped = text
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        
        var script = """
        tell application "System Events"
            keystroke "\(escaped)"
        """
        
        if pressEnter {
            script += """
            
            keystroke return
            """
        }
        
        script += """
        
        end tell
        """
        
        executeAppleScript(script)
    }
    
    // MARK: - Special Actions
    
    /// Press Enter (to confirm Claude prompts)
    func pressEnter() {
        let script = """
        tell application "System Events"
            keystroke return
        end tell
        """
        executeAppleScript(script)
    }
    
    /// Press Escape (to cancel Claude operations)
    func pressEscape() {
        let script = """
        tell application "System Events"
            key code 53
        end tell
        """
        executeAppleScript(script)
    }
    
    /// Press Ctrl+C (to interrupt Claude)
    func interrupt() {
        let script = """
        tell application "System Events"
            keystroke "c" using {control down}
        end tell
        """
        executeAppleScript(script)
    }
    
    /// Type "yes" and press Enter
    func confirmYes() {
        type("yes", pressEnter: true)
    }
    
    /// Type "no" and press Enter
    func confirmNo() {
        type("no", pressEnter: true)
    }
    
    // MARK: - Helpers
    
    private func executeAppleScript(_ source: String) {
        DispatchQueue.global(qos: .userInitiated).async {
            if let script = NSAppleScript(source: source) {
                var error: NSDictionary?
                script.executeAndReturnError(&error)
                
                if let error = error {
                    print("[TerminalBridge] AppleScript error: \(error)")
                }
            }
        }
    }
    
    /// Check if a terminal app is installed
    func isTerminalInstalled(_ app: TerminalApp) -> Bool {
        let workspace = NSWorkspace.shared
        return workspace.urlForApplication(withBundleIdentifier: bundleIdentifier(for: app)) != nil
    }
    
    private func bundleIdentifier(for app: TerminalApp) -> String {
        switch app {
        case .terminal: return "com.apple.Terminal"
        case .iterm: return "com.googlecode.iterm2"
        case .warp: return "dev.warp.Warp-Stable"
        }
    }
    
    /// Get list of available terminals
    func availableTerminals() -> [TerminalApp] {
        TerminalApp.allCases.filter { isTerminalInstalled($0) }
    }
}

// MARK: - Voice Integration

extension TerminalBridge {
    /// Process a voice command for Claude
    func processVoiceCommand(_ transcript: String) -> String {
        let lowered = transcript.lowercased()
        
        // Terminal control commands (exact matches for control)
        if lowered == "open terminal" || lowered == "open claude" || 
           lowered.hasPrefix("open claude") || lowered.hasPrefix("open terminal") {
            openPreferredTerminal()
            return "Opening Claude in \(preferredTerminal.rawValue)"
        }
        
        // Confirmation commands
        if lowered == "yes" || lowered == "say yes" || lowered == "confirm" || 
           lowered == "accept" || lowered == "do it" || lowered == "go ahead" ||
           lowered == "apply" || lowered == "apply changes" || lowered == "apply it" {
            confirmYes()
            return "Confirmed"
        }
        
        if lowered == "no" || lowered == "say no" || lowered == "reject" || 
           lowered == "decline" || lowered == "don't" || lowered == "nevermind" {
            confirmNo()
            return "Declined"
        }
        
        if lowered == "cancel" || lowered == "escape" || lowered == "abort" {
            pressEscape()
            return "Cancelled"
        }
        
        if lowered == "stop" || lowered == "interrupt" || lowered == "stop that" {
            interrupt()
            return "Interrupted"
        }
        
        if lowered == "enter" || lowered == "press enter" || lowered == "continue" || lowered == "next" {
            pressEnter()
            return "Continuing"
        }
        
        // This is a COMMAND to Claude - send it directly
        let command = cleanCommandForClaude(transcript)
        
        if isTerminalOpen {
            sendCommand(command)
            return "Telling Claude: \(summarize(command))"
        } else {
            // Open terminal first, then send command
            openPreferredTerminal()
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in
                self?.sendCommand(command)
            }
            return "Opening Claude to: \(summarize(command))"
        }
    }
    
    /// Clean up the command before sending to Claude
    private func cleanCommandForClaude(_ transcript: String) -> String {
        // Don't strip anything - send the full natural language request
        // Claude understands natural language better than stripped commands
        return transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    
    /// Summarize a command for speech feedback
    private func summarize(_ command: String) -> String {
        if command.count <= 50 {
            return command
        }
        return String(command.prefix(47)) + "..."
    }
    
    /// Open the preferred terminal app
    private func openPreferredTerminal() {
        if preferredTerminal == .iterm && isTerminalInstalled(.iterm) {
            openInITerm()
        } else if preferredTerminal == .warp && isTerminalInstalled(.warp) {
            openInWarp()
        } else {
            openInTerminal()
        }
    }
}

// MARK: - Convenience Static Methods (for backward compatibility)

class VisibleTerminalBridge {
    static func openTerminalWithClaude() {
        TerminalBridge.shared.openInTerminal()
    }
    
    static func openITermWithClaude() {
        TerminalBridge.shared.openInITerm()
    }
    
    static func sendToTerminal(_ text: String) {
        TerminalBridge.shared.sendCommand(text)
    }
}
