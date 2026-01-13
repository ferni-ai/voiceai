/**
 * Memory Consolidation Service
 *
 * Periodically summarizes and consolidates trust data to prevent
 * unbounded growth while preserving the most important signals.
 *
 * Philosophy: Human memory naturally consolidates. We don't remember
 * every moment, but we remember the important ones, and patterns
 * emerge from repeated experiences.
 *
 * Consolidation strategy:
 * 1. Archive old observations after they become patterns
 * 2. Merge similar boundaries into stronger boundaries
 * 3. Summarize growth patterns into milestone markers
 * 4. Keep only the best callback moments (quality over quantity)
 * 5. Consolidate small wins into themes
 *
 * @module MemoryConsolidation
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'MemoryConsolidation' });
// ============================================================================
// DEFAULT CONFIG
// ============================================================================
const DEFAULT_CONFIG = {
    maxAgeBeforeArchiveDays: 90, // 3 months
    minOccurrencesForPattern: 3,
    maxItemsPerCategory: 50,
    maxBoundaries: 20,
    maxGrowthPatterns: 15,
    maxSharedMoments: 30,
    maxSmallWins: 25,
};
// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================
const consolidatedProfiles = new Map();
// ============================================================================
// CONSOLIDATION FUNCTIONS
// ============================================================================
/**
 * Consolidate all trust profiles for a user
 */
async function consolidateTrustProfilesImpl(userId, profiles, config = {}) {
    const startTime = Date.now();
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const result = {
        success: true,
        archived: {
            boundaries: 0,
            growthPatterns: 0,
            sharedMoments: 0,
            smallWins: 0,
            unsaidSignals: 0,
        },
        merged: {
            boundaries: 0,
            patterns: 0,
        },
        summaries: {
            boundaryThemes: [],
            growthMilestones: [],
            relationshipHighlights: [],
        },
        durationMs: 0,
    };
    const consolidated = consolidatedProfiles.get(userId) || createEmptyProfile();
    try {
        // 1. Consolidate boundaries
        if (profiles.boundaries?.boundaries) {
            const boundaryResult = consolidateBoundaries(profiles.boundaries.boundaries, cfg, consolidated);
            result.archived.boundaries = boundaryResult.archived;
            result.merged.boundaries = boundaryResult.merged;
            result.summaries.boundaryThemes = boundaryResult.themes;
        }
        // 2. Consolidate growth patterns
        if (profiles.growth?.patterns) {
            const growthResult = consolidateGrowth(profiles.growth.patterns, cfg, consolidated);
            result.archived.growthPatterns = growthResult.archived;
            result.summaries.growthMilestones = growthResult.milestones;
        }
        // 3. Consolidate inside jokes / shared moments
        if (profiles.insideJokes?.sharedMoments) {
            const momentsResult = consolidateSharedMoments(profiles.insideJokes.sharedMoments, cfg, consolidated);
            result.archived.sharedMoments = momentsResult.archived;
            result.summaries.relationshipHighlights = momentsResult.highlights;
        }
        // 4. Consolidate small wins
        if (profiles.smallWins?.wins) {
            const winsResult = consolidateSmallWins(profiles.smallWins.wins, cfg, consolidated);
            result.archived.smallWins = winsResult.archived;
        }
        // 5. Consolidate unsaid signals
        if (profiles.unsaid?.avoidedTopics) {
            const unsaidResult = consolidateUnsaidSignals(profiles.unsaid.avoidedTopics, profiles.unsaid.patterns || [], cfg, consolidated);
            result.archived.unsaidSignals = unsaidResult.archived;
            result.merged.patterns = unsaidResult.patternsIdentified;
        }
        // Update consolidated profile
        consolidated.lastConsolidatedAt = new Date();
        consolidated.totalItemsProcessed +=
            result.archived.boundaries +
                result.archived.growthPatterns +
                result.archived.sharedMoments +
                result.archived.smallWins +
                result.archived.unsaidSignals;
        consolidatedProfiles.set(userId, consolidated);
        result.durationMs = Date.now() - startTime;
        log.info({
            userId,
            archived: result.archived,
            merged: result.merged,
            durationMs: result.durationMs,
        }, '🧠 Memory consolidation complete');
    }
    catch (error) {
        log.error({ error, userId }, 'Memory consolidation failed');
        result.success = false;
    }
    return result;
}
/**
 * Consolidate boundaries
 */
