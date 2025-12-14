import SwiftUI
import AppKit
import AVFoundation

// MARK: - App Entry Point

@main
struct FerniVoiceApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}

// MARK: - Floating Voice Window

struct VoiceWindowView: View {
    @ObservedObject var voiceManager: VoiceSessionManager
    @State private var glowPhase: Double = 0
    @State private var pulseScale: CGFloat = 1.0

    // Persona colors matching design system
    let personaColors: [String: Color] = [
        "ferni": Color(red: 0.29, green: 0.40, blue: 0.25),  // #4a6741
        "maya": Color(red: 0.58, green: 0.44, blue: 0.86),   // #9470db
        "alex": Color(red: 0.20, green: 0.60, blue: 0.86),   // #3399db
        "jordan": Color(red: 0.93, green: 0.79, blue: 0.28), // #edc946
        "peter": Color(red: 0.36, green: 0.54, blue: 0.66),  // #5c8aa8
        "nayan": Color(red: 0.80, green: 0.52, blue: 0.25),  // #cc8540
    ]

    var accentColor: Color {
        personaColors[voiceManager.currentPersona] ?? .green
    }

    var body: some View {
        ZStack {
            // Background
            RoundedRectangle(cornerRadius: 20)
                .fill(.black.opacity(0.85))
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 20))

            // Animated glow border
            RoundedRectangle(cornerRadius: 20)
                .stroke(
                    AngularGradient(
                        gradient: Gradient(colors: [
                            accentColor.opacity(0.8),
                            accentColor.opacity(0.2),
                            accentColor.opacity(0.6),
                            accentColor.opacity(0.1),
                            accentColor.opacity(0.8),
                        ]),
                        center: .center,
                        startAngle: .degrees(glowPhase),
                        endAngle: .degrees(glowPhase + 360)
                    ),
                    lineWidth: voiceManager.state == .connected ? 3 : 2
                )
                .blur(radius: voiceManager.state == .connected ? 4 : 2)

            // Sharp border on top
            RoundedRectangle(cornerRadius: 20)
                .stroke(accentColor.opacity(0.6), lineWidth: 1)

            // Content
            VStack(spacing: 16) {
                // Status area
                HStack {
                    // Pulsing indicator
                    Circle()
                        .fill(accentColor)
                        .frame(width: 8, height: 8)
                        .scaleEffect(pulseScale)
                        .shadow(color: accentColor, radius: 4)

                    Text(statusText)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.white.opacity(0.9))

                    Spacer()

                    // Persona badge
                    Text(voiceManager.currentPersona.uppercased())
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(accentColor)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(accentColor.opacity(0.2))
                        .clipShape(Capsule())
                }

                // Waveform visualization
                HStack(spacing: 3) {
                    ForEach(0..<12, id: \.self) { i in
                        WaveformBar(
                            index: i,
                            isActive: voiceManager.state == .connected,
                            color: accentColor
                        )
                    }
                }
                .frame(height: 40)

                // End button
                Button(action: {
                    voiceManager.stop()
                }) {
                    HStack(spacing: 6) {
                        Image(systemName: "phone.down.fill")
                            .font(.system(size: 12))
                        Text("End")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(Color.red.opacity(0.8))
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .shadow(color: .red.opacity(0.3), radius: 8)
            }
            .padding(20)
        }
        .frame(width: 280, height: 160)
        .onAppear {
            startAnimations()
        }
    }

    var statusText: String {
        switch voiceManager.state {
        case .connecting:
            return "Connecting..."
        case .connected:
            return "Listening..."
        case .disconnected:
            return "Disconnected"
        case .error(let msg):
            return "Error: \(msg)"
        }
    }

    func startAnimations() {
        // Rotating glow
        withAnimation(.linear(duration: 3).repeatForever(autoreverses: false)) {
            glowPhase = 360
        }

        // Pulsing indicator
        withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
            pulseScale = 1.3
        }
    }
}

// MARK: - Waveform Bar

