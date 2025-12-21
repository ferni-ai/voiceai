import SwiftUI
import AVFoundation

// MARK: - Settings Window

/// Preferences/Settings window for Ferni Voice
struct SettingsView: View {
    @ObservedObject var voiceManager: DualModeVoiceManager
    @ObservedObject var loginItemManager = LoginItemManager.shared
    @ObservedObject var intelligence = SystemIntelligenceManager.shared
    @StateObject private var audioDeviceManager = AudioDeviceManager()

    @AppStorage("defaultPersonaId") private var defaultPersonaId = "ferni"
    @AppStorage("globalHotkeyEnabled") private var globalHotkeyEnabled = true
    @AppStorage("helpMeHotkeyEnabled") private var helpMeHotkeyEnabled = true
    @AppStorage("showNotifications") private var showNotifications = true
    @AppStorage("playSounds") private var playSounds = true
    @AppStorage("sendContextToAgent") private var sendContextToAgent = true
    
    var body: some View {
        TabView {
            // General Tab
            generalTab
                .tabItem {
                    Label("General", systemImage: "gear")
                }
            
            // Audio Tab
            audioTab
                .tabItem {
                    Label("Audio", systemImage: "waveform")
                }
            
            // Personas Tab
            personasTab
                .tabItem {
                    Label("Personas", systemImage: "person.3")
                }

            // Intelligence Tab (System Intelligence)
            intelligenceTab
                .tabItem {
                    Label("Intelligence", systemImage: "brain")
                }

            // Advanced Tab
            advancedTab
                .tabItem {
                    Label("Advanced", systemImage: "slider.horizontal.3")
                }
            
            // About Tab
            aboutTab
                .tabItem {
                    Label("About", systemImage: "info.circle")
                }
        }
        .padding(20)
        .frame(width: 500, height: 400)
    }
    
    // MARK: - General Tab
    
    private var generalTab: some View {
        Form {
            Section {
                Toggle("Launch at Login", isOn: Binding(
                    get: { loginItemManager.isEnabled },
                    set: { loginItemManager.setEnabled($0) }
                ))
                .help("Automatically start Ferni Voice when you log in")
                
                Toggle("Global Hotkey (⌘⇧F)", isOn: $globalHotkeyEnabled)
                    .help("Enable Cmd+Shift+F to toggle voice from anywhere")

                Toggle("Help Me Hotkey (⌘⇧H)", isOn: $helpMeHotkeyEnabled)
                    .help("Enable Cmd+Shift+H to get help with selected text")

                Toggle("Show Notifications", isOn: $showNotifications)
                    .help("Show system notifications for connection events")
                
                Toggle("Play Sound Effects", isOn: $playSounds)
                    .help("Play sounds when connecting/disconnecting")
            } header: {
                Text("Startup & Behavior")
            }
            
            
            Section {
                Picker("Default Persona", selection: $defaultPersonaId) {
                    ForEach(PersonaRegistry.all) { persona in
                        HStack {
                            Text(persona.emoji)
                            Text(persona.name)
                        }
                        .tag(persona.id)
                    }
                }
                .pickerStyle(.menu)
                .help("The persona to start with when opening a new session")
            } header: {
                Text("Defaults")
            }
        }
        .formStyle(.grouped)
    }
    
    // MARK: - Audio Tab
    
    private var audioTab: some View {
        Form {
            Section {
                Picker("Input Device", selection: $audioDeviceManager.selectedInputDevice) {
                    Text("System Default").tag("")
                    ForEach(audioDeviceManager.inputDevices, id: \.self) { device in
                        Text(device).tag(device)
                    }
                }
                .pickerStyle(.menu)
                .help("Microphone to use for voice input")
                
                // Volume meter (visual feedback)
                HStack {
                    Text("Input Level")
                    Spacer()
                    AudioLevelMeter(level: audioDeviceManager.inputLevel)
                        .frame(width: 100, height: 8)
                }
            } header: {
                Text("Microphone")
            }
            
            Section {
                Picker("Output Device", selection: $audioDeviceManager.selectedOutputDevice) {
                    Text("System Default").tag("")
                    ForEach(audioDeviceManager.outputDevices, id: \.self) { device in
                        Text(device).tag(device)
                    }
                }
                .pickerStyle(.menu)
                .help("Speaker/headphones to use for voice output")
            } header: {
                Text("Speaker")
            }
            
            Section {
                Button("Open System Sound Settings") {
                    NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.Sound-Settings.extension")!)
                }
            } header: {
                Text("System Settings")
            }
        }
        .formStyle(.grouped)
        .onAppear {
            audioDeviceManager.refreshDevices()
        }
    }
    
