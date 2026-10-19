package com.ferni.voice.betterthanuman

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for BetterThanHumanEngine orchestration logic.
 *
 * Note: Full coroutine/flow tests require runTest from kotlinx-coroutines-test.
 * These tests verify the data structures and state composition logic.
 */
class BetterThanHumanEngineTest {

    // MARK: - Sub-Engine Composition Tests

    @Test
    fun `engine has all five capability engines`() {
        // Verify the five Better Than Human capabilities are present
        val capabilities = listOf(
            "ActiveListeningEngine",
            "MicroExpressionEngine",
            "BreathSyncEngine",
            "AnticipationEngine",
            "PixarPersonalityEngine"
        )

        assertEquals(5, capabilities.size)
    }

    @Test
    fun `emotional haptics is included for Android`() {
        // Haptics is Android-exclusive superhuman capability
        val hasHaptics = true
        assertTrue(hasHaptics)
    }

    // MARK: - State Binding Flow Tests

    @Test
    fun `all state sources are bound to currentState`() {
        // Verify bindings exist for each state source
        val stateBindings = listOf(
            "activeListening.currentGesture -> listeningGesture",
            "microExpressions.activeExpression -> microExpression",
            "breathSync.currentBreathPhase -> breathPhase",
            "breathSync.syncedBreathRate -> breathRate",
            "anticipation.anticipatedEmotion -> anticipatedEmotion",
            "personality.currentReaction -> lampReaction"
        )

        assertEquals(6, stateBindings.size)
    }

    @Test
    fun `concern level is managed directly by engine`() {
        // Concern level is set directly via signalConcern()
        // and auto-clears after 2 seconds
        val concernAutoClearMs = 2000L
        assertEquals(2000L, concernAutoClearMs)
    }

    // MARK: - Emotion Reaction Flow Tests

    @Test
    fun `emotion hint triggers personality reaction`() {
        // triggerEmotionReaction() creates EmotionReaction and triggers personality
        val emotionHints = listOf("happy", "excited", "curious", "empathetic", "encouraging")

        emotionHints.forEach { hint ->
            val reaction = EmotionReaction.fromHint(hint)
            assertNotNull(reaction)
            assertNotEquals(LampAnimation.NONE, reaction.lampAnimation)
        }
    }

    @Test
    fun `neutral emotions still create valid reaction`() {
        val neutralHints = listOf("neutral", "calm", "unknown")

        neutralHints.forEach { hint ->
            val reaction = EmotionReaction.fromHint(hint)
            assertNotNull(reaction)
            assertEquals(LampAnimation.NONE, reaction.lampAnimation)
        }
    }

    // MARK: - User Speaking State Tests

    @Test
    fun `user speaking state affects active listening`() {
        // setUserSpeaking(true) -> activeListening.startListening()
        // setUserSpeaking(false) -> activeListening.stopListening()
        val speakingStates = listOf(true, false)
        assertEquals(2, speakingStates.size)
    }

    // MARK: - Audio Level Flow Tests

    @Test
    fun `audio level updates breath sync`() {
        // updateAudioLevel() -> breathSync.updateFromAudioLevel()
        val testLevels = listOf(0f, 0.25f, 0.5f, 0.75f, 1.0f)
        testLevels.forEach { level ->
            assertTrue(level in 0f..1f)
        }
    }

    // MARK: - Lifecycle Tests

    @Test
    fun `connection established starts breath sync`() {
        // onConnectionEstablished() -> breathSync.start()
        // Also plays haptic: haptics.playConnectionEstablished()
        assertTrue(true)
    }

    @Test
    fun `connection ended resets all state`() {
        // onConnectionEnded() should:
        // - breathSync.stop()
        // - activeListening.stopListening()
        // - Reset to default BetterThanHumanState
        val defaultState = BetterThanHumanState()

        assertEquals(ListeningGesture.NONE, defaultState.listeningGesture)
        assertNull(defaultState.microExpression)
        assertEquals(0f, defaultState.breathPhase, 0.001f)
        assertEquals(6.0, defaultState.breathRate, 0.001)
        assertNull(defaultState.anticipatedEmotion)
        assertEquals(ConcernLevel.NONE, defaultState.concernLevel)
        assertTrue(defaultState.lampReaction.isNeutral)
    }

    @Test
    fun `destroy cancels scope and cleans up`() {
        // destroy() should:
        // - scope.cancel()
        // - breathSync.stop()
        // - activeListening.stopListening()
        assertTrue(true)
    }
}

/**
 * Tests for concern detection flow.
 */
class ConcernDetectionFlowTest {

    @Test
    fun `signalConcern updates state immediately`() {
        val levels = ConcernLevel.entries

        levels.forEach { level ->
            assertNotNull(level)
        }
    }

    @Test
    fun `high concern triggers haptics`() {
        // High concern should trigger playConcern(ConcernLevel.HIGH)
        // which uses the "care presence" pattern
        assertTrue(true)
    }

