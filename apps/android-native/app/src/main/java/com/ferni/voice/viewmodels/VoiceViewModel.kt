package com.ferni.voice.viewmodels

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ferni.voice.betterthanuman.BetterThanHumanEngine
import com.ferni.voice.betterthanuman.BetterThanHumanState
import com.ferni.voice.betterthanuman.ConcernLevel
import com.ferni.voice.betterthanuman.MicroExpressionType
import com.ferni.voice.models.EmotionHint
import com.ferni.voice.models.VoiceState
import com.ferni.voice.services.LiveKitSession
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

/**
 * VoiceViewModel - Connects LiveKitSession with BetterThanHumanEngine
 *
 * This ViewModel bridges:
 * - LiveKitSession: Voice connection, transcription, data messages
 * - BetterThanHumanEngine: Emotional intelligence, micro-expressions, breath sync
 *
 * Data flow:
 * ```
 * LiveKitSession                    VoiceViewModel                    VoiceOrb
 *      │                                  │                              │
 *      ├─ emotionEvents ────────────────> triggerEmotionReaction() ────> avatar animations
 *      ├─ voiceState ───────────────────> betterThanHumanState ────────> breathing, soul effects
 *      ├─ transcriptMessages ───────────> processPartialTranscript() ──> anticipation
 *      └─ data (humanization_signal) ───> handleHumanizationSignal() ──> micro-expressions
 * ```
 */
class VoiceViewModel(application: Application) : AndroidViewModel(application) {

    // MARK: - Dependencies

    val liveKitSession = LiveKitSession(application.applicationContext)
    val betterThanHumanEngine = BetterThanHumanEngine(
        context = application.applicationContext,
        scope = viewModelScope
    )

    // MARK: - Public State

    /** Current Better Than Human state for VoiceOrb rendering */
    val betterThanHumanState: StateFlow<BetterThanHumanState> =
        betterThanHumanEngine.currentState

    /** Current voice connection state */
    val voiceState: StateFlow<VoiceState> =
        liveKitSession.voiceState

    /** Current persona ID */
    val currentPersonaId: StateFlow<String> =
        liveKitSession.currentPersonaId

    /** Is microphone muted */
    val isMuted: StateFlow<Boolean> =
        liveKitSession.isMuted

    /** Connection progress message */
    val connectionProgress: StateFlow<String> =
        liveKitSession.connectionProgress

    /** Audio level for VoiceOrb (0-1) */
    private val _audioLevel = MutableStateFlow(0f)
    val audioLevel: StateFlow<Float> = _audioLevel.asStateFlow()

    // MARK: - Initialization

    init {
        setupBindings()
    }

    // MARK: - Private Setup

    private fun setupBindings() {
        // Emotion events → BetterThanHumanEngine reactions
        viewModelScope.launch {
            liveKitSession.emotionEvents.collect { emotionHint ->
                handleEmotionHint(emotionHint)
            }
        }

        // Voice state changes → BetterThanHumanEngine lifecycle
        viewModelScope.launch {
            liveKitSession.voiceState.collect { state ->
                when (state) {
                    is VoiceState.Connected -> {
                        betterThanHumanEngine.onConnectionEstablished()
                    }
                    is VoiceState.Disconnected, is VoiceState.Error -> {
                        betterThanHumanEngine.onConnectionEnded()
                    }
                    else -> { /* no action */ }
                }
            }
        }

        // Transcript changes → Anticipation analysis
        viewModelScope.launch {
            liveKitSession.transcriptMessages.collect { messages ->
                // Analyze the latest user message for anticipation
                val lastUserMessage = messages.lastOrNull { !it.isAgent }
                lastUserMessage?.let {
                    betterThanHumanEngine.processPartialTranscript(it.text)
                }
            }
        }

        // Humanization signals → Better Than Human capabilities
        viewModelScope.launch {
            liveKitSession.humanizationSignals.collect { signal ->
                handleHumanizationSignal(signal.signalType, signal.payload)
            }
        }

        // Remote audio level → VoiceOrb visualization
        viewModelScope.launch {
            liveKitSession.remoteAudioLevel.collect { level ->
                updateAudioLevel(level)
            }
        }

        // User speaking state → Active listening gestures
        viewModelScope.launch {
            liveKitSession.isUserSpeaking.collect { speaking ->
                if (speaking) {
                    betterThanHumanEngine.setUserSpeaking(true)
                } else {
                    betterThanHumanEngine.setUserSpeaking(false)
                }
            }
        }
    }

    // MARK: - Emotion Handling

