package com.ferni.voice.ui.animations

import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.FastOutSlowInEasing
import kotlin.math.pow
import kotlin.math.PI

/**
 * Pixar-quality animation timing constants.
 * Based on Luxo Jr. animation principles and design-system/tokens/animation.json
 */
object PixarTiming {
    // Breathing cycles (in seconds for math, convert to ms when needed)
    const val BREATH_CYCLE_IDLE = 6.0        // 6s - slow, contemplative
    const val BREATH_CYCLE_ACTIVE = 5.0      // 5s - normal connection
    const val BREATH_CYCLE_SPEAKING = 4.5    // 4.5s - engaged

    // Reaction durations (seconds)
    const val NOD_DURATION = 0.28            // Quick ack
    const val TILT_DURATION = 0.4            // Curious lean
    const val BOUNCE_DURATION = 0.6          // Full hop
    const val PERK_UP_DURATION = 0.3         // "Aha!" moment

    // Glow cycles (seconds)
    const val HEARTBEAT_CYCLE = 1.8          // 1.8s - ~66 BPM resting heart rate
    const val HALO_OUTER_CYCLE = 8.0         // 8s - slow ambient
    const val HALO_INNER_CYCLE = 5.0         // 5s - synced with avatar
    const val HALO_PULSE_EXPAND = 1.2        // 1.2s expansion time

    // Soul effects (seconds)
    const val SHIMMER_CYCLE = 2.0            // 2s iris shimmer
    const val WARMTH_BLOOM = 0.6             // 600ms connection moment
    const val MEMORY_SPARK = 0.3             // Recognition flash
    const val MICRO_EXPRESSION = 0.08        // 80ms subliminal flash

    // Audio wave
    const val WAVE_RING_SEGMENTS = 64
}

/**
 * Squash/stretch values for body language.
 */
object BodyValues {
    // Idle breathing
    object Idle {
        const val SCALE_Y = 1.012f
        const val SCALE_X = 0.994f
        const val TRANSLATE_Y = -1.5f
        const val ROTATION = 0.3f
    }

    // Active state
    object Active {
        const val SCALE_Y = 1.018f
        const val SCALE_X = 0.991f
        const val TRANSLATE_Y = -2f
        const val ROTATION = 0.5f
    }

    // Speaking state
    object Speaking {
        const val SCALE_Y = 1.025f
        const val SCALE_X = 0.988f
        const val TRANSLATE_Y = -3f
        const val ROTATION = 0.7f
    }
}

/**
 * Custom easing functions for organic motion.
 */
object PixarEasing {
    // Spring-like bounce
    val spring: Easing = Easing { fraction ->
        val c4 = (2 * Math.PI) / 3
        if (fraction == 0f) 0f
        else if (fraction == 1f) 1f
        else (2.0.pow(-10.0 * fraction) * kotlin.math.sin((fraction * 10 - 0.75) * c4) + 1).toFloat()
    }

    // Smooth ease out
    val smoothOut: Easing = FastOutSlowInEasing

    // Anticipation curve (slight pullback before action)
    val anticipation: Easing = Easing { fraction ->
        val c1 = 1.70158f
        val c3 = c1 + 1
        c3 * fraction.pow(3) - c1 * fraction.pow(2)
    }
}

/**
 * Wave ring animation parameters.
 */
object WaveParams {
    const val BASE_AMPLITUDE = 0.15f
    const val MAX_AMPLITUDE = 0.4f
    const val WAVE_SPEED = 2.0f
    const val PHASE_OFFSET = 0.1f
}
