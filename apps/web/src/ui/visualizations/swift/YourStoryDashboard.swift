// MARK: - Your Story Dashboard
// Main dashboard view bringing all visualizations together
// Matches the web "Your Story" dashboard

import SwiftUI

struct YourStoryDashboard: View {
    let data: YourStoryData
    var onClose: (() -> Void)?

    @State private var scrollOffset: CGFloat = 0

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    // Hero header
                    StoryHeader(data: data)

                    // Demo banner (if showing demo data)
                    if data.isDemo {
                        DemoBanner()
                    }

                    // Section: Right Now
                    SectionView(title: "Right Now", subtitle: "Your current state") {
                        VStack(spacing: 16) {
                            // Energy rings - hero
                            if let energy = data.energyRings {
                                EnergyRingsCard(data: energy)
                            }

                            // Mood + Capacity row
                            HStack(spacing: 12) {
                                if let mood = data.moodCalendar {
                                    CompactMoodCard(data: mood)
                                }

                                if let burnout = data.burnoutGauge {
                                    CompactCapacityCard(data: burnout)
                                }
                            }
                        }
                    }

                    // Section: Your Growth
                    SectionView(title: "Your Growth", subtitle: "Progress over time") {
                        VStack(spacing: 16) {
                            // Life timeline - hero
                            if let timeline = data.lifeTimeline {
                                LifeTimelineCard(data: timeline)
                            }

                            // Growth radar
                            if let growth = data.growthRadar {
                                GrowthRadarCard(data: growth)
                            }

                            // Emotional arcs
                            if let arcs = data.emotionalArcs {
                                EmotionalArcsCard(data: arcs)
                            }
                        }
                    }

                    // Section: Your World
                    SectionView(title: "Your World", subtitle: "Connections & future") {
                        VStack(spacing: 16) {
                            // Relationship network
                            if let network = data.relationshipNetwork {
                                RelationshipNetworkCard(data: network)
                            }

                            // Open loops + Predictions row
                            HStack(spacing: 12) {
                                if let loops = data.openLoops {
                                    CompactOpenLoopsCard(data: loops)
                                }

                                if let predictions = data.predictions {
                                    CompactPredictionsCard(data: predictions)
                                }
                            }
                        }
                    }

                    // Footer
                    StoryFooter(data: data)
                        .padding(.top, 8)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
            .background(FerniColors.background.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { onClose?() }) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 24))
                            .foregroundColor(FerniColors.textMuted)
                    }
                }
            }
        }
    }
}

// MARK: - Story Data Model

struct YourStoryData {
    // Stats
    let daysTogether: Int
    let conversationCount: Int
    let streak: Int
    let relationshipStage: String
    let stageProgress: Double

    // Milestones
    let milestones: [Milestone]

    // Visualizations
    let energyRings: EnergyRingsData?
    let moodCalendar: MoodCalendarData?
    let burnoutGauge: BurnoutGaugeData?
    let lifeTimeline: LifeTimelineData?
    let growthRadar: GrowthRadarData?
    let emotionalArcs: EmotionalArcsData?
    let relationshipNetwork: RelationshipNetworkData?
    let openLoops: OpenLoopsData?
    let predictions: PredictionsData?

    // Demo flag
    var isDemo: Bool = false
}

struct Milestone: Identifiable {
    let id: String
    let title: String
    let icon: String
    let date: String
}

// MARK: - Hero Header

private struct StoryHeader: View {
    let data: YourStoryData

