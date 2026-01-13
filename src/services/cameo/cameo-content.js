/**
 * Cameo Content Generation
 *
 * Handles persona-specific content for cameos including:
 * - Introduction phrases (how they pop in)
 * - Handback phrases (how they return to Ferni)
 * - Context-aware greetings
 * - First-time vs returning cameo variations
 */
import { getPersonaColor as getBrandPersonaColor, getPersonaGlowColor as getBrandPersonaGlowColor, } from '../../config/brand-colors.js';
import { getLogger } from '../../utils/safe-logger.js';
import { PERSONA_CAMEO_CONFIGS, getRandomHandback, getRandomIntroduction } from './cameo-timing.js';
const log = getLogger();
// ============================================================================
// FIRST-TIME CAMEO INTRODUCTIONS
// ============================================================================
/**
 * Special introductions for when a persona does their FIRST cameo of the session.
 * These are warmer and more personal than repeat cameos.
 */
const FIRST_TIME_INTRODUCTIONS = {
    'peter-john': [
        'Hey! Peter here. Ferni mentioned I might have something useful—',
        "Oh hi! I'm Peter, the data guy. Quick thought—",
        'Peter jumping in! Been looking at your numbers and—',
    ],
    'alex-chen': [
        'Hey there! Alex here. Ferni thought I should mention—',
        "Hi! I'm Alex, handling your schedule stuff. Quick note—",
        'Alex popping in! Saw something on your calendar—',
    ],
    'maya-santos': [
        'Hey! Maya here. Ferni thought I should check in—',
        "Hi there! I'm Maya, your habits friend. Small thing—",
        'Maya jumping in! Just wanted to say—',
    ],
    'jordan-taylor': [
        'Oh hey! Jordan here! Ferni mentioned your plans and I got excited—',
        "Hi! I'm Jordan, the planning enthusiast! Quick thought—",
        "Jordan popping in! I couldn't resist—",
    ],
    'nayan-patel': [
        'Namaskaram. Nayan here. A moment of wisdom, if I may—',
        "Hello, friend. I'm Nayan. Ferni thought you might appreciate—",
        'Nayan speaking. A perspective to consider—',
    ],
};
/**
 * Introductions for subsequent cameos (they've met before this session)
 */
const RETURNING_INTRODUCTIONS = {
    'peter-john': [
        'Peter again! Another data point—',
        'Me again! Found something else—',
        'Quick update from Peter—',
    ],
    'alex-chen': [
        'Alex again! One more thing—',
        'Back with another thought—',
        'Quick follow-up from Alex—',
    ],
    'maya-santos': [
        'Maya again! Just one more thing—',
        'Back for a quick check-in—',
        'One more gentle nudge—',
    ],
    'jordan-taylor': [
        "Jordan again! Couldn't help it—",
        'Back with more excitement!',
        'Me again! Just had to share—',
    ],
    'nayan-patel': ['Nayan once more—', 'Another thought, friend—', 'A further reflection—'],
};
// ============================================================================
// TRIGGER-SPECIFIC GREETINGS
// ============================================================================
/**
 * Context-aware greetings based on what triggered the cameo
 */
const TRIGGER_GREETINGS = {
    data_insight: {
        'peter-john': [
            'Found something in the numbers—',
            "The data's telling a story—",
            'Interesting pattern here—',
        ],
        'alex-chen': ['Quick data point—'],
        'maya-santos': ['Noticed a trend in your habits—'],
        'jordan-taylor': ['Looking at your progress—'],
        'nayan-patel': ['The patterns reveal—'],
    },
    scheduling: {
        'peter-john': ['Your schedule affects the numbers—'],
        'alex-chen': [
            'Saw something on your calendar—',
            'Quick scheduling heads up—',
            'About your upcoming week—',
        ],
        'maya-santos': ['Your routine has a gap—'],
        'jordan-taylor': ['Perfect timing for planning—'],
        'nayan-patel': ['Time, used wisely—'],
    },
    habit_check: {
        'peter-john': ['Tracking shows something—'],
        'alex-chen': ['Reminder about your routine—'],
        'maya-santos': ['Quick habit check-in—', 'About your streak—', 'Noticing your progress—'],
        'jordan-taylor': ['Your habits connect to your goals—'],
        'nayan-patel': ['Small actions, compound—'],
    },
    planning: {
        'peter-john': ['The projections suggest—'],
        'alex-chen': ['For your timeline—'],
        'maya-santos': ['Building the habit foundation—'],
        'jordan-taylor': [
            'Oh! This fits perfectly—',
            'Love where this is going!',
            'Your plan is taking shape—',
        ],
        'nayan-patel': ['The long path begins—'],
    },
    wisdom: {
        'peter-john': ['The data has wisdom—'],
        'alex-chen': ['A practical thought—'],
        'maya-santos': ['The gentle path forward—'],
        'jordan-taylor': ['Dream big, but—'],
        'nayan-patel': ['Consider this—', 'A moment of reflection—', 'The sage view—'],
    },
    celebration: {
        'peter-john': ['The numbers confirm it—'],
        'alex-chen': ['Let me mark this moment—'],
        'maya-santos': ["Look at what you've built—"],
        'jordan-taylor': ['This is amazing!', 'Celebrating with you!', 'So proud of you!'],
        'nayan-patel': ['A milestone on your journey—'],
    },
    support: {
        'peter-john': ["I see what you're facing—"],
        'alex-chen': ['Here to help lighten the load—'],
        'maya-santos': [
            'Taking it one step at a time—',
            "You've got this—",
            'Small progress is still progress—',
        ],
        'jordan-taylor': ['Better days ahead—'],
        'nayan-patel': [
            'This too shall pass—',
            'Strength in the storm—',
            'The difficult path builds character—',
        ],
    },
    expertise: {
        'peter-john': ['My area of expertise—', 'Let me dig into this—'],
        'alex-chen': ['I can help with this—', 'This is my specialty—'],
        'maya-santos': ['This is what I do—', 'Let me share what works—'],
        'jordan-taylor': ['Planning is my jam!', 'I live for this stuff—'],
        'nayan-patel': ['Wisdom for this moment—', 'Ancient knowledge applies—'],
    },
    manual: {
        'peter-john': ['Ferni asked me to jump in—'],
        'alex-chen': ['Ferni thought I could help—'],
        'maya-santos': ['Ferni wanted me to share—'],
        'jordan-taylor': ['Ferni sent me over!'],
        'nayan-patel': ['Ferni suggested I speak—'],
    },
};
// ============================================================================
// HANDBACK VARIATIONS
// ============================================================================
/**
 * Handback phrases that acknowledge what was just discussed
 */
