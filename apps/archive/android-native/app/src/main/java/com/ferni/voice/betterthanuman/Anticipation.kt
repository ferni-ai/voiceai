package com.ferni.voice.betterthanuman

import com.ferni.voice.models.EmotionHint
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Anticipation Engine
 *
 * Predicts emotions from partial speech and tone, showing responses BEFORE users finish.
 * Creates the "they understand me before I finish" feeling - the hallmark of deep friendship.
 *
 * From BETTER-THAN-HUMAN.md:
 * - "I've been thinking about..." + falling tone → Reflective/sad
 * - "Guess what!" + rising tone → Excitement
 * - "Remember when..." → Nostalgia
 * - "I need to tell you..." → Important/attentive
 */
class AnticipationEngine(
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.Main)
) {

    // MARK: - State

    private val _anticipatedEmotion = MutableStateFlow<AnticipatedEmotion?>(null)
    val anticipatedEmotion: StateFlow<AnticipatedEmotion?> = _anticipatedEmotion.asStateFlow()

    private val _confidence = MutableStateFlow(0f)
    val confidence: StateFlow<Float> = _confidence.asStateFlow()

    // MARK: - Configuration

    /** Minimum text length before attempting anticipation */
    private val minTextLength = 12

    /** Confidence threshold to trigger anticipation */
    private val confidenceThreshold = 0.6f

    /** How long anticipation stays active (ms) */
    private val anticipationDurationMs = 2000L

    // MARK: - State

    private var resetJob: Job? = null

    // MARK: - Phrase Patterns

    /**
     * Patterns that trigger anticipation with their associated emotions
     */
    private data class PatternMatch(
        val pattern: String,
        val emotion: AnticipatedEmotion,
        val baseConfidence: Float
    )

    private val patterns = listOf(
        // Reflective/vulnerable
        PatternMatch("i've been thinking", AnticipatedEmotion.REFLECTIVE, 0.7f),
        PatternMatch("i've been feeling", AnticipatedEmotion.VULNERABLE, 0.75f),
        PatternMatch("sometimes i wonder", AnticipatedEmotion.REFLECTIVE, 0.65f),
        PatternMatch("i don't know if", AnticipatedEmotion.UNCERTAIN, 0.6f),

        // Excitement
        PatternMatch("guess what", AnticipatedEmotion.EXCITED, 0.85f),
        PatternMatch("you won't believe", AnticipatedEmotion.EXCITED, 0.8f),
        PatternMatch("i just found out", AnticipatedEmotion.EXCITED, 0.75f),
        PatternMatch("oh my god", AnticipatedEmotion.EXCITED, 0.7f),

        // Nostalgia
        PatternMatch("remember when", AnticipatedEmotion.NOSTALGIC, 0.8f),
        PatternMatch("back when we", AnticipatedEmotion.NOSTALGIC, 0.75f),
        PatternMatch("i miss", AnticipatedEmotion.NOSTALGIC, 0.7f),
        PatternMatch("those days", AnticipatedEmotion.NOSTALGIC, 0.65f),

        // Important/serious
        PatternMatch("i need to tell you", AnticipatedEmotion.ATTENTIVE, 0.8f),
        PatternMatch("there's something", AnticipatedEmotion.ATTENTIVE, 0.7f),
        PatternMatch("i have to be honest", AnticipatedEmotion.ATTENTIVE, 0.85f),
        PatternMatch("can i tell you something", AnticipatedEmotion.ATTENTIVE, 0.8f),

        // Distress signals
        PatternMatch("i can't do this", AnticipatedEmotion.CONCERNED, 0.8f),
        PatternMatch("i'm so tired of", AnticipatedEmotion.CONCERNED, 0.75f),
        PatternMatch("nobody understands", AnticipatedEmotion.CONCERNED, 0.8f),
        PatternMatch("what's the point", AnticipatedEmotion.CONCERNED, 0.85f),

        // Joy/gratitude
        PatternMatch("thank you so much", AnticipatedEmotion.WARM, 0.8f),
        PatternMatch("i'm so grateful", AnticipatedEmotion.WARM, 0.85f),
        PatternMatch("this means so much", AnticipatedEmotion.WARM, 0.8f),
        PatternMatch("you always", AnticipatedEmotion.WARM, 0.7f),

        // Curiosity
        PatternMatch("what do you think about", AnticipatedEmotion.CURIOUS, 0.7f),
        PatternMatch("have you ever", AnticipatedEmotion.CURIOUS, 0.65f),
        PatternMatch("i was wondering", AnticipatedEmotion.CURIOUS, 0.6f)
    )

    // MARK: - Public API

    /**
     * Analyze partial transcript for emotion anticipation.
     *
     * @param partialText The partial (non-final) transcript
     * @param tone Optional detected voice tone
     */
    fun analyze(partialText: String, tone: VoiceTone? = null) {
        if (partialText.length < minTextLength) return

        val normalizedText = partialText.lowercase().trim()

        // Check patterns
        for ((pattern, emotion, baseConfidence) in patterns) {
            if (normalizedText.contains(pattern)) {
                var adjustedConfidence = baseConfidence

                // Boost confidence with tone matching
                if (tone != null) {
                    adjustedConfidence = adjustConfidence(adjustedConfidence, emotion, tone)
                }

                if (adjustedConfidence >= confidenceThreshold) {
                    triggerAnticipation(emotion, adjustedConfidence)
                    return
                }
            }
        }

        // Tone-only anticipation (weaker signal)
        tone?.let {
            emotionFromTone(it)?.let { emotion ->
                triggerAnticipation(emotion, 0.5f)
            }
        }
    }

    /**
     * Clear current anticipation
     */
    fun clear() {
        resetJob?.cancel()
        _anticipatedEmotion.value = null
        _confidence.value = 0f
    }

    // MARK: - Private Methods

    private fun triggerAnticipation(emotion: AnticipatedEmotion, confidenceValue: Float) {
        // Cancel pending reset
        resetJob?.cancel()

        _anticipatedEmotion.value = emotion
        _confidence.value = confidenceValue

        // Auto-reset after duration
        resetJob = scope.launch {
            delay(anticipationDurationMs)
            _anticipatedEmotion.value = null
            _confidence.value = 0f
        }
    }

    private fun adjustConfidence(base: Float, emotion: AnticipatedEmotion, tone: VoiceTone): Float {
        // Tone that matches emotion boosts confidence
        return when (emotion to tone) {
            AnticipatedEmotion.EXCITED to VoiceTone.RISING -> base + 0.15f
            AnticipatedEmotion.REFLECTIVE to VoiceTone.FALLING -> base + 0.1f
            AnticipatedEmotion.VULNERABLE to VoiceTone.FALLING -> base + 0.15f
            AnticipatedEmotion.CONCERNED to VoiceTone.BREAKING -> base + 0.2f
            AnticipatedEmotion.CONCERNED to VoiceTone.STRAINED -> base + 0.15f
            AnticipatedEmotion.WARM to VoiceTone.NEUTRAL -> base + 0.05f
            else -> base
        }
    }

    private fun emotionFromTone(tone: VoiceTone): AnticipatedEmotion? {
        return when (tone) {
            VoiceTone.RISING -> AnticipatedEmotion.CURIOUS
            VoiceTone.FALLING -> AnticipatedEmotion.REFLECTIVE
            VoiceTone.BREAKING -> AnticipatedEmotion.CONCERNED
            VoiceTone.STRAINED -> AnticipatedEmotion.ATTENTIVE
            VoiceTone.NEUTRAL -> null
        }
    }
}

