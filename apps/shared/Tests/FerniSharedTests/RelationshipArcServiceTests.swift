import XCTest
@testable import FerniShared

/// Comprehensive tests for RelationshipArcService
/// Testing the 5-stage relationship progression system
final class RelationshipArcServiceTests: XCTestCase {

    // MARK: - Test Setup

    private var testDefaults: UserDefaults!
    private var testSuiteName: String!
    private var service: RelationshipArcService!

    override func setUp() {
        super.setUp()
        // Create isolated UserDefaults for each test
        testSuiteName = "RelationshipArcServiceTests-\(UUID().uuidString)"
        testDefaults = UserDefaults(suiteName: testSuiteName)!
        service = RelationshipArcService.createForTesting(storage: testDefaults)
    }

    override func tearDown() {
        service.reset()
        testDefaults.removePersistentDomain(forName: testSuiteName)
        testDefaults = nil
        testSuiteName = nil
        service = nil
        super.tearDown()
    }

    // MARK: - Initial State Tests

    func testInitialStateIsFirstMeeting() {
        XCTAssertEqual(service.currentStage, .firstMeeting)
        XCTAssertEqual(service.stageProgress, 0.0)
        XCTAssertTrue(service.isFirstSession)
    }

    func testInitialMetricsAreZero() {
        XCTAssertEqual(service.metrics.totalCalls, 0)
        XCTAssertEqual(service.metrics.totalDuration, 0)
        XCTAssertEqual(service.metrics.insightsShared, 0)
        XCTAssertEqual(service.metrics.vulnerabilityMoments, 0)
        XCTAssertEqual(service.metrics.consecutiveDays, 0)
        XCTAssertNil(service.metrics.lastCallDate)
    }

    func testInitialMemoriesAreEmpty() {
        XCTAssertTrue(service.memories.isEmpty)
    }

    // MARK: - Call Recording Tests

    func testRecordCallUpdatesMetrics() {
        service.recordCall(duration: 300, hadMeaningfulExchange: false)

        XCTAssertEqual(service.metrics.totalCalls, 1)
        XCTAssertEqual(service.metrics.totalDuration, 300)
        XCTAssertEqual(service.metrics.meaningfulExchanges, 0)
        XCTAssertFalse(service.isFirstSession)
    }

    func testRecordMeaningfulExchange() {
        service.recordCall(duration: 120, hadMeaningfulExchange: true)

        XCTAssertEqual(service.metrics.meaningfulExchanges, 1)
    }

    func testMultipleCallsAccumulate() {
        service.recordCall(duration: 100)
        service.recordCall(duration: 200)
        service.recordCall(duration: 150)

        XCTAssertEqual(service.metrics.totalCalls, 3)
        XCTAssertEqual(service.metrics.totalDuration, 450)
    }

    func testFirstCallSetsConsecutiveDays() {
        service.recordCall(duration: 60)

        XCTAssertEqual(service.metrics.consecutiveDays, 1)
        XCTAssertNotNil(service.metrics.lastCallDate)
    }

    // MARK: - Insight Recording Tests

    func testRecordInsightShared() {
        service.recordInsightShared()
        service.recordInsightShared()
        service.recordInsightShared()

        XCTAssertEqual(service.metrics.insightsShared, 3)
    }

    // MARK: - Return Recording Tests

    func testRecordReturn() {
        service.recordReturn()
        service.recordReturn()

        XCTAssertEqual(service.metrics.returnsAfterAbsence, 2)
    }

    // MARK: - Vulnerability Moment Tests

    func testRecordVulnerabilityMoment() {
        service.recordVulnerabilityMoment()

        XCTAssertEqual(service.metrics.vulnerabilityMoments, 1)
    }

    func testVulnerabilityMilestoneCreatesMemory() {
        // Record 5 vulnerability moments to trigger milestone
        for _ in 1...5 {
            service.recordVulnerabilityMoment()
        }

        // Should have at least one milestone memory
        let milestoneMemories = service.memories.filter { $0.type == .milestone }
        XCTAssertFalse(milestoneMemories.isEmpty, "Should create milestone memory after 5 vulnerability moments")
    }

    // MARK: - Stage Progression Tests

    func testProgressToGettingStarted() {
        // Need 3+ calls, 15+ minutes to reach Getting Started
        service.recordCall(duration: 400) // 6.6 min
        service.recordCall(duration: 400) // 13.3 min
        service.recordCall(duration: 200) // 16.6 min total, 3 calls

        XCTAssertEqual(service.currentStage, .gettingStarted)
    }

    func testProgressToBuildingTrust() {
        // Need 10+ calls, 2+ hours (7200s), 3+ insights
        for _ in 1...10 {
            service.recordCall(duration: 750) // 7500s total = 125 min > 2 hours
        }
        service.recordInsightShared()
        service.recordInsightShared()
        service.recordInsightShared()

        XCTAssertEqual(service.currentStage, .buildingTrust)
    }

