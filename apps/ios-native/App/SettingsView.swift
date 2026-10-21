import FerniDesign
import SwiftUI

/// Account and settings. Only what a person can use: no developer switches.
struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("About") {
                    LabeledContent("Version", value: Self.version)
                    Link("Privacy Policy", destination: URL(string: "https://ferni.ai/privacy")!)
                    Link("Terms of Service", destination: URL(string: "https://ferni.ai/terms")!)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .tint(FerniColor.accent)
        }
    }

    /// "1.0.0 (6)", from the built bundle rather than a typed-in string.
    static func version(_ info: [String: Any]? = Bundle.main.infoDictionary) -> String {
        let short = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(short) (\(build))"
    }

    private static var version: String { version() }
}

#Preview {
    SettingsView()
}
