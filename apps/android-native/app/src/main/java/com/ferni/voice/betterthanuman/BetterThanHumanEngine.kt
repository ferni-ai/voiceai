package com.ferni.voice.betterthanuman

import android.content.Context
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

/**
 * Better Than Human Engine
 *
 * Coordinates all five superhuman emotional intelligence capabilities.
 * This is what makes Ferni feel more present than any human friend.
 *
 * Capabilities:
 * 1. Micro-Expressions - 40-150ms subliminal emotional flashes
 * 2. Active Listening - Real-time visual feedback during user speech
 * 3. Breath Sync - Neural mirroring through breathing rhythm
 * 4. Concern Detection - Guardian presence for distress signals
 * 5. Anticipation - Predict emotions before fully expressed
 */
class BetterThanHumanEngine(
    context: Context,
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
) {

    // MARK: - Sub-Engines

    val activeListening = ActiveListeningEngine(scope)
    val microExpressions = MicroExpressionEngine(scope)
    val breathSync = BreathSyncEngine(scope)
    val anticipation = AnticipationEngine(scope)
    val haptics = EmotionalHapticsEngine(context)

    // MARK: - State

    private val _currentState = MutableStateFlow(BetterThanHumanState())
    val currentState: StateFlow<BetterThanHumanState> = _currentState.asStateFlow()

    private val _isUserSpeaking = MutableStateFlow(false)

    private val _speechPauseDurationMs = MutableStateFlow(0L)

    private val _audioLevel = MutableStateFlow(0f)

    // MARK: - Initialization

    init {
        setupBindings()
    }

    // MARK: - Setup

    private fun setupBindings() {
        // Active listening -> state updates + haptics
        scope.launch {
            activeListening.currentGesture.collect { gesture ->
                _currentState.update { it.copy(listeningGesture = gesture) }
                if (gesture != ListeningGesture.NONE) {
                    haptics.playListeningGesture(gesture)
                }
            }
        }

        // Micro-expressions -> state updates
        scope.launch {
            microExpressions.activeExpression.collect { expression ->
                _currentState.update { it.copy(microExpression = expression) }
            }
        }

        // Breath sync -> state updates
        scope.launch {
            breathSync.currentBreathPhase.collect { phase ->
                _currentState.update { it.copy(breathPhase = phase) }
            }
        }

        scope.launch {
            breathSync.syncedBreathRate.collect { rate ->
                _currentState.update { it.copy(breathRate = rate) }
            }
        }

        // Anticipation -> state updates
        scope.launch {
            anticipation.anticipatedEmotion.collect { emotion ->
                _currentState.update { it.copy(anticipatedEmotion = emotion) }
            }
        }

        // User speaking state -> active listening
        scope.launch {
            _isUserSpeaking.collect { speaking ->
                if (speaking) {
                    activeListening.startListening()
                } else {
                    activeListening.stopListening()
                }
            }
        }

        // Speech pause duration -> active listening
        scope.launch {
            _speechPauseDurationMs.collect { durationMs ->
                activeListening.updatePauseDuration(durationMs)
            }
        }

        // Audio level -> breath sync
        scope.launch {
            _audioLevel.collect { level ->
                breathSync.updateFromAudioLevel(level)
            }
        }
    }

    // MARK: - Public API

    /**
     * Set whether user is currently speaking
     */
    fun setUserSpeaking(speaking: Boolean) {
        _isUserSpeaking.value = speaking
    }

    /**
     * Update speech pause duration in milliseconds
     */
    fun updateSpeechPauseDuration(durationMs: Long) {
        _speechPauseDurationMs.value = durationMs
    }

    /**
     * Update audio level (0-1)
     */
    fun updateAudioLevel(level: Float) {
        _audioLevel.value = level
    }

    /**
     * Process partial transcript for anticipation
     */
    fun processPartialTranscript(text: String, tone: VoiceTone? = null) {
        anticipation.analyze(text, tone)
    }

    /**
     * Trigger a micro-expression (called from backend emotion events)
     */
    fun triggerMicroExpression(type: MicroExpressionType) {
        microExpressions.trigger(type)
        haptics.playMicroExpression(type)
    }

    /**
     * Signal concern detected from backend
     */
    fun signalConcern(level: ConcernLevel) {
        _currentState.update { it.copy(concernLevel = level) }
        haptics.playConcern(level)

        // Auto-clear after 2 seconds
        scope.launch {
            delay(2000)
            _currentState.update { it.copy(concernLevel = ConcernLevel.NONE) }
        }
    }

    /**
     * Called when connection is established
     */
    fun onConnectionEstablished() {
        breathSync.start()
        haptics.playConnectionEstablished()
    }

    /**
     * Called when connection ends
     */
    fun onConnectionEnded() {
        breathSync.stop()
        activeListening.stopListening()
        _currentState.value = BetterThanHumanState()
    }

    /**
     * Cleanup resources
     */
    fun destroy() {
        scope.cancel()
        breathSync.stop()
        activeListening.stopListening()
    }
}

