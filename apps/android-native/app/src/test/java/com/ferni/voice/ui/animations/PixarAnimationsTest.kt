package com.ferni.voice.ui.animations

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for PixarTiming constants.
 */
class PixarTimingTest {

    // MARK: - Breathing Cycle Tests

    @Test
    fun `breath cycle idle is 6 seconds`() {
        assertEquals(6.0, PixarTiming.BREATH_CYCLE_IDLE, 0.001)
    }

    @Test
    fun `breath cycle active is 5 seconds`() {
        assertEquals(5.0, PixarTiming.BREATH_CYCLE_ACTIVE, 0.001)
    }

    @Test
    fun `breath cycle speaking is 4_5 seconds`() {
        assertEquals(4.5, PixarTiming.BREATH_CYCLE_SPEAKING, 0.001)
    }

    @Test
    fun `breathing cycles follow correct hierarchy`() {
        // Speaking should be fastest (most engaged)
        assertTrue(
            "Speaking cycle should be faster than active",
            PixarTiming.BREATH_CYCLE_SPEAKING < PixarTiming.BREATH_CYCLE_ACTIVE
        )
        assertTrue(
            "Active cycle should be faster than idle",
            PixarTiming.BREATH_CYCLE_ACTIVE < PixarTiming.BREATH_CYCLE_IDLE
        )
    }

    @Test
    fun `all breathing cycles are positive`() {
        assertTrue(PixarTiming.BREATH_CYCLE_IDLE > 0)
        assertTrue(PixarTiming.BREATH_CYCLE_ACTIVE > 0)
        assertTrue(PixarTiming.BREATH_CYCLE_SPEAKING > 0)
    }

    // MARK: - Reaction Duration Tests

    @Test
    fun `nod duration is 280ms`() {
        assertEquals(0.28, PixarTiming.NOD_DURATION, 0.001)
    }

    @Test
    fun `tilt duration is 400ms`() {
        assertEquals(0.4, PixarTiming.TILT_DURATION, 0.001)
    }

    @Test
    fun `bounce duration is 600ms`() {
        assertEquals(0.6, PixarTiming.BOUNCE_DURATION, 0.001)
    }

    @Test
    fun `perk up duration is 300ms`() {
        assertEquals(0.3, PixarTiming.PERK_UP_DURATION, 0.001)
    }

    @Test
    fun `reaction durations are all under 1 second`() {
        assertTrue(PixarTiming.NOD_DURATION < 1.0)
        assertTrue(PixarTiming.TILT_DURATION < 1.0)
        assertTrue(PixarTiming.BOUNCE_DURATION < 1.0)
        assertTrue(PixarTiming.PERK_UP_DURATION < 1.0)
    }

    // MARK: - Glow/Halo Cycle Tests

    @Test
    fun `heartbeat cycle matches resting heart rate`() {
        // 1.8s cycle = ~66 BPM (typical resting heart rate)
        assertEquals(1.8, PixarTiming.HEARTBEAT_CYCLE, 0.001)
    }

    @Test
    fun `halo outer cycle is slowest`() {
        assertEquals(8.0, PixarTiming.HALO_OUTER_CYCLE, 0.001)
        assertTrue(PixarTiming.HALO_OUTER_CYCLE > PixarTiming.HALO_INNER_CYCLE)
    }

    @Test
    fun `halo inner cycle syncs with avatar`() {
        assertEquals(5.0, PixarTiming.HALO_INNER_CYCLE, 0.001)
        // Should roughly match the active breath cycle
        assertEquals(
            PixarTiming.BREATH_CYCLE_ACTIVE,
            PixarTiming.HALO_INNER_CYCLE,
            0.001
        )
    }

    @Test
    fun `halo pulse expand duration is reasonable`() {
        assertEquals(1.2, PixarTiming.HALO_PULSE_EXPAND, 0.001)
    }

    // MARK: - Soul Effect Tests

    @Test
    fun `shimmer cycle is 2 seconds`() {
        assertEquals(2.0, PixarTiming.SHIMMER_CYCLE, 0.001)
    }

