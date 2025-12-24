import XCTest
@testable import FerniShared

// MARK: - Better Than Human Engine Tests

final class BetterThanHumanEngineTests: XCTestCase {

    var engine: BetterThanHumanEngine!

    override func setUp() {
        super.setUp()
        engine = BetterThanHumanEngine()
    }

    override func tearDown() {
        engine = nil
        super.tearDown()
    }

    // MARK: - Initialization Tests

    func testInitialStateIsNeutral() {
        XCTAssertEqual(engine.currentState.listeningGesture, .none)
        XCTAssertNil(engine.currentState.microExpression)
        XCTAssertEqual(engine.currentState.breathPhase, 0)
        XCTAssertEqual(engine.currentState.concernLevel, .none)
        XCTAssertNil(engine.currentState.anticipatedEmotion)
    }

    func testSubEnginesExist() {
        XCTAssertNotNil(engine.activeListening)
        XCTAssertNotNil(engine.microExpressions)
        XCTAssertNotNil(engine.breathSync)
        XCTAssertNotNil(engine.anticipation)
        XCTAssertNotNil(engine.sounds)
    }

    // MARK: - User Speaking State Tests

    func testIsUserSpeakingStartsActiveListening() {
        XCTAssertFalse(engine.activeListening.isListening)

        engine.isUserSpeaking = true

        XCTAssertTrue(engine.activeListening.isListening)
    }

    func testIsUserSpeakingFalseStopsActiveListening() {
        engine.isUserSpeaking = true
        XCTAssertTrue(engine.activeListening.isListening)

        engine.isUserSpeaking = false

        XCTAssertFalse(engine.activeListening.isListening)
    }

    // MARK: - Micro-Expression Tests

    func testTriggerMicroExpressionUpdatesState() {
        engine.triggerMicroExpression(.recognition)

        // State updates via Combine - wait for propagation
        let expectation = XCTestExpectation(description: "Micro expression updates")

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            if self.engine.currentState.microExpression == .recognition {
                expectation.fulfill()
            }
        }

        wait(for: [expectation], timeout: 0.5)
    }

    func testTriggerMicroExpressionAllTypes() {
        // Test that all types can be triggered (check sub-engine directly)
        for type in MicroExpressionType.allCases {
            engine.microExpressions.trigger(type)
            XCTAssertEqual(engine.microExpressions.activeExpression, type)
        }
    }

    // MARK: - Concern Signal Tests

    func testSignalConcernUpdatesState() {
        engine.signalConcern(level: .moderate)

        XCTAssertEqual(engine.currentState.concernLevel, .moderate)
    }

    func testSignalConcernAllLevels() {
        let levels: [ConcernLevel] = [.none, .mild, .moderate, .high]

        for level in levels {
            engine.signalConcern(level: level)
            XCTAssertEqual(engine.currentState.concernLevel, level)
        }
    }

    // MARK: - Connection Lifecycle Tests

    func testOnConnectionEstablishedStartsBreathSync() {
        engine.onConnectionEstablished()

        // Breath sync should start - we can verify by checking if breath phase updates
        // (The timer is running)
        let expectation = XCTestExpectation(description: "Breath phase updates")

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            // After 100ms, breath phase should have changed from 0
            if self.engine.breathSync.currentBreathPhase != 0 || self.engine.breathSync.syncedBreathRate > 0 {
                expectation.fulfill()
            }
        }

        wait(for: [expectation], timeout: 0.5)
    }

    func testOnConnectionEndedResetsState() {
        // Setup some state
        engine.isUserSpeaking = true
        engine.signalConcern(level: .high)
        engine.onConnectionEstablished()

        // End connection
        engine.onConnectionEnded()

        // State should be reset
        XCTAssertEqual(engine.currentState.concernLevel, .none)
        XCTAssertNil(engine.currentState.anticipatedEmotion)
    }

    // MARK: - Partial Transcript Processing

    func testProcessPartialTranscriptForAnticipation() {
        // Process a pattern that should trigger anticipation
        engine.processPartialTranscript("guess what happened today")

        // Wait for async processing
        let expectation = XCTestExpectation(description: "Anticipation triggers")

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            if self.engine.anticipation.anticipatedEmotion == .excited {
                expectation.fulfill()
            }
        }

        wait(for: [expectation], timeout: 0.5)
    }
}