    func testProgressToEstablished() {
        // Need 25+ calls, 5+ hours (18000s), 10+ insights
        for _ in 1...25 {
            service.recordCall(duration: 800) // 20000s total > 5 hours
        }
        for _ in 1...10 {
            service.recordInsightShared()
        }

        XCTAssertEqual(service.currentStage, .established)
    }

    func testProgressToDeepPartnership() {
        // Need 50+ calls, 10+ hours (36000s), 20+ insights, 5+ returns
        for _ in 1...50 {
            service.recordCall(duration: 800) // 40000s total > 10 hours
        }
        for _ in 1...20 {
            service.recordInsightShared()
        }
        for _ in 1...5 {
            service.recordReturn()
        }

        XCTAssertEqual(service.currentStage, .deepPartnership)
    }

    func testStageAdvancementCreatesMemory() {
        // Advance to Getting Started
        service.recordCall(duration: 400)
        service.recordCall(duration: 400)
        service.recordCall(duration: 200)

        let advancementMemories = service.memories.filter { $0.type == .stageAdvancement }
        XCTAssertFalse(advancementMemories.isEmpty, "Should create memory on stage advancement")
    }

    func testJustAdvancedFlag() {
        // Start fresh
        XCTAssertFalse(service.justAdvanced)

        // Advance to next stage
        service.recordCall(duration: 400)
        service.recordCall(duration: 400)
        service.recordCall(duration: 200)

        XCTAssertTrue(service.justAdvanced, "justAdvanced should be true immediately after advancement")
    }

    // MARK: - Progress Calculation Tests

    func testStageProgressUpdates() {
        // One call should update progress slightly
        service.recordCall(duration: 100)

        XCTAssertGreaterThan(service.stageProgress, 0, "Progress should increase after a call")
        XCTAssertLessThan(service.stageProgress, 1, "Should not reach full progress yet")
    }

    func testProgressNeverExceedsOne() {
        // Make many calls
        for _ in 1...100 {
            service.recordCall(duration: 10)
        }

        XCTAssertLessThanOrEqual(service.stageProgress, 1.0)
    }

    // MARK: - Memory Tests

    func testAddMemory() {
        service.addMemory(type: .insight, title: "Test Memory", description: "A test description")

        XCTAssertEqual(service.memories.count, 1)
        XCTAssertEqual(service.memories.first?.title, "Test Memory")
        XCTAssertEqual(service.memories.first?.type, .insight)
        XCTAssertEqual(service.memories.first?.stage, .firstMeeting)
    }

    func testMemoryHasCorrectStage() {
        // Advance to Getting Started
        service.recordCall(duration: 400)
        service.recordCall(duration: 400)
        service.recordCall(duration: 200)

        // Add memory after advancement
        service.addMemory(type: .breakthrough, title: "Post-Advance Memory", description: "Test")

        let breakthroughMemory = service.memories.first { $0.type == .breakthrough }
        XCTAssertEqual(breakthroughMemory?.stage, .gettingStarted)
    }

    // MARK: - Reset Tests

    func testResetClearsAllState() {
        // Build up some state
        service.recordCall(duration: 500)
        service.recordInsightShared()
        service.addMemory(type: .celebration, title: "Test", description: "Test")

        // Reset
        service.reset()

        // Verify everything is cleared
        XCTAssertEqual(service.currentStage, .firstMeeting)
        XCTAssertEqual(service.stageProgress, 0)
        XCTAssertEqual(service.metrics.totalCalls, 0)
        XCTAssertEqual(service.metrics.insightsShared, 0)
        XCTAssertTrue(service.memories.isEmpty)
        XCTAssertFalse(service.justAdvanced)
    }

    // MARK: - Persistence Tests

    func testStatePersistsThroughReinit() {
        // Build up state
        service.recordCall(duration: 400)
        service.recordCall(duration: 400)
        service.recordCall(duration: 200) // Should advance to Getting Started

        // Create new service with same storage
        let service2 = RelationshipArcService.createForTesting(storage: testDefaults)

        XCTAssertEqual(service2.currentStage, .gettingStarted)
        XCTAssertEqual(service2.metrics.totalCalls, 3)
    }

    func testMetricsPersist() {
        service.recordCall(duration: 123)
        service.recordInsightShared()
        service.recordReturn()
        service.recordVulnerabilityMoment()

        let service2 = RelationshipArcService.createForTesting(storage: testDefaults)

        XCTAssertEqual(service2.metrics.totalCalls, 1)
        XCTAssertEqual(service2.metrics.totalDuration, 123)
        XCTAssertEqual(service2.metrics.insightsShared, 1)
        XCTAssertEqual(service2.metrics.returnsAfterAbsence, 1)
        XCTAssertEqual(service2.metrics.vulnerabilityMoments, 1)
    }

    func testMemoriesPersist() {
        service.addMemory(type: .celebration, title: "Persisted", description: "Should save")

        let service2 = RelationshipArcService.createForTesting(storage: testDefaults)

        XCTAssertEqual(service2.memories.count, 1)
        XCTAssertEqual(service2.memories.first?.title, "Persisted")
    }

