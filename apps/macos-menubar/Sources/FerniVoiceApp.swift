import SwiftUI
import AppKit
import AVFoundation

// MARK: - App Entry Point

@main
struct FerniVoiceApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        // Empty scene - we only use the menubar
        Settings {
            EmptyView()
        }
    }
}

// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private var voiceManager = VoiceSessionManager()

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Hide dock icon - menubar only
        NSApp.setActivationPolicy(.accessory)

        setupMenuBar()

        // Request microphone permission early
        requestMicrophonePermission()

        // Check if ferni CLI is available
        checkFerniInstallation()
    }

    private func checkFerniInstallation() {
        let ferniPath = "/opt/homebrew/bin/ferni"
        if !FileManager.default.fileExists(atPath: ferniPath) {
            DispatchQueue.main.async {
                let alert = NSAlert()
                alert.messageText = "Ferni CLI Not Found"
                alert.informativeText = """
                The Ferni CLI is required for voice sessions.

                Install it with:
                  npm install -g ferni

                Or if you have the source:
                  cd ~/Documents/voiceai
                  npm link
                """
                alert.alertStyle = .warning
                alert.addButton(withTitle: "OK")
                alert.runModal()
            }
        }
    }

    private func setupMenuBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem?.button {
            button.image = NSImage(systemSymbolName: "mic.circle", accessibilityDescription: "Ferni Voice")
            button.image?.isTemplate = true
        }

        updateMenu()

        // Listen for state changes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(voiceStateChanged),
            name: .voiceStateChanged,
            object: nil
        )
    }

    @objc private func voiceStateChanged() {
        DispatchQueue.main.async { [weak self] in
            self?.updateMenu()
            self?.updateIcon()
        }
    }

    private func updateIcon() {
        guard let button = statusItem?.button else { return }

        let iconName: String
        switch voiceManager.state {
        case .disconnected:
            iconName = "mic.circle"
        case .connecting:
            iconName = "mic.circle.fill"
        case .connected:
            iconName = "waveform.circle.fill"
        case .error:
            iconName = "exclamationmark.circle"
        }

        button.image = NSImage(systemSymbolName: iconName, accessibilityDescription: "Ferni Voice")
        button.image?.isTemplate = voiceManager.state == .disconnected
    }

    private func updateMenu() {
        let menu = NSMenu()

        // Status header
        let statusItem = NSMenuItem(title: statusText(), action: nil, keyEquivalent: "")
        statusItem.isEnabled = false
        menu.addItem(statusItem)

        menu.addItem(NSMenuItem.separator())

        // Main action
        switch voiceManager.state {
        case .disconnected, .error:
            let startItem = NSMenuItem(
                title: "Start Voice Session",
                action: #selector(startVoice),
                keyEquivalent: "s"
            )
            startItem.target = self
            menu.addItem(startItem)

        case .connecting:
            let connectingItem = NSMenuItem(title: "Connecting...", action: nil, keyEquivalent: "")
            connectingItem.isEnabled = false
            menu.addItem(connectingItem)

        case .connected:
            let stopItem = NSMenuItem(
                title: "End Session",
                action: #selector(stopVoice),
                keyEquivalent: "e"
            )
            stopItem.target = self
            menu.addItem(stopItem)
        }

        menu.addItem(NSMenuItem.separator())

        // Persona picker
        let personaMenu = NSMenu()
        for persona in ["ferni", "maya", "alex", "jordan", "peter", "nayan"] {
            let item = NSMenuItem(
                title: persona.capitalized,
                action: #selector(selectPersona(_:)),
                keyEquivalent: ""
            )
            item.target = self
            item.representedObject = persona
            if persona == voiceManager.currentPersona {
                item.state = .on
            }
            personaMenu.addItem(item)
        }

        let personaItem = NSMenuItem(title: "Persona", action: nil, keyEquivalent: "")
        personaItem.submenu = personaMenu
        menu.addItem(personaItem)

        menu.addItem(NSMenuItem.separator())

        // Setup help
        let setupItem = NSMenuItem(
            title: "Setup Help...",
            action: #selector(showSetupHelp),
            keyEquivalent: ""
        )
        setupItem.target = self
        menu.addItem(setupItem)

        menu.addItem(NSMenuItem.separator())

        // Quit
        let quitItem = NSMenuItem(
            title: "Quit Ferni Voice",
            action: #selector(quitApp),
            keyEquivalent: "q"
        )
        quitItem.target = self
        menu.addItem(quitItem)

        self.statusItem?.menu = menu
    }

    private func statusText() -> String {
        switch voiceManager.state {
        case .disconnected:
            return "Ready to talk"
        case .connecting:
            return "Connecting..."
        case .connected:
            return "Talking to \(voiceManager.currentPersona.capitalized)"
        case .error(let message):
            return "Error: \(message)"
        }
    }

    @objc private func startVoice() {
        voiceManager.start()
    }

    @objc private func stopVoice() {
        voiceManager.stop()
    }

    @objc private func selectPersona(_ sender: NSMenuItem) {
        if let persona = sender.representedObject as? String {
            voiceManager.currentPersona = persona
            updateMenu()
        }
    }

    @objc private func quitApp() {
        voiceManager.stop()
        NSApp.terminate(nil)
    }

    @objc private func showSetupHelp() {
        let alert = NSAlert()
        alert.messageText = "Ferni Voice Setup"
        alert.informativeText = """
        Requirements:
        1. Ferni CLI: npm install -g ferni
        2. sox for audio: brew install sox
        3. Token server running: node token-server.js

        For local development:
          cd ~/Documents/voiceai
          npm link  # Installs ferni CLI
          node token-server.js  # Start token server

        Then click "Start Voice Session" to begin!
        """
        alert.alertStyle = .informational
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Open Terminal")

        if alert.runModal() == .alertSecondButtonReturn {
            // Open Terminal with helpful commands
            let script = """
            tell application "Terminal"
                activate
                do script "cd ~/Documents/voiceai && echo '# Start token server with:' && echo 'node token-server.js'"
            end tell
            """
            var error: NSDictionary?
            if let scriptObject = NSAppleScript(source: script) {
                scriptObject.executeAndReturnError(&error)
            }
        }
    }

    private func requestMicrophonePermission() {
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            if !granted {
                DispatchQueue.main.async {
                    let alert = NSAlert()
                    alert.messageText = "Microphone Access Required"
                    alert.informativeText = "Ferni Voice needs microphone access to work. Please enable it in System Preferences > Privacy & Security > Microphone."
                    alert.alertStyle = .warning
                    alert.addButton(withTitle: "Open Settings")
                    alert.addButton(withTitle: "Cancel")

                    if alert.runModal() == .alertFirstButtonReturn {
                        NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")!)
                    }
                }
            }
        }
    }
}