    var body: some View {
        VStack(spacing: 16) {
            // Greeting
            Text(greeting)
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(FerniColors.textPrimary)

            // Stats row
            HStack(spacing: 24) {
                StatBadge(value: "\(data.daysTogether)", label: "days together")
                StatBadge(value: "\(data.conversationCount)", label: "conversations")
                StatBadge(value: "\(data.streak)", label: "day streak", highlight: true)
            }

            // Relationship stage
            VStack(spacing: 8) {
                HStack {
                    Text(data.relationshipStage)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(FerniColors.accent)

                    Spacer()

                    Text("\(Int(data.stageProgress * 100))%")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(FerniColors.textMuted)
                }

                // Progress bar
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(FerniColors.accent.opacity(0.2))

                        RoundedRectangle(cornerRadius: 4)
                            .fill(FerniColors.accent)
                            .frame(width: geometry.size.width * CGFloat(data.stageProgress))
                    }
                }
                .frame(height: 8)
            }
            .padding(.horizontal, 4)

            // Milestones
            if !data.milestones.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(data.milestones) { milestone in
                            MilestoneBadge(milestone: milestone)
                        }
                    }
                }
            }
        }
        .padding(20)
        .background(FerniColors.backgroundElevated)
        .cornerRadius(20)
        .cardShadow()
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<12: return "Good morning"
        case 12..<17: return "Good afternoon"
        case 17..<22: return "Good evening"
        default: return "Hello"
        }
    }
}

private struct StatBadge: View {
    let value: String
    let label: String
    var highlight: Bool = false

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundColor(highlight ? FerniColors.accent : FerniColors.textPrimary)

            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(FerniColors.textMuted)
        }
    }
}

private struct MilestoneBadge: View {
    let milestone: Milestone

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: milestone.icon)
                .font(.system(size: 12))
                .foregroundColor(FerniColors.accent)

            Text(milestone.title)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(FerniColors.textPrimary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(FerniColors.accent.opacity(0.1))
        )
    }
}

// MARK: - Section View

private struct SectionView<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Rectangle()
                    .fill(FerniColors.accent)
                    .frame(width: 3, height: 24)
                    .cornerRadius(2)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(FerniColors.textPrimary)

                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundColor(FerniColors.textMuted)
                }
            }

            content
        }
    }
}

// MARK: - Demo Banner

private struct DemoBanner: View {
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "sparkles")
                .font(.system(size: 16))
                .foregroundColor(FerniColors.accent)

            VStack(alignment: .leading, spacing: 2) {
                Text("A glimpse of what's possible")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(FerniColors.textPrimary)

                Text("Start a conversation to begin your story")
                    .font(.system(size: 12))
                    .foregroundColor(FerniColors.textMuted)
            }

            Spacer()
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(FerniColors.accent.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(FerniColors.accent.opacity(0.2), lineWidth: 1)
                )
        )
    }
}

// MARK: - Compact Cards (for side-by-side layout)

private struct CompactMoodCard: View {
    let data: MoodCalendarData

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Mood")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(FerniColors.textMuted)

            HStack(spacing: 6) {
                Circle()
                    .fill(data.summary.dominantMood.color)
                    .frame(width: 24, height: 24)

                VStack(alignment: .leading, spacing: 1) {
                    Text(data.summary.dominantMood.displayName)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(FerniColors.textPrimary)

                    Text("\(data.summary.calmDays) calm days")
                        .font(.system(size: 11))
                        .foregroundColor(FerniColors.textMuted)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(FerniColors.backgroundElevated)
        .cornerRadius(12)
        .cardShadow()
    }
}

private struct CompactCapacityCard: View {
    let data: BurnoutGaugeData

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Capacity")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(FerniColors.textMuted)

