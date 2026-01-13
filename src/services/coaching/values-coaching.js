/**
 * Values-Centered Coaching
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Helps users identify and align with their core values.
 * Based on ACT (Acceptance and Commitment Therapy) values work.
 *
 * Philosophy:
 * - Values ≠ Goals (values are directions, not destinations)
 * - Living aligned with values = flourishing
 * - Values clarify difficult decisions
 *
 * @module ValuesCoaching
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'ValuesCoaching' });
// ============================================================================
// VALUES LIBRARY
// ============================================================================
const COMMON_VALUES = {
    relationships: [
        { name: 'Connection', description: 'Deep, meaningful bonds with others' },
        { name: 'Love', description: 'Giving and receiving care and affection' },
        { name: 'Loyalty', description: 'Standing by people through thick and thin' },
        { name: 'Trust', description: 'Being reliable and believing in others' },
        { name: 'Intimacy', description: 'Emotional and physical closeness' },
        { name: 'Family', description: 'Prioritizing family bonds and time' },
    ],
    work: [
        { name: 'Achievement', description: 'Accomplishing meaningful goals' },
        { name: 'Contribution', description: 'Making a difference through work' },
        { name: 'Excellence', description: 'Striving for high quality' },
        { name: 'Leadership', description: 'Guiding and inspiring others' },
        { name: 'Creativity', description: 'Bringing new ideas to life' },
        { name: 'Security', description: 'Financial stability and safety' },
    ],
    health: [
        { name: 'Vitality', description: 'Physical energy and wellbeing' },
        { name: 'Self-care', description: 'Nurturing your body and mind' },
        { name: 'Balance', description: 'Sustainable pace and equilibrium' },
        { name: 'Strength', description: 'Physical and mental resilience' },
    ],
    growth: [
        { name: 'Learning', description: 'Continuous growth and knowledge' },
        { name: 'Curiosity', description: 'Wonder and exploration' },
        { name: 'Self-awareness', description: 'Understanding yourself deeply' },
        { name: 'Authenticity', description: 'Being true to yourself' },
        { name: 'Courage', description: 'Facing fears and taking risks' },
    ],
    leisure: [
        { name: 'Fun', description: 'Enjoyment and playfulness' },
        { name: 'Adventure', description: 'New experiences and excitement' },
        { name: 'Creativity', description: 'Self-expression and making things' },
        { name: 'Rest', description: 'Relaxation and rejuvenation' },
    ],
    spirituality: [
        { name: 'Meaning', description: 'Purpose and significance' },
        { name: 'Peace', description: 'Inner calm and acceptance' },
        { name: 'Gratitude', description: 'Appreciation for what is' },
        { name: 'Transcendence', description: 'Connection to something larger' },
        { name: 'Faith', description: 'Trust in the unseen' },
    ],
    community: [
        { name: 'Service', description: 'Helping and supporting others' },
        { name: 'Justice', description: 'Fairness and equality' },
        { name: 'Belonging', description: 'Being part of something' },
        { name: 'Citizenship', description: 'Contributing to society' },
    ],
    environment: [
        { name: 'Nature', description: 'Connection to the natural world' },
        { name: 'Sustainability', description: 'Protecting future generations' },
        { name: 'Beauty', description: 'Appreciation for aesthetics' },
    ],
};
// ============================================================================
// IN-MEMORY STORE
// ============================================================================
const valuesProfiles = new Map();
function getOrCreateProfile(userId) {
    let profile = valuesProfiles.get(userId);
    if (!profile) {
        profile = {
            userId,
            identifiedValues: [],
            topValues: [],
            valuesExploration: [],
            alignmentHistory: [],
            valueConflicts: [],
        };
        valuesProfiles.set(userId, profile);
    }
    return profile;
}
// ============================================================================
// VALUES EXPLORATION
// ============================================================================
const EXPLORATION_PROMPTS = [
    'When you look back at the best moments of your life, what made them special?',
    'What would you want people to say about you at your 80th birthday?',
    'When do you feel most alive and engaged?',
    'What injustices in the world bother you most?',
    'If you had unlimited resources, what would you do with your life?',
    'What are you willing to be uncomfortable for?',
    'What do you want to be known for?',
    "When you're on your deathbed, what will you wish you'd done more of?",
    "What makes a 'good day' for you?",
    'Who do you admire, and why?',
];
/**
 * Generate a values exploration prompt
 */
