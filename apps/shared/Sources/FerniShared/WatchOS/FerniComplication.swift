import SwiftUI
import WidgetKit

// MARK: - Ferni Apple Watch Complication
/// Watch face complications for ambient Ferni presence.
/// Designed for glanceable emotional check-ins and quick conversation starts.
///
/// Complication Types:
/// - Mood indicator (shows current mood emoji)
/// - Streak counter (days of consistent check-ins)
/// - Quick start (tap to talk)
/// - Time since last check-in

// MARK: - Complication Entry

public struct FerniComplicationEntry: TimelineEntry {
    public let date: Date
    public let mood: MoodState
    public let streakDays: Int
    public let lastCheckIn: Date?
    public let greeting: String

    public init(
        date: Date,
        mood: MoodState = .unknown,
        streakDays: Int = 0,
        lastCheckIn: Date? = nil,
        greeting: String = "Hey"
    ) {
        self.date = date
        self.mood = mood
        self.streakDays = streakDays
        self.lastCheckIn = lastCheckIn
        self.greeting = greeting
    }

    public enum MoodState: String {
        case great, good, okay, meh, low, unknown

        public var emoji: String {
            switch self {
            case .great: return "😊"
            case .good: return "🙂"
            case .okay: return "😐"
            case .meh: return "😕"
            case .low: return "😔"
            case .unknown: return "💭"
            }
        }

        public var color: Color {
            switch self {
            case .great: return Color(red: 0.29, green: 0.60, blue: 0.35)
            case .good: return Color(red: 0.42, green: 0.60, blue: 0.29)
            case .okay: return Color(red: 0.60, green: 0.60, blue: 0.29)
            case .meh: return Color(red: 0.60, green: 0.48, blue: 0.29)
            case .low: return Color(red: 0.60, green: 0.35, blue: 0.29)
            case .unknown: return Color(red: 0.29, green: 0.40, blue: 0.25)
            }
        }

        public var description: String {
            switch self {
            case .great: return "Great"
            case .good: return "Good"
            case .okay: return "Okay"
            case .meh: return "Meh"
            case .low: return "Low"
            case .unknown: return "Check in"
            }
        }
    }
}

// MARK: - Complication Provider

public struct FerniComplicationProvider: TimelineProvider {
    public typealias Entry = FerniComplicationEntry

    public func placeholder(in context: Context) -> FerniComplicationEntry {
        FerniComplicationEntry(
            date: Date(),
            mood: .unknown,
            streakDays: 0,
            greeting: "Hey"
        )
    }

    public func getSnapshot(in context: Context, completion: @escaping (FerniComplicationEntry) -> Void) {
        let entry = createEntry()
        completion(entry)
    }

