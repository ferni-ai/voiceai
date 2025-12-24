import XCTest
import SwiftUI
@testable import FerniVoice

// MARK: - PixarTiming Tests

final class PixarTimingTests: XCTestCase {

    // MARK: - Breathing Cycles

    func testBreathCycleIdle() {
        XCTAssertEqual(PixarTiming.breathCycleIdle, 6.0)
    }

    func testBreathCycleActive() {
        XCTAssertEqual(PixarTiming.breathCycleActive, 5.0)
    }

    func testBreathCycleSpeaking() {
        XCTAssertEqual(PixarTiming.breathCycleSpeaking, 4.5)
    }

    func testBreathCycleOrdering() {
        // Speaking should be faster than active, which is faster than idle
        XCTAssertLessThan(PixarTiming.breathCycleSpeaking, PixarTiming.breathCycleActive)
        XCTAssertLessThan(PixarTiming.breathCycleActive, PixarTiming.breathCycleIdle)
    }

    // MARK: - Reaction Timings

    func testNodDuration() {
        XCTAssertEqual(PixarTiming.nodDuration, 0.28)
    }

    func testTiltDuration() {
        XCTAssertEqual(PixarTiming.tiltDuration, 0.4)
    }

    func testBounceDuration() {
        XCTAssertEqual(PixarTiming.bounceDuration, 0.6)
    }

    func testPerkUpDuration() {
        XCTAssertEqual(PixarTiming.perkUpDuration, 0.3)
    }

    func testReactionTimingsAreSubSecond() {
        XCTAssertLessThan(PixarTiming.nodDuration, 1.0)
        XCTAssertLessThan(PixarTiming.tiltDuration, 1.0)
        XCTAssertLessThan(PixarTiming.bounceDuration, 1.0)
        XCTAssertLessThan(PixarTiming.perkUpDuration, 1.0)
    }

    // MARK: - Subliminal Timings

    func testMicroExpressionIsSubliminal() {
        // 80ms is below conscious perception threshold (~100ms)
        XCTAssertEqual(PixarTiming.microExpression, 0.08)
        XCTAssertLessThan(PixarTiming.microExpression, 0.1)
    }

    func testMemorySparkDuration() {
        XCTAssertEqual(PixarTiming.memorySpark, 0.3)
    }

    func testWarmthBloomDuration() {
        XCTAssertEqual(PixarTiming.warmthBloom, 0.6)
    }

    // MARK: - Glow Timings

    func testShimmerCycle() {
        XCTAssertEqual(PixarTiming.shimmerCycle, 2.0)
    }

    func testGlowPulseCycleIsFibonacci() {
        // F10 = 610ms
        XCTAssertEqual(PixarTiming.glowPulseCycle, 0.61, accuracy: 0.01)
    }

    // MARK: - Halo Timings

    func testHaloOuterCycle() {
        XCTAssertEqual(PixarTiming.haloOuterCycle, 8.0)
    }

    func testHaloInnerCycle() {
        XCTAssertEqual(PixarTiming.haloInnerCycle, 5.0)
    }

    func testHaloPulseExpand() {
        XCTAssertEqual(PixarTiming.haloPulseExpand, 1.2)
    }

    func testHaloOuterIsSlowerThanInner() {
        XCTAssertGreaterThan(PixarTiming.haloOuterCycle, PixarTiming.haloInnerCycle)
    }
}

// MARK: - SquashStretch Tests

final class SquashStretchTests: XCTestCase {

    // MARK: - Idle Values

    func testIdleValues() {
        let idle = SquashStretch.idle
        XCTAssertEqual(idle.scaleY, 1.012)
        XCTAssertEqual(idle.scaleX, 0.994)
        XCTAssertEqual(idle.translateY, -1.5)
        XCTAssertEqual(idle.rotation, 0.3)
    }

    // MARK: - Active Values

    func testActiveValues() {
        let active = SquashStretch.active
        XCTAssertEqual(active.scaleY, 1.018)
        XCTAssertEqual(active.scaleX, 0.991)
        XCTAssertEqual(active.translateY, -2)
        XCTAssertEqual(active.rotation, 0.5)
    }

    // MARK: - Speaking Values

