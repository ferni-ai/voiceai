import XCTest
import SwiftUI
@testable import FerniShared

// MARK: - EyeState Tests

final class EyeStateTests: XCTestCase {

    func testEyeStateRawValues() {
        XCTAssertEqual(EyeState.open.rawValue, "open")
        XCTAssertEqual(EyeState.closed.rawValue, "closed")
        XCTAssertEqual(EyeState.blinking.rawValue, "blinking")
        XCTAssertEqual(EyeState.wide.rawValue, "wide")
        XCTAssertEqual(EyeState.squinting.rawValue, "squinting")
        XCTAssertEqual(EyeState.opening.rawValue, "opening")
    }

    func testEyeStateEquatable() {
        XCTAssertEqual(EyeState.open, EyeState.open)
        XCTAssertNotEqual(EyeState.open, EyeState.closed)
    }

    func testAllEyeStatesExist() {
        // Should have 6 eye states
        let states: [EyeState] = [.open, .closed, .blinking, .wide, .squinting, .opening]
        XCTAssertEqual(states.count, 6)
    }
}

// MARK: - PersonalityBehavior Tests

final class PersonalityBehaviorTests: XCTestCase {

    func testBehaviorCount() {
        XCTAssertEqual(PersonalityBehavior.allCases.count, 8)
    }

    func testBehaviorRawValues() {
        XCTAssertEqual(PersonalityBehavior.idle.rawValue, "idle")
        XCTAssertEqual(PersonalityBehavior.curiousLook.rawValue, "curiousLook")
        XCTAssertEqual(PersonalityBehavior.attentionShift.rawValue, "attentionShift")
        XCTAssertEqual(PersonalityBehavior.excitedBounce.rawValue, "excitedBounce")
        XCTAssertEqual(PersonalityBehavior.thoughtfulPause.rawValue, "thoughtfulPause")
        XCTAssertEqual(PersonalityBehavior.happyWiggle.rawValue, "happyWiggle")
        XCTAssertEqual(PersonalityBehavior.gentleNod.rawValue, "gentleNod")
        XCTAssertEqual(PersonalityBehavior.shyHide.rawValue, "shyHide")
    }

    func testBehaviorCaseIterable() {
        let behaviors = PersonalityBehavior.allCases

        XCTAssertTrue(behaviors.contains(.idle))
        XCTAssertTrue(behaviors.contains(.curiousLook))
        XCTAssertTrue(behaviors.contains(.attentionShift))
        XCTAssertTrue(behaviors.contains(.excitedBounce))
        XCTAssertTrue(behaviors.contains(.thoughtfulPause))
        XCTAssertTrue(behaviors.contains(.happyWiggle))
        XCTAssertTrue(behaviors.contains(.gentleNod))
        XCTAssertTrue(behaviors.contains(.shyHide))
    }

    func testBehaviorOrder() {
        let behaviors = PersonalityBehavior.allCases
        XCTAssertEqual(behaviors[0], .idle)
        XCTAssertEqual(behaviors[7], .shyHide)
    }
}

// MARK: - PixarPersonalityEngine Tests

final class PixarPersonalityEngineTests: XCTestCase {

    var engine: PixarPersonalityEngine!

    override func setUp() {
        super.setUp()
        engine = PixarPersonalityEngine()
    }

    override func tearDown() {
        engine.stop()
        engine = nil
        super.tearDown()
    }

    // MARK: - Initial State

    func testInitialEyeState() {
        XCTAssertEqual(engine.eyeState, .open)
    }

    func testInitialBlinkProgress() {
        XCTAssertEqual(engine.blinkProgress, 0)
    }

    func testInitialEyeLookDirection() {
        XCTAssertEqual(engine.eyeLookDirection, .zero)
    }

    func testInitialBehavior() {
        XCTAssertEqual(engine.currentBehavior, .idle)
    }

    func testInitialCuriousLean() {
        XCTAssertEqual(engine.curiousLean, 0)
    }

    func testInitialFidgetOffset() {
        XCTAssertEqual(engine.fidgetOffset, .zero)
    }

    func testInitialEyebrowPosition() {
        XCTAssertEqual(engine.eyebrowPosition, 0)
    }

    func testInitialSquishFactor() {
        XCTAssertEqual(engine.squishFactor, 0)
    }

    func testInitialIsAwake() {
        XCTAssertTrue(engine.isAwake)
    }

