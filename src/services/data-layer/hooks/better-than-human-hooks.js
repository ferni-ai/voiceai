/**
 * Better Than Human Hooks
 *
 * Semantic indexing for what makes Ferni superhuman:
 * - Perfect memory (session summaries)
 * - Emotional detection (voice biomarkers)
 * - Pattern recognition (behavioral insights)
 * - Cross-conversation threading
 * - Hidden correlations
 * - Protective silence
 * - Voice recognition
 *
 * "We remember your whole story, hear what you're not saying,
 *  and show up at 2am with the same presence as noon."
 */
import { createDomainHook } from '../hook-generator.js';
// ============================================================================
// VOICE BIOMARKERS - "We hear what you're not saying"
// ============================================================================
export const onVoiceBiomarkerChange = createDomainHook({
    entityType: 'voice_biomarker',
    storeType: 'superhuman-intelligence',
    contentBuilder: (entity) => {
        const features = entity.voiceFeatures;
        const featureDesc = [
            features.pitch && `pitch: ${features.pitch}`,
            features.pace && `pace: ${features.pace}`,
            features.energy && `energy: ${features.energy}`,
            features.strain && 'voice strain detected',
        ]
            .filter(Boolean)
            .join(', ');
        return `Voice biomarker detected: ${entity.emotion} (${(entity.confidence * 100).toFixed(0)}% confident). Features: ${featureDesc}. Context: ${entity.context || 'general conversation'}. ${entity.insights?.join('. ') || ''}`;
    },
});
export function deindexVoiceBiomarker(userId, biomarkerId) {
    onVoiceBiomarkerChange(userId, biomarkerId, {
        emotion: '',
        confidence: 0,
        voiceFeatures: {},
        sessionId: '',
        timestamp: new Date().toISOString(),
    }, 'delete');
}
// ============================================================================
// SESSION SUMMARIES - "We remember your whole story"
// ============================================================================
export const onSessionSummaryChange = createDomainHook({
    entityType: 'session_summary',
    storeType: 'session-context',
    contentBuilder: (entity) => {
        const parts = [
            `Session summary: ${entity.summary}`,
            `Topics: ${entity.keyTopics.join(', ')}`,
            entity.emotionalArc && `Emotional journey: ${entity.emotionalArc}`,
            entity.actionItems?.length && `Action items: ${entity.actionItems.join('; ')}`,
            entity.promises?.length && `Commitments: ${entity.promises.join('; ')}`,
            entity.breakthroughs?.length && `Breakthroughs: ${entity.breakthroughs.join('; ')}`,
            entity.questionsRaised?.length && `Open questions: ${entity.questionsRaised.join('; ')}`,
        ];
        return parts.filter(Boolean).join('. ');
    },
});
export function deindexSessionSummary(userId, sessionId) {
    onSessionSummaryChange(userId, sessionId, {
        sessionId: '',
        summary: '',
        keyTopics: [],
        duration: 0,
        timestamp: new Date().toISOString(),
    }, 'delete');
}
// ============================================================================
// PATTERN INSIGHTS - "We see patterns you can't see yourself"
// ============================================================================
export const onPatternInsightChange = createDomainHook({
    entityType: 'pattern_insight',
    storeType: 'superhuman-intelligence',
    contentBuilder: (entity) => {
        return `Pattern discovered (${entity.category}): ${entity.pattern}. Frequency: ${entity.frequency}, significance: ${entity.significance}. Evidence: ${entity.evidence.slice(0, 3).join('; ')}. ${entity.surfacedGently ? 'Has been shared with user.' : 'Not yet surfaced.'}`;
    },
});
export function deindexPatternInsight(userId, patternId) {
    onPatternInsightChange(userId, patternId, {
        pattern: '',
        category: 'behavioral',
        evidence: [],
        frequency: 'emerging',
        significance: 'curious',
        surfacedGently: false,
        discoveredAt: new Date().toISOString(),
        lastObserved: new Date().toISOString(),
    }, 'delete');
}
// ============================================================================
// BEHAVIORAL PATTERNS - "We understand how you tick"
// ============================================================================
export const onBehavioralPatternChange = createDomainHook({
    entityType: 'behavioral_pattern',
    storeType: 'superhuman-intelligence',
    contentBuilder: (entity) => {
        const parts = [
            `Behavioral pattern: ${entity.behavior}`,
            entity.trigger && `Triggered by: ${entity.trigger}`,
            `Frequency: ${entity.frequency}`,
            entity.impact && `Impact: ${entity.impact}`,
            `Observations: ${entity.observations.slice(0, 3).join('; ')}`,
        ];
        return parts.filter(Boolean).join('. ');
    },
});
export function deindexBehavioralPattern(userId, patternId) {
    onBehavioralPatternChange(userId, patternId, {
        behavior: '',
        frequency: 'rare',
        observations: [],
        firstObserved: new Date().toISOString(),
        lastObserved: new Date().toISOString(),
    }, 'delete');
}
// ============================================================================
// CROSS-SESSION THREADS - "We connect the dots across time"
// ============================================================================
export const onCrossSessionThreadChange = createDomainHook({
    entityType: 'cross_session_thread',
    storeType: 'session-context',
    contentBuilder: (entity) => {
        return `Cross-session topic: ${entity.topic}. Mentioned ${entity.mentionCount} times across ${entity.sessionIds.length} sessions. Evolution: ${entity.evolution}. Emotional significance: ${entity.emotionalSignificance || 'medium'}. Related: ${entity.relatedTopics?.join(', ') || 'none identified'}.`;
    },
});
export function deindexCrossSessionThread(userId, threadId) {
    onCrossSessionThreadChange(userId, threadId, {
        topic: '',
        sessionIds: [],
        evolution: '',
        lastMentioned: new Date().toISOString(),
        mentionCount: 0,
    }, 'delete');
}
// ============================================================================
// CORRELATION INSIGHTS - "We find connections you'd never notice"
// ============================================================================
export const onCorrelationInsightChange = createDomainHook({
    entityType: 'correlation_insight',
    storeType: 'superhuman-intelligence',
    contentBuilder: (entity) => {
        return `Correlation discovered between ${entity.domainA} and ${entity.domainB}: ${entity.connection}. Strength: ${entity.strength}. Examples: ${entity.examples.slice(0, 3).join('; ')}. ${entity.implications ? `Implications: ${entity.implications}` : ''}`;
    },
});
export function deindexCorrelationInsight(userId, correlationId) {
    onCorrelationInsightChange(userId, correlationId, {
        connection: '',
        domainA: '',
        domainB: '',
        strength: 'weak',
        examples: [],
        discoveredAt: new Date().toISOString(),
    }, 'delete');
}
// ============================================================================
// PROTECTIVE MOMENTS - "We know when NOT to say something"
// ============================================================================
export const onProtectiveMomentChange = createDomainHook({
    entityType: 'protective_moment',
    storeType: 'superhuman-intelligence',
    contentBuilder: (entity) => {
        return `Protective silence moment: In ${entity.situation}, we chose not to say "${entity.whatWeDidntSay}". Reason: ${entity.whyWeHeld}. User was ${entity.userState}. ${entity.outcome ? `Outcome: ${entity.outcome}` : ''}`;
    },
});
export function deindexProtectiveMoment(userId, momentId) {
    onProtectiveMomentChange(userId, momentId, {
        situation: '',
        whatWeDidntSay: '',
        whyWeHeld: '',
        userState: '',
        timestamp: new Date().toISOString(),
    }, 'delete');
}
// ============================================================================
// VOICE RECOGNITION - "We know your voice"
// ============================================================================
export const onVoiceRecognitionChange = createDomainHook({
    entityType: 'voice_recognition',
    storeType: 'superhuman-intelligence',
    contentBuilder: (entity) => {
        const chars = entity.voiceCharacteristics;
        return `Voice profile: ${entity.voiceId}. Confidence: ${(entity.confidenceScore * 100).toFixed(0)}%. Characteristics: ${chars.pitchRange || 'unknown pitch'}, ${chars.speakingPace || 'unknown pace'}${chars.uniqueFeatures?.length ? `, unique features: ${chars.uniqueFeatures.join(', ')}` : ''}. Verified ${entity.verificationCount} times.`;
    },
});
export function deindexVoiceRecognition(userId, profileId) {
    onVoiceRecognitionChange(userId, profileId, {
        voiceId: '',
        voiceCharacteristics: {},
        confidenceScore: 0,
        enrolledAt: new Date().toISOString(),
        lastVerified: new Date().toISOString(),
        verificationCount: 0,
    }, 'delete');
}
// ============================================================================
// EXPORTS - All Better Than Human hooks
// ============================================================================
export const betterThanHumanHooks = {
    // Voice biomarkers
    onVoiceBiomarkerChange,
    deindexVoiceBiomarker,
    // Session summaries
    onSessionSummaryChange,
    deindexSessionSummary,
    // Pattern insights
    onPatternInsightChange,
    deindexPatternInsight,
    // Behavioral patterns
    onBehavioralPatternChange,
    deindexBehavioralPattern,
    // Cross-session threads
    onCrossSessionThreadChange,
    deindexCrossSessionThread,
    // Correlation insights
    onCorrelationInsightChange,
    deindexCorrelationInsight,
    // Protective moments
    onProtectiveMomentChange,
    deindexProtectiveMoment,
    // Voice recognition
    onVoiceRecognitionChange,
    deindexVoiceRecognition,
};
//# sourceMappingURL=better-than-human-hooks.js.map