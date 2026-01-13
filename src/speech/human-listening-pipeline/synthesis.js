/**
 * Human Listening Synthesis
 *
 * Functions for synthesizing insights from analysis results.
 * Generates emotional undercurrents, assessments, and guidance.
 */
// ============================================================================
// EMOTIONAL UNDERCURRENT SYNTHESIS
// ============================================================================
/**
 * Synthesize emotional undercurrent from all analysis results
 */
export function synthesizeEmotionalUndercurrent(audio, text, conversation) {
    const evidence = [];
    let primaryEmotion = 'neutral';
    let confidence = 0.5;
    let possiblyMasked = false;
    // Audio signals
    if (audio.tremor?.detected) {
        if (audio.tremor.possibleTears) {
            primaryEmotion = 'sadness';
            evidence.push('voice tremor suggesting held-back tears');
            confidence += 0.2;
        }
        else if (audio.tremor.possibleAnxiety) {
            primaryEmotion = 'anxiety';
            evidence.push('voice tremor suggesting nervousness');
            confidence += 0.15;
        }
    }
    if (audio.volumeDynamics?.onSensitiveTopic) {
        evidence.push('voice getting quieter on sensitive content');
        possiblyMasked = true;
        confidence += 0.1;
    }
    if (audio.breath?.needsSpace) {
        evidence.push(`${audio.breath.dominantPattern} breathing detected`);
        confidence += 0.1;
    }
    // Text signals
    if (text.selfSoothing.possibleDistress) {
        evidence.push('self-soothing language detected');
        possiblyMasked = true;
        confidence += 0.15;
    }
    if (text.hedging.elevated) {
        evidence.push(`elevated hedging (${text.hedging.dominantCategory})`);
        confidence += 0.1;
    }
    if (text.cognitiveLoad.level === 'high' || text.cognitiveLoad.level === 'overloaded') {
        evidence.push('high cognitive load');
        confidence += 0.1;
    }
    if (text.fluency.pattern === 'emotional_block') {
        evidence.push('speech fluency disrupted by emotion');
        confidence += 0.15;
    }
    // Conversation signals
    if (conversation.narrativeArc.structure === 'circular') {
        evidence.push('circling around a concern');
        confidence += 0.1;
    }
    // Determine primary if still neutral
    if (primaryEmotion === 'neutral' && evidence.length > 0) {
        if (text.selfSoothing.detected) {
            primaryEmotion = text.selfSoothing.underlyingEmotionalState;
        }
        else if (text.hedging.dominantCategory === 'protecting') {
            primaryEmotion = 'vulnerability';
        }
        else if (text.cognitiveLoad.level !== 'low') {
            primaryEmotion = 'overwhelm';
        }
    }
    return {
        primary: primaryEmotion,
        confidence: Math.min(1, confidence),
        evidence,
        possiblyMasked,
    };
}
// ============================================================================
// ASSESSMENT GENERATION
// ============================================================================
/**
 * Generate overall assessment of how the user is doing
 */
export function generateOverallAssessment(audio, text, conversation, undercurrent) {
    const assessments = [];
    // Check for distress signals
    if (audio.tremor?.possibleTears ||
        text.selfSoothing.possibleDistress ||
        text.fluency.pattern === 'emotional_block') {
        assessments.push('User may be struggling with difficult emotions.');
    }
    // Check cognitive state
    if (text.cognitiveLoad.level === 'overloaded') {
        assessments.push('User is mentally overloaded - needs simpler communication.');
    }
    else if (text.cognitiveLoad.level === 'high') {
        assessments.push('User is processing heavily.');
    }
    // Check engagement
    if (conversation.engagement.level === 'distracted') {
        assessments.push('User seems distracted or disconnected.');
    }
    else if (conversation.engagement.declining) {
        assessments.push('Engagement is declining.');
    }
    // Check narrative
    if (conversation.narrativeArc.hasReachedCore) {
        assessments.push('User has reached the core of what they wanted to share.');
    }
    else if (conversation.narrativeArc.climaxApproaching) {
        assessments.push('User is building toward something important.');
    }
    // Check masking
    if (undercurrent.possiblyMasked) {
        assessments.push(`Words may be masking ${undercurrent.primary}.`);
    }
    if (assessments.length === 0) {
        return 'User appears to be communicating openly and naturally.';
    }
    return assessments.join(' ');
}
/**
 * Identify priority signals that agent should attend to
 */
export function identifyPrioritySignals(audio, text, conversation) {
    const signals = [];
    // High priority: emotional distress
    if (audio.tremor?.possibleTears) {
        signals.push('Possible tears - be gentle');
    }
    if (text.selfSoothing.possibleDistress) {
        signals.push('Self-soothing distress signals');
    }
    // Medium priority: needs adjustment
    if (text.cognitiveLoad.level === 'overloaded') {
        signals.push('Cognitive overload - simplify');
    }
    if (conversation.narrativeArc.hasReachedCore) {
        signals.push('User reached their point - validate');
    }
    if (audio.volumeDynamics?.onSensitiveTopic) {
        signals.push('Voice quieter - sensitive content');
    }
    // Lower priority: notice and adjust
    if (text.hedging.shouldProbe) {
        signals.push('Hedging detected - consider gentle probe');
    }
    if (conversation.engagement.declining) {
        signals.push('Engagement dropping');
    }
    return signals;
}
/**
 * Generate unified guidance for agent response
 */
