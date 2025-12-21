import Foundation
import AppIntents

// MARK: - Shortcuts Service
/// Exposes Ferni actions to Shortcuts app and Siri
/// "Hey Siri, start a Ferni check-in"

// MARK: - App Intents

/// Start a voice check-in with Ferni
@available(macOS 13.0, *)
struct StartFerniCheckIn: AppIntent {
    static var title: LocalizedStringResource = "Start Ferni Check-in"
    static var description = IntentDescription("Start a voice conversation with Ferni")

    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        // Get the shared voice manager via NotificationCenter
        NotificationCenter.default.post(
            name: .startVoiceSession,
            object: nil,
            userInfo: ["persona": "ferni"]
        )

        return .result(dialog: "Starting conversation with Ferni...")
    }
}

/// Start a check-in with a specific persona
@available(macOS 13.0, *)
struct StartPersonaCheckIn: AppIntent {
    static var title: LocalizedStringResource = "Start Check-in with Persona"
    static var description = IntentDescription("Start a voice conversation with a specific team member")

    @Parameter(title: "Persona", description: "Which team member to talk to")
    var persona: PersonaEntity

    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        NotificationCenter.default.post(
            name: .startVoiceSession,
            object: nil,
            userInfo: ["persona": persona.id]
        )

        return .result(dialog: "Starting conversation with \(persona.name)...")
    }
}

/// End the current voice session
@available(macOS 13.0, *)
struct EndFerniSession: AppIntent {
    static var title: LocalizedStringResource = "End Ferni Session"
    static var description = IntentDescription("End the current voice conversation")

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        NotificationCenter.default.post(
            name: .endVoiceSession,
            object: nil
        )

        return .result(dialog: "Ending conversation...")
    }
}

/// Help me with selected text
@available(macOS 13.0, *)
struct HelpMeWithThis: AppIntent {
    static var title: LocalizedStringResource = "Help Me With This"
    static var description = IntentDescription("Ask Ferni to help with the currently selected text")

    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        NotificationCenter.default.post(
            name: .helpMeWithThis,
            object: nil
        )

        return .result(dialog: "Looking at what you have selected...")
    }
}

/// Switch to a different persona during conversation
@available(macOS 13.0, *)
struct SwitchPersona: AppIntent {
    static var title: LocalizedStringResource = "Switch Ferni Persona"
    static var description = IntentDescription("Switch to a different team member")

    @Parameter(title: "Persona", description: "Which team member to switch to")
    var persona: PersonaEntity

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        NotificationCenter.default.post(
            name: .switchPersona,
            object: nil,
            userInfo: ["persona": persona.id]
        )

        return .result(dialog: "Switching to \(persona.name)...")
    }
}

// MARK: - Persona Entity

@available(macOS 13.0, *)
struct PersonaEntity: AppEntity {
    let id: String
    let name: String
    let emoji: String
    let role: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Persona"

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(emoji) \(name)", subtitle: "\(role)")
    }

    static var defaultQuery = PersonaQuery()
}

@available(macOS 13.0, *)
struct PersonaQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [PersonaEntity] {
        return identifiers.compactMap { id in
            let persona = PersonaRegistry.get(id)
            return PersonaEntity(
                id: persona.id,
                name: persona.name,
                emoji: persona.emoji,
                role: persona.role
            )
        }
    }

    func suggestedEntities() async throws -> [PersonaEntity] {
        return PersonaRegistry.all.map { persona in
            PersonaEntity(
                id: persona.id,
                name: persona.name,
                emoji: persona.emoji,
                role: persona.role
            )
        }
    }

    func defaultResult() async -> PersonaEntity? {
        let ferni = PersonaRegistry.ferni
        return PersonaEntity(
            id: ferni.id,
            name: ferni.name,
            emoji: ferni.emoji,
            role: ferni.role
        )
    }
}

// MARK: - App Shortcuts Provider

@available(macOS 13.0, *)
struct FerniShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartFerniCheckIn(),
            phrases: [
                "Start a \(.applicationName) check-in",
                "Talk to \(.applicationName)",
                "Hey \(.applicationName)",
                "Start \(.applicationName)",
                "Open \(.applicationName) voice"
            ],
            shortTitle: "Start Check-in",
            systemImageName: "mic.circle.fill"
        )

        AppShortcut(
            intent: StartPersonaCheckIn(),
            phrases: [
                "Talk to \(\.$persona) in \(.applicationName)",
                "Start \(.applicationName) with \(\.$persona)",
                "Check in with \(\.$persona)"
            ],
            shortTitle: "Talk to Persona",
            systemImageName: "person.circle.fill"
        )

        AppShortcut(
            intent: HelpMeWithThis(),
            phrases: [
                "Help me with this in \(.applicationName)",
                "\(.applicationName) help me",
                "Ask \(.applicationName) about this"
            ],
            shortTitle: "Help Me",
            systemImageName: "questionmark.circle.fill"
        )

        AppShortcut(
            intent: EndFerniSession(),
            phrases: [
                "End \(.applicationName) session",
                "Stop talking to \(.applicationName)",
                "Close \(.applicationName)"
            ],
            shortTitle: "End Session",
            systemImageName: "xmark.circle.fill"
        )
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let startVoiceSession = Notification.Name("com.ferni.voice.startSession")
    static let endVoiceSession = Notification.Name("com.ferni.voice.endSession")
    static let switchPersona = Notification.Name("com.ferni.voice.switchPersona")
    static let helpMeWithThis = Notification.Name("com.ferni.voice.helpMeWithThis")
}

// MARK: - Shortcuts Service Class

/// Service that listens for Shortcut notifications and coordinates with voice manager
class ShortcutsService: ObservableObject {

    private var observers: [NSObjectProtocol] = []

    /// Callback when a shortcut requests starting a session
    var onStartSession: ((String) -> Void)?

    /// Callback when a shortcut requests ending a session
    var onEndSession: (() -> Void)?

    /// Callback when a shortcut requests switching persona
    var onSwitchPersona: ((String) -> Void)?

    /// Callback when "Help me with this" is triggered
    var onHelpMeWithThis: (() -> Void)?

    init() {
        setupObservers()
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    private func setupObservers() {
        let startObserver = NotificationCenter.default.addObserver(
            forName: .startVoiceSession,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            let persona = notification.userInfo?["persona"] as? String ?? "ferni"
            self?.onStartSession?(persona)
        }
        observers.append(startObserver)

        let endObserver = NotificationCenter.default.addObserver(
            forName: .endVoiceSession,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.onEndSession?()
        }
        observers.append(endObserver)

        let switchObserver = NotificationCenter.default.addObserver(
            forName: .switchPersona,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            if let persona = notification.userInfo?["persona"] as? String {
                self?.onSwitchPersona?(persona)
            }
        }
        observers.append(switchObserver)

        let helpObserver = NotificationCenter.default.addObserver(
            forName: .helpMeWithThis,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.onHelpMeWithThis?()
        }
        observers.append(helpObserver)
    }

    /// Register the shortcuts with the system
    /// Call this from app delegate on launch
    static func registerShortcuts() {
        if #available(macOS 13.0, *) {
            // AppShortcuts are automatically discovered, but we can update them
            FerniShortcuts.updateAppShortcutParameters()
        }
    }
}