const CONTEXTUAL_HANDBACKS = {
    data_insight: {
        'peter-john': ["Anyway, numbers don't lie. Ferni?", "That's the data talking. Back to Ferni!"],
        'alex-chen': ['Hope that helps! Ferni?'],
        'maya-santos': ['Small data, big picture. Ferni?'],
        'jordan-taylor': ['Love seeing progress! Ferni?'],
        'nayan-patel': ['Patterns guide us. Ferni?'],
    },
    scheduling: {
        'peter-john': ['Time is valuable. Ferni?'],
        'alex-chen': ['Calendar sorted! Back to Ferni!', 'Just wanted you to know. Ferni?'],
        'maya-santos': ['Routine is everything. Ferni?'],
        'jordan-taylor': ['Time for great things! Ferni?'],
        'nayan-patel': ['Use time wisely. Ferni?'],
    },
    habit_check: {
        'peter-john': ['Consistency shows in the data. Ferni?'],
        'alex-chen': ['Keep it up! Ferni?'],
        'maya-santos': ['One day at a time. Back to Ferni!', "You're doing great. Ferni?"],
        'jordan-taylor': ['Habits build dreams! Ferni?'],
        'nayan-patel': ['Drop by drop, the pot fills. Ferni?'],
    },
    planning: {
        'peter-john': ['The projections look good. Ferni?'],
        'alex-chen': ['Plan in place! Ferni?'],
        'maya-santos': ['Small steps matter. Ferni?'],
        'jordan-taylor': [
            "So exciting! Can't wait! Ferni's got this!",
            'Dreams becoming reality! Ferni?',
        ],
        'nayan-patel': ['The journey of a thousand miles... Ferni?'],
    },
    wisdom: {
        'peter-john': ['Data is wisdom. Ferni?'],
        'alex-chen': ['Practical wisdom! Ferni?'],
        'maya-santos': ['Gentle progress. Ferni?'],
        'jordan-taylor': ['Wisdom in action! Ferni?'],
        'nayan-patel': ['May it serve you. Namaskaram.', 'The wise path unfolds. Ferni?'],
    },
    celebration: {
        'peter-john': ['Well earned! Ferni?'],
        'alex-chen': ['Congrats! Ferni?'],
        'maya-santos': ['So proud of you! Ferni?'],
        'jordan-taylor': ['Yay!!! Okay, back to Ferni!', 'This is so great! Ferni?'],
        'nayan-patel': ['A moment to savor. Ferni?'],
    },
    support: {
        'peter-john': ["You've got this. Ferni?"],
        'alex-chen': ['Here for you. Ferni?'],
        'maya-santos': ['One breath at a time. Ferni?', "You're not alone. Ferni?"],
        'jordan-taylor': ['Better days coming! Ferni?'],
        'nayan-patel': ['Strength within you. Ferni?', 'This too shall pass. Namaskaram.'],
    },
    expertise: {
        'peter-john': ["That's my take. Ferni?"],
        'alex-chen': ['Hope that helps! Ferni?'],
        'maya-santos': ['Give it a try! Ferni?'],
        'jordan-taylor': ['Go make it happen! Ferni?'],
        'nayan-patel': ['Apply as you see fit. Ferni?'],
    },
    manual: {
        'peter-john': ["That's what I've got. Ferni?"],
        'alex-chen': ['Alright, back to Ferni!'],
        'maya-santos': ['Okay, stepping back! Ferni?'],
        'jordan-taylor': ["Okay okay, Ferni's turn!"],
        'nayan-patel': ['And so. Ferni?'],
    },
};
// ============================================================================
// CONTENT GENERATION FUNCTIONS
// ============================================================================
/**
 * Get a greeting for a cameo based on context
 */