export function generateAgentGuidance(audio, text, conversation, prioritySignals) {
    if (prioritySignals.length === 0) {
        return 'Continue conversing naturally.';
    }
    const guidances = [];
    // Add specific guidance from each system
    if (audio.tremor?.detected) {
        guidances.push(audio.tremor.suggestedResponse);
    }
    if (audio.breath?.needsSpace) {
        guidances.push(audio.breath.guidance);
    }
    if (text.cognitiveLoad.shouldSimplify) {
        guidances.push(text.cognitiveLoad.guidance);
    }
    if (text.selfSoothing.detected) {
        guidances.push(text.selfSoothing.suggestedApproach);
    }
    if (conversation.narrativeArc.hasReachedCore) {
        guidances.push(conversation.narrativeArc.interventionGuidance);
    }
    if (guidances.length === 0) {
        return 'Be attentive to the signals detected and respond with care.';
    }
    return guidances.slice(0, 2).join(' ');
}
// ============================================================================
// RESPONSE ADJUSTMENTS
// ============================================================================
/**
 * Determine if agent should slow down
 */
export function determineShouldSlowDown(audio, text, conversation) {
    return (text.cognitiveLoad.level === 'high' ||
        text.cognitiveLoad.level === 'overloaded' ||
        audio.tremor?.detected === true ||
        audio.breath?.needsSpace === true ||
        text.fluency.pattern === 'emotional_block' ||
        conversation.narrativeArc.climaxApproaching);
}
/**
 * Determine if agent should give more space
 */
export function determineShouldGiveSpace(audio, text, conversation) {
    return (audio.breath?.needsSpace === true ||
        audio.volumeDynamics?.onSensitiveTopic === true ||
        text.selfSoothing.possibleDistress ||
        conversation.narrativeArc.hasReachedCore);
}
/**
 * Determine if user is possibly in distress
 */
export function determinePossibleDistress(audio, text, _conversation) {
    return (audio.tremor?.possibleTears === true ||
        text.selfSoothing.possibleDistress ||
        text.fluency.pattern === 'emotional_block' ||
        (text.hedging.dominantCategory === 'protecting' && text.hedging.elevated));
}
// ============================================================================
// SSML SUGGESTIONS
// ============================================================================
/**
 * Calculate SSML suggestions for agent response
 */
export function calculateSsmlSuggestions(audio, text, shouldSlowDown) {
    let speedMultiplier = 1.0;
    let pauseMultiplier = 1.0;
    let volumeLevel = 'normal';
    // Speed adjustments
    if (text.cognitiveLoad.ssmlAdjustments) {
        speedMultiplier *= text.cognitiveLoad.ssmlAdjustments.speedMultiplier;
        pauseMultiplier *= text.cognitiveLoad.ssmlAdjustments.pauseMultiplier;
    }
    if (shouldSlowDown) {
        speedMultiplier *= 0.95;
        pauseMultiplier *= 1.1;
    }
    // Volume adjustments
    if (audio.volumeDynamics?.suggestedAgentVolume) {
        volumeLevel = audio.volumeDynamics.suggestedAgentVolume;
    }
    if (audio.tremor?.possibleTears || text.selfSoothing.possibleDistress) {
        volumeLevel = 'softer';
    }
    return {
        speedMultiplier: Math.max(0.8, Math.min(1.1, speedMultiplier)),
        pauseMultiplier: Math.max(1.0, Math.min(1.5, pauseMultiplier)),
        volumeLevel,
    };
}
// ============================================================================
// CONFIDENCE CALCULATION
// ============================================================================
/**
 * Calculate overall confidence in the analysis
 */
export function calculateOverallConfidence(audio, text, conversation) {
    const confidences = [];
    // Audio confidence (if available)
    if (audio.breath)
        confidences.push(audio.breath.confidence);
    if (audio.tremor)
        confidences.push(audio.tremor.confidence);
    if (audio.volumeDynamics)
        confidences.push(audio.volumeDynamics.confidence);
    // Text confidence
    confidences.push(text.cognitiveLoad.confidence);
    confidences.push(text.fluency.confidence);
    confidences.push(text.hedging.confidence);
    confidences.push(text.selfSoothing.confidence);
    // Conversation confidence
    confidences.push(conversation.narrativeArc.confidence);
    confidences.push(conversation.engagement.confidence);
    if (confidences.length === 0)
        return 0.5;
    return confidences.reduce((a, b) => a + b, 0) / confidences.length;
}
//# sourceMappingURL=synthesis.js.map