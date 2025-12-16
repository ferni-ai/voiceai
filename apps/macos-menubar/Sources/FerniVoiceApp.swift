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
    private var voiceManager = VoiceSessionManager()
    private var voiceWindowController: VoiceWindowController?
    private var eventMonitor: Any?
    private var cancellables = Set<AnyCancellable>()
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        setupMenuBar()
        setupGlobalHotkey()
        requestMicrophonePermission()
        observeStateChanges()
    }
    
    func applicationWillTerminate(_ notification: Notification) {
        voiceManager.stop()
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
    }
    
    // MARK: - Global Hotkey (Cmd+Shift+F)
    
    private func setupGlobalHotkey() {
        eventMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            // Cmd+Shift+F
            if event.modifierFlags.contains([.command, .shift]) && event.keyCode == 3 {
                DispatchQueue.main.async {
                    self?.voiceManager.toggle()
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
    }
    
    @objc private func statusBarClicked(_ sender: NSStatusBarButton) {
        guard let event = NSApp.currentEvent else { return }
        
        if event.type == .rightMouseUp {
            showContextMenu()
        } else {
            voiceManager.toggle()
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
    
    private func updateVoiceWindow() {
        switch voiceManager.state {
        case .connecting, .connected, .listening, .speaking, .thinking:
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
        
        // Tint when active
        if !isTemplate {
            button.contentTintColor = NSColor(voiceManager.currentPersona.primaryColor)
        } else {
            button.contentTintColor = nil
        }
    }
    
    @objc private func selectPersona(_ sender: NSMenuItem) {
        if let personaId = sender.representedObject as? String {
            voiceManager.switchPersona(personaId)
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
    
    private func showNotification(title: String, message: String) {
        // Use UNUserNotificationCenter for macOS 11+
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = message
        content.sound = .default
        
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