    func testSpeakingValues() {
        let speaking = SquashStretch.speaking
        XCTAssertEqual(speaking.scaleY, 1.025)
        XCTAssertEqual(speaking.scaleX, 0.988)
        XCTAssertEqual(speaking.translateY, -3)
        XCTAssertEqual(speaking.rotation, 0.8)
    }

    // MARK: - Thinking Values

    func testThinkingValues() {
        let thinking = SquashStretch.thinking
        XCTAssertEqual(thinking.scaleY, 1.015)
        XCTAssertEqual(thinking.scaleX, 0.993)
        XCTAssertEqual(thinking.translateY, -1.8)
        XCTAssertEqual(thinking.rotation, -0.4) // Negative = tilted other way
    }

    // MARK: - Value Relationships

    func testScaleYIncreasesWithIntensity() {
        // More intense states have higher scaleY (more stretch)
        XCTAssertLessThan(SquashStretch.idle.scaleY, SquashStretch.active.scaleY)
        XCTAssertLessThan(SquashStretch.active.scaleY, SquashStretch.speaking.scaleY)
    }

    func testScaleXDecreasesWithIntensity() {
        // More intense states have lower scaleX (more squash)
        XCTAssertGreaterThan(SquashStretch.idle.scaleX, SquashStretch.active.scaleX)
        XCTAssertGreaterThan(SquashStretch.active.scaleX, SquashStretch.speaking.scaleX)
    }

    func testTranslateYIncreasesWithIntensity() {
        // More intense states have more negative translateY (lifted higher)
        XCTAssertLessThan(SquashStretch.speaking.translateY, SquashStretch.active.translateY)
        XCTAssertLessThan(SquashStretch.active.translateY, SquashStretch.idle.translateY)
    }

    func testVolumePreservation() {
        // Squash and stretch should roughly preserve volume (scaleX * scaleY ≈ 1)
        for values in [SquashStretch.idle, SquashStretch.active, SquashStretch.speaking, SquashStretch.thinking] {
            let volume = values.scaleX * values.scaleY
            XCTAssertEqual(volume, 1.0, accuracy: 0.02, "Volume should be roughly preserved")
        }
    }
}

// MARK: - EmotionHint Tests

final class EmotionHintTests: XCTestCase {

    func testAllEmotionHintsExist() {
        let hints: [EmotionHint] = [.neutral, .happy, .excited, .curious, .thinking, .empathetic, .encouraging, .calm]
        XCTAssertEqual(hints.count, 8)
    }

    func testEmotionHintRawValues() {
        XCTAssertEqual(EmotionHint.neutral.rawValue, "neutral")
        XCTAssertEqual(EmotionHint.happy.rawValue, "happy")
        XCTAssertEqual(EmotionHint.excited.rawValue, "excited")
        XCTAssertEqual(EmotionHint.curious.rawValue, "curious")
        XCTAssertEqual(EmotionHint.thinking.rawValue, "thinking")
        XCTAssertEqual(EmotionHint.empathetic.rawValue, "empathetic")
        XCTAssertEqual(EmotionHint.encouraging.rawValue, "encouraging")
        XCTAssertEqual(EmotionHint.calm.rawValue, "calm")
    }

    func testEmotionHintEquatable() {
        XCTAssertEqual(EmotionHint.happy, EmotionHint.happy)
        XCTAssertNotEqual(EmotionHint.happy, EmotionHint.calm)
    }

    // MARK: - Lamp Animation Mapping

    func testNeutralLampAnimation() {
        XCTAssertEqual(EmotionHint.neutral.lampAnimation, .none)
    }

    func testHappyLampAnimation() {
        XCTAssertEqual(EmotionHint.happy.lampAnimation, .bounce)
    }

    func testExcitedLampAnimation() {
        XCTAssertEqual(EmotionHint.excited.lampAnimation, .multiBounce)
    }

    func testCuriousLampAnimation() {
        XCTAssertEqual(EmotionHint.curious.lampAnimation, .tiltRight)
    }

    func testThinkingLampAnimation() {
        XCTAssertEqual(EmotionHint.thinking.lampAnimation, .tiltLeft)
    }

    func testEmpatheticLampAnimation() {
        XCTAssertEqual(EmotionHint.empathetic.lampAnimation, .nod)
    }

    func testEncouragingLampAnimation() {
        XCTAssertEqual(EmotionHint.encouraging.lampAnimation, .perkUp)
    }

