import SwiftUI
import AppKit
import AVFoundation
import Carbon.HIToolbox
import UserNotifications

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

// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private var voiceManager = DualModeVoiceManager()  // Supports both Native SDK and CLI modes
    private var voiceWindowController: VoiceWindowController?
    private var settingsWindowController: SettingsWindowController?
    private var eventMonitor: Any?
    private var cancellables = Set<AnyCancellable>()
    private var loginItemManager = LoginItemManager.shared
    
    // User preferences
    @AppStorage("globalHotkeyEnabled") private var globalHotkeyEnabled = true
    @AppStorage("showNotifications") private var showNotifications = true
    @AppStorage("playSounds") private var playSounds = true
    @AppStorage("defaultPersonaId") private var defaultPersonaId = "ferni"
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        setupMenuBar()
        setupGlobalHotkey()
        requestMicrophonePermission()
        requestNotificationPermission()
        observeStateChanges()
        
        // Set default persona from preferences
        voiceManager.currentPersonaId = defaultPersonaId
    }
    
    func applicationWillTerminate(_ notification: Notification) {
        // Stop is async but we're terminating - fire and forget
        Task { @MainActor in
            await voiceManager.stop()
        }
        if let monitor = eventMonitor {
            NSEvent.removeMonitor(monitor)
        }
    }
    
    // MARK: - State Observation
    
    private func observeStateChanges() {
        voiceManager.$state
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                self?.updateIcon()
                self?.updateVoiceWindow()
            }
            .store(in: &cancellables)
        
        voiceManager.$currentPersonaId
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.updateIcon()
            }
            .store(in: &cancellables)
        
        // Observe backend mode changes
        voiceManager.$backendMode
            .receive(on: DispatchQueue.main)
            .sink { [weak self] mode in
                self?.updateIcon()
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Global Hotkey (Cmd+Shift+F)
    
    private func setupGlobalHotkey() {
        eventMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard self?.globalHotkeyEnabled == true else { return }
            
            // Cmd+Shift+F
            if event.modifierFlags.contains([.command, .shift]) && event.keyCode == 3 {
                Task { @MainActor in
                    await self?.voiceManager.toggle()
                }
            }
        }
    }
    
    // MARK: - Notification Permission
    
    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, error in
            if let error = error {
                print("[Notifications] Permission error: \(error)")
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
    }
    
    @objc private func statusBarClicked(_ sender: NSStatusBarButton) {
        guard let event = NSApp.currentEvent else { return }
        
        if event.type == .rightMouseUp {
            showContextMenu()
        } else {
            Task { @MainActor in
                await voiceManager.toggle()
            }
        }
    }
    
    private func showContextMenu() {
        let menu = NSMenu()
        
        // Current persona indicator
        let currentPersona = voiceManager.currentPersona
        let headerItem = NSMenuItem(title: "\(currentPersona.emoji) \(currentPersona.name)", action: nil, keyEquivalent: "")
        headerItem.isEnabled = false
        menu.addItem(headerItem)
        
        menu.addItem(NSMenuItem.separator())
        
        // Persona picker
        for persona in PersonaRegistry.all {
            let item = NSMenuItem(
                title: "\(persona.emoji) \(persona.name) - \(persona.role)",
                action: #selector(selectPersona(_:)),
                keyEquivalent: ""
            )
            item.target = self
            item.representedObject = persona.id
            if persona.id == voiceManager.currentPersonaId {
                item.state = .on
            }
            menu.addItem(item)
        }
        
        menu.addItem(NSMenuItem.separator())
        
        // Shortcut hint
        let shortcutItem = NSMenuItem(title: "Hotkey: ⌘⇧F", action: nil, keyEquivalent: "")
        shortcutItem.isEnabled = false
        menu.addItem(shortcutItem)
        
        menu.addItem(NSMenuItem.separator())
        
        // Claude Code Integration
        let claudeHeaderItem = NSMenuItem(title: "Claude Code", action: nil, keyEquivalent: "")
        claudeHeaderItem.isEnabled = false
        menu.addItem(claudeHeaderItem)
        
        let openClaudeTerminalItem = NSMenuItem(
            title: "🖥️ Open Claude in Terminal",
            action: #selector(openClaudeInTerminal),
            keyEquivalent: ""
        )
        openClaudeTerminalItem.target = self
        menu.addItem(openClaudeTerminalItem)
        
        let openClaudeITermItem = NSMenuItem(
            title: "🖥️ Open Claude in iTerm",
            action: #selector(openClaudeInITerm),
            keyEquivalent: ""
        )
        openClaudeITermItem.target = self
        menu.addItem(openClaudeITermItem)
        
        menu.addItem(NSMenuItem.separator())
        
        // Backend mode (Native/CLI)
        let backendIcon = voiceManager.backendMode == .native ? "⚡️" : "🖥️"
        let backendLabel = "\(backendIcon) \(voiceManager.backendMode.displayName)"
        let backendItem = NSMenuItem(title: backendLabel, action: nil, keyEquivalent: "")
        backendItem.isEnabled = false
        menu.addItem(backendItem)
        
        let toggleBackendItem = NSMenuItem(
            title: voiceManager.backendMode == .native ? "Switch to CLI Mode" : "Switch to Native Mode",
            action: #selector(toggleBackendMode),
            keyEquivalent: ""
        )
        toggleBackendItem.target = self
        menu.addItem(toggleBackendItem)
        
        menu.addItem(NSMenuItem.separator())
        
        // Cloud/Local toggle
        let modeLabel = voiceManager.useCloudMode ? "☁️ Cloud (app.ferni.ai)" : "🏠 Local (localhost)"
        let modeItem = NSMenuItem(title: modeLabel, action: nil, keyEquivalent: "")
        modeItem.isEnabled = false
        menu.addItem(modeItem)
        
        let toggleModeItem = NSMenuItem(
            title: voiceManager.useCloudMode ? "Switch to Local" : "Switch to Cloud",
            action: #selector(toggleCloudMode),
            keyEquivalent: ""
        )
        toggleModeItem.target = self
        menu.addItem(toggleModeItem)
        
        menu.addItem(NSMenuItem.separator())
        
        // Launch at Login toggle
        let launchAtLoginItem = NSMenuItem(
            title: "Launch at Login",
            action: #selector(toggleLaunchAtLogin),
            keyEquivalent: ""
        )
        launchAtLoginItem.target = self
        launchAtLoginItem.state = loginItemManager.isEnabled ? .on : .off
        menu.addItem(launchAtLoginItem)
        
        // Settings
        let settingsItem = NSMenuItem(
            title: "Settings...",
            action: #selector(openSettings),
            keyEquivalent: ","
        )
        settingsItem.target = self
        menu.addItem(settingsItem)
        
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
    
    @objc private func toggleLaunchAtLogin() {
        loginItemManager.toggle()
        if showNotifications {
            showNotification(
                title: "Ferni Voice",
                message: loginItemManager.isEnabled
                    ? "Will launch at login"
                    : "Won't launch at login"
            )
        }
    }
    
    @objc private func openSettings() {
        if settingsWindowController == nil {
            settingsWindowController = SettingsWindowController(voiceManager: voiceManager)
        }
        settingsWindowController?.showWindow()
    }
    
    private func updateVoiceWindow() {
        switch voiceManager.state {
        case .connecting, .connected, .listening, .speaking, .thinking:
            if voiceWindowController == nil {
                voiceWindowController = VoiceWindowController(voiceManager: voiceManager)
            }
            voiceWindowController?.showWithAnimation()
            
        case .error:
            // Keep window open to show error - user can click End to close
            if voiceWindowController == nil {
                voiceWindowController = VoiceWindowController(voiceManager: voiceManager)
            }
            voiceWindowController?.showWithAnimation()
            
        case .disconnected:
            // Only close when explicitly disconnected (not on error)
            voiceWindowController?.closeWithAnimation()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
                self?.voiceWindowController = nil
            }
        }
    }
    
    private func updateIcon() {
        guard let button = statusItem?.button else { return }
        
        // Use SF Symbols for reliability (ImageRenderer has MainActor constraints)
        // Custom icons can be enabled later with proper async handling
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
        case .listening:
            iconName = "ear.fill"
            isTemplate = false
        case .speaking:
            iconName = "waveform"
            isTemplate = false
        case .thinking:
            iconName = "ellipsis.circle.fill"
            isTemplate = false
        case .error:
            iconName = "exclamationmark.circle"
        }
        
        button.image = NSImage(systemSymbolName: iconName, accessibilityDescription: "Ferni Voice")
        button.image?.isTemplate = isTemplate
        
        // Tint when active with persona color
        if !isTemplate {
            button.contentTintColor = NSColor(voiceManager.currentPersona.primaryColor)
        } else {
            button.contentTintColor = nil
        }
    }
    
    @objc private func selectPersona(_ sender: NSMenuItem) {
        if let personaId = sender.representedObject as? String {
            Task { @MainActor in
                await voiceManager.switchPersona(personaId)
            }
        }
    }
    
    @objc private func toggleCloudMode() {
        voiceManager.useCloudMode.toggle()
        showNotification(
            title: "Ferni Voice",
            message: voiceManager.useCloudMode
                ? "Switched to Cloud Mode (app.ferni.ai)"
                : "Switched to Local Mode (localhost:3001)"
        )
    }
    
    @objc private func toggleBackendMode() {
        voiceManager.backendMode = voiceManager.backendMode == .native ? .cli : .native
        showNotification(
            title: "Ferni Voice",
            message: voiceManager.backendMode == .native
                ? "Switched to Native SDK (lower latency)"
                : "Switched to CLI Mode (easier debugging)"
        )
    }
    
    @objc private func openClaudeInTerminal() {
        VisibleTerminalBridge.openTerminalWithClaude()
        showNotification(
            title: "Claude Code",
            message: "Opening Claude in Terminal..."
        )
    }
    
    @objc private func openClaudeInITerm() {
        VisibleTerminalBridge.openITermWithClaude()
        showNotification(
            title: "Claude Code", 
            message: "Opening Claude in iTerm..."
        )
    }
    
    @objc private func quitApp() {
        Task { @MainActor in
            await voiceManager.stop()
            NSApp.terminate(nil)
        }
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
    
    private func showNotification(title: String, message: String) {
        guard showNotifications else { return }
        
        // Use UNUserNotificationCenter for macOS 11+
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = message
        content.sound = playSounds ? .default : nil
        
        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )
        
        UNUserNotificationCenter.current().add(request)
    }
}

// MARK: - Combine Import

import Combine
