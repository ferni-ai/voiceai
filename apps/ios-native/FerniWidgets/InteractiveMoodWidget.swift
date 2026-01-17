import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Interactive Mood Widget
/// iOS 17+ Interactive Widget for mood check-ins.
/// Users can tap mood buttons directly on the Home Screen!
///
/// This creates the "Better Than Human" moment of:
/// - Gentle daily presence without opening the app
/// - Frictionless emotional check-in
/// - Building the habit of self-awareness

// MARK: - Interactive Entry

struct InteractiveMoodEntry: TimelineEntry {
    let date: Date
    let greeting: String
    let currentMood: MoodType?
    let streakDays: Int
    let lastCheckInRelative: String
    let hasCheckedInToday: Bool
}

// MARK: - Interactive Provider

struct InteractiveMoodProvider: TimelineProvider {
    func placeholder(in context: Context) -> InteractiveMoodEntry {
        InteractiveMoodEntry(
            date: Date(),
            greeting: "How are you?",
            currentMood: nil,
            streakDays: 0,
            lastCheckInRelative: "Tap to check in",
            hasCheckedInToday: false
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (InteractiveMoodEntry) -> Void) {
        completion(createEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<InteractiveMoodEntry>) -> Void) {
        let entry = createEntry()

        // Update every hour
        let nextUpdate = Calendar.current.date(byAdding: .hour, value: 1, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func createEntry() -> InteractiveMoodEntry {
        let defaults = UserDefaults(suiteName: "group.com.ferni.shared")

        let lastMoodString = defaults?.string(forKey: "lastMood")
        let currentMood = lastMoodString.flatMap { MoodType(rawValue: $0) }
        let streak = defaults?.integer(forKey: "checkInStreak") ?? 0

        let hasCheckedInToday = hasUserCheckedInToday(defaults)
        let lastCheckInText = getLastCheckInText(defaults)

        return InteractiveMoodEntry(
            date: Date(),
            greeting: getContextualGreeting(hasCheckedInToday: hasCheckedInToday, mood: currentMood),
            currentMood: hasCheckedInToday ? currentMood : nil,
            streakDays: streak,
            lastCheckInRelative: lastCheckInText,
            hasCheckedInToday: hasCheckedInToday
        )
    }

    private func hasUserCheckedInToday(_ defaults: UserDefaults?) -> Bool {
        guard let lastCheckIn = defaults?.object(forKey: "lastCheckIn") as? Date else {
            return false
        }
        return Calendar.current.isDateInToday(lastCheckIn)
    }

    private func getLastCheckInText(_ defaults: UserDefaults?) -> String {
        guard let lastDate = defaults?.object(forKey: "lastCheckIn") as? Date else {
            return "First time? Tap a mood!"
        }

        if Calendar.current.isDateInToday(lastDate) {
            return "Checked in today ✓"
        }

        let interval = Date().timeIntervalSince(lastDate)
        let days = Int(interval / 86400)

        if days == 1 {
            return "Yesterday"
        } else if days < 7 {
            return "\(days) days ago"
        } else {
            return "It's been a while"
        }
    }

    private func getContextualGreeting(hasCheckedInToday: Bool, mood: MoodType?) -> String {
        let hour = Calendar.current.component(.hour, from: Date())

        if hasCheckedInToday {
            switch mood {
            case .great, .good:
                return "Glad you're doing well!"
            case .okay:
                return "Hanging in there?"
            case .meh, .low:
                return "Here for you 💚"
            case .none:
                return "Thanks for checking in"
            }
        }

        // Time-based gentle prompts
        switch hour {
        case 5..<10:
            return ["How's the morning?", "Good morning!", "Starting the day..."].randomElement()!
        case 10..<14:
            return ["How's the day going?", "Midday check-in?", "Hey there"].randomElement()!
        case 14..<18:
            return ["Afternoon check-in?", "How's your day?", "Hey!"].randomElement()!
        case 18..<22:
            return ["How was today?", "Evening reflection?", "Wind down time"].randomElement()!
        default:
            return ["Can't sleep?", "Late night?", "I'm here"].randomElement()!
        }
    }
}

// MARK: - Interactive Widget Configuration

struct InteractiveMoodWidget: Widget {
    let kind: String = "InteractiveMoodWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: InteractiveMoodProvider()) { entry in
            InteractiveMoodWidgetView(entry: entry)
        }
        .configurationDisplayName("Mood Check-In")
        .description("Tap to check in with how you're feeling")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Widget View

struct InteractiveMoodWidgetView: View {
    var entry: InteractiveMoodEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        ZStack {
            // Warm gradient background
            LinearGradient(
                colors: backgroundColors,
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            VStack(alignment: .leading, spacing: family == .systemSmall ? 6 : 10) {
                // Header
                headerView

                Spacer()

                // Mood buttons or status
                if entry.hasCheckedInToday {
                    checkedInView
                } else {
                    moodButtonsView
                }
            }
            .padding(family == .systemSmall ? 12 : 16)
        }
        .containerBackground(for: .widget) {
            backgroundColors.first ?? Color(red: 0.1, green: 0.09, blue: 0.07)
        }
    }

    // MARK: - Subviews

    private var headerView: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.greeting)
                    .font(family == .systemSmall ? .subheadline : .headline)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)

                if family == .systemMedium {
                    Text(entry.lastCheckInRelative)
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.7))
                }
            }

            Spacer()

            if entry.streakDays > 0 {
                streakBadge
            }
        }
    }

    private var streakBadge: some View {
        HStack(spacing: 3) {
            Image(systemName: "flame.fill")
                .font(.caption2)
                .foregroundColor(.orange)
            Text("\(entry.streakDays)")
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundColor(.white)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(Color.white.opacity(0.2))
        .cornerRadius(10)
    }

    private var checkedInView: some View {
        VStack(spacing: 8) {
            if let mood = entry.currentMood {
                Text(mood.emoji)
                    .font(.system(size: family == .systemSmall ? 36 : 44))

                Text("Feeling \(mood.rawValue)")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.8))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var moodButtonsView: some View {
        HStack(spacing: family == .systemSmall ? 6 : 10) {
            ForEach(moods, id: \.rawValue) { mood in
                moodButton(for: mood)
            }
        }
    }

    private var moods: [MoodType] {
        if family == .systemSmall {
            return [.great, .okay, .low]  // Fewer options for small widget
        }
        return [.great, .good, .okay, .meh, .low]
    }

    private func moodButton(for mood: MoodType) -> some View {
        Button(intent: MoodCheckInIntent(mood: mood)) {
            VStack(spacing: 4) {
                Text(mood.emoji)
                    .font(.system(size: family == .systemSmall ? 22 : 26))

                if family == .systemMedium {
                    Text(mood.rawValue.capitalized)
                        .font(.system(size: 9))
                        .foregroundColor(.white.opacity(0.7))
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, family == .systemSmall ? 8 : 10)
            .background(mood.color.opacity(0.3))
            .cornerRadius(12)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Colors

    private var backgroundColors: [Color] {
        if let mood = entry.currentMood, entry.hasCheckedInToday {
            return [mood.color.opacity(0.8), mood.color.opacity(0.5)]
        }
        return [
            Color(red: 0.29, green: 0.40, blue: 0.25),  // Ferni sage
            Color(red: 0.24, green: 0.35, blue: 0.21)
        ]
    }
}

// MARK: - Preview

#if DEBUG
struct InteractiveMoodWidget_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            // Not checked in
            InteractiveMoodWidgetView(entry: InteractiveMoodEntry(
                date: Date(),
                greeting: "How's the morning?",
                currentMood: nil,
                streakDays: 5,
                lastCheckInRelative: "Yesterday",
                hasCheckedInToday: false
            ))
            .previewContext(WidgetPreviewContext(family: .systemSmall))
            .previewDisplayName("Small - Not Checked In")

            // Checked in - feeling good
            InteractiveMoodWidgetView(entry: InteractiveMoodEntry(
                date: Date(),
                greeting: "Glad you're doing well!",
                currentMood: .good,
                streakDays: 12,
                lastCheckInRelative: "Checked in today ✓",
                hasCheckedInToday: true
            ))
            .previewContext(WidgetPreviewContext(family: .systemMedium))
            .previewDisplayName("Medium - Checked In")

            // Medium - not checked in
            InteractiveMoodWidgetView(entry: InteractiveMoodEntry(
                date: Date(),
                greeting: "How's your day?",
                currentMood: nil,
                streakDays: 0,
                lastCheckInRelative: "First time? Tap a mood!",
                hasCheckedInToday: false
            ))
            .previewContext(WidgetPreviewContext(family: .systemMedium))
            .previewDisplayName("Medium - New User")
        }
    }
}
#endif
