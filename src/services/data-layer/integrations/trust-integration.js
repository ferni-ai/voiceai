/**
 * Trust Systems Integration for Semantic Data Layer
 *
 * CONSOLIDATED: This file now wraps domain hooks for backward compatibility.
 * New code should use hooks directly from `../hooks/trust-hooks.js`.
 *
 * @module data-layer/integrations/trust-integration
 * @deprecated Import from `../hooks/trust-hooks.js` instead
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { onStoreChange } from '../store-hooks.js';
import { onCommitmentChange, onBoundaryChange, onInsideJokeChange, onGrowthReflectionChange, onSmallWinChange, onThinkingOfYouChange, onReadingBetweenLinesChange, onTonalMemoryChange, onVulnerabilityMomentChange, onTrustMilestoneChange, } from '../hooks/trust-hooks.js';
const log = createLogger({ module: 'TrustIntegration' });
/**
 * Index a commitment to semantic memory
 * @deprecated Use `onCommitmentChange` from `../hooks/trust-hooks.js` instead
 */
export function indexCommitment(commitment, changeType = 'update') {
    // Skip cancelled/abandoned commitments
    if (commitment.status === 'cancelled' || commitment.status === 'abandoned') {
        log.debug({ id: commitment.id }, 'Skipping inactive commitment');
        return;
    }
    // Map old status values to new entity status values
    const statusMap = {
        pending: 'active',
        fulfilled: 'completed',
        broken: 'broken',
        cancelled: 'cancelled',
    };
    // Use the standardized hook
    onCommitmentChange(commitment.userId, commitment.id, {
        description: commitment.content,
        madeBy: 'user',
        status: statusMap[commitment.status] || 'active',
        deadline: commitment.followUpDate?.toString(),
        context: commitment.motivation
            ? `Motivation: ${commitment.motivation}. ${commitment.obstacles?.length ? `Obstacles: ${commitment.obstacles.join(', ')}` : ''}`
            : undefined,
    }, changeType);
    log.debug({ userId: commitment.userId, id: commitment.id }, 'Commitment indexed via hook');
}
/**
 * Remove a commitment from semantic index (when completed/abandoned)
 */
export function deindexCommitment(userId, commitmentId) {
    onStoreChange({
        storeType: 'trust',
        changeType: 'delete',
        userId,
        entityType: 'commitment',
        entityId: commitmentId,
        content: '',
    });
    log.debug({ userId, id: commitmentId }, 'Commitment removed from index');
}
// ============================================================================
// BOUNDARY INDEXING
// ============================================================================
/**
 * Remove a boundary from semantic index (when lifted/reopened)
 */
export function deindexBoundary(userId, boundaryId) {
    onStoreChange({
        storeType: 'trust',
        changeType: 'delete',
        userId,
        entityType: 'boundary',
        entityId: boundaryId,
        content: '',
    });
    log.debug({ userId, id: boundaryId }, 'Boundary removed from index');
}
/**
 * Index a boundary to semantic memory (critical - always indexed)
 * @deprecated Use `onBoundaryChange` from `../hooks/trust-hooks.js` instead
 */
export function indexBoundary(userId, boundary, changeType = 'update') {
    // Map old strength values to new entity severity values (medium → soft)
    const severityMap = {
        soft: 'soft',
        medium: 'soft', // Medium maps to soft (closer to soft than hard)
        hard: 'hard',
    };
    // Use the standardized hook
    onBoundaryChange(userId, boundary.id, {
        topic: boundary.topic,
        severity: severityMap[boundary.strength] || 'soft',
        reason: boundary.context,
    }, changeType);
    log.debug({ userId, id: boundary.id, topic: boundary.topic }, 'Boundary indexed via hook');
}
/**
 * Index an inside joke (always indexed - relationship building)
 * @deprecated Use `onInsideJokeChange` from `../hooks/trust-hooks.js` instead
 */
export function indexInsideJoke(userId, joke, changeType = 'update') {
    // Use the standardized hook
    onInsideJokeChange(userId, joke.id, {
        joke: joke.joke,
        context: joke.context,
        sharedMoment: joke.sharedMoment || joke.context,
    }, changeType);
    log.debug({ userId, id: joke.id }, 'Inside joke indexed via hook');
}
/**
 * Remove an inside joke from semantic index
 */
export function deindexInsideJoke(userId, jokeId) {
    onStoreChange({
        storeType: 'trust',
        changeType: 'delete',
        userId,
        entityType: 'inside_joke',
        entityId: jokeId,
        content: '',
    });
    log.debug({ userId, id: jokeId }, 'Inside joke removed from index');
}
/**
 * Index a growth reflection
 * @deprecated Use `onGrowthReflectionChange` from `../hooks/trust-hooks.js` instead
 */
