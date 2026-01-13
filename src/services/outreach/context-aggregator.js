/**
 * Context Aggregator Service
 *
 * Pulls together all context about a user's life to inform outreach.
 * This is what makes outreach feel personal, not generic.
 *
 * Context Sources:
 * 1. Recent Conversations - What have we been talking about?
 * 2. Active Commitments - What did they say they'd do?
 * 3. Emotional State - How are they doing emotionally?
 * 4. Life Events - What's happening in their life?
 * 5. Progress & Struggles - What's going well? What's hard?
 * 6. Relationship History - Inside jokes, shared memories
 *
 * Philosophy: Know what's happening in their life before reaching out.
 */
import { getLogger } from '../../utils/safe-logger.js';
import { deleteUserContext, loadContext as loadContextFromFirestore, saveContext as saveContextToFirestore, } from './firestore-persistence.js';
// ============================================================================
// STORAGE
// ============================================================================
const contextStore = new Map();
// ============================================================================
// CONTEXT AGGREGATOR SERVICE
// ============================================================================
const log = getLogger().child({ service: 'context-aggregator' });
/**
 * Get or create user context (sync - uses cache or creates default)
 * For hydrated data from Firestore, call loadUserContextFromFirestore first
 */
export function getUserContext(userId) {
    let context = contextStore.get(userId);
    if (!context) {
        context = createEmptyContext(userId);
        contextStore.set(userId, context);
        // Async load from Firestore to hydrate (fire and forget)
        loadUserContextFromFirestore(userId).catch((e) => {
            log.debug({ error: String(e), userId }, 'Firestore context load failed (using defaults)');
        });
    }
    return context;
}
/**
 * Load user context from Firestore (async)
 */
export async function loadUserContextFromFirestore(userId) {
    const firestoreContext = await loadContextFromFirestore(userId);
    if (firestoreContext) {
        // Merge with any existing in-memory context
        const existing = contextStore.get(userId) || createEmptyContext(userId);
        const merged = mergeContexts(existing, firestoreContext);
        contextStore.set(userId, merged);
        log.debug({ userId }, 'Loaded user context from Firestore');
        return merged;
    }
    return getUserContext(userId);
}
/**
 * Merge two contexts (in-memory + Firestore)
 */
function mergeContexts(inMemory, fromDb) {
    // Use the more recent data, but don't lose in-memory updates
    return {
        ...fromDb,
        ...inMemory,
        updatedAt: new Date(),
    };
}
/**
 * Persist context to Firestore (fire and forget)
 */
function persistContext(userId, context) {
    saveContextToFirestore(userId, context).catch((err) => {
        log.debug({ err, userId }, 'Failed to persist context (non-fatal)');
    });
}
function createEmptyContext(userId) {
    return {
        userId,
        updatedAt: new Date(),
        conversations: {
            recentConversations: [],
            topicsDiscussed: [],
            openLoops: [],
        },
        commitments: {
            active: [],
            recentCompleted: [],
            recentMissed: [],
        },
        emotional: {
            currentState: 'stable',
            recentEmotions: [],
            knownTriggers: [],
            knownSupports: [],
            emotionalTrend: 'unknown',
        },
        lifeEvents: {
            upcoming: [],
            recent: [],
            ongoing: [],
            anniversaries: [],
        },
        progress: {
            recentWins: [],
            currentStruggles: [],
            activeGoals: [],
            streaks: [],
            atRiskItems: [],
        },
        relationship: {
            stage: 'new',
            totalConversations: 0,
            significantMoments: [],
            insideJokes: [],
            sharedReferences: [],
        },
        personal: {
            interests: [],
            preferences: [],
        },
    };
}
// ============================================================================
// CONTEXT UPDATES
// ============================================================================
/**
 * Record a conversation for context
 */
