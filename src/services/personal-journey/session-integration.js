/**
 * Personal Journey Session Integration
 *
 * Hooks the Personal Journey Awareness system into the voice agent
 * session lifecycle.
 *
 * Called at:
 * - Session start: Initialize from persisted data, record session
 * - Session end: Persist updated data
 *
 * @module services/personal-journey/session-integration
 */
import { isPersonalJourneyEnabled, isUserInPersonalJourneyRollout, } from '../../config/feature-flags.js';
import { createLogger } from '../../utils/safe-logger.js';
import { clearChapterCache, getChaptersForPersistence, initializeChapters, } from './chapter-detector.js';
import { clearAllJourneyCaches, getDeliveryHistoryForPersistence, initializeDeliveryHistory, } from './journey-orchestrator.js';
import { clearRhythmCache, getRhythmForPersistence, initializeRhythm, recordSession, } from './rhythm-awareness.js';
import { captureSeasonalSnapshot, clearSeasonalCache, getSeasonalMemoryForPersistence, initializeSeasonalMemory, shouldCaptureSnapshot, } from './seasonal-memory.js';
const log = createLogger({ module: 'PersonalJourneySession' });
// ============================================================================
// SESSION START
// ============================================================================
/**
 * Initialize Personal Journey Awareness at session start
 *
 * Call this right after user identification, before the first turn.
 */
export async function initPersonalJourney(userId, userProfile) {
    try {
        // Check feature flag first
        if (!isPersonalJourneyEnabled()) {
            log.debug('Personal journey disabled via feature flag', { userId });
            return;
        }
        // Check if user is in rollout
        if (!isUserInPersonalJourneyRollout(userId)) {
            log.debug('User not in personal journey rollout', { userId });
            return;
        }
        // Extract persisted journey data from profile
        const persistedData = extractJourneyDataFromProfile(userProfile);
        // Initialize all services
        if (persistedData.rhythm) {
            initializeRhythm(userId, persistedData.rhythm);
        }
        if (persistedData.seasonal) {
            initializeSeasonalMemory(userId, persistedData.seasonal);
        }
        if (persistedData.chapters) {
            initializeChapters(userId, persistedData.chapters);
        }
        if (persistedData.deliveryHistory) {
            initializeDeliveryHistory(userId, persistedData.deliveryHistory);
        }
        // Record this session
        recordSession(userId);
        log.info('Personal journey initialized', {
            userId,
            hasPersistedData: !!(persistedData.rhythm ||
                persistedData.seasonal ||
                persistedData.chapters),
        });
    }
    catch (err) {
        log.error('Failed to initialize personal journey', {
            userId,
            error: String(err),
        });
        // Non-fatal - continue without journey awareness
    }
}
/**
 * Record a session for journey tracking
 * Call this at the start of each conversation
 */
export function recordJourneySession(userId) {
    try {
        recordSession(userId);
        log.debug('Recorded journey session', { userId });
    }
    catch (err) {
        log.warn('Failed to record journey session', {
            userId,
            error: String(err),
        });
    }
}
// ============================================================================
// SESSION END
// ============================================================================
/**
 * Cleanup personal journey at session end
 * Call this when the session ends to free memory
 */
export function cleanupPersonalJourney(userId) {
    try {
        clearRhythmCache(userId);
        clearSeasonalCache(userId);
        clearChapterCache(userId);
        clearAllJourneyCaches(userId);
        log.debug('Personal journey cleaned up', { userId });
    }
    catch (err) {
        log.warn('Failed to cleanup personal journey', {
            userId,
            error: String(err),
        });
    }
}
// ============================================================================
// PERSISTENCE
// ============================================================================
/**
 * Get all personal journey data for persistence
 * Call this before updating the user profile to include journey data
 */
export function getPersonalJourneyForPersistence(userId) {
    try {
        const rhythm = getRhythmForPersistence(userId);
        const seasonal = getSeasonalMemoryForPersistence(userId);
        const chapters = getChaptersForPersistence(userId);
        const deliveryHistory = getDeliveryHistoryForPersistence(userId);
        // Check if we should capture a seasonal snapshot
        if (shouldCaptureSnapshot(userId)) {
            // This would need conversation analysis data - for now just note we should capture
            log.debug('Seasonal snapshot capture recommended', { userId });
        }
        return {
            userId,
            rhythm: rhythm || undefined,
            seasonal: seasonal || undefined,
            chapters: chapters || undefined,
            deliveryHistory: deliveryHistory.length > 0 ? deliveryHistory : undefined,
            updatedAt: new Date(),
        };
    }
    catch (err) {
        log.error('Failed to get journey data for persistence', {
            userId,
            error: String(err),
        });
        return { userId, updatedAt: new Date() };
    }
}
/**
 * Extract journey data from user profile
 */
function extractJourneyDataFromProfile(profile) {
    if (!profile) {
        return {};
    }
    // Journey data is stored in profile.personalJourney
    const journeyData = profile.personalJourney;
    if (!journeyData) {
        // Try to bootstrap from existing profile data
        return bootstrapFromExistingProfile(profile);
    }
    // Reconstruct dates from serialized data
    const result = {};
    if (journeyData.rhythm) {
        result.rhythm = reconstructRhythmDates(journeyData.rhythm);
    }
    if (journeyData.seasonal) {
        result.seasonal = reconstructSeasonalDates(journeyData.seasonal);
    }
    if (journeyData.chapters) {
        result.chapters = reconstructChapterDates(journeyData.chapters);
    }
    if (journeyData.deliveryHistory) {
        result.deliveryHistory = journeyData.deliveryHistory.map((d) => ({
            ...d,
            deliveredAt: new Date(d.deliveredAt),
        }));
    }
    return result;
}
/**
 * Bootstrap journey data from existing profile (for users before this feature)
 */
