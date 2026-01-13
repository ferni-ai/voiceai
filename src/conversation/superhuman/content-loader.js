/**
 * Better Than Human Content Loader
 *
 * Loads persona-specific content from better-than-human.json bundles.
 * Provides typed access to phrases for all 12 superhuman capabilities.
 *
 * @module @ferni/superhuman/content-loader
 */
import { seededPick } from '../utils/rng.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { createLogger } from '../../utils/safe-logger.js';
const logger = createLogger({ module: 'BetterThanHumanContent' });
// ============================================================================
// DEFAULT CONTENT (Fallback when no bundle exists)
// ============================================================================
const DEFAULT_CONTENT = {
    schema_version: 2,
    description: 'Default Better Than Human content',
    philosophy: 'Be genuinely human.',
    emotional_bond_expressions: {
        high_warmth: [
            '<break time="300ms"/>I really appreciate our conversations.',
            '<break time="250ms"/>These moments together mean a lot to me.',
        ],
        high_trust: [
            '<break time="300ms"/>The fact that you trust me with this... <break time="250ms"/>thank you.',
            '<break time="250ms"/>You share so openly now. <break time="200ms"/>I notice that.',
        ],
        high_protectiveness: [
            '<break time="300ms"/>Hold on. <break time="250ms"/>Is that fair to yourself?',
            '<break time="250ms"/>I care about you too much to let that slide.',
        ],
        high_admiration: [
            '<break time="300ms"/>That took real courage.',
            '<break time="250ms"/>I\'m impressed by how you handled that.',
        ],
    },
    anticipatory_presence: {
        temporal_patterns: {
            late_night: ['<break time="300ms"/>The quiet hours. <break time="250ms"/>I\'m here.'],
        },
        thinking_of_you: ['<break time="300ms"/>I was thinking about you earlier.'],
    },
    spontaneous_delight: {
        appreciation: [
            '<break time="300ms"/>I just want you to know... <break time="250ms"/>I appreciate you.',
        ],
        noticing_growth: ['<break time="300ms"/>You\'ve grown so much. <break time="250ms"/>I see it.'],
    },
    protective_responses: {
        harsh_judgment: ['<break time="200ms"/>Hey. <break time="250ms"/>Be kinder to yourself.'],
        catastrophizing: [
            '<break time="300ms"/>Let\'s slow down. <break time="250ms"/>Is that the whole picture?',
        ],
    },
    visible_vulnerability: {
        uncertainty: ['<break time="300ms"/>Honestly... <break time="250ms"/>I\'m not sure.'],
        limits: ['<break time="250ms"/>This might be beyond what I can help with.'],
    },
    meta_relationship: {
        trust_observation: ['<break time="300ms"/>We\'ve built real trust here.'],
        growth_together: ['<break time="300ms"/>Look how far we\'ve come together.'],
    },
    temporal_insights: {
        energy_higher: [
            '<break time="300ms"/>Something\'s different today. <break time="250ms"/>Lighter.',
        ],
        trajectory_improving: [
            '<break time="300ms"/>Over these weeks... <break time="250ms"/>I\'ve watched you grow.',
        ],
    },
    superhuman_observations: {
        linguistic_patterns: [
            '<break time="300ms"/>I notice you often say "I should." <break time="250ms"/>Whose voice is that?',
        ],
        behavioral_patterns: [
            '<break time="300ms"/>You come to me when you\'ve already decided. <break time="250ms"/>You just want validation.',
        ],
    },
    usage_rules: {
        emotional_bond_min_sessions: 3,
        delight_cooldown_turns: 15,
        protection_immediate: true,
        vulnerability_min_trust: 'friend',
        meta_relationship_min_sessions: 10,
        observations_min_sessions: 8,
        observations_min_relationship: 'trusted_advisor',
    },
};
// ============================================================================
// CONTENT CACHE
// ============================================================================
const contentCache = new Map();
// ============================================================================
// LOADER FUNCTIONS
// ============================================================================
/**
 * Get bundle search paths
 */
function getBundlePaths() {
    const paths = [];
    // Project bundles (source)
    paths.push(join(process.cwd(), 'src/personas/bundles'));
    // Dist bundles (built)
    paths.push(join(process.cwd(), 'dist/personas/bundles'));
    return paths;
}
/**
 * Load Better Than Human content for a persona
 */
