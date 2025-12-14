import SwiftUI
import AppKit
import AVFoundation
import Carbon.HIToolbox

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

// MARK: - Persona Data

struct Persona: Identifiable {
    let id: String
    let name: String
    let emoji: String
    let color: Color
    let tagline: String
}

let personas: [Persona] = [
    Persona(id: "ferni", name: "Ferni", emoji: "🌿", color: Color(red: 0.29, green: 0.40, blue: 0.25), tagline: "Life coach"),
    Persona(id: "maya", name: "Maya", emoji: "🦋", color: Color(red: 0.58, green: 0.44, blue: 0.86), tagline: "Habits coach"),
    Persona(id: "alex", name: "Alex", emoji: "💬", color: Color(red: 0.20, green: 0.60, blue: 0.86), tagline: "Communications"),
    Persona(id: "jordan", name: "Jordan", emoji: "📋", color: Color(red: 0.93, green: 0.79, blue: 0.28), tagline: "Life planner"),
    Persona(id: "peter", name: "Peter", emoji: "🔬", color: Color(red: 0.36, green: 0.54, blue: 0.66), tagline: "Research"),
    Persona(id: "nayan", name: "Nayan", emoji: "🧘", color: Color(red: 0.80, green: 0.52, blue: 0.25), tagline: "Wisdom"),
]

// MARK: - Floating Voice Window

struct VoiceWindowView: View {
    @ObservedObject var voiceManager: VoiceSessionManager
    @State private var breatheScale: CGFloat = 1.0
    @State private var glowOpacity: Double = 0.5
    @State private var isHovering = false

    var currentPersona: Persona {
        personas.first { $0.id == voiceManager.currentPersona } ?? personas[0]
    }

    var body: some View {
        ZStack {
            // Background with blur
            RoundedRectangle(cornerRadius: 24)
                .fill(.black.opacity(0.75))
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 24))

            // Glow effect
            RoundedRectangle(cornerRadius: 24)
                .stroke(currentPersona.color, lineWidth: 2)
                .blur(radius: 8)
                .opacity(glowOpacity)

            // Border
            RoundedRectangle(cornerRadius: 24)
                .stroke(currentPersona.color.opacity(0.4), lineWidth: 1)

            VStack(spacing: 20) {
                // Avatar circle with breathing animation
                ZStack {
                    // Outer glow ring
                    Circle()
                        .stroke(currentPersona.color.opacity(0.3), lineWidth: 3)
                        .frame(width: 80, height: 80)
                        .scaleEffect(breatheScale)

                    // Avatar background
                    Circle()
                        .fill(currentPersona.color.opacity(0.2))
                        .frame(width: 70, height: 70)

                    // Emoji
                    Text(currentPersona.emoji)
                        .font(.system(size: 36))
                }

                // Status text
                VStack(spacing: 4) {
                    Text(statusTitle)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)

                    Text(statusSubtitle)
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.6))
                }

                // Waveform (only when connected)
                if voiceManager.state == .connected {
                    HStack(spacing: 4) {
                        ForEach(0..<8, id: \.self) { i in
                            WaveformBar(
                                index: i,
                                isActive: true,
                                color: currentPersona.color
                            )
                        }
                    }
                    .frame(height: 24)
                    .transition(.opacity.combined(with: .scale(scale: 0.8)))
                }

                // End button
                Button(action: {
                    withAnimation(.spring(response: 0.3)) {
                        voiceManager.stop()
                    }
                }) {
                    HStack(spacing: 6) {
                        Image(systemName: "phone.down.fill")
                            .font(.system(size: 11))
                        Text("End")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(
                        Capsule()
                            .fill(isHovering ? Color.red : Color.red.opacity(0.7))
                    )
                }
                .buttonStyle(.plain)
                .onHover { hovering in
                    withAnimation(.easeInOut(duration: 0.15)) {
                        isHovering = hovering
                    }
                }
            }
            .padding(24)
        }
        .frame(width: 200, height: 260)
        .onAppear {
            startAnimations()
        }
    }

    var statusTitle: String {
        switch voiceManager.state {
        case .connecting:
            return "Connecting..."
        case .connected:
            return "Listening"
        case .disconnected:
            return "Session Ended"
        case .error:
            return "Connection Issue"
        }
    }

    var statusSubtitle: String {
        switch voiceManager.state {
        case .connecting:
            return "Setting up \(currentPersona.name)"
        case .connected:
            return "\(currentPersona.name) is here"
        case .disconnected:
            return "Click menubar to restart"
        case .error(let msg):
            return msg
        }
    }

    func startAnimations() {
        // Breathing animation
        withAnimation(.easeInOut(duration: 2.5).repeatForever(autoreverses: true)) {
            breatheScale = 1.15
        }

        // Glow pulse
        withAnimation(.easeInOut(duration: 1.8).repeatForever(autoreverses: true)) {
            glowOpacity = 0.8
        }
    }
}

