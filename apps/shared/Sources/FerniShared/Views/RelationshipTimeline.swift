import SwiftUI

// MARK: - Relationship Timeline
/// A beautiful visualization of the user's journey with Ferni.
/// Not just a call log - a story of connection, milestones, and growth.
///
/// Design Philosophy:
/// - Emotional patterns over raw data
/// - Milestone moments that matter
/// - Warm, organic visual language
/// - Creates "remember when" nostalgia

// MARK: - Timeline Models

public struct TimelineEvent: Identifiable {
    public let id: UUID
    public let date: Date
    public let type: EventType
    public let title: String
    public let subtitle: String?
    public let mood: Mood?
    public let duration: TimeInterval?
    public let isMilestone: Bool

    public init(
        id: UUID = UUID(),
        date: Date,
        type: EventType,
        title: String,
        subtitle: String? = nil,
        mood: Mood? = nil,
        duration: TimeInterval? = nil,
        isMilestone: Bool = false
    ) {
        self.id = id
        self.date = date
        self.type = type
        self.title = title
        self.subtitle = subtitle
        self.mood = mood
        self.duration = duration
        self.isMilestone = isMilestone
    }

    public enum EventType {
        case conversation
        case milestone
        case moodCheckIn
        case achievement
        case memory
        case firstTime
    }

    public enum Mood: String, CaseIterable {
        case great, good, okay, meh, low

        public var color: Color {
            switch self {
            case .great: return Color(red: 0.29, green: 0.60, blue: 0.35)
            case .good: return Color(red: 0.42, green: 0.60, blue: 0.29)
            case .okay: return Color(red: 0.60, green: 0.60, blue: 0.29)
            case .meh: return Color(red: 0.60, green: 0.48, blue: 0.29)
            case .low: return Color(red: 0.60, green: 0.35, blue: 0.29)
            }
        }

        public var emoji: String {
            switch self {
            case .great: return "😊"
            case .good: return "🙂"
            case .okay: return "😐"
            case .meh: return "😕"
            case .low: return "😔"
            }
        }
    }
}

// MARK: - Timeline View

public struct RelationshipTimeline: View {
    let events: [TimelineEvent]
    let personaColor: Color

    @State private var selectedEvent: TimelineEvent?
    @State private var scrollOffset: CGFloat = 0

    public init(
        events: [TimelineEvent],
        personaColor: Color = Color(red: 0.29, green: 0.40, blue: 0.25)
    ) {
        self.events = events.sorted { $0.date > $1.date }
        self.personaColor = personaColor
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Header stats
                timelineHeader

                // Timeline
                LazyVStack(spacing: 0) {
                    ForEach(Array(events.enumerated()), id: \.element.id) { index, event in
                        TimelineEventRow(
                            event: event,
                            isFirst: index == 0,
                            isLast: index == events.count - 1,
                            personaColor: personaColor,
                            onTap: { selectedEvent = event }
                        )
                    }
                }
                .padding(.horizontal)
            }
        }
        .background(Color(red: 0.1, green: 0.09, blue: 0.07))
        .sheet(item: $selectedEvent) { event in
            EventDetailSheet(event: event, personaColor: personaColor)
        }
    }

    private var timelineHeader: some View {
        VStack(spacing: 16) {
            // Relationship summary
            HStack(spacing: 24) {
                statItem(
                    value: "\(daysSinceFirstEvent)",
                    label: "Days Together",
                    icon: "heart.fill"
                )

                statItem(
                    value: "\(events.filter { $0.type == .conversation }.count)",
                    label: "Conversations",
                    icon: "bubble.left.fill"
                )

                statItem(
                    value: "\(events.filter { $0.isMilestone }.count)",
                    label: "Milestones",
                    icon: "star.fill"
                )
            }
            .padding(.vertical, 20)

            // Mood trend (mini chart)
            moodTrendView
        }
        .padding()
        .background(Color(red: 0.12, green: 0.11, blue: 0.09))
    }

    private func statItem(value: String, label: String, icon: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(personaColor)

            Text(value)
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(.white)

            Text(label)
                .font(.caption)
                .foregroundColor(.gray)
        }
    }

    private var moodTrendView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Your Mood Journey")
                .font(.subheadline)
                .foregroundColor(.gray)

            MoodTrendChart(
                events: events.filter { $0.mood != nil },
                personaColor: personaColor
            )
            .frame(height: 60)
        }
    }

    private var daysSinceFirstEvent: Int {
        guard let firstDate = events.last?.date else { return 0 }
        return Calendar.current.dateComponents([.day], from: firstDate, to: Date()).day ?? 0
    }
}