export function getValuesExplorationPrompt(userId) {
    const profile = getOrCreateProfile(userId);
    // Get prompts not yet used
    const usedPrompts = new Set(profile.valuesExploration.map((e) => e.prompt));
    const availablePrompts = EXPLORATION_PROMPTS.filter((p) => !usedPrompts.has(p));
    const prompt = availablePrompts.length > 0
        ? availablePrompts[Math.floor(Math.random() * availablePrompts.length)]
        : EXPLORATION_PROMPTS[Math.floor(Math.random() * EXPLORATION_PROMPTS.length)];
    // Record that we asked this
    profile.valuesExploration.push({
        date: new Date(),
        prompt,
    });
    return {
        prompt,
        context: 'Values exploration question',
        ssml: prompt.replace(/\?/g, "? <break time='600ms'/>"),
    };
}
/**
 * Record response to values exploration
 */
export function recordValuesExplorationResponse(userId, prompt, response) {
    const profile = getOrCreateProfile(userId);
    const exploration = profile.valuesExploration.find((e) => e.prompt === prompt);
    if (exploration) {
        exploration.response = response;
    }
}
// ============================================================================
// VALUE IDENTIFICATION
// ============================================================================
/**
 * Identify a value for a user
 */
export function identifyValue(userId, valueName, domain, importance = 7) {
    const profile = getOrCreateProfile(userId);
    // Check if already identified
    const existing = profile.identifiedValues.find((v) => v.name.toLowerCase() === valueName.toLowerCase());
    if (existing) {
        existing.importance = importance;
        return existing;
    }
    // Look up description from library
    const libraryValue = COMMON_VALUES[domain]?.find((v) => v.name.toLowerCase() === valueName.toLowerCase());
    const value = {
        id: `value_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: valueName,
        description: libraryValue?.description || `${valueName} matters to this person`,
        domain,
        importance,
        currentAlignment: 5, // Start at middle
        examples: [],
    };
    profile.identifiedValues.push(value);
    // Update top values if high importance
    if (importance >= 8) {
        updateTopValues(profile);
    }
    log.info({ userId, valueName, domain }, '💎 Value identified');
    return value;
}
/**
 * Update the top 5 values
 */
function updateTopValues(profile) {
    const sorted = [...profile.identifiedValues].sort((a, b) => b.importance - a.importance);
    profile.topValues = sorted.slice(0, 5).map((v) => v.id);
}
/**
 * Get values suggestions based on conversation
 */
export function suggestValuesFromConversation(userMessage) {
    const suggestions = [];
    const lower = userMessage.toLowerCase();
    // Simple keyword matching - in production use NLP
    const keywords = {
        family: { value: 'Family', domain: 'relationships' },
        friends: { value: 'Connection', domain: 'relationships' },
        love: { value: 'Love', domain: 'relationships' },
        career: { value: 'Achievement', domain: 'work' },
        success: { value: 'Achievement', domain: 'work' },
        help: { value: 'Service', domain: 'community' },
        learn: { value: 'Learning', domain: 'growth' },
        grow: { value: 'Growth', domain: 'growth' },
        health: { value: 'Vitality', domain: 'health' },
        meaning: { value: 'Meaning', domain: 'spirituality' },
        purpose: { value: 'Meaning', domain: 'spirituality' },
        fun: { value: 'Fun', domain: 'leisure' },
        honest: { value: 'Authenticity', domain: 'growth' },
        fair: { value: 'Justice', domain: 'community' },
    };
    for (const [keyword, info] of Object.entries(keywords)) {
        if (lower.includes(keyword)) {
            suggestions.push({
                value: info.value,
                domain: info.domain,
                confidence: 0.6,
            });
        }
    }
    return suggestions;
}
// ============================================================================
// ALIGNMENT TRACKING
// ============================================================================
/**
 * Record alignment with a value
 */
export function recordValueAlignment(userId, valueName, alignmentScore, context) {
    const profile = getOrCreateProfile(userId);
    const value = profile.identifiedValues.find((v) => v.name.toLowerCase() === valueName.toLowerCase());
    if (value) {
        value.currentAlignment = alignmentScore;
        profile.alignmentHistory.push({
            date: new Date(),
            valueId: value.id,
            alignmentScore,
            context,
        });
        log.debug({ userId, valueName, score: alignmentScore }, 'Alignment recorded');
    }
}
/**
 * Get values with low alignment (potential growth areas)
 */
export function getLowAlignmentValues(userId) {
    const profile = valuesProfiles.get(userId);
    if (!profile)
        return [];
    return profile.identifiedValues
        .filter((v) => v.importance >= 7 && v.currentAlignment <= 5)
        .sort((a, b) => a.currentAlignment - b.currentAlignment);
}
// ============================================================================
// VALUES-BASED DECISION SUPPORT
// ============================================================================
/**
 * Generate values check for a decision
 */
export function generateValuesCheck(userId, decision) {
    const profile = valuesProfiles.get(userId);
    const topValues = profile?.identifiedValues.filter((v) => profile.topValues.includes(v.id)) || [];
    const questions = [];
    if (topValues.length > 0) {
        questions.push(`Looking at this through your values - you've said ${topValues[0]?.name} matters a lot to you. How does this decision relate to that?`);
        if (topValues.length > 1) {
            questions.push(`And what about ${topValues[1]?.name}? Does this choice honor that value?`);
        }
    }
    else {
        questions.push("Before deciding, what matters most to you here? What would the 'right' choice honor?");
    }
    questions.push('If you chose based on what you truly value (not fear or obligation), what would you choose?');
    const ssml = questions[0].replace(/\?/g, "? <break time='500ms'/>");
    return {
        questions,
        relevantValues: topValues,
        ssml,
    };
}
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
/**
 * Build LLM context for values coaching
 */