    /**
     * Handle emotion hint from backend.
     * Maps EmotionHint to:
     * 1. Personality animation (nod, bounce, etc.)
     * 2. Micro-expression (subliminal flash)
     */
    private fun handleEmotionHint(hint: EmotionHint) {
        // Trigger personality animation
        betterThanHumanEngine.triggerEmotionReaction(hint.name.lowercase())

        // Trigger appropriate micro-expression
        val microExpression = when (hint) {
            EmotionHint.HAPPY -> MicroExpressionType.DELIGHT
            EmotionHint.EXCITED -> MicroExpressionType.DELIGHT
            EmotionHint.CURIOUS -> MicroExpressionType.INTEREST
            EmotionHint.EMPATHETIC -> MicroExpressionType.WARMTH
            EmotionHint.ENCOURAGING -> MicroExpressionType.RECOGNITION
            EmotionHint.NEUTRAL, EmotionHint.THINKING, EmotionHint.CALM -> null
        }

        microExpression?.let {
            betterThanHumanEngine.triggerMicroExpression(it)
        }
    }

    // MARK: - Humanization Signal (Better Than Human Backend)

    /**
     * Handle humanization_signal data message from backend.
     * Called when LiveKitSession receives a "humanization_signal" type message.
     *
     * Signal types:
     * - concern_detected: User distress detected
     * - voice_state_detected: Voice strain/emotion detected
     * - emotional_trajectory: Predicted emotional direction
     * - micro_expression_trigger: Direct micro-expression command
     */
    fun handleHumanizationSignal(signalType: String, payload: Map<String, Any>) {
        when (signalType) {
            "concern_detected" -> {
                val level = when (payload["level"]?.toString()) {
                    "high" -> ConcernLevel.HIGH
                    "moderate" -> ConcernLevel.MODERATE
                    "mild" -> ConcernLevel.MILD
                    else -> ConcernLevel.NONE
                }
                betterThanHumanEngine.signalConcern(level)
            }

            "voice_state_detected" -> {
                val voiceTone = payload["tone"]?.toString()
                val strain = (payload["strain"] as? Number)?.toFloat() ?: 0f

                // High strain → show concern
                if (strain > 0.6f) {
                    betterThanHumanEngine.signalConcern(ConcernLevel.MILD)
                }
            }

            "emotional_trajectory" -> {
                val predicted = payload["predicted"]?.toString()
                predicted?.let {
                    betterThanHumanEngine.triggerEmotionReaction(it)
                }
            }

            "micro_expression_trigger" -> {
                val expression = when (payload["expression"]?.toString()) {
                    "recognition" -> MicroExpressionType.RECOGNITION
                    "concern" -> MicroExpressionType.CONCERN
                    "delight" -> MicroExpressionType.DELIGHT
                    "warmth" -> MicroExpressionType.WARMTH
                    "interest" -> MicroExpressionType.INTEREST
                    else -> null
                }
                expression?.let {
                    betterThanHumanEngine.triggerMicroExpression(it)
                }
            }
        }
    }

    // MARK: - Audio Level Updates

    /**
     * Update audio level from LiveKit audio track.
     * Called by audio processor when real audio levels are available.
     */
    fun updateAudioLevel(level: Float) {
        _audioLevel.value = level.coerceIn(0f, 1f)
        betterThanHumanEngine.updateAudioLevel(level)
    }

    // MARK: - User Speech State

    /**
     * Called when user starts speaking.
     */
    fun onUserSpeechStart() {
        betterThanHumanEngine.setUserSpeaking(true)
    }

    /**
     * Called when user stops speaking.
     */
    fun onUserSpeechEnd() {
        betterThanHumanEngine.setUserSpeaking(false)
    }

    /**
     * Called during user speech pause.
     */
    fun onUserSpeechPause(durationMs: Long) {
        betterThanHumanEngine.updateSpeechPauseDuration(durationMs)
    }

    // MARK: - Session Controls

    /**
     * Connect to voice session.
     */
    fun connect() {
        viewModelScope.launch {
            liveKitSession.connect()
        }
    }

    /**
     * Disconnect from voice session.
     */
    fun disconnect() {
        liveKitSession.disconnect()
    }

    /**
     * Toggle microphone mute.
     */
    fun toggleMute() {
        liveKitSession.toggleMute()
    }

    /**
     * Request persona switch.
     */
    fun switchPersona(personaId: String) {
        viewModelScope.launch {
            liveKitSession.switchPersona(personaId)
        }
    }

    // MARK: - Cleanup

    override fun onCleared() {
        super.onCleared()
        betterThanHumanEngine.destroy()
        liveKitSession.disconnect()
    }
}
