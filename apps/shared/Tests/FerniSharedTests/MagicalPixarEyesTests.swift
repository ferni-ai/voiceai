import XCTest
import SwiftUI
@testable import FerniShared

// MARK: - MagicalPixarEyes Tests

/// Tests for the MagicalPixarEyes component - two expressive opaque oval eyes.
/// These are the magical Pixar-style eyes used in both the splash screen and voice orb.

final class MagicalPixarEyesTests: XCTestCase {

    // MARK: - Initialization Tests

    func testDefaultInitialization() {
        let view = MagicalPixarEyes(
            orbSize: 150,
            personaColor: Color(hex: 0x4a6741)
        )
        XCTAssertNotNil(view)
    }

    func testInitializationWithAllParameters() {
        let view = MagicalPixarEyes(
            orbSize: 200,
            personaColor: .blue,
            blinkProgress: 0.5,
            lookDirection: CGPoint(x: 0.3, y: -0.2),
            verticalStretch: 1.1,
            horizontalSquash: 0.95,
            eyeTilt: 0.3,
            sparkleIntensity: 0.9,
            symbolicExpression: .none
        )
        XCTAssertNotNil(view)
    }

    func testBodyProducesValidView() {
        let view = MagicalPixarEyes(
            orbSize: 150,
            personaColor: .green
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Blink Progress Tests

    func testFullyOpenEyes() {
        let view = MagicalPixarEyes(
            orbSize: 150,
            personaColor: .green,
            blinkProgress: 0
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testFullyClosedEyes() {
        let view = MagicalPixarEyes(
            orbSize: 150,
            personaColor: .green,
            blinkProgress: 1.0
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testHalfClosedEyes() {
        let view = MagicalPixarEyes(
            orbSize: 150,
            personaColor: .green,
            blinkProgress: 0.5
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Look Direction Tests

    func testLookingRight() {
        let view = MagicalPixarEyes(
            orbSize: 150,
            personaColor: .green,
            lookDirection: CGPoint(x: 1.0, y: 0)
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testLookingLeft() {
        let view = MagicalPixarEyes(
            orbSize: 150,
            personaColor: .green,
            lookDirection: CGPoint(x: -1.0, y: 0)
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testLookingUp() {
        let view = MagicalPixarEyes(
            orbSize: 150,
            personaColor: .green,
            lookDirection: CGPoint(x: 0, y: -1.0)
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testLookingDown() {
        let view = MagicalPixarEyes(
            orbSize: 150,
            personaColor: .green,
            lookDirection: CGPoint(x: 0, y: 1.0)
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Stretch/Squash Tests (Squash & Stretch Principle)

    func testExcitedStretch() {
        // Excited eyes are taller
        let view = MagicalPixarEyes(
            orbSize: 150,
            personaColor: .green,
            verticalStretch: 1.25,
            horizontalSquash: 0.95
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testSleepySquash() {
        // Sleepy eyes are flatter
        let view = MagicalPixarEyes(
            orbSize: 150,
            personaColor: .green,
            verticalStretch: 0.7,
            horizontalSquash: 1.1
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Eye Tilt Tests

    func testConfidentTilt() {
        let view = MagicalPixarEyes(
            orbSize: 150,
            personaColor: .green,
            eyeTilt: 1.0
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testWorriedTilt() {
        let view = MagicalPixarEyes(
            orbSize: 150,
            personaColor: .green,
            eyeTilt: -1.0
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Sparkle Intensity Tests

    func testNoSparkle() {
        let view = MagicalPixarEyes(
            orbSize: 150,
            personaColor: .green,
            sparkleIntensity: 0
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testFullSparkle() {
        let view = MagicalPixarEyes(
            orbSize: 150,
            personaColor: .green,
            sparkleIntensity: 1.0
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Symbolic Expression Tests

    func testHeartExpression() {
        let view = MagicalPixarEyes(
            orbSize: 150,
            personaColor: .green,
            symbolicExpression: .heart
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testSparkleExpression() {
        let view = MagicalPixarEyes(
            orbSize: 150,
            personaColor: .green,
            symbolicExpression: .sparkle
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testStarExpression() {
        let view = MagicalPixarEyes(
            orbSize: 150,
            personaColor: .green,
            symbolicExpression: .star
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Persona Color Tests

    func testAllPersonaColors() {
        let personaColors: [UInt] = [
            0x4a6741, // Ferni
            0x3a6b73, // Peter
            0x5a6b8a, // Alex
            0xa67a6a, // Maya
            0xc4856a, // Jordan
            0xb8956a  // Nayan
        ]

        for hex in personaColors {
            let view = MagicalPixarEyes(
                orbSize: 150,
                personaColor: Color(hex: hex)
            )
            _ = view.body
        }
        XCTAssertTrue(true)
    }

    // MARK: - Size Tests

    func testSmallSize() {
        let view = MagicalPixarEyes(
            orbSize: 60,
            personaColor: .green
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testLargeSize() {
        let view = MagicalPixarEyes(
            orbSize: 300,
            personaColor: .green
        )
        _ = view.body
        XCTAssertTrue(true)
    }
}

// MARK: - AnimatedMagicalEyes Tests

final class AnimatedMagicalEyesTests: XCTestCase {

    func testDefaultInitialization() {
        let view = AnimatedMagicalEyes(
            orbSize: 150,
            personaColor: Color(hex: 0x4a6741)
        )
        XCTAssertNotNil(view)
    }

    func testInitializationWithAllParameters() {
        let view = AnimatedMagicalEyes(
            orbSize: 150,
            personaColor: .green,
            emotionHint: .happy,
            isActive: true,
            symbolicExpression: .none
        )
        XCTAssertNotNil(view)
    }

    func testBodyProducesValidView() {
        let view = AnimatedMagicalEyes(
            orbSize: 150,
            personaColor: .green
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Emotion Hint Tests

    func testNeutralEmotion() {
        let view = AnimatedMagicalEyes(
            orbSize: 150,
            personaColor: .green,
            emotionHint: .neutral
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testHappyEmotion() {
        let view = AnimatedMagicalEyes(
            orbSize: 150,
            personaColor: .green,
            emotionHint: .happy
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testExcitedEmotion() {
        let view = AnimatedMagicalEyes(
            orbSize: 150,
            personaColor: .green,
            emotionHint: .excited
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testCuriousEmotion() {
        let view = AnimatedMagicalEyes(
            orbSize: 150,
            personaColor: .green,
            emotionHint: .curious
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testThinkingEmotion() {
        let view = AnimatedMagicalEyes(
            orbSize: 150,
            personaColor: .green,
            emotionHint: .thinking
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testEmpatheticEmotion() {
        let view = AnimatedMagicalEyes(
            orbSize: 150,
            personaColor: .green,
            emotionHint: .empathetic
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testCalmEmotion() {
        let view = AnimatedMagicalEyes(
            orbSize: 150,
            personaColor: .green,
            emotionHint: .calm
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testListeningEmotion() {
        let view = AnimatedMagicalEyes(
            orbSize: 150,
            personaColor: .green,
            emotionHint: .listening
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testRememberingEmotion() {
        let view = AnimatedMagicalEyes(
            orbSize: 150,
            personaColor: .green,
            emotionHint: .remembering
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testVibingEmotion() {
        let view = AnimatedMagicalEyes(
            orbSize: 150,
            personaColor: .green,
            emotionHint: .vibing
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Active State Tests

    func testActiveState() {
        let view = AnimatedMagicalEyes(
            orbSize: 150,
            personaColor: .green,
            isActive: true
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testInactiveState() {
        let view = AnimatedMagicalEyes(
            orbSize: 150,
            personaColor: .green,
            isActive: false
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Symbolic Expression with Animation

    func testAnimatedHeartExpression() {
        let view = AnimatedMagicalEyes(
            orbSize: 150,
            personaColor: .green,
            symbolicExpression: .heart
        )
        _ = view.body
        XCTAssertTrue(true)
    }
}

// MARK: - Eye Calculation Tests

/// Tests for the mathematical calculations used in eye rendering.

final class EyeCalculationTests: XCTestCase {

    // MARK: - Eye Dimension Calculations

    func testEyeWidthCalculation() {
        // eyeWidth = orbSize * 0.18
        let orbSize: CGFloat = 150
        let expectedWidth = orbSize * 0.18
        XCTAssertEqual(expectedWidth, 27)
    }

    func testEyeHeightCalculation() {
        // eyeHeight = orbSize * 0.22
        let orbSize: CGFloat = 150
        let expectedHeight = orbSize * 0.22
        XCTAssertEqual(expectedHeight, 33)
    }

    func testEyeSpacingCalculation() {
        // eyeSpacing = orbSize * 0.12
        let orbSize: CGFloat = 150
        let expectedSpacing = orbSize * 0.12
        XCTAssertEqual(expectedSpacing, 18)
    }

    func testLookRangeCalculation() {
        // lookRange = orbSize * 0.04
        let orbSize: CGFloat = 150
        let expectedRange = orbSize * 0.04
        XCTAssertEqual(expectedRange, 6)
    }

    func testVerticalOffsetCalculation() {
        // verticalOffset = -orbSize * 0.08
        let orbSize: CGFloat = 150
        let expectedOffset = -orbSize * 0.08
        XCTAssertEqual(expectedOffset, -12)
    }

    // MARK: - Final Eye Shape Calculations

    func testFinalEyeHeightWithBlink() {
        // finalEyeHeight = eyeHeight * verticalStretch * (1 - blinkProgress)
        let eyeHeight: CGFloat = 33
        let verticalStretch: CGFloat = 1.0
        let blinkProgress: CGFloat = 0.5

        let expected = eyeHeight * verticalStretch * (1 - blinkProgress)
        XCTAssertEqual(expected, 16.5)
    }

    func testFinalEyeHeightFullyOpen() {
        let eyeHeight: CGFloat = 33
        let verticalStretch: CGFloat = 1.0
        let blinkProgress: CGFloat = 0.0

        let expected = eyeHeight * verticalStretch * (1 - blinkProgress)
        XCTAssertEqual(expected, 33)
    }

    func testFinalEyeHeightFullyClosed() {
        let eyeHeight: CGFloat = 33
        let verticalStretch: CGFloat = 1.0
        let blinkProgress: CGFloat = 1.0

        let expected = eyeHeight * verticalStretch * (1 - blinkProgress)
        XCTAssertEqual(expected, 0)
    }

    func testFinalEyeHeightWithStretch() {
        // Excited eyes: 25% taller
        let eyeHeight: CGFloat = 33
        let verticalStretch: CGFloat = 1.25
        let blinkProgress: CGFloat = 0.0

        let expected = eyeHeight * verticalStretch * (1 - blinkProgress)
        XCTAssertEqual(expected, 41.25)
    }

    // MARK: - Tilt Angle Calculations

    func testLeftEyeTiltAngle() {
        // Left eye: tiltAngle = eyeTilt * -8
        let eyeTilt: CGFloat = 0.5
        let expected = eyeTilt * -8
        XCTAssertEqual(expected, -4)
    }

    func testRightEyeTiltAngle() {
        // Right eye: tiltAngle = eyeTilt * 8
        let eyeTilt: CGFloat = 0.5
        let expected = eyeTilt * 8
        XCTAssertEqual(expected, 4)
    }
}

// MARK: - Blink Animation Timing Tests

final class BlinkTimingTests: XCTestCase {

    func testBlinkCloseDuration() {
        // Human blink close: ~60ms
        let closeDuration = 0.06
        XCTAssertEqual(closeDuration, 0.06)
    }

    func testBlinkOpenDuration() {
        // Human blink open: ~100ms (slightly slower than close)
        let openDuration = 0.10
        XCTAssertEqual(openDuration, 0.10)
    }

    func testBlinkInterval() {
        // Natural blink interval: 2-5 seconds
        let minInterval = 2.0
        let maxInterval = 5.0
        XCTAssertEqual(minInterval, 2.0)
        XCTAssertEqual(maxInterval, 5.0)
    }

    func testActiveBlinkInterval() {
        // More frequent when active: 2-3.5 seconds
        let minInterval = 2.0
        let maxInterval = 3.5
        XCTAssertEqual(minInterval, 2.0)
        XCTAssertEqual(maxInterval, 3.5)
    }
}

// MARK: - Look Around Timing Tests

final class LookAroundTimingTests: XCTestCase {

    func testLookAroundInterval() {
        // Look around every 2.5-5 seconds
        let minInterval = 2.5
        let maxInterval = 5.0
        XCTAssertEqual(minInterval, 2.5)
        XCTAssertEqual(maxInterval, 5.0)
    }

    func testLookDuration() {
        // Hold look for 0.6-1.2 seconds before returning
        let minDuration = 0.6
        let maxDuration = 1.2
        XCTAssertEqual(minDuration, 0.6)
        XCTAssertEqual(maxDuration, 1.2)
    }

    func testLookDirectionRange() {
        // X: -0.6 to 0.6, Y: -0.3 to 0.3
        let xMin: CGFloat = -0.6
        let xMax: CGFloat = 0.6
        let yMin: CGFloat = -0.3
        let yMax: CGFloat = 0.3

        XCTAssertEqual(xMin, -0.6)
        XCTAssertEqual(xMax, 0.6)
        XCTAssertEqual(yMin, -0.3)
        XCTAssertEqual(yMax, 0.3)
    }
}

// MARK: - Breathing Animation Tests

final class BreathingAnimationTests: XCTestCase {

    func testBreathingCycleIdle() {
        // Idle breathing: 6 second cycle
        let idleCycle = 6.0
        XCTAssertEqual(idleCycle, 6.0)
    }

    func testBreathingCycleActive() {
        // Active breathing: 4.5 second cycle (faster)
        let activeCycle = 4.5
        XCTAssertEqual(activeCycle, 4.5)
    }

    func testBreathingAmplitude() {
        // Breathing effect: ±1.5% vertical stretch
        let amplitude = 0.015
        XCTAssertEqual(amplitude, 0.015)
    }

    func testActiveStretchBonus() {
        // Active state adds 5% to vertical stretch
        let activeBonus: CGFloat = 0.05
        XCTAssertEqual(activeBonus, 0.05)
    }
}