// MARK: - Timeline Event Row

struct TimelineEventRow: View {
    let event: TimelineEvent
    let isFirst: Bool
    let isLast: Bool
    let personaColor: Color
    let onTap: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Timeline line and dot
            VStack(spacing: 0) {
                // Top line
                Rectangle()
                    .fill(isFirst ? Color.clear : Color.gray.opacity(0.3))
                    .frame(width: 2)
                    .frame(height: 20)

                // Event dot
                eventDot

                // Bottom line
                Rectangle()
                    .fill(isLast ? Color.clear : Color.gray.opacity(0.3))
                    .frame(width: 2)
            }
            .frame(width: 40)

            // Event content
            eventContent
                .padding(.vertical, 12)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
    }

    private var eventDot: some View {
        ZStack {
            if event.isMilestone {
                // Milestone: larger with glow
                Circle()
                    .fill(personaColor.opacity(0.3))
                    .frame(width: 24, height: 24)

                Circle()
                    .fill(personaColor)
                    .frame(width: 14, height: 14)

                Image(systemName: "star.fill")
                    .font(.system(size: 8))
                    .foregroundColor(.white)
            } else {
                // Regular event
                Circle()
                    .fill(event.mood?.color ?? personaColor.opacity(0.5))
                    .frame(width: 10, height: 10)
            }
        }
    }

    private var eventContent: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Date
            Text(event.date.formatted(date: .abbreviated, time: .omitted))
                .font(.caption)
                .foregroundColor(.gray)

            // Title
            HStack {
                Text(event.title)
                    .font(.subheadline)
                    .fontWeight(event.isMilestone ? .semibold : .regular)
                    .foregroundColor(.white)

                if event.isMilestone {
                    Image(systemName: "sparkles")
                        .font(.caption)
                        .foregroundColor(personaColor)
                }

                Spacer()

                // Mood emoji
                if let mood = event.mood {
                    Text(mood.emoji)
                        .font(.subheadline)
                }
            }

            // Subtitle
            if let subtitle = event.subtitle {
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(.gray)
                    .lineLimit(2)
            }

            // Duration badge
            if let duration = event.duration {
                HStack(spacing: 4) {
                    Image(systemName: "clock")
                        .font(.caption2)
                    Text(formatDuration(duration))
                        .font(.caption2)
                }
                .foregroundColor(.gray)
                .padding(.top, 4)
            }
        }
        .padding()
        .background(Color.white.opacity(0.05))
        .cornerRadius(12)
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds / 60)
        if minutes < 60 {
            return "\(minutes) min"
        } else {
            let hours = minutes / 60
            let remainingMinutes = minutes % 60
            return "\(hours)h \(remainingMinutes)m"
        }
    }
}

// MARK: - Mood Trend Chart

struct MoodTrendChart: View {
    let events: [TimelineEvent]
    let personaColor: Color

