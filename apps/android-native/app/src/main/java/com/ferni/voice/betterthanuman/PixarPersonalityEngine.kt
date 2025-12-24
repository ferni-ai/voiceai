package com.ferni.voice.betterthanuman

import com.ferni.voice.ui.animations.PixarTiming
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

/**
 * Pixar Personality Engine
 *
 * Implements Luxo Jr. style body language animations.
 * These are one-shot reactions that layer ON TOP of continuous breathing.
 *
 * Animation Principles (from Pixar's 12 Principles):
 * 1. Squash & Stretch - Gives weight and volume
 * 2. Anticipation - Preparation before action
 * 3. Follow-through - Settling after action
 *
 * The "reaction" transforms add to the breathing transforms,
 * creating layered, organic motion.
 */
class PixarPersonalityEngine(
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
) {

    // MARK: - State

    private val _currentReaction = MutableStateFlow(LampReaction())
    val currentReaction: StateFlow<LampReaction> = _currentReaction.asStateFlow()

    private val _activeAnimation = MutableStateFlow<LampAnimation?>(null)
    val activeAnimation: StateFlow<LampAnimation?> = _activeAnimation.asStateFlow()

    private var animationJob: Job? = null

    // MARK: - Animation Triggers

    /**
     * Trigger a nod animation (acknowledgment).
     * Pattern: anticipation (up) → action (down) → follow-through (settle)
     */
    fun triggerNod() {
        playAnimation(LampAnimation.NOD) {
            val durationMs = (PixarTiming.NOD_DURATION * 1000).toLong()

            // Phase 1: Anticipation - slight up (20% of duration)
            animateReaction(
                durationMs = (durationMs * 0.2).toLong(),
                to = LampReaction(
                    offsetY = -3f,
                    scale = 0.98f,
                    rotation = 0f
                )
            )

            // Phase 2: Action - nod down with rotation (40% of duration)
            animateReaction(
                durationMs = (durationMs * 0.4).toLong(),
                to = LampReaction(
                    offsetY = 4f,
                    scale = 1.02f,
                    rotation = 3f
                )
            )

            // Phase 3: Follow-through - settle back (40% of duration)
            animateReaction(
                durationMs = (durationMs * 0.4).toLong(),
                to = LampReaction()
            )
        }
    }

    /**
     * Trigger a curious tilt animation (WALL-E examining).
     */
    fun triggerTilt(direction: TiltDirection) {
        val sign = if (direction == TiltDirection.RIGHT) 1f else -1f

        playAnimation(LampAnimation.TILT) {
            val durationMs = (PixarTiming.TILT_DURATION * 1000).toLong()

            // Phase 1: Tilt with slight offset
            animateReaction(
                durationMs = (durationMs * 0.5).toLong(),
                to = LampReaction(
                    offsetX = 3f * sign,
                    rotation = 5f * sign
                )
            )

            // Phase 2: Hold briefly
            delay(durationMs / 4)

            // Phase 3: Return to neutral
            animateReaction(
                durationMs = (durationMs * 0.25).toLong(),
                to = LampReaction()
            )
        }
    }

    /**
     * Trigger an excited bounce (Luxo Jr. hopping).
     * Most complex animation with full squash/stretch cycle.
     */
    fun triggerBounce() {
        playAnimation(LampAnimation.BOUNCE) {
            val durationMs = (PixarTiming.BOUNCE_DURATION * 1000).toLong()

            // Phase 1: Anticipation - squash down (15% of duration)
            animateReaction(
                durationMs = (durationMs * 0.15).toLong(),
                to = LampReaction(
                    offsetY = 2f,
                    scale = 0.92f
                )
            )

            // Phase 2: Action - stretch up (35% of duration)
            animateReaction(
                durationMs = (durationMs * 0.35).toLong(),
                to = LampReaction(
                    offsetY = -12f,
                    scale = 1.08f
                )
            )

            // Phase 3: Land and squash (20% of duration)
            animateReaction(
                durationMs = (durationMs * 0.2).toLong(),
                to = LampReaction(
                    offsetY = 2f,
                    scale = 0.96f
                )
            )

            // Phase 4: Settle (30% of duration)
            animateReaction(
                durationMs = (durationMs * 0.3).toLong(),
                to = LampReaction()
            )
        }
    }

    /**
     * Trigger a multi-bounce (extra excited).
     */
    fun triggerMultiBounce() {
        scope.launch {
            triggerBounce()
            delay(400)
            triggerBounce()
        }
    }

    /**
     * Trigger a perk-up animation ("Aha!" moment).
     */
    fun triggerPerkUp() {
        playAnimation(LampAnimation.PERK_UP) {
            val durationMs = (PixarTiming.PERK_UP_DURATION * 1000).toLong()

            // Phase 1: Quick pop up
            animateReaction(
                durationMs = (durationMs * 0.6).toLong(),
                to = LampReaction(
                    offsetY = -5f,
                    scale = 1.05f
                )
            )

            // Phase 2: Settle back
            animateReaction(
                durationMs = (durationMs * 0.4).toLong(),
                to = LampReaction()
            )
        }
    }

    /**
     * Trigger a shake animation (disagreement or "no").
     */
    fun triggerShake() {
        playAnimation(LampAnimation.SHAKE) {
            // Quick left-right shake
            animateReaction(75, LampReaction(offsetX = -4f, rotation = -3f))
            animateReaction(75, LampReaction(offsetX = 4f, rotation = 3f))
            animateReaction(75, LampReaction(offsetX = -3f, rotation = -2f))
            animateReaction(75, LampReaction(offsetX = 3f, rotation = 2f))
            animateReaction(100, LampReaction())
        }
    }

    // MARK: - Emotion-Based Triggers

    /**
     * Trigger animation based on emotion hint from backend.
     */
    fun triggerForEmotion(emotion: EmotionReaction) {
        when (emotion.lampAnimation) {
            LampAnimation.NONE -> { /* no animation */ }
            LampAnimation.NOD -> triggerNod()
            LampAnimation.TILT -> triggerTilt(TiltDirection.RIGHT)
            LampAnimation.BOUNCE -> triggerBounce()
            LampAnimation.MULTI_BOUNCE -> triggerMultiBounce()
            LampAnimation.PERK_UP -> triggerPerkUp()
            LampAnimation.SHAKE -> triggerShake()
        }
    }

    // MARK: - Internal

    private fun playAnimation(animation: LampAnimation, block: suspend () -> Unit) {
        // Cancel any existing animation
        animationJob?.cancel()

        animationJob = scope.launch {
            _activeAnimation.value = animation
            try {
                block()
            } finally {
                _activeAnimation.value = null
            }
        }
    }

    private suspend fun animateReaction(durationMs: Long, to: LampReaction) {
        val startReaction = _currentReaction.value
        val steps = (durationMs / 16).toInt().coerceAtLeast(1) // ~60fps

        repeat(steps) { step ->
            val progress = (step + 1).toFloat() / steps
            // Use smooth ease-out curve
            val eased = 1f - (1f - progress) * (1f - progress)

            _currentReaction.value = LampReaction(
                offsetX = lerp(startReaction.offsetX, to.offsetX, eased),
                offsetY = lerp(startReaction.offsetY, to.offsetY, eased),
                scale = lerp(startReaction.scale, to.scale, eased),
                rotation = lerp(startReaction.rotation, to.rotation, eased)
            )
            delay(16)
        }
        _currentReaction.value = to
    }

    private fun lerp(start: Float, end: Float, fraction: Float): Float {
        return start + (end - start) * fraction
    }

    /**
     * Cancel any active animation and reset to neutral.
     */
    fun reset() {
        animationJob?.cancel()
        _currentReaction.value = LampReaction()
        _activeAnimation.value = null
    }
}

