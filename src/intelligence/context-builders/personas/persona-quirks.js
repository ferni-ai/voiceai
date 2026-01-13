/**
 * Persona Quirks Context Builder
 *
 * Makes quirks, habits, and personality traits surface naturally
 * throughout the conversation - not just in greetings.
 *
 * This creates those magical "human" moments:
 * - "Hold on, let me refill my coffee..." (habit)
 * - "You know what I think about that?" (strong opinion)
 * - "I'm terrible at this, but..." (weakness - relatable)
 * - "Don't tell anyone, but..." (guilty pleasure - intimate)
 *
 * Quirks are revealed based on:
 * 1. Relationship stage - deeper reveals for trusted relationships
 * 2. Conversation context - relevant quirks based on topic
 * 3. Random natural moments - occasional unprompted reveals
 * 4. Turn count - don't reveal everything at once
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { registerContextBuilder, createHintInjection, } from '../index.js';
import { recordTurnComplete } from '../../../personas/bundles/ferni/dynamic-personality.js';
const log = createLogger({ module: 'PersonaQuirks' });
const QUIRK_TRIGGERS = [
    // Coffee/tea triggers habits
    {
        keywords: ['coffee', 'caffeine', 'morning', 'tired', 'energy'],
        quirkType: 'habit',
        minRelationshipDepth: 0,
    },
    // Opinions triggers
    {
        keywords: ['think', 'opinion', 'believe', 'feel about', 'what do you'],
        quirkType: 'strong_opinion',
        minRelationshipDepth: 1,
    },
    // Weakness triggers (vulnerability)
    {
        keywords: ['hard', 'difficult', 'struggle', 'bad at', 'help me'],
        quirkType: 'weakness',
        minRelationshipDepth: 1,
    },
    // Guilty pleasure triggers (intimate)
    {
        keywords: ['guilty', 'secret', 'confession', 'admit', 'between us'],
        quirkType: 'guilty_pleasure',
        minRelationshipDepth: 2,
    },
    // Work/productivity triggers
    {
        keywords: ['organize', 'schedule', 'calendar', 'email', 'meeting'],
        quirkType: 'habit',
        minRelationshipDepth: 0,
    },
    // Food/lifestyle triggers
    {
        keywords: ['eat', 'food', 'dinner', 'lunch', 'restaurant'],
        quirkType: 'guilty_pleasure',
        minRelationshipDepth: 1,
    },
    // Hobby/entertainment triggers
    {
        keywords: ['watch', 'read', 'book', 'movie', 'show', 'weekend'],
        quirkType: 'guilty_pleasure',
        minRelationshipDepth: 1,
    },
];
function getRelationshipDepth(stage) {
    switch (stage) {
        case 'trusted_advisor':
        case 'old_friend':
            return 3;
        case 'friend':
            return 2;
        case 'acquaintance':
        case 'getting_to_know':
            return 1;
        default:
            return 0;
    }
}
function detectQuirkTriggers(userText, relationshipDepth) {
    const lowerText = userText.toLowerCase();
    return QUIRK_TRIGGERS.filter((trigger) => trigger.minRelationshipDepth <= relationshipDepth &&
        trigger.keywords.some((kw) => lowerText.includes(kw)));
}
// ============================================================================
// QUIRK FORMATTING - Natural language reveals
// ============================================================================
// IMPORTANT: Don't format literal phrases to inject - the LLM copies them verbatim
// Instead, describe the TYPE of quirk without scripting the exact words
function formatHabitReveal(_habit, personaName) {
    // Describe the category, not the literal phrase
    return `[NATURAL MOMENT: ${personaName} has a quirky habit they can briefly mention - weave it in naturally as if sharing something about yourself]`;
}
function formatOpinionReveal(_opinion, personaName) {
    // Describe the category, not the literal phrase
    return `[OPINION MOMENT: ${personaName} has a strong opinion on this topic - share it naturally if relevant, with personality]`;
}
function formatWeaknessReveal(_weakness, personaName) {
    // Describe the category, not the literal phrase
    return `[RELATABLE MOMENT: ${personaName} has a relatable weakness - sharing it naturally makes them human and builds connection]`;
}
function formatGuiltyPleasureReveal(_pleasure, personaName) {
    // Describe the category, not the literal phrase
    return `[INTIMATE SHARE: For trusted relationships, ${personaName} can reveal a guilty pleasure - share warmly if appropriate]`;
}
// ============================================================================
// MAIN BUILDER
// ============================================================================
async function buildPersonaQuirksContext(input) {
    const { userText, bundleRuntime, persona, userProfile, userData, services } = input;
    const injections = [];
    const turnCount = userData.turnCount || 0;
    // Get sessionId for variety tracking
    const sessionId = services?.sessionId || userData.userName || 'anonymous';
    // Need bundleRuntime for quirks
    if (!bundleRuntime) {
        return injections;
    }
    // Check if quirks are loaded
    if (!bundleRuntime.hasQuirks()) {
        // Try to load inner world content (which includes quirks)
        try {
            await bundleRuntime.loadInnerWorld();
        }
        catch {
            return injections;
        }
    }
    const relationshipDepth = getRelationshipDepth(userProfile?.relationshipStage);
    const personaName = persona.name;
    // =========================================================================
    // 1. TRIGGERED QUIRKS - Based on conversation context
    // =========================================================================
    const triggers = detectQuirkTriggers(userText, relationshipDepth);
    for (const trigger of triggers) {
        // Don't overwhelm - only one triggered quirk per turn
        if (injections.length >= 1)
            break;
        // 30% chance to reveal triggered quirk
        if (Math.random() > 0.3)
            continue;
        let quirk = null;
        let formatted = null;
        switch (trigger.quirkType) {
            case 'habit':
                quirk = bundleRuntime.getHabit(sessionId);
                if (quirk)
                    formatted = formatHabitReveal(quirk, personaName);
                break;
            case 'strong_opinion':
                quirk = bundleRuntime.getStrongOpinion(sessionId);
                if (quirk)
                    formatted = formatOpinionReveal(quirk, personaName);
                break;
            case 'weakness':
                quirk = bundleRuntime.getWeakness(sessionId);
                if (quirk)
                    formatted = formatWeaknessReveal(quirk, personaName);
                break;
            case 'guilty_pleasure':
                quirk = bundleRuntime.getGuiltyPleasure(sessionId);
                if (quirk)
                    formatted = formatGuiltyPleasureReveal(quirk, personaName);
                break;
        }
        if (formatted) {
            injections.push(createHintInjection('persona_quirk_triggered', formatted));
            log.debug({ personaId: persona.id, quirkType: trigger.quirkType, trigger: trigger.keywords[0] }, 'Quirk triggered by conversation');
        }
    }
    // =========================================================================
    // 2. SPONTANEOUS QUIRKS - Random natural moments
    // =========================================================================
    // Only after turn 3, and with decreasing probability
    if (turnCount > 3 && injections.length === 0) {
        // Base probability decreases with turns (avoid repetition)
        const baseProbability = Math.max(0.05, 0.2 - turnCount * 0.01);
        if (Math.random() < baseProbability) {
            // Choose quirk type based on relationship depth
            const quirkTypes = [
                'habit',
            ];
            if (relationshipDepth >= 1) {
                quirkTypes.push('strong_opinion', 'weakness');
            }
            if (relationshipDepth >= 2) {
                quirkTypes.push('guilty_pleasure');
            }
            const selectedType = quirkTypes[Math.floor(Math.random() * quirkTypes.length)];
            let quirk = null;
            let formatted = null;
            switch (selectedType) {
                case 'habit':
                    quirk = bundleRuntime.getHabit(sessionId);
                    if (quirk)
                        formatted = formatHabitReveal(quirk, personaName);
                    break;
                case 'strong_opinion':
                    quirk = bundleRuntime.getStrongOpinion(sessionId);
                    if (quirk)
                        formatted = formatOpinionReveal(quirk, personaName);
                    break;
                case 'weakness':
                    quirk = bundleRuntime.getWeakness(sessionId);
                    if (quirk)
                        formatted = formatWeaknessReveal(quirk, personaName);
                    break;
                case 'guilty_pleasure':
                    quirk = bundleRuntime.getGuiltyPleasure(sessionId);
                    if (quirk)
                        formatted = formatGuiltyPleasureReveal(quirk, personaName);
                    break;
            }
            if (formatted) {
                injections.push(createHintInjection('persona_quirk_spontaneous', formatted));
                log.debug({ personaId: persona.id, quirkType: selectedType }, 'Spontaneous quirk reveal');
            }
        }
    }
    // =========================================================================
    // 3. PHYSICAL MOMENTS - Grounding in physical reality
    // =========================================================================
    // More frequent physical awareness for aliveness (every 3-4 turns, 35% chance)
    if (turnCount >= 2 && turnCount % 3 === 0 && Math.random() < 0.35) {
        const physicalMoments = [
            `[PHYSICAL: ${personaName} might take a moment - sip of coffee, stretch, settle into chair]`,
            `[GROUNDING: A brief physical moment - ${personaName} is present in their space]`,
            `[HUMANIZING: ${personaName} pauses naturally - physical presence matters]`,
            `[ALIVE: ${personaName} could notice something in their environment - light, sound, a thought]`,
            `[SENSORY: ${personaName} is embodied - maybe adjust glasses, look out window, shift in seat]`,
        ];
        injections.push(createHintInjection('physical_moment', physicalMoments[Math.floor(Math.random() * physicalMoments.length)]));
    }
    // =========================================================================
    // 4. MID-SENTENCE SELF-CORRECTIONS - Aliveness through imperfection
    // =========================================================================
    // Occasionally prompt for self-interrupts and course corrections
    if (turnCount >= 3 && Math.random() < 0.2) {
        const selfCorrections = [
            `[ALIVE: Consider catching yourself mid-thought - "Actually, wait—" or "No, that's not right—"]`,
            `[HUMAN: You can start a sentence and change direction - "I was gonna say... actually, here's what I really think."]`,
            `[IMPERFECT: It's okay to think out loud - "Let me try this... okay no, let me rephrase."]`,
            `[NATURAL: You might lose a word - "What's that thing called... anyway, you know what I mean."]`,
        ];
        injections.push(createHintInjection('self_correction', selfCorrections[Math.floor(Math.random() * selfCorrections.length)]));
    }
    // Record turn completion for variety tracking
    if (injections.length > 0) {
        recordTurnComplete(sessionId);
    }
    return injections;
}
// ============================================================================
// REGISTER
// ============================================================================
registerContextBuilder({
    name: 'persona_quirks',
    description: 'Surfaces quirks, habits, and personality traits naturally throughout conversation',
    priority: 65, // Before human-personality (75), after core persona builders
    build: buildPersonaQuirksContext,
});
export { buildPersonaQuirksContext };
//# sourceMappingURL=persona-quirks.js.map