    func testCalmLampAnimation() {
        XCTAssertEqual(EmotionHint.calm.lampAnimation, .none)
    }

    // MARK: - Soul Effect Mapping

    func testNeutralSoulEffect() {
        XCTAssertEqual(EmotionHint.neutral.soulEffect, .none)
    }

    func testHappySoulEffect() {
        XCTAssertEqual(EmotionHint.happy.soulEffect, .warmthBloom)
    }

    func testExcitedSoulEffect() {
        XCTAssertEqual(EmotionHint.excited.soulEffect, .memorySpark)
    }

    func testCuriousSoulEffect() {
        XCTAssertEqual(EmotionHint.curious.soulEffect, .shimmerIntensify)
    }

    func testThinkingSoulEffect() {
        XCTAssertEqual(EmotionHint.thinking.soulEffect, .none)
    }

    func testEmpatheticSoulEffect() {
        XCTAssertEqual(EmotionHint.empathetic.soulEffect, .warmthGlow)
    }

    func testEncouragingSoulEffect() {
        XCTAssertEqual(EmotionHint.encouraging.soulEffect, .warmthBloom)
    }

    func testCalmSoulEffect() {
        XCTAssertEqual(EmotionHint.calm.soulEffect, .none)
    }
}

// MARK: - LampAnimation Tests

final class LampAnimationTests: XCTestCase {

    func testAllLampAnimationsExist() {
        let animations: [LampAnimation] = [.none, .nod, .tiltRight, .tiltLeft, .bounce, .multiBounce, .perkUp, .shake]
        XCTAssertEqual(animations.count, 8)
    }

    func testLampAnimationEquatable() {
        XCTAssertEqual(LampAnimation.bounce, LampAnimation.bounce)
        XCTAssertNotEqual(LampAnimation.bounce, LampAnimation.nod)
    }
}

// MARK: - SoulEffect Tests

final class SoulEffectTests: XCTestCase {

    func testAllSoulEffectsExist() {
        let effects: [SoulEffect] = [.none, .warmthBloom, .warmthGlow, .memorySpark, .shimmerIntensify]
        XCTAssertEqual(effects.count, 5)
    }

    func testSoulEffectEquatable() {
        XCTAssertEqual(SoulEffect.warmthBloom, SoulEffect.warmthBloom)
        XCTAssertNotEqual(SoulEffect.warmthBloom, SoulEffect.warmthGlow)
    }
}

// MARK: - PixarAnimationState Tests

@MainActor
final class PixarAnimationStateTests: XCTestCase {

    var state: PixarAnimationState!

    override func setUp() {
        super.setUp()
        state = PixarAnimationState()
    }

    override func tearDown() {
        state = nil
        super.tearDown()
    }

    // MARK: - Initial Values

    func testInitialTransformValues() {
        XCTAssertEqual(state.scaleX, 1.0)
        XCTAssertEqual(state.scaleY, 1.0)
        XCTAssertEqual(state.offsetX, 0)
        XCTAssertEqual(state.offsetY, 0)
        XCTAssertEqual(state.rotation, 0)
    }

    func testInitialGlowValues() {
        XCTAssertEqual(state.glowIntensity, 0.6)
        XCTAssertEqual(state.glowScale, 1.0)
        XCTAssertEqual(state.shimmerPhase, 0)
        XCTAssertEqual(state.warmthOpacity, 0)
    }

    func testInitialHaloValues() {
        XCTAssertEqual(state.haloOpacity, 0.6)
        XCTAssertEqual(state.haloPulseScale, 1.0)
        XCTAssertEqual(state.haloPulseOpacity, 0)
    }

    func testInitialBreathPhase() {
        XCTAssertEqual(state.breathPhase, 0)
    }

    func testInitialIsActive() {
        XCTAssertFalse(state.isActive)
    }

    // MARK: - Property Updates

    func testScaleXCanBeUpdated() {
        state.scaleX = 1.5
        XCTAssertEqual(state.scaleX, 1.5)
    }

    func testScaleYCanBeUpdated() {
        state.scaleY = 0.8
        XCTAssertEqual(state.scaleY, 0.8)
    }

    func testOffsetCanBeUpdated() {
        state.offsetX = 10
        state.offsetY = -5
        XCTAssertEqual(state.offsetX, 10)
        XCTAssertEqual(state.offsetY, -5)
    }