/**
 * One-shot reaction transform (adds to breathing).
 */
data class LampReaction(
    /** Horizontal offset in dp */
    val offsetX: Float = 0f,

    /** Vertical offset in dp */
    val offsetY: Float = 0f,

    /** Scale factor (1.0 = no change) */
    val scale: Float = 1f,

    /** Rotation in degrees */
    val rotation: Float = 0f
) {
    val isNeutral: Boolean
        get() = offsetX == 0f && offsetY == 0f && scale == 1f && rotation == 0f
}

/**
 * Available lamp animations.
 */
enum class LampAnimation {
    NONE,
    NOD,
    TILT,
    BOUNCE,
    MULTI_BOUNCE,
    PERK_UP,
    SHAKE
}

/**
 * Tilt direction.
 */
enum class TiltDirection {
    LEFT, RIGHT
}

/**
 * Emotion reaction mapping.
 * Maps backend emotion hints to lamp animations.
 */
data class EmotionReaction(
    val emotionHint: String,
    val lampAnimation: LampAnimation
) {
    companion object {
        fun fromHint(hint: String): EmotionReaction {
            val animation = when (hint.lowercase()) {
                "happy" -> LampAnimation.BOUNCE
                "excited" -> LampAnimation.MULTI_BOUNCE
                "curious" -> LampAnimation.TILT
                "thinking" -> LampAnimation.TILT
                "empathetic" -> LampAnimation.NOD
                "encouraging" -> LampAnimation.PERK_UP
                "neutral", "calm" -> LampAnimation.NONE
                else -> LampAnimation.NONE
            }
            return EmotionReaction(hint, animation)
        }
    }
}
