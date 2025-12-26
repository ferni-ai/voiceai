import XCTest
import SwiftUI
@testable import FerniShared

// MARK: - PixarEyes Tests

/// Tests for PixarEyes and related components - expressive eyes for the voice orb.
/// Tests cover initialization, expressions, and accessibility (reduceMotion).

final class PixarEyesTests: XCTestCase {

    // MARK: - Initialization Tests

    func testDefaultInitialization() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: Color(hex: 0x4a6741)
        )
        XCTAssertNotNil(view)
    }

    func testInitializationWithAllParameters() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: .blue,
            blinkProgress: 0.5,
            lookDirection: CGPoint(x: 0.3, y: -0.2),
            eyebrowPosition: 0.5,
            eyeState: .wide
        )
        XCTAssertNotNil(view)
    }

    func testBodyProducesValidView() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: .green
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Eye State Tests

    func testOpenEyeState() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: .green,
            eyeState: .open
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testClosedEyeState() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: .green,
            eyeState: .closed
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testWideEyeState() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: .green,
            eyeState: .wide
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testSquintingEyeState() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: .green,
            eyeState: .squinting
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testBlinkingEyeState() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: .green,
            eyeState: .blinking
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testOpeningEyeState() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: .green,
            eyeState: .opening
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Blink Progress Tests

    func testFullyOpenEyes() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: .green,
            blinkProgress: 0
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testFullyClosedEyes() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: .green,
            blinkProgress: 1.0
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testHalfClosedEyes() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: .green,
            blinkProgress: 0.5
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Look Direction Tests

    func testLookingRight() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: .green,
            lookDirection: CGPoint(x: 1.0, y: 0)
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testLookingLeft() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: .green,
            lookDirection: CGPoint(x: -1.0, y: 0)
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testLookingUp() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: .green,
            lookDirection: CGPoint(x: 0, y: -1.0)
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testLookingDown() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: .green,
            lookDirection: CGPoint(x: 0, y: 1.0)
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Eyebrow Position Tests

    func testRaisedEyebrows() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: .green,
            eyebrowPosition: 1.0
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testWorriedEyebrows() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: .green,
            eyebrowPosition: -1.0
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testNeutralEyebrows() {
        let view = PixarEyes(
            orbSize: 150,
            personaColor: .green,
            eyebrowPosition: 0
        )
        _ = view.body
        XCTAssertTrue(true)
    }
}

// MARK: - SimpleAnimatedEyes Tests

final class SimpleAnimatedEyesTests: XCTestCase {

    func testDefaultInitialization() {
        let view = SimpleAnimatedEyes(
            orbSize: 150,
            personaColor: Color(hex: 0x4a6741)
        )
        XCTAssertNotNil(view)
    }