// MARK: - Active Listening Engine Tests

final class ActiveListeningEngineTests: XCTestCase {

    var engine: ActiveListeningEngine!

    override func setUp() {
        super.setUp()
        engine = ActiveListeningEngine()
    }

    override func tearDown() {
        engine.stopListening()
        engine = nil
        super.tearDown()
    }

    // MARK: - Initialization

    func testInitialStateIsNotListening() {
        XCTAssertFalse(engine.isListening)
        XCTAssertEqual(engine.currentGesture, .none)
    }

    // MARK: - Start/Stop

    func testStartListeningSetsFlag() {
        engine.startListening()
        XCTAssertTrue(engine.isListening)
    }

    func testStopListeningClearsState() {
        engine.startListening()
        engine.stopListening()

        XCTAssertFalse(engine.isListening)
        XCTAssertEqual(engine.currentGesture, .none)
    }

    // MARK: - Gesture State Tests

    func testGestureStartsAsNone() {
        engine.startListening()
        XCTAssertEqual(engine.currentGesture, .none)
    }

    func testUpdateIgnoredWhenNotListening() {
        // Don't call startListening
        engine.updatePauseDuration(0.5)

        XCTAssertEqual(engine.currentGesture, .none)
    }

    func testPauseDurationCanBeUpdated() {
        engine.startListening()

        // Should not crash when updating pause duration
        engine.updatePauseDuration(0.1)
        engine.updatePauseDuration(0.5)
        engine.updatePauseDuration(1.0)
        engine.updatePauseDuration(2.0)

        // Test passes if no crash
        XCTAssertTrue(engine.isListening)
    }

    // MARK: - Trigger Lean

    func testTriggerLeanWhenListening() {
        engine.startListening()
        engine.triggerLean()

        let expectation = XCTestExpectation(description: "Lean triggers")

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            if self.engine.currentGesture == .listeningLean {
                expectation.fulfill()
            }
        }

        wait(for: [expectation], timeout: 0.5)
    }

    func testTriggerLeanIgnoredWhenNotListening() {
        engine.triggerLean()
        XCTAssertEqual(engine.currentGesture, .none)
    }
}

// MARK: - Listening Gesture Tests

final class ListeningGestureTests: XCTestCase {

    func testGestureTransformValues() {
        XCTAssertEqual(ListeningGesture.none.transform.translateY, 0)
        XCTAssertEqual(ListeningGesture.none.transform.scale, 1.0)

        XCTAssertEqual(ListeningGesture.microNod.transform.translateY, 1.5)
        XCTAssertEqual(ListeningGesture.subtleNod.transform.translateY, 2.5)
        XCTAssertEqual(ListeningGesture.visibleNod.transform.translateY, 4.0)
        XCTAssertEqual(ListeningGesture.listeningLean.transform.translateY, -3.0)
    }

    func testGestureDurations() {
        XCTAssertEqual(ListeningGesture.none.duration, 0)
        XCTAssertEqual(ListeningGesture.microNod.duration, 0.18)
        XCTAssertEqual(ListeningGesture.subtleNod.duration, 0.22)
        XCTAssertEqual(ListeningGesture.visibleNod.duration, 0.28)
        XCTAssertEqual(ListeningGesture.listeningLean.duration, 0.4)
    }