export function recordConversation(userId, conversation) {
    const context = getUserContext(userId);
    const id = `conv_${Date.now()}`;
    const fullConversation = {
        ...conversation,
        id,
    };
    // Add to recent conversations (keep last 20)
    context.conversations.recentConversations.unshift(fullConversation);
    if (context.conversations.recentConversations.length > 20) {
        context.conversations.recentConversations.pop();
    }
    context.conversations.lastConversation = fullConversation;
    // Update topics
    for (const topic of conversation.topics) {
        const existing = context.conversations.topicsDiscussed.find((t) => t.topic.toLowerCase() === topic.toLowerCase());
        if (existing) {
            existing.lastMentioned = conversation.date;
            existing.timesDiscussed++;
        }
        else {
            context.conversations.topicsDiscussed.push({
                topic,
                lastMentioned: conversation.date,
                timesDiscussed: 1,
                sentiment: 'neutral',
            });
        }
    }
    // Update relationship
    context.relationship.totalConversations++;
    context.relationship.lastInteractionDate = conversation.date;
    context.relationship.preferredPersona = conversation.persona;
    // Update relationship stage based on conversations
    updateRelationshipStage(context);
    context.updatedAt = new Date();
    contextStore.set(userId, context);
    // Persist to Firestore
    persistContext(userId, context);
    log.debug({
        userId,
        conversationId: id,
        topics: conversation.topics,
        totalConversations: context.relationship.totalConversations,
    }, 'Recorded conversation');
}
/**
 * Add a commitment
 */
export function addCommitment(userId, commitment) {
    const context = getUserContext(userId);
    const id = `commit_${Date.now()}`;
    const fullCommitment = {
        ...commitment,
        id,
    };
    context.commitments.active.push(fullCommitment);
    context.updatedAt = new Date();
    contextStore.set(userId, context);
    // Persist to Firestore
    persistContext(userId, context);
    log.debug({ userId, commitmentId: id, what: commitment.what }, 'Added commitment');
    return id;
}
/**
 * Update commitment status
 */
export function updateCommitmentStatus(userId, commitmentId, status) {
    const context = getUserContext(userId);
    const commitment = context.commitments.active.find((c) => c.id === commitmentId);
    if (commitment) {
        commitment.status = status;
        // Move to appropriate list
        if (status === 'completed') {
            context.commitments.active = context.commitments.active.filter((c) => c.id !== commitmentId);
            context.commitments.recentCompleted.unshift(commitment);
            // Also add as a win!
            addWin(userId, {
                description: `Completed: ${commitment.what}`,
                date: new Date(),
                category: 'commitment',
                celebrated: false,
                significance: 'small',
            });
        }
        else if (status === 'missed') {
            context.commitments.active = context.commitments.active.filter((c) => c.id !== commitmentId);
            context.commitments.recentMissed.unshift(commitment);
        }
        context.updatedAt = new Date();
        contextStore.set(userId, context);
        // Persist to Firestore
        persistContext(userId, context);
    }
}
/**
 * Add an open loop (unresolved topic)
 */
export function addOpenLoop(userId, loop) {
    const context = getUserContext(userId);
    const id = `loop_${Date.now()}`;
    const fullLoop = {
        ...loop,
        id,
    };
    context.conversations.openLoops.push(fullLoop);
    context.updatedAt = new Date();
    contextStore.set(userId, context);
    // Persist to Firestore
    persistContext(userId, context);
    return id;
}
/**
 * Resolve an open loop
 */
export function resolveOpenLoop(userId, loopId) {
    const context = getUserContext(userId);
    context.conversations.openLoops = context.conversations.openLoops.filter((l) => l.id !== loopId);
    context.updatedAt = new Date();
    contextStore.set(userId, context);
    // Persist to Firestore
    persistContext(userId, context);
}
/**
 * Update emotional state
 */
