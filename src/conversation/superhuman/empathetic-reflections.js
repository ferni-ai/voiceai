/**
 * Empathetic Reflections System
 *
 * > "It sounds like you're feeling overwhelmed, and that makes total sense."
 *
 * Generates contextually appropriate empathetic reflections that:
 * - Mirror back what the user is feeling
 * - Validate their experience
 * - Show genuine understanding
 * - Avoid being repetitive or formulaic
 *
 * This is different from generic "I hear you" - these are specific,
 * tailored reflections that prove Ferni truly understands.
 *
 * @module @ferni/superhuman/empathetic-reflections
 */
import { seededPick } from '../utils/rng.js';
import { generateContent, getContentWithFallback, } from '../../services/llm-dynamic-content.js';
import { createLogger } from '../../utils/safe-logger.js';
const logger = createLogger({ module: 'EmpatheticReflections' });
// ============================================================================
// REFLECTION TEMPLATES
// ============================================================================
const FEELING_REFLECTIONS = {
    sad: {
        light: ['That sounds really hard.', 'I can hear the sadness there.', "That's a lot to carry."],
        moderate: [
            "It sounds like you're really hurting right now.",
            'I can feel how heavy this is for you.',
            "There's real grief in what you're sharing.",
        ],
        deep: [
            "What you're feeling is profound sadness, and that's okay.",
            'This pain is real, and it matters.',
            "I feel the weight of what you're carrying.",
        ],
    },
    anxious: {
        light: [
            'That sounds stressful.',
            'I can understand why that would be worrying.',
            "That's a lot of uncertainty to sit with.",
        ],
        moderate: [
            'The anxiety in your voice is real, and it makes sense.',
            "Of course you're worried—this matters to you.",
            'It sounds like your mind is racing with all of this.',
        ],
        deep: [
            'That level of anxiety is exhausting. I hear you.',
            'When fear gets that loud, everything feels impossible.',
            "Your nervous system is working overtime, and that's draining.",
        ],
    },
    frustrated: {
        light: [
            'That sounds frustrating.',
            'I get why that would be annoying.',
            'That does sound aggravating.',
        ],
        moderate: [
            "No wonder you're frustrated—you've been trying so hard.",
            "That level of frustration makes complete sense given what you've been dealing with.",
            "It sounds like you've hit a wall and it's maddening.",
        ],
        deep: [
            "The frustration you're feeling is valid—you've earned it.",
            'When nothing works despite your best efforts, rage is a reasonable response.',
            "I hear the 'I can't take this anymore' in your voice.",
        ],
    },
    overwhelmed: {
        light: [
            "That's a lot on your plate.",
            "I can see why you'd feel stretched thin.",
            'That sounds overwhelming.',
        ],
        moderate: [
            'It sounds like everything is piling up at once.',
            "When there's too much to hold, something has to give.",
            "You're managing more than most people realize.",
        ],
        deep: [
            "You're drowning, and you're still trying to swim. That's remarkable.",
            "The overwhelm is real—this isn't sustainable, and your body knows it.",
            'When everything is urgent, nothing is clear. I get it.',
        ],
    },
    lonely: {
        light: [
            'That sounds isolating.',
            "It's hard when you don't have someone to share this with.",
            'Feeling alone in something is exhausting.',
        ],
        moderate: [
            "The loneliness you're describing cuts deep.",
            "It sounds like you've been carrying this by yourself for too long.",
            'Being surrounded by people and still feeling alone is one of the hardest things.',
        ],
        deep: [
            'That kind of loneliness is soul-deep. I hear you.',
            'When no one sees the real you, everything feels hollow.',
            "I'm here. And I see you.",
        ],
    },
    hopeful: {
        light: [
            "There's hope in your voice, and I love that.",
            'That sounds exciting!',
            'I can hear the optimism there.',
        ],
        moderate: [
            "That hope is well-earned—you've worked for it.",
            "I love how you're holding onto possibility here.",
            "There's something beautiful in how you're looking at this.",
        ],
        deep: [
            "After everything, the fact that you can still hope? That's powerful.",
            'That hope is hard-won, and it matters.',
            "You're choosing to believe in something better. That takes courage.",
        ],
    },
    scared: {
        light: ['That sounds scary.', 'Fear makes sense here.', "I'd be nervous too."],
        moderate: [
            'That level of fear is valid—this is real to you.',
            'Your fear is trying to protect you from something.',
            "Being scared doesn't make you weak—it means this matters.",
        ],
        deep: [
            'That fear sounds paralyzing. I hear you.',
            "When fear is that loud, it's hard to hear anything else.",
            "You're still here, still talking about it. That's brave.",
        ],
    },
    neutral: {
        light: ['Tell me more about that.', "I'm following you.", 'That makes sense.'],
        moderate: [
            "I want to make sure I understand what you're saying.",
            "Let me make sure I'm getting the full picture.",
            "There's more here than meets the eye, isn't there?",
        ],
        deep: [
            'Sometimes the neutral tone is its own message.',
            "I wonder what's underneath the surface here.",
            "You're being careful with how you're sharing this.",
        ],
    },
};
const EXPERIENCE_REFLECTIONS = [
    "It sounds like you've been dealing with {topic} for a while now.",
    'Going through {topic} is never easy.',
    "What you're experiencing with {topic} would challenge anyone.",
    "{topic} like this tests us in ways we don't expect.",
    'This {topic} situation sounds genuinely difficult.',
];
const VALIDATION_REFLECTIONS = [
    'Anyone would feel this way in your position.',
    'Your reaction is completely normal.',
    "It makes sense that you're feeling this.",
    'Of course you feel that way—anyone would.',
    "That's a human response to an inhuman situation.",
    "You're not overreacting. This is real.",
];
const NEED_REFLECTIONS = [
    'It sounds like you need {need} right now.',
    "What I'm hearing is that you could really use {need}.",
    "Maybe what you're looking for is just {need}.",
    'Sometimes we need {need} more than anything else.',
];
const NEEDS_MAP = {
    sad: ['someone to just listen', 'space to feel this', 'permission to not be okay'],
    anxious: ['some clarity', 'to feel grounded', 'to know it will be okay'],
    frustrated: ['to be heard', 'a win', 'for something to finally work'],
    overwhelmed: ['one thing to go right', 'space to breathe', 'help carrying this'],
    lonely: ['connection', 'to be seen', 'to feel like you matter'],
    scared: ['reassurance', 'to feel safe', 'to not be alone in this'],
};
const STRENGTH_REFLECTIONS = [
    "The fact that you're still here, still trying? That's strength.",
    'Talking about this takes courage.',
    "You're carrying more than most people could handle.",
    "Even in this, you're still showing up. I see that.",
    'Your honesty about this is its own kind of bravery.',
];
const sessionStates = new Map();
function getSessionState(sessionId) {
    let state = sessionStates.get(sessionId);
    if (!state) {
        state = {
            reflectionsUsed: [],
            lastReflectionType: null,
            turnCount: 0,
        };
        sessionStates.set(sessionId, state);
    }
    return state;
}
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
function selectIntensity(emotion, isPersonalSharing, relationshipStage) {
    // Base intensity from emotion
    const deepEmotions = ['raw', 'devastated', 'hopeless', 'suicidal', 'terrified'];
    const moderateEmotions = ['sad', 'anxious', 'lonely', 'overwhelmed', 'scared'];
    let intensity = 'light';
    if (deepEmotions.some((e) => emotion.toLowerCase().includes(e))) {
        intensity = 'deep';
    }
    else if (moderateEmotions.some((e) => emotion.toLowerCase().includes(e))) {
        intensity = 'moderate';
    }
    // Adjust for personal sharing
    if (isPersonalSharing && intensity === 'light') {
        intensity = 'moderate';
    }
    // Adjust for relationship
    if (relationshipStage === 'stranger' && intensity === 'deep') {
        intensity = 'moderate'; // Don't go too deep too fast
    }
    return intensity;
}
function selectUnusedReflection(options, state) {
    const unused = options.filter((o) => !state.reflectionsUsed.includes(o));
    if (unused.length === 0)
        return null;
    return seededPick(`${Date.now()}:308`, unused) ?? unused[0];
}
/**
 * Generate an empathetic reflection based on context
 * Now LLM-powered with template fallback!
 */