    func testListeningTransformEquatable() {
        let t1 = ListeningTransform(translateY: 1.5, rotate: 0.3, scale: 0.998)
        let t2 = ListeningTransform(translateY: 1.5, rotate: 0.3, scale: 0.998)
        let t3 = ListeningTransform(translateY: 2.5, rotate: 0.5, scale: 0.996)

        XCTAssertEqual(t1, t2)
        XCTAssertNotEqual(t1, t3)
    }
}

// MARK: - Micro-Expression Engine Tests

final class MicroExpressionEngineTests: XCTestCase {

    var engine: MicroExpressionEngine!

    override func setUp() {
        super.setUp()
        engine = MicroExpressionEngine()
    }

    override func tearDown() {
        engine = nil
        super.tearDown()
    }

    // MARK: - Initialization

    func testInitialStateIsNeutral() {
        XCTAssertNil(engine.activeExpression)
        XCTAssertEqual(engine.expressionIntensity, 0)
    }

    // MARK: - Trigger Tests

    func testTriggerSetsExpression() {
        engine.trigger(.recognition)
        XCTAssertEqual(engine.activeExpression, .recognition)
    }

    func testTriggerSetsIntensity() {
        engine.trigger(.delight)
        XCTAssertEqual(engine.expressionIntensity, MicroExpressionType.delight.intensity)
    }

    func testTriggerAutoResets() {
        engine.trigger(.recognition)

        // Recognition duration is 80ms, so after ~150ms it should be reset
        let expectation = XCTestExpectation(description: "Expression resets")

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            if self.engine.activeExpression == nil {
                expectation.fulfill()
            }
        }

        wait(for: [expectation], timeout: 0.5)
    }
}

// MARK: - Micro-Expression Type Tests

final class MicroExpressionTypeTests: XCTestCase {

    func testAllTypesDurationAreSubLiminal() {
        // All durations should be 40-150ms (0.04-0.15 seconds)
        for type in MicroExpressionType.allCases {
            XCTAssertGreaterThanOrEqual(type.duration, 0.04, "\(type) duration too short")
            XCTAssertLessThanOrEqual(type.duration, 0.15, "\(type) duration too long for subliminal")
        }
    }

    func testSpecificDurations() {
        XCTAssertEqual(MicroExpressionType.recognition.duration, 0.08)  // 80ms
        XCTAssertEqual(MicroExpressionType.concern.duration, 0.06)     // 60ms
        XCTAssertEqual(MicroExpressionType.delight.duration, 0.10)     // 100ms
        XCTAssertEqual(MicroExpressionType.warmth.duration, 0.12)      // 120ms
        XCTAssertEqual(MicroExpressionType.interest.duration, 0.07)    // 70ms
    }

    func testIntensitiesAreInRange() {
        for type in MicroExpressionType.allCases {
            XCTAssertGreaterThan(type.intensity, 0)
            XCTAssertLessThanOrEqual(type.intensity, 1.0)
        }
    }

    func testSoulEffectsExist() {
        for type in MicroExpressionType.allCases {
            let effect = type.soulEffect
            // Warmth opacity should be in valid range
            XCTAssertGreaterThanOrEqual(effect.warmthOpacity, 0)
            XCTAssertLessThanOrEqual(effect.warmthOpacity, 1.0)
        }
    }

    func testMicroSoulEffectEquatable() {
        let e1 = MicroSoulEffect(warmthOpacity: 0.3, sparkOpacity: 0.4, shimmerBoost: 0)
        let e2 = MicroSoulEffect(warmthOpacity: 0.3, sparkOpacity: 0.4, shimmerBoost: 0)
        let e3 = MicroSoulEffect(warmthOpacity: 0.5, sparkOpacity: 0.2, shimmerBoost: 0.1)

        XCTAssertEqual(e1, e2)
        XCTAssertNotEqual(e1, e3)
    }
}

// MARK: - Anticipation Engine Tests

final class AnticipationEngineTests: XCTestCase {

    var engine: AnticipationEngine!

    override func setUp() {
        super.setUp()
        engine = AnticipationEngine()
    }