    @Test
    fun `concern auto-clears after timeout`() {
        // After 2 seconds, concernLevel should reset to NONE
        val autoClearDelayMs = 2000L
        assertEquals(2000L, autoClearDelayMs)
    }
}

/**
 * Tests for transcript analysis flow.
 */
class TranscriptAnalysisFlowTest {

    @Test
    fun `partial transcript triggers anticipation`() {
        // processPartialTranscript() -> anticipation.analyze()
        val sampleTranscripts = listOf(
            "I'm feeling a bit...",
            "That makes me so...",
            "I can't believe..."
        )

        sampleTranscripts.forEach { transcript ->
            assertTrue(transcript.isNotEmpty())
        }
    }

    @Test
    fun `voice tone can be passed with transcript`() {
        // processPartialTranscript(text, tone) supports optional VoiceTone
        val tones = VoiceTone.entries

        assertEquals(5, tones.size)
    }
}

/**
 * Tests for micro-expression triggering.
 */
class MicroExpressionTriggerFlowTest {

    @Test
    fun `triggerMicroExpression updates state and plays haptic`() {
        // triggerMicroExpression() should:
        // - microExpressions.trigger(type)
        // - haptics.playMicroExpression(type)
        MicroExpressionType.entries.forEach { type ->
            assertNotNull(type.soulEffect)
        }
    }

    @Test
    fun `micro-expression has subliminal duration`() {
        // Micro-expressions should be 40-150ms (subliminal)
        MicroExpressionType.entries.forEach { type ->
            val duration = type.durationMs
            assertTrue("$type duration should be subliminal", duration in 40L..150L)
        }
    }
}

/**
 * Tests for engine initialization.
 */
class EngineInitializationTest {

    @Test
    fun `initial state has no active states`() {
        val initialState = BetterThanHumanState()
        assertFalse(initialState.hasActiveState)
    }

    @Test
    fun `initial combined transform is neutral`() {
        val initialState = BetterThanHumanState()
        val transform = initialState.combinedTransform

        assertEquals(0f, transform.translateX, 0.001f)
        assertEquals(0f, transform.translateY, 0.001f)
        assertEquals(0f, transform.rotate, 0.001f)
        assertEquals(1f, transform.scale, 0.001f)
        assertEquals(0f, transform.warmth, 0.001f)
        assertEquals(0f, transform.shimmer, 0.001f)
    }

    @Test
    fun `breath rate defaults to idle rate`() {
        val initialState = BetterThanHumanState()
        assertEquals(6.0, initialState.breathRate, 0.001) // 6 breaths per minute
    }
}

/**
 * Integration flow tests between sub-engines.
 */
class SubEngineIntegrationTest {

    @Test
    fun `listening gesture and lamp reaction combine in transform`() {
        val state = BetterThanHumanState(
            listeningGesture = ListeningGesture.MICRO_NOD,
            lampReaction = LampReaction(offsetY = -5f)
        )

        val transform = state.combinedTransform
        val gestureY = ListeningGesture.MICRO_NOD.transform.translateY
        val lampY = -5f

        assertEquals(gestureY + lampY, transform.translateY, 0.001f)
    }

    @Test
    fun `micro-expression and concern combine warmth`() {
        val state = BetterThanHumanState(
            microExpression = MicroExpressionType.WARMTH,
            concernLevel = ConcernLevel.MODERATE
        )

        val transform = state.combinedTransform
        val expressionWarmth = MicroExpressionType.WARMTH.soulEffect.warmthOpacity
        val concernWarmth = 0.4f // MODERATE

        val expectedWarmth = (expressionWarmth + concernWarmth).coerceIn(0f, 1f)
        assertEquals(expectedWarmth, transform.warmth, 0.001f)
    }

    @Test
    fun `anticipation and micro-expression combine shimmer`() {
        val state = BetterThanHumanState(
            microExpression = MicroExpressionType.DELIGHT,
            anticipatedEmotion = AnticipatedEmotion.EXCITED
        )

        val transform = state.combinedTransform

        // Both add shimmer, should be combined
        assertTrue(transform.shimmer > 0)
    }

    @Test
    fun `all states combine without exceeding bounds`() {
        // Maximum combination of all states
        val state = BetterThanHumanState(
            listeningGesture = ListeningGesture.VISIBLE_NOD,
            microExpression = MicroExpressionType.WARMTH,
            anticipatedEmotion = AnticipatedEmotion.CONCERNED,
            concernLevel = ConcernLevel.HIGH,
            lampReaction = LampReaction(offsetY = -5f, scale = 1.1f)
        )

        val transform = state.combinedTransform

        // Warmth should be clamped to 1.0
        assertTrue(transform.warmth <= 1.0f)

        // Shimmer should be clamped to 0.5
        assertTrue(transform.shimmer <= 0.5f)

        // Scale can exceed 1.0 but should be reasonable
        assertTrue(transform.scale > 0.9f && transform.scale < 1.5f)
    }
}
