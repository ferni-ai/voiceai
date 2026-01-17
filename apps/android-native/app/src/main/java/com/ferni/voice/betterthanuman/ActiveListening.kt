package com.ferni.voice.betterthanuman

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Active Listening Engine
 *
 * Provides real-time visual feedback during user speech.
 * Creates the rhythm of natural conversation - users feel heard moment-to-moment.
 *
 * Signal mapping (from BETTER-THAN-HUMAN.md):
 * - Micro-Nod: 300-800ms pauses (barely perceptible 1.5px)
 * - Subtle Nod: 800-1500ms pauses (visible 2.5px)
 * - Visible Nod: 1500ms+ pauses (full 4px)
 * - Listening Lean: Emphasis points (-3px forward)
 */
class ActiveListeningEngine(
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.Main)
) {

    // MARK: - State

    private val _isListening = MutableStateFlow(false)
    val isListening: StateFlow<Boolean> = _isListening.asStateFlow()

    private val _currentGesture = MutableStateFlow(ListeningGesture.NONE)
    val currentGesture: StateFlow<ListeningGesture> = _currentGesture.asStateFlow()

    // MARK: - Configuration

    private object Thresholds {
        const val MICRO_NOD_MIN_MS = 300L    // 300ms
        const val MICRO_NOD_MAX_MS = 800L    // 800ms
        const val SUBTLE_NOD_MIN_MS = 800L   // 800ms
        const val SUBTLE_NOD_MAX_MS = 1500L  // 1500ms
        const val VISIBLE_NOD_MIN_MS = 1500L // 1500ms+
        const val CONTEMPLATIVE_MIN_MS = 2500L // 2500ms+
    }

    private object Timing {
        const val MICRO_NOD_DURATION_MS = 180L
        const val SUBTLE_NOD_DURATION_MS = 220L
        const val VISIBLE_NOD_DURATION_MS = 280L
        const val LEAN_DURATION_MS = 400L
        const val GESTURE_COOLDOWN_MS = 500L  // Prevent rapid-fire gestures
    }

    // MARK: - Private State

    private var lastGestureTimeMs: Long = 0
    private var currentPauseDurationMs: Long = 0
    private var gestureResetJob: Job? = null

    // MARK: - Public API

    /**
     * Start active listening mode
     */
    fun startListening() {
        _isListening.value = true
        currentPauseDurationMs = 0
    }

    /**
     * Stop active listening mode
     */
    fun stopListening() {
        _isListening.value = false
        _currentGesture.value = ListeningGesture.NONE
        currentPauseDurationMs = 0
        gestureResetJob?.cancel()
    }

    /**
     * Update with current pause duration in milliseconds (called continuously during speech)
     */
    fun updatePauseDuration(durationMs: Long) {
        if (!_isListening.value) return

        val previousDurationMs = currentPauseDurationMs
        currentPauseDurationMs = durationMs

        // Check for gesture triggers at threshold crossings
        checkGestureTriggers(previousDurationMs, durationMs)
    }

    /**
     * Trigger a listening lean (for emphasis points detected from tone)
     */
    fun triggerLean() {
        if (!_isListening.value) return
        triggerGesture(ListeningGesture.LISTENING_LEAN)
    }

    // MARK: - Gesture Logic

    private fun checkGestureTriggers(previousMs: Long, currentMs: Long) {
        // Prevent rapid-fire gestures
        val now = System.currentTimeMillis()
        if (now - lastGestureTimeMs < Timing.GESTURE_COOLDOWN_MS) return

        // Trigger on threshold crossings (not continuously)
        when {
            previousMs < Thresholds.MICRO_NOD_MIN_MS &&
                    currentMs >= Thresholds.MICRO_NOD_MIN_MS &&
                    currentMs < Thresholds.SUBTLE_NOD_MIN_MS -> {
                triggerGesture(ListeningGesture.MICRO_NOD)
            }
            previousMs < Thresholds.SUBTLE_NOD_MIN_MS &&
                    currentMs >= Thresholds.SUBTLE_NOD_MIN_MS &&
                    currentMs < Thresholds.VISIBLE_NOD_MIN_MS -> {
                triggerGesture(ListeningGesture.SUBTLE_NOD)
            }
            previousMs < Thresholds.VISIBLE_NOD_MIN_MS &&
                    currentMs >= Thresholds.VISIBLE_NOD_MIN_MS &&
                    currentMs < Thresholds.CONTEMPLATIVE_MIN_MS -> {
                triggerGesture(ListeningGesture.VISIBLE_NOD)
            }
            previousMs < Thresholds.CONTEMPLATIVE_MIN_MS &&
                    currentMs >= Thresholds.CONTEMPLATIVE_MIN_MS -> {
                triggerGesture(ListeningGesture.CONTEMPLATIVE)
            }
        }
    }

    private fun triggerGesture(gesture: ListeningGesture) {
        lastGestureTimeMs = System.currentTimeMillis()
        _currentGesture.value = gesture

        // Auto-reset after gesture duration
        gestureResetJob?.cancel()
        gestureResetJob = scope.launch {
            delay(gesture.durationMs)
            _currentGesture.value = ListeningGesture.NONE
        }
    }
}

/**
 * Listening Gestures
 *
 * Visual gestures that show Ferni is actively engaged while user speaks.
 */
enum class ListeningGesture(
    /** Duration in milliseconds */
    val durationMs: Long,
    /** Transform values for this gesture */
    val transform: ListeningTransform
) {
    NONE(
        durationMs = 0,
        transform = ListeningTransform()
    ),

    /**
     * Barely perceptible (1.5px) - 300-800ms pauses
     */
    MICRO_NOD(
        durationMs = 180,
        transform = ListeningTransform(translateY = 1.5f, rotate = 0.3f, scale = 0.998f)
    ),

    /**
     * Visible (2.5px) - 800-1500ms pauses
     */
    SUBTLE_NOD(
        durationMs = 220,
        transform = ListeningTransform(translateY = 2.5f, rotate = 0.5f, scale = 0.996f)
    ),

    /**
     * Full nod (4px) - 1500ms+ pauses
     */
    VISIBLE_NOD(
        durationMs = 280,
        transform = ListeningTransform(translateY = 4.0f, rotate = 0.8f, scale = 0.994f)
    ),

    /**
     * Forward lean (-3px y) - emphasis points
     */
    LISTENING_LEAN(
        durationMs = 400,
        transform = ListeningTransform(translateY = -3.0f, rotate = 0f, scale = 1.01f)
    ),

    /**
     * Thoughtful expression shift - 2500ms+ pauses
     */
    CONTEMPLATIVE(
        durationMs = 400,
        transform = ListeningTransform(translateY = -1.5f, rotate = -0.3f, scale = 1.005f)
    );

    /**
     * Duration in seconds for animation compatibility
     */
    val durationSeconds: Float
        get() = durationMs / 1000f
}

/**
 * Transform values for listening gestures.
 */
data class ListeningTransform(
    /** Vertical translation in dp (positive = down, negative = forward/up) */
    val translateY: Float = 0f,

    /** Rotation in degrees */
    val rotate: Float = 0f,

    /** Scale factor */
    val scale: Float = 1.0f
)