export function updateEmotionalState(userId, state, trigger, notes) {
    const context = getUserContext(userId);
    // Record the emotion
    const record = {
        date: new Date(),
        state,
        trigger,
        notes,
    };
    context.emotional.recentEmotions.unshift(record);
    if (context.emotional.recentEmotions.length > 30) {
        context.emotional.recentEmotions.pop();
    }
    context.emotional.currentState = state;
    // Update trend
    context.emotional.emotionalTrend = calculateEmotionalTrend(context.emotional.recentEmotions);
    // Track triggers and supports
    if (trigger) {
        if (state === 'struggling' || state === 'crisis') {
            if (!context.emotional.knownTriggers.includes(trigger)) {
                context.emotional.knownTriggers.push(trigger);
            }
        }
        else if (state === 'thriving' || state === 'good') {
            if (!context.emotional.knownSupports.includes(trigger)) {
                context.emotional.knownSupports.push(trigger);
            }
        }
    }
    context.updatedAt = new Date();
    contextStore.set(userId, context);
    // Persist to Firestore
    persistContext(userId, context);
    log.debug({ userId, state, trigger }, 'Updated emotional state');
}
function calculateEmotionalTrend(emotions) {
    if (emotions.length < 3)
        return 'unknown';
    const stateValues = {
        thriving: 5,
        good: 4,
        stable: 3,
        struggling: 2,
        crisis: 1,
    };
    // Compare recent (last 3) to older (previous 3-6)
    const recent = emotions.slice(0, 3).map((e) => stateValues[e.state]);
    const older = emotions.slice(3, 6).map((e) => stateValues[e.state]);
    if (older.length === 0)
        return 'unknown';
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    if (recentAvg > olderAvg + 0.5)
        return 'improving';
    if (recentAvg < olderAvg - 0.5)
        return 'declining';
    return 'stable';
}
/**
 * Add a life event
 */
export function addLifeEvent(userId, event) {
    const context = getUserContext(userId);
    const id = `event_${Date.now()}`;
    const fullEvent = {
        ...event,
        id,
    };
    const now = new Date();
    if (event.date > now) {
        context.lifeEvents.upcoming.push(fullEvent);
        context.lifeEvents.upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
    }
    else {
        const daysSince = (now.getTime() - event.date.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince <= 7) {
            context.lifeEvents.recent.push(fullEvent);
        }
    }
    context.updatedAt = new Date();
    contextStore.set(userId, context);
    // Persist to Firestore
    persistContext(userId, context);
    return id;
}
/**
 * Add an ongoing life situation
 */
export function addOngoingEvent(userId, event) {
    const context = getUserContext(userId);
    const id = `ongoing_${Date.now()}`;
    const fullEvent = {
        ...event,
        id,
    };
    context.lifeEvents.ongoing.push(fullEvent);
    context.updatedAt = new Date();
    contextStore.set(userId, context);
    // Persist to Firestore
    persistContext(userId, context);
    return id;
}
/**
 * Add a win
 */
export function addWin(userId, win) {
    const context = getUserContext(userId);
    const id = `win_${Date.now()}`;
    const fullWin = {
        ...win,
        id,
    };
    context.progress.recentWins.unshift(fullWin);
    if (context.progress.recentWins.length > 20) {
        context.progress.recentWins.pop();
    }
    context.updatedAt = new Date();
    contextStore.set(userId, context);
    // Persist to Firestore
    persistContext(userId, context);
    log.debug({ userId, winId: id, description: win.description }, 'Added win');
    return id;
}
/**
 * Add a struggle
 */
export function addStruggle(userId, struggle) {
    const context = getUserContext(userId);
    const id = `struggle_${Date.now()}`;
    const fullStruggle = {
        ...struggle,
        id,
    };
    context.progress.currentStruggles.push(fullStruggle);
    context.updatedAt = new Date();
    contextStore.set(userId, context);
    // Persist to Firestore
    persistContext(userId, context);
    log.debug({ userId, struggleId: id, description: struggle.description }, 'Added struggle');
    return id;
}
/**
 * Resolve a struggle
 */
