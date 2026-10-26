import AppIntents

/// Mute the call from the Lock Screen or the Dynamic Island (gap 6). Mute only:
/// it runs on a locked phone for whoever is holding it, so unmuting takes the
/// person, in the app (#2868 item 45). Runs in the app, like EndCallIntent; the
/// app sets `mute` at launch (CallSession.muteFromLockScreen).
struct MuteCallIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Mute call"
    static let isDiscoverable = false

    @MainActor static var mute: (@MainActor () async -> Void)?

    func perform() async throws -> some IntentResult {
        let mute = await Self.mute
        await mute?()
        return .result()
    }
}
