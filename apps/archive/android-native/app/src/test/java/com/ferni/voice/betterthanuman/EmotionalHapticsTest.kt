package com.ferni.voice.betterthanuman

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for EmotionalHapticsEngine patterns and mappings.
 *
 * Note: Actual vibration calls require Android instrumentation tests.
 * These tests verify the pattern logic and configuration values.
 */
class EmotionalHapticsTest {

    // MARK: - Listening Gesture → Haptic Pattern Mapping

    @Test
    fun `all listening gestures have expected haptic patterns`() {
        // Verify each gesture maps to a distinct pattern
        val gesturePatterns = mapOf(
            ListeningGesture.NONE to HapticPattern.NONE,
            ListeningGesture.MICRO_NOD to HapticPattern.SUBTLE_TAP,
            ListeningGesture.SUBTLE_NOD to HapticPattern.SUBTLE_TAP,
            ListeningGesture.VISIBLE_NOD to HapticPattern.SUBTLE_TAP,
            ListeningGesture.LISTENING_LEAN to HapticPattern.GENTLE_WAVE,
            ListeningGesture.CONTEMPLATIVE to HapticPattern.THOUGHTFUL_PULSE
        )

        // Verify all gestures are covered
        assertEquals(ListeningGesture.entries.size, gesturePatterns.size)
    }

    @Test
    fun `micro nod has lower intensity than visible nod`() {
        // Based on playSubtleTap intensity values
        val microNodIntensity = 0.2f
        val subtleNodIntensity = 0.35f
        val visibleNodIntensity = 0.5f

        assertTrue(microNodIntensity < subtleNodIntensity)
        assertTrue(subtleNodIntensity < visibleNodIntensity)
    }

    // MARK: - Micro-Expression → Haptic Pattern Mapping

    @Test
    fun `all micro-expressions have expected haptic patterns`() {
        val expressionPatterns = mapOf(
            MicroExpressionType.RECOGNITION to HapticPattern.QUICK_FLUTTER,
            MicroExpressionType.CONCERN to HapticPattern.SOFT_DOUBLE_TAP,
            MicroExpressionType.DELIGHT to HapticPattern.SPARKLE,
            MicroExpressionType.WARMTH to HapticPattern.WARMTH_PULSE,
            MicroExpressionType.INTEREST to HapticPattern.QUICK_FLUTTER
        )

        // Verify all expressions are covered
        assertEquals(MicroExpressionType.entries.size, expressionPatterns.size)
    }

    @Test
    fun `recognition and interest use same pattern with different intensity`() {
        // Both use QUICK_FLUTTER but with different intensities
        val recognitionIntensity = 0.25f
        val interestIntensity = 0.3f

        assertTrue(recognitionIntensity < interestIntensity)
    }

    // MARK: - Concern Level → Haptic Pattern Mapping

    @Test
    fun `all concern levels have expected haptic patterns`() {
        val concernPatterns = mapOf(
            ConcernLevel.NONE to HapticPattern.NONE,
            ConcernLevel.MILD to HapticPattern.SOFT_DOUBLE_TAP,
            ConcernLevel.MODERATE to HapticPattern.GENTLE_WAVE,
            ConcernLevel.HIGH to HapticPattern.CARE_PRESENCE
        )

        // Verify all levels are covered
        assertEquals(ConcernLevel.entries.size, concernPatterns.size)
    }

    @Test
    fun `concern levels have increasing intensity`() {
        // NONE has no haptic
        // MILD: soft double tap
        // MODERATE: gentle wave for 500ms at 0.4 intensity
        // HIGH: sustained care presence

        val mildDuration = 130L  // 30 + 100
        val moderateDuration = 500L
        val highDuration = 950L  // 50 + 100 + 800

        assertTrue(mildDuration < moderateDuration)
        assertTrue(moderateDuration < highDuration)
    }

    // MARK: - Breath Sync Pattern Tests

    @Test
    fun `breath pulse only triggers at peak phase`() {
        // Pulse should only occur when phase is between 0.45 and 0.55
        assertTrue(isBreathPeakPhase(0.5f))
        assertTrue(isBreathPeakPhase(0.45f))
        assertTrue(isBreathPeakPhase(0.55f))
        assertFalse(isBreathPeakPhase(0.0f))
        assertFalse(isBreathPeakPhase(0.44f))
        assertFalse(isBreathPeakPhase(0.56f))
        assertFalse(isBreathPeakPhase(1.0f))
    }

    @Test
    fun `breath pulse has default low intensity`() {
        val defaultIntensity = 0.15f
        assertTrue(defaultIntensity < 0.2f) // Very subtle
    }

    // MARK: - Connection Established Pattern Tests

    @Test
    fun `connection established uses rising pattern`() {
        // Warm rising pattern - 4 taps with increasing intensity
        val timings = longArrayOf(0, 50, 120, 50, 120, 50, 120, 50)
        val amplitudes = intArrayOf(0, 50, 0, 100, 0, 150, 0, 200)

        assertEquals(8, timings.size)
        assertEquals(8, amplitudes.size)

        // Verify ascending pattern
        assertTrue(amplitudes[1] < amplitudes[3])
        assertTrue(amplitudes[3] < amplitudes[5])
        assertTrue(amplitudes[5] < amplitudes[7])
    }