// MARK: - Waveform Bar

struct WaveformBar: View {
    let index: Int
    let isActive: Bool
    let color: Color

    @State private var height: CGFloat = 0.3

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(color)
            .frame(width: 4, height: height * 24)
            .onAppear {
                if isActive {
                    animateHeight()
                }
            }
    }

    func animateHeight() {
        let delay = Double(index) * 0.08
        let duration = Double.random(in: 0.4...0.6)

        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            withAnimation(.easeInOut(duration: duration).repeatForever(autoreverses: true)) {
                height = CGFloat.random(in: 0.4...1.0)
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
            contentRect: NSRect(x: 0, y: 0, width: 200, height: 260),
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
        window.animationBehavior = .utilityWindow

        // Position near top-right
        if let screen = NSScreen.main {
            let screenRect = screen.visibleFrame
            let windowX = screenRect.maxX - 220
            let windowY = screenRect.maxY - 280
            window.setFrameOrigin(NSPoint(x: windowX, y: windowY))
        }

        self.init(window: window)
    }

    func showWithAnimation() {
        window?.alphaValue = 0
        showWindow(nil)
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.2
            window?.animator().alphaValue = 1
        }
    }

    func closeWithAnimation() {
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.15
            window?.animator().alphaValue = 0
        }, completionHandler: {
            self.close()
        })
    }
}

// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private var voiceManager = VoiceSessionManager()
    private var voiceWindowController: VoiceWindowController?
    private var eventMonitor: Any?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        setupMenuBar()
        setupGlobalHotkey()
        requestMicrophonePermission()
    }

    func applicationWillTerminate(_ notification: Notification) {
        voiceManager.stop()
        if let monitor = eventMonitor {
            NSEvent.removeMonitor(monitor)
        }
    }

    // MARK: - Global Hotkey (Cmd+Shift+F)

    private func setupGlobalHotkey() {
        eventMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            // Cmd+Shift+F
            if event.modifierFlags.contains([.command, .shift]) && event.keyCode == 3 {
                DispatchQueue.main.async {
                    self?.toggleVoice()
                }
            }
        }
    }

    // MARK: - Menu Bar

    private func setupMenuBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem?.button {
            button.image = NSImage(systemSymbolName: "mic.circle", accessibilityDescription: "Ferni Voice")
            button.image?.isTemplate = true
            button.action = #selector(statusBarClicked)
            button.target = self
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(voiceStateChanged),
            name: .voiceStateChanged,
            object: nil
        )
    }

    @objc private func statusBarClicked(_ sender: NSStatusBarButton) {
        guard let event = NSApp.currentEvent else { return }

        if event.type == .rightMouseUp {
            // Right click: show menu
            showContextMenu()
        } else {
            // Left click: toggle voice session
            toggleVoice()
        }
    }

    private func toggleVoice() {
        switch voiceManager.state {
        case .disconnected, .error:
            voiceManager.start()
        case .connecting, .connected:
            voiceManager.stop()
        }
    }

    private func showContextMenu() {
        let menu = NSMenu()

        // Current persona indicator
        let currentPersona = personas.first { $0.id == voiceManager.currentPersona } ?? personas[0]
        let headerItem = NSMenuItem(title: "\(currentPersona.emoji) \(currentPersona.name)", action: nil, keyEquivalent: "")
        headerItem.isEnabled = false
        menu.addItem(headerItem)

        menu.addItem(NSMenuItem.separator())

        // Persona picker
        for persona in personas {
            let item = NSMenuItem(
                title: "\(persona.emoji) \(persona.name) - \(persona.tagline)",
                action: #selector(selectPersona(_:)),
                keyEquivalent: ""
            )
            item.target = self
            item.representedObject = persona.id
            if persona.id == voiceManager.currentPersona {
                item.state = .on
            }
            menu.addItem(item)
        }

        menu.addItem(NSMenuItem.separator())

        // Shortcut hint
        let shortcutItem = NSMenuItem(title: "Hotkey: Cmd+Shift+F", action: nil, keyEquivalent: "")
        shortcutItem.isEnabled = false
        menu.addItem(shortcutItem)

        menu.addItem(NSMenuItem.separator())

        let quitItem = NSMenuItem(
            title: "Quit",
            action: #selector(quitApp),
            keyEquivalent: "q"
        )
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem?.menu = menu
        statusItem?.button?.performClick(nil)
        statusItem?.menu = nil  // Remove menu so left-click works again
    }

    @objc private func voiceStateChanged() {
        DispatchQueue.main.async { [weak self] in
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
            voiceWindowController?.showWithAnimation()

        case .disconnected, .error:
            voiceWindowController?.closeWithAnimation()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
                self?.voiceWindowController = nil
            }
        }
    }

    private func updateIcon() {
        guard let button = statusItem?.button else { return }

        let iconName: String
        var isTemplate = true

        switch voiceManager.state {
        case .disconnected:
            iconName = "mic.circle"
        case .connecting:
            iconName = "mic.circle.fill"
            isTemplate = false
        case .connected:
            iconName = "waveform.circle.fill"
            isTemplate = false
        case .error:
            iconName = "exclamationmark.circle"
        }

        button.image = NSImage(systemSymbolName: iconName, accessibilityDescription: "Ferni Voice")
        button.image?.isTemplate = isTemplate

        // Tint when active
        if !isTemplate {
            let currentPersona = personas.first { $0.id == voiceManager.currentPersona } ?? personas[0]
            button.contentTintColor = NSColor(currentPersona.color)
        } else {
            button.contentTintColor = nil
        }
    }

    @objc private func selectPersona(_ sender: NSMenuItem) {
        if let personaId = sender.representedObject as? String {
            voiceManager.currentPersona = personaId
            updateIcon()
        }
    }

    @objc private func quitApp() {
        voiceManager.stop()
        NSApp.terminate(nil)
    }

    private func requestMicrophonePermission() {
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            if !granted {
                DispatchQueue.main.async {
                    let alert = NSAlert()
                    alert.messageText = "Microphone Required"
                    alert.informativeText = "Ferni needs microphone access to hear you. Please enable it in System Settings."
                    alert.alertStyle = .warning
                    alert.addButton(withTitle: "Open Settings")
                    alert.addButton(withTitle: "Later")

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

        // Try ferni CLI first, fall back to tsx
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
            state = .error("Failed to start")
            NotificationCenter.default.post(name: .voiceStateChanged, object: nil)
        }
    }

    func stop() {
        process?.interrupt()

        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            if self?.process?.isRunning == true {
                self?.process?.terminate()
            }
        }

        state = .disconnected
        NotificationCenter.default.post(name: .voiceStateChanged, object: nil)
    }

    private func handleOutput(_ output: String) {
        // Detect connection success
        if output.contains("Audio playback active") ||
           output.contains("Microphone active") ||
           output.contains("Connected to room") {
            DispatchQueue.main.async { [weak self] in
                self?.state = .connected
                NotificationCenter.default.post(name: .voiceStateChanged, object: nil)
            }
        }
        // Detect errors
        else if output.contains("Token server not running") {
            DispatchQueue.main.async { [weak self] in
                self?.state = .error("Start token server first")
                NotificationCenter.default.post(name: .voiceStateChanged, object: nil)
            }
        }
        else if output.contains("ECONNREFUSED") {
            DispatchQueue.main.async { [weak self] in
                self?.state = .error("Server not running")
                NotificationCenter.default.post(name: .voiceStateChanged, object: nil)
            }
        }

        #if DEBUG
        print("[Voice] \(output)")
        #endif
    }

    private func findProjectRoot() -> String {
        let fileManager = FileManager.default

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
