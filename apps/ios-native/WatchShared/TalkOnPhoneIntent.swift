import AppIntents

/// "Talk to Ferni" from the wrist: opens the watch app, which asks the phone
/// to start the call (through the phone's consent).
struct TalkOnPhoneIntent: AppIntent {
    static let title: LocalizedStringResource = "Talk to Ferni"
    static let description = IntentDescription("Start a conversation with Ferni on your iPhone.")
    static let openAppWhenRun = true

    /// Set by the watch app at launch.
    @MainActor static var handler: (@MainActor () -> Void)?

    init() {}

    func perform() async throws -> some IntentResult {
        await MainActor.run { Self.handler?() }
        return .result()
    }
}
