import XCTest
@testable import FerniShared

final class FerniSharedTests: XCTestCase {

    // MARK: - Persona Tests

    func testPersonaRegistry() {
        let ferni = PersonaRegistry.get("ferni")
        XCTAssertEqual(ferni.id, "ferni")
        XCTAssertEqual(ferni.name, "Ferni")
        XCTAssertEqual(ferni.initials, "FE")
    }

    func testAllPersonasExist() {
        let personaIds = ["ferni", "maya", "alex", "jordan", "peter", "nayan"]

        for id in personaIds {
            let persona = PersonaRegistry.get(id)
            XCTAssertEqual(persona.id, id, "Persona \(id) should exist")
            XCTAssertFalse(persona.name.isEmpty, "Persona \(id) should have a name")
            XCTAssertFalse(persona.initials.isEmpty, "Persona \(id) should have initials")
        }
    }

    func testUnknownPersonaReturnsFerni() {
        let unknown = PersonaRegistry.get("nonexistent")
        XCTAssertEqual(unknown.id, "ferni", "Unknown persona should default to Ferni")
    }

    // MARK: - Voice State Tests

    func testVoiceStateIsActive() {
        XCTAssertFalse(VoiceState.disconnected.isActive)
        XCTAssertTrue(VoiceState.connecting.isActive)
        XCTAssertTrue(VoiceState.connected.isActive)
        XCTAssertTrue(VoiceState.listening.isActive)
        XCTAssertTrue(VoiceState.speaking.isActive)
        XCTAssertTrue(VoiceState.thinking.isActive)
        XCTAssertFalse(VoiceState.error("test").isActive)
    }

    func testVoiceStateTitle() {
        XCTAssertEqual(VoiceState.disconnected.title, "Ready")
        XCTAssertEqual(VoiceState.connecting.title, "Connecting...")
        XCTAssertEqual(VoiceState.connected.title, "Connected")
        XCTAssertEqual(VoiceState.listening.title, "Listening")
        XCTAssertEqual(VoiceState.speaking.title, "Speaking")
        XCTAssertEqual(VoiceState.thinking.title, "Thinking")
        XCTAssertEqual(VoiceState.error("Network error").title, "Connection Issue")
    }

    func testVoiceStateShowWaveform() {
        XCTAssertFalse(VoiceState.disconnected.showWaveform)
        XCTAssertFalse(VoiceState.connecting.showWaveform)
        XCTAssertTrue(VoiceState.connected.showWaveform)
        XCTAssertTrue(VoiceState.listening.showWaveform)
        XCTAssertTrue(VoiceState.speaking.showWaveform)
        XCTAssertFalse(VoiceState.thinking.showWaveform)
    }

    // MARK: - Animation Timing Tests

    func testPixarTimingConstants() {
        // Ensure timing constants are reasonable
        XCTAssertGreaterThan(PixarTiming.breathCycleActive, 0)
        XCTAssertGreaterThan(PixarTiming.breathCycleIdle, PixarTiming.breathCycleActive)
        XCTAssertGreaterThan(PixarTiming.nodDuration, 0)
        XCTAssertLessThan(PixarTiming.microExpression, 0.2) // Should be subliminal
    }

    func testSquashStretchValues() {
        // Active should have more pronounced effects than idle
        XCTAssertGreaterThan(SquashStretch.active.scaleY, SquashStretch.idle.scaleY)
    }

    // MARK: - Emotion Hint Tests

    func testEmotionHintLampAnimations() {
        XCTAssertEqual(EmotionHint.neutral.lampAnimation, .none)
        XCTAssertEqual(EmotionHint.happy.lampAnimation, .bounce)
        XCTAssertEqual(EmotionHint.excited.lampAnimation, .multiBounce)
        XCTAssertEqual(EmotionHint.curious.lampAnimation, .tiltRight)
        XCTAssertEqual(EmotionHint.empathetic.lampAnimation, .nod)
    }

    func testEmotionHintSoulEffects() {
        XCTAssertEqual(EmotionHint.neutral.soulEffect, .none)
        XCTAssertEqual(EmotionHint.happy.soulEffect, .warmthBloom)
        XCTAssertEqual(EmotionHint.excited.soulEffect, .memorySpark)
        XCTAssertEqual(EmotionHint.empathetic.soulEffect, .warmthGlow)
    }

    func testEmotionHintEquality() {
        XCTAssertEqual(EmotionHint.happy, EmotionHint.happy)
        XCTAssertNotEqual(EmotionHint.happy, EmotionHint.calm)
    }

    // MARK: - Audio Level Sample Tests

    func testAudioLevelSampleClamping() {
        let lowSample = AudioLevelSample(level: -0.5)
        XCTAssertEqual(lowSample.level, 0, "Negative levels should clamp to 0")

        let highSample = AudioLevelSample(level: 1.5)
        XCTAssertEqual(highSample.level, 1, "Levels above 1 should clamp to 1")

        let normalSample = AudioLevelSample(level: 0.5)
        XCTAssertEqual(normalSample.level, 0.5, "Normal levels should pass through")
    }
}