export function indexGrowthReflection(userId, reflection, changeType = 'update') {
    // Use the standardized hook
    onGrowthReflectionChange(userId, reflection.id, {
        observation: reflection.observation,
        area: reflection.area,
        evidence: reflection.evidence || '',
    }, changeType);
    log.debug({ userId, id: reflection.id }, 'Growth reflection indexed via hook');
}
/**
 * Remove a growth reflection from semantic index
 */
export function deindexGrowthReflection(userId, reflectionId) {
    onStoreChange({
        storeType: 'trust',
        changeType: 'delete',
        userId,
        entityType: 'growth_reflection',
        entityId: reflectionId,
        content: '',
    });
    log.debug({ userId, id: reflectionId }, 'Growth reflection removed from index');
}
/**
 * Index a small win celebration
 * @deprecated Use `onSmallWinChange` from `../hooks/trust-hooks.js` instead
 */
export function indexSmallWin(userId, win, changeType = 'update') {
    // Use the standardized hook
    onSmallWinChange(userId, win.id, {
        win: win.win,
        effort: win.effort || '',
        celebration: win.celebration,
    }, changeType);
    log.debug({ userId, id: win.id }, 'Small win indexed via hook');
}
/**
 * Remove a small win from semantic index
 */
export function deindexSmallWin(userId, winId) {
    onStoreChange({
        storeType: 'trust',
        changeType: 'delete',
        userId,
        entityType: 'small_win',
        entityId: winId,
        content: '',
    });
    log.debug({ userId, id: winId }, 'Small win removed from index');
}
/**
 * Index any trust moment for unified recording
 */
export function indexTrustMoment(userId, moment, changeType = 'create') {
    // Route to appropriate hook based on type
    switch (moment.type) {
        case 'small_win':
            onSmallWinChange(userId, moment.id, { win: moment.content, effort: moment.context || '' }, changeType);
            break;
        case 'boundary':
            onBoundaryChange(userId, moment.id, { topic: moment.content, severity: 'soft', reason: moment.context }, changeType);
            break;
        case 'vulnerability':
            onVulnerabilityMomentChange(userId, moment.id, {
                topic: moment.content,
                context: moment.context || '',
                depth: 'moderate',
                response: moment.emotion,
            }, changeType);
            break;
        case 'callback':
            onInsideJokeChange(userId, moment.id, { joke: moment.content, context: moment.context || '', sharedMoment: moment.context || '' }, changeType);
            break;
        default:
            // Fallback to trust milestone for other types
            onTrustMilestoneChange(userId, moment.id, { milestone: moment.content, significance: moment.context || '', stage: 'growing' }, changeType);
    }
    log.debug({ userId, id: moment.id, type: moment.type }, 'Trust moment indexed via hook');
}
/**
 * Index a "thinking of you" moment
 * @deprecated Use `onThinkingOfYouChange` from `../hooks/trust-hooks.js` instead
 */
export function indexThinkingOfYou(userId, moment, changeType = 'update') {
    // Use the standardized hook
    onThinkingOfYouChange(userId, moment.id, {
        reason: moment.reason,
        trigger: moment.theyShared || 'proactive',
        message: moment.outreachType,
    }, changeType);
    log.debug({ userId, id: moment.id }, 'Thinking of you indexed via hook');
}
/**
 * Remove a "thinking of you" moment from semantic index
 */
export function deindexThinkingOfYou(userId, momentId) {
    onStoreChange({
        storeType: 'trust',
        changeType: 'delete',
        userId,
        entityType: 'thinking_of_you',
        entityId: momentId,
        content: '',
    });
    log.debug({ userId, id: momentId }, 'Thinking of you removed from index');
}
/**
 * Index a "reading between lines" observation
 * @deprecated Use `onReadingBetweenLinesChange` from `../hooks/trust-hooks.js` instead
 */
export function indexReadingBetweenLines(userId, observation, changeType = 'update') {
    // Use the standardized hook
    onReadingBetweenLinesChange(userId, observation.id, {
        observation: observation.observation,
        whatWasSaid: observation.whatTheySaid || '',
        whatWasNotSaid: observation.whatTheyMeant || '',
        confidence: 'medium',
    }, changeType);
    log.debug({ userId, id: observation.id }, 'Reading between lines indexed via hook');
}
/**
 * Remove a "reading between lines" observation from semantic index
 */