export function getCameoGreeting(personaId, options) {
    // Use custom greeting if provided
    if (options.customGreeting) {
        return options.customGreeting;
    }
    // First-time cameos get special treatment
    if (options.isFirstCameo) {
        const firstTimeGreetings = FIRST_TIME_INTRODUCTIONS[personaId];
        if (firstTimeGreetings?.length > 0) {
            return firstTimeGreetings[Math.floor(Math.random() * firstTimeGreetings.length)];
        }
    }
    // Try trigger-specific greeting
    if (options.triggerType) {
        const triggerGreetings = TRIGGER_GREETINGS[options.triggerType]?.[personaId];
        if (triggerGreetings?.length > 0) {
            return triggerGreetings[Math.floor(Math.random() * triggerGreetings.length)];
        }
    }
    // Returning cameo
    if (!options.isFirstCameo) {
        const returningGreetings = RETURNING_INTRODUCTIONS[personaId];
        if (returningGreetings?.length > 0) {
            return returningGreetings[Math.floor(Math.random() * returningGreetings.length)];
        }
    }
    // Fall back to default introductions
    return getRandomIntroduction(personaId);
}
/**
 * Get a handback phrase for a cameo
 */
export function getCameoHandback(personaId, options) {
    // Use custom handback if provided
    if (options.customHandback) {
        return options.customHandback;
    }
    // Try trigger-specific handback
    if (options.triggerType) {
        const triggerHandbacks = CONTEXTUAL_HANDBACKS[options.triggerType]?.[personaId];
        if (triggerHandbacks?.length > 0) {
            return triggerHandbacks[Math.floor(Math.random() * triggerHandbacks.length)];
        }
    }
    // Fall back to default handbacks
    return getRandomHandback(personaId);
}
/**
 * Build complete cameo speech (greeting + insight + handback)
 */
export function buildCameoSpeech(personaId, insight, options) {
    const greeting = getCameoGreeting(personaId, {
        isFirstCameo: options.isFirstCameo,
        triggerType: options.triggerType,
        customGreeting: options.customGreeting,
    });
    const handback = getCameoHandback(personaId, {
        triggerType: options.triggerType,
        customHandback: options.customHandback,
    });
    // Build full speech with natural pauses
    const fullSpeech = `${greeting} ${insight} ${handback}`;
    log.debug('Built cameo speech', {
        personaId,
        greeting,
        insightLength: insight.length,
        handback,
    });
    return {
        greeting,
        insight,
        handback,
        fullSpeech,
    };
}
/**
 * Get all trigger topics for a persona (for detection)
 */
export function getTriggerTopicsForPersona(personaId) {
    return PERSONA_CAMEO_CONFIGS[personaId]?.triggerTopics || [];
}
/**
 * Get the best persona for a given topic
 */
export function getBestPersonaForTopic(topic) {
    const topicLower = topic.toLowerCase();
    for (const [personaId, config] of Object.entries(PERSONA_CAMEO_CONFIGS)) {
        for (const triggerTopic of config.triggerTopics) {
            if (topicLower.includes(triggerTopic.toLowerCase())) {
                return personaId;
            }
        }
    }
    return null;
}
/**
 * Get persona color for UI transitions
 * Uses centralized brand colors with cameo config override
 */
export function getPersonaColor(personaId) {
    // Prefer cameo config, fall back to centralized brand colors
    return PERSONA_CAMEO_CONFIGS[personaId]?.color || getBrandPersonaColor(personaId);
}
/**
 * Get persona glow color for avatar effects
 * Uses centralized brand colors with cameo config override
 */
export function getPersonaGlowColor(personaId) {
    // Prefer cameo config, fall back to centralized brand colors
    return PERSONA_CAMEO_CONFIGS[personaId]?.glowColor || getBrandPersonaGlowColor(personaId);
}
/**
 * Check if persona tends to be energetic in cameos
 */
export function isPersonaEnergetic(personaId) {
    return PERSONA_CAMEO_CONFIGS[personaId]?.isEnergetic || false;
}
// ============================================================================
// EXPORTS
// ============================================================================
export { CONTEXTUAL_HANDBACKS, FIRST_TIME_INTRODUCTIONS, RETURNING_INTRODUCTIONS, TRIGGER_GREETINGS, };
export default {
    getCameoGreeting,
    getCameoHandback,
    buildCameoSpeech,
    getTriggerTopicsForPersona,
    getBestPersonaForTopic,
    getPersonaColor,
    getPersonaGlowColor,
    isPersonaEnergetic,
};
//# sourceMappingURL=cameo-content.js.map