    override func tearDown() {
        engine.clear()
        engine = nil
        super.tearDown()
    }

    // MARK: - Initialization

    func testInitialStateIsNeutral() {
        XCTAssertNil(engine.anticipatedEmotion)
        XCTAssertEqual(engine.confidence, 0)
    }

    // MARK: - Pattern Matching

    func testGuessWhatTriggersExcitement() {
        engine.analyze(partialText: "guess what happened to me today")
        XCTAssertEqual(engine.anticipatedEmotion, .excited)
    }

    func testRememberWhenTriggersNostalgia() {
        engine.analyze(partialText: "remember when we used to play together")
        XCTAssertEqual(engine.anticipatedEmotion, .nostalgic)
    }

    func testIveBeenThinkingTriggersReflective() {
        engine.analyze(partialText: "i've been thinking about something important")
        XCTAssertEqual(engine.anticipatedEmotion, .reflective)
    }

    func testINeedToTellYouTriggersAttentive() {
        engine.analyze(partialText: "i need to tell you something serious")
        XCTAssertEqual(engine.anticipatedEmotion, .attentive)
    }

    func testThankYouTriggersWarm() {
        engine.analyze(partialText: "thank you so much for everything")
        XCTAssertEqual(engine.anticipatedEmotion, .warm)
    }

    func testDistressTriggersConcer() {
        engine.analyze(partialText: "i can't do this anymore")
        XCTAssertEqual(engine.anticipatedEmotion, .concerned)
    }

    // MARK: - Minimum Length

    func testShortTextIgnored() {
        engine.analyze(partialText: "hi there")  // Less than 12 chars
        XCTAssertNil(engine.anticipatedEmotion)
    }

    // MARK: - Tone Enhancement

    func testToneBoostsConfidence() {
        // Analyze with matching tone
        engine.analyze(partialText: "guess what amazing thing", tone: .rising)
        let confidenceWithTone = engine.confidence

        // Reset
        engine.clear()

        // Analyze without tone
        engine.analyze(partialText: "guess what amazing thing")
        let confidenceWithoutTone = engine.confidence

        XCTAssertGreaterThan(confidenceWithTone, confidenceWithoutTone)
    }

    // MARK: - Clear

    func testClearResetsState() {
        engine.analyze(partialText: "guess what happened to me today")
        XCTAssertNotNil(engine.anticipatedEmotion)

        engine.clear()

        XCTAssertNil(engine.anticipatedEmotion)
        XCTAssertEqual(engine.confidence, 0)
    }
}

// MARK: - Anticipated Emotion Tests

final class AnticipatedEmotionTests: XCTestCase {

    func testAllEmotionsHaveExpressionHint() {
        let emotions: [AnticipatedEmotion] = [
            .reflective, .vulnerable, .uncertain, .excited,
            .nostalgic, .attentive, .concerned, .warm, .curious
        ]

        for emotion in emotions {
            // Should not crash
            let _ = emotion.expressionHint
        }
    }

    func testAllEmotionsHaveVisualShift() {
        let emotions: [AnticipatedEmotion] = [
            .reflective, .vulnerable, .uncertain, .excited,
            .nostalgic, .attentive, .concerned, .warm, .curious
        ]

        for emotion in emotions {
            let visual = emotion.visualShift
            // Lean should be negative (toward user)
            XCTAssertLessThanOrEqual(visual.leanY, 0, "\(emotion) should lean toward user")
        }
    }

    func testAnticipationVisualEquatable() {
        let v1 = AnticipationVisual(leanY: -2, warmth: 0.2, shimmerBoost: -0.1)
        let v2 = AnticipationVisual(leanY: -2, warmth: 0.2, shimmerBoost: -0.1)
        let v3 = AnticipationVisual(leanY: -3, warmth: 0.4, shimmerBoost: 0)

        XCTAssertEqual(v1, v2)
        XCTAssertNotEqual(v1, v3)
    }
}

