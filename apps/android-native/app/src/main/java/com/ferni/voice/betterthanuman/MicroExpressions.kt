package com.ferni.voice.betterthanuman

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Micro-Expression Engine
 *
 * Manages subliminal emotional flashes lasting 40-150ms.
 * These are below conscious perception but affect how users FEEL about Ferni's authenticity.
 *
 * From BETTER-THAN-HUMAN.md:
 * - Recognition: 80ms - User mentions familiar topic
 * - Concern Flash: 60ms - Before empathy kicks in
 * - Delight Flash: 100ms - User achieves something
 * - Warmth Pulse: 120ms - Connection moments
 * - Interest Flash: 70ms - Unexpected content
 */
class MicroExpressionEngine(
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.Main)
) {

    // MARK: - State

    private val _activeExpression = MutableStateFlow<MicroExpressionType?>(null)
    val activeExpression: StateFlow<MicroExpressionType?> = _activeExpression.asStateFlow()

    private val _expressionIntensity = MutableStateFlow(0f)
    val expressionIntensity: StateFlow<Float> = _expressionIntensity.asStateFlow()

    private var resetJob: Job? = null

    // MARK: - Public API

    /**
     * Trigger a micro-expression.
     * @param type The type of micro-expression to display
     */
    fun trigger(type: MicroExpressionType) {
        // Cancel any pending reset
        resetJob?.cancel()

        // Set expression immediately
        _activeExpression.value = type
        _expressionIntensity.value = type.intensity

        // Schedule reset after expression duration
        resetJob = scope.launch {
            delay(type.durationMs)
            reset()
        }
    }

    /**
     * Reset to neutral state
     */
    private suspend fun reset() {
        // Quick fade out (half the trigger duration)
        val fadeOutDuration = (_activeExpression.value?.durationMs ?: 80L) / 2

        // Animate intensity to 0
        val startIntensity = _expressionIntensity.value
        val steps = 10
        val stepDelay = fadeOutDuration / steps

        for (i in steps downTo 0) {
            _expressionIntensity.value = startIntensity * (i.toFloat() / steps)
            delay(stepDelay)
        }

        // Clear expression after fade
        delay(50)
        _activeExpression.value = null
    }

    /**
     * Clear any active expression immediately
     */
    fun clear() {
        resetJob?.cancel()
        _activeExpression.value = null
        _expressionIntensity.value = 0f
    }
}

/**
 * Micro-Expression Types
 *
 * Each type has specific timing (subliminal: 40-150ms) and visual effects
 * that make Ferni feel emotionally present without being consciously noticed.
 */
enum class MicroExpressionType(
    /** Duration in milliseconds (subliminal: 40-150ms) */
    val durationMs: Long,
    /** Visual intensity (0-1) */
    val intensity: Float,
    /** Effect on the avatar soul/glow */
    val soulEffect: MicroSoulEffect
) {
    /**
     * User mentions familiar topic - 80ms
     */
    RECOGNITION(
        durationMs = 80,
        intensity = 0.4f,
        soulEffect = MicroSoulEffect(warmthOpacity = 0.3f, sparkOpacity = 0.4f, shimmerBoost = 0f)
    ),

    /**
     * Before empathy kicks in - 60ms
     */
    CONCERN(
        durationMs = 60,
        intensity = 0.3f,
        soulEffect = MicroSoulEffect(warmthOpacity = 0.2f, sparkOpacity = 0f, shimmerBoost = -0.1f)
    ),

    /**
     * User achieves something - 100ms
     */
    DELIGHT(
        durationMs = 100,
        intensity = 0.6f,
        soulEffect = MicroSoulEffect(warmthOpacity = 0.4f, sparkOpacity = 0.6f, shimmerBoost = 0.2f)
    ),

    /**
     * Connection moments - 120ms
     */
    WARMTH(
        durationMs = 120,
        intensity = 0.5f,
        soulEffect = MicroSoulEffect(warmthOpacity = 0.5f, sparkOpacity = 0.2f, shimmerBoost = 0.1f)
    ),

    /**
     * Unexpected content - 70ms
     */
    INTEREST(
        durationMs = 70,
        intensity = 0.35f,
        soulEffect = MicroSoulEffect(warmthOpacity = 0.1f, sparkOpacity = 0.3f, shimmerBoost = 0.15f)
    );

    /**
     * Duration in seconds for animation compatibility
     */
    val durationSeconds: Float
        get() = durationMs / 1000f
}

/**
 * Visual effect values to apply to the avatar's soul/glow layers.
 */
data class MicroSoulEffect(
    /** Warmth glow opacity boost (0-1) */
    val warmthOpacity: Float = 0f,

    /** Memory spark opacity (0-1) */
    val sparkOpacity: Float = 0f,

    /** Shimmer intensity boost (-0.2 to 0.3) */
    val shimmerBoost: Float = 0f
)