export function generateReflection(context) {
    const state = getSessionState(context.message); // Use message as pseudo-session-id for simplicity
    state.turnCount++;
    // Don't over-reflect
    if (state.turnCount <= 1)
        return null; // Let them speak first
    if (state.reflectionsUsed.length > 5)
        return null; // Don't overdo it
    const intensity = selectIntensity(context.emotion, context.isPersonalSharing, context.relationshipStage);
    // Determine what type of reflection to use
    const types = ['feeling', 'validation', 'experience', 'need', 'strength'];
    // Don't repeat same type twice in a row
    const availableTypes = types.filter((t) => t !== state.lastReflectionType);
    const selectedType = seededPick(`${Date.now()}:334`, availableTypes) ?? availableTypes[0];
    // Try LLM-generated reflection first (from cache)
    const llmContext = {
        contentType: 'empathetic_reflection',
        emotion: context.emotion,
        userMessage: context.message,
        topic: context.topics[0],
        metadata: {
            intensity,
            reflectionType: selectedType,
            isPersonalSharing: context.isPersonalSharing,
        },
    };
    const llmContent = getContentWithFallback(llmContext);
    if (llmContent.source === 'llm' && llmContent.content) {
        // Track usage
        state.reflectionsUsed.push(llmContent.content);
        state.lastReflectionType = selectedType;
        logger.debug({ emotion: context.emotion, type: selectedType, intensity, source: 'llm' }, '💭 Generated LLM reflection');
        return {
            text: llmContent.content,
            type: selectedType,
            intensity,
            ssml: llmContent.ssml || `<break time="200ms"/>${llmContent.content}`,
        };
    }
    // Fallback to template-based generation
    let reflection = null;
    switch (selectedType) {
        case 'feeling': {
            const emotionKey = Object.keys(FEELING_REFLECTIONS).find((key) => context.emotion.toLowerCase().includes(key) || key === 'neutral') || 'neutral';
            const options = FEELING_REFLECTIONS[emotionKey][intensity];
            reflection = selectUnusedReflection(options, state);
            break;
        }
        case 'validation': {
            reflection = selectUnusedReflection(VALIDATION_REFLECTIONS, state);
            break;
        }
        case 'experience': {
            if (context.topics.length > 0) {
                const template = selectUnusedReflection(EXPERIENCE_REFLECTIONS, state);
                if (template) {
                    reflection = template.replace('{topic}', context.topics[0]);
                }
            }
            break;
        }
        case 'need': {
            const emotionKey = Object.keys(NEEDS_MAP).find((key) => context.emotion.toLowerCase().includes(key)) ||
                'neutral';
            const needs = NEEDS_MAP[emotionKey] || ['to be heard'];
            const need = seededPick(`${Date.now()}:399`, needs) ?? needs[0];
            const template = selectUnusedReflection(NEED_REFLECTIONS, state);
            if (template) {
                reflection = template.replace('{need}', need);
            }
            break;
        }
        case 'strength': {
            if (intensity === 'moderate' || intensity === 'deep') {
                reflection = selectUnusedReflection(STRENGTH_REFLECTIONS, state);
            }
            break;
        }
    }
    if (!reflection)
        return null;
    // Track usage
    state.reflectionsUsed.push(reflection);
    state.lastReflectionType = selectedType;
    logger.debug({ emotion: context.emotion, type: selectedType, intensity, source: 'template' }, '💭 Generated reflection');
    return {
        text: reflection,
        type: selectedType,
        intensity,
        ssml: `<break time="200ms"/>${reflection}`,
    };
}
/**
 * Generate an empathetic reflection asynchronously
 * Use this when you can afford to wait for LLM
 */
