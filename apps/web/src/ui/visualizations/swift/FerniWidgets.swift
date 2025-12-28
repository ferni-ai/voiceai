// MARK: - Ferni iOS Widgets
// Beautiful widgets that bring Ferni's presence to home and lock screens
//
// Widget Types:
// - Small: Avatar with daily insight
// - Medium: Avatar + energy levels + streak
// - Large: Full story preview with mood calendar
// - Lock Screen: Compact avatar, inline stats, circular energy
//
// Design Philosophy:
// - Widgets should feel like a gentle reminder of connection
// - The avatar should feel alive even in static form
// - Insights should be warm and personal, not data-driven

import WidgetKit
import SwiftUI

// MARK: - Widget Entry

struct FerniWidgetEntry: TimelineEntry {
    let date: Date
    let greeting: String
    let insight: String
    let energyData: EnergyRingsData
    let streak: Int
    let mood: AvatarMood
    let userName: String?
}

// MARK: - Timeline Provider

struct FerniTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> FerniWidgetEntry {
        FerniWidgetEntry(
            date: Date(),
            greeting: "Good morning",
            insight: "Today is a new opportunity",
            energyData: EnergyRingsData(emotional: 75, mental: 80, physical: 70, overall: 75),
            streak: 7,
            mood: .calm,
            userName: nil
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (FerniWidgetEntry) -> Void) {
        let entry = createEntry(for: Date())
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FerniWidgetEntry>) -> Void) {
        var entries: [FerniWidgetEntry] = []

        // Generate entries for every hour
        let currentDate = Date()
        for hourOffset in 0..<24 {
            let entryDate = Calendar.current.date(byAdding: .hour, value: hourOffset, to: currentDate)!
            let entry = createEntry(for: entryDate)
            entries.append(entry)
        }

        let timeline = Timeline(entries: entries, policy: .atEnd)
        completion(timeline)
    }

    private func createEntry(for date: Date) -> FerniWidgetEntry {
        let hour = Calendar.current.component(.hour, from: date)

        // Time-based greeting
        let greeting: String
        if hour >= 5 && hour < 12 {
            greeting = "Good morning"
        } else if hour >= 12 && hour < 17 {
            greeting = "Good afternoon"
        } else if hour >= 17 && hour < 21 {
            greeting = "Good evening"
        } else {
            greeting = "Peaceful night"
        }

        // Time-based insights (would be personalized from backend)
        let insights = [
            "Take a moment to breathe today",
            "You're doing better than you think",
            "Small steps lead to big changes",
            "Remember what matters most",
            "Today is a gift to yourself",
            "You've got this",
            "One conversation at a time",
            "Growth happens in small moments"
        ]

        let insight = insights[Calendar.current.component(.day, from: date) % insights.count]

        // Time-based mood
        let mood: AvatarMood
        if hour >= 22 || hour < 6 {
            mood = .calm
        } else if hour >= 6 && hour < 10 {
            mood = .curious
        } else if hour >= 10 && hour < 14 {
            mood = .joyful
        } else if hour >= 14 && hour < 18 {
            mood = .listening
        } else {
            mood = .caring
        }

        return FerniWidgetEntry(
            date: date,
            greeting: greeting,
            insight: insight,
            energyData: EnergyRingsData(emotional: 75, mental: 80, physical: 70, overall: 75),
            streak: 7,
            mood: mood,
            userName: nil // Would come from app storage
        )
    }
}

// MARK: - Small Widget View

struct FerniSmallWidgetView: View {
    let entry: FerniWidgetEntry

    var body: some View {
        ZStack {
            // Background
            ContainerRelativeShape()
                .fill(
                    LinearGradient(
                        colors: [
                            FerniColors.ferni.opacity(0.9),
                            FerniColors.accent
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            VStack(spacing: 8) {
                // Avatar
                FerniCompactAvatarView(size: 48, mood: entry.mood, showGlow: false)

                // Greeting
                Text(entry.greeting)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.9))

                // Insight
                Text(entry.insight)
                    .font(.system(size: 11, weight: .regular))
                    .foregroundColor(.white.opacity(0.7))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .padding(.horizontal, 8)
            }
            .padding(12)
        }
    }
}

// MARK: - Medium Widget View

struct FerniMediumWidgetView: View {
    let entry: FerniWidgetEntry

