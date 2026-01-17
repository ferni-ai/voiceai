import WidgetKit
import SwiftUI

/// Ferni Widgets Bundle
/// Home screen presence for "Better Than Human" emotional support
///
/// Widget Types:
/// - InteractiveMoodWidget: iOS 17+ interactive mood check-in (tap moods directly!)
/// - MoodCheckInWidget: Legacy mood check-in (opens app)
/// - DailyInsightWidget: Daily wisdom/insight
/// - QuickAccessWidget: Quick action buttons
@main
struct FerniWidgetsBundle: WidgetBundle {
    var body: some Widget {
        InteractiveMoodWidget()  // iOS 17+ interactive!
        MoodCheckInWidget()
        DailyInsightWidget()
        QuickAccessWidget()
    }
}

// MARK: - Shared Timeline Provider

struct FerniEntry: TimelineEntry {
    let date: Date
    let greeting: String
    let insight: String
    let moodEmoji: String
    let streakDays: Int
    let lastCheckIn: String
}

struct FerniProvider: TimelineProvider {
    func placeholder(in context: Context) -> FerniEntry {
        FerniEntry(
            date: Date(),
            greeting: "Hey there",
            insight: "Take a moment to check in with yourself.",
            moodEmoji: "😊",
            streakDays: 0,
            lastCheckIn: "Tap to chat"
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (FerniEntry) -> Void) {
        let entry = createEntry()
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FerniEntry>) -> Void) {
        let entry = createEntry()

        // Update every 30 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func createEntry() -> FerniEntry {
        let defaults = UserDefaults(suiteName: "group.com.ferni.shared")

        let greeting = getTimeBasedGreeting()
        let insight = getDailyInsight()
        let streak = defaults?.integer(forKey: "checkInStreak") ?? 0
        let lastCheckIn = getLastCheckInText(defaults)

        return FerniEntry(
            date: Date(),
            greeting: greeting,
            insight: insight,
            moodEmoji: "😊",
            streakDays: streak,
            lastCheckIn: lastCheckIn
        )
    }

    private func getTimeBasedGreeting() -> String {
        let hour = Calendar.current.component(.hour, from: Date())

        switch hour {
        case 5..<12:
            return ["Good morning", "Rise and shine", "Morning"].randomElement()!
        case 12..<17:
            return ["Good afternoon", "Hey there", "Hi"].randomElement()!
        case 17..<21:
            return ["Good evening", "Hey", "Evening"].randomElement()!
        default:
            return ["Hey", "Hi there", "Hello"].randomElement()!
        }
    }

    private func getDailyInsight() -> String {
        let insights = [
            "Take a moment to breathe.",
            "How are you really feeling?",
            "You're doing better than you think.",
            "Be gentle with yourself today.",
            "What's on your mind?",
            "Remember: progress, not perfection.",
            "You've got this.",
            "One step at a time.",
            "It's okay to take a break.",
            "You matter."
        ]

        // Use day of year to get consistent daily insight
        let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 0
        return insights[dayOfYear % insights.count]
    }

    private func getLastCheckInText(_ defaults: UserDefaults?) -> String {
        guard let lastDate = defaults?.object(forKey: "lastCheckIn") as? Date else {
            return "Tap to check in"
        }

        let interval = Date().timeIntervalSince(lastDate)

        if interval < 3600 {
            return "Checked in recently"
        } else if interval < 86400 {
            let hours = Int(interval / 3600)
            return "\(hours)h ago"
        } else {
            let days = Int(interval / 86400)
            return "\(days)d ago"
        }
    }
}

// MARK: - Mood Check-In Widget

struct MoodCheckInWidget: Widget {
    let kind: String = "MoodCheckInWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FerniProvider()) { entry in
            MoodCheckInView(entry: entry)
        }
        .configurationDisplayName("Mood Check-In")
        .description("Quick access to check in with Ferni.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct MoodCheckInView: View {
    var entry: FerniEntry
    @Environment(\.widgetFamily) var family

    // Widget-specific colors (can't access main app's FerniColors)
    private let ferniPrimary = Color(red: 0.29, green: 0.40, blue: 0.25)
    private let ferniAccent = Color(red: 0.24, green: 0.35, blue: 0.27)

    var body: some View {
        ZStack {
            // Gradient background using Ferni sage colors
            LinearGradient(
                colors: [ferniPrimary, ferniAccent],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            VStack(alignment: .leading, spacing: 8) {
                // Ferni logo/icon
                HStack {
                    Image(systemName: "bubble.left.fill")
                        .font(.title2)
                        .foregroundColor(.white.opacity(0.9))

                    Text("Ferni")
                        .font(.headline)
                        .foregroundColor(.white)

                    Spacer()
                }

                Spacer()

                // Greeting
                Text(entry.greeting)
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)

                // Insight or prompt
                Text(entry.insight)
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.85))
                    .lineLimit(2)

                if family == .systemMedium {
                    Spacer()

                    HStack {
                        // Streak badge
                        if entry.streakDays > 0 {
                            HStack(spacing: 4) {
                                Image(systemName: "flame.fill")
                                    .foregroundColor(.orange)
                                Text("\(entry.streakDays) day streak")
                                    .font(.caption)
                                    .foregroundColor(.white.opacity(0.8))
                            }
                        }

                        Spacer()

                        // Last check-in
                        Text(entry.lastCheckIn)
                            .font(.caption)
                            .foregroundColor(.white.opacity(0.7))
                    }
                }
            }
            .padding()
        }
        .widgetURL(URL(string: "ferni://checkin"))
    }
}

