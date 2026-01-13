/**
 * Digital Twin Profile Context Builder
 *
 * Injects the user's Digital Twin profile into conversation context,
 * enabling the AI to speak and respond in ways that feel genuinely
 * like the user.
 *
 * @module intelligence/context-builders/twin-profile-context
 */
import { getFirestore } from 'firebase-admin/firestore';
import { getLogger } from '../../../utils/safe-logger.js';
import { registerContextBuilder, createStandardInjection, } from '../index.js';
import { BuilderCategory } from '../core/categories.js';
const log = getLogger();
// ============================================================================
// PROFILE RETRIEVAL
// ============================================================================
const profileCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
async function getTwinProfile(userId) {
    // Check cache first
    const cached = profileCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.profile;
    }
    try {
        const db = getFirestore();
        const doc = await db.collection('twin_profiles').doc(userId).get();
        if (!doc.exists) {
            profileCache.set(userId, { profile: null, timestamp: Date.now() });
            return null;
        }
        const profile = doc.data();
        profileCache.set(userId, { profile, timestamp: Date.now() });
        return profile;
    }
    catch (error) {
        log.warn({ error, userId }, 'Failed to load twin profile');
        return null;
    }
}
// ============================================================================
// CONTEXT BUILDING
// ============================================================================
/**
 * Build context string for the AI about user's background
 */
function buildBackgroundContext(profile) {
    const parts = [];
    // Life chapters
    if (profile.lifeChapters.length > 0) {
        parts.push('**Life Journey:**');
        profile.lifeChapters.forEach((chapter) => {
            parts.push(`- ${chapter.title} (${chapter.years}): ${chapter.description}`);
        });
    }
    // Key relationships
    if (profile.keyRelationships.length > 0) {
        parts.push('\n**Important People:**');
        profile.keyRelationships.forEach((rel) => {
            parts.push(`- ${rel.name} (${rel.relationship}): ${rel.importance}`);
        });
    }
    // Formative experiences
    if (profile.formativeExperiences.length > 0) {
        parts.push('\n**Formative Experiences:**');
        profile.formativeExperiences.forEach((exp) => {
            parts.push(`- ${exp}`);
        });
    }
    return parts.join('\n');
}
/**
 * Build context string for the AI about user's communication style
 */
function buildCommunicationContext(profile) {
    const style = profile.communicationStyle;
    const parts = ['**Communication Preferences:**'];
    // Formality
    const formalityMap = {
        very_casual: 'very casual and relaxed',
        casual: 'casual and friendly',
        balanced: 'balanced between casual and formal',
        formal: 'somewhat formal',
        very_formal: 'very formal and professional',
    };
    parts.push(`- Tone: ${formalityMap[style.formality] || 'balanced'}`);
    // Pace
    const paceMap = {
        very_slow: 'thoughtful and deliberate',
        slow: 'measured and calm',
        moderate: 'moderate pace',
        fast: 'quick and energetic',
        very_fast: 'very quick, high-energy',
    };
    parts.push(`- Pace: ${paceMap[style.pace] || 'moderate'}`);
    // Verbosity
    const verbosityMap = {
        concise: 'brief and to the point',
        moderate: 'balanced detail',
        detailed: 'thorough with examples',
        verbose: 'comprehensive with lots of context',
    };
    parts.push(`- Detail level: ${verbosityMap[style.verbosity] || 'balanced'}`);
    // Preferences
    const prefs = [];
    if (style.storytelling)
        prefs.push('enjoys storytelling');
    if (style.usesMetaphors)
        prefs.push('uses metaphors and analogies');
    if (style.askingQuestions)
        prefs.push('asks questions to understand');
    if (style.givingAdvice)
        prefs.push('comfortable giving advice');
    if (prefs.length > 0) {
        parts.push(`- Style: ${prefs.join(', ')}`);
    }
    return parts.join('\n');
}
/**
 * Build context string for the AI about user's mannerisms
 */
function buildMannerismsContext(profile) {
    const parts = ['**Voice & Mannerisms:**'];
    // Signature phrases
    if (profile.signaturePhrases.length > 0) {
        parts.push('Things they often say:');
        profile.signaturePhrases.slice(0, 5).forEach((p) => {
            parts.push(`- "${p.phrase}" (${p.context})`);
        });
    }
    // Greetings and farewells
    if (profile.greetingStyle) {
        parts.push(`\nTypical greeting: "${profile.greetingStyle}"`);
    }
    if (profile.farewellStyle) {
        parts.push(`Typical farewell: "${profile.farewellStyle}"`);
    }
    // Emotional expressions
    const emotions = [];
    if (profile.expressionsWhenHappy.length > 0) {
        emotions.push(`When happy: ${profile.expressionsWhenHappy.slice(0, 2).join(', ')}`);
    }
    if (profile.expressionsWhenExcited.length > 0) {
        emotions.push(`When excited: ${profile.expressionsWhenExcited.slice(0, 2).join(', ')}`);
    }
    if (profile.expressionsWhenSad.length > 0) {
        emotions.push(`When sad: ${profile.expressionsWhenSad.slice(0, 2).join(', ')}`);
    }
    if (emotions.length > 0) {
        parts.push('\nEmotional expressions:');
        emotions.forEach((e) => parts.push(`- ${e}`));
    }
    return parts.join('\n');
}
/**
 * Build context string for the AI about user's values and interests
 */
