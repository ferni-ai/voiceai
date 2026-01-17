package com.ferni.voice.betterthanuman

import com.ferni.voice.models.EmotionHint
import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for AnticipatedEmotion enum.
 */
class AnticipatedEmotionTest {

    // MARK: - Expression Hint Tests

    @Test
    fun `reflective maps to curious hint`() {
        assertEquals(EmotionHint.CURIOUS, AnticipatedEmotion.REFLECTIVE.expressionHint)
    }

    @Test
    fun `vulnerable maps to empathetic hint`() {
        assertEquals(EmotionHint.EMPATHETIC, AnticipatedEmotion.VULNERABLE.expressionHint)
    }

    @Test
    fun `uncertain maps to empathetic hint`() {
        assertEquals(EmotionHint.EMPATHETIC, AnticipatedEmotion.UNCERTAIN.expressionHint)
    }

    @Test
    fun `excited maps to curious hint (lean in before celebrating)`() {
        assertEquals(EmotionHint.CURIOUS, AnticipatedEmotion.EXCITED.expressionHint)
    }

    @Test
    fun `nostalgic maps to empathetic hint`() {
        assertEquals(EmotionHint.EMPATHETIC, AnticipatedEmotion.NOSTALGIC.expressionHint)
    }

    @Test
    fun `attentive maps to curious hint`() {
        assertEquals(EmotionHint.CURIOUS, AnticipatedEmotion.ATTENTIVE.expressionHint)
    }

    @Test
    fun `concerned maps to empathetic hint`() {
        assertEquals(EmotionHint.EMPATHETIC, AnticipatedEmotion.CONCERNED.expressionHint)
    }

    @Test
    fun `warm maps to happy hint`() {
        assertEquals(EmotionHint.HAPPY, AnticipatedEmotion.WARM.expressionHint)
    }

    @Test
    fun `curious maps to curious hint`() {
        assertEquals(EmotionHint.CURIOUS, AnticipatedEmotion.CURIOUS.expressionHint)
    }

    // MARK: - Visual Shift Tests

    @Test
    fun `all emotions lean forward (negative Y)`() {
        AnticipatedEmotion.entries.forEach { emotion ->
            assertTrue(
                "${emotion.name} should lean forward",
                emotion.visualShift.leanY <= 0
            )
        }
    }

    @Test
    fun `attentive has deepest lean`() {
        val attentiveLean = AnticipatedEmotion.ATTENTIVE.visualShift.leanY
        assertTrue("Attentive should have deepest lean", attentiveLean == -5f)

        val otherMax = AnticipatedEmotion.entries
            .filter { it != AnticipatedEmotion.ATTENTIVE }
            .minOf { it.visualShift.leanY }

        assertTrue(
            "Attentive should lean more than others",
            attentiveLean <= otherMax
        )
    }

    @Test
    fun `concerned has high warmth`() {
        val warmth = AnticipatedEmotion.CONCERNED.visualShift.warmth
        assertEquals(0.6f, warmth, 0.001f)
    }

    @Test
    fun `excited has positive shimmer boost`() {
        val shimmer = AnticipatedEmotion.EXCITED.visualShift.shimmerBoost
        assertTrue("Excited should boost shimmer", shimmer > 0)
    }

    @Test
    fun `nostalgic has high warmth for comfort`() {
        val warmth = AnticipatedEmotion.NOSTALGIC.visualShift.warmth
        assertEquals(0.5f, warmth, 0.001f)
    }

    @Test
    fun `reflective has subtle visual shift`() {
        val visual = AnticipatedEmotion.REFLECTIVE.visualShift
        assertEquals(-2f, visual.leanY, 0.001f)
        assertEquals(0.2f, visual.warmth, 0.001f)
        assertTrue("Reflective should reduce shimmer", visual.shimmerBoost < 0)
    }

    // MARK: - All Values Valid Tests

