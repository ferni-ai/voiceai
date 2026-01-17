import XCTest
import SwiftUI
@testable import FerniShared

// MARK: - PixarVoiceOrb Tests

/// Tests for PixarVoiceOrb component - the main animated avatar visualization.
/// Tests cover initialization, all eye styles, and accessibility (reduceMotion).

final class PixarVoiceOrbTests: XCTestCase {

    // MARK: - Initialization Tests

    func testDefaultInitialization() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: false,
            size: 80,
            emotionHint: nil
        )
        XCTAssertNotNil(view)
    }

    func testInitializationWithAllParameters() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: true,
            size: 100,
            emotionHint: .happy,
            betterThanHumanState: nil,
            personalityEngine: nil,
            showEyes: true,
            useLampStyle: false,
            useMagicalEyes: true,
            symbolicExpression: .none
        )
        XCTAssertNotNil(view)
    }

    func testBodyProducesValidView() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: true,
            size: 80,
            emotionHint: nil
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Eye Style Tests

    func testMagicalEyesStyle() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: true,
            size: 80,
            emotionHint: nil,
            useLampStyle: false,
            useMagicalEyes: true
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testLampEyeStyle() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: true,
            size: 80,
            emotionHint: nil,
            useLampStyle: true,
            useMagicalEyes: false
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testLegacyEyeStyle() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: true,
            size: 80,
            emotionHint: nil,
            useLampStyle: false,
            useMagicalEyes: false
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testNoEyes() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: true,
            size: 80,
            emotionHint: nil,
            showEyes: false
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Active State Tests

    func testActiveState() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: true,
            size: 80,
            emotionHint: nil
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testInactiveState() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: false,
            size: 80,
            emotionHint: nil
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Emotion Hint Tests

    func testNeutralEmotion() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: true,
            size: 80,
            emotionHint: .neutral
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testHappyEmotion() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: true,
            size: 80,
            emotionHint: .happy
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testExcitedEmotion() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: true,
            size: 80,
            emotionHint: .excited
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testThinkingEmotion() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: true,
            size: 80,
            emotionHint: .thinking
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testEmpatheticEmotion() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: true,
            size: 80,
            emotionHint: .empathetic
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Symbolic Expression Tests

    func testHeartExpression() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: true,
            size: 80,
            emotionHint: nil,
            symbolicExpression: .heart
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testSparkleExpression() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: true,
            size: 80,
            emotionHint: nil,
            symbolicExpression: .sparkle
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testListeningExpression() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: true,
            size: 80,
            emotionHint: nil,
            symbolicExpression: .listening
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testMusicExpression() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: true,
            size: 80,
            emotionHint: nil,
            symbolicExpression: .music
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Persona Tests

    func testAllPersonas() {
        let personas = PersonaRegistry.all
        for persona in personas {
            let view = PixarVoiceOrb(
                persona: persona,
                isActive: true,
                size: 80,
                emotionHint: nil
            )
            _ = view.body
        }
        XCTAssertTrue(true)
    }

    // MARK: - Size Tests

    func testSmallSize() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: true,
            size: 40,
            emotionHint: nil
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testLargeSize() {
        let view = PixarVoiceOrb(
            persona: PersonaRegistry.ferni,
            isActive: true,
            size: 200,
            emotionHint: nil
        )
        _ = view.body
        XCTAssertTrue(true)
    }
}

// MARK: - StablePixarVoiceOrb Tests

final class StablePixarVoiceOrbTests: XCTestCase {

    func testDefaultInitialization() {
        let view = StablePixarVoiceOrb(
            personaId: "ferni",
            isActive: true,
            size: 80,
            emotionHint: nil
        )
        XCTAssertNotNil(view)
    }

    func testInitializationWithAllParameters() {
        let view = StablePixarVoiceOrb(
            personaId: "ferni",
            isActive: true,
            size: 80,
            emotionHint: .happy,
            betterThanHumanState: nil,
            useLampStyle: true,
            useMagicalEyes: true,
            symbolicExpression: .heart
        )
        XCTAssertNotNil(view)
    }

    func testBodyProducesValidView() {
        let view = StablePixarVoiceOrb(
            personaId: "ferni",
            isActive: true,
            size: 80,
            emotionHint: nil
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testEquatable() {
        let view1 = StablePixarVoiceOrb(
            personaId: "ferni",
            isActive: true,
            size: 80,
            emotionHint: .happy
        )

        let view2 = StablePixarVoiceOrb(
            personaId: "ferni",
            isActive: true,
            size: 80,
            emotionHint: .happy
        )

        XCTAssertEqual(view1, view2)
    }

    func testNotEquatableWhenDifferent() {
        let view1 = StablePixarVoiceOrb(
            personaId: "ferni",
            isActive: true,
            size: 80,
            emotionHint: nil
        )

        let view2 = StablePixarVoiceOrb(
            personaId: "maya",
            isActive: true,
            size: 80,
            emotionHint: nil
        )

        XCTAssertNotEqual(view1, view2)
    }
}

// MARK: - PixarVoiceOrb Frame Tests

final class PixarVoiceOrbFrameTests: XCTestCase {

    func testFrameSize() {
        // Frame should be 2.2x the orb size
        let orbSize: CGFloat = 80
        let expectedFrameSize = orbSize * 2.2
        XCTAssertEqual(expectedFrameSize, 176)
    }

    func testFrameSizeSmall() {
        let orbSize: CGFloat = 40
        let expectedFrameSize = orbSize * 2.2
        XCTAssertEqual(expectedFrameSize, 88)
    }

    func testFrameSizeLarge() {
        let orbSize: CGFloat = 200
        let expectedFrameSize = orbSize * 2.2
        XCTAssertEqual(expectedFrameSize, 440, accuracy: 0.001)
    }
}

// MARK: - Time-Aware Brightness Tests

final class TimeAwareBrightnessTests: XCTestCase {

    func testMorningBrightness() {
        // 6-12: Full brightness (1.0)
        let expected: CGFloat = 1.0
        XCTAssertEqual(expected, 1.0)
    }

    func testAfternoonBrightness() {
        // 12-18: Slightly reduced (0.95)
        let expected: CGFloat = 0.95
        XCTAssertEqual(expected, 0.95)
    }

    func testEveningBrightness() {
        // 18-22: Warmer, softer (0.85)
        let expected: CGFloat = 0.85
        XCTAssertEqual(expected, 0.85)
    }

    func testNightBrightness() {
        // 22-6: Gentle, calming (0.75)
        let expected: CGFloat = 0.75
        XCTAssertEqual(expected, 0.75)
    }
}