            HStack(spacing: 8) {
                // Mini gauge
                ZStack {
                    Circle()
                        .stroke(FerniColors.textPrimary.opacity(0.1), lineWidth: 4)

                    Circle()
                        .trim(from: 0, to: CGFloat(data.capacity) / 100)
                        .stroke(data.status.color, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                        .rotationEffect(.degrees(-90))

                    Text("\(data.capacity)")
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundColor(data.status.color)
                }
                .frame(width: 40, height: 40)

                VStack(alignment: .leading, spacing: 1) {
                    Text(data.status.rawValue.capitalized)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(FerniColors.textPrimary)

                    Text(data.trend.rawValue)
                        .font(.system(size: 11))
                        .foregroundColor(FerniColors.textMuted)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(FerniColors.backgroundElevated)
        .cornerRadius(12)
        .cardShadow()
    }
}

private struct CompactOpenLoopsCard: View {
    let data: OpenLoopsData

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Open Loops")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(FerniColors.textMuted)

                Spacer()

                Text("\(data.totalOpen)")
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundColor(FerniColors.accent)
            }

            if let oldest = data.oldestLoop {
                Text(oldest.description)
                    .font(.system(size: 13))
                    .foregroundColor(FerniColors.textSecondary)
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(FerniColors.backgroundElevated)
        .cornerRadius(12)
        .cardShadow()
    }
}

private struct CompactPredictionsCard: View {
    let data: PredictionsData

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Predictions")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(FerniColors.textMuted)

                Spacer()

                Text("\(Int(data.accuracy * 100))%")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(FerniColors.statusColors.thriving)
            }

            HStack(spacing: 4) {
                Text(data.primaryPrediction.metric)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(FerniColors.textPrimary)

                Image(systemName: "arrow.right")
                    .font(.system(size: 10))
                    .foregroundColor(FerniColors.textMuted)

                Text("\(Int(data.primaryPrediction.predictedValue))")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundColor(FerniColors.accent)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(FerniColors.backgroundElevated)
        .cornerRadius(12)
        .cardShadow()
    }
}

// MARK: - Footer

private struct StoryFooter: View {
    let data: YourStoryData

    var body: some View {
        VStack(spacing: 8) {
            Text("Your story with Ferni")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(FerniColors.textMuted)

            Text("Chapter \(data.lifeTimeline?.totalChapters ?? 1)")
                .font(.system(size: 11))
                .foregroundColor(FerniColors.textMuted.opacity(0.7))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
    }
}

// MARK: - Placeholder Cards (for visualizations not yet implemented)

private struct LifeTimelineCard: View {
    let data: LifeTimelineData

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Life Chapters")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(FerniColors.textPrimary)

            // Current chapter
            HStack(spacing: 12) {
                Image(systemName: data.currentChapter.type.icon)
                    .font(.system(size: 20))
                    .foregroundColor(data.currentChapter.type.color)
                    .frame(width: 40, height: 40)
                    .background(data.currentChapter.type.color.opacity(0.1))
                    .cornerRadius(10)

                VStack(alignment: .leading, spacing: 2) {
                    Text(data.currentChapter.title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(FerniColors.textPrimary)

                    Text("Chapter \(data.totalChapters) • In Progress")
                        .font(.system(size: 12))
                        .foregroundColor(FerniColors.textMuted)
                }

                Spacer()

                Text("\(Int(data.currentChapter.progress * 100))%")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundColor(FerniColors.accent)
            }

            // Timeline preview
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(data.chapters.prefix(5)) { chapter in
                        ChapterPill(chapter: chapter, isCurrent: chapter.id == data.currentChapter.id)
                    }
                }
            }
        }
        .padding(20)
        .background(FerniColors.backgroundElevated)
        .cornerRadius(16)
        .cardShadow()
    }
}

private struct ChapterPill: View {
    let chapter: TimelineChapter
    let isCurrent: Bool

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: chapter.type.icon)
                .font(.system(size: 10))

            Text(chapter.title)
                .font(.system(size: 11, weight: isCurrent ? .semibold : .regular))
        }
        .foregroundColor(isCurrent ? .white : chapter.type.color)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(isCurrent ? chapter.type.color : chapter.type.color.opacity(0.1))
        )
    }
}

private struct EmotionalArcsCard: View {
    let data: EmotionalArcsData

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Recovery Path")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(FerniColors.textPrimary)

                Spacer()