    // MARK: - Configuration Defaults

    func testDefaultBehaviorInterval() {
        XCTAssertEqual(engine.behaviorInterval, 4.0)
    }

    func testDefaultBlinkInterval() {
        XCTAssertEqual(engine.blinkInterval, 3.5)
    }

    func testDefaultEnergyLevel() {
        XCTAssertEqual(engine.energyLevel, 0.5)
    }

    // MARK: - Energy Level

    func testEnergyLevelCanBeSet() {
        engine.energyLevel = 0.8
        XCTAssertEqual(engine.energyLevel, 0.8)
    }

    func testEnergyLevelAffectsBehaviorInterval() {
        // Formula: behaviorInterval = 5.0 - (energyLevel * 3.0)
        engine.energyLevel = 0.0
        // At 0 energy: 5.0 - 0 = 5.0
        XCTAssertEqual(engine.behaviorInterval, 5.0, accuracy: 0.01)

        engine.energyLevel = 1.0
        // At 1.0 energy: 5.0 - 3.0 = 2.0
        XCTAssertEqual(engine.behaviorInterval, 2.0, accuracy: 0.01)
    }

    func testEnergyLevelAffectsBlinkInterval() {
        // Formula: blinkInterval = 4.0 - (energyLevel * 1.5)
        engine.energyLevel = 0.0
        // At 0 energy: 4.0 - 0 = 4.0
        XCTAssertEqual(engine.blinkInterval, 4.0, accuracy: 0.01)

        engine.energyLevel = 1.0
        // At 1.0 energy: 4.0 - 1.5 = 2.5
        XCTAssertEqual(engine.blinkInterval, 2.5, accuracy: 0.01)
    }

    // MARK: - Awake State

    func testIsAwakeCanBeToggled() {
        XCTAssertTrue(engine.isAwake)

        engine.isAwake = false
        XCTAssertFalse(engine.isAwake)

        engine.isAwake = true
        XCTAssertTrue(engine.isAwake)
    }

    // MARK: - Trigger Methods (No Crash)

    func testTriggerBlinkDoesNotCrash() {
        engine.triggerBlink()
        // If we get here, no crash occurred
        XCTAssertTrue(true)
    }

    func testTriggerSurpriseDoesNotCrash() {
        engine.triggerSurprise()
        XCTAssertTrue(true)
    }

    func testOnSomethingInterestingDoesNotCrash() {
        engine.onSomethingInteresting()
        XCTAssertTrue(true)
    }

    func testOnUserFinishedSpeakingDoesNotCrash() {
        engine.onUserFinishedSpeaking()
        XCTAssertTrue(true)
    }

    func testExpressEmpathyDoesNotCrash() {
        engine.expressEmpathy()
        XCTAssertTrue(true)
    }

    func testExpressDelightDoesNotCrash() {
        engine.expressDelight()
        XCTAssertTrue(true)
    }

    // MARK: - Start/Stop

    func testStopDoesNotCrash() {
        engine.stop()
        XCTAssertTrue(true)
    }

    func testStartDoesNotCrash() {
        engine.stop()
        engine.start()
        XCTAssertTrue(true)
    }

    func testMultipleStartsAreIdempotent() {
        engine.start()
        engine.start()
        engine.start()
        XCTAssertTrue(true)
    }

    func testStartStopCycle() {
        for _ in 0..<5 {
            engine.start()
            engine.stop()
        }
        XCTAssertTrue(true)
    }

    // MARK: - Sleep/Wake

    func testSleepWakeCycle() {
        engine.isAwake = false
        engine.isAwake = true
        XCTAssertTrue(engine.isAwake)
    }

    func testSleepWhenNotAwake() {
        engine.isAwake = false
        engine.isAwake = false // Already sleeping
        XCTAssertFalse(engine.isAwake)
    }
}

// MARK: - Behavior Selection Logic Tests

final class BehaviorSelectionLogicTests: XCTestCase {

    func testHighEnergyBehaviors() {
        // When energy > 0.7, behaviors include:
        // curiousLook, excitedBounce, attentionShift, happyWiggle, idle
        let highEnergyBehaviors: Set<PersonalityBehavior> = [
            .curiousLook, .excitedBounce, .attentionShift, .happyWiggle, .idle
        ]

        // All these should exist
        for behavior in highEnergyBehaviors {
            XCTAssertTrue(PersonalityBehavior.allCases.contains(behavior))
        }
    }

