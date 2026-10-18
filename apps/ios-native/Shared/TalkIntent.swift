import AppIntents

/// Who answers when you start a call from Siri, Shortcuts, Control Center or
/// the Action button.
enum Teammate: String, AppEnum {
    case ferni, maya, alex, jordan, peter, nayan

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Teammate"
    static let caseDisplayRepresentations: [Teammate: DisplayRepresentation] = [
        .ferni: "Ferni", .maya: "Maya", .alex: "Alex", .jordan: "Jordan", .peter: "Peter", .nayan: "Nayan",
    ]
}

/// "Talk to Ferni": opens the app and starts a call, through the same door as
/// the Talk button, so consent is asked first if it hasn't been given and a
/// teammate who isn't on your team yet means Ferni answers.
struct TalkIntent: AppIntent {
    static let title: LocalizedStringResource = "Talk to Ferni"
    static let description = IntentDescription("Start a conversation with Ferni or a teammate.")
    static let supportedModes: IntentModes = .foreground

    @Parameter(title: "Who", default: .ferni)
    var teammate: Teammate

    /// Set by the app; the intent runs in the app's process.
    @MainActor static var handler: (@MainActor (String) -> Void)?

    init() {}

    init(teammate: Teammate) {
        self.teammate = teammate
    }

    func perform() async throws -> some IntentResult {
        let handler = await Self.handler
        await handler?(teammate.rawValue)
        return .result()
    }
}
