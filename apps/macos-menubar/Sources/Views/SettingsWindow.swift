import SwiftUI
import AVFoundation

// MARK: - Settings Window

/// Preferences/Settings window for Ferni Voice
struct SettingsView: View {
    @ObservedObject var voiceManager: DualModeVoiceManager
    @ObservedObject var loginItemManager = LoginItemManager.shared
    @StateObject private var audioDeviceManager = AudioDeviceManager()
    
    @AppStorage("defaultPersonaId") private var defaultPersonaId = "ferni"
    @AppStorage("globalHotkeyEnabled") private var globalHotkeyEnabled = true
    @AppStorage("showNotifications") private var showNotifications = true
    @AppStorage("playSounds") private var playSounds = true
    
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
    
    // MARK: - Advanced Tab
    
    private var advancedTab: some View {
        Form {
            Section {
                Picker("Backend", selection: $voiceManager.backendMode) {
                    ForEach(VoiceBackendMode.allCases) { mode in
                        HStack {
                            Image(systemName: mode.icon)
                            VStack(alignment: .leading) {
                                Text(mode.displayName)
                            }
                        }
                        .tag(mode)
                    }
                }
                .pickerStyle(.radioGroup)
                .help("Native SDK: Lower latency, better performance. CLI: Easier debugging.")
                
                Text(voiceManager.backendMode.description)
                    .font(.caption)
                    .foregroundColor(.secondary)
            } header: {
                Text("Voice Backend")
            }
            
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