function consolidateBoundaries(boundaries, config, consolidated) {
    let archived = 0;
    let merged = 0;
    const themes = [];
    const now = Date.now();
    const maxAge = config.maxAgeBeforeArchiveDays * 24 * 60 * 60 * 1000;
    // Group boundaries by topic similarity
    const topicGroups = new Map();
    for (const boundary of boundaries) {
        const topicKey = normalizeTopicKey(boundary.topic);
        const group = topicGroups.get(topicKey) || [];
        group.push(boundary);
        topicGroups.set(topicKey, group);
    }
    // Process each group
    for (const [topic, groupBoundaries] of topicGroups) {
        // Archive old boundaries
        const oldBoundaries = groupBoundaries.filter((b) => now - b.establishedAt.getTime() > maxAge);
        for (const old of oldBoundaries) {
            consolidated.archive.push({
                id: old.id,
                type: 'boundary',
                originalData: old,
                summary: `Boundary on "${old.topic}"`,
                archivedAt: new Date(),
                occurrences: 1,
            });
            archived++;
        }
        // Merge similar boundaries into stronger ones
        if (groupBoundaries.length > 2) {
            themes.push(`Sensitive about: ${topic}`);
            merged += groupBoundaries.length - 1;
        }
    }
    // Trim to max
    if (consolidated.archive.length > config.maxBoundaries * 2) {
        consolidated.archive = consolidated.archive
            .filter((a) => a.type === 'boundary')
            .sort((a, b) => b.occurrences - a.occurrences)
            .slice(0, config.maxBoundaries);
    }
    return { archived, merged, themes };
}
/**
 * Consolidate growth patterns
 */
function consolidateGrowth(patterns, config, consolidated) {
    let archived = 0;
    const milestones = [];
    const now = Date.now();
    const maxAge = config.maxAgeBeforeArchiveDays * 24 * 60 * 60 * 1000;
    // Process growth patterns
    for (const pattern of patterns) {
        // Check if pattern is old enough to archive
        const patternAge = now - pattern.after.firstSeen.getTime();
        if (patternAge > maxAge && pattern.significance !== 'notable') {
            // Archive minor patterns
            consolidated.archive.push({
                id: pattern.id,
                type: 'growth',
                originalData: pattern,
                summary: `Growth in ${pattern.type}: ${pattern.before.pattern} → ${pattern.after.pattern}`,
                archivedAt: new Date(),
                occurrences: 1,
            });
            archived++;
        }
        // Create milestone for transformative growth
        if (pattern.significance === 'transformative') {
            milestones.push(`${pattern.type.replace(/_/g, ' ')}: ${pattern.after.pattern}`);
            consolidated.milestones.push({
                date: pattern.after.firstSeen,
                type: 'growth',
                description: `Transformative growth in ${pattern.type}`,
            });
        }
    }
    return { archived, milestones };
}
/**
 * Consolidate shared moments (inside jokes)
 */
function consolidateSharedMoments(moments, config, consolidated) {
    let archived = 0;
    const highlights = [];
    const now = Date.now();
    const maxAge = config.maxAgeBeforeArchiveDays * 24 * 60 * 60 * 1000;
    // Sort by "stickiness" (usage + strength)
    const sortedMoments = [...moments].sort((a, b) => {
        const aScore = a.timesReferenced * a.strength;
        const bScore = b.timesReferenced * b.strength;
        return bScore - aScore;
    });
    // Keep top moments, archive the rest
    const toKeep = sortedMoments.slice(0, config.maxSharedMoments);
    const toArchive = sortedMoments.slice(config.maxSharedMoments);
    for (const moment of toArchive) {
        // Archive if old or low-impact
        const age = now - moment.firstMentioned.getTime();
        if (age > maxAge || moment.timesReferenced < 2) {
            consolidated.archive.push({
                id: moment.id,
                type: 'moment',
                originalData: moment,
                summary: `${moment.type}: "${moment.content.slice(0, 50)}..."`,
                archivedAt: new Date(),
                occurrences: moment.timesReferenced,
            });
            archived++;
        }
    }
    // Generate highlights from top moments
    for (const moment of toKeep.slice(0, 5)) {
        if (moment.strength > 0.7) {
            highlights.push(`${moment.type}: "${moment.content.slice(0, 30)}..."`);
        }
    }
    return { archived, highlights };
}
/**
 * Consolidate small wins
 */
