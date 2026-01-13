/**
 * Personal Context Integrator
 *
 * Phase 2: Personal Memory Integration
 *
 * This module integrates user trigger profiles with the semantic trigger matching
 * system. It provides context boosts based on:
 * - Upcoming significant dates (birthdays, anniversaries)
 * - Relationship mentions in current text
 * - Communication pattern matches
 * - Temporal context (late night, returning after absence)
 *
 * @module PersonalContextIntegrator
 */
import { createLogger } from '../../utils/safe-logger.js';
import { extractRelationships, hasRelationshipMentions } from './extractors/index.js';
import { extractCommunicationPatterns, hasDistressSignals, hasDeflectionSignals, } from './extractors/index.js';
const log = createLogger({ module: 'personal-context-integrator' });
export const DEFAULT_PERSONAL_CONTEXT_CONFIG = {
    maxBoostMultiplier: 1.5,
    dateProximityDays: 7,
    relationshipBoostWeight: 0.3,
    patternBoostWeight: 0.25,
    temporalBoostWeight: 0.2,
    enabled: true,
};
/**
 * Generate personal context boost based on user profile and current input
 */
export function generatePersonalContextBoost(text, profile, triggerContext, config = DEFAULT_PERSONAL_CONTEXT_CONFIG) {
    const startTime = Date.now();
    if (!config.enabled) {
        return createEmptyBoost(profile, startTime);
    }
    const categoryBoosts = {};
    const triggerBoosts = [];
    const appliedContext = {
        upcomingDates: [],
        mentionedRelationships: [],
        detectedPatterns: [],
        temporalFlags: [],
    };
    // 1. Check for upcoming significant dates
    const upcomingDates = findUpcomingDates(profile.significantDates, config.dateProximityDays);
    for (const date of upcomingDates) {
        appliedContext.upcomingDates.push(date);
        // Boost relevant categories
        for (const category of date.triggerCategories) {
            categoryBoosts[category] = Math.max(categoryBoosts[category] || 0, date.emotionalWeight * config.relationshipBoostWeight);
        }
        // Add specific trigger boosts
        if (date.type === 'loss') {
            triggerBoosts.push({
                triggerName: 'grief_trigger',
                boost: date.emotionalWeight * 0.4,
                reason: `Approaching ${date.description}`,
            });
        }
        if (date.type === 'birthday' && date.relatedPerson) {
            triggerBoosts.push({
                triggerName: 'celebration_prompt',
                boost: 0.3,
                reason: `${date.relatedPerson}'s birthday approaching`,
            });
        }
    }
    // 2. Check for relationship mentions in text
    if (hasRelationshipMentions(text)) {
        const extracted = extractRelationships(text);
        for (const rel of extracted.relationships) {
            // Find matching profile relationship
            const profileRel = findMatchingRelationship(rel.name, profile.relationships);
            if (profileRel) {
                appliedContext.mentionedRelationships.push(profileRel);
                // Boost based on relationship valence
                const valenceBoost = getValenceBoost(profileRel.emotionalValence);
                for (const category of profileRel.triggerCategories) {
                    categoryBoosts[category] = Math.max(categoryBoosts[category] || 0, valenceBoost * config.relationshipBoostWeight);
                }
                // Special handling for deceased relationships
                if (profileRel.isDeceased) {
                    triggerBoosts.push({
                        triggerName: 'grief_trigger',
                        boost: 0.35,
                        reason: `Mentioned ${profileRel.name} (deceased)`,
                    });
                    categoryBoosts['grief'] = Math.max(categoryBoosts['grief'] || 0, 0.4);
                }
                // Special handling for complicated relationships
                if (profileRel.emotionalValence === 'complicated' ||
                    profileRel.emotionalValence === 'negative' ||
                    profileRel.emotionalValence === 'very_negative') {
                    triggerBoosts.push({
                        triggerName: 'emotional_support',
                        boost: 0.25,
                        reason: `Mentioned ${profileRel.name} (${profileRel.emotionalValence} relationship)`,
                    });
                }
            }
        }
    }
    // 3. Detect communication patterns
    const patternResult = extractCommunicationPatterns(text, {
        existingPatterns: profile.communicationPatterns,
    });
    for (const category of patternResult.detectedCategories) {
        appliedContext.detectedPatterns.push(category);
        if (category === 'distress' || category === 'hopelessness') {
            categoryBoosts['emotional'] = Math.max(categoryBoosts['emotional'] || 0, 0.5 * config.patternBoostWeight);
            triggerBoosts.push({
                triggerName: 'distress_response',
                boost: 0.4,
                reason: `Detected ${category} pattern`,
            });
        }
        if (category === 'deflection' || category === 'avoidance') {
            categoryBoosts['behavioral'] = Math.max(categoryBoosts['behavioral'] || 0, 0.35 * config.patternBoostWeight);
            triggerBoosts.push({
                triggerName: 'gentle_probe',
                boost: 0.3,
                reason: `Detected ${category} pattern`,
            });
        }
        if (category === 'self_criticism') {
            triggerBoosts.push({
                triggerName: 'self_compassion_prompt',
                boost: 0.35,
                reason: 'Detected self-criticism',
            });
        }
        if (category === 'connection_seeking') {
            triggerBoosts.push({
                triggerName: 'presence_response',
                boost: 0.4,
                reason: 'User seeking connection',
            });
        }
    }
    // 4. Apply temporal context
    const hour = triggerContext.currentTime?.getHours() ?? new Date().getHours();
    if (hour >= 0 && hour < 5) {
        appliedContext.temporalFlags.push('late_night');
        categoryBoosts['temporal'] = Math.max(categoryBoosts['temporal'] || 0, 0.3 * config.temporalBoostWeight);
        triggerBoosts.push({
            triggerName: 'late_night_presence',
            boost: 0.3,
            reason: 'Late night conversation',
        });
    }
    if (triggerContext.isReturningUser) {
        appliedContext.temporalFlags.push('returning');
        triggerBoosts.push({
            triggerName: 'warm_welcome_back',
            boost: 0.25,
            reason: 'Returning after absence',
        });
    }
    // 5. Check for distress signals (quick path)
    if (hasDistressSignals(text)) {
        appliedContext.detectedPatterns.push('distress_signal');
        categoryBoosts['emotional'] = Math.max(categoryBoosts['emotional'] || 0, 0.5);
        triggerBoosts.push({
            triggerName: 'immediate_support',
            boost: 0.5,
            reason: 'Distress signal detected',
        });
    }
    // 6. Check for deflection signals
    if (hasDeflectionSignals(text)) {
        appliedContext.detectedPatterns.push('deflection_signal');
        categoryBoosts['behavioral'] = Math.max(categoryBoosts['behavioral'] || 0, 0.35);
        triggerBoosts.push({
            triggerName: 'gentle_check_in',
            boost: 0.35,
            reason: 'Deflection signal detected',
        });
    }
    // Calculate overall multiplier
    const totalCategoryBoost = Object.values(categoryBoosts).reduce((a, b) => a + b, 0);
    const triggerBoostSum = triggerBoosts.reduce((a, b) => a + b.boost, 0);
    const rawMultiplier = 1 + totalCategoryBoost * 0.5 + triggerBoostSum * 0.3;
    const overallMultiplier = Math.min(config.maxBoostMultiplier, rawMultiplier);
    const processingTimeMs = Date.now() - startTime;
    log.info({
        overallMultiplier: overallMultiplier.toFixed(2),
        categoryCount: Object.keys(categoryBoosts).length,
        triggerBoostCount: triggerBoosts.length,
        processingTimeMs,
    }, 'Personal context boost generated');
    return {
        overallMultiplier,
        categoryBoosts,
        triggerBoosts,
        appliedContext,
        metadata: {
            profileAge: Date.now() - profile.updatedAt.getTime(),
            processingTimeMs,
        },
    };
}
/**
 * Apply personal context boost to match results
 */
