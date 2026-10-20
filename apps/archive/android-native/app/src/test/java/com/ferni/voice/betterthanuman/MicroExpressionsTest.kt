package com.ferni.voice.betterthanuman

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for MicroExpressionType enum.
 */
class MicroExpressionTypeTest {

    // MARK: - Duration Tests

    @Test
    fun `recognition duration is 80ms`() {
        assertEquals(80L, MicroExpressionType.RECOGNITION.durationMs)
    }

    @Test
    fun `concern duration is 60ms`() {
        assertEquals(60L, MicroExpressionType.CONCERN.durationMs)
    }

    @Test
    fun `delight duration is 100ms`() {
        assertEquals(100L, MicroExpressionType.DELIGHT.durationMs)
    }

    @Test
    fun `warmth duration is 120ms`() {
        assertEquals(120L, MicroExpressionType.WARMTH.durationMs)
    }

    @Test
    fun `interest duration is 70ms`() {
        assertEquals(70L, MicroExpressionType.INTEREST.durationMs)
    }

    @Test
    fun `all durations are subliminal 40-150ms`() {
        MicroExpressionType.entries.forEach { type ->
            assertTrue(
                "${type.name} duration ${type.durationMs}ms should be 40-150ms",
                type.durationMs in 40..150
            )
        }
    }

    // MARK: - Intensity Tests

    @Test
    fun `recognition intensity is 0_4`() {
        assertEquals(0.4f, MicroExpressionType.RECOGNITION.intensity, 0.001f)
    }

    @Test
    fun `concern intensity is 0_3`() {
        assertEquals(0.3f, MicroExpressionType.CONCERN.intensity, 0.001f)
    }

    @Test
    fun `delight intensity is highest at 0_6`() {
        assertEquals(0.6f, MicroExpressionType.DELIGHT.intensity, 0.001f)
        assertTrue(
            "Delight should have highest intensity",
            MicroExpressionType.entries.all { it.intensity <= MicroExpressionType.DELIGHT.intensity }
        )
    }

    @Test
    fun `all intensities are between 0 and 1`() {
        MicroExpressionType.entries.forEach { type ->
            assertTrue("${type.name} intensity should be >= 0", type.intensity >= 0f)
            assertTrue("${type.name} intensity should be <= 1", type.intensity <= 1f)
        }
    }

    // MARK: - Soul Effect Tests

    @Test
    fun `recognition has spark and warmth opacity`() {
        val effect = MicroExpressionType.RECOGNITION.soulEffect
        assertEquals(0.3f, effect.warmthOpacity, 0.001f)
        assertEquals(0.4f, effect.sparkOpacity, 0.001f)
        assertEquals(0f, effect.shimmerBoost, 0.001f)
    }

    @Test
    fun `concern reduces shimmer`() {
        val effect = MicroExpressionType.CONCERN.soulEffect
        assertTrue("Concern should reduce shimmer", effect.shimmerBoost < 0)
    }

    @Test
    fun `delight has high spark opacity`() {
        val effect = MicroExpressionType.DELIGHT.soulEffect
        assertEquals(0.6f, effect.sparkOpacity, 0.001f)
        assertTrue("Delight should boost shimmer", effect.shimmerBoost > 0)
    }

    @Test
    fun `warmth has highest warmth opacity`() {
        val warmthOpacity = MicroExpressionType.WARMTH.soulEffect.warmthOpacity
        assertEquals(0.5f, warmthOpacity, 0.001f)

        val otherMax = MicroExpressionType.entries
            .filter { it != MicroExpressionType.WARMTH }
            .maxOf { it.soulEffect.warmthOpacity }

        assertTrue("Warmth should have highest warmth opacity", warmthOpacity >= otherMax)
    }

    // MARK: - Duration Conversion Tests

    @Test
    fun `durationSeconds converts correctly`() {
        assertEquals(0.08f, MicroExpressionType.RECOGNITION.durationSeconds, 0.001f)
        assertEquals(0.06f, MicroExpressionType.CONCERN.durationSeconds, 0.001f)
        assertEquals(0.10f, MicroExpressionType.DELIGHT.durationSeconds, 0.001f)
    }
}

/**
 * Unit tests for MicroSoulEffect data class.
 */
class MicroSoulEffectTest {

    @Test
    fun `default values are all zero`() {
        val effect = MicroSoulEffect()
        assertEquals(0f, effect.warmthOpacity, 0.001f)
        assertEquals(0f, effect.sparkOpacity, 0.001f)
        assertEquals(0f, effect.shimmerBoost, 0.001f)
    }

    @Test
    fun `custom values are preserved`() {
        val effect = MicroSoulEffect(
            warmthOpacity = 0.5f,
            sparkOpacity = 0.3f,
            shimmerBoost = 0.1f
        )
        assertEquals(0.5f, effect.warmthOpacity, 0.001f)
        assertEquals(0.3f, effect.sparkOpacity, 0.001f)
        assertEquals(0.1f, effect.shimmerBoost, 0.001f)
    }

    @Test
    fun `equality works correctly`() {
        val effect1 = MicroSoulEffect(0.5f, 0.3f, 0.1f)
        val effect2 = MicroSoulEffect(0.5f, 0.3f, 0.1f)
        val effect3 = MicroSoulEffect(0.5f, 0.3f, 0.2f)

        assertEquals(effect1, effect2)
        assertNotEquals(effect1, effect3)
    }
}
