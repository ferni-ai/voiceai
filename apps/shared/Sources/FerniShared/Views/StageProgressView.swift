import SwiftUI

// MARK: - Stage Progress View
/// A beautiful visualization of the user's relationship journey with Ferni.
///
/// Design Philosophy:
/// - This is a relationship scrapbook, not a progress bar
/// - Each stage is a chapter, not a level to grind
/// - Memories make the journey feel personal
/// - Never gamify the relationship (no XP, no leaderboards)
///
/// Visual Metaphor:
/// - A winding path through seasons (new → familiar → deep)
/// - Each stage is a clearing along the path
/// - Memories are like photos pinned along the way

public struct StageProgressView: View {

    // MARK: - Configuration

    @ObservedObject var relationshipService: RelationshipArcService

    /// Callback when user taps on a memory
    public var onMemoryTapped: ((RelationshipMemory) -> Void)?

    // MARK: - State

    @State private var expandedStage: RelationshipStage?
    @State private var showingMetrics: Bool = false

    public init(
        relationshipService: RelationshipArcService = .shared,
        onMemoryTapped: ((RelationshipMemory) -> Void)? = nil
    ) {
        self.relationshipService = relationshipService
        self.onMemoryTapped = onMemoryTapped
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: 32) {
                // Header
                headerSection

                // Current stage highlight
                currentStageCard

                // Journey path
                journeyPath

                // Metrics (expandable)
                metricsSection

                // Memories
                if !relationshipService.memories.isEmpty {
                    memoriesSection
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 32)
        }
        .background(
            Color(hexString: "0a0a12").ignoresSafeArea()
        )
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 8) {
            Text("Our Journey")
                .font(.system(size: 28, weight: .light, design: .rounded))
                .foregroundColor(.white)

            Text(relationshipService.stageSubtitle)
                .font(.system(size: 14, weight: .regular, design: .rounded))
                .foregroundColor(.white.opacity(0.6))
        }
    }

    // MARK: - Current Stage Card

    private var currentStageCard: some View {
        let stage = relationshipService.currentStage
        let color = Color(hexString: stage.color)

        return VStack(spacing: 16) {
            // Icon
            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [color.opacity(0.4), .clear],
                            center: .center,
                            startRadius: 0,
                            endRadius: 40
                        )
                    )
                    .frame(width: 80, height: 80)

                Image(systemName: stage.iconName)
                    .font(.system(size: 28))
                    .foregroundColor(color)
            }

            // Stage info
            VStack(spacing: 8) {
                Text(stage.title)
                    .font(.system(size: 22, weight: .medium, design: .rounded))
                    .foregroundColor(.white)

                Text(stage.description)
                    .font(.system(size: 14, weight: .regular, design: .rounded))
                    .foregroundColor(.white.opacity(0.6))
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
            }

            // Progress bar within stage
            if stage != .deepPartnership {
                VStack(spacing: 8) {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(.white.opacity(0.1))
                                .frame(height: 6)

                            Capsule()
                                .fill(color)
                                .frame(
                                    width: geo.size.width * relationshipService.stageProgress,
                                    height: 6
                                )
                        }
                    }
                    .frame(height: 6)

                    Text("\(Int(relationshipService.stageProgress * 100))% to next stage")
                        .font(.system(size: 12, weight: .regular, design: .rounded))
                        .foregroundColor(.white.opacity(0.4))
                }
                .padding(.horizontal, 20)
            }
        }
        .padding(.vertical, 24)
        .padding(.horizontal, 20)
        .background(
            RoundedRectangle(cornerRadius: 24)
                .fill(.white.opacity(0.05))
                .overlay(
                    RoundedRectangle(cornerRadius: 24)
                        .stroke(color.opacity(0.3), lineWidth: 1)
                )
        )
    }

    // MARK: - Journey Path

    private var journeyPath: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(RelationshipStage.allCases.enumerated()), id: \.element) { index, stage in
                StageNode(
                    stage: stage,
                    isCurrentStage: stage == relationshipService.currentStage,
                    isCompleted: stage.rawValue < relationshipService.currentStage.rawValue,
                    isLast: index == RelationshipStage.allCases.count - 1
                )
            }
        }
    }

    // MARK: - Metrics Section

    private var metricsSection: some View {
        VStack(spacing: 12) {
            Button(action: { withAnimation { showingMetrics.toggle() } }) {
                HStack {
                    Text("Journey Stats")
                        .font(.system(size: 16, weight: .medium, design: .rounded))
                        .foregroundColor(.white.opacity(0.8))

                    Spacer()

                    Image(systemName: showingMetrics ? "chevron.up" : "chevron.down")
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.4))
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(.white.opacity(0.05))
                )
            }
            .buttonStyle(PlainButtonStyle())

            if showingMetrics {
                metricsGrid
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    private var metricsGrid: some View {
        let metrics = relationshipService.metrics

        return LazyVGrid(columns: [
            GridItem(.flexible()),
            GridItem(.flexible())
        ], spacing: 12) {
            MetricCard(
                title: "Conversations",
                value: "\(metrics.totalCalls)",
                icon: "bubble.left.and.bubble.right"
            )

            MetricCard(
                title: "Time Together",
                value: metrics.formattedDuration,
                icon: "clock"
            )

            MetricCard(
                title: "Insights Shared",
                value: "\(metrics.insightsShared)",
                icon: "lightbulb"
            )

            MetricCard(
                title: "Streak",
                value: "\(metrics.consecutiveDays) days",
                icon: "flame"
            )
        }
    }

    // MARK: - Memories Section

    private var memoriesSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Memories")
                .font(.system(size: 18, weight: .medium, design: .rounded))
                .foregroundColor(.white.opacity(0.8))

            ForEach(relationshipService.memories.suffix(5).reversed()) { memory in
                MemoryCard(memory: memory) {
                    onMemoryTapped?(memory)
                }
            }
        }
    }
}