export function deindexReadingBetweenLines(userId, observationId) {
    onStoreChange({
        storeType: 'trust',
        changeType: 'delete',
        userId,
        entityType: 'reading_between_lines',
        entityId: observationId,
        content: '',
    });
    log.debug({ userId, id: observationId }, 'Reading between lines removed from index');
}
/**
 * Index a tonal memory pattern
 * @deprecated Use `onTonalMemoryChange` from `../hooks/trust-hooks.js` instead
 */
export function indexTonalMemory(userId, memory, changeType = 'update') {
    // Use the standardized hook
    onTonalMemoryChange(userId, memory.id, {
        pattern: memory.pattern,
        context: memory.voiceCharacteristics || memory.communicationStyle || '',
        emotionalState: memory.communicationStyle,
    }, changeType);
    log.debug({ userId, id: memory.id }, 'Tonal memory indexed via hook');
}
/**
 * Remove a tonal memory pattern from semantic index
 */
export function deindexTonalMemory(userId, memoryId) {
    onStoreChange({
        storeType: 'trust',
        changeType: 'delete',
        userId,
        entityType: 'tonal_memory',
        entityId: memoryId,
        content: '',
    });
    log.debug({ userId, id: memoryId }, 'Tonal memory removed from index');
}
/**
 * Index a vulnerability moment (very high trust value)
 * @deprecated Use `onVulnerabilityMomentChange` from `../hooks/trust-hooks.js` instead
 */
export function indexVulnerabilityMoment(userId, moment, changeType = 'update') {
    // Use the standardized hook
    onVulnerabilityMomentChange(userId, moment.id, {
        topic: moment.topic || moment.moment,
        context: moment.moment,
        depth: 'deep',
        response: moment.responseGiven,
    }, changeType);
    log.debug({ userId, id: moment.id }, 'Vulnerability moment indexed via hook');
}
/**
 * Remove a vulnerability moment from semantic index
 */
export function deindexVulnerabilityMoment(userId, momentId) {
    onStoreChange({
        storeType: 'trust',
        changeType: 'delete',
        userId,
        entityType: 'vulnerability_moment',
        entityId: momentId,
        content: '',
    });
    log.debug({ userId, id: momentId }, 'Vulnerability moment removed from index');
}
/**
 * Index a trust milestone
 * @deprecated Use `onTrustMilestoneChange` from `../hooks/trust-hooks.js` instead
 */
export function indexTrustMilestone(userId, milestone, changeType = 'update') {
    // Use the standardized hook
    onTrustMilestoneChange(userId, milestone.id, {
        milestone: milestone.milestone,
        significance: milestone.evidence || '',
        stage: milestone.level || 'growing',
    }, changeType);
    log.debug({ userId, id: milestone.id }, 'Trust milestone indexed via hook');
}
/**
 * Remove a trust milestone from semantic index
 */
export function deindexTrustMilestone(userId, milestoneId) {
    onStoreChange({
        storeType: 'trust',
        changeType: 'delete',
        userId,
        entityType: 'trust_milestone',
        entityId: milestoneId,
        content: '',
    });
    log.debug({ userId, id: milestoneId }, 'Trust milestone removed from index');
}
/**
 * Index a life event/milestone
 */
export function indexLifeEvent(userId, event, changeType = 'update') {
    // Use trust milestone hook for life events
    onTrustMilestoneChange(userId, event.id, {
        milestone: event.event,
        significance: event.significance || '',
        stage: 'established',
        date: event.date,
    }, changeType);
    log.debug({ userId, id: event.id }, 'Life event indexed via hook');
}
/**
 * Remove a life event from semantic index
 */
export function deindexLifeEvent(userId, eventId) {
    onStoreChange({
        storeType: 'trust',
        changeType: 'delete',
        userId,
        entityType: 'trust_milestone', // Life events use trust_milestone
        entityId: eventId,
        content: '',
    });
    log.debug({ userId, id: eventId }, 'Life event removed from index');
}
/**
 * Index learning style insights
 */
export function indexLearningStyle(userId, style, changeType = 'update') {
    const contentParts = [
        `Learning style: ${style.style}.`,
        style.preferences ? `Preferences: ${style.preferences}.` : '',
        style.whatWorks ? `What works: ${style.whatWorks}.` : '',
    ].filter(Boolean);
    onStoreChange({
        storeType: 'trust',
        changeType,
        userId,
        entityType: 'coaching_insight',
        entityId: style.id,
        content: contentParts.join(' '),
        metadata: {
            insightType: 'learning_style',
        },
    });
    log.debug({ userId, id: style.id }, 'Learning style indexed');
}
/**
 * Remove learning style insight from semantic index
 */
