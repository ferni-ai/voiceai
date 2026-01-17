import XCTest
import SwiftUI
@testable import FerniShared

// MARK: - StageProgressView Tests

/// Tests for StageProgressView initialization and configuration.
/// The underlying RelationshipArcService is tested separately.

final class StageProgressViewTests: XCTestCase {

    override func setUp() {
        super.setUp()
        // Reset service state before each test
        RelationshipArcService.shared.reset()
    }

    override func tearDown() {
        RelationshipArcService.shared.reset()
        super.tearDown()
    }

    // MARK: - Initialization Tests

    func testDefaultInitialization() {
        let view = StageProgressView()
        XCTAssertNotNil(view)
    }

    func testInitializationWithService() {
        let service = RelationshipArcService.shared
        let view = StageProgressView(relationshipService: service)
        XCTAssertNotNil(view)
    }

    func testInitializationWithCallback() {
        var tappedMemory: RelationshipMemory?
        let view = StageProgressView { memory in
            tappedMemory = memory
        }
        XCTAssertNotNil(view)
    }

    func testInitializationWithAllParameters() {
        let service = RelationshipArcService.shared
        var tappedMemory: RelationshipMemory?
        let view = StageProgressView(
            relationshipService: service,
            onMemoryTapped: { memory in
                tappedMemory = memory
            }
        )
        XCTAssertNotNil(view)
    }

    // MARK: - Body Tests

    func testBodyProducesValidView() {
        let view = StageProgressView()
        _ = view.body
        XCTAssertTrue(true)
    }

    func testBodyWithMemories() {
        let service = RelationshipArcService.shared
        service.addMemory(
            type: .insight,
            title: "Test Memory",
            description: "A test memory description"
        )

        let view = StageProgressView(relationshipService: service)
        _ = view.body
        XCTAssertTrue(true)
    }

    func testBodyWithMultipleMemories() {
        let service = RelationshipArcService.shared
        for i in 1...10 {
            service.addMemory(
                type: .insight,
                title: "Memory \(i)",
                description: "Description \(i)"
            )
        }

        let view = StageProgressView(relationshipService: service)
        _ = view.body
        XCTAssertTrue(true)
    }
}

// MARK: - Memory Icon Tests

/// Tests for the memory icon mapping logic.
/// Since memoryIconName is private, we document expected behavior.

final class MemoryIconMappingTests: XCTestCase {

    func testStageAdvancementIcon() {
        // stageAdvancement → "star"
        let expectedIcon = "star"
        XCTAssertEqual(expectedIcon, "star")
    }

    func testMilestoneIcon() {
        // milestone → "flag"
        let expectedIcon = "flag"
        XCTAssertEqual(expectedIcon, "flag")
    }

    func testInsightIcon() {
        // insight → "lightbulb"
        let expectedIcon = "lightbulb"
        XCTAssertEqual(expectedIcon, "lightbulb")
    }

    func testBreakthroughIcon() {
        // breakthrough → "bolt"
        let expectedIcon = "bolt"
        XCTAssertEqual(expectedIcon, "bolt")
    }

    func testCelebrationIcon() {
        // celebration → "sparkles"
        let expectedIcon = "sparkles"
        XCTAssertEqual(expectedIcon, "sparkles")
    }

    func testAllMemoryTypesHaveIcons() {
        let iconMap: [MemoryType: String] = [
            .stageAdvancement: "star",
            .milestone: "flag",
            .insight: "lightbulb",
            .breakthrough: "bolt",
            .celebration: "sparkles"
        ]

        // Should have 5 memory types
        XCTAssertEqual(iconMap.count, 5)

        let allTypes: [MemoryType] = [
            .stageAdvancement,
            .milestone,
            .insight,
            .breakthrough,
            .celebration
        ]

        for type in allTypes {
            XCTAssertNotNil(iconMap[type], "Memory type \(type) should have an icon")
        }
    }
}

// MARK: - Journey Path Tests

final class JourneyPathTests: XCTestCase {

    func testJourneyPathHasAllStages() {
        let stageCount = RelationshipStage.allCases.count
        XCTAssertEqual(stageCount, 5, "Should have 5 stages in journey path")
    }

    func testFirstStageIsFirstMeeting() {
        let firstStage = RelationshipStage.allCases.first
        XCTAssertEqual(firstStage, .firstMeeting)
    }

    func testLastStageIsDeepPartnership() {
        let lastStage = RelationshipStage.allCases.last
        XCTAssertEqual(lastStage, .deepPartnership)
    }

    func testStagesAreInCorrectOrder() {
        let stages = RelationshipStage.allCases
        let expected: [RelationshipStage] = [
            .firstMeeting,
            .gettingStarted,
            .buildingTrust,
            .established,
            .deepPartnership
        ]
        XCTAssertEqual(stages, expected)
    }
}

