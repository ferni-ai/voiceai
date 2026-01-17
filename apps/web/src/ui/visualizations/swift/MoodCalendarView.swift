// MARK: - Mood Calendar Visualization
// Beautiful grid calendar showing daily mood entries
// Matches the web visualization in builders/mood-calendar.ts

import SwiftUI

struct MoodCalendarView: View {
    let data: MoodCalendarData
    var showSummary: Bool = true

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)
    private let weekdays = ["S", "M", "T", "W", "T", "F", "S"]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header with summary
            if showSummary {
                MoodSummaryHeader(summary: data.summary)
            }

            // Weekday headers
            HStack(spacing: 4) {
                ForEach(weekdays, id: \.self) { day in
                    Text(day)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(FerniColors.textMuted)
                        .frame(maxWidth: .infinity)
                }
            }

            // Calendar grid
            LazyVGrid(columns: columns, spacing: 4) {
                ForEach(calendarDays, id: \.date) { day in
                    MoodDayCell(day: day)
                }
            }

            // Legend
            MoodLegend(dominantMood: data.summary.dominantMood)
        }
    }

    // MARK: - Calendar Day Generation

    private var calendarDays: [CalendarDay] {
        // Create entry lookup
        var entryLookup: [String: MoodEntry] = [:]
        for entry in data.entries {
            entryLookup[entry.date] = entry
        }

        // Generate days for the period
        let calendar = Calendar.current
        let today = Date()

        var days: [CalendarDay] = []

        switch data.period {
        case "week":
            // Last 7 days
            for i in (0..<7).reversed() {
                if let date = calendar.date(byAdding: .day, value: -i, to: today) {
                    let dateString = formatDate(date)
                    days.append(CalendarDay(
                        date: dateString,
                        dayNumber: calendar.component(.day, from: date),
                        entry: entryLookup[dateString],
                        isToday: i == 0
                    ))
                }
            }

        case "month":
            // Current month
            let startOfMonth = calendar.date(from: calendar.dateComponents([.year, .month], from: today))!
            let range = calendar.range(of: .day, in: .month, for: today)!

            // Padding for first day of month
            let firstWeekday = calendar.component(.weekday, from: startOfMonth)
            for _ in 1..<firstWeekday {
                days.append(CalendarDay(date: "", dayNumber: 0, entry: nil, isToday: false, isEmpty: true))
            }

            // Days of month
            for day in range {
                if let date = calendar.date(byAdding: .day, value: day - 1, to: startOfMonth) {
                    let dateString = formatDate(date)
                    days.append(CalendarDay(
                        date: dateString,
                        dayNumber: day,
                        entry: entryLookup[dateString],
                        isToday: calendar.isDate(date, inSameDayAs: today)
                    ))
                }
            }

        default: // quarter
            // Last 90 days simplified
            for i in stride(from: 89, through: 0, by: -1) {
                if let date = calendar.date(byAdding: .day, value: -i, to: today) {
                    let dateString = formatDate(date)
                    days.append(CalendarDay(
                        date: dateString,
                        dayNumber: calendar.component(.day, from: date),
                        entry: entryLookup[dateString],
                        isToday: i == 0
                    ))
                }
            }
        }

        return days
    }

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

// MARK: - Calendar Day Model

private struct CalendarDay {
    let date: String
    let dayNumber: Int
    let entry: MoodEntry?
    let isToday: Bool
    var isEmpty: Bool = false
}

// MARK: - Day Cell

private struct MoodDayCell: View {
    let day: CalendarDay

    var body: some View {
        if day.isEmpty {
            Color.clear
                .aspectRatio(1, contentMode: .fit)
        } else {
            ZStack {
                // Background color from mood
                RoundedRectangle(cornerRadius: 6)
                    .fill(backgroundColor)

                // Day number
                Text("\(day.dayNumber)")
                    .font(.system(size: 11, weight: day.isToday ? .bold : .medium))
                    .foregroundColor(textColor)
            }
            .aspectRatio(1, contentMode: .fit)
            .overlay(
                // Today indicator
                day.isToday ?
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(FerniColors.accent, lineWidth: 2)
                    : nil
            )
        }
    }