    public func getTimeline(in context: Context, completion: @escaping (Timeline<FerniComplicationEntry>) -> Void) {
        let entry = createEntry()

        // Update every hour
        let nextUpdate = Calendar.current.date(byAdding: .hour, value: 1, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func createEntry() -> FerniComplicationEntry {
        let defaults = UserDefaults(suiteName: "group.com.ferni.shared")

        // Load mood
        let moodString = defaults?.string(forKey: "lastMood") ?? "unknown"
        let mood = FerniComplicationEntry.MoodState(rawValue: moodString) ?? .unknown

        // Load streak
        let streak = defaults?.integer(forKey: "checkInStreak") ?? 0

        // Load last check-in
        let lastCheckIn = defaults?.object(forKey: "lastCheckIn") as? Date

        // Get time-based greeting
        let greeting = getGreeting()

        return FerniComplicationEntry(
            date: Date(),
            mood: mood,
            streakDays: streak,
            lastCheckIn: lastCheckIn,
            greeting: greeting
        )
    }

    private func getGreeting() -> String {
        let hour = Calendar.current.component(.hour, from: Date())

        switch hour {
        case 5..<12: return "Morning"
        case 12..<17: return "Hey"
        case 17..<21: return "Evening"
        default: return "Hey"
        }
    }
}

// MARK: - Complication Views

/// Circular complication (most common)
public struct FerniCircularComplication: View {
    let entry: FerniComplicationEntry

    public init(entry: FerniComplicationEntry) {
        self.entry = entry
    }

    public var body: some View {
        ZStack {
            // Background with mood color
            Circle()
                .fill(entry.mood.color.opacity(0.3))

            // Mood emoji
            Text(entry.mood.emoji)
                .font(.system(size: 22))
        }
        .widgetURL(URL(string: "ferni://checkin"))
    }
}

/// Corner complication (top corners of watch face)
public struct FerniCornerComplication: View {
    let entry: FerniComplicationEntry

    public init(entry: FerniComplicationEntry) {
        self.entry = entry
    }

    public var body: some View {
        ZStack {
            // Gauge showing streak progress
            if entry.streakDays > 0 {
                Gauge(value: min(Double(entry.streakDays), 7), in: 0...7) {
                    Text(entry.mood.emoji)
                }
                .gaugeStyle(.accessoryCircularCapacity)
                .tint(entry.mood.color)
            } else {
                Image(systemName: "bubble.left.fill")
                    .foregroundColor(entry.mood.color)
            }
        }
        .widgetURL(URL(string: "ferni://talk"))
    }
}

/// Rectangular complication (wider format)
public struct FerniRectangularComplication: View {
    let entry: FerniComplicationEntry

    public init(entry: FerniComplicationEntry) {
        self.entry = entry
    }

    public var body: some View {
        HStack(spacing: 8) {
            // Mood indicator
            Text(entry.mood.emoji)
                .font(.title2)

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.greeting)
                    .font(.headline)
                    .foregroundColor(.white)

                // Streak or last check-in
                if entry.streakDays > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "flame.fill")
                            .font(.caption2)
                            .foregroundColor(.orange)
                        Text("\(entry.streakDays) day streak")
                            .font(.caption2)
                            .foregroundColor(.gray)
                    }
                } else if let lastCheckIn = entry.lastCheckIn {
                    Text(timeAgo(from: lastCheckIn))
                        .font(.caption2)
                        .foregroundColor(.gray)
                } else {
                    Text("Tap to check in")
                        .font(.caption2)
                        .foregroundColor(.gray)
                }
            }

            Spacer()
        }
        .widgetURL(URL(string: "ferni://checkin"))
    }

    private func timeAgo(from date: Date) -> String {
        let interval = Date().timeIntervalSince(date)
        let hours = Int(interval / 3600)

        if hours < 1 {
            return "Just now"
        } else if hours < 24 {
            return "\(hours)h ago"
        } else {
            let days = hours / 24
            return "\(days)d ago"
        }
    }
}

/// Inline complication (text only)
public struct FerniInlineComplication: View {
    let entry: FerniComplicationEntry

    public init(entry: FerniComplicationEntry) {
        self.entry = entry
    }

    public var body: some View {
        HStack(spacing: 4) {
            Text(entry.mood.emoji)
            if entry.streakDays > 0 {
                Text("🔥 \(entry.streakDays)")
            } else {
                Text(entry.greeting)
            }
        }
        .widgetURL(URL(string: "ferni://talk"))
    }
}

// MARK: - Widget Configuration (watchOS 9+ / iOS 16+ Lock Screen)

#if !os(macOS)
/// Main widget for Apple Watch and iOS Lock Screen
public struct FerniWatchWidget: Widget {
    public let kind: String = "FerniWatchWidget"

    public init() {}

    public var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: kind,
            provider: FerniComplicationProvider()
        ) { entry in
            FerniWatchWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Ferni")
        .description("Quick access to mood check-ins and conversations")
        #if os(watchOS)
        .supportedFamilies([
            .accessoryCircular,
            .accessoryCorner,
            .accessoryRectangular,
            .accessoryInline
        ])
        #else
        .supportedFamilies([
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline
        ])
        #endif
    }
}

struct FerniWatchWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: FerniComplicationEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            FerniCircularComplication(entry: entry)
        #if os(watchOS)
        case .accessoryCorner:
            FerniCornerComplication(entry: entry)
        #endif
        case .accessoryRectangular:
            FerniRectangularComplication(entry: entry)
        case .accessoryInline:
            FerniInlineComplication(entry: entry)
        default:
            FerniCircularComplication(entry: entry)
        }
    }
}

// MARK: - Preview

#if DEBUG
struct FerniComplication_Previews: PreviewProvider {
    static var entry = FerniComplicationEntry(
        date: Date(),
        mood: .good,
        streakDays: 5,
        lastCheckIn: Date().addingTimeInterval(-3600),
        greeting: "Hey"
    )

    static var previews: some View {
        Group {
            FerniCircularComplication(entry: entry)
                .previewContext(WidgetPreviewContext(family: .accessoryCircular))
                .previewDisplayName("Circular")

            FerniRectangularComplication(entry: entry)
                .previewContext(WidgetPreviewContext(family: .accessoryRectangular))
                .previewDisplayName("Rectangular")

            FerniInlineComplication(entry: entry)
                .previewContext(WidgetPreviewContext(family: .accessoryInline))
                .previewDisplayName("Inline")
        }
    }
}
#endif  // DEBUG
#endif  // !os(macOS)