function bootstrapFromExistingProfile(profile) {
    const result = {};
    // Bootstrap rhythm from existing profile data
    if (profile.firstContact || profile.totalConversations) {
        const firstContact = profile.firstContact ? new Date(profile.firstContact) : new Date();
        const conversationCount = profile.totalConversations || 1;
        result.rhythm = {
            userId: profile.id || '',
            updatedAt: new Date(),
            sessions: {
                totalCount: conversationCount,
                firstSession: firstContact,
                lastSession: new Date(),
                averageSessionsPerWeek: 0,
                currentStreak: 0,
                longestStreak: 0,
            },
            timePreferences: {
                preferredHours: [],
                preferredDays: [],
                mostActiveTimeOfDay: 'afternoon',
                weekdayVsWeekend: 'balanced',
            },
            consistency: {
                averageGapDays: 0,
                longestGap: 0,
                isConsistent: false,
                currentGapDays: 0,
            },
            rhythmMilestones: [],
        };
        log.debug('Bootstrapped rhythm from existing profile', {
            userId: profile.id,
            conversationCount,
            firstContact: firstContact.toISOString(),
        });
    }
    return result;
}
/**
 * Reconstruct dates in rhythm data from serialized form
 */
function reconstructRhythmDates(data) {
    return {
        ...data,
        updatedAt: new Date(data.updatedAt),
        sessions: {
            ...data.sessions,
            firstSession: new Date(data.sessions.firstSession),
            lastSession: new Date(data.sessions.lastSession),
            streakStartDate: data.sessions.streakStartDate
                ? new Date(data.sessions.streakStartDate)
                : undefined,
        },
        rhythmMilestones: data.rhythmMilestones.map((m) => ({
            ...m,
            achievedAt: new Date(m.achievedAt),
            acknowledgedAt: m.acknowledgedAt ? new Date(m.acknowledgedAt) : undefined,
        })),
    };
}
/**
 * Reconstruct dates in seasonal data from serialized form
 */
function reconstructSeasonalDates(data) {
    return {
        ...data,
        updatedAt: new Date(data.updatedAt),
        seasonalSnapshots: data.seasonalSnapshots.map((s) => ({
            ...s,
            capturedAt: new Date(s.capturedAt),
        })),
        timeAnchors: data.timeAnchors.map((a) => ({
            ...a,
            approximateDate: new Date(a.approximateDate),
            lastReferenced: a.lastReferenced ? new Date(a.lastReferenced) : undefined,
        })),
    };
}
/**
 * Reconstruct dates in chapter data from serialized form
 */
function reconstructChapterDates(data) {
    return {
        ...data,
        updatedAt: new Date(data.updatedAt),
        currentChapter: data.currentChapter
            ? {
                ...data.currentChapter,
                startedApprox: new Date(data.currentChapter.startedApprox),
                endedApprox: data.currentChapter.endedApprox
                    ? new Date(data.currentChapter.endedApprox)
                    : undefined,
            }
            : undefined,
        pastChapters: data.pastChapters.map((c) => ({
            ...c,
            startedApprox: new Date(c.startedApprox),
            endedApprox: c.endedApprox ? new Date(c.endedApprox) : undefined,
        })),
        transitionSignals: {
            ...data.transitionSignals,
            detectedAt: data.transitionSignals.detectedAt
                ? new Date(data.transitionSignals.detectedAt)
                : undefined,
        },
    };
}
// ============================================================================
// CONVERSATION ANALYSIS INTEGRATION
// ============================================================================
/**
 * Update journey state based on conversation analysis
 * Call this after conversation summarization with extracted data
 */
export async function updateJourneyFromConversation(userId, data) {
    try {
        // Import dynamically to avoid circular deps
        const { updateChapterDetection, recordChapterChallenge, recordChapterGrowth } = await import('./chapter-detector.js');
        const { addTimeAnchoredMemory } = await import('./seasonal-memory.js');
        // Update chapter detection
        updateChapterDetection(userId, {
            recentTopics: data.topics,
            recentEmotions: data.emotions,
            conversationText: data.conversationText,
        });
        // Record struggles as challenges
        if (data.struggles) {
            for (const struggle of data.struggles) {
                recordChapterChallenge(userId, struggle);
            }
        }
        // Record wins as growth
        if (data.wins) {
            for (const win of data.wins) {
                recordChapterGrowth(userId, win);
            }
        }
        // Add significant moments as time-anchored memories
        if (data.keyMoments) {
            for (const moment of data.keyMoments) {
                addTimeAnchoredMemory(userId, {
                    description: moment,
                    emotionalWeight: 0.7,
                    topics: data.topics.slice(0, 3),
                    canReference: true,
                });
            }
        }
        log.debug('Updated journey from conversation', {
            userId,
            topicsCount: data.topics.length,
            emotionsCount: data.emotions.length,
        });
    }
    catch (err) {
        log.warn('Failed to update journey from conversation', {
            userId,
            error: String(err),
        });
    }
}
/**
 * Capture end-of-season snapshot
 * Call this periodically (e.g., in a scheduled job)
 */
export async function captureSeasonalSnapshotIfNeeded(userId, data) {
    try {
        if (shouldCaptureSnapshot(userId)) {
            captureSeasonalSnapshot(userId, data);
            log.info('Captured seasonal snapshot', { userId });
            return true;
        }
        return false;
    }
    catch (err) {
        log.warn('Failed to capture seasonal snapshot', {
            userId,
            error: String(err),
        });
        return false;
    }
}
//# sourceMappingURL=session-integration.js.map