// MARK: - Stage Node

private struct StageNode: View {
    let stage: RelationshipStage
    let isCurrentStage: Bool
    let isCompleted: Bool
    let isLast: Bool

    private var stageColor: Color {
        Color(hexString: stage.color)
    }

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            // Node with connector line
            VStack(spacing: 0) {
                // Circle
                ZStack {
                    if isCurrentStage {
                        Circle()
                            .fill(stageColor.opacity(0.3))
                            .frame(width: 40, height: 40)
                    }

                    Circle()
                        .fill(isCompleted || isCurrentStage ? stageColor : .white.opacity(0.2))
                        .frame(width: isCurrentStage ? 24 : 16, height: isCurrentStage ? 24 : 16)

                    if isCompleted {
                        Image(systemName: "checkmark")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.white)
                    }
                }
                .frame(width: 40, height: 40)

                // Connector line
                if !isLast {
                    Rectangle()
                        .fill(isCompleted ? stageColor : .white.opacity(0.1))
                        .frame(width: 2, height: 40)
                }
            }

            // Stage info
            VStack(alignment: .leading, spacing: 4) {
                Text(stage.title)
                    .font(.system(size: 16, weight: isCurrentStage ? .medium : .regular, design: .rounded))
                    .foregroundColor(isCompleted || isCurrentStage ? .white : .white.opacity(0.4))

                if isCurrentStage {
                    Text(stage.subtitle)
                        .font(.system(size: 13, weight: .regular, design: .rounded))
                        .foregroundColor(.white.opacity(0.5))
                }
            }
            .padding(.top, 8)

            Spacer()
        }
    }
}

// MARK: - Metric Card

private struct MetricCard: View {
    let title: String
    let value: String
    let icon: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(.white.opacity(0.5))

            Text(value)
                .font(.system(size: 24, weight: .light, design: .rounded))
                .foregroundColor(.white)

            Text(title)
                .font(.system(size: 12, weight: .regular, design: .rounded))
                .foregroundColor(.white.opacity(0.4))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.white.opacity(0.03))
        )
    }
}

// MARK: - Memory Card

private struct MemoryCard: View {
    let memory: RelationshipMemory
    let onTap: () -> Void

    private var memoryColor: Color {
        Color(hexString: memory.stage.color)
    }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 16) {
                // Icon
                ZStack {
                    Circle()
                        .fill(memoryColor.opacity(0.2))
                        .frame(width: 44, height: 44)

                    Image(systemName: memoryIconName)
                        .font(.system(size: 18))
                        .foregroundColor(memoryColor)
                }

                // Content
                VStack(alignment: .leading, spacing: 4) {
                    Text(memory.title)
                        .font(.system(size: 15, weight: .medium, design: .rounded))
                        .foregroundColor(.white)

                    Text(memory.description)
                        .font(.system(size: 13, weight: .regular, design: .rounded))
                        .foregroundColor(.white.opacity(0.5))
                        .lineLimit(2)

                    Text(formattedDate)
                        .font(.system(size: 11, weight: .regular, design: .rounded))
                        .foregroundColor(.white.opacity(0.3))
                }

                Spacer()
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(.white.opacity(0.03))
            )
        }
        .buttonStyle(PlainButtonStyle())
    }

    private var memoryIconName: String {
        switch memory.type {
        case .stageAdvancement: return "star"
        case .milestone: return "flag"
        case .insight: return "lightbulb"
        case .breakthrough: return "bolt"
        case .celebration: return "sparkles"
        }
    }

    private var formattedDate: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: memory.date, relativeTo: Date())
    }
}

// MARK: - Preview

#if DEBUG
struct StageProgressView_Previews: PreviewProvider {
    static var previews: some View {
        // Create a mock service with some data
        let service = RelationshipArcService.shared

        return StageProgressView(relationshipService: service)
    }
}
#endif