// MARK: - Voice Session Manager

enum VoiceState: Equatable {
    case disconnected
    case connecting
    case connected
    case error(String)
}

extension Notification.Name {
    static let voiceStateChanged = Notification.Name("voiceStateChanged")
}

class VoiceSessionManager: ObservableObject {
    @Published var state: VoiceState = .disconnected
    var currentPersona: String = "ferni"

    private var process: Process?
    private var outputPipe: Pipe?

    func start() {
        guard state == .disconnected || state != .connecting else { return }

        state = .connecting
        NotificationCenter.default.post(name: .voiceStateChanged, object: nil)

        process = Process()

        // Use the ferni binary if available, otherwise fall back to npx tsx
        let ferniBinary = "/opt/homebrew/bin/ferni"
        if FileManager.default.fileExists(atPath: ferniBinary) {
            process?.executableURL = URL(fileURLWithPath: ferniBinary)
            process?.arguments = ["voice", "--persona", currentPersona]
        } else {
            // Fallback to running TypeScript directly
            let projectRoot = findProjectRoot()
            process?.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process?.arguments = ["npx", "tsx", "scripts/cli/voice-live.ts", "--persona", currentPersona]
            process?.currentDirectoryURL = URL(fileURLWithPath: projectRoot)
        }

        // Set up environment
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:" + (env["PATH"] ?? "")
        process?.environment = env

        // Capture output
        outputPipe = Pipe()
        process?.standardOutput = outputPipe
        process?.standardError = outputPipe

        outputPipe?.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if let output = String(data: data, encoding: .utf8), !output.isEmpty {
                self?.handleOutput(output)
            }
        }

        process?.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async {
                self?.state = .disconnected
                NotificationCenter.default.post(name: .voiceStateChanged, object: nil)
            }
        }

        do {
            try process?.run()
        } catch {
            state = .error(error.localizedDescription)
            NotificationCenter.default.post(name: .voiceStateChanged, object: nil)
        }
    }

    func stop() {
        // Send interrupt signal (like Ctrl+C)
        process?.interrupt()

        // Give it a moment to clean up, then terminate if needed
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            if self?.process?.isRunning == true {
                self?.process?.terminate()
            }
        }

        state = .disconnected
        NotificationCenter.default.post(name: .voiceStateChanged, object: nil)
    }

    private func handleOutput(_ output: String) {
        // Parse output to determine state
        if output.contains("Audio playback active") || output.contains("Microphone active") {
            DispatchQueue.main.async { [weak self] in
                self?.state = .connected
                NotificationCenter.default.post(name: .voiceStateChanged, object: nil)
            }
        } else if output.contains("Token server not running") {
            DispatchQueue.main.async { [weak self] in
                self?.state = .error("Token server not running")
                NotificationCenter.default.post(name: .voiceStateChanged, object: nil)
            }
        }

        // Log for debugging
        print("[Voice] \(output)")
    }

    private func findProjectRoot() -> String {
        // Try to find project root relative to the app bundle or current directory
        let fileManager = FileManager.default

        // Check if we're in the built app bundle
        if let bundlePath = Bundle.main.bundlePath.components(separatedBy: "/macos-app/").first {
            return bundlePath
        }

        // Check common locations
        let possiblePaths = [
            NSHomeDirectory() + "/Documents/voiceai",
            "/Users/sethford/Documents/voiceai",
            fileManager.currentDirectoryPath
        ]

        for path in possiblePaths {
            if fileManager.fileExists(atPath: path + "/scripts/cli/voice-live.ts") {
                return path
            }
        }

        return NSHomeDirectory() + "/Documents/voiceai"
    }
}