    @Test
    fun `all warmth values are between 0 and 1`() {
        AnticipatedEmotion.entries.forEach { emotion ->
            val warmth = emotion.visualShift.warmth
            assertTrue(
                "${emotion.name} warmth should be >= 0",
                warmth >= 0f
            )
            assertTrue(
                "${emotion.name} warmth should be <= 1",
                warmth <= 1f
            )
        }
    }

    @Test
    fun `all shimmer boosts are in valid range`() {
        AnticipatedEmotion.entries.forEach { emotion ->
            val shimmer = emotion.visualShift.shimmerBoost
            assertTrue(
                "${emotion.name} shimmer should be >= -0.3",
                shimmer >= -0.3f
            )
            assertTrue(
                "${emotion.name} shimmer should be <= 0.5",
                shimmer <= 0.5f
            )
        }
    }
}

/**
 * Unit tests for AnticipationVisual data class.
 */
class AnticipationVisualTest {

    @Test
    fun `default values are all zero`() {
        val visual = AnticipationVisual()
        assertEquals(0f, visual.leanY, 0.001f)
        assertEquals(0f, visual.warmth, 0.001f)
        assertEquals(0f, visual.shimmerBoost, 0.001f)
    }

    @Test
    fun `custom values are preserved`() {
        val visual = AnticipationVisual(
            leanY = -3f,
            warmth = 0.4f,
            shimmerBoost = 0.1f
        )
        assertEquals(-3f, visual.leanY, 0.001f)
        assertEquals(0.4f, visual.warmth, 0.001f)
        assertEquals(0.1f, visual.shimmerBoost, 0.001f)
    }

    @Test
    fun `equality works correctly`() {
        val visual1 = AnticipationVisual(-3f, 0.4f, 0.1f)
        val visual2 = AnticipationVisual(-3f, 0.4f, 0.1f)
        val visual3 = AnticipationVisual(-3f, 0.4f, 0.2f)

        assertEquals(visual1, visual2)
        assertNotEquals(visual1, visual3)
    }
}

/**
 * Unit tests for VoiceTone enum.
 */
class VoiceToneTest {

    @Test
    fun `all voice tones exist`() {
        val tones = VoiceTone.entries
        assertEquals(5, tones.size)
    }

    @Test
    fun `includes neutral tone`() {
        assertTrue(VoiceTone.entries.contains(VoiceTone.NEUTRAL))
    }

    @Test
    fun `includes rising tone for excitement and questions`() {
        assertTrue(VoiceTone.entries.contains(VoiceTone.RISING))
    }

    @Test
    fun `includes falling tone for sadness`() {
        assertTrue(VoiceTone.entries.contains(VoiceTone.FALLING))
    }

    @Test
    fun `includes breaking tone for emotional distress`() {
        assertTrue(VoiceTone.entries.contains(VoiceTone.BREAKING))
    }

    @Test
    fun `includes strained tone for stress`() {
        assertTrue(VoiceTone.entries.contains(VoiceTone.STRAINED))
    }
}

/**
 * Unit tests for ConcernLevel enum.
 */
class ConcernLevelTest {

    @Test
    fun `all concern levels exist`() {
        val levels = ConcernLevel.entries
        assertEquals(4, levels.size)
    }

    @Test
    fun `includes none level`() {
        assertTrue(ConcernLevel.entries.contains(ConcernLevel.NONE))
    }

    @Test
    fun `includes mild level`() {
        assertTrue(ConcernLevel.entries.contains(ConcernLevel.MILD))
    }

    @Test
    fun `includes moderate level`() {
        assertTrue(ConcernLevel.entries.contains(ConcernLevel.MODERATE))
    }

    @Test
    fun `includes high level`() {
        assertTrue(ConcernLevel.entries.contains(ConcernLevel.HIGH))
    }

    @Test
    fun `ordinals follow severity order`() {
        assertTrue(ConcernLevel.NONE.ordinal < ConcernLevel.MILD.ordinal)
        assertTrue(ConcernLevel.MILD.ordinal < ConcernLevel.MODERATE.ordinal)
        assertTrue(ConcernLevel.MODERATE.ordinal < ConcernLevel.HIGH.ordinal)
    }
}