    // MARK: - Personas Tab
    
    private var personasTab: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 140))], spacing: 16) {
                ForEach(PersonaRegistry.all) { persona in
                    PersonaCard(
                        persona: persona,
                        isDefault: persona.id == defaultPersonaId,
                        onSetDefault: {
                            defaultPersonaId = persona.id
                        }
                    )
                }
            }
            .padding()
        }
    }
    
    // MARK: - Intelligence Tab

    private var intelligenceTab: some View {
        ScrollView {
            Form {
                // Core Permissions Section
                Section {
                    PermissionRow(
                        title: "Accessibility",
                        subtitle: "Read selected text and window titles",
                        isGranted: intelligence.contextService.hasAccessibilityPermission,
                        systemImage: "hand.point.up.fill",
                        onRequest: { intelligence.contextService.requestAccessibilityPermission() },
                        onOpenSettings: { intelligence.contextService.openAccessibilitySettings() }
                    )

                    PermissionRow(
                        title: "Calendar",
                        subtitle: "Meeting awareness and scheduling",
                        isGranted: intelligence.calendarService.hasAccess,
                        systemImage: "calendar",
                        onRequest: {
                            Task { await intelligence.calendarService.requestAccess() }
                        },
                        onOpenSettings: { intelligence.calendarService.openCalendarSettings() }
                    )

                    PermissionRow(
                        title: "Contacts",
                        subtitle: "Birthday reminders and relationships",
                        isGranted: intelligence.contactsService.hasAccess,
                        systemImage: "person.crop.circle",
                        onRequest: {
                            Task { await intelligence.contactsService.requestAccess() }
                        },
                        onOpenSettings: { intelligence.contactsService.openContactsSettings() }
                    )

                    PermissionRow(
                        title: "Location",
                        subtitle: "Place awareness and geofencing",
                        isGranted: intelligence.locationService.hasAccess,
                        systemImage: "location.fill",
                        onRequest: { intelligence.locationService.requestAccess() },
                        onOpenSettings: { intelligence.locationService.openLocationSettings() }
                    )

                    PermissionRow(
                        title: "Notifications",
                        subtitle: "Check-in reminders and insights",
                        isGranted: intelligence.notificationService.isAuthorized,
                        systemImage: "bell.fill",
                        onRequest: {
                            Task { await intelligence.notificationService.requestAuthorization() }
                        },
                        onOpenSettings: { intelligence.notificationService.openNotificationSettings() }
                    )

                    PermissionRow(
                        title: "Focus Mode",
                        subtitle: "Respect Do Not Disturb",
                        isGranted: intelligence.focusModeService.hasPermission,
                        systemImage: "moon.fill",
                        onRequest: {
                            Task { await intelligence.focusModeService.requestAuthorization() }
                        },
                        onOpenSettings: nil
                    )
                } header: {
                    Text("Permissions")
                } footer: {
                    let status = intelligence.getPermissionStatus()
                    Text("\(status.grantedCount)/\(status.totalCount) permissions granted")
                        .foregroundColor(status.allGranted ? .green : .secondary)
                }

                // Features Section
                Section {
                    Toggle("Help Me With This (⌘⇧H)", isOn: $helpMeHotkeyEnabled)
                        .help("Press Cmd+Shift+H to get help with selected text")

                    Toggle("Send Context to Agent", isOn: $sendContextToAgent)
                        .help("Share app context, calendar, and focus mode with the AI")

                    Toggle("Meeting Reminders", isOn: $showNotifications)
                        .help("Get notified before meetings start")
                } header: {
                    Text("Features")
                }

                // Current Context Section
                Section {
                    LabeledContent("Active App") {
                        Text(intelligence.contextService.activeApp.isEmpty ? "None" : intelligence.contextService.activeApp)
                            .foregroundColor(.secondary)
                    }

                    LabeledContent("Window") {
                        Text(intelligence.contextService.activeWindowTitle.isEmpty ? "None" : intelligence.contextService.activeWindowTitle)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }

                    if let event = intelligence.calendarService.upcomingEvent {
                        LabeledContent("Upcoming") {
                            Text("\(event.title) in \(event.minutesUntilStart)m")
                                .foregroundColor(.secondary)
                        }
                    }

                    if intelligence.focusModeService.isFocused {
                        LabeledContent("Focus") {
                            Text(intelligence.focusModeService.focusModeName ?? "Active")
                                .foregroundColor(.orange)
                        }
                    }

                    if let place = intelligence.currentPlace {
                        LabeledContent("Location") {
                            Text(place)
                                .foregroundColor(.secondary)
                        }
                    }

                    if intelligence.needsBreak {
                        LabeledContent("Screen Time") {
                            Text("Break suggested")
                                .foregroundColor(.orange)
                        }
                    }

                    if let birthday = intelligence.upcomingBirthdays.first {
                        LabeledContent("Birthday") {
                            if birthday.daysUntilBirthday == 0 {
                                Text("🎂 \(birthday.name) today!")
                                    .foregroundColor(.green)
                            } else if birthday.daysUntilBirthday == 1 {
                                Text("\(birthday.name) tomorrow")
                                    .foregroundColor(.secondary)
                            } else {
                                Text("\(birthday.name) in \(birthday.daysUntilBirthday ?? 0) days")
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                } header: {
                    Text("Current Context")
                }

                // Screen Time Section
                Section {
                    LabeledContent("Screen Time Today") {
                        let hours = intelligence.screenTimeService.totalScreenTimeMinutes / 60
                        let mins = intelligence.screenTimeService.totalScreenTimeMinutes % 60
                        Text(hours > 0 ? "\(hours)h \(mins)m" : "\(mins) min")
                            .foregroundColor(.secondary)
                    }

                    if let topApp = intelligence.screenTimeService.topApps.first {
                        LabeledContent("Most Used") {
                            Text("\(topApp.app) (\(topApp.minutes) min)")
                                .foregroundColor(.secondary)
                        }
                    }
                } header: {
                    Text("Screen Time")
                }

                // Siri Section
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Available Siri commands:")
                            .font(.subheadline)
                            .foregroundColor(.secondary)

                        Group {
                            Text("\"Hey Siri, start a Ferni check-in\"")
                            Text("\"Hey Siri, talk to Maya\"")
                            Text("\"Hey Siri, help me with this\"")
                        }
                        .font(.system(.caption, design: .monospaced))
                        .foregroundColor(.secondary)
                    }
                } header: {
                    Text("Siri & Shortcuts")
                }

                // Request All Button
                Section {
                    Button("Request All Permissions") {
                        Task {
                            await intelligence.requestAllPermissions()
                        }
                    }
                    .disabled(intelligence.getPermissionStatus().allGranted)
                }
            }
            .formStyle(.grouped)
        }
    }

    // MARK: - Advanced Tab

    private var advancedTab: some View {
        Form {
            Section {
                Toggle(voiceManager.useCloudMode ? "Cloud Mode (app.ferni.ai)" : "Local Mode (localhost)", isOn: Binding(
                    get: { voiceManager.useCloudMode },
                    set: { voiceManager.useCloudMode = $0 }
                ))
                .help("Cloud mode connects to app.ferni.ai. Local mode for development.")
                
                if !voiceManager.useCloudMode {
                    LabeledContent("Local Server") {
                        Text("http://localhost:3001")
                            .font(.system(.body, design: .monospaced))
                            .foregroundColor(.secondary)
                    }
                }
            } header: {
                Text("Connection Mode")
            }
            
            Section {
                LabeledContent("Config Location") {
                    Text("~/Library/Preferences/com.ferni.voice.plist")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(.secondary)
                }
                
                Button("Reset All Settings") {
                    resetAllSettings()
                }
                .foregroundColor(.red)
            } header: {
                Text("Data")
            }
        }
        .formStyle(.grouped)
    }
    
    // MARK: - About Tab
    
    private var aboutTab: some View {
        VStack(spacing: 20) {
            // App icon
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .frame(width: 80, height: 80)
            
            VStack(spacing: 4) {
                Text("Ferni Voice")
                    .font(.title2.bold())
                
                Text("Version \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0")")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            
            Text("Voice conversations with Ferni and the team, right from your menubar.")
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            Divider()
            
            VStack(spacing: 8) {
                Link("Website", destination: URL(string: "https://ferni.ai")!)
                Link("Support", destination: URL(string: "mailto:hello@ferni.ai")!)
                Link("Privacy Policy", destination: URL(string: "https://ferni.ai/privacy")!)
            }
            .font(.callout)
            
            Spacer()
            
            Text("© 2024 Ferni AI. All rights reserved.")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding()
    }
    
    // MARK: - Helpers
    
    private func resetAllSettings() {
        let domain = Bundle.main.bundleIdentifier!
        UserDefaults.standard.removePersistentDomain(forName: domain)
        UserDefaults.standard.synchronize()
        loginItemManager.setEnabled(false)
    }
}

// MARK: - Persona Card

struct PersonaCard: View {
    let persona: Persona
    let isDefault: Bool
    let onSetDefault: () -> Void
    
    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [persona.primaryColor, persona.secondaryColor],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 50, height: 50)
                
                Text(persona.initials)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
            }
            
            VStack(spacing: 2) {
                Text(persona.name)
                    .font(.headline)
                
                Text(persona.role)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            if isDefault {
                Text("Default")
                    .font(.caption2)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(persona.primaryColor.opacity(0.2)))
                    .foregroundColor(persona.primaryColor)
            } else {
                Button("Set Default") {
                    onSetDefault()
                }
                .buttonStyle(.borderless)
                .font(.caption)
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(nsColor: .controlBackgroundColor))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(isDefault ? persona.primaryColor : Color.clear, lineWidth: 2)
        )
    }
}