// MARK: - Daily Insight Widget

struct DailyInsightWidget: Widget {
    let kind: String = "DailyInsightWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FerniProvider()) { entry in
            DailyInsightView(entry: entry)
        }
        .configurationDisplayName("Daily Insight")
        .description("A daily thought from Ferni.")
        .supportedFamilies([.systemSmall])
    }
}

struct DailyInsightView: View {
    var entry: FerniEntry

    // Widget-specific colors
    private let bgDark = Color(red: 0.12, green: 0.11, blue: 0.09)
    private let ferniTextLight = Color(red: 0.65, green: 0.79, blue: 0.60)

    var body: some View {
        ZStack {
            bgDark  // Dark background

            VStack(alignment: .leading, spacing: 12) {
                Image(systemName: "sparkles")
                    .font(.title2)
                    // WCAG AA contrast text color
                    .foregroundColor(ferniTextLight)

                Spacer()

                Text(entry.insight)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(.white)
                    .lineLimit(3)

                Text("— Ferni")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.6))
            }
            .padding()
        }
        .widgetURL(URL(string: "ferni://insight"))
    }
}

// MARK: - Quick Access Widget

struct QuickAccessWidget: Widget {
    let kind: String = "QuickAccessWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FerniProvider()) { entry in
            QuickAccessView(entry: entry)
        }
        .configurationDisplayName("Quick Access")
        .description("Quick actions with Ferni.")
        .supportedFamilies([.systemMedium])
    }
}

struct QuickAccessView: View {
    var entry: FerniEntry

    // Widget-specific colors
    private let bgDark = Color(red: 0.10, green: 0.09, blue: 0.07)
    private let ferniPrimary = Color(red: 0.29, green: 0.40, blue: 0.25)
    private let actionVent = Color(red: 0.42, green: 0.56, blue: 0.61)
    private let actionMusic = Color(red: 0.61, green: 0.56, blue: 0.42)
    private let actionCheckIn = Color(red: 0.61, green: 0.42, blue: 0.56)

    var body: some View {
        ZStack {
            bgDark

            HStack(spacing: 16) {
                // Talk button
                Link(destination: URL(string: "ferni://talk")!) {
                    QuickActionButton(
                        icon: "mic.fill",
                        label: "Talk",
                        color: ferniPrimary
                    )
                }

                // Vent button
                Link(destination: URL(string: "ferni://vent")!) {
                    QuickActionButton(
                        icon: "cloud.fill",
                        label: "Vent",
                        color: actionVent
                    )
                }

                // Music button
                Link(destination: URL(string: "ferni://music")!) {
                    QuickActionButton(
                        icon: "music.note",
                        label: "Music",
                        color: actionMusic
                    )
                }

                // Check-in button
                Link(destination: URL(string: "ferni://checkin")!) {
                    QuickActionButton(
                        icon: "heart.fill",
                        label: "Check In",
                        color: actionCheckIn
                    )
                }
            }
            .padding()
        }
    }
}

struct QuickActionButton: View {
    let icon: String
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(color)
                    .frame(width: 44, height: 44)

                Image(systemName: icon)
                    .font(.system(size: 18))
                    .foregroundColor(.white)
            }

            Text(label)
                .font(.caption2)
                .foregroundColor(.white.opacity(0.8))
        }
    }
}

// MARK: - Preview Provider

struct FerniWidgets_Previews: PreviewProvider {
    static var previews: some View {
        let entry = FerniEntry(
            date: Date(),
            greeting: "Good morning",
            insight: "Take a moment to breathe.",
            moodEmoji: "😊",
            streakDays: 5,
            lastCheckIn: "2h ago"
        )

        Group {
            MoodCheckInView(entry: entry)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("Mood - Small")

            MoodCheckInView(entry: entry)
                .previewContext(WidgetPreviewContext(family: .systemMedium))
                .previewDisplayName("Mood - Medium")

            DailyInsightView(entry: entry)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("Insight")

            QuickAccessView(entry: entry)
                .previewContext(WidgetPreviewContext(family: .systemMedium))
                .previewDisplayName("Quick Access")
        }
    }
}