export function resolveStruggle(userId, struggleId) {
    const context = getUserContext(userId);
    const struggle = context.progress.currentStruggles.find((s) => s.id === struggleId);
    if (struggle) {
        struggle.resolved = true;
        context.progress.currentStruggles = context.progress.currentStruggles.filter((s) => s.id !== struggleId);
        // Add as a win!
        addWin(userId, {
            description: `Overcame: ${struggle.description}`,
            date: new Date(),
            category: 'struggle_resolved',
            celebrated: false,
            significance: 'medium',
        });
    }
    context.updatedAt = new Date();
    contextStore.set(userId, context);
    // Persist to Firestore
    persistContext(userId, context);
}
/**
 * Add a significant moment
 */
export function addSignificantMoment(userId, moment) {
    const context = getUserContext(userId);
    const id = `moment_${Date.now()}`;
    const fullMoment = {
        ...moment,
        id,
    };
    context.relationship.significantMoments.push(fullMoment);
    context.updatedAt = new Date();
    contextStore.set(userId, context);
    // Persist to Firestore
    persistContext(userId, context);
    return id;
}
/**
 * Add an inside joke
 */
export function addInsideJoke(userId, joke) {
    const context = getUserContext(userId);
    if (!context.relationship.insideJokes.includes(joke)) {
        context.relationship.insideJokes.push(joke);
        context.updatedAt = new Date();
        contextStore.set(userId, context);
    }
}
/**
 * Update personal info
 */
export function updatePersonalInfo(userId, info) {
    const context = getUserContext(userId);
    context.personal = { ...context.personal, ...info };
    context.updatedAt = new Date();
    contextStore.set(userId, context);
}
// ============================================================================
// RELATIONSHIP STAGE MANAGEMENT
// ============================================================================
function updateRelationshipStage(context) {
    const { totalConversations, significantMoments, startDate } = context.relationship;
    // Calculate days since first conversation
    const daysSinceStart = startDate ? (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24) : 0;
    // Determine stage based on multiple factors
    if (totalConversations >= 50 && daysSinceStart >= 30 && significantMoments.length >= 5) {
        context.relationship.stage = 'deep';
    }
    else if (totalConversations >= 20 && daysSinceStart >= 7) {
        context.relationship.stage = 'established';
    }
    else if (totalConversations >= 5 && daysSinceStart >= 3) {
        context.relationship.stage = 'building';
    }
    else {
        context.relationship.stage = 'new';
    }
}
// ============================================================================
// CONTEXT QUERIES
// ============================================================================
/**
 * Get context summary for outreach message generation
 */
export function getContextForOutreach(userId) {
    const context = getUserContext(userId);
    return {
        emotionalState: context.emotional.currentState,
        emotionalTrend: context.emotional.emotionalTrend,
        recentTopics: context.conversations.topicsDiscussed.slice(0, 5).map((t) => t.topic),
        activeCommitments: context.commitments.active.map((c) => c.what),
        recentWins: context.progress.recentWins.slice(0, 3).map((w) => w.description),
        currentStruggles: context.progress.currentStruggles.map((s) => s.description),
        upcomingEvents: context.lifeEvents.upcoming.slice(0, 5).map((e) => e.description),
        openLoops: context.conversations.openLoops
            .filter((l) => l.followUpNeeded)
            .map((l) => l.description),
        relationshipStage: context.relationship.stage,
        insideJokes: context.relationship.insideJokes,
        lastConversationSummary: context.conversations.lastConversation?.summary,
    };
}
/**
 * Check if user needs support
 */