/**
 * Anticipated Emotion
 *
 * Emotions that Ferni can anticipate from partial speech patterns.
 */
enum class AnticipatedEmotion(
    /** The expression Ferni should show */
    val expressionHint: EmotionHint,
    /** Visual shift to apply */
    val visualShift: AnticipationVisual
) {
    /** Thoughtful, introspective */
    REFLECTIVE(
        expressionHint = EmotionHint.CURIOUS, // 'thinking' maps to curious in Android
        visualShift = AnticipationVisual(leanY = -2f, warmth = 0.2f, shimmerBoost = -0.1f)
    ),

    /** Opening up emotionally */
    VULNERABLE(
        expressionHint = EmotionHint.EMPATHETIC,
        visualShift = AnticipationVisual(leanY = -3f, warmth = 0.4f, shimmerBoost = 0f)
    ),

    /** Seeking guidance */
    UNCERTAIN(
        expressionHint = EmotionHint.EMPATHETIC,
        visualShift = AnticipationVisual(leanY = -2f, warmth = 0.3f, shimmerBoost = 0f)
    ),

    /** Good news incoming */
    EXCITED(
        expressionHint = EmotionHint.CURIOUS, // Lean in before celebrating
        visualShift = AnticipationVisual(leanY = -4f, warmth = 0.1f, shimmerBoost = 0.2f)
    ),

    /** Remembering the past */
    NOSTALGIC(
        expressionHint = EmotionHint.EMPATHETIC,
        visualShift = AnticipationVisual(leanY = -1f, warmth = 0.5f, shimmerBoost = 0.1f)
    ),

    /** Something important coming */
    ATTENTIVE(
        expressionHint = EmotionHint.CURIOUS,
        visualShift = AnticipationVisual(leanY = -5f, warmth = 0.1f, shimmerBoost = 0.15f)
    ),

    /** Distress signals detected */
    CONCERNED(
        expressionHint = EmotionHint.EMPATHETIC,
        visualShift = AnticipationVisual(leanY = -3f, warmth = 0.6f, shimmerBoost = -0.05f)
    ),

    /** Gratitude/connection */
    WARM(
        expressionHint = EmotionHint.HAPPY,
        visualShift = AnticipationVisual(leanY = -2f, warmth = 0.5f, shimmerBoost = 0.1f)
    ),

    /** Question forming */
    CURIOUS(
        expressionHint = EmotionHint.CURIOUS,
        visualShift = AnticipationVisual(leanY = -4f, warmth = 0.1f, shimmerBoost = 0.2f)
    )
}

/**
 * Visual shift values for anticipated emotions.
 */
data class AnticipationVisual(
    /** Forward lean (negative = toward user) in dp */
    val leanY: Float = 0f,

    /** Warmth glow boost (0-1) */
    val warmth: Float = 0f,

    /** Shimmer intensity boost (-0.2 to 0.3) */
    val shimmerBoost: Float = 0f
)

/**
 * Detected tone from voice analysis.
 */
enum class VoiceTone {
    NEUTRAL,
    RISING,      // Excitement, questions
    FALLING,     // Sadness, statements
    BREAKING,    // Emotional distress
    STRAINED     // Stress, tension
}

/**
 * Level of concern detected.
 */
enum class ConcernLevel {
    NONE,
    MILD,        // Subtle shift in expression
    MODERATE,    // Visible empathy
    HIGH         // Active check-in mode
}