                Text(data.currentPhase.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(FerniColors.accent)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(FerniColors.accent.opacity(0.1)))
            }

            // Phase progress
            GeometryReader { geometry in
                let width = geometry.size.width
                let currentPosition = data.currentPhase.position

                ZStack(alignment: .leading) {
                    // Track
                    Rectangle()
                        .fill(FerniColors.textPrimary.opacity(0.1))
                        .frame(height: 4)
                        .cornerRadius(2)

                    // Progress
                    Rectangle()
                        .fill(FerniColors.accent)
                        .frame(width: width * CGFloat(currentPosition), height: 4)
                        .cornerRadius(2)

                    // Current position marker
                    Circle()
                        .fill(FerniColors.accent)
                        .frame(width: 12, height: 12)
                        .offset(x: width * CGFloat(currentPosition) - 6)
                }
            }
            .frame(height: 20)

            // Phase labels
            HStack {
                ForEach(data.phases.prefix(4)) { phase in
                    Text(phase.name)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(phase.position <= data.currentPhase.position ? FerniColors.accent : FerniColors.textMuted)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(20)
        .background(FerniColors.backgroundElevated)
        .cornerRadius(16)
        .cardShadow()
    }
}

private struct RelationshipNetworkCard: View {
    let data: RelationshipNetworkData

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Relationship Network")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(FerniColors.textPrimary)

                Spacer()

                Text("\(data.activeConnections) active")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(FerniColors.textMuted)
            }

            // Stats row
            HStack(spacing: 24) {
                NetworkStat(value: data.totalConnections, label: "Total")
                NetworkStat(value: data.activeConnections, label: "Active")
                NetworkStat(value: data.needsAttention.count, label: "Needs attention", highlight: data.needsAttention.count > 0)
            }

            // Preview of relationships
            HStack(spacing: -8) {
                ForEach(data.relationships.prefix(5)) { relationship in
                    Circle()
                        .fill(relationship.category.color)
                        .frame(width: 32, height: 32)
                        .overlay(
                            Text(String(relationship.name.prefix(1)))
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.white)
                        )
                        .overlay(
                            Circle()
                                .stroke(FerniColors.backgroundElevated, lineWidth: 2)
                        )
                }

                if data.relationships.count > 5 {
                    Circle()
                        .fill(FerniColors.textMuted.opacity(0.2))
                        .frame(width: 32, height: 32)
                        .overlay(
                            Text("+\(data.relationships.count - 5)")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundColor(FerniColors.textMuted)
                        )
                        .overlay(
                            Circle()
                                .stroke(FerniColors.backgroundElevated, lineWidth: 2)
                        )
                }
            }
        }
        .padding(20)
        .background(FerniColors.backgroundElevated)
        .cornerRadius(16)
        .cardShadow()
    }
}

private struct NetworkStat: View {
    let value: Int
    let label: String
    var highlight: Bool = false

    var body: some View {
        VStack(spacing: 2) {
            Text("\(value)")
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundColor(highlight ? FerniColors.statusColors.stretched : FerniColors.textPrimary)

            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(FerniColors.textMuted)
        }
    }
}

// MARK: - Preview