    private var backgroundColor: Color {
        guard let entry = day.entry else {
            return FerniColors.textPrimary.opacity(0.05)
        }
        return entry.mood.color.opacity(0.2 + entry.intensity * 0.6)
    }

    private var textColor: Color {
        if day.entry != nil {
            return FerniColors.textPrimary.opacity(0.8)
        }
        return FerniColors.textMuted
    }
}

// MARK: - Summary Header

private struct MoodSummaryHeader: View {
    let summary: MoodCalendarSummary

    var body: some View {
        HStack(spacing: 16) {
            // Dominant mood
            VStack(alignment: .leading, spacing: 2) {
                Text("Dominant")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(FerniColors.textMuted)

                HStack(spacing: 6) {
                    Circle()
                        .fill(summary.dominantMood.color)
                        .frame(width: 12, height: 12)

                    Text(summary.dominantMood.displayName)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(FerniColors.textPrimary)
                }
            }

            Spacer()

            // Calm days
            VStack(alignment: .center, spacing: 2) {
                Text("\(summary.calmDays)")
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundColor(FerniColors.accent)

                Text("calm days")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(FerniColors.textMuted)
            }

            Spacer()

            // Trend
            VStack(alignment: .trailing, spacing: 2) {
                Text("Trend")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(FerniColors.textMuted)

                HStack(spacing: 4) {
                    Image(systemName: trendIcon)
                        .font(.system(size: 12))
                        .foregroundColor(trendColor)

                    Text(summary.trend.rawValue.capitalized)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(trendColor)
                }
            }
        }
        .padding(.bottom, 8)
    }

    private var trendIcon: String {
        switch summary.trend {
        case .improving: return "arrow.up.right"
        case .stable: return "arrow.right"
        case .declining: return "arrow.down.right"
        default: return "arrow.right"
        }
    }

    private var trendColor: Color {
        switch summary.trend {
        case .improving: return FerniColors.statusColors.thriving
        case .stable: return FerniColors.accent
        case .declining: return FerniColors.statusColors.stretched
        default: return FerniColors.textMuted
        }
    }
}

// MARK: - Mood Legend

private struct MoodLegend: View {
    let dominantMood: MoodType

    // Show top 5 moods
    private let displayMoods: [MoodType] = [.calm, .joyful, .focused, .tired, .anxious]

    var body: some View {
        HStack(spacing: 12) {
            ForEach(displayMoods, id: \.self) { mood in
                HStack(spacing: 4) {
                    Circle()
                        .fill(mood.color)
                        .frame(width: 8, height: 8)

                    Text(mood.displayName)
                        .font(.system(size: 10, weight: mood == dominantMood ? .semibold : .regular))
                        .foregroundColor(mood == dominantMood ? FerniColors.textPrimary : FerniColors.textMuted)
                }
            }
        }
    }
}

// MARK: - Card Wrapper

struct MoodCalendarCard: View {
    let data: MoodCalendarData

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                Text("Mood Calendar")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(FerniColors.textPrimary)

                Spacer()

                Text(periodLabel)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(FerniColors.textMuted)
            }

            MoodCalendarView(data: data)
        }
        .padding(20)
        .background(FerniColors.backgroundElevated)
        .cornerRadius(16)
        .cardShadow()
    }

    private var periodLabel: String {
        switch data.period {
        case "week": return "This Week"
        case "month": return "This Month"
        case "quarter": return "Last 90 Days"
        default: return data.period.capitalized
        }
    }
}

// MARK: - Preview

#Preview("Mood Calendar") {
    MoodCalendarCard(
        data: MoodCalendarData(
            entries: [
                MoodEntry(date: "2024-01-01", mood: .calm, intensity: 0.8, note: nil),
                MoodEntry(date: "2024-01-02", mood: .joyful, intensity: 0.9, note: nil),
                MoodEntry(date: "2024-01-03", mood: .focused, intensity: 0.7, note: nil),
                MoodEntry(date: "2024-01-04", mood: .tired, intensity: 0.5, note: nil),
                MoodEntry(date: "2024-01-05", mood: .calm, intensity: 0.6, note: nil),
            ],
            summary: MoodCalendarSummary(
                dominantMood: .calm,
                calmDays: 12,
                trend: .improving
            ),
            period: "month"
        )
    )
    .padding()
    .background(FerniColors.background)
}