export function needsSupport(userId) {
    const context = getUserContext(userId);
    // Check emotional state
    if (context.emotional.currentState === 'crisis') {
        return {
            needsSupport: true,
            reason: 'User in emotional crisis',
            priority: 'high',
        };
    }
    if (context.emotional.currentState === 'struggling') {
        return {
            needsSupport: true,
            reason: 'User struggling emotionally',
            priority: 'medium',
        };
    }
    // Check for declining trend
    if (context.emotional.emotionalTrend === 'declining') {
        return {
            needsSupport: true,
            reason: 'Emotional state declining',
            priority: 'medium',
        };
    }
    // Check for unresolved struggles
    if (context.progress.currentStruggles.length > 0) {
        const unsupported = context.progress.currentStruggles.filter((s) => !s.supportProvided);
        if (unsupported.length > 0) {
            return {
                needsSupport: true,
                reason: `Struggling with: ${unsupported[0].description}`,
                priority: 'low',
            };
        }
    }
    return { needsSupport: false, priority: 'low' };
}
/**
 * Get items that need follow-up
 */
export function getFollowUpItems(userId) {
    const context = getUserContext(userId);
    const items = [];
    // Pending commitments past due
    const now = new Date();
    for (const commitment of context.commitments.active) {
        if (commitment.checkInTime && commitment.checkInTime < now) {
            items.push({
                type: 'commitment',
                description: commitment.what,
                priority: 'medium',
            });
        }
    }
    // Open loops needing follow-up
    for (const loop of context.conversations.openLoops) {
        if (loop.followUpNeeded) {
            items.push({
                type: 'open_loop',
                description: loop.description,
                priority: loop.importance,
            });
        }
    }
    // Recent life events to follow up on
    for (const event of context.lifeEvents.recent) {
        if (!event.followUpSent) {
            items.push({
                type: 'life_event',
                description: `Follow up on: ${event.description}`,
                priority: event.importance,
            });
        }
    }
    // Uncelebrated wins
    for (const win of context.progress.recentWins) {
        if (!win.celebrated && win.significance !== 'small') {
            items.push({
                type: 'celebration',
                description: win.description,
                priority: win.significance === 'big' ? 'high' : 'medium',
            });
        }
    }
    return items;
}
// ============================================================================
// CLEANUP
// ============================================================================
export function clearUserContext(userId) {
    contextStore.delete(userId);
    // Also clear from Firestore
    deleteUserContext(userId).catch((err) => {
        log.warn({ userId, error: String(err) }, 'Failed to delete user context from Firestore');
    });
    log.debug({ userId }, 'Cleared user context');
}
/**
 * Prune old data to prevent memory growth
 */
export function pruneOldData(maxAgeDays = 90) {
    let pruned = 0;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);
    for (const [userId, context] of contextStore.entries()) {
        // Prune old conversations
        const oldConvCount = context.conversations.recentConversations.length;
        context.conversations.recentConversations = context.conversations.recentConversations.filter((c) => c.date > cutoff);
        pruned += oldConvCount - context.conversations.recentConversations.length;
        // Prune old emotions
        const oldEmotionCount = context.emotional.recentEmotions.length;
        context.emotional.recentEmotions = context.emotional.recentEmotions.filter((e) => e.date > cutoff);
        pruned += oldEmotionCount - context.emotional.recentEmotions.length;
        // Prune old life events
        context.lifeEvents.recent = context.lifeEvents.recent.filter((e) => e.date > cutoff);
        contextStore.set(userId, context);
    }
    if (pruned > 0) {
        log.info({ pruned, maxAgeDays }, 'Pruned old context data');
    }
    return pruned;
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    getUserContext,
    recordConversation,
    addCommitment,
    updateCommitmentStatus,
    addOpenLoop,
    resolveOpenLoop,
    updateEmotionalState,
    addLifeEvent,
    addOngoingEvent,
    addWin,
    addStruggle,
    resolveStruggle,
    addSignificantMoment,
    addInsideJoke,
    updatePersonalInfo,
    getContextForOutreach,
    needsSupport,
    getFollowUpItems,
    clearUserContext,
    pruneOldData,
};
//# sourceMappingURL=context-aggregator.js.map