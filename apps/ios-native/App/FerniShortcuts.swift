import AppIntents

/// What Siri and Shortcuts offer without any setup.
struct FerniShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: TalkIntent(),
            phrases: [
                "Talk to \(.applicationName)",
                "Call \(.applicationName)",
                "Talk to \(\.$teammate) on \(.applicationName)",
            ],
            shortTitle: "Talk",
            systemImageName: "waveform"
        )
    }
}