    func testRotationCanBeUpdated() {
        state.rotation = 15
        XCTAssertEqual(state.rotation, 15)
    }

    func testGlowIntensityCanBeUpdated() {
        state.glowIntensity = 0.9
        XCTAssertEqual(state.glowIntensity, 0.9)
    }

    func testIsActiveCanBeToggled() {
        state.isActive = true
        XCTAssertTrue(state.isActive)

        state.isActive = false
        XCTAssertFalse(state.isActive)
    }

    // MARK: - Apply Breathing

    func testApplyBreathingAtZeroPhase() {
        state.applyBreathing(0, intensity: SquashStretch.idle)

        // At phase 0, sin(0) = 0, so no deviation from 1.0
        XCTAssertEqual(state.scaleY, 1.0, accuracy: 0.001)
        XCTAssertEqual(state.scaleX, 1.0, accuracy: 0.001)
        XCTAssertEqual(state.offsetY, 0, accuracy: 0.001)
        XCTAssertEqual(state.rotation, 0, accuracy: 0.001)
    }

    func testApplyBreathingAtQuarterPhase() {
        state.applyBreathing(0.25, intensity: SquashStretch.idle)

        // At phase 0.25, sin(π/2) = 1, so maximum deviation
        XCTAssertEqual(state.scaleY, SquashStretch.idle.scaleY, accuracy: 0.001)
        XCTAssertEqual(state.scaleX, SquashStretch.idle.scaleX, accuracy: 0.001)
        XCTAssertEqual(state.offsetY, SquashStretch.idle.translateY, accuracy: 0.001)
        XCTAssertEqual(state.rotation, SquashStretch.idle.rotation, accuracy: 0.001)
    }

    func testApplyBreathingAtHalfPhase() {
        state.applyBreathing(0.5, intensity: SquashStretch.idle)

        // At phase 0.5, sin(π) = 0, so back to neutral
        XCTAssertEqual(state.scaleY, 1.0, accuracy: 0.001)
        XCTAssertEqual(state.scaleX, 1.0, accuracy: 0.001)
        XCTAssertEqual(state.offsetY, 0, accuracy: 0.001)
        XCTAssertEqual(state.rotation, 0, accuracy: 0.001)
    }

    func testApplyBreathingWithDifferentIntensities() {
        // At peak phase (0.25), different intensities should give different results
        state.applyBreathing(0.25, intensity: SquashStretch.idle)
        let idleScaleY = state.scaleY

        state.applyBreathing(0.25, intensity: SquashStretch.speaking)
        let speakingScaleY = state.scaleY

        XCTAssertLessThan(idleScaleY, speakingScaleY, "Speaking should have more stretch than idle")
    }
}

// MARK: - VoiceEvent Tests

final class VoiceEventTests: XCTestCase {

    func testStateChangedEvent() {
        let event = VoiceEvent.stateChanged(.connected)
        if case .stateChanged(let state) = event {
            XCTAssertEqual(state, .connected)
        } else {
            XCTFail("Expected stateChanged event")
        }
    }

    func testTranscriptionEvent() {
        let event = VoiceEvent.transcription(text: "Hello", isAgent: true, isFinal: false)
        if case .transcription(let text, let isAgent, let isFinal) = event {
            XCTAssertEqual(text, "Hello")
            XCTAssertTrue(isAgent)
            XCTAssertFalse(isFinal)
        } else {
            XCTFail("Expected transcription event")
        }
    }

    func testHandoffEvent() {
        let event = VoiceEvent.handoff(from: "ferni", to: "maya")
        if case .handoff(let from, let to) = event {
            XCTAssertEqual(from, "ferni")
            XCTAssertEqual(to, "maya")
        } else {
            XCTFail("Expected handoff event")
        }
    }

    func testAudioLevelEvent() {
        let event = VoiceEvent.audioLevel(0.75)
        if case .audioLevel(let level) = event {
            XCTAssertEqual(level, 0.75)
        } else {
            XCTFail("Expected audioLevel event")
        }
    }

    func testErrorEvent() {
        struct TestError: Error {}
        let event = VoiceEvent.error(TestError())
        if case .error(_) = event {
            XCTAssertTrue(true)
        } else {
            XCTFail("Expected error event")
        }
    }
}
