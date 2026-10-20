package com.ferni.voice.models

/**
 * Represents the current state of the voice session.
 */
sealed class VoiceState {
    data object Disconnected : VoiceState()
    data object Connecting : VoiceState()
    data object Connected : VoiceState()
    data object Listening : VoiceState()
    data object Speaking : VoiceState()
    data object Thinking : VoiceState()
    data class Error(val message: String) : VoiceState()

    /** User-friendly title for the state */
    val title: String
        get() = when (this) {
            is Disconnected -> "Ready"
            is Connecting -> "Connecting..."
            is Connected -> "Connected"
            is Listening -> "Listening"
            is Speaking -> "Speaking"
            is Thinking -> "Thinking"
            is Error -> "Connection Issue"
        }

    /** Whether the session is active (not disconnected or error) */
    val isActive: Boolean
        get() = when (this) {
            is Disconnected, is Error -> false
            else -> true
        }

    /** Whether audio visualization should be shown */
    val showWaveform: Boolean
        get() = when (this) {
            is Connected, is Listening, is Speaking -> true
            else -> false
        }

    /**
     * Breathing animation intensity multiplier.
     * All active states use same intensity - no listening/speaking distinction.
     */
    val breathingIntensity: Float
        get() = when (this) {
            is Connected, is Listening, is Speaking -> 1.0f
            is Thinking -> 0.8f
            else -> 0.6f
        }
}

/**
 * Events emitted during voice session.
 */
sealed class VoiceEvent {
    data class StateChanged(val state: VoiceState) : VoiceEvent()
    data class Transcription(
        val text: String,
        val isAgent: Boolean,
        val isFinal: Boolean
    ) : VoiceEvent()
    data class Handoff(val from: String, val to: String) : VoiceEvent()
    data class AudioLevel(val level: Float) : VoiceEvent()
    data class ErrorEvent(val error: Throwable) : VoiceEvent()
}

/**
 * Emotion hints for avatar expressions.
 *
 * These values come from the backend and are used by:
 * - LiveKitSession: parses emotion_event data messages
 * - VoiceViewModel: maps hints to personality animations + micro-expressions
 * - BetterThanHumanEngine: displays emotional state in avatar
 */
enum class EmotionHint {
    HAPPY,
    EXCITED,
    CURIOUS,
    EMPATHETIC,
    ENCOURAGING,
    NEUTRAL,
    THINKING,  // Contemplative, processing state
    CALM       // Peaceful, relaxed state
}