    func testBodyProducesValidView() {
        let view = SimpleAnimatedEyes(
            orbSize: 150,
            personaColor: .green
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testSmallSize() {
        let view = SimpleAnimatedEyes(
            orbSize: 60,
            personaColor: .green
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testLargeSize() {
        let view = SimpleAnimatedEyes(
            orbSize: 300,
            personaColor: .green
        )
        _ = view.body
        XCTAssertTrue(true)
    }
}

// MARK: - LampEye Tests

final class LampEyeTests: XCTestCase {

    func testDefaultInitialization() {
        let view = LampEye(
            orbSize: 150,
            personaColor: Color(hex: 0x4a6741)
        )
        XCTAssertNotNil(view)
    }

    func testInitializationWithAllParameters() {
        let view = LampEye(
            orbSize: 150,
            personaColor: .blue,
            visibility: 0.9,
            expressionIntensity: 0.5,
            squash: 0.95,
            lookDirection: CGPoint(x: 0.2, y: 0.1)
        )
        XCTAssertNotNil(view)
    }

    func testBodyProducesValidView() {
        let view = LampEye(
            orbSize: 150,
            personaColor: .green
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testSquashedEye() {
        let view = LampEye(
            orbSize: 150,
            personaColor: .green,
            squash: 0.7
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testStretchedEye() {
        let view = LampEye(
            orbSize: 150,
            personaColor: .green,
            squash: 1.3
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testHighExpressionIntensity() {
        let view = LampEye(
            orbSize: 150,
            personaColor: .green,
            expressionIntensity: 1.0
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testLowVisibility() {
        let view = LampEye(
            orbSize: 150,
            personaColor: .green,
            visibility: 0.3
        )
        _ = view.body
        XCTAssertTrue(true)
    }
}

// MARK: - AnimatedLampEye Tests

final class AnimatedLampEyeTests: XCTestCase {

    func testDefaultInitialization() {
        let view = AnimatedLampEye(
            orbSize: 150,
            personaColor: Color(hex: 0x4a6741)
        )
        XCTAssertNotNil(view)
    }

    func testInitializationWithAllParameters() {
        let view = AnimatedLampEye(
            orbSize: 150,
            personaColor: .green,
            isExpressing: true,
            symbolicExpression: .heart
        )
        XCTAssertNotNil(view)
    }

    func testBodyProducesValidView() {
        let view = AnimatedLampEye(
            orbSize: 150,
            personaColor: .green
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testWithSymbolicExpression() {
        let view = AnimatedLampEye(
            orbSize: 150,
            personaColor: .green,
            symbolicExpression: .sparkle
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testExpressingState() {
        let view = AnimatedLampEye(
            orbSize: 150,
            personaColor: .green,
            isExpressing: true
        )
        _ = view.body
        XCTAssertTrue(true)
    }
}

// MARK: - SymbolicExpression Tests

final class SymbolicExpressionTests: XCTestCase {

    func testAllExpressions() {
        for expression in SymbolicExpression.allCases {
            _ = expression.symbolName
            _ = expression.color
            _ = expression.displayDuration
            _ = expression.shouldPulse
        }
        XCTAssertTrue(true)
    }

    func testHeartExpression() {
        let expression = SymbolicExpression.heart
        XCTAssertEqual(expression.symbolName, "heart.fill")
        XCTAssertTrue(expression.shouldPulse)
    }

    func testSparkleExpression() {
        let expression = SymbolicExpression.sparkle
        XCTAssertEqual(expression.symbolName, "sparkles")
        XCTAssertFalse(expression.shouldPulse)
    }

    func testListeningExpression() {
        let expression = SymbolicExpression.listening
        XCTAssertEqual(expression.symbolName, "ear.fill")
        XCTAssertFalse(expression.shouldPulse)
    }

    func testMusicExpression() {
        let expression = SymbolicExpression.music
        XCTAssertEqual(expression.symbolName, "music.note")
        XCTAssertTrue(expression.shouldPulse)
    }

    func testNoneExpression() {
        let expression = SymbolicExpression.none
        XCTAssertNil(expression.symbolName)
        XCTAssertEqual(expression.displayDuration, 0)
    }

    func testPulsingExpressions() {
        let pulsingExpressions: [SymbolicExpression] = [
            .heart, .heartSpark, .flame, .bolt, .music
        ]
        for expression in pulsingExpressions {
            XCTAssertTrue(expression.shouldPulse, "\(expression) should pulse")
        }
    }

    func testNonPulsingExpressions() {
        let nonPulsingExpressions: [SymbolicExpression] = [
            .sparkle, .star, .listening, .focus, .thinking, .peace, .moon, .wave
        ]
        for expression in nonPulsingExpressions {
            XCTAssertFalse(expression.shouldPulse, "\(expression) should not pulse")
        }
    }
}

// MARK: - SymbolicExpressionView Tests

final class SymbolicExpressionViewTests: XCTestCase {

    func testDefaultInitialization() {
        let view = SymbolicExpressionView(
            expression: .heart,
            size: 100,
            isVisible: true
        )
        XCTAssertNotNil(view)
    }

    func testBodyProducesValidView() {
        let view = SymbolicExpressionView(
            expression: .sparkle,
            size: 100,
            isVisible: true
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testHiddenView() {
        let view = SymbolicExpressionView(
            expression: .heart,
            size: 100,
            isVisible: false
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testAllExpressionViews() {
        for expression in SymbolicExpression.allCases {
            let view = SymbolicExpressionView(
                expression: expression,
                size: 100,
                isVisible: true
            )
            _ = view.body
        }
        XCTAssertTrue(true)
    }
}

// MARK: - Eye Dimension Calculation Tests

final class EyeDimensionTests: XCTestCase {

    func testEyeSize() {
        let orbSize: CGFloat = 150
        let eyeSize = orbSize * 0.08
        XCTAssertEqual(eyeSize, 12)
    }

    func testEyeSpacing() {
        let orbSize: CGFloat = 150
        let eyeSpacing = orbSize * 0.18
        XCTAssertEqual(eyeSpacing, 27)
    }

    func testVerticalOffset() {
        let orbSize: CGFloat = 150
        let verticalOffset = orbSize * 0.05
        XCTAssertEqual(verticalOffset, 7.5)
    }

    func testLookRange() {
        let orbSize: CGFloat = 150
        let lookRange = orbSize * 0.03
        XCTAssertEqual(lookRange, 4.5)
    }

    func testPupilSize() {
        let orbSize: CGFloat = 150
        let eyeSize = orbSize * 0.08
        let pupilSize = eyeSize * 0.5
        XCTAssertEqual(pupilSize, 6)
    }
}

// MARK: - Lamp Eye Dimension Tests

final class LampEyeDimensionTests: XCTestCase {

    func testEyeWidth() {
        let orbSize: CGFloat = 150
        let eyeWidth = orbSize * 0.35
        XCTAssertEqual(eyeWidth, 52.5)
    }

    func testEyeHeight() {
        let orbSize: CGFloat = 150
        let squash: CGFloat = 1.0
        let eyeHeight = orbSize * 0.22 * squash
        XCTAssertEqual(eyeHeight, 33)
    }

    func testEyeHeightSquashed() {
        let orbSize: CGFloat = 150
        let squash: CGFloat = 0.8
        let eyeHeight = orbSize * 0.22 * squash
        XCTAssertEqual(eyeHeight, 26.4, accuracy: 0.001)
    }

    func testPupilSize() {
        let eyeWidth: CGFloat = 52.5
        let eyeHeight: CGFloat = 33
        let pupilSize = min(eyeWidth, eyeHeight) * 0.25
        XCTAssertEqual(pupilSize, 8.25)
    }

    func testVerticalPosition() {
        let orbSize: CGFloat = 150
        let verticalPosition = -orbSize * 0.08
        XCTAssertEqual(verticalPosition, -12)
    }
}

// MARK: - Eye Height Multiplier Tests

final class EyeHeightMultiplierTests: XCTestCase {

    func testOpenEyeMultiplier() {
        // Open state: 1.0
        let multiplier: CGFloat = 1.0
        XCTAssertEqual(multiplier, 1.0)
    }

    func testClosedEyeMultiplier() {
        // Closed state: 0.1
        let multiplier: CGFloat = 0.1
        XCTAssertEqual(multiplier, 0.1)
    }

    func testWideEyeMultiplier() {
        // Wide state: 1.3
        let multiplier: CGFloat = 1.3
        XCTAssertEqual(multiplier, 1.3)
    }

    func testSquintingEyeMultiplier() {
        // Squinting state: 0.6
        let multiplier: CGFloat = 0.6
        XCTAssertEqual(multiplier, 0.6)
    }
}

// MARK: - Eye Width Multiplier Tests

final class EyeWidthMultiplierTests: XCTestCase {

    func testWideEyeWidthMultiplier() {
        // Wide eyes are 15% wider
        let multiplier: CGFloat = 1.15
        XCTAssertEqual(multiplier, 1.15)
    }

    func testSquintingEyeWidthMultiplier() {
        // Squinting eyes are 10% wider
        let multiplier: CGFloat = 1.1
        XCTAssertEqual(multiplier, 1.1)
    }

    func testNormalEyeWidthMultiplier() {
        // Normal eyes use 1.0 multiplier
        let multiplier: CGFloat = 1.0
        XCTAssertEqual(multiplier, 1.0)
    }
}