    var body: some View {
        GeometryReader { geometry in
            let sortedEvents = events.sorted { $0.date < $1.date }.suffix(30)
            let points = sortedEvents.enumerated().map { index, event -> CGPoint in
                let x = CGFloat(index) / max(CGFloat(sortedEvents.count - 1), 1) * geometry.size.width
                let y = moodToY(event.mood, in: geometry.size.height)
                return CGPoint(x: x, y: y)
            }

            ZStack {
                // Gradient fill under curve
                if points.count > 1 {
                    Path { path in
                        path.move(to: CGPoint(x: points[0].x, y: geometry.size.height))
                        path.addLine(to: points[0])
                        for point in points.dropFirst() {
                            path.addLine(to: point)
                        }
                        path.addLine(to: CGPoint(x: points.last!.x, y: geometry.size.height))
                        path.closeSubpath()
                    }
                    .fill(
                        LinearGradient(
                            colors: [personaColor.opacity(0.3), personaColor.opacity(0.05)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                }

                // Line
                if points.count > 1 {
                    Path { path in
                        path.move(to: points[0])
                        for point in points.dropFirst() {
                            path.addLine(to: point)
                        }
                    }
                    .stroke(personaColor, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                }

                // Dots
                ForEach(points.indices, id: \.self) { index in
                    Circle()
                        .fill(personaColor)
                        .frame(width: 6, height: 6)
                        .position(points[index])
                }
            }
        }
    }

    private func moodToY(_ mood: TimelineEvent.Mood?, in height: CGFloat) -> CGFloat {
        let moodValue: CGFloat
        switch mood {
        case .great: moodValue = 1.0
        case .good: moodValue = 0.75
        case .okay: moodValue = 0.5
        case .meh: moodValue = 0.25
        case .low: moodValue = 0.0
        case .none: moodValue = 0.5
        }
        return height * (1 - moodValue) * 0.8 + height * 0.1  // 10% padding
    }
}

// MARK: - Event Detail Sheet

struct EventDetailSheet: View {
    let event: TimelineEvent
    let personaColor: Color

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    // Event icon
                    eventIcon

                    // Title and date
                    VStack(spacing: 8) {
                        Text(event.title)
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundColor(.white)
                            .multilineTextAlignment(.center)

                        Text(event.date.formatted(date: .long, time: .shortened))
                            .font(.subheadline)
                            .foregroundColor(.gray)
                    }

                    // Mood and duration
                    if event.mood != nil || event.duration != nil {
                        HStack(spacing: 20) {
                            if let mood = event.mood {
                                VStack {
                                    Text(mood.emoji)
                                        .font(.title)
                                    Text("Mood")
                                        .font(.caption)
                                        .foregroundColor(.gray)
                                }
                            }

                            if let duration = event.duration {
                                VStack {
                                    Text(formatDuration(duration))
                                        .font(.title3)
                                        .fontWeight(.semibold)
                                        .foregroundColor(.white)
                                    Text("Duration")
                                        .font(.caption)
                                        .foregroundColor(.gray)
                                }
                            }
                        }
                        .padding()
                        .background(Color.white.opacity(0.05))
                        .cornerRadius(12)
                    }

                    // Subtitle/description
                    if let subtitle = event.subtitle {
                        Text(subtitle)
                            .font(.body)
                            .foregroundColor(.gray)
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.white.opacity(0.03))
                            .cornerRadius(12)
                    }
                }
                .padding()
            }
            .background(Color(red: 0.1, green: 0.09, blue: 0.07))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                #if os(iOS)
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(personaColor)
                }
                #else
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .foregroundColor(personaColor)
                }
                #endif
            }
        }
    }

    private var eventIcon: some View {
        ZStack {
            Circle()
                .fill(personaColor.opacity(0.2))
                .frame(width: 80, height: 80)

            Image(systemName: iconName)
                .font(.system(size: 32))
                .foregroundColor(personaColor)
        }
    }

    private var iconName: String {
        switch event.type {
        case .conversation: return "bubble.left.fill"
        case .milestone: return "star.fill"
        case .moodCheckIn: return "heart.fill"
        case .achievement: return "trophy.fill"
        case .memory: return "sparkles"
        case .firstTime: return "hands.sparkles.fill"
        }
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds / 60)
        if minutes < 60 {
            return "\(minutes)m"
        } else {
            let hours = minutes / 60
            let remainingMinutes = minutes % 60
            return "\(hours)h \(remainingMinutes)m"
        }
    }
}

// MARK: - Preview

#if DEBUG
struct RelationshipTimeline_Previews: PreviewProvider {
    static var sampleEvents: [TimelineEvent] = [
        TimelineEvent(
            date: Date(),
            type: .conversation,
            title: "Morning check-in",
            subtitle: "Talked about the week ahead",
            mood: .good,
            duration: 480
        ),
        TimelineEvent(
            date: Date().addingTimeInterval(-86400),
            type: .milestone,
            title: "10 days together! 🎉",
            subtitle: "You've been talking with Ferni for 10 days",
            isMilestone: true
        ),
        TimelineEvent(
            date: Date().addingTimeInterval(-86400 * 2),
            type: .conversation,
            title: "Late night talk",
            subtitle: "Couldn't sleep, talked through worries",
            mood: .meh,
            duration: 1200
        ),
        TimelineEvent(
            date: Date().addingTimeInterval(-86400 * 5),
            type: .firstTime,
            title: "First conversation",
            subtitle: "The beginning of our journey",
            mood: .okay,
            duration: 600,
            isMilestone: true
        )
    ]

    static var previews: some View {
        RelationshipTimeline(events: sampleEvents)
    }
}
#endif
