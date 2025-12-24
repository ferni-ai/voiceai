package com.ferni.voice.betterthanuman

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for BetterThanHumanState data class.
 */
class BetterThanHumanStateTest {

    // MARK: - Default State Tests

    @Test
    fun `default state has no listening gesture`() {
        val state = BetterThanHumanState()
        assertEquals(ListeningGesture.NONE, state.listeningGesture)
    }

    @Test
    fun `default state has no micro expression`() {
        val state = BetterThanHumanState()
        assertNull(state.microExpression)
    }

    @Test
    fun `default state has zero breath phase`() {
        val state = BetterThanHumanState()
        assertEquals(0f, state.breathPhase, 0.001f)
    }

    @Test
    fun `default state has idle breath rate`() {
        val state = BetterThanHumanState()
        assertEquals(6.0, state.breathRate, 0.001)
    }

    @Test
    fun `default state has no anticipated emotion`() {
        val state = BetterThanHumanState()
        assertNull(state.anticipatedEmotion)
    }

    @Test
    fun `default state has no concern`() {
        val state = BetterThanHumanState()
        assertEquals(ConcernLevel.NONE, state.concernLevel)
    }

    // MARK: - hasActiveState Tests

    @Test
    fun `default state has no active state`() {
        val state = BetterThanHumanState()
        assertFalse(state.hasActiveState)
    }

    @Test
    fun `state with listening gesture is active`() {
        val state = BetterThanHumanState(listeningGesture = ListeningGesture.MICRO_NOD)
        assertTrue(state.hasActiveState)
    }

    @Test
    fun `state with micro expression is active`() {
        val state = BetterThanHumanState(microExpression = MicroExpressionType.DELIGHT)
        assertTrue(state.hasActiveState)
    }

    @Test
    fun `state with anticipated emotion is active`() {
        val state = BetterThanHumanState(anticipatedEmotion = AnticipatedEmotion.EXCITED)
        assertTrue(state.hasActiveState)
    }

    @Test
    fun `state with concern is active`() {
        val state = BetterThanHumanState(concernLevel = ConcernLevel.MILD)
        assertTrue(state.hasActiveState)
    }

    @Test
    fun `state with only breath phase is not active`() {
        val state = BetterThanHumanState(breathPhase = 0.5f)
        assertFalse(state.hasActiveState)
    }

    // MARK: - Combined Transform Tests

    @Test
    fun `default state has neutral combined transform`() {
        val state = BetterThanHumanState()
        val transform = state.combinedTransform

        assertEquals(0f, transform.translateY, 0.001f)
        assertEquals(0f, transform.rotate, 0.001f)
        assertEquals(1f, transform.scale, 0.001f)
        assertEquals(0f, transform.warmth, 0.001f)
        assertEquals(0f, transform.shimmer, 0.001f)
    }

    @Test
    fun `listening gesture affects combined transform`() {
        val state = BetterThanHumanState(listeningGesture = ListeningGesture.MICRO_NOD)
        val transform = state.combinedTransform
        val gestureTransform = ListeningGesture.MICRO_NOD.transform

        assertEquals(gestureTransform.translateY, transform.translateY, 0.001f)
        assertEquals(gestureTransform.rotate, transform.rotate, 0.001f)
        assertEquals(gestureTransform.scale, transform.scale, 0.001f)
    }

    @Test
    fun `micro expression affects warmth and shimmer`() {
        val state = BetterThanHumanState(microExpression = MicroExpressionType.DELIGHT)
        val transform = state.combinedTransform
        val soulEffect = MicroExpressionType.DELIGHT.soulEffect

        assertEquals(soulEffect.warmthOpacity, transform.warmth, 0.001f)
        assertEquals(soulEffect.shimmerBoost, transform.shimmer, 0.001f)
    }

    @Test
    fun `anticipated emotion affects lean and warmth`() {
        val state = BetterThanHumanState(anticipatedEmotion = AnticipatedEmotion.CONCERNED)
        val transform = state.combinedTransform
        val visual = AnticipatedEmotion.CONCERNED.visualShift

        assertEquals(visual.leanY, transform.translateY, 0.001f)
        assertEquals(visual.warmth, transform.warmth, 0.001f)
    }

