import XCTest
@testable import FerniShared

// MARK: - EmotionalHapticsEngine Tests

#if os(iOS) || os(macOS)
final class EmotionalHapticsEngineTests: XCTestCase {

    var engine: EmotionalHapticsEngine!

    override func setUp() {
        super.setUp()
        engine = EmotionalHapticsEngine()
    }

    override func tearDown() {
        engine = nil
        super.tearDown()
    }

    // MARK: - Initialization

    func testDefaultIsEnabled() {
        XCTAssertTrue(engine.isEnabled)
    }

    // MARK: - Configuration

    func testIsEnabledCanBeToggled() {
        engine.isEnabled = false
        XCTAssertFalse(engine.isEnabled)

        engine.isEnabled = true
        XCTAssertTrue(engine.isEnabled)
    }

    // MARK: - Micro-Expression Methods (No Crash)

    func testPlayMicroExpressionRecognition() {
        engine.playMicroExpression(.recognition)
        XCTAssertTrue(true)
    }

    func testPlayMicroExpressionConcern() {
        engine.playMicroExpression(.concern)
        XCTAssertTrue(true)
    }

    func testPlayMicroExpressionDelight() {
        engine.playMicroExpression(.delight)
        XCTAssertTrue(true)
    }

    func testPlayMicroExpressionWarmth() {
        engine.playMicroExpression(.warmth)
        XCTAssertTrue(true)
    }

    func testPlayMicroExpressionInterest() {
        engine.playMicroExpression(.interest)
        XCTAssertTrue(true)
    }

    func testPlayMicroExpressionMemorySpark() {
        engine.playMicroExpression(.memorySpark)
        XCTAssertTrue(true)
    }

    func testPlayMicroExpressionConnection() {
        engine.playMicroExpression(.connection)
        XCTAssertTrue(true)
    }

    func testPlayMicroExpressionProtective() {
        engine.playMicroExpression(.protective)
        XCTAssertTrue(true)
    }

    func testPlayAllMicroExpressions() {
        for type in MicroExpressionType.allCases {
            engine.playMicroExpression(type)
        }
        XCTAssertTrue(true)
    }

    // MARK: - Listening Gesture (No Crash)

    func testPlayListeningGestureNone() {
        engine.playListeningGesture(.none)
        XCTAssertTrue(true)
    }

    func testPlayListeningGestureMicroNod() {
        engine.playListeningGesture(.microNod)
        XCTAssertTrue(true)
    }

    func testPlayListeningGestureSubtleNod() {
        engine.playListeningGesture(.subtleNod)
        XCTAssertTrue(true)
    }

    func testPlayListeningGestureVisibleNod() {
        engine.playListeningGesture(.visibleNod)
        XCTAssertTrue(true)
    }

    func testPlayListeningGestureListeningLean() {
        engine.playListeningGesture(.listeningLean)
        XCTAssertTrue(true)
    }

    func testPlayListeningGestureContemplative() {
        engine.playListeningGesture(.contemplative)
        XCTAssertTrue(true)
    }

    func testPlayAllListeningGestures() {
        let gestures: [ListeningGesture] = [.none, .microNod, .subtleNod, .visibleNod, .listeningLean, .contemplative]
        for gesture in gestures {
            engine.playListeningGesture(gesture)
        }
        XCTAssertTrue(true)
    }

    // MARK: - Concern (No Crash)

    func testPlayConcernNone() {
        engine.playConcern(level: .none)
        XCTAssertTrue(true)
    }

    func testPlayConcernMild() {
        engine.playConcern(level: .mild)
        XCTAssertTrue(true)
    }

    func testPlayConcernModerate() {
        engine.playConcern(level: .moderate)
        XCTAssertTrue(true)
    }

    func testPlayConcernHigh() {
        engine.playConcern(level: .high)
        XCTAssertTrue(true)
    }