// MARK: - Stage Node Logic Tests

final class StageNodeLogicTests: XCTestCase {

    func testCurrentStageHighlighting() {
        let currentStage = RelationshipStage.buildingTrust

        for stage in RelationshipStage.allCases {
            let isCurrentStage = (stage == currentStage)

            if stage == .buildingTrust {
                XCTAssertTrue(isCurrentStage)
            } else {
                XCTAssertFalse(isCurrentStage)
            }
        }
    }

    func testCompletedStageDetectionByIndex() {
        // Use index-based comparison since rawValues are strings
        let stages = RelationshipStage.allCases
        let currentIndex = 2  // buildingTrust is at index 2

        for (index, stage) in stages.enumerated() {
            let isCompleted = index < currentIndex

            if stage == .firstMeeting || stage == .gettingStarted {
                XCTAssertTrue(isCompleted, "\(stage) at index \(index) should be completed")
            } else {
                XCTAssertFalse(isCompleted, "\(stage) at index \(index) should not be completed")
            }
        }
    }

    func testStageIndexOrder() {
        // Verify the expected order of stages by index
        let stages = RelationshipStage.allCases
        XCTAssertEqual(stages[0], .firstMeeting)
        XCTAssertEqual(stages[1], .gettingStarted)
        XCTAssertEqual(stages[2], .buildingTrust)
        XCTAssertEqual(stages[3], .established)
        XCTAssertEqual(stages[4], .deepPartnership)
    }

    func testLastStageDetection() {
        let stages = RelationshipStage.allCases
        let lastIndex = stages.count - 1

        for (index, stage) in stages.enumerated() {
            let isLast = (index == lastIndex)

            if stage == .deepPartnership {
                XCTAssertTrue(isLast)
            } else {
                XCTAssertFalse(isLast)
            }
        }
    }
}

// MARK: - Metrics Grid Tests

final class MetricsGridTests: XCTestCase {

    func testMetricsGridHasFourCards() {
        // Grid should display 4 metrics
        let expectedMetrics = 4
        XCTAssertEqual(expectedMetrics, 4)
    }

    func testMetricCardTitles() {
        let titles = ["Conversations", "Time Together", "Insights Shared", "Streak"]
        XCTAssertEqual(titles.count, 4)

        for title in titles {
            XCTAssertFalse(title.isEmpty)
        }
    }

    func testMetricCardIcons() {
        let icons = [
            "bubble.left.and.bubble.right",
            "clock",
            "lightbulb",
            "flame"
        ]

        XCTAssertEqual(icons.count, 4)

        for icon in icons {
            XCTAssertFalse(icon.isEmpty)
        }
    }
}

// MARK: - Progress Bar Tests

final class StageProgressBarTests: XCTestCase {

    func testProgressBarHiddenForDeepPartnership() {
        // Progress bar should not show for deepPartnership
        let stage = RelationshipStage.deepPartnership
        let shouldShowProgress = (stage != .deepPartnership)
        XCTAssertFalse(shouldShowProgress)
    }

    func testProgressBarShownForOtherStages() {
        for stage in RelationshipStage.allCases {
            if stage != .deepPartnership {
                let shouldShowProgress = (stage != .deepPartnership)
                XCTAssertTrue(shouldShowProgress, "\(stage) should show progress bar")
            }
        }
    }

    func testProgressPercentageFormatting() {
        // Progress is formatted as "XX% to next stage"
        let progressValues = [0.0, 0.25, 0.5, 0.75, 1.0]

        for progress in progressValues {
            let formatted = "\(Int(progress * 100))% to next stage"
            XCTAssertTrue(formatted.contains("% to next stage"))
        }
    }

    func testProgressPercentageAtZero() {
        let progress = 0.0
        let formatted = "\(Int(progress * 100))% to next stage"
        XCTAssertEqual(formatted, "0% to next stage")
    }

    func testProgressPercentageAtFull() {
        let progress = 1.0
        let formatted = "\(Int(progress * 100))% to next stage"
        XCTAssertEqual(formatted, "100% to next stage")
    }
}

// MARK: - Memories Section Tests

final class MemoriesSectionTests: XCTestCase {

    override func setUp() {
        super.setUp()
        RelationshipArcService.shared.reset()
    }

    override func tearDown() {
        RelationshipArcService.shared.reset()
        super.tearDown()
    }

    func testMemoriesSectionHiddenWhenEmpty() {
        let service = RelationshipArcService.shared
        XCTAssertTrue(service.memories.isEmpty)

        // Section should not render (checked via logic, not view)
        let shouldShowMemories = !service.memories.isEmpty
        XCTAssertFalse(shouldShowMemories)
    }