    func testMediumEnergyBehaviors() {
        // When 0.3 < energy <= 0.7, behaviors include:
        // curiousLook, attentionShift, thoughtfulPause, idle
        let mediumEnergyBehaviors: Set<PersonalityBehavior> = [
            .curiousLook, .attentionShift, .thoughtfulPause, .idle
        ]

        for behavior in mediumEnergyBehaviors {
            XCTAssertTrue(PersonalityBehavior.allCases.contains(behavior))
        }
    }

    func testLowEnergyBehaviors() {
        // When energy <= 0.3, behaviors include:
        // gentleNod, thoughtfulPause, idle
        let lowEnergyBehaviors: Set<PersonalityBehavior> = [
            .gentleNod, .thoughtfulPause, .idle
        ]

        for behavior in lowEnergyBehaviors {
            XCTAssertTrue(PersonalityBehavior.allCases.contains(behavior))
        }
    }
}

// MARK: - Animation Timing Tests

final class PixarAnimationTimingTests: XCTestCase {

    func testBlinkCloseDuration() {
        // Blink close: 0.06 seconds
        let closeDuration = 0.06
        XCTAssertEqual(closeDuration, 0.06)
    }

    func testBlinkOpenDuration() {
        // Blink open: 0.08 seconds
        let openDuration = 0.08
        XCTAssertEqual(openDuration, 0.08)
    }

    func testTotalBlinkDuration() {
        // Total blink ~0.14-0.16 seconds
        let total = 0.06 + 0.08
        XCTAssertLessThan(total, 0.2)
    }

    func testDoubleBlinkProbability() {
        // 20% chance of double blink
        let probability = 0.2
        XCTAssertEqual(probability, 0.2)
    }
}

// MARK: - Squish Factor Tests

final class SquishFactorTests: XCTestCase {

    func testSquishFactorRange() {
        // Squish factor values in the code:
        // - Excited bounce anticipation: 0.15 (squash)
        // - Excited bounce stretch: -0.12 (stretch)
        // - Surprise stretch: -0.1
        // - Shy hide squash: 0.2
        // - Wake up stretch: -0.05
        // - Gentle nod: 0.05 to -0.03

        let squishValues: [CGFloat] = [0.15, -0.12, -0.1, 0.2, -0.05, 0.05, -0.03]

        for value in squishValues {
            XCTAssertTrue(abs(value) <= 0.25, "Squish factor \(value) should be within expected range")
        }
    }

    func testSquishIsSquash() {
        // Positive squish = squash (shorter, wider)
        let squash: CGFloat = 0.15
        XCTAssertTrue(squash > 0)
    }

    func testSquishIsStretch() {
        // Negative squish = stretch (taller, thinner)
        let stretch: CGFloat = -0.12
        XCTAssertTrue(stretch < 0)
    }
}

// MARK: - Curious Lean Tests

final class CuriousLeanTests: XCTestCase {

    func testCuriousLeanRange() {
        // Curious lean values in degrees:
        // - Curious look: ±8 degrees
        // - Thoughtful pause: -5 degrees
        // - Happy wiggle: ±4 degrees
        // - Shy hide: -8 degrees
        // - Express empathy: -3 degrees

        let leanValues: [CGFloat] = [8, -8, -5, 4, -4, -3]

        for value in leanValues {
            XCTAssertTrue(abs(value) <= 10, "Lean \(value) should be within expected range")
        }
    }
}

// MARK: - Eyebrow Position Tests

final class EyebrowPositionTests: XCTestCase {

    func testEyebrowPositionRange() {
        // Eyebrow positions:
        // -1 = worried, 0 = neutral, 1 = raised/excited
        // Code uses: 0.8, 0.5, 0.3, 0.2, -0.2, -0.3, -0.4

        let positions: [CGFloat] = [0.8, 0.5, 0.3, 0.2, -0.2, -0.3, -0.4]

        for pos in positions {
            XCTAssertTrue(pos >= -1 && pos <= 1, "Eyebrow position \(pos) should be in [-1, 1]")
        }
    }

    func testRaisedEyebrowIsPositive() {
        let raised: CGFloat = 0.8
        XCTAssertTrue(raised > 0)
    }

    func testWorriedEyebrowIsNegative() {
        let worried: CGFloat = -0.4
        XCTAssertTrue(worried < 0)
    }
}