// MARK: - Audio Level Meter

struct AudioLevelMeter: View {
    let level: Float
    
    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.secondary.opacity(0.2))
                
                RoundedRectangle(cornerRadius: 4)
                    .fill(levelColor)
                    .frame(width: geometry.size.width * CGFloat(level))
            }
        }
    }
    
    private var levelColor: Color {
        if level > 0.8 {
            return .red
        } else if level > 0.5 {
            return .yellow
        } else {
            return .green
        }
    }
}

// MARK: - Permission Row

struct PermissionRow: View {
    let title: String
    let subtitle: String
    let isGranted: Bool
    let systemImage: String
    let onRequest: () -> Void
    let onOpenSettings: (() -> Void)?

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.title3)
                .foregroundColor(isGranted ? .green : .secondary)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body)
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            if isGranted {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.green)
            } else {
                Button("Grant") {
                    onRequest()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)

                if let openSettings = onOpenSettings {
                    Button {
                        openSettings()
                    } label: {
                        Image(systemName: "gear")
                    }
                    .buttonStyle(.borderless)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Audio Device Manager

class AudioDeviceManager: ObservableObject {
    @Published var inputDevices: [String] = []
    @Published var outputDevices: [String] = []
    @Published var selectedInputDevice: String = ""
    @Published var selectedOutputDevice: String = ""
    @Published var inputLevel: Float = 0.0
    
    func refreshDevices() {
        // Get available audio input devices using AVCaptureDevice
        if #available(macOS 14.0, *) {
            let discoverySession = AVCaptureDevice.DiscoverySession(
                deviceTypes: [.microphone, .builtInMicrophone, .externalUnknown],
                mediaType: .audio,
                position: .unspecified
            )
            inputDevices = discoverySession.devices.map { $0.localizedName }
        } else {
            // Fallback for macOS 13 - use default device
            if let defaultDevice = AVCaptureDevice.default(for: .audio) {
                inputDevices = [defaultDevice.localizedName]
            } else {
                inputDevices = ["Built-in Microphone"]
            }
        }
        
        // For output devices, we'd typically use CoreAudio
        // For simplicity, just list common outputs
        outputDevices = ["Built-in Output", "MacBook Pro Speakers", "External Headphones"]
    }
}

// MARK: - Settings Window Controller

class SettingsWindowController: NSWindowController {
    convenience init(voiceManager: DualModeVoiceManager) {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 500, height: 450),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        
        window.title = "Ferni Voice Settings"
        window.contentView = NSHostingView(rootView: SettingsView(voiceManager: voiceManager))
        window.center()
        window.isReleasedWhenClosed = false
        
        self.init(window: window)
    }
    
    func showWindow() {
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}

// MARK: - Preview

#Preview {
    SettingsView(voiceManager: DualModeVoiceManager())
}