    var body: some View {
        ZStack {
            // Background
            ContainerRelativeShape()
                .fill(
                    LinearGradient(
                        colors: [
                            FerniColors.ferni.opacity(0.9),
                            FerniColors.accent
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            HStack(spacing: 16) {
                // Left: Avatar + greeting
                VStack(spacing: 8) {
                    FerniCompactAvatarView(size: 56, mood: entry.mood, showGlow: false)

                    VStack(spacing: 2) {
                        Text(entry.greeting)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.white.opacity(0.9))

                        Text(entry.insight)
                            .font(.system(size: 11, weight: .regular))
                            .foregroundColor(.white.opacity(0.7))
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity)

                // Divider
                Rectangle()
                    .fill(.white.opacity(0.2))
                    .frame(width: 1)
                    .padding(.vertical, 16)

                // Right: Stats
                VStack(spacing: 12) {
                    // Energy preview
                    HStack(spacing: 4) {
                        EnergyDot(value: entry.energyData.emotional, color: FerniColors.energy.emotional)
                        EnergyDot(value: entry.energyData.mental, color: FerniColors.energy.mental)
                        EnergyDot(value: entry.energyData.physical, color: FerniColors.energy.physical)
                    }

                    // Streak
                    if entry.streak > 0 {
                        HStack(spacing: 4) {
                            Image(systemName: "flame.fill")
                                .font(.system(size: 14))
                                .foregroundColor(.orange)

                            Text("\(entry.streak) days")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.white)
                        }
                    }

                    // Overall energy
                    Text("\(entry.energyData.overall)%")
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                }
                .frame(maxWidth: .infinity)
            }
            .padding(16)
        }
    }
}

// MARK: - Large Widget View

struct FerniLargeWidgetView: View {
    let entry: FerniWidgetEntry

    var body: some View {
        ZStack {
            // Background
            ContainerRelativeShape()
                .fill(FerniColors.background)

            VStack(spacing: 16) {
                // Header
                HStack {
                    FerniCompactAvatarView(size: 40, mood: entry.mood, showGlow: true)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.greeting)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(FerniColors.textPrimary)

                        Text(entry.insight)
                            .font(.system(size: 13, weight: .regular))
                            .foregroundColor(FerniColors.textSecondary)
                    }

                    Spacer()

                    if entry.streak > 0 {
                        StreakFlameView(streakCount: entry.streak, size: 24)
                    }
                }

                Divider()

                // Energy rings preview
                HStack(spacing: 24) {
                    VStack(spacing: 4) {
                        Text("\(entry.energyData.emotional)%")
                            .font(.system(size: 18, weight: .bold, design: .rounded))
                            .foregroundColor(FerniColors.energy.emotional)
                        Text("Emotional")
                            .font(.system(size: 11))
                            .foregroundColor(FerniColors.textMuted)
                    }

                    VStack(spacing: 4) {
                        Text("\(entry.energyData.mental)%")
                            .font(.system(size: 18, weight: .bold, design: .rounded))
                            .foregroundColor(FerniColors.energy.mental)
                        Text("Mental")
                            .font(.system(size: 11))
                            .foregroundColor(FerniColors.textMuted)
                    }

                    VStack(spacing: 4) {
                        Text("\(entry.energyData.physical)%")
                            .font(.system(size: 18, weight: .bold, design: .rounded))
                            .foregroundColor(FerniColors.energy.physical)
                        Text("Physical")
                            .font(.system(size: 11))
                            .foregroundColor(FerniColors.textMuted)
                    }
                }

                Divider()

                // Mini mood calendar (last 7 days)
                HStack(spacing: 8) {
                    ForEach(0..<7, id: \.self) { day in
                        VStack(spacing: 4) {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(dayColor(for: day))
                                .frame(width: 32, height: 32)

                            Text(dayLabel(for: day))
                                .font(.system(size: 10))
                                .foregroundColor(FerniColors.textMuted)
                        }
                    }
                }

                Spacer()

                // Tap to open
                Text("Tap to talk with Ferni")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(FerniColors.accent)
            }
            .padding(16)
        }
    }

    private func dayColor(for offset: Int) -> Color {
        let colors: [Color] = [
            FerniColors.moods.calm,
            FerniColors.moods.joyful,
            FerniColors.moods.calm,
            FerniColors.moods.focused,
            FerniColors.moods.calm,
            FerniColors.moods.tired,
            FerniColors.moods.calm
        ]
        return colors[offset].opacity(0.6)
    }

    private func dayLabel(for offset: Int) -> String {
        let date = Calendar.current.date(byAdding: .day, value: offset - 6, to: Date())!
        let formatter = DateFormatter()
        formatter.dateFormat = "E"
        return String(formatter.string(from: date).prefix(1))
    }
}

// MARK: - Lock Screen Widgets

struct FerniLockScreenCircularView: View {
    let entry: FerniWidgetEntry

    var body: some View {
        ZStack {
            // Background ring
            Circle()
                .stroke(Color.white.opacity(0.2), lineWidth: 4)

            // Energy ring
            Circle()
                .trim(from: 0, to: CGFloat(entry.energyData.overall) / 100)
                .stroke(FerniColors.ferni, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))

            // Avatar
            FerniCompactAvatarView(size: 32, mood: entry.mood, showGlow: false)
        }
    }
}

struct FerniLockScreenRectangularView: View {
    let entry: FerniWidgetEntry