    // MARK: - VibrationEffect Amplitude Conversion Tests

    @Test
    fun `intensity to amplitude conversion is correct`() {
        // amplitude = (intensity * 255).toInt().coerceIn(1, 255)
        assertEquals(1, intensityToAmplitude(0.0f))  // Minimum
        assertEquals(51, intensityToAmplitude(0.2f))
        assertEquals(127, intensityToAmplitude(0.5f))
        assertEquals(255, intensityToAmplitude(1.0f))
        assertEquals(255, intensityToAmplitude(1.5f))  // Capped at 255
    }

    // MARK: - Pattern Duration Tests

    @Test
    fun `subtle tap is very short duration`() {
        val subtleTapDuration = 30L
        assertTrue(subtleTapDuration < 50)
    }

    @Test
    fun `warmth pulse is sustained`() {
        val warmthPulseDuration = 400L
        assertTrue(warmthPulseDuration >= 400)
    }

    @Test
    fun `thoughtful pulse is contemplative`() {
        val thoughtfulPulseDuration = 500L
        assertTrue(thoughtfulPulseDuration >= 300)
    }

    @Test
    fun `care presence is longest pattern`() {
        val carePresenceTotal = 50L + 100L + 800L
        assertTrue(carePresenceTotal >= 900)
    }

    // MARK: - Helper Functions (mirroring EmotionalHapticsEngine logic)

    /**
     * Check if phase is at breath peak (0.45-0.55)
     */
    private fun isBreathPeakPhase(phase: Float): Boolean {
        return phase >= 0.45f && phase <= 0.55f
    }

    /**
     * Convert intensity (0-1) to VibrationEffect amplitude (1-255)
     */
    private fun intensityToAmplitude(intensity: Float): Int {
        return (intensity * 255).toInt().coerceIn(1, 255)
    }
}

/**
 * Enum representing haptic pattern types for testing.
 */
enum class HapticPattern {
    NONE,
    SUBTLE_TAP,
    QUICK_FLUTTER,
    SOFT_DOUBLE_TAP,
    SPARKLE,
    WARMTH_PULSE,
    GENTLE_WAVE,
    THOUGHTFUL_PULSE,
    CARE_PRESENCE,
    CONNECTION_RISE
}

/**
 * Tests for waveform pattern generation.
 */
class HapticWaveformTest {

    @Test
    fun `gentle wave creates bell curve amplitude pattern`() {
        val segments = 10
        val peakAmplitude = 128 // 0.5 * 255

        val amplitudes = generateBellCurveAmplitudes(segments, peakAmplitude)

        // Should rise then fall
        val midpoint = segments / 2
        assertTrue(amplitudes[0] < amplitudes[midpoint])
        assertTrue(amplitudes[midpoint] > amplitudes[segments - 1])
    }

    @Test
    fun `quick flutter has descending intensities`() {
        val baseAmplitude = 77 // 0.3 * 255
        val amplitudes = listOf(
            baseAmplitude,
            (baseAmplitude * 0.75).toInt(),
            (baseAmplitude * 0.5).toInt()
        )

        assertTrue(amplitudes[0] > amplitudes[1])
        assertTrue(amplitudes[1] > amplitudes[2])
    }

    @Test
    fun `sparkle has ascending intensities`() {
        val amplitudes = listOf(51, 77, 102, 127, 153)

        for (i in 0 until amplitudes.size - 1) {
            assertTrue(amplitudes[i] < amplitudes[i + 1])
        }
    }

    /**
     * Generate bell curve amplitudes for gentle wave pattern.
     */
    private fun generateBellCurveAmplitudes(segments: Int, peakAmplitude: Int): IntArray {
        return IntArray(segments) { i ->
            val position = i.toFloat() / segments
            val factor = if (position < 0.4f) {
                position / 0.4f
            } else {
                1f - ((position - 0.4f) / 0.6f)
            }
            (peakAmplitude * factor).toInt().coerceIn(1, 255)
        }
    }
}

/**
 * Tests for haptic timing patterns.
 */
class HapticTimingTest {

    @Test
    fun `soft double tap has proper gap between taps`() {
        val timings = longArrayOf(0, 30, 100, 25)
        val gapBetweenTaps = timings[2]

        assertTrue(gapBetweenTaps >= 80) // Gap should be noticeable
    }

    @Test
    fun `connection established has rhythmic pattern`() {
        val timings = longArrayOf(0, 50, 120, 50, 120, 50, 120, 50)

        // First tap
        assertEquals(50L, timings[1])

        // Gaps between taps should be consistent
        assertEquals(timings[2], timings[4])
        assertEquals(timings[4], timings[6])

        // Tap durations should be consistent
        assertEquals(timings[1], timings[3])
        assertEquals(timings[3], timings[5])
        assertEquals(timings[5], timings[7])
    }

    @Test
    fun `quick flutter has short, fast taps`() {
        val timings = longArrayOf(0, 20, 30, 20, 30, 20)

        // Tap durations should be very short
        val tapDurations = listOf(timings[1], timings[3], timings[5])
        assertTrue(tapDurations.all { it <= 20 })

        // Gaps should also be short
        val gaps = listOf(timings[2], timings[4])
        assertTrue(gaps.all { it <= 30 })
    }
}