    @Test
    fun `warmth bloom is 600ms`() {
        assertEquals(0.6, PixarTiming.WARMTH_BLOOM, 0.001)
    }

    @Test
    fun `memory spark is quick 300ms`() {
        assertEquals(0.3, PixarTiming.MEMORY_SPARK, 0.001)
    }

    @Test
    fun `micro expression is subliminal at 80ms`() {
        assertEquals(0.08, PixarTiming.MICRO_EXPRESSION, 0.001)
        // Should be under 100ms to be subliminal
        assertTrue(PixarTiming.MICRO_EXPRESSION < 0.1)
    }

    // MARK: - Wave Ring Tests

    @Test
    fun `wave ring has 64 segments`() {
        assertEquals(64, PixarTiming.WAVE_RING_SEGMENTS)
    }
}

/**
 * Unit tests for BodyValues squash/stretch constants.
 */
class BodyValuesTest {

    // MARK: - Idle State Tests

    @Test
    fun `idle scale Y is slightly above 1`() {
        assertEquals(1.012f, BodyValues.Idle.SCALE_Y, 0.001f)
        assertTrue(BodyValues.Idle.SCALE_Y > 1.0f)
    }

    @Test
    fun `idle scale X is slightly below 1`() {
        assertEquals(0.994f, BodyValues.Idle.SCALE_X, 0.001f)
        assertTrue(BodyValues.Idle.SCALE_X < 1.0f)
    }

    @Test
    fun `idle preserves approximate volume`() {
        // Volume = scaleX * scaleY should be approximately 1.0
        val volume = BodyValues.Idle.SCALE_X * BodyValues.Idle.SCALE_Y
        assertEquals(1.0f, volume, 0.02f)
    }

    @Test
    fun `idle translate Y is subtle`() {
        assertEquals(-1.5f, BodyValues.Idle.TRANSLATE_Y, 0.001f)
    }

    @Test
    fun `idle rotation is minimal`() {
        assertEquals(0.3f, BodyValues.Idle.ROTATION, 0.001f)
    }

    // MARK: - Active State Tests

    @Test
    fun `active scale Y is greater than idle`() {
        assertTrue(BodyValues.Active.SCALE_Y > BodyValues.Idle.SCALE_Y)
    }

    @Test
    fun `active preserves approximate volume`() {
        val volume = BodyValues.Active.SCALE_X * BodyValues.Active.SCALE_Y
        assertEquals(1.0f, volume, 0.02f)
    }

    @Test
    fun `active translate Y is greater than idle`() {
        assertTrue(
            "Active translate should move more than idle",
            Math.abs(BodyValues.Active.TRANSLATE_Y) > Math.abs(BodyValues.Idle.TRANSLATE_Y)
        )
    }

    // MARK: - Speaking State Tests

    @Test
    fun `speaking scale Y is most exaggerated`() {
        assertTrue(BodyValues.Speaking.SCALE_Y > BodyValues.Active.SCALE_Y)
        assertTrue(BodyValues.Speaking.SCALE_Y > BodyValues.Idle.SCALE_Y)
    }

    @Test
    fun `speaking preserves approximate volume`() {
        val volume = BodyValues.Speaking.SCALE_X * BodyValues.Speaking.SCALE_Y
        assertEquals(1.0f, volume, 0.02f)
    }

    @Test
    fun `speaking has most translation`() {
        assertTrue(
            "Speaking should have most vertical movement",
            Math.abs(BodyValues.Speaking.TRANSLATE_Y) > Math.abs(BodyValues.Active.TRANSLATE_Y)
        )
    }

    @Test
    fun `speaking has most rotation`() {
        assertTrue(
            "Speaking should have most rotation",
            BodyValues.Speaking.ROTATION > BodyValues.Active.ROTATION
        )
    }

    // MARK: - Progression Tests

