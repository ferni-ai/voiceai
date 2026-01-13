/**
 * Speech insights integration helpers.
 *
 * This is intentionally separate from ContextManager to keep the core context
 * assembly readable and to make speech logic easier to test.
 */
export function buildSpeechInsightsContext(options) {
    const { humanListeningResult, emotionalMomentum, prosodyContinuityHints, speedControl } = options;
    const voiceDistressSignals = Boolean(humanListeningResult?.possibleDistress ||
        (humanListeningResult?.audio?.tremor?.detected ?? false));
    const estimatedCognitiveLoad = estimateCognitiveLoad(humanListeningResult);
    const speechGuidance = buildSpeechGuidance({
        humanListeningResult,
        emotionalMomentum,
        speedControl,
        voiceDistressSignals,
        estimatedCognitiveLoad,
    });
    return {
        emotionalMomentum,
        prosodyContinuityHints,
        humanListeningResult,
        speedControl,
        voiceDistressSignals,
        estimatedCognitiveLoad,
        speechGuidance,
    };
}
export function formatSpeechInsightsForPrompt(insights) {
    return insights.speechGuidance ? insights.speechGuidance : '';
}
function estimateCognitiveLoad(humanListeningResult) {
    if (!humanListeningResult) {
        return 0.3;
    }
    const cognitiveLevel = humanListeningResult.text.cognitiveLoad?.level;
    const textLoadScore = cognitiveLevel === 'overloaded'
        ? 1.0
        : cognitiveLevel === 'high'
            ? 0.8
            : cognitiveLevel === 'medium'
                ? 0.5
                : 0.3;
    const hedgingDensity = humanListeningResult.text.hedging?.hedgingDensity ?? 0;
    return Math.min(1, textLoadScore + Math.min(hedgingDensity / 20, 0.5));
}
function buildSpeechGuidance(options) {
    const guidance = [];
    addDistressGuidance(guidance, options.voiceDistressSignals);
    addCognitiveLoadGuidance(guidance, options.estimatedCognitiveLoad);
    addMomentumGuidance(guidance, options.emotionalMomentum);
    addHumanListeningGuidance(guidance, options.humanListeningResult);
    addSpeedControlGuidance(guidance, options.speedControl);
    return guidance.length > 0 ? `[VOICE INSIGHTS]\n${guidance.join('\n')}` : '';
}
function addDistressGuidance(guidance, voiceDistressSignals) {
    if (voiceDistressSignals) {
        guidance.push('🔴 Voice shows distress signals - prioritize emotional support');
    }
}
function addCognitiveLoadGuidance(guidance, estimatedCognitiveLoad) {
    if (estimatedCognitiveLoad > 0.7) {
        guidance.push('User is processing heavily - use simpler language, shorter sentences');
        return;
    }
    if (estimatedCognitiveLoad > 0.5) {
        guidance.push('User showing moderate cognitive load - be clear and concise');
    }
}
function addMomentumGuidance(guidance, emotionalMomentum) {
    if (!emotionalMomentum)
        return;
    if (emotionalMomentum.warmth === 'high') {
        guidance.push('Maintain warm, supportive tone (momentum: high warmth)');
    }
    if (emotionalMomentum.trend === 'building') {
        guidance.push('Energy is building - match the increasing momentum');
        return;
    }
    if (emotionalMomentum.trend === 'dissipating') {
        guidance.push('Energy is settling - use calm, grounding language');
    }
}
function addHumanListeningGuidance(guidance, humanListeningResult) {
    if (!humanListeningResult)
        return;
    const { text } = humanListeningResult;
    if (text.selfSoothing?.detected && text.selfSoothing.confidence > 0.5) {
        guidance.push('User is self-soothing - they need validation, not advice');
    }
    if (text.hedging?.elevated && text.hedging.shouldProbe) {
        guidance.push('User hedging significantly - gently explore what they really mean');
    }
    if (humanListeningResult.shouldSlowDown) {
        guidance.push('Slow down - user needs processing time');
    }
}
function addSpeedControlGuidance(guidance, speedControl) {
    if (speedControl && speedControl.reason !== 'normal pace') {
        guidance.push(`Speech pacing: ${speedControl.reason}`);
    }
}
//# sourceMappingURL=speech-insights.js.map