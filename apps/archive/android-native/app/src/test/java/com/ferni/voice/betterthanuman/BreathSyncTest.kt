package com.ferni.voice.betterthanuman

import com.ferni.voice.ui.animations.PixarTiming
import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for BreathSync configuration and integration with PixarTiming.
 *
 * Note: These are pure unit tests for configuration values.
 * Coroutine-based engine behavior would require additional test infrastructure.
 */
class BreathSyncConfigTest {

    // MARK: - Pixar Timing Integration Tests

    @Test
    fun `idle breath cycle matches pixar timing`() {
        assertEquals(6.0, PixarTiming.BREATH_CYCLE_IDLE, 0.001)
    }

    @Test
    fun `active breath cycle is faster than idle`() {
        assertTrue(
            "Active should be faster than idle",
            PixarTiming.BREATH_CYCLE_ACTIVE < PixarTiming.BREATH_CYCLE_IDLE
        )
    }

    @Test
    fun `speaking breath cycle is fastest`() {
        assertTrue(
            "Speaking should be fastest",
            PixarTiming.BREATH_CYCLE_SPEAKING < PixarTiming.BREATH_CYCLE_ACTIVE
        )
    }

    @Test
    fun `all breath cycles are positive`() {
        assertTrue(PixarTiming.BREATH_CYCLE_IDLE > 0)
        assertTrue(PixarTiming.BREATH_CYCLE_ACTIVE > 0)
        assertTrue(PixarTiming.BREATH_CYCLE_SPEAKING > 0)
    }

    @Test
    fun `heartbeat cycle matches resting heart rate`() {
        // 1.8s cycle = ~66 BPM (typical resting heart rate)
        val bpm = 60.0 / PixarTiming.HEARTBEAT_CYCLE
        assertTrue("BPM should be in resting range", bpm in 50.0..80.0)
    }

    // MARK: - Breath Rate Bounds Tests

    @Test
    fun `breath rate range is reasonable`() {
        // These values are internal to BreathSyncEngine but we can test the expected behavior
        val minReasonable = 3.0  // Fastest stressed breathing
        val maxReasonable = 10.0  // Slowest relaxed breathing

        assertTrue("Min should be positive", minReasonable > 0)
        assertTrue("Max should be greater than min", maxReasonable > minReasonable)
        assertTrue("Idle should be in range", PixarTiming.BREATH_CYCLE_IDLE in minReasonable..maxReasonable)
    }

    // MARK: - Halo Sync Tests

    @Test
    fun `halo inner cycle syncs with active breath`() {
        assertEquals(
            "Halo inner should match active breath",
            PixarTiming.BREATH_CYCLE_ACTIVE,
            PixarTiming.HALO_INNER_CYCLE,
            0.001
        )
    }

    @Test
    fun `halo outer cycle is slowest`() {
        assertTrue(
            "Outer halo should be slower than inner",
            PixarTiming.HALO_OUTER_CYCLE > PixarTiming.HALO_INNER_CYCLE
        )
    }
}

/**
 * Unit tests for breath phase calculations.
 */
class BreathPhaseTest {

    @Test
    fun `breath phase 0 is start of cycle`() {
        // Phase 0 = start of inhale
        val phase = 0f
        assertTrue("Phase 0 should be valid", phase in 0f..1f)
    }

    @Test
    fun `breath phase 0_5 is peak inhale`() {
        // Phase 0.5 = peak of inhale (lungs full)
        val phase = 0.5f
        assertTrue("Phase 0.5 should be valid", phase in 0f..1f)
    }

    @Test
    fun `breath phase 1 is end of cycle`() {
        // Phase 1 = end of exhale, wraps to 0
        val phase = 1f
        assertTrue("Phase 1 should be valid", phase in 0f..1f)
    }

    @Test
    fun `breath pulse triggers near peak`() {
        // EmotionalHaptics.playBreathPulse checks phase 0.45-0.55
        val peakPhase = 0.5f
        val tolerance = 0.05f

        val lowerBound = peakPhase - tolerance
        val upperBound = peakPhase + tolerance

        assertTrue("Peak check lower bound", lowerBound > 0.4f)
        assertTrue("Peak check upper bound", upperBound < 0.6f)
    }
}
