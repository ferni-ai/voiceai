import AppIntents
import WidgetKit
import SwiftUI

// MARK: - Ferni Widget App Intents
/// iOS 17+ Interactive Widget intents for Better Than Human experience.
/// Users can check in their mood directly from the Home Screen!

// MARK: - Mood Types

enum MoodType: String, AppEnum {
    case great = "great"
    case good = "good"
    case okay = "okay"
    case meh = "meh"
    case low = "low"

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Mood")
    }

    static var caseDisplayRepresentations: [MoodType: DisplayRepresentation] {
        [
            .great: DisplayRepresentation(title: "Great", image: .init(systemName: "sun.max.fill")),
            .good: DisplayRepresentation(title: "Good", image: .init(systemName: "sun.min.fill")),
            .okay: DisplayRepresentation(title: "Okay", image: .init(systemName: "cloud.sun.fill")),
            .meh: DisplayRepresentation(title: "Meh", image: .init(systemName: "cloud.fill")),
            .low: DisplayRepresentation(title: "Low", image: .init(systemName: "cloud.rain.fill"))
        ]
    }

    var emoji: String {
        switch self {
        case .great: return "😊"
        case .good: return "🙂"
        case .okay: return "😐"
        case .meh: return "😕"
        case .low: return "😔"
        }
    }

    var color: Color {
        switch self {
        case .great: return Color(red: 0.29, green: 0.60, blue: 0.35)
        case .good: return Color(red: 0.42, green: 0.60, blue: 0.29)
        case .okay: return Color(red: 0.60, green: 0.60, blue: 0.29)
        case .meh: return Color(red: 0.60, green: 0.48, blue: 0.29)
        case .low: return Color(red: 0.60, green: 0.35, blue: 0.29)
        }
    }
}

// MARK: - Mood Check-In Intent

/// Records a mood check-in directly from the widget
struct MoodCheckInIntent: AppIntent {
    static var title: LocalizedStringResource = "Check In Mood"
    static var description = IntentDescription("Record how you're feeling")

    @Parameter(title: "Mood")
    var mood: MoodType

    init() {}

    init(mood: MoodType) {
        self.mood = mood
    }

    func perform() async throws -> some IntentResult {
        // Store the mood check-in
        let defaults = UserDefaults(suiteName: "group.com.ferni.shared")
        defaults?.set(mood.rawValue, forKey: "lastMood")
        defaults?.set(Date(), forKey: "lastCheckIn")

        // Update streak
        let currentStreak = defaults?.integer(forKey: "checkInStreak") ?? 0
        let lastCheckIn = defaults?.object(forKey: "previousCheckIn") as? Date

        if let last = lastCheckIn {
            let hoursSince = Date().timeIntervalSince(last) / 3600
            if hoursSince < 48 && hoursSince > 12 {
                // Within window, increment streak
                defaults?.set(currentStreak + 1, forKey: "checkInStreak")
            } else if hoursSince >= 48 {
                // Streak broken
                defaults?.set(1, forKey: "checkInStreak")
            }
        } else {
            defaults?.set(1, forKey: "checkInStreak")
        }

        defaults?.set(Date(), forKey: "previousCheckIn")

        // Refresh widget
        WidgetCenter.shared.reloadAllTimelines()

        return .result()
    }
}

// MARK: - Quick Start Conversation Intent

/// Starts a conversation with a specific context
struct QuickStartIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Conversation"
    static var description = IntentDescription("Start talking with Ferni")

    @Parameter(title: "Conversation Type")
    var conversationType: ConversationType

    init() {}

    init(type: ConversationType) {
        self.conversationType = type
    }

    func perform() async throws -> some IntentResult {
        // This will open the app with the appropriate deep link
        // The actual navigation is handled by the URL scheme
        return .result()
    }
}

enum ConversationType: String, AppEnum {
    case talk = "talk"
    case vent = "vent"
    case music = "music"
    case checkIn = "checkin"

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Conversation Type")
    }

    static var caseDisplayRepresentations: [ConversationType: DisplayRepresentation] {
        [
            .talk: DisplayRepresentation(title: "Talk", image: .init(systemName: "mic.fill")),
            .vent: DisplayRepresentation(title: "Vent", image: .init(systemName: "cloud.fill")),
            .music: DisplayRepresentation(title: "Music", image: .init(systemName: "music.note")),
            .checkIn: DisplayRepresentation(title: "Check In", image: .init(systemName: "heart.fill"))
        ]
    }
}

// MARK: - Ferni Shortcut Provider

struct FerniShortcutsProvider: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: MoodCheckInIntent(),
            phrases: [
                "Check in with \(.applicationName)",
                "How am I feeling in \(.applicationName)",
                "Mood check with \(.applicationName)"
            ],
            shortTitle: "Mood Check-In",
            systemImageName: "face.smiling"
        )

        AppShortcut(
            intent: QuickStartIntent(type: .talk),
            phrases: [
                "Talk to \(.applicationName)",
                "Start conversation with \(.applicationName)"
            ],
            shortTitle: "Talk to Ferni",
            systemImageName: "mic.fill"
        )
    }
}