/**
 * Unified state from all Better Than Human capabilities.
 *
 * This is the single source of truth for avatar emotional display.
 */
data class BetterThanHumanState(
    // Active listening
    val listeningGesture: ListeningGesture = ListeningGesture.NONE,

    // Micro-expressions
    val microExpression: MicroExpressionType? = null,

    // Breath sync
    val breathPhase: Float = 0f,
    val breathRate: Double = 6.0,  // Default idle rate

    // Anticipation
    val anticipatedEmotion: AnticipatedEmotion? = null,

    // Concern
    val concernLevel: ConcernLevel = ConcernLevel.NONE
) {
    /**
     * Whether any emotional state is currently active
     */
    val hasActiveState: Boolean
        get() = listeningGesture != ListeningGesture.NONE ||
                microExpression != null ||
                anticipatedEmotion != null ||
                concernLevel != ConcernLevel.NONE

    /**
     * Combined visual transform from all active states
     */
    val combinedTransform: CombinedTransform
        get() {
            var translateY = 0f
            var rotate = 0f
            var scale = 1f
            var warmth = 0f
            var shimmer = 0f

            // Add listening gesture transform
            if (listeningGesture != ListeningGesture.NONE) {
                translateY += listeningGesture.transform.translateY
                rotate += listeningGesture.transform.rotate
                scale *= listeningGesture.transform.scale
            }

            // Add micro-expression soul effects
            microExpression?.let { expr ->
                warmth += expr.soulEffect.warmthOpacity
                shimmer += expr.soulEffect.shimmerBoost
            }

            // Add anticipation visual
            anticipatedEmotion?.let { emotion ->
                translateY += emotion.visualShift.leanY
                warmth += emotion.visualShift.warmth
                shimmer += emotion.visualShift.shimmerBoost
            }

            // Add concern warmth
            when (concernLevel) {
                ConcernLevel.MILD -> warmth += 0.2f
                ConcernLevel.MODERATE -> warmth += 0.4f
                ConcernLevel.HIGH -> warmth += 0.6f
                ConcernLevel.NONE -> { /* no change */ }
            }

            return CombinedTransform(
                translateY = translateY,
                rotate = rotate,
                scale = scale,
                warmth = warmth.coerceIn(0f, 1f),
                shimmer = shimmer.coerceIn(-0.3f, 0.5f)
            )
        }
}

/**
 * Combined visual transform from all active emotional states.
 */
data class CombinedTransform(
    /** Vertical translation in dp */
    val translateY: Float = 0f,

    /** Rotation in degrees */
    val rotate: Float = 0f,

    /** Scale factor */
    val scale: Float = 1f,

    /** Warmth glow intensity (0-1) */
    val warmth: Float = 0f,

    /** Shimmer boost (-0.3 to 0.5) */
    val shimmer: Float = 0f
)
