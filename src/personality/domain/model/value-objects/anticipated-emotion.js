/**
 * AnticipatedEmotion Value Object
 *
 * SUPERHUMAN CORE: This represents an emotion we PREDICT before the user
 * fully expresses it. This is the "they understand me before I finish" feeling.
 *
 * Human limitation: Humans wait for the full message before responding.
 * Superhuman: We anticipate from partial speech + tone + patterns.
 *
 * @module personality/domain/model/value-objects/anticipated-emotion
 */
/**
 * AnticipatedEmotion value object
 *
 * This is the heart of "Better Than Human" - predicting emotional states
 * before they're fully expressed, allowing us to respond with supernatural
 * understanding.
 *
 * @example
 * ```typescript
 * // User says "I've been thinking about..." with falling tone
 * const anticipated = AnticipatedEmotion.create({
 *   emotion: 'sadness',
 *   granular: 'melancholy',
 *   confidence: 'likely',
 *   signals: ['partial_speech', 'tone_shift'],
 *   reasoning: 'Falling tone + reflective phrase suggests processing something difficult',
 * });
 *
 * if (anticipated.shouldPrepareEmpathy) {
 *   // Start showing contemplative micro-expression NOW
 *   // Don't wait for them to finish
 * }
 * ```
 */
export class AnticipatedEmotion {
    emotion;
    granular;
    confidence;
    confidenceScore;
    signals;
    reasoning;
    recommendedResponse;
    partialTranscript;
    basedOnPatternId;
    predictionHorizon;
    predictedAt;
    constructor(
    /** Predicted primary emotion */
    emotion, 
    /** Predicted granular emotion (if confident enough) */
    granular, 
    /** How confident we are */
    confidence, 
    /** Numeric confidence (0-1) */
    confidenceScore, 
    /** Signals that led to this prediction */
    signals, 
    /** Human-readable reasoning */
    reasoning, 
    /** Recommended response preparation */
    recommendedResponse, 
    /** Partial transcript that triggered anticipation */
    partialTranscript, 
    /** Historical pattern ID if based on pattern */
    basedOnPatternId, 
    /** How far in advance we're predicting (seconds, null = real-time) */
    predictionHorizon = null, 
    /** When this prediction was made */
    predictedAt = new Date()) {
        this.emotion = emotion;
        this.granular = granular;
        this.confidence = confidence;
        this.confidenceScore = confidenceScore;
        this.signals = signals;
        this.reasoning = reasoning;
        this.recommendedResponse = recommendedResponse;
        this.partialTranscript = partialTranscript;
        this.basedOnPatternId = basedOnPatternId;
        this.predictionHorizon = predictionHorizon;
        this.predictedAt = predictedAt;
    }
    // ============================================================================
    // FACTORY METHODS
    // ============================================================================
    /**
     * Create a new anticipation
     */
    static create(params) {
        const confidenceScores = {
            certain: 0.95,
            likely: 0.75,
            possible: 0.5,
            speculative: 0.3,
        };
        const response = AnticipatedEmotion.determineResponse(params.emotion, params.confidence, params.signals);
        return new AnticipatedEmotion(params.emotion, params.granular ?? null, params.confidence, confidenceScores[params.confidence], params.signals, params.reasoning, response, params.partialTranscript, params.basedOnPatternId, params.predictionHorizon ?? null);
    }
    /**
     * Create from partial speech analysis
     */
    static fromPartialSpeech(partialTranscript, detectedEmotion, granular, confidence, reasoning) {
        const confidenceLevel = confidence >= 0.9
            ? 'certain'
            : confidence >= 0.7
                ? 'likely'
                : confidence >= 0.4
                    ? 'possible'
                    : 'speculative';
        return AnticipatedEmotion.create({
            emotion: detectedEmotion,
            granular: granular ?? undefined,
            confidence: confidenceLevel,
            signals: ['partial_speech'],
            reasoning,
            partialTranscript,
        });
    }
    /**
     * Create from historical pattern match
     */
    static fromPattern(patternId, predictedEmotion, granular, confidence, reasoning, predictionHorizonSeconds) {
        const confidenceLevel = confidence >= 0.85 ? 'certain' : confidence >= 0.6 ? 'likely' : 'possible';
        return AnticipatedEmotion.create({
            emotion: predictedEmotion,
            granular: granular ?? undefined,
            confidence: confidenceLevel,
            signals: ['historical_pattern'],
            reasoning,
            basedOnPatternId: patternId,
            predictionHorizon: predictionHorizonSeconds,
        });
    }
    /**
     * Create from voice tone analysis
     */
    static fromVoiceTone(toneSignal, inferredEmotion, confidence, granular) {
        const toneReasoningMap = {
            rising: 'Rising tone suggests excitement or anxiety',
            falling: 'Falling tone suggests sadness or contemplation',
            flat: 'Flat tone suggests exhaustion or numbness',
            breaking: 'Breaking voice suggests emotional overwhelm',
        };
        return AnticipatedEmotion.create({
            emotion: inferredEmotion,
            granular: granular ?? undefined,
            confidence: confidence >= 0.7 ? 'likely' : 'possible',
            signals: ['tone_shift'],
            reasoning: toneReasoningMap[toneSignal],
        });
    }
    // ============================================================================
    // COMPUTED PROPERTIES
    // ============================================================================
    /**
     * Should we start showing empathy signals now?
     */
    get shouldPrepareEmpathy() {
        return (this.recommendedResponse === 'prepare_empathy' &&
            (this.confidence === 'certain' || this.confidence === 'likely'));
    }
    /**
     * Should we prepare to celebrate?
     */
    get shouldPrepareCelebration() {
        return (this.recommendedResponse === 'prepare_celebration' &&
            (this.confidence === 'certain' || this.confidence === 'likely'));
    }
    /**
     * Is this a strong enough prediction to act on?
     */
    get isActionable() {
        return this.confidenceScore >= 0.5 && this.recommendedResponse !== 'no_action';
    }
    /**
     * Is this predicting negative emotion?
     */
    get isNegativePrediction() {
        return ['sadness', 'anger', 'fear', 'disgust'].includes(this.emotion);
    }
    /**
     * Is this a real-time anticipation (vs. future prediction)?
     */
    get isRealTime() {
        return this.predictionHorizon === null || this.predictionHorizon <= 60;
    }
    /**
     * Get micro-expression type to display
     */
    get suggestedMicroExpression() {
        if (this.confidenceScore < 0.5)
            return null;
        const expressionMap = {
            joy: 'delightFlash',
            sadness: 'concernFlash',
            fear: 'concernFlash',
            anticipation: 'interestFlash',
            trust: 'warmthPulse',
            surprise: 'interestFlash',
        };
        return expressionMap[this.emotion] ?? null;
    }
    // ============================================================================
    // BEHAVIOR METHODS
    // ============================================================================
    /**
     * Determine appropriate response based on anticipated emotion
     */
    static determineResponse(emotion, confidence, signals) {
        // Low confidence = wait for more info
        if (confidence === 'speculative')
            return 'no_action';
        // Voice breaking = definitely prepare space
        if (signals.includes('breath_pattern')) {
            return 'prepare_space';
        }
        // Emotion-based responses
        switch (emotion) {
            case 'joy':
            case 'anticipation':
                return 'prepare_celebration';
            case 'sadness':
            case 'fear':
                return 'prepare_empathy';
            case 'anger':
                return 'prepare_validation';
            case 'surprise':
                return 'prepare_curiosity';
            default:
                return 'no_action';
        }
    }
    /**
     * Check if this anticipation was accurate once we know the real emotion
     */
    wasAccurate(actualEmotion) {
        // Primary emotion match
        if (this.emotion === actualEmotion.primary)
            return true;
        // Allow related emotion clusters
        const clusters = {
            negative: ['sadness', 'anger', 'fear', 'disgust'],
            positive: ['joy', 'trust', 'anticipation'],
            activating: ['anger', 'fear', 'surprise', 'joy'],
        };
        // If both in same cluster, partial credit
        for (const cluster of Object.values(clusters)) {
            if (cluster.includes(this.emotion) && cluster.includes(actualEmotion.primary)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Combine with another anticipation (multiple signals)
     */
    combineWith(other) {
        // If they predict the same emotion, boost confidence
        if (this.emotion === other.emotion) {
            const combinedConfidence = Math.min(0.95, this.confidenceScore + other.confidenceScore * 0.5);
            const newConfidenceLevel = combinedConfidence >= 0.9
                ? 'certain'
                : combinedConfidence >= 0.6
                    ? 'likely'
                    : combinedConfidence >= 0.35
                        ? 'possible'
                        : 'speculative';
            return AnticipatedEmotion.create({
                emotion: this.emotion,
                granular: this.granular ?? other.granular ?? undefined,
                confidence: newConfidenceLevel,
                signals: [...new Set([...this.signals, ...other.signals])],
                reasoning: `${this.reasoning}; ${other.reasoning}`,
                partialTranscript: this.partialTranscript ?? other.partialTranscript,
                basedOnPatternId: this.basedOnPatternId ?? other.basedOnPatternId,
            });
        }
        // Different predictions - take higher confidence
        return this.confidenceScore >= other.confidenceScore ? this : other;
    }
    // ============================================================================
    // SERIALIZATION
    // ============================================================================
    /**
     * Convert to plain object for persistence/logging
     */
    toPersistence() {
        return {
            emotion: this.emotion,
            granular: this.granular,
            confidence: this.confidence,
            confidenceScore: this.confidenceScore,
            signals: this.signals,
            reasoning: this.reasoning,
            recommendedResponse: this.recommendedResponse,
            partialTranscript: this.partialTranscript,
            basedOnPatternId: this.basedOnPatternId,
            predictionHorizon: this.predictionHorizon,
            predictedAt: this.predictedAt.toISOString(),
            isActionable: this.isActionable,
            suggestedMicroExpression: this.suggestedMicroExpression,
        };
    }
    /**
     * Format for LLM prompt injection
     */
    formatForPrompt() {
        if (!this.isActionable)
            return '';
        const lines = [
            '[🔮 ANTICIPATED EMOTION - SUPERHUMAN PREDICTION]',
            '',
            `Predicted emotion: ${this.emotion}${this.granular ? ` (${this.granular})` : ''}`,
            `Confidence: ${this.confidence} (${Math.round(this.confidenceScore * 100)}%)`,
            `Based on: ${this.signals.join(', ')}`,
            `Reasoning: ${this.reasoning}`,
            '',
            `Recommended: ${this.recommendedResponse.replace(/_/g, ' ')}`,
            '',
            "This is SUPERHUMAN - you're understanding them BEFORE they finish.",
            'Show recognition with subtle micro-expressions. Make them feel deeply understood.',
        ];
        return lines.join('\n');
    }
}
//# sourceMappingURL=anticipated-emotion.js.map