function consolidateSmallWins(wins, config, consolidated) {
    let archived = 0;
    const now = Date.now();
    const maxAge = config.maxAgeBeforeArchiveDays * 24 * 60 * 60 * 1000;
    // Group wins by type
    const winsByType = new Map();
    for (const win of wins) {
        const { type } = win;
        const group = winsByType.get(type) || [];
        group.push(win);
        winsByType.set(type, group);
    }
    // Archive old wins while keeping themes
    for (const [type, groupWins] of winsByType) {
        const oldWins = groupWins.filter((w) => now - w.detectedAt.getTime() > maxAge);
        for (const win of oldWins) {
            consolidated.archive.push({
                id: win.id,
                type: 'win',
                originalData: win,
                summary: `${type}: ${win.description.slice(0, 50)}...`,
                archivedAt: new Date(),
                occurrences: 1,
            });
            archived++;
        }
        // Record theme if many wins of same type
        if (groupWins.length >= config.minOccurrencesForPattern) {
            if (!consolidated.themes.wins.includes(type)) {
                consolidated.themes.wins.push(type);
            }
        }
    }
    return { archived };
}
/**
 * Consolidate unsaid signals
 */
function consolidateUnsaidSignals(avoidedTopics, patterns, config, consolidated) {
    let archived = 0;
    let patternsIdentified = 0;
    // Group avoided topics by similarity
    const topicCounts = new Map();
    for (const topic of avoidedTopics) {
        const key = normalizeTopicKey(topic.topic);
        topicCounts.set(key, (topicCounts.get(key) || 0) + (topic.timesAvoided || 1));
    }
    // Identify patterns
    for (const [topic, count] of topicCounts) {
        if (count >= config.minOccurrencesForPattern) {
            patternsIdentified++;
            if (!consolidated.themes.boundaries.includes(topic)) {
                consolidated.themes.boundaries.push(topic);
            }
        }
    }
    // Archive patterns count
    archived = patterns.length;
    return { archived, patternsIdentified };
}
// ============================================================================
// UTILITIES
// ============================================================================
/**
 * Create empty consolidated profile
 */
function createEmptyProfile() {
    return {
        archive: [],
        themes: {
            boundaries: [],
            growth: [],
            relationship: [],
            wins: [],
        },
        milestones: [],
        lastConsolidatedAt: new Date(),
        totalItemsProcessed: 0,
    };
}
/**
 * Normalize topic key for grouping
 */
function normalizeTopicKey(topic) {
    return topic
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .slice(0, 3)
        .join(' ');
}
// ============================================================================
// PUBLIC API
// ============================================================================
/**
 * Consolidate all trust profiles for a user (public API)
 */
export async function consolidateTrustProfiles(userId, profiles, config) {
    return consolidateTrustProfilesImpl(userId, profiles, config);
}
/**
 * Get consolidated profile for a user (public API)
 */
export function getConsolidatedProfile(userId) {
    return consolidatedProfiles.get(userId) || null;
}
/**
 * Get themes for context building (public API)
 */
export function getThemesForContext(userId) {
    const profile = consolidatedProfiles.get(userId);
    return profile?.themes || null;
}
/**
 * Get milestones for reflection (public API)
 */
export function getMilestones(userId, since) {
    const profile = consolidatedProfiles.get(userId);
    if (!profile)
        return [];
    const { milestones } = profile;
    if (since) {
        return milestones.filter((m) => m.date >= since);
    }
    return milestones;
}
/**
 * Search archive (public API)
 */
export function searchArchive(userId, query) {
    const profile = consolidatedProfiles.get(userId);
    if (!profile)
        return [];
    const queryLower = query.toLowerCase();
    return profile.archive.filter((m) => m.summary.toLowerCase().includes(queryLower) ||
        String(m.originalData).toLowerCase().includes(queryLower));
}
/**
 * Run scheduled consolidation for all active users (public API)
 */
export async function runScheduledConsolidation(userIds, profileLoader, config) {
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let totalArchived = 0;
    for (const userId of userIds) {
        processed++;
        try {
            const profiles = await profileLoader(userId);
            const result = await consolidateTrustProfiles(userId, profiles, config);
            if (result.success) {
                succeeded++;
                totalArchived +=
                    result.archived.boundaries +
                        result.archived.growthPatterns +
                        result.archived.sharedMoments +
                        result.archived.smallWins +
                        result.archived.unsaidSignals;
            }
            else {
                failed++;
            }
        }
        catch (error) {
            log.error({ error, userId }, 'Scheduled consolidation failed for user');
            failed++;
        }
    }
    log.info({ processed, succeeded, failed, totalArchived }, '📦 Scheduled consolidation complete');
    return { processed, succeeded, failed, totalArchived };
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    consolidateTrustProfiles,
    getConsolidatedProfile,
    getThemesForContext,
    getMilestones,
    searchArchive,
    runScheduledConsolidation,
};
//# sourceMappingURL=memory-consolidation.js.map