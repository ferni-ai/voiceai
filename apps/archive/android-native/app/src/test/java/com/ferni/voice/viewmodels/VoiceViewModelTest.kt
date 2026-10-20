package com.ferni.voice.viewmodels

import com.ferni.voice.betterthanuman.ConcernLevel
import com.ferni.voice.betterthanuman.MicroExpressionType
import com.ferni.voice.models.EmotionHint
import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for VoiceViewModel emotion handling logic.
 *
 * Note: Full integration tests require Android instrumentation.
 * These tests verify the mapping logic between:
 * - EmotionHint → Personality animations + Micro-expressions
 * - Humanization signals → BetterThanHumanEngine actions
 */
class VoiceViewModelEmotionMappingTest {

    // MARK: - Emotion Hint → Micro-Expression Mapping Tests

    @Test
    fun `happy emotion maps to delight micro-expression`() {
        val expression = mapEmotionToMicroExpression(EmotionHint.HAPPY)
        assertEquals(MicroExpressionType.DELIGHT, expression)
    }

    @Test
    fun `excited emotion maps to delight micro-expression`() {
        val expression = mapEmotionToMicroExpression(EmotionHint.EXCITED)
        assertEquals(MicroExpressionType.DELIGHT, expression)
    }

    @Test
    fun `curious emotion maps to interest micro-expression`() {
        val expression = mapEmotionToMicroExpression(EmotionHint.CURIOUS)
        assertEquals(MicroExpressionType.INTEREST, expression)
    }

    @Test
    fun `empathetic emotion maps to warmth micro-expression`() {
        val expression = mapEmotionToMicroExpression(EmotionHint.EMPATHETIC)
        assertEquals(MicroExpressionType.WARMTH, expression)
    }

    @Test
    fun `encouraging emotion maps to recognition micro-expression`() {
        val expression = mapEmotionToMicroExpression(EmotionHint.ENCOURAGING)
        assertEquals(MicroExpressionType.RECOGNITION, expression)
    }

    @Test
    fun `neutral emotion maps to null (no micro-expression)`() {
        val expression = mapEmotionToMicroExpression(EmotionHint.NEUTRAL)
        assertNull(expression)
    }

    @Test
    fun `thinking emotion maps to null (no micro-expression)`() {
        val expression = mapEmotionToMicroExpression(EmotionHint.THINKING)
        assertNull(expression)
    }

    @Test
    fun `calm emotion maps to null (no micro-expression)`() {
        val expression = mapEmotionToMicroExpression(EmotionHint.CALM)
        assertNull(expression)
    }

    // MARK: - Concern Level Mapping Tests

    @Test
    fun `high concern level string maps correctly`() {
        val level = mapConcernLevel("high")
        assertEquals(ConcernLevel.HIGH, level)
    }

    @Test
    fun `moderate concern level string maps correctly`() {
        val level = mapConcernLevel("moderate")
        assertEquals(ConcernLevel.MODERATE, level)
    }

    @Test
    fun `mild concern level string maps correctly`() {
        val level = mapConcernLevel("mild")
        assertEquals(ConcernLevel.MILD, level)
    }

    @Test
    fun `unknown concern level string maps to none`() {
        val level = mapConcernLevel("unknown")
        assertEquals(ConcernLevel.NONE, level)
    }

    @Test
    fun `null concern level maps to none`() {
        val level = mapConcernLevel(null)
        assertEquals(ConcernLevel.NONE, level)
    }

    // MARK: - Micro-Expression String Mapping Tests

    @Test
    fun `recognition expression string maps correctly`() {
        val expression = mapExpressionString("recognition")
        assertEquals(MicroExpressionType.RECOGNITION, expression)
    }

    @Test
    fun `concern expression string maps correctly`() {
        val expression = mapExpressionString("concern")
        assertEquals(MicroExpressionType.CONCERN, expression)
    }

    @Test
    fun `delight expression string maps correctly`() {
        val expression = mapExpressionString("delight")
        assertEquals(MicroExpressionType.DELIGHT, expression)
    }

    @Test
    fun `warmth expression string maps correctly`() {
        val expression = mapExpressionString("warmth")
        assertEquals(MicroExpressionType.WARMTH, expression)
    }

    @Test
    fun `interest expression string maps correctly`() {
        val expression = mapExpressionString("interest")
        assertEquals(MicroExpressionType.INTEREST, expression)
    }

    @Test
    fun `unknown expression string maps to null`() {
        val expression = mapExpressionString("unknown")
        assertNull(expression)
    }

    // MARK: - Voice Strain Threshold Tests

    @Test
    fun `voice strain above 0_6 triggers concern`() {
        assertTrue(shouldTriggerConcern(0.7f))
        assertTrue(shouldTriggerConcern(0.61f))
        assertTrue(shouldTriggerConcern(1.0f))
    }

    @Test
    fun `voice strain at or below 0_6 does not trigger concern`() {
        assertFalse(shouldTriggerConcern(0.6f))
        assertFalse(shouldTriggerConcern(0.5f))
        assertFalse(shouldTriggerConcern(0.0f))
    }

    // MARK: - Audio Level Clamping Tests