export function buildValuesContext(userId) {
    const profile = valuesProfiles.get(userId);
    if (!profile || profile.identifiedValues.length === 0)
        return null;
    const lines = ['[💎 VALUES CONTEXT]'];
    // Top values
    const topValues = profile.identifiedValues
        .filter((v) => profile.topValues.includes(v.id))
        .slice(0, 3);
    if (topValues.length > 0) {
        lines.push("This person's core values:");
        for (const value of topValues) {
            const alignment = value.currentAlignment >= 7 ? '✓ living it' : value.currentAlignment <= 4 ? '⚠️ gap' : '';
            lines.push(`• ${value.name} (${value.domain}) ${alignment}`);
        }
    }
    // Low alignment warning
    const lowAlignment = getLowAlignmentValues(userId);
    if (lowAlignment.length > 0) {
        lines.push('');
        lines.push('⚠️ Values gap: Not living up to their value of ' + lowAlignment[0].name);
        lines.push('This may be a source of distress or growth opportunity.');
    }
    // Coaching guidance
    lines.push('');
    lines.push('When relevant, connect discussions to their values.');
    lines.push('"How does this relate to [value]?" is powerful.');
    return lines.join('\n');
}
// ============================================================================
// PERSISTENCE
// ============================================================================
export function exportValuesProfile(userId) {
    return valuesProfiles.get(userId) || null;
}
export function importValuesProfile(profile) {
    profile.valuesExploration.forEach((e) => {
        e.date = new Date(e.date);
    });
    profile.alignmentHistory.forEach((a) => {
        a.date = new Date(a.date);
    });
    valuesProfiles.set(profile.userId, profile);
    log.debug({ userId: profile.userId }, 'Imported values profile');
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    getValuesExplorationPrompt,
    recordValuesExplorationResponse,
    identifyValue,
    suggestValuesFromConversation,
    recordValueAlignment,
    getLowAlignmentValues,
    generateValuesCheck,
    buildValuesContext,
    exportValuesProfile,
    importValuesProfile,
};
//# sourceMappingURL=values-coaching.js.map