struct WaveformBar: View {
    let index: Int
    let isActive: Bool
    let color: Color

    @State private var height: CGFloat = 0.2

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(color.opacity(isActive ? 0.8 : 0.3))
            .frame(width: 4, height: isActive ? height * 40 : 8)
            .animation(
                isActive ?
                    .easeInOut(duration: Double.random(in: 0.3...0.6))
                    .repeatForever(autoreverses: true)
                    .delay(Double(index) * 0.05)
                : .default,
                value: height
            )
            .onAppear {
                if isActive {
                    height = CGFloat.random(in: 0.3...1.0)
                }
            }
            .onChange(of: isActive) { newValue in
                if newValue {
                    // Randomize heights when active
                    Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { _ in
                        height = CGFloat.random(in: 0.2...1.0)
                    }
                }
            }
    }
}

// MARK: - Voice Window Controller

class VoiceWindowController: NSWindowController {
    convenience init(voiceManager: VoiceSessionManager) {
        let hostingController = NSHostingController(
            rootView: VoiceWindowView(voiceManager: voiceManager)
        )

        let window = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 280, height: 160),
            styleMask: [.nonactivatingPanel, .fullSizeContentView, .borderless],
            backing: .buffered,
            defer: false
        )

        window.contentViewController = hostingController
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.isMovableByWindowBackground = true

        // Position near top-right of screen
        if let screen = NSScreen.main {
            let screenRect = screen.visibleFrame
            let windowX = screenRect.maxX - 300
            let windowY = screenRect.maxY - 180
            window.setFrameOrigin(NSPoint(x: windowX, y: windowY))
        }

        self.init(window: window)
    }
}

// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private var voiceManager = VoiceSessionManager()
    private var voiceWindowController: VoiceWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        setupMenuBar()
        requestMicrophonePermission()
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
            self?.updateVoiceWindow()
        }
    }

    private func updateVoiceWindow() {
        switch voiceManager.state {
        case .connecting, .connected:
            if voiceWindowController == nil {
                voiceWindowController = VoiceWindowController(voiceManager: voiceManager)
            }
            voiceWindowController?.showWindow(nil)

        case .disconnected, .error:
            voiceWindowController?.close()
            voiceWindowController = nil
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

        let statusItem = NSMenuItem(title: statusText(), action: nil, keyEquivalent: "")
        statusItem.isEnabled = false
        menu.addItem(statusItem)

        menu.addItem(NSMenuItem.separator())

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

        let setupItem = NSMenuItem(
            title: "Setup Help...",
            action: #selector(showSetupHelp),
            keyEquivalent: ""
        )
        setupItem.target = self
        menu.addItem(setupItem)

        menu.addItem(NSMenuItem.separator())

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

        let ferniBinary = "/opt/homebrew/bin/ferni"
        if FileManager.default.fileExists(atPath: ferniBinary) {
            process?.executableURL = URL(fileURLWithPath: ferniBinary)
            process?.arguments = ["voice", "--persona", currentPersona]
        } else {
            let projectRoot = findProjectRoot()
            process?.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process?.arguments = ["npx", "tsx", "scripts/cli/voice-live.ts", "--persona", currentPersona]
            process?.currentDirectoryURL = URL(fileURLWithPath: projectRoot)
        }

        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:" + (env["PATH"] ?? "")
        env["FERNI_SOUNDS"] = "mp3"
        process?.environment = env

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
        process?.interrupt()

        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            if self?.process?.isRunning == true {
                self?.process?.terminate()
            }
        }

        state = .disconnected
        NotificationCenter.default.post(name: .voiceStateChanged, object: nil)
    }

    private func handleOutput(_ output: String) {
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

        print("[Voice] \(output)")
    }

    private func findProjectRoot() -> String {
        let fileManager = FileManager.default

        if let bundlePath = Bundle.main.bundlePath.components(separatedBy: "/macos-app/").first {
            return bundlePath
        }

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
