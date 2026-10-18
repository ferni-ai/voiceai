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

    // System Intelligence (unified manager for all macOS-native capabilities)
    private let intelligence = SystemIntelligenceManager.shared

    // Pending context for "Help me with this" feature
    private var pendingContextSnapshot: ContextSnapshot?

    // Convenience accessors for services
    private var contextService: ContextAwarenessService { intelligence.contextService }
    private var calendarService: CalendarService { intelligence.calendarService }
    private var focusService: FocusModeService { intelligence.focusModeService }

    // User preferences
    @AppStorage("globalHotkeyEnabled") private var globalHotkeyEnabled = true
    @AppStorage("helpMeHotkeyEnabled") private var helpMeHotkeyEnabled = true
    @AppStorage("showNotifications") private var showNotifications = true
    @AppStorage("playSounds") private var playSounds = true
    @AppStorage("defaultPersonaId") private var defaultPersonaId = "ferni"
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        setupMenuBar()
        setupGlobalHotkey()
        setupShortcutsHandlers()
        requestMicrophonePermission()
        requestNotificationPermission()
        observeStateChanges()
        observeIntelligenceChanges()

        // Register Shortcuts with the system
        ShortcutsService.registerShortcuts()

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
    }
    
    // MARK: - Shortcuts Integration

    private func setupShortcutsHandlers() {
        intelligence.setupShortcutHandlers(
            onStart: { [weak self] personaId in
                Task { @MainActor in
                    self?.voiceManager.currentPersonaId = personaId
                    await self?.voiceManager.start()
                }
            },
            onEnd: { [weak self] in
                Task { @MainActor in
                    await self?.voiceManager.stop()
                }
            },
            onSwitch: { [weak self] personaId in
                Task { @MainActor in
                    await self?.voiceManager.switchPersona(personaId)
                }
            },
            onHelpMe: { [weak self] in
                Task { @MainActor in
                    await self?.handleHelpMeWithThis()
                }
            }
        )
    }

    // MARK: - Intelligence Observation

    private func observeIntelligenceChanges() {
        // Observe upcoming meetings for proactive notifications
        intelligence.calendarService.$upcomingEvent
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self = self, let event = event else { return }

                // Notify at 15 minutes before meeting
                if event.minutesUntilStart == 15 {
                    self.showNotification(
                        title: "Meeting in 15 minutes",
                        message: event.title
                    )
                }
                // Urgent notification at 5 minutes
                else if event.minutesUntilStart == 5 {
                    self.showNotification(
                        title: "Meeting in 5 minutes!",
                        message: event.title
                    )
                }
            }
            .store(in: &cancellables)

        // Observe context changes for status display
        intelligence.$contextSummary
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                // Could update menubar tooltip or other UI
                self?.updateIcon()
            }
            .store(in: &cancellables)
    }

    // MARK: - Global Hotkeys

    private func setupGlobalHotkey() {
        eventMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self = self else { return }

            // Cmd+Shift+F - Toggle voice (keyCode 3 = F)
            if self.globalHotkeyEnabled &&
               event.modifierFlags.contains([.command, .shift]) &&
               event.keyCode == 3 {
                Task { @MainActor in
                    await self.voiceManager.toggle()
                }
            }

            // Cmd+Shift+H - Help me with this (keyCode 4 = H)
            if self.helpMeHotkeyEnabled &&
               event.modifierFlags.contains([.command, .shift]) &&
               event.keyCode == 4 {
                Task { @MainActor in
                    await self.handleHelpMeWithThis()
                }
            }
        }
    }

    // MARK: - Help Me With This

    /// Captures context and starts voice session with selected text
    @MainActor
    private func handleHelpMeWithThis() async {
        // Check for accessibility permission first
        if !contextService.hasAccessibilityPermission {
            contextService.requestAccessibilityPermission()
            showNotification(
                title: "Accessibility Required",
                message: "Grant accessibility permission to use 'Help me with this'"
            )
            return
        }

        // Capture the current context (including selected text)
        let snapshot = contextService.captureContextSnapshot()
        pendingContextSnapshot = snapshot

        // Log what we captured
        if let text = snapshot.selectedText {
            print("[HelpMe] Captured selected text: \(text.prefix(100))...")
        } else {
            print("[HelpMe] No text selected, using app context: \(snapshot.activeApp)")
        }

        // Show notification about what we captured
        if let text = snapshot.selectedText, !text.isEmpty {
            let preview = text.count > 50 ? String(text.prefix(50)) + "..." : text
            showNotification(
                title: "Got it!",
                message: "Helping with: \"\(preview)\""
            )
        } else {
            showNotification(
                title: "Context Captured",
                message: "Working in \(snapshot.activeApp): \(snapshot.windowTitle)"
            )
        }

        // Start voice session if not already active
        if !voiceManager.state.isActive {
            await voiceManager.start()
        }

        // TODO: Send context to agent via data channel once connected
    }

    /// Get the pending context snapshot (for sending to agent)
    func getPendingContext() -> ContextSnapshot? {
        let context = pendingContextSnapshot
        pendingContextSnapshot = nil  // Clear after retrieval
        return context
    }
    
    // MARK: - Notification Permission

    private func requestNotificationPermission() {
        // Only request if running as proper app bundle
        guard Bundle.main.bundleIdentifier != nil else {
            print("[Notifications] Skipping permission request - not app bundle")
            return
        }
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
        
        // Current persona indicator - colored circle with persona color
        let currentPersona = voiceManager.currentPersona
        let headerItem = NSMenuItem(title: currentPersona.name, action: nil, keyEquivalent: "")
        let headerIcon = NSImage(systemSymbolName: "circle.fill", accessibilityDescription: nil)
        let headerConfig = NSImage.SymbolConfiguration(pointSize: 12, weight: .medium)
            .applying(NSImage.SymbolConfiguration(paletteColors: [NSColor(currentPersona.primaryColor)]))
        headerItem.image = headerIcon?.withSymbolConfiguration(headerConfig)
        headerItem.isEnabled = false
        menu.addItem(headerItem)

        menu.addItem(NSMenuItem.separator())

        // Persona picker - each persona gets their brand color
        for persona in PersonaRegistry.all {
            let item = NSMenuItem(
                title: "\(persona.name) — \(persona.role)",
                action: #selector(selectPersona(_:)),
                keyEquivalent: ""
            )
            let isSelected = persona.id == voiceManager.currentPersonaId
            let symbolName = isSelected ? "circle.fill" : "circle"
            let personaIcon = NSImage(systemSymbolName: symbolName, accessibilityDescription: nil)
            let personaConfig = NSImage.SymbolConfiguration(pointSize: 10, weight: .medium)
                .applying(NSImage.SymbolConfiguration(paletteColors: [NSColor(persona.primaryColor)]))
            item.image = personaIcon?.withSymbolConfiguration(personaConfig)
            item.target = self
            item.representedObject = persona.id
            if isSelected {
                item.state = .on
            }
            menu.addItem(item)
        }
        
        menu.addItem(NSMenuItem.separator())

        // System Intelligence
        let intelligenceHeaderItem = NSMenuItem(title: "System Intelligence", action: nil, keyEquivalent: "")
        intelligenceHeaderItem.isEnabled = false
        menu.addItem(intelligenceHeaderItem)

        let helpMeItem = NSMenuItem(
            title: "Help Me With This",
            action: #selector(helpMeWithThisClicked),
            keyEquivalent: "H"
        )
        helpMeItem.keyEquivalentModifierMask = [.command, .shift]
        helpMeItem.target = self
        menu.addItem(helpMeItem)

        // Show current context - subtle gray circle
        let contextItem = NSMenuItem(
            title: contextService.activeApp.isEmpty ? "No app focused" : contextService.activeApp,
            action: nil,
            keyEquivalent: ""
        )
        let contextIcon = NSImage(systemSymbolName: "circle.fill", accessibilityDescription: nil)
        let contextConfig = NSImage.SymbolConfiguration(pointSize: 8, weight: .medium)
            .applying(NSImage.SymbolConfiguration(paletteColors: [NSColor.tertiaryLabelColor]))
        contextItem.image = contextIcon?.withSymbolConfiguration(contextConfig)
        contextItem.isEnabled = false
        menu.addItem(contextItem)

        menu.addItem(NSMenuItem.separator())

        // Shortcut hints
        let shortcutItem = NSMenuItem(title: "⌘⇧F Toggle Voice  •  ⌘⇧H Help Me", action: nil, keyEquivalent: "")
        shortcutItem.isEnabled = false
        menu.addItem(shortcutItem)

        menu.addItem(NSMenuItem.separator())

        // Claude Code Integration - use subtle accent color
        let claudeHeaderItem = NSMenuItem(title: "Claude Code", action: nil, keyEquivalent: "")
        claudeHeaderItem.isEnabled = false
        menu.addItem(claudeHeaderItem)

        // Anthropic orange/terracotta for Claude items
        let claudeColor = NSColor(red: 0.85, green: 0.55, blue: 0.35, alpha: 1.0)

        let openClaudeTerminalItem = NSMenuItem(
            title: "Open in Terminal",
            action: #selector(openClaudeInTerminal),
            keyEquivalent: ""
        )
        let terminalIcon = NSImage(systemSymbolName: "circle", accessibilityDescription: nil)
        let terminalConfig = NSImage.SymbolConfiguration(pointSize: 10, weight: .medium)
            .applying(NSImage.SymbolConfiguration(paletteColors: [claudeColor]))
        openClaudeTerminalItem.image = terminalIcon?.withSymbolConfiguration(terminalConfig)
        openClaudeTerminalItem.target = self
        menu.addItem(openClaudeTerminalItem)

        let openClaudeITermItem = NSMenuItem(
            title: "Open in iTerm",
            action: #selector(openClaudeInITerm),
            keyEquivalent: ""
        )
        let iTermIcon = NSImage(systemSymbolName: "circle.fill", accessibilityDescription: nil)
        let iTermConfig = NSImage.SymbolConfiguration(pointSize: 10, weight: .medium)
            .applying(NSImage.SymbolConfiguration(paletteColors: [claudeColor]))
        openClaudeITermItem.image = iTermIcon?.withSymbolConfiguration(iTermConfig)
        openClaudeITermItem.target = self
        menu.addItem(openClaudeITermItem)
        
        menu.addItem(NSMenuItem.separator())

        // Cloud/Local toggle - brand-aligned colors
        let isCloud = voiceManager.useCloudMode
        let modeLabel = isCloud ? "Cloud (app.ferni.ai)" : "Local (localhost)"
        let modeItem = NSMenuItem(title: modeLabel, action: nil, keyEquivalent: "")
        // Blue for cloud, Ferni green for local
        let modeColor = isCloud
            ? NSColor(red: 0.25, green: 0.45, blue: 0.65, alpha: 1.0)  // Calm blue
            : NSColor(red: 0.29, green: 0.40, blue: 0.25, alpha: 1.0)  // Ferni green
        let modeIcon = NSImage(systemSymbolName: "circle.fill", accessibilityDescription: nil)
        let modeConfig = NSImage.SymbolConfiguration(pointSize: 10, weight: .medium)
            .applying(NSImage.SymbolConfiguration(paletteColors: [modeColor]))
        modeItem.image = modeIcon?.withSymbolConfiguration(modeConfig)
        modeItem.isEnabled = false
        menu.addItem(modeItem)

        let toggleModeItem = NSMenuItem(
            title: isCloud ? "Switch to Local" : "Switch to Cloud",
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
        case .connected, .listening, .speaking:
            // All active conversation states use same icon
            // NO visual distinction between listening/speaking - like real humans
            iconName = "waveform.circle.fill"
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
    
    @objc private func helpMeWithThisClicked() {
        Task { @MainActor in
            await handleHelpMeWithThis()
        }
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
        // Skip if not running as proper app bundle
        guard Bundle.main.bundleIdentifier != nil else { return }

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