#Preview("Your Story Dashboard") {
    YourStoryDashboard(
        data: YourStoryData(
            daysTogether: 45,
            conversationCount: 127,
            streak: 12,
            relationshipStage: "Building Trust",
            stageProgress: 0.65,
            milestones: [
                Milestone(id: "1", title: "First Hello", icon: "hand.wave", date: "2024-01-01"),
                Milestone(id: "2", title: "One Week", icon: "calendar", date: "2024-01-07"),
                Milestone(id: "3", title: "Deep Dive", icon: "water.waves", date: "2024-01-15"),
            ],
            energyRings: EnergyRingsData(emotional: 75, mental: 82, physical: 68, overall: 72),
            moodCalendar: MoodCalendarData(
                entries: [],
                summary: MoodCalendarSummary(dominantMood: .calm, calmDays: 12, trend: .improving),
                period: "month"
            ),
            burnoutGauge: BurnoutGaugeData(
                capacity: 72,
                trend: .recovering,
                status: .balanced,
                factors: BurnoutFactors(emotional: 70, mental: 75, physical: 68),
                updatedAt: "2024-01-15"
            ),
            lifeTimeline: LifeTimelineData(
                chapters: [
                    TimelineChapter(id: "1", title: "Finding My Footing", type: .growth, startDate: "2023-01", endDate: "2023-06", isActive: false, progress: 1.0, summary: nil),
                    TimelineChapter(id: "2", title: "Building Bridges", type: .transition, startDate: "2023-06", endDate: "2024-01", isActive: false, progress: 1.0, summary: nil),
                    TimelineChapter(id: "3", title: "Intentional Living", type: .growth, startDate: "2024-01", endDate: nil, isActive: true, progress: 0.35, summary: nil),
                ],
                currentChapter: TimelineChapter(id: "3", title: "Intentional Living", type: .growth, startDate: "2024-01", endDate: nil, isActive: true, progress: 0.35, summary: nil),
                totalChapters: 3,
                narrativeSummary: nil
            ),
            growthRadar: GrowthRadarData(
                dimensions: [
                    GrowthDimension(name: "Self-Awareness", value: 0.75, previousValue: nil, trend: .growing),
                    GrowthDimension(name: "Connection", value: 0.72, previousValue: nil, trend: .stable),
                    GrowthDimension(name: "Emotional Range", value: 0.68, previousValue: nil, trend: .growing),
                    GrowthDimension(name: "Resilience", value: 0.65, previousValue: nil, trend: .stable),
                    GrowthDimension(name: "Boundaries", value: 0.60, previousValue: nil, trend: .growing),
                    GrowthDimension(name: "Purpose", value: 0.58, previousValue: nil, trend: .needsAttention),
                ],
                overallGrowth: 0.66,
                focusArea: "Purpose"
            ),
            emotionalArcs: EmotionalArcsData(
                currentPhase: EmotionalArcPhase(name: "The Rise", position: 0.75, intensity: 0.4, description: nil),
                phases: [
                    EmotionalArcPhase(name: "The Call", position: 0.1, intensity: 0.3, description: nil),
                    EmotionalArcPhase(name: "The Descent", position: 0.3, intensity: 0.7, description: nil),
                    EmotionalArcPhase(name: "The Depths", position: 0.5, intensity: 0.9, description: nil),
                    EmotionalArcPhase(name: "The Rise", position: 0.75, intensity: 0.4, description: nil),
                ],
                arcType: .recovery
            ),
            relationshipNetwork: RelationshipNetworkData(
                relationships: [
                    Relationship(name: "Partner", strength: 0.9, lastContact: "2024-01-15", category: .family, trend: .stable),
                    Relationship(name: "Best Friend", strength: 0.85, lastContact: "2024-01-14", category: .friend, trend: .deepening),
                    Relationship(name: "Work", strength: 0.6, lastContact: "2024-01-15", category: .colleague, trend: .stable),
                    Relationship(name: "Mom", strength: 0.8, lastContact: "2024-01-10", category: .family, trend: .stable),
                ],
                totalConnections: 24,
                activeConnections: 12,
                needsAttention: ["College Friend"]
            ),
            openLoops: OpenLoopsData(
                loops: [
                    OpenLoop(id: "1", description: "Call Mom this weekend", createdAt: "2024-01-13", priority: .high, category: .commitment, relatedPerson: "Mom"),
                ],
                totalOpen: 3,
                oldestLoop: OpenLoop(id: "1", description: "Call Mom this weekend", createdAt: "2024-01-13", priority: .high, category: .commitment, relatedPerson: "Mom"),
                recentlyClosed: 2
            ),
            predictions: PredictionsData(
                predictions: [],
                primaryPrediction: Prediction(metric: "Emotional Wellbeing", currentValue: 68, predictedValue: 78, confidence: 0.82, timeframe: "3 months", scenarios: PredictionScenarios(conservative: 72, expected: 78, optimistic: 85)),
                accuracy: 0.84
            ),
            isDemo: true
        )
    )
}