// MARK: - Breath Sync Engine Tests

final class BreathSyncEngineTests: XCTestCase {

    var engine: BreathSyncEngine!

    override func setUp() {
        super.setUp()
        engine = BreathSyncEngine()
    }

    override func tearDown() {
        engine.stop()
        engine = nil
        super.tearDown()
    }

    // MARK: - Initialization

    func testInitialStateIsIdle() {
        XCTAssertEqual(engine.currentBreathPhase, 0)
        XCTAssertEqual(engine.syncStrength, 0)
    }

    // MARK: - Start/Stop

    func testStartSetsDefaultRate() {
        engine.start()
        XCTAssertEqual(engine.syncedBreathRate, PixarTiming.breathCycleIdle)
    }

    func testStopResetsState() {
        engine.start()
        engine.stop()

        XCTAssertEqual(engine.currentBreathPhase, 0)
        XCTAssertEqual(engine.syncStrength, 0)
    }

    // MARK: - Breath Phase Updates

    func testBreathPhaseUpdatesWhenRunning() {
        engine.start()

        let expectation = XCTestExpectation(description: "Breath phase updates")

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            if self.engine.currentBreathPhase > 0 {
                expectation.fulfill()
            }
        }

        wait(for: [expectation], timeout: 0.5)
    }

    // MARK: - Manual Rate Setting

    func testSetBreathRateClampsToRange() {
        engine.start()

        // Set too fast
        engine.setBreathRate(1.0)
        XCTAssertGreaterThanOrEqual(engine.syncedBreathRate, 3.0)

        // Set too slow
        engine.setBreathRate(20.0)
        XCTAssertLessThanOrEqual(engine.syncedBreathRate, 10.0)
    }

    // MARK: - Reset to Idle

    func testResetToIdleRestoresDefaults() {
        engine.start()
        engine.setBreathRate(4.0)

        engine.resetToIdle()

        XCTAssertEqual(engine.syncedBreathRate, PixarTiming.breathCycleIdle)
        XCTAssertEqual(engine.syncStrength, 0)
    }
}

// MARK: - Voice Tone Tests

final class VoiceToneTests: XCTestCase {

    func testAllTonesExist() {
        let tones: [VoiceTone] = [.neutral, .rising, .falling, .breaking, .strained]
        XCTAssertEqual(tones.count, 5)
    }

    func testRawValues() {
        XCTAssertEqual(VoiceTone.neutral.rawValue, "neutral")
        XCTAssertEqual(VoiceTone.rising.rawValue, "rising")
        XCTAssertEqual(VoiceTone.falling.rawValue, "falling")
        XCTAssertEqual(VoiceTone.breaking.rawValue, "breaking")
        XCTAssertEqual(VoiceTone.strained.rawValue, "strained")
    }
}

// MARK: - Concern Level Tests

final class ConcernLevelTests: XCTestCase {

    func testAllLevelsExist() {
        let levels: [ConcernLevel] = [.none, .mild, .moderate, .high]
        XCTAssertEqual(levels.count, 4)
    }

    func testRawValues() {
        XCTAssertEqual(ConcernLevel.none.rawValue, "none")
        XCTAssertEqual(ConcernLevel.mild.rawValue, "mild")
        XCTAssertEqual(ConcernLevel.moderate.rawValue, "moderate")
        XCTAssertEqual(ConcernLevel.high.rawValue, "high")
    }
}

// MARK: - Better Than Human State Tests

final class BetterThanHumanStateTests: XCTestCase {

    func testDefaultInitialization() {
        let state = BetterThanHumanState()

        XCTAssertEqual(state.listeningGesture, .none)
        XCTAssertNil(state.microExpression)
        XCTAssertEqual(state.breathPhase, 0)
        XCTAssertEqual(state.breathRate, 6.0)
        XCTAssertNil(state.anticipatedEmotion)
        XCTAssertEqual(state.concernLevel, .none)
    }
}