    @Test
    fun `mild concern adds warmth`() {
        val state = BetterThanHumanState(concernLevel = ConcernLevel.MILD)
        val transform = state.combinedTransform

        assertEquals(0.2f, transform.warmth, 0.001f)
    }

    @Test
    fun `moderate concern adds more warmth`() {
        val state = BetterThanHumanState(concernLevel = ConcernLevel.MODERATE)
        val transform = state.combinedTransform

        assertEquals(0.4f, transform.warmth, 0.001f)
    }

    @Test
    fun `high concern adds most warmth`() {
        val state = BetterThanHumanState(concernLevel = ConcernLevel.HIGH)
        val transform = state.combinedTransform

        assertEquals(0.6f, transform.warmth, 0.001f)
    }

    @Test
    fun `multiple states combine transforms`() {
        val state = BetterThanHumanState(
            listeningGesture = ListeningGesture.MICRO_NOD,
            microExpression = MicroExpressionType.DELIGHT,
            anticipatedEmotion = AnticipatedEmotion.WARM,
            concernLevel = ConcernLevel.MILD
        )
        val transform = state.combinedTransform

        // TranslateY should sum from listening gesture and anticipated emotion
        val expectedTranslateY = ListeningGesture.MICRO_NOD.transform.translateY +
                AnticipatedEmotion.WARM.visualShift.leanY
        assertEquals(expectedTranslateY, transform.translateY, 0.001f)

        // Warmth should sum from all sources and clamp to 1
        // Delight: 0.4, Warm: 0.5, Mild Concern: 0.2 = 1.1 -> clamped to 1.0
        assertEquals(1.0f, transform.warmth, 0.001f)
    }

    @Test
    fun `warmth is clamped to 0-1`() {
        val state = BetterThanHumanState(
            microExpression = MicroExpressionType.WARMTH,  // 0.5
            anticipatedEmotion = AnticipatedEmotion.CONCERNED,  // 0.6
            concernLevel = ConcernLevel.HIGH  // 0.6
        )
        val transform = state.combinedTransform

        assertTrue("Warmth should be clamped to 1.0", transform.warmth <= 1.0f)
        assertEquals(1.0f, transform.warmth, 0.001f)
    }

    @Test
    fun `shimmer is clamped to valid range`() {
        val state = BetterThanHumanState(
            microExpression = MicroExpressionType.DELIGHT,  // 0.2
            anticipatedEmotion = AnticipatedEmotion.EXCITED  // 0.2
        )
        val transform = state.combinedTransform

        assertTrue("Shimmer should be clamped to max 0.5", transform.shimmer <= 0.5f)
    }
}

/**
 * Unit tests for CombinedTransform data class.
 */
class CombinedTransformTest {

    @Test
    fun `default values create neutral transform`() {
        val transform = CombinedTransform()
        assertEquals(0f, transform.translateY, 0.001f)
        assertEquals(0f, transform.rotate, 0.001f)
        assertEquals(1f, transform.scale, 0.001f)
        assertEquals(0f, transform.warmth, 0.001f)
        assertEquals(0f, transform.shimmer, 0.001f)
    }

    @Test
    fun `custom values are preserved`() {
        val transform = CombinedTransform(
            translateY = 2.5f,
            rotate = 0.5f,
            scale = 0.996f,
            warmth = 0.4f,
            shimmer = 0.1f
        )
        assertEquals(2.5f, transform.translateY, 0.001f)
        assertEquals(0.5f, transform.rotate, 0.001f)
        assertEquals(0.996f, transform.scale, 0.001f)
        assertEquals(0.4f, transform.warmth, 0.001f)
        assertEquals(0.1f, transform.shimmer, 0.001f)
    }

    @Test
    fun `equality works correctly`() {
        val transform1 = CombinedTransform(2.5f, 0.5f, 0.996f, 0.4f, 0.1f)
        val transform2 = CombinedTransform(2.5f, 0.5f, 0.996f, 0.4f, 0.1f)
        val transform3 = CombinedTransform(2.5f, 0.5f, 0.996f, 0.4f, 0.2f)

        assertEquals(transform1, transform2)
        assertNotEquals(transform1, transform3)
    }
}
