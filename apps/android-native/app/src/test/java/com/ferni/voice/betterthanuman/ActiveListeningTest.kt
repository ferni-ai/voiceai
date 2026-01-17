package com.ferni.voice.betterthanuman

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for ListeningGesture enum.
 */
class ListeningGestureTest {

    // MARK: - Duration Tests

    @Test
    fun `none gesture has zero duration`() {
        assertEquals(0L, ListeningGesture.NONE.durationMs)
    }

    @Test
    fun `micro nod duration is 180ms`() {
        assertEquals(180L, ListeningGesture.MICRO_NOD.durationMs)
    }

    @Test
    fun `subtle nod duration is 220ms`() {
        assertEquals(220L, ListeningGesture.SUBTLE_NOD.durationMs)
    }

    @Test
    fun `visible nod duration is 280ms`() {
        assertEquals(280L, ListeningGesture.VISIBLE_NOD.durationMs)
    }

    @Test
    fun `listening lean duration is 400ms`() {
        assertEquals(400L, ListeningGesture.LISTENING_LEAN.durationMs)
    }

    @Test
    fun `contemplative duration is 400ms`() {
        assertEquals(400L, ListeningGesture.CONTEMPLATIVE.durationMs)
    }

    @Test
    fun `durations increase with gesture intensity`() {
        assertTrue(
            "Micro nod should be shortest",
            ListeningGesture.MICRO_NOD.durationMs < ListeningGesture.SUBTLE_NOD.durationMs
        )
        assertTrue(
            "Subtle nod should be shorter than visible",
            ListeningGesture.SUBTLE_NOD.durationMs < ListeningGesture.VISIBLE_NOD.durationMs
        )
    }

    // MARK: - Transform Tests

    @Test
    fun `none gesture has neutral transform`() {
        val transform = ListeningGesture.NONE.transform
        assertEquals(0f, transform.translateY, 0.001f)
        assertEquals(0f, transform.rotate, 0.001f)
        assertEquals(1f, transform.scale, 0.001f)
    }

    @Test
    fun `micro nod has small translate and slight squash`() {
        val transform = ListeningGesture.MICRO_NOD.transform
        assertEquals(1.5f, transform.translateY, 0.001f)
        assertEquals(0.3f, transform.rotate, 0.001f)
        assertTrue("Micro nod should squash slightly", transform.scale < 1f)
    }

    @Test
    fun `visible nod has largest translate`() {
        val visibleTranslate = ListeningGesture.VISIBLE_NOD.transform.translateY
        val subtleTranslate = ListeningGesture.SUBTLE_NOD.transform.translateY
        val microTranslate = ListeningGesture.MICRO_NOD.transform.translateY

        assertTrue("Visible nod should translate most", visibleTranslate > subtleTranslate)
        assertTrue("Subtle nod should translate more than micro", subtleTranslate > microTranslate)
    }

    @Test
    fun `listening lean moves forward (negative Y)`() {
        val transform = ListeningGesture.LISTENING_LEAN.transform
        assertTrue("Listening lean should move forward", transform.translateY < 0)
        assertEquals(-3.0f, transform.translateY, 0.001f)
    }

    @Test
    fun `listening lean enlarges slightly`() {
        val transform = ListeningGesture.LISTENING_LEAN.transform
        assertTrue("Listening lean should enlarge", transform.scale > 1f)
    }

    @Test
    fun `contemplative has slight backward tilt`() {
        val transform = ListeningGesture.CONTEMPLATIVE.transform
        assertTrue("Contemplative should tilt backward", transform.rotate < 0)
    }

    // MARK: - Duration Conversion Tests

    @Test
    fun `durationSeconds converts correctly`() {
        assertEquals(0.18f, ListeningGesture.MICRO_NOD.durationSeconds, 0.001f)
        assertEquals(0.22f, ListeningGesture.SUBTLE_NOD.durationSeconds, 0.001f)
        assertEquals(0.28f, ListeningGesture.VISIBLE_NOD.durationSeconds, 0.001f)
    }
}

/**
 * Unit tests for ListeningTransform data class.
 */
class ListeningTransformTest {

    @Test
    fun `default values create neutral transform`() {
        val transform = ListeningTransform()
        assertEquals(0f, transform.translateY, 0.001f)
        assertEquals(0f, transform.rotate, 0.001f)
        assertEquals(1f, transform.scale, 0.001f)
    }

    @Test
    fun `custom values are preserved`() {
        val transform = ListeningTransform(
            translateY = 2.5f,
            rotate = 0.5f,
            scale = 0.996f
        )
        assertEquals(2.5f, transform.translateY, 0.001f)
        assertEquals(0.5f, transform.rotate, 0.001f)
        assertEquals(0.996f, transform.scale, 0.001f)
    }

    @Test
    fun `equality works correctly`() {
        val transform1 = ListeningTransform(2.5f, 0.5f, 0.996f)
        val transform2 = ListeningTransform(2.5f, 0.5f, 0.996f)
        val transform3 = ListeningTransform(2.5f, 0.5f, 0.997f)

        assertEquals(transform1, transform2)
        assertNotEquals(transform1, transform3)
    }

    @Test
    fun `all gesture transforms preserve near-unit scale`() {
        ListeningGesture.entries.forEach { gesture ->
            val scale = gesture.transform.scale
            assertTrue(
                "${gesture.name} scale should be near 1.0",
                scale in 0.99f..1.02f
            )
        }
    }
}