    var body: some View {
        HStack(spacing: 8) {
            FerniCompactAvatarView(size: 32, mood: entry.mood, showGlow: false)

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.greeting)
                    .font(.system(size: 13, weight: .semibold))

                HStack(spacing: 8) {
                    if entry.streak > 0 {
                        HStack(spacing: 2) {
                            Image(systemName: "flame.fill")
                                .font(.system(size: 10))
                            Text("\(entry.streak)")
                                .font(.system(size: 11, weight: .medium))
                        }
                    }

                    Text("\(entry.energyData.overall)%")
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundColor(.secondary)
            }
        }
    }
}

struct FerniLockScreenInlineView: View {
    let entry: FerniWidgetEntry

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "heart.fill")
                .foregroundColor(FerniColors.ferni)

            Text(entry.insight)
                .lineLimit(1)
        }
    }
}

// MARK: - Helper Views

struct EnergyDot: View {
    let value: Int
    let color: Color

    var body: some View {
        ZStack {
            Circle()
                .fill(color.opacity(0.3))
                .frame(width: 24, height: 24)

            Circle()
                .fill(color)
                .frame(width: CGFloat(value) / 100 * 18 + 6)
        }
    }
}

// MARK: - Widget Configurations

struct FerniSmallWidget: Widget {
    let kind: String = "FerniSmall"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FerniTimelineProvider()) { entry in
            FerniSmallWidgetView(entry: entry)
        }
        .configurationDisplayName("Ferni")
        .description("A gentle reminder that Ferni is here")
        .supportedFamilies([.systemSmall])
    }
}

struct FerniMediumWidget: Widget {
    let kind: String = "FerniMedium"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FerniTimelineProvider()) { entry in
            FerniMediumWidgetView(entry: entry)
        }
        .configurationDisplayName("Ferni + Stats")
        .description("Your energy levels and streak at a glance")
        .supportedFamilies([.systemMedium])
    }
}

struct FerniLargeWidget: Widget {
    let kind: String = "FerniLarge"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FerniTimelineProvider()) { entry in
            FerniLargeWidgetView(entry: entry)
        }
        .configurationDisplayName("Your Story")
        .description("A preview of your journey with Ferni")
        .supportedFamilies([.systemLarge])
    }
}

struct FerniLockScreenWidget: Widget {
    let kind: String = "FerniLockScreen"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FerniTimelineProvider()) { entry in
            // Would use accessory family detection here
            FerniLockScreenCircularView(entry: entry)
        }
        .configurationDisplayName("Ferni")
        .description("Ferni on your lock screen")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - Widget Bundle

@main
struct FerniWidgetBundle: WidgetBundle {
    var body: some Widget {
        FerniSmallWidget()
        FerniMediumWidget()
        FerniLargeWidget()
        FerniLockScreenWidget()
    }
}

// MARK: - Preview

#Preview("Small Widget") {
    FerniSmallWidgetView(entry: FerniWidgetEntry(
        date: Date(),
        greeting: "Good morning",
        insight: "Today is a new opportunity",
        energyData: EnergyRingsData(emotional: 75, mental: 80, physical: 70, overall: 75),
        streak: 7,
        mood: .calm,
        userName: "Seth"
    ))
    .frame(width: 155, height: 155)
}

#Preview("Medium Widget") {
    FerniMediumWidgetView(entry: FerniWidgetEntry(
        date: Date(),
        greeting: "Good afternoon",
        insight: "You're doing great",
        energyData: EnergyRingsData(emotional: 82, mental: 75, physical: 68, overall: 75),
        streak: 14,
        mood: .joyful,
        userName: nil
    ))
    .frame(width: 329, height: 155)
}

#Preview("Large Widget") {
    FerniLargeWidgetView(entry: FerniWidgetEntry(
        date: Date(),
        greeting: "Good evening",
        insight: "Time to unwind",
        energyData: EnergyRingsData(emotional: 70, mental: 65, physical: 75, overall: 70),
        streak: 30,
        mood: .caring,
        userName: "Seth"
    ))
    .frame(width: 329, height: 345)
}

#Preview("Lock Screen Widgets") {
    HStack(spacing: 20) {
        FerniLockScreenCircularView(entry: FerniWidgetEntry(
            date: Date(),
            greeting: "Morning",
            insight: "Breathe",
            energyData: EnergyRingsData(emotional: 75, mental: 80, physical: 70, overall: 75),
            streak: 7,
            mood: .calm,
            userName: nil
        ))
        .frame(width: 76, height: 76)

        FerniLockScreenRectangularView(entry: FerniWidgetEntry(
            date: Date(),
            greeting: "Good morning",
            insight: "New day",
            energyData: EnergyRingsData(emotional: 75, mental: 80, physical: 70, overall: 75),
            streak: 7,
            mood: .calm,
            userName: nil
        ))
        .frame(width: 150, height: 50)
    }
    .padding()
    .background(Color.black)
}