export function applyPersonalContextBoost(matchResult, contextBoost) {
    if (contextBoost.overallMultiplier <= 1.0) {
        return matchResult;
    }
    // Apply boost to best match
    let boostedBestMatch = matchResult.bestMatch;
    if (boostedBestMatch) {
        // Check for specific trigger boosts
        const specificBoost = contextBoost.triggerBoosts.find((tb) => tb.triggerName === boostedBestMatch.triggerName);
        const boostAmount = specificBoost?.boost ?? (contextBoost.overallMultiplier - 1) * 0.5;
        boostedBestMatch = {
            ...boostedBestMatch,
            combinedScore: Math.min(1, boostedBestMatch.combinedScore + boostAmount),
        };
    }
    // Apply boost to all matches
    const boostedAllMatches = matchResult.allMatches.map((match) => {
        const specificBoost = contextBoost.triggerBoosts.find((tb) => tb.triggerName === match.triggerName);
        const boostAmount = specificBoost?.boost ?? (contextBoost.overallMultiplier - 1) * 0.3;
        return {
            ...match,
            combinedScore: Math.min(1, match.combinedScore + boostAmount),
        };
    });
    return {
        ...matchResult,
        bestMatch: boostedBestMatch,
        allMatches: boostedAllMatches,
        // Add personal context flag to analytics
        analytics: {
            ...matchResult.analytics,
            personalContextApplied: true,
            personalContextMultiplier: contextBoost.overallMultiplier,
        },
    };
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function createEmptyBoost(profile, startTime) {
    return {
        overallMultiplier: 1.0,
        categoryBoosts: {},
        triggerBoosts: [],
        appliedContext: {
            upcomingDates: [],
            mentionedRelationships: [],
            detectedPatterns: [],
            temporalFlags: [],
        },
        metadata: {
            profileAge: Date.now() - profile.updatedAt.getTime(),
            processingTimeMs: Date.now() - startTime,
        },
    };
}
function findUpcomingDates(dates, daysAhead) {
    const now = new Date();
    const upcoming = [];
    for (const date of dates) {
        if (!date.isRecurring && !date.date.startsWith('YYYY')) {
            // Non-recurring date with specific year - check if it's upcoming
            const dateObj = new Date(date.date);
            const daysUntil = Math.ceil((dateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysUntil >= 0 && daysUntil <= daysAhead) {
                upcoming.push(date);
            }
        }
        else if (date.isRecurring || date.date.startsWith('YYYY')) {
            // Recurring date - check this year and next
            const [, month, day] = date.date
                .replace('YYYY', String(now.getFullYear()))
                .split('-')
                .map(Number);
            for (const yearOffset of [0, 1]) {
                const year = now.getFullYear() + yearOffset;
                const dateObj = new Date(year, month - 1, day);
                const daysUntil = Math.ceil((dateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (daysUntil >= 0 && daysUntil <= daysAhead) {
                    upcoming.push(date);
                    break;
                }
            }
        }
    }
    return upcoming;
}
function findMatchingRelationship(name, relationships) {
    const normalizedName = name.toLowerCase();
    for (const rel of relationships) {
        if (rel.name.toLowerCase() === normalizedName) {
            return rel;
        }
        if (rel.aliases?.some((alias) => alias.toLowerCase() === normalizedName)) {
            return rel;
        }
    }
    return null;
}
function getValenceBoost(valence) {
    switch (valence) {
        case 'very_positive':
            return 0.15;
        case 'positive':
            return 0.1;
        case 'neutral':
            return 0.05;
        case 'negative':
            return 0.25;
        case 'very_negative':
            return 0.35;
        case 'complicated':
            return 0.3;
        default:
            return 0.1;
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    generatePersonalContextBoost,
    applyPersonalContextBoost,
    DEFAULT_PERSONAL_CONTEXT_CONFIG,
};
//# sourceMappingURL=personal-context-integrator.js.map