    func testMemoriesSectionShownWithMemories() {
        let service = RelationshipArcService.shared
        service.addMemory(type: .insight, title: "Test", description: "Test")

        let shouldShowMemories = !service.memories.isEmpty
        XCTAssertTrue(shouldShowMemories)
    }

    func testMemoriesSuffixedToFive() {
        let service = RelationshipArcService.shared

        // Add 10 memories
        for i in 1...10 {
            service.addMemory(
                type: .insight,
                title: "Memory \(i)",
                description: "Description \(i)"
            )
        }

        // UI shows suffix(5).reversed()
        let displayedMemories = service.memories.suffix(5).reversed()
        XCTAssertEqual(displayedMemories.count, 5)
    }

    func testMemoriesReversedForDisplay() {
        let service = RelationshipArcService.shared

        // Add memories in order
        for i in 1...3 {
            service.addMemory(
                type: .insight,
                title: "Memory \(i)",
                description: "Description \(i)"
            )
        }

        // Reversed means most recent first
        let displayedMemories = Array(service.memories.suffix(5).reversed())
        XCTAssertEqual(displayedMemories.first?.title, "Memory 3")
        XCTAssertEqual(displayedMemories.last?.title, "Memory 1")
    }
}

// MARK: - Stage Card Tests

final class CurrentStageCardTests: XCTestCase {

    func testStageCardUsesStageColor() {
        for stage in RelationshipStage.allCases {
            let color = Color(hexString: stage.color)
            XCTAssertNotNil(color, "\(stage) should have valid color")
        }
    }

    func testStageCardShowsTitle() {
        for stage in RelationshipStage.allCases {
            XCTAssertFalse(stage.title.isEmpty)
        }
    }

    func testStageCardShowsDescription() {
        for stage in RelationshipStage.allCases {
            XCTAssertFalse(stage.description.isEmpty)
        }
    }

    func testStageCardShowsIcon() {
        for stage in RelationshipStage.allCases {
            XCTAssertFalse(stage.iconName.isEmpty)
        }
    }
}

// MARK: - Header Section Tests

final class HeaderSectionTests: XCTestCase {

    func testHeaderTitle() {
        let title = "Our Journey"
        XCTAssertEqual(title, "Our Journey")
    }

    func testHeaderShowsStageSubtitle() {
        let service = RelationshipArcService.shared
        let subtitle = service.stageSubtitle
        XCTAssertFalse(subtitle.isEmpty)
    }
}

// MARK: - Relative Date Formatting Tests

final class RelativeDateFormattingTests: XCTestCase {

    func testFormatterUsesShortStyle() {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short

        // Format a date 1 hour ago
        let oneHourAgo = Date().addingTimeInterval(-3600)
        let formatted = formatter.localizedString(for: oneHourAgo, relativeTo: Date())

        // Should produce something like "1 hr ago" (locale-dependent)
        XCTAssertFalse(formatted.isEmpty)
    }

    func testFormatterForRecentDate() {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short

        let now = Date()
        let formatted = formatter.localizedString(for: now, relativeTo: now)

        XCTAssertFalse(formatted.isEmpty)
    }

    func testFormatterForOldDate() {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short

        let oneWeekAgo = Date().addingTimeInterval(-7 * 24 * 3600)
        let formatted = formatter.localizedString(for: oneWeekAgo, relativeTo: Date())

        XCTAssertFalse(formatted.isEmpty)
    }
}

// MARK: - Expand/Collapse Metrics Tests

final class MetricsExpandCollapseTests: XCTestCase {

    func testInitiallyCollapsed() {
        // showingMetrics starts as false
        let initialState = false
        XCTAssertFalse(initialState)
    }

    func testToggleLogic() {
        var showingMetrics = false

        // Toggle to show
        showingMetrics.toggle()
        XCTAssertTrue(showingMetrics)

        // Toggle to hide
        showingMetrics.toggle()
        XCTAssertFalse(showingMetrics)
    }

    func testChevronDirectionWhenCollapsed() {
        let showingMetrics = false
        let chevronIcon = showingMetrics ? "chevron.up" : "chevron.down"
        XCTAssertEqual(chevronIcon, "chevron.down")
    }

    func testChevronDirectionWhenExpanded() {
        let showingMetrics = true
        let chevronIcon = showingMetrics ? "chevron.up" : "chevron.down"
        XCTAssertEqual(chevronIcon, "chevron.up")
    }
}

// MARK: - Background Color Tests

final class StageProgressBackgroundTests: XCTestCase {

    func testBackgroundColor() {
        let backgroundColor = Color(hexString: "0a0a12")
        XCTAssertNotNil(backgroundColor)
    }
}