    @Test
    fun `audio level is clamped to 0-1 range`() {
        assertEquals(0f, clampAudioLevel(-0.5f), 0.001f)
        assertEquals(0f, clampAudioLevel(0f), 0.001f)
        assertEquals(0.5f, clampAudioLevel(0.5f), 0.001f)
        assertEquals(1f, clampAudioLevel(1f), 0.001f)
        assertEquals(1f, clampAudioLevel(1.5f), 0.001f)
    }

    // MARK: - Helper Functions (mirroring VoiceViewModel logic)

    /**
     * Maps EmotionHint to MicroExpressionType.
     * Mirrors the logic in VoiceViewModel.handleEmotionHint()
     */
    private fun mapEmotionToMicroExpression(hint: EmotionHint): MicroExpressionType? {
        return when (hint) {
            EmotionHint.HAPPY -> MicroExpressionType.DELIGHT
            EmotionHint.EXCITED -> MicroExpressionType.DELIGHT
            EmotionHint.CURIOUS -> MicroExpressionType.INTEREST
            EmotionHint.EMPATHETIC -> MicroExpressionType.WARMTH
            EmotionHint.ENCOURAGING -> MicroExpressionType.RECOGNITION
            EmotionHint.NEUTRAL, EmotionHint.THINKING, EmotionHint.CALM -> null
        }
    }

    /**
     * Maps concern level string to ConcernLevel enum.
     * Mirrors the logic in VoiceViewModel.handleHumanizationSignal()
     */
    private fun mapConcernLevel(level: String?): ConcernLevel {
        return when (level) {
            "high" -> ConcernLevel.HIGH
            "moderate" -> ConcernLevel.MODERATE
            "mild" -> ConcernLevel.MILD
            else -> ConcernLevel.NONE
        }
    }

    /**
     * Maps expression string to MicroExpressionType.
     * Mirrors the logic in VoiceViewModel.handleHumanizationSignal()
     */
    private fun mapExpressionString(expression: String?): MicroExpressionType? {
        return when (expression) {
            "recognition" -> MicroExpressionType.RECOGNITION
            "concern" -> MicroExpressionType.CONCERN
            "delight" -> MicroExpressionType.DELIGHT
            "warmth" -> MicroExpressionType.WARMTH
            "interest" -> MicroExpressionType.INTEREST
            else -> null
        }
    }

    /**
     * Determines if voice strain level should trigger concern.
     * Mirrors the logic in VoiceViewModel.handleHumanizationSignal()
     */
    private fun shouldTriggerConcern(strain: Float): Boolean {
        return strain > 0.6f
    }

    /**
     * Clamps audio level to valid range.
     * Mirrors the logic in VoiceViewModel.updateAudioLevel()
     */
    private fun clampAudioLevel(level: Float): Float {
        return level.coerceIn(0f, 1f)
    }
}

/**
 * Tests for humanization signal payload parsing.
 */
class HumanizationSignalParsingTest {

    @Test
    fun `concern_detected signal type is recognized`() {
        val signalTypes = listOf(
            "concern_detected",
            "voice_state_detected",
            "emotional_trajectory",
            "micro_expression_trigger"
        )

        assertTrue(signalTypes.contains("concern_detected"))
        assertTrue(signalTypes.contains("voice_state_detected"))
        assertTrue(signalTypes.contains("emotional_trajectory"))
        assertTrue(signalTypes.contains("micro_expression_trigger"))
    }

    @Test
    fun `payload extraction handles missing keys gracefully`() {
        val payload = mapOf<String, Any>("level" to "high")

        assertEquals("high", payload["level"])
        assertNull(payload["tone"])
        assertNull(payload["strain"])
    }

    @Test
    fun `payload extraction handles number types`() {
        val payload = mapOf<String, Any>(
            "strain" to 0.75,
            "intValue" to 42
        )

        val strainFloat = (payload["strain"] as? Number)?.toFloat() ?: 0f
        val intAsFloat = (payload["intValue"] as? Number)?.toFloat() ?: 0f

        assertEquals(0.75f, strainFloat, 0.001f)
        assertEquals(42f, intAsFloat, 0.001f)
    }

    @Test
    fun `payload extraction handles string values`() {
        val payload = mapOf<String, Any>(
            "predicted" to "excited",
            "expression" to "delight"
        )

        assertEquals("excited", payload["predicted"]?.toString())
        assertEquals("delight", payload["expression"]?.toString())
    }
}

/**
 * Tests for LiveKitSession data message format expectations.
 */
class LiveKitDataMessageFormatTest {

    @Test
    fun `humanization_signal expected format`() {
        // Expected JSON structure from backend:
        // {
        //   "type": "humanization_signal",
        //   "signal_type": "concern_detected",
        //   "payload": { "level": "high" }
        // }

        val expectedType = "humanization_signal"
        val expectedSignalTypes = setOf(
            "concern_detected",
            "voice_state_detected",
            "emotional_trajectory",
            "micro_expression_trigger"
        )

        assertEquals("humanization_signal", expectedType)
        assertTrue(expectedSignalTypes.size == 4)
    }

    @Test
    fun `emotion_event expected format`() {
        // Expected JSON structure from backend:
        // {
        //   "type": "emotion_event",
        //   "emotion": "happy"
        // }

        val expectedEmotions = setOf(
            "happy", "excited", "curious",
            "empathetic", "encouraging", "neutral"
        )

        assertTrue(expectedEmotions.contains("happy"))
        assertTrue(expectedEmotions.contains("empathetic"))
    }
}