    // MARK: - Relationship Stage Property Tests

    func testStageSubtitle() {
        XCTAssertEqual(service.stageSubtitle, RelationshipStage.firstMeeting.subtitle)
    }

    func testStageDescription() {
        XCTAssertEqual(service.stageDescription, RelationshipStage.firstMeeting.description)
    }

    // MARK: - Formatted Duration Tests

    func testFormattedDurationMinutesOnly() {
        service.recordCall(duration: 300) // 5 minutes
        XCTAssertEqual(service.metrics.formattedDuration, "5 min")
    }

    func testFormattedDurationWithHours() {
        service.recordCall(duration: 3720) // 1 hour 2 minutes
        XCTAssertEqual(service.metrics.formattedDuration, "1h 2m")
    }
}

// MARK: - RelationshipStage Tests

final class RelationshipStageTests: XCTestCase {

    func testStageRawValues() {
        XCTAssertEqual(RelationshipStage.firstMeeting.rawValue, "first-meeting")
        XCTAssertEqual(RelationshipStage.gettingStarted.rawValue, "getting-started")
        XCTAssertEqual(RelationshipStage.buildingTrust.rawValue, "building-trust")
        XCTAssertEqual(RelationshipStage.established.rawValue, "established")
        XCTAssertEqual(RelationshipStage.deepPartnership.rawValue, "deep-partnership")
    }

    func testStageTitles() {
        XCTAssertEqual(RelationshipStage.firstMeeting.title, "First Meeting")
        XCTAssertEqual(RelationshipStage.deepPartnership.title, "Deep Partnership")
    }

    func testStageSubtitles() {
        XCTAssertEqual(RelationshipStage.firstMeeting.subtitle, "Nice to meet you")
        XCTAssertEqual(RelationshipStage.deepPartnership.subtitle, "We've been through a lot together")
    }

    func testStageColors() {
        // All stages should have non-empty colors
        for stage in RelationshipStage.allCases {
            XCTAssertFalse(stage.color.isEmpty, "\(stage) should have a color")
            XCTAssertEqual(stage.color.count, 6, "\(stage) color should be 6 hex chars")
        }
    }

    func testStageIconNames() {
        XCTAssertEqual(RelationshipStage.firstMeeting.iconName, "hand.wave")
        XCTAssertEqual(RelationshipStage.deepPartnership.iconName, "infinity")
    }

    func testAllStagesIterable() {
        XCTAssertEqual(RelationshipStage.allCases.count, 5)
    }

    func testStageOrderedCorrectly() {
        let stages = RelationshipStage.allCases
        XCTAssertEqual(stages[0], .firstMeeting)
        XCTAssertEqual(stages[1], .gettingStarted)
        XCTAssertEqual(stages[2], .buildingTrust)
        XCTAssertEqual(stages[3], .established)
        XCTAssertEqual(stages[4], .deepPartnership)
    }
}

// MARK: - MemoryType Tests

final class MemoryTypeTests: XCTestCase {

    func testMemoryTypeRawValues() {
        XCTAssertEqual(MemoryType.stageAdvancement.rawValue, "stage-advancement")
        XCTAssertEqual(MemoryType.milestone.rawValue, "milestone")
        XCTAssertEqual(MemoryType.insight.rawValue, "insight")
        XCTAssertEqual(MemoryType.breakthrough.rawValue, "breakthrough")
        XCTAssertEqual(MemoryType.celebration.rawValue, "celebration")
    }

    func testMemoryTypeCodable() throws {
        let original = MemoryType.celebration
        let encoded = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(MemoryType.self, from: encoded)
        XCTAssertEqual(original, decoded)
    }
}

// MARK: - RelationshipMetrics Tests

final class RelationshipMetricsTests: XCTestCase {

    func testDefaultInitialization() {
        let metrics = RelationshipMetrics()

        XCTAssertEqual(metrics.totalCalls, 0)
        XCTAssertEqual(metrics.totalDuration, 0)
        XCTAssertEqual(metrics.insightsShared, 0)
        XCTAssertEqual(metrics.vulnerabilityMoments, 0)
        XCTAssertEqual(metrics.returnsAfterAbsence, 0)
        XCTAssertEqual(metrics.consecutiveDays, 0)
        XCTAssertEqual(metrics.meaningfulExchanges, 0)
        XCTAssertNil(metrics.lastCallDate)
    }

    func testMetricsCodable() throws {
        var original = RelationshipMetrics()
        original.totalCalls = 42
        original.totalDuration = 3600
        original.insightsShared = 10
        original.lastCallDate = Date()

        let encoded = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(RelationshipMetrics.self, from: encoded)

        XCTAssertEqual(decoded.totalCalls, 42)
        XCTAssertEqual(decoded.totalDuration, 3600)
        XCTAssertEqual(decoded.insightsShared, 10)
        XCTAssertNotNil(decoded.lastCallDate)
    }

    func testFormattedDurationZero() {
        let metrics = RelationshipMetrics()
        XCTAssertEqual(metrics.formattedDuration, "0 min")
    }
}
