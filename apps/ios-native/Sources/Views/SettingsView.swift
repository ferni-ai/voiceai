import SwiftUI
import FerniShared

// MARK: - Settings View
/// App settings including audio, account, and about information.

struct SettingsView: View {
    @EnvironmentObject var session: IOSLiveKitSession
    @Environment(\.dismiss) var dismiss

    @AppStorage("useCloudMode") private var useCloudMode = true
    @AppStorage("autoConnect") private var autoConnect = false

    var body: some View {
        NavigationView {
            List {
                // Audio Section
                Section {
                    Toggle("Auto-connect on launch", isOn: $autoConnect)

                    HStack {
                        Text("Audio Output")
                        Spacer()
                        Text("Speaker")
                            .foregroundColor(.secondary)
                    }
                } header: {
                    Text("Audio")
                }

                // Server Section
                Section {
                    Toggle("Use Cloud Server", isOn: $useCloudMode)

                    HStack {
                        Text("Server")
                        Spacer()
                        Text(useCloudMode ? "app.ferni.ai" : "localhost")
                            .foregroundColor(.secondary)
                            .font(.system(.body, design: .monospaced))
                    }
                } header: {
                    Text("Connection")
                } footer: {
                    Text("Cloud mode connects to Ferni's servers. Disable for local development.")
                }

                // Current Persona Section
                Section {
                    HStack {
                        // Persona avatar
                        ZStack {
                            Circle()
                                .fill(
                                    LinearGradient(
                                        colors: [session.currentPersona.primaryColor, session.currentPersona.secondaryColor],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 44, height: 44)

                            Text(session.currentPersona.initials)
                                .font(.system(size: 16, weight: .semibold, design: .rounded))
                                .foregroundColor(.white)
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            Text(session.currentPersona.name)
                                .font(.headline)
                            Text(session.currentPersona.role)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        .padding(.leading, 8)
                    }
                    .padding(.vertical, 4)
                } header: {
                    Text("Current Guide")
                }

                // About Section
                Section {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.0.0")
                            .foregroundColor(.secondary)
                    }

                    HStack {
                        Text("Build")
                        Spacer()
                        Text("1")
                            .foregroundColor(.secondary)
                    }

                    Link("Privacy Policy", destination: URL(string: "https://ferni.ai/privacy")!)

                    Link("Terms of Service", destination: URL(string: "https://ferni.ai/terms")!)
                } header: {
                    Text("About")
                }

                // Debug Section (only in DEBUG builds)
                #if DEBUG
                Section {
                    Button("Clear Transcript") {
                        // Would need to add a method to IOSLiveKitSession
                    }

                    HStack {
                        Text("Connection State")
                        Spacer()
                        Text(session.state.title)
                            .foregroundColor(.secondary)
                    }
                } header: {
                    Text("Debug")
                }
                #endif
            }
            .navigationTitle("Settings")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            #else
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            #endif
        }
        .preferredColorScheme(.dark)
    }
}

// MARK: - Preview

#Preview {
    SettingsView()
        .environmentObject(IOSLiveKitSession())
}