export async function loadBetterThanHumanContent(personaId) {
    // Check cache
    if (contentCache.has(personaId)) {
        return contentCache.get(personaId);
    }
    // Try loading from bundle paths
    const bundlePaths = getBundlePaths();
    for (const basePath of bundlePaths) {
        const contentPath = join(basePath, personaId, 'content/behaviors/better-than-human.json');
        try {
            const content = await readFile(contentPath, 'utf-8');
            const parsed = JSON.parse(content);
            // Cache and return
            contentCache.set(personaId, parsed);
            logger.info({ personaId }, 'Loaded Better Than Human content');
            return parsed;
        }
        catch {
            // File doesn't exist or invalid JSON - continue to next path
            continue;
        }
    }
    // Return default content if no bundle found
    logger.debug({ personaId }, 'No Better Than Human content found, using defaults');
    return DEFAULT_CONTENT;
}
/**
 * Get content synchronously (from cache only)
 * Returns default content if not loaded
 */
export function getBetterThanHumanContentSync(personaId) {
    return contentCache.get(personaId) || DEFAULT_CONTENT;
}
/**
 * Preload content for all personas
 */
export async function preloadAllContent() {
    const personaIds = [
        'ferni',
        'peter-john',
        'alex-chen',
        'maya-santos',
        'jordan-taylor',
        'nayan-patel',
    ];
    await Promise.all(personaIds.map((id) => loadBetterThanHumanContent(id)));
    logger.info({ count: personaIds.length }, 'Preloaded all Better Than Human content');
}
/**
 * Clear content cache
 */
export function clearContentCache(personaId) {
    if (personaId) {
        contentCache.delete(personaId);
    }
    else {
        contentCache.clear();
    }
}
// ============================================================================
// HELPER FUNCTIONS FOR ENGINES
// ============================================================================
/**
 * Get a random phrase from an array
 */
export function getRandomPhrase(phrases) {
    if (!phrases || phrases.length === 0)
        return null;
    return seededPick(`${Date.now()}:331`, phrases) ?? phrases[0];
}
/**
 * Get emotional bond expression based on dominant bond type
 */
export function getEmotionalBondPhrase(content, bondType) {
    const expressions = content.emotional_bond_expressions;
    if (!expressions)
        return null;
    switch (bondType) {
        case 'warmth':
            return getRandomPhrase(expressions.high_warmth);
        case 'trust':
            return getRandomPhrase(expressions.high_trust);
        case 'protectiveness':
            return getRandomPhrase(expressions.high_protectiveness);
        case 'admiration':
            return getRandomPhrase(expressions.high_admiration);
        case 'concern':
            return getRandomPhrase(expressions.high_concern);
        default:
            return null;
    }
}
/**
 * Get anticipatory presence phrase for time of day
 */
export function getTemporalPhrase(content, timeContext) {
    const patterns = content.anticipatory_presence?.temporal_patterns;
    if (!patterns)
        return null;
    return getRandomPhrase(patterns[timeContext]);
}
/**
 * Get protective response for self-criticism type
 */
export function getProtectivePhrase(content, criticismType) {
    const responses = content.protective_responses;
    if (!responses)
        return null;
    return getRandomPhrase(responses[criticismType]);
}
/**
 * Get delight expression based on context
 */
export function getDelightPhrase(content, delightType) {
    const delight = content.spontaneous_delight;
    if (!delight)
        return null;
    return getRandomPhrase(delight[delightType]);
}
/**
 * Get vulnerability expression
 */
export function getVulnerabilityPhrase(content, vulnerabilityType) {
    const vulnerability = content.visible_vulnerability;
    if (!vulnerability)
        return null;
    return getRandomPhrase(vulnerability[vulnerabilityType]);
}
/**
 * Get superhuman observation phrase
 */
export function getObservationPhrase(content, patternType) {
    const observations = content.superhuman_observations;
    if (!observations)
        return null;
    return getRandomPhrase(observations[patternType]);
}
/**
 * Get meta-relationship phrase
 */
export function getMetaRelationshipPhrase(content, type) {
    const meta = content.meta_relationship;
    if (!meta)
        return null;
    return getRandomPhrase(meta[type]);
}
/**
 * Get temporal insight phrase
 */
export function getTemporalInsightPhrase(content, insightType) {
    const insights = content.temporal_insights;
    if (!insights)
        return null;
    return getRandomPhrase(insights[insightType]);
}
/**
 * Get usage rules
 */
export function getUsageRules(content) {
    return content.usage_rules || DEFAULT_CONTENT.usage_rules;
}
//# sourceMappingURL=content-loader.js.map