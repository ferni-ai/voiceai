import AppIntents

/// The End button on the Lock Screen and in the Dynamic Island. A Live
/// Activity intent runs in the app's process, where the app sets `end`.
struct EndCallIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "End call"
    static let isDiscoverable = false

    @MainActor static var end: (@MainActor () async -> Void)?

    func perform() async throws -> some IntentResult {
        let end = await Self.end
        await end?()
        return .result()
    }
}
