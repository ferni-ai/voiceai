package com.ferni.voice.betterthanuman

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.annotation.RequiresApi

/**
 * Emotional Haptics Engine
 *
 * Android implementation using VibrationEffect API for tactile emotional feedback.
 * Makes Ferni's emotions TANGIBLE - something web can never do.
 *
 * Haptic patterns:
 * - Listening nods: Subtle taps that say "I hear you"
 * - Micro-expressions: Brief texture shifts
 * - Warmth: Gentle sine wave pulses
 * - Concern: Soft double-tap
 * - Breath sync: Rhythmic pattern matching avatar breathing
 *
 * Note: Requires API 26+ (Android 8.0) for VibrationEffect.
 * Fallback to legacy vibration for older devices.
 */
class EmotionalHapticsEngine(context: Context) {

    private val vibrator: Vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
        vibratorManager.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }

    private val hasVibrator: Boolean = vibrator.hasVibrator()

    private val hasAmplitudeControl: Boolean = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator.hasAmplitudeControl()
    } else {
        false
    }

    // MARK: - Listening Gestures

    /**
     * Play haptic for active listening gesture
     */
    fun playListeningGesture(gesture: ListeningGesture) {
        if (!hasVibrator) return

        when (gesture) {
            ListeningGesture.NONE -> { /* No haptic */ }
            ListeningGesture.MICRO_NOD -> playSubtleTap(intensity = 0.2f)
            ListeningGesture.SUBTLE_NOD -> playSubtleTap(intensity = 0.35f)
            ListeningGesture.VISIBLE_NOD -> playSubtleTap(intensity = 0.5f)
            ListeningGesture.LISTENING_LEAN -> playGentleWave(durationMs = 300, intensity = 0.3f)
            ListeningGesture.CONTEMPLATIVE -> playThoughtfulPulse()
        }
    }

    // MARK: - Micro-Expressions

    /**
     * Play haptic for micro-expression
     */
    fun playMicroExpression(type: MicroExpressionType) {
        if (!hasVibrator) return

        when (type) {
            MicroExpressionType.RECOGNITION -> playQuickFlutter(intensity = 0.25f)
            MicroExpressionType.CONCERN -> playSoftDoubleTap()
            MicroExpressionType.DELIGHT -> playSparkle()
            MicroExpressionType.WARMTH -> playWarmthPulse()
            MicroExpressionType.INTEREST -> playQuickFlutter(intensity = 0.3f)
        }
    }

    // MARK: - Concern

    /**
     * Play haptic for concern detection
     */
    fun playConcern(level: ConcernLevel) {
        if (!hasVibrator) return

        when (level) {
            ConcernLevel.NONE -> { /* No haptic */ }
            ConcernLevel.MILD -> playSoftDoubleTap()
            ConcernLevel.MODERATE -> playGentleWave(durationMs = 500, intensity = 0.4f)
            ConcernLevel.HIGH -> playCarePresence()
        }
    }

    // MARK: - Connection Events

    /**
     * Play haptic for connection established
     */
    fun playConnectionEstablished() {
        if (!hasVibrator) return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && hasAmplitudeControl) {
            // Warm rising pattern - 4 taps with increasing intensity
            val timings = longArrayOf(0, 50, 120, 50, 120, 50, 120, 50)
            val amplitudes = intArrayOf(0, 50, 0, 100, 0, 150, 0, 200)
            val effect = VibrationEffect.createWaveform(timings, amplitudes, -1)
            vibrator.vibrate(effect)
        } else {
            // Fallback: simple double vibration
            @Suppress("DEPRECATION")
            vibrator.vibrate(longArrayOf(0, 100, 100, 200), -1)
        }
    }

    // MARK: - Breath Sync

    /**
     * Play breath sync haptic pulse.
     * Only pulses at peak of breath (phase ~0.5).
     */
    fun playBreathPulse(phase: Float, intensity: Float = 0.15f) {
        if (!hasVibrator) return

        // Only pulse at peak of breath (phase ~0.5)
        if (phase < 0.45f || phase > 0.55f) return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && hasAmplitudeControl) {
            val amplitude = (intensity * 255).toInt().coerceIn(1, 255)
            val effect = VibrationEffect.createOneShot(300, amplitude)
            vibrator.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(100)
        }
    }

    // MARK: - Pattern Implementations

    private fun playSubtleTap(intensity: Float) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && hasAmplitudeControl) {
            val amplitude = (intensity * 255).toInt().coerceIn(1, 255)
            val effect = VibrationEffect.createOneShot(30, amplitude)
            vibrator.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(20)
        }
    }

    private fun playQuickFlutter(intensity: Float) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && hasAmplitudeControl) {
            // Quick ascending flutter - 3 taps with decreasing intensity
            val baseAmplitude = (intensity * 255).toInt().coerceIn(1, 255)
            val timings = longArrayOf(0, 20, 30, 20, 30, 20)
            val amplitudes = intArrayOf(
                0,
                baseAmplitude,
                0,
                (baseAmplitude * 0.75).toInt(),
                0,
                (baseAmplitude * 0.5).toInt()
            )
            val effect = VibrationEffect.createWaveform(timings, amplitudes, -1)
            vibrator.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(longArrayOf(0, 20, 30, 20, 30, 20), -1)
        }
    }

    private fun playSoftDoubleTap() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && hasAmplitudeControl) {
            val timings = longArrayOf(0, 30, 100, 25)
            val amplitudes = intArrayOf(0, 77, 0, 64) // 0.3 * 255, 0.25 * 255
            val effect = VibrationEffect.createWaveform(timings, amplitudes, -1)
            vibrator.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(longArrayOf(0, 30, 100, 25), -1)
        }
    }

    private fun playSparkle() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && hasAmplitudeControl) {
            // Quick ascending sparkle - 5 taps with increasing intensity
            val timings = longArrayOf(0, 20, 40, 20, 40, 20, 40, 20, 40, 20)
            val amplitudes = intArrayOf(0, 51, 0, 77, 0, 102, 0, 127, 0, 153)
            val effect = VibrationEffect.createWaveform(timings, amplitudes, -1)
            vibrator.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(longArrayOf(0, 20, 40, 20, 40, 20, 40, 20, 40, 20), -1)
        }
    }

    private fun playWarmthPulse() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && hasAmplitudeControl) {
            // Continuous gentle pulse
            val effect = VibrationEffect.createOneShot(400, 89) // 0.35 * 255
            vibrator.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(400)
        }
    }

    private fun playGentleWave(durationMs: Long, intensity: Float) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && hasAmplitudeControl) {
            // Simulate wave with ramping amplitude
            val segments = 10
            val segmentDuration = durationMs / segments
            val timings = LongArray(segments * 2) { i ->
                if (i % 2 == 0) 0 else segmentDuration
            }

            val peakAmplitude = (intensity * 255).toInt().coerceIn(1, 255)
            val amplitudes = IntArray(segments * 2) { i ->
                if (i % 2 == 0) {
                    0
                } else {
                    // Bell curve: rise then fall
                    val position = (i / 2).toFloat() / segments
                    val factor = if (position < 0.4f) {
                        position / 0.4f
                    } else {
                        1f - ((position - 0.4f) / 0.6f)
                    }
                    (peakAmplitude * factor).toInt().coerceIn(1, 255)
                }
            }

            val effect = VibrationEffect.createWaveform(timings, amplitudes, -1)
            vibrator.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(durationMs)
        }
    }

    private fun playThoughtfulPulse() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && hasAmplitudeControl) {
            // Slow, gentle wave that feels contemplative
            val effect = VibrationEffect.createOneShot(500, 64) // 0.25 * 255
            vibrator.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(300)
        }
    }

    private fun playCarePresence() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && hasAmplitudeControl) {
            // Sustained gentle presence - "I'm here with you"
            // Initial soft touch followed by sustained warmth
            val timings = longArrayOf(0, 50, 100, 800)
            val amplitudes = intArrayOf(0, 102, 0, 77) // 0.4 * 255, 0.3 * 255
            val effect = VibrationEffect.createWaveform(timings, amplitudes, -1)
            vibrator.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(longArrayOf(0, 50, 100, 500), -1)
        }
    }
}