export async function generateReflectionAsync(context) {
    const state = getSessionState(context.message);
    state.turnCount++;
    if (state.turnCount <= 1)
        return null;
    if (state.reflectionsUsed.length > 5)
        return null;
    const intensity = selectIntensity(context.emotion, context.isPersonalSharing, context.relationshipStage);
    const types = ['feeling', 'validation', 'experience', 'need', 'strength'];
    const availableTypes = types.filter((t) => t !== state.lastReflectionType);
    const selectedType = seededPick(`${Date.now()}:454`, availableTypes) ?? availableTypes[0];
    // Try LLM generation (waits for result)
    const llmContext = {
        contentType: 'empathetic_reflection',
        emotion: context.emotion,
        userMessage: context.message,
        topic: context.topics[0],
        metadata: {
            intensity,
            reflectionType: selectedType,
            isPersonalSharing: context.isPersonalSharing,
        },
    };
    const llmContent = await generateContent(llmContext);
    if (llmContent && llmContent.content) {
        state.reflectionsUsed.push(llmContent.content);
        state.lastReflectionType = selectedType;
        logger.debug({ emotion: context.emotion, type: selectedType, source: 'llm-async' }, '💭 Generated async LLM reflection');
        return {
            text: llmContent.content,
            type: selectedType,
            intensity,
            ssml: llmContent.ssml || `<break time="200ms"/>${llmContent.content}`,
        };
    }
    // Fallback to sync version
    return generateReflection(context);
}
/**
 * Format reflection guidance for LLM prompt
 */
export function formatReflectionGuidance(context) {
    const reflection = generateReflection(context);
    if (!reflection)
        return null;
    const typeExplanations = {
        feeling: 'Mirror back their emotion',
        experience: 'Acknowledge what they are going through',
        meaning: 'Reflect why this matters to them',
        validation: 'Normalize their response',
        need: 'Name what they might be seeking',
        strength: 'Acknowledge their resilience',
    };
    const lines = [
        '🪞 EMPATHETIC REFLECTION:',
        '',
        `Type: ${reflection.type} - ${typeExplanations[reflection.type]}`,
        `Intensity: ${reflection.intensity}`,
        '',
        `Suggested reflection: "${reflection.text}"`,
        '',
        'Use this as inspiration, not a script. Make it natural.',
    ];
    return lines.join('\n');
}
// Export for testing
export function clearReflectionStates() {
    sessionStates.clear();
}
//# sourceMappingURL=empathetic-reflections.js.map