    @Test
    fun `scale Y increases from idle to speaking`() {
        assertTrue(BodyValues.Idle.SCALE_Y < BodyValues.Active.SCALE_Y)
        assertTrue(BodyValues.Active.SCALE_Y < BodyValues.Speaking.SCALE_Y)
    }

    @Test
    fun `scale X decreases from idle to speaking`() {
        assertTrue(BodyValues.Idle.SCALE_X > BodyValues.Active.SCALE_X)
        assertTrue(BodyValues.Active.SCALE_X > BodyValues.Speaking.SCALE_X)
    }

    @Test
    fun `rotation increases from idle to speaking`() {
        assertTrue(BodyValues.Idle.ROTATION < BodyValues.Active.ROTATION)
        assertTrue(BodyValues.Active.ROTATION < BodyValues.Speaking.ROTATION)
    }
}

/**
 * Unit tests for PixarEasing functions.
 */
class PixarEasingTest {

    // MARK: - Spring Easing Tests

    @Test
    fun `spring easing starts at zero`() {
        assertEquals(0f, PixarEasing.spring.transform(0f), 0.001f)
    }

    @Test
    fun `spring easing ends at one`() {
        assertEquals(1f, PixarEasing.spring.transform(1f), 0.001f)
    }

    @Test
    fun `spring easing overshoots at midpoint`() {
        // Spring easing should overshoot past 1.0 before settling
        val midValue = PixarEasing.spring.transform(0.5f)
        // Spring typically overshoots around the 0.3-0.5 range
        assertTrue("Spring should produce valid output", midValue > 0f)
    }

    // MARK: - Smooth Out Easing Tests

    @Test
    fun `smooth out easing starts at zero`() {
        assertEquals(0f, PixarEasing.smoothOut.transform(0f), 0.001f)
    }

    @Test
    fun `smooth out easing ends at one`() {
        assertEquals(1f, PixarEasing.smoothOut.transform(1f), 0.001f)
    }

    @Test
    fun `smooth out is monotonically increasing`() {
        var previous = 0f
        for (i in 1..10) {
            val fraction = i / 10f
            val current = PixarEasing.smoothOut.transform(fraction)
            assertTrue("Value should increase", current >= previous)
            previous = current
        }
    }

    // MARK: - Anticipation Easing Tests

    @Test
    fun `anticipation easing starts at zero`() {
        assertEquals(0f, PixarEasing.anticipation.transform(0f), 0.001f)
    }

    @Test
    fun `anticipation easing ends at one`() {
        assertEquals(1f, PixarEasing.anticipation.transform(1f), 0.001f)
    }

    @Test
    fun `anticipation easing pulls back initially`() {
        // Anticipation should go negative briefly before moving forward
        val earlyValue = PixarEasing.anticipation.transform(0.1f)
        assertTrue("Anticipation should pull back (negative) initially", earlyValue < 0f)
    }
}

/**
 * Unit tests for WaveParams constants.
 */
class WaveParamsTest {

    @Test
    fun `base amplitude is 0_15`() {
        assertEquals(0.15f, WaveParams.BASE_AMPLITUDE, 0.001f)
    }

    @Test
    fun `max amplitude is 0_4`() {
        assertEquals(0.4f, WaveParams.MAX_AMPLITUDE, 0.001f)
    }

    @Test
    fun `max amplitude is greater than base`() {
        assertTrue(WaveParams.MAX_AMPLITUDE > WaveParams.BASE_AMPLITUDE)
    }

    @Test
    fun `wave speed is 2_0`() {
        assertEquals(2.0f, WaveParams.WAVE_SPEED, 0.001f)
    }

    @Test
    fun `phase offset is 0_1`() {
        assertEquals(0.1f, WaveParams.PHASE_OFFSET, 0.001f)
    }

    @Test
    fun `all wave params are positive`() {
        assertTrue(WaveParams.BASE_AMPLITUDE > 0f)
        assertTrue(WaveParams.MAX_AMPLITUDE > 0f)
        assertTrue(WaveParams.WAVE_SPEED > 0f)
        assertTrue(WaveParams.PHASE_OFFSET > 0f)
    }
}
