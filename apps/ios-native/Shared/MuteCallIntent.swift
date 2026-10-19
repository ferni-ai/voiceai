import AppIntents

/// Mute or unmute the call from the Lock Screen or the Dynamic Island (gap 6).
/// Runs in the app, like EndCallIntent; the app sets `toggle` at launch.
struct MuteCallIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Mute call"
    static let isDiscoverable = false

    @MainActor static var toggle: (@MainActor () async -> Void)?

    func perform() async throws -> some IntentResult {
        let toggle = await Self.toggle
        await toggle?()
        return .result()
    }
}