export function deindexLearningStyle(userId, styleId) {
    onStoreChange({
        storeType: 'trust',
        changeType: 'delete',
        userId,
        entityType: 'coaching_insight', // Learning styles use coaching_insight
        entityId: styleId,
        content: '',
    });
    log.debug({ userId, id: styleId }, 'Learning style removed from index');
}
/**
 * Index a curiosity mention for semantic search
 * "You mentioned Sam a few weeks ago. How are they?"
 */
export function indexCuriosityMention(userId, mention, changeType = 'update') {
    const contentParts = [
        `User mentioned ${mention.entity} (${mention.entityType}).`,
        `Context: ${mention.originalContext}.`,
        `Priority: ${mention.priority}.`,
        mention.followUpEligible ? 'Still needs follow-up.' : 'Already followed up.',
    ].filter(Boolean);
    onStoreChange({
        storeType: 'trust',
        changeType,
        userId,
        entityType: 'curiosity_mention',
        entityId: mention.id,
        content: contentParts.join(' '),
        metadata: {
            entityType: mention.entityType,
            priority: mention.priority,
            followUpEligible: mention.followUpEligible,
            date: mention.mentionedAt instanceof Date
                ? mention.mentionedAt.toISOString()
                : mention.mentionedAt,
        },
    });
    log.debug({ userId, entity: mention.entity, type: mention.entityType }, 'Curiosity mention indexed');
}
/**
 * Remove curiosity mention from semantic index (e.g., after follow-up)
 */
export function deindexCuriosityMention(userId, mentionId) {
    onStoreChange({
        storeType: 'trust',
        changeType: 'delete',
        userId,
        entityType: 'curiosity_mention',
        entityId: mentionId,
        content: '',
    });
    log.debug({ userId, id: mentionId }, 'Curiosity mention removed from index');
}
/**
 * Index a between-session thinking moment
 * "I've been thinking about what you said..."
 */
export function indexBetweenSessionThinking(userId, thinking, changeType = 'update') {
    const contentParts = [
        `Between-session reflection: ${thinking.topic}.`,
        `Ferni's thought: ${thinking.reflection}.`,
        `Depth: ${thinking.depth}.`,
        thinking.emotionalTone ? `Emotional tone: ${thinking.emotionalTone}.` : '',
    ].filter(Boolean);
    onStoreChange({
        storeType: 'trust',
        changeType,
        userId,
        entityType: 'between_session_thinking',
        entityId: thinking.id,
        content: contentParts.join(' '),
        metadata: {
            depth: thinking.depth,
            sessionNumber: thinking.sessionNumber,
            emotionalTone: thinking.emotionalTone,
            date: thinking.createdAt instanceof Date ? thinking.createdAt.toISOString() : thinking.createdAt,
        },
    });
    log.debug({ userId, topic: thinking.topic, depth: thinking.depth }, 'Between-session thinking indexed');
}
/**
 * Remove between-session thinking from semantic index
 */
export function deindexBetweenSessionThinking(userId, thinkingId) {
    onStoreChange({
        storeType: 'trust',
        changeType: 'delete',
        userId,
        entityType: 'between_session_thinking',
        entityId: thinkingId,
        content: '',
    });
    log.debug({ userId, id: thinkingId }, 'Between-session thinking removed from index');
}
/**
 * Index a persona growth moment
 * "You've changed how I think about this"
 */
export function indexPersonaGrowth(userId, growth, changeType = 'update') {
    const contentParts = [
        `Persona ${growth.personaId} grew: ${growth.description}.`,
        `Growth type: ${growth.growthType}.`,
        `User's influence: ${growth.userInfluence}.`,
    ].filter(Boolean);
    onStoreChange({
        storeType: 'trust',
        changeType,
        userId,
        entityType: 'persona_growth',
        entityId: growth.id,
        content: contentParts.join(' '),
        metadata: {
            personaId: growth.personaId,
            growthType: growth.growthType,
            date: growth.date instanceof Date ? growth.date.toISOString() : growth.date,
        },
    });
    log.debug({ userId, personaId: growth.personaId, growthType: growth.growthType }, 'Persona growth indexed');
}
/**
 * Remove persona growth from semantic index
 */
export function deindexPersonaGrowth(userId, growthId) {
    onStoreChange({
        storeType: 'trust',
        changeType: 'delete',
        userId,
        entityType: 'persona_growth',
        entityId: growthId,
        content: '',
    });
    log.debug({ userId, id: growthId }, 'Persona growth removed from index');
}
//# sourceMappingURL=trust-integration.js.map