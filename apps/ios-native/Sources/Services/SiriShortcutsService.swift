import Foundation
import Intents
import os

/// Siri Shortcuts service for voice-activated Ferni access
/// Enables "Hey Siri, I need Ferni" for instant emotional support
@MainActor
final class SiriShortcutsService: ObservableObject {
    static let shared = SiriShortcutsService()

    // MARK: - Shortcut Identifiers

    enum ShortcutType: String, CaseIterable {
        case talkToFerni = "com.ferni.talk"
        case needSupport = "com.ferni.support"
        case checkIn = "com.ferni.checkin"
        case playCalming = "com.ferni.music.calming"
        case morningRoutine = "com.ferni.routine.morning"
        case eveningReflection = "com.ferni.routine.evening"
        case quickVent = "com.ferni.vent"
        case gratitude = "com.ferni.gratitude"

        var title: String {
            switch self {
            case .talkToFerni: return "Talk to Ferni"
            case .needSupport: return "I need support"
            case .checkIn: return "Daily check-in"
            case .playCalming: return "Play calming music"
            case .morningRoutine: return "Morning routine"
            case .eveningReflection: return "Evening reflection"
            case .quickVent: return "Quick vent"
            case .gratitude: return "Gratitude moment"
            }
        }

        var suggestedPhrase: String {
            switch self {
            case .talkToFerni: return "Talk to Ferni"
            case .needSupport: return "I need Ferni"
            case .checkIn: return "Check in with Ferni"
            case .playCalming: return "Ferni play calming music"
            case .morningRoutine: return "Start my morning with Ferni"
            case .eveningReflection: return "Evening reflection with Ferni"
            case .quickVent: return "Ferni I need to vent"
            case .gratitude: return "Gratitude with Ferni"
            }
        }

        var description: String {
            switch self {
            case .talkToFerni: return "Start a conversation with Ferni"
            case .needSupport: return "Get immediate emotional support"
            case .checkIn: return "How are you doing today?"
            case .playCalming: return "Play relaxing music to help you unwind"
            case .morningRoutine: return "Start your day with intention"
            case .eveningReflection: return "Reflect on your day"
            case .quickVent: return "Get something off your chest"
            case .gratitude: return "Notice something you're grateful for"
            }
        }
    }

    // MARK: - Published State

    @Published private(set) var donatedShortcuts: Set<ShortcutType> = []
    @Published private(set) var pendingShortcut: ShortcutType?

    // MARK: - Private

    private let logger = Logger(subsystem: "com.ferni.FerniVoice", category: "SiriShortcuts")

    // MARK: - Initialization

    private init() {
        Task {
            await donateAllShortcuts()
        }
    }

    // MARK: - Shortcut Donation

    /// Donate all available shortcuts to Siri
    func donateAllShortcuts() async {
        for shortcut in ShortcutType.allCases {
            await donateShortcut(shortcut)
        }
    }

    /// Donate a specific shortcut to Siri
    func donateShortcut(_ type: ShortcutType) async {
        let activity = NSUserActivity(activityType: type.rawValue)
        activity.title = type.title
        activity.suggestedInvocationPhrase = type.suggestedPhrase
        activity.isEligibleForSearch = true
        activity.isEligibleForPrediction = true
        activity.persistentIdentifier = type.rawValue

        // Add metadata for better Siri understanding
        activity.userInfo = [
            "shortcutType": type.rawValue,
            "description": type.description
        ]

        // Make the activity current to donate it
        activity.becomeCurrent()

        donatedShortcuts.insert(type)
        logger.info("Donated shortcut: \(type.rawValue)")
    }

    /// Donate a shortcut after user performs an action (reinforces learning)
    func donateAfterAction(_ type: ShortcutType) async {
        await donateShortcut(type)

        // Also create an INInteraction for richer Siri learning
        let intent = createIntent(for: type)
        let interaction = INInteraction(intent: intent, response: nil)

        do {
            try await interaction.donate()
            logger.info("Donated interaction for: \(type.rawValue)")
        } catch {
            logger.error("Failed to donate interaction: \(error.localizedDescription)")
        }
    }

    // MARK: - Handle Incoming Shortcuts

    /// Handle a shortcut invocation from Siri
    func handleShortcut(_ activityType: String) -> ShortcutType? {
        guard let shortcut = ShortcutType(rawValue: activityType) else {
            logger.warning("Unknown shortcut type: \(activityType)")
            return nil
        }

        pendingShortcut = shortcut
        logger.info("Handling shortcut: \(shortcut.rawValue)")

        return shortcut
    }

    /// Clear the pending shortcut after it's been handled
    func clearPendingShortcut() {
        pendingShortcut = nil
    }

    /// Get the initial message for a shortcut type
    func getInitialMessage(for type: ShortcutType) -> String {
        switch type {
        case .talkToFerni:
            return ""  // Let Ferni greet naturally
        case .needSupport:
            return "I'm having a hard time right now."
        case .checkIn:
            return "I'd like to check in."
        case .playCalming:
            return "Can you play some calming music?"
        case .morningRoutine:
            return "Let's start my morning routine."
        case .eveningReflection:
            return "I'd like to reflect on my day."
        case .quickVent:
            return "I need to get something off my chest."
        case .gratitude:
            return "I want to practice gratitude."
        }
    }

    // MARK: - Private Helpers

    private func createIntent(for type: ShortcutType) -> INIntent {
        // Use a generic intent for now
        // In production, create custom INIntent subclasses for richer experiences
        let intent = INSearchForMessagesIntent()
        intent.suggestedInvocationPhrase = type.suggestedPhrase
        return intent
    }
}

// MARK: - App Delegate Integration

extension SiriShortcutsService {
    /// Call this from SceneDelegate or App to handle incoming activities
    func handleUserActivity(_ activity: NSUserActivity) -> Bool {
        guard let shortcut = handleShortcut(activity.activityType) else {
            return false
        }

        // The shortcut is stored in pendingShortcut
        // The voice session will pick it up and start appropriately
        logger.info("User activity handled: \(shortcut.title)")
        return true
    }
}

// MARK: - Voice Session Integration

extension SiriShortcutsService {
    /// Get context for the voice agent based on how the session started
    func getSessionContext() -> [String: Any]? {
        guard let shortcut = pendingShortcut else {
            return nil
        }

        return [
            "shortcutType": shortcut.rawValue,
            "shortcutTitle": shortcut.title,
            "initialMessage": getInitialMessage(for: shortcut),
            "source": "siri_shortcut"
        ]
    }
}