function buildValuesContext(profile) {
    const parts = [];
    // Life philosophy
    if (profile.lifePhilosophy) {
        parts.push(`**Life Philosophy:** "${profile.lifePhilosophy}"`);
    }
    // Core values
    if (profile.coreValues.length > 0) {
        parts.push(`\n**Core Values:** ${profile.coreValues.join(', ')}`);
    }
    // What matters
    if (profile.whatMatters.length > 0) {
        parts.push(`\n**What Matters Most:** ${profile.whatMatters.join(', ')}`);
    }
    // Passions and interests
    if (profile.passions.length > 0) {
        parts.push(`\n**Passions:** ${profile.passions.join(', ')}`);
    }
    if (profile.favoriteTopics.length > 0) {
        parts.push(`**Topics they love:** ${profile.favoriteTopics.join(', ')}`);
    }
    if (profile.hobbies.length > 0) {
        parts.push(`**Hobbies:** ${profile.hobbies.join(', ')}`);
    }
    // Things to avoid
    if (profile.thingsToAvoid.length > 0) {
        parts.push(`\n**Topics to avoid:** ${profile.thingsToAvoid.join(', ')}`);
    }
    return parts.join('\n');
}
// ============================================================================
// PUBLIC API
// ============================================================================
/**
 * Build the complete Digital Twin context for AI injection
 */
export async function buildTwinProfileContext(userId) {
    const profile = await getTwinProfile(userId);
    if (!profile) {
        return null;
    }
    // Check if profile has meaningful content
    const hasContent = profile.lifeChapters.length > 0 ||
        profile.signaturePhrases.length > 0 ||
        profile.coreValues.length > 0 ||
        profile.lifePhilosophy;
    if (!hasContent) {
        return null;
    }
    const sections = [
        '## About This Person (Digital Twin Profile)',
        '',
        'Use this information to understand who they are and how they communicate.',
        'Mirror their communication style and reference their background when relevant.',
        '',
    ];
    const backgroundContext = buildBackgroundContext(profile);
    if (backgroundContext) {
        sections.push(backgroundContext);
        sections.push('');
    }
    const communicationContext = buildCommunicationContext(profile);
    if (communicationContext) {
        sections.push(communicationContext);
        sections.push('');
    }
    const mannerismsContext = buildMannerismsContext(profile);
    if (mannerismsContext) {
        sections.push(mannerismsContext);
        sections.push('');
    }
    const valuesContext = buildValuesContext(profile);
    if (valuesContext) {
        sections.push(valuesContext);
    }
    return sections.join('\n');
}
/**
 * Get a short summary for greeting personalization
 */
export async function getTwinGreetingSummary(userId) {
    const profile = await getTwinProfile(userId);
    if (!profile)
        return null;
    return {
        greeting: profile.greetingStyle || undefined,
        interests: profile.passions.slice(0, 3),
    };
}
/**
 * Clear the cache for a user (call after profile update)
 */
export function clearTwinProfileCache(userId) {
    profileCache.delete(userId);
}
/**
 * Clear entire cache (useful for testing)
 */
export function clearAllTwinProfileCache() {
    profileCache.clear();
}
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
/**
 * Digital Twin Profile Context Builder
 *
 * Injects the user's Digital Twin profile into every conversation turn,
 * enabling highly personalized responses based on their:
 * - Life story and key relationships
 * - Communication style preferences
 * - Signature phrases and mannerisms
 * - Core values and interests
 */
export const twinProfileContextBuilder = {
    name: 'twin-profile-context',
    description: 'Injects Digital Twin profile for personalized AI responses',
    priority: 25, // High priority - personalization context should be available early
    category: BuilderCategory.PERSONA,
    build: async (input) => {
        const userId = input.services?.userId;
        if (!userId) {
            return [];
        }
        try {
            const context = await buildTwinProfileContext(userId);
            if (!context) {
                return [];
            }
            log.debug({ userId }, 'Injecting Twin profile context');
            return [
                createStandardInjection('twin_profile', context, {
                    category: 'personalization',
                }),
            ];
        }
        catch (error) {
            log.warn({ error, userId }, 'Failed to build Twin profile context');
            return [];
        }
    },
};
// Register on module load
registerContextBuilder(twinProfileContextBuilder);
//# sourceMappingURL=twin-profile-context.js.map