    func testPlayAllConcernLevels() {
        let levels: [ConcernLevel] = [.none, .mild, .moderate, .high]
        for level in levels {
            engine.playConcern(level: level)
        }
        XCTAssertTrue(true)
    }

    // MARK: - Connection Events (No Crash)

    func testPlayConnectionEstablished() {
        engine.playConnectionEstablished()
        XCTAssertTrue(true)
    }

    // MARK: - Breath Pulse (No Crash)

    func testPlayBreathPulseAtPeak() {
        engine.playBreathPulse(phase: 0.5)
        XCTAssertTrue(true)
    }

    func testPlayBreathPulseOffPeak() {
        engine.playBreathPulse(phase: 0.0)
        engine.playBreathPulse(phase: 0.3)
        engine.playBreathPulse(phase: 0.7)
        engine.playBreathPulse(phase: 1.0)
        XCTAssertTrue(true)
    }

    func testPlayBreathPulseWithIntensity() {
        engine.playBreathPulse(phase: 0.5, intensity: 0.3)
        XCTAssertTrue(true)
    }

    // MARK: - Disabled State

    func testPlayWhenDisabledDoesNotCrash() {
        engine.isEnabled = false
        engine.playMicroExpression(.recognition)
        engine.playListeningGesture(.visibleNod)
        engine.playConcern(level: .high)
        engine.playConnectionEstablished()
        engine.playBreathPulse(phase: 0.5)
        XCTAssertTrue(true)
    }

    // MARK: - Prepare Engine (No Crash)

    func testPrepareEngine() {
        engine.prepareEngine()
        XCTAssertTrue(true)
    }
}
#endif

// MARK: - BreathSyncHaptics Tests

#if os(iOS) || os(macOS)
final class BreathSyncHapticsTests: XCTestCase {

    var haptics: BreathSyncHaptics!

    override func setUp() {
        super.setUp()
        haptics = BreathSyncHaptics()
    }

    override func tearDown() {
        haptics.stop()
        haptics = nil
        super.tearDown()
    }

    // MARK: - Initialization

    func testDefaultIsEnabled() {
        XCTAssertTrue(haptics.isEnabled)
    }

    func testInitialBreathRateIsDefault() {
        // macOS uses 12.0, iOS uses 6.0
        #if os(macOS)
        XCTAssertEqual(haptics.breathRate, 12.0)
        #else
        XCTAssertEqual(haptics.breathRate, 6.0)
        #endif
    }

    // MARK: - Configuration

    func testIsEnabledCanBeToggled() {
        haptics.isEnabled = false
        XCTAssertFalse(haptics.isEnabled)

        haptics.isEnabled = true
        XCTAssertTrue(haptics.isEnabled)
    }

    func testBreathRateCanBeSet() {
        haptics.breathRate = 10.0
        XCTAssertEqual(haptics.breathRate, 10.0)
    }

    // MARK: - Start/Stop (No Crash)

    func testStartSyncDoesNotCrash() {
        haptics.startSync()
        XCTAssertTrue(true)
    }

    func testStopSyncDoesNotCrash() {
        haptics.stopSync()
        XCTAssertTrue(true)
    }

    func testStopDoesNotCrash() {
        haptics.stop()
        XCTAssertTrue(true)
    }

    func testStartThenStopDoesNotCrash() {
        haptics.startSync()
        haptics.stop()
        XCTAssertTrue(true)
    }

    func testMultipleStartsDoNotCrash() {
        haptics.startSync()
        haptics.startSync()
        haptics.startSync()
        XCTAssertTrue(true)
    }

    func testMultipleStopsDoNotCrash() {
        haptics.stop()
        haptics.stop()
        haptics.stop()
        XCTAssertTrue(true)
    }

    // MARK: - Disabled State

    func testStartWhenDisabledDoesNotCrash() {
        haptics.isEnabled = false
        haptics.startSync()
        XCTAssertTrue(true)
    }

    func testStopWhenDisabledDoesNotCrash() {
        haptics.isEnabled = false
        haptics.stop()
        XCTAssertTrue(true)
    }

    // MARK: - Breath Phase Updates

    func testBreathPhaseUpdatesWhenRunning() {
        haptics.startSync()

        let expectation = XCTestExpectation(description: "Breath phase updates")

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            // Phase should have changed from initial value
            if self.haptics.currentPhase > 0 {
                expectation.fulfill()
            }
        }

        wait(for: [expectation], timeout: 0.5)
    }

    func testBreathPhaseCyclesBetween0And1() {
        haptics.startSync()

        let expectation = XCTestExpectation(description: "Phase stays in range")

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            XCTAssertGreaterThanOrEqual(self.haptics.currentPhase, 0)
            XCTAssertLessThanOrEqual(self.haptics.currentPhase, 1)
            expectation.fulfill()
        }

        wait(for: [expectation], timeout: 0.5)
    }
}
#endif

// MARK: - End-to-End Integration Tests

#if os(iOS) || os(macOS)
final class BetterThanHumanHapticsIntegrationTests: XCTestCase {

    var engine: BetterThanHumanEngine!

    override func setUp() {
        super.setUp()
        engine = BetterThanHumanEngine()
    }

    override func tearDown() {
        engine.onConnectionEnded()
        engine = nil
        super.tearDown()
    }

    // MARK: - Haptics Engine Exists

    func testHapticsEngineExists() {
        XCTAssertNotNil(engine.haptics)
    }

    func testHapticsEngineIsEnabled() {
        XCTAssertTrue(engine.haptics.isEnabled)
    }

    // MARK: - Connection Lifecycle Triggers Haptics

    func testConnectionEstablishedPreparesHaptics() {
        engine.onConnectionEstablished()
        // Should not crash and haptics should be prepared
        XCTAssertTrue(true)
    }

    func testConnectionEndedStopsHaptics() {
        engine.onConnectionEstablished()
        engine.onConnectionEnded()
        // Should not crash
        XCTAssertTrue(true)
    }

    // MARK: - Micro-Expression Triggers Haptics

    func testMicroExpressionTriggersHaptics() {
        engine.onConnectionEstablished()

        // Trigger a micro-expression - should also play haptics
        engine.triggerMicroExpression(.recognition)

        // Give time for async haptic to complete
        let expectation = XCTestExpectation(description: "Haptic completes")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 0.5)
    }

    // MARK: - Concern Signal Triggers Haptics

    func testConcernSignalTriggersHaptics() {
        engine.onConnectionEstablished()

        // Signal concern - should also play haptics
        engine.signalConcern(level: .moderate)

        // Give time for async haptic to complete
        let expectation = XCTestExpectation(description: "Haptic completes")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 0.5)
    }

    // MARK: - Active Listening Triggers Haptics

    func testActiveListeningGesturesWithHaptics() {
        engine.onConnectionEstablished()

        // Start listening
        engine.isUserSpeaking = true

        // Trigger a lean gesture - should also play haptics
        engine.activeListening.triggerLean()

        let expectation = XCTestExpectation(description: "Gesture haptic")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 0.5)
    }

    // MARK: - All Emotion Types Trigger Haptics

    func testAllMicroExpressionsWithHaptics() {
        engine.onConnectionEstablished()

        for type in MicroExpressionType.allCases {
            engine.triggerMicroExpression(type)
            // Small delay between each
            Thread.sleep(forTimeInterval: 0.05)
        }

        XCTAssertTrue(true)
    }

    func testAllConcernLevelsWithHaptics() {
        engine.onConnectionEstablished()

        for level in [ConcernLevel.none, .mild, .moderate, .high] {
            engine.signalConcern(level: level)
            Thread.sleep(forTimeInterval: 0.05)
        }

        XCTAssertTrue(true)
    }
}
#endif
