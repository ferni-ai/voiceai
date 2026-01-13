/**
 * Outreach Decision Engine
 *
 * The brain that decides WHEN, WHY, WHO, HOW, and WHAT to say for proactive outreach.
 *
 * This engine orchestrates all outreach decisions, ensuring:
 * - Right timing (learned patterns + preferences)
 * - Right persona (who should reach out)
 * - Right channel (call vs text vs email)
 * - Right message (persona-specific voice)
 * - Right frequency (rate limiting)
 */
import { EventEmitter } from 'events';
import { clearNamedInterval, registerInterval } from '../../utils/interval-manager.js';
import { getLogger } from '../../utils/safe-logger.js';
import { deleteTrigger, loadHistory, loadOutreachProfile, loadPendingTriggers, saveOutreachProfile, saveToHistory, saveTrigger, updateTriggerStatus, } from './firestore-persistence.js';
import { generateOutreach, selectPersonaForOutreach, } from './persona-voice-generator.js';
import { getTimingRecommendation, } from '../contacts/optimal-timing.js';
import { getPendingCheckIns, recordCheckInSent, } from './onboarding-checkin-arc.js';
import { onNeedsTeamSupport, onNeedsTeamRoundtable, onNeedsMultiplePerspectives, } from './superhuman-outreach-bridge.js';
// Redis cache for real-time session suppression
import { getRedisCache } from '../../memory/redis-cache.js';
// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================
const DEFAULT_CONFIG = {
    checkIntervalMs: 60 * 1000, // Check every minute
    defaultQuietHoursStart: '22:00',
    defaultQuietHoursEnd: '08:00',
    defaultMaxPerDay: 3,
    defaultMaxPerWeek: 10,
    relationshipPermissions: {
        new: {
            allowedChannels: ['email'],
            maxPerWeek: 1,
        },
        building: {
            allowedChannels: ['email', 'sms'],
            maxPerWeek: 2,
        },
        established: {
            allowedChannels: ['email', 'sms', 'call'],
            maxPerWeek: 4,
        },
        deep: {
            allowedChannels: ['email', 'sms', 'call', 'voice_message'],
            maxPerWeek: 7,
        },
    },
    priorityWindows: {
        urgent: 1 * 60 * 60 * 1000, // 1 hour
        high: 4 * 60 * 60 * 1000, // 4 hours
        medium: 24 * 60 * 60 * 1000, // 24 hours
        low: 72 * 60 * 60 * 1000, // 72 hours
    },
};
// ============================================================================
// ML TIMING HELPERS (Thompson Sampling integration)
// ============================================================================
/** Convert hour number to TimeSlot for ML timing */
function hourToTimeSlot(hour) {
    if (hour >= 5 && hour < 11)
        return 'morning';
    if (hour >= 11 && hour < 14)
        return 'midday';
    if (hour >= 14 && hour < 17)
        return 'afternoon';
    if (hour >= 17 && hour < 21)
        return 'evening';
    return 'night';
}
/** Convert day number (0=Sunday) to DayOfWeek for ML timing */
function dayNumberToName(day) {
    const days = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
    ];
    return days[day] || 'monday';
}
/** Convert DayOfWeek back to day number */
function dayNameToNumber(day) {
    const map = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
    };
    return map[day];
}
/** Get representative hour for a TimeSlot */
function timeSlotToHour(slot) {
    const map = {
        early_morning: 7,
        morning: 9,
        midday: 12,
        afternoon: 15,
        evening: 18,
        night: 21,
    };
    return map[slot];
}
// ============================================================================
// STORAGE
// ============================================================================
const userStateStore = new Map();
const pendingTriggers = new Map();
const outreachHistory = new Map();
// ============================================================================
// OUTREACH DECISION ENGINE
// ============================================================================
const log = getLogger().child({ service: 'outreach-decision-engine' });
class OutreachDecisionEngine extends EventEmitter {
    config;
    intervalId = null;
    running = false;
    constructor(config = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
        log.info({ config: this.config }, '🧠 Outreach Decision Engine created');
    }
    // ============================================================================
    // LIFECYCLE
    // ============================================================================
    start() {
        if (this.running) {
            log.warn('Decision engine already running');
            return;
        }
        this.running = true;
        log.info('🧠 Outreach Decision Engine started');
        // Process triggers on interval
        this.intervalId = registerInterval('outreach-decision-engine-triggers', () => {
            void this.processPendingTriggers();
        }, this.config.checkIntervalMs);
    }
    stop() {
        clearNamedInterval('outreach-decision-engine-triggers');
        this.intervalId = null;
        this.running = false;
        log.info('🧠 Outreach Decision Engine stopped');
    }
    // ============================================================================
    // TRIGGER MANAGEMENT
    // ============================================================================
    /**
     * Add a new outreach trigger to be processed
     */
    addTrigger(trigger) {
        const id = `trigger_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const fullTrigger = {
            ...trigger,
            id,
            createdAt: new Date(),
        };
        const userTriggers = pendingTriggers.get(trigger.userId) || [];
        userTriggers.push(fullTrigger);
        pendingTriggers.set(trigger.userId, userTriggers);
        // Persist to Firestore (fire and forget for speed)
        saveTrigger(fullTrigger, trigger.suggestedTime).catch((err) => {
            log.debug({ err, triggerId: id }, 'Failed to persist trigger (non-fatal)');
        });
        log.info({
            triggerId: id,
            userId: trigger.userId,
            type: trigger.type,
            priority: trigger.priority,
        }, '📥 Outreach trigger added');
        this.emit('trigger-added', fullTrigger);
        // Process immediately if urgent
        if (trigger.priority === 'urgent') {
            void this.processTrigger(fullTrigger);
        }
        return id;
    }
    /**
     * Cancel a pending trigger
     */
    cancelTrigger(triggerId) {
        for (const [userId, triggers] of pendingTriggers.entries()) {
            const index = triggers.findIndex((t) => t.id === triggerId);
            if (index >= 0) {
                triggers.splice(index, 1);
                pendingTriggers.set(userId, triggers);
                log.info({ triggerId, userId }, '❌ Trigger cancelled');
                return true;
            }
        }
        return false;
    }
    /**
     * Get pending triggers for a user
     */
    getPendingTriggers(userId) {
        return pendingTriggers.get(userId) || [];
    }
    /**
     * Get a specific trigger by ID
     */
    getTrigger(triggerId) {
        for (const triggers of pendingTriggers.values()) {
            const found = triggers.find((t) => t.id === triggerId);
            if (found)
                return found;
        }
        return undefined;
    }
    /**
     * Check for pending onboarding check-ins and create triggers
     * Should be called periodically by the scheduled job
     */
    async checkOnboardingTriggers(userId) {
        const createdTriggerIds = [];
        try {
            // Get pending check-ins from the onboarding arc service
            const pendingCheckIns = await getPendingCheckIns(userId);
            if (pendingCheckIns.length === 0) {
                return createdTriggerIds;
            }
            log.info({ userId, pendingCount: pendingCheckIns.length }, '🎓 Found pending onboarding check-ins');
            // Map check-in types to trigger types
            const checkInTypeToTrigger = {
                welcome_followup: 'onboarding_welcome',
                next_day_check: 'onboarding_nextday',
                topic_deepdive: 'onboarding_topic_deepdive',
                first_week_reflection: 'onboarding_first_week',
                momentum_check: 'onboarding_momentum',
                two_week_celebration: 'onboarding_two_week',
                habit_nudge: 'onboarding_momentum',
                win_celebration: 'celebration',
            };
            for (const checkIn of pendingCheckIns) {
                // Create a trigger for this check-in
                const triggerType = checkInTypeToTrigger[checkIn.type] || 'check_in';
                const triggerId = this.addTrigger({
                    type: triggerType,
                    userId,
                    priority: checkIn.priority,
                    reason: checkIn.reason,
                    context: {
                        checkInType: checkIn.type,
                        scheduledFor: checkIn.scheduledFor,
                    },
                    suggestedTime: checkIn.scheduledFor,
                    // Use the persona from the check-in (usually ferni for onboarding)
                    suggestedPersona: checkIn.persona,
                });
                createdTriggerIds.push(triggerId);
                log.debug({ userId, checkInType: checkIn.type, triggerId }, '🎓 Created onboarding trigger');
            }
            return createdTriggerIds;
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Failed to check onboarding triggers');
            return createdTriggerIds;
        }
    }
    /**
     * Mark an onboarding check-in as sent (called after successful outreach)
     */
    markOnboardingCheckInSent(userId, checkInType, responseReceived = false) {
        try {
            recordCheckInSent(userId, checkInType, responseReceived);
            log.debug({ userId, checkInType, responseReceived }, '✅ Onboarding check-in marked as sent');
        }
        catch (error) {
            log.warn({ error: String(error), userId, checkInType }, 'Failed to mark onboarding check-in as sent');
        }
    }
    // ============================================================================
    // USER STATE MANAGEMENT
    // ============================================================================
    /**
     * Get or create user outreach state (sync - uses cache or creates default)
     * For hydrated data from Firestore, call loadUserStateFromFirestore first
     */
    getUserState(userId) {
        let state = userStateStore.get(userId);
        if (!state) {
            state = this.createDefaultUserState(userId);
            userStateStore.set(userId, state);
            // Async load from Firestore to hydrate (fire and forget)
            this.loadUserStateFromFirestore(userId).catch((e) => {
                log.debug({ error: String(e), userId }, 'Firestore state load failed (using defaults)');
            });
        }
        return state;
    }
    /**
     * Load user state from Firestore (async - call for full hydration)
     */
    async loadUserStateFromFirestore(userId) {
        const profile = await loadOutreachProfile(userId);
        if (profile?.state) {
            // Merge with any existing in-memory state
            const existing = userStateStore.get(userId) || this.createDefaultUserState(userId);
            const merged = { ...existing, ...profile.state };
            userStateStore.set(userId, merged);
            log.debug({ userId }, 'Loaded user state from Firestore');
            return merged;
        }
        return this.getUserState(userId);
    }
    /**
     * Update user outreach state
     */
    updateUserState(userId, updates) {
        const state = this.getUserState(userId);
        const updated = { ...state, ...updates };
        userStateStore.set(userId, updated);
        // Persist to Firestore
        this.persistUserState(userId, updated);
        log.debug({ userId, updates }, 'User outreach state updated');
    }
    /**
     * Update user preferences
     */
    updateUserPreferences(userId, preferences) {
        const state = this.getUserState(userId);
        state.preferences = { ...state.preferences, ...preferences };
        userStateStore.set(userId, state);
        // Persist to Firestore
        this.persistUserState(userId, state);
        log.info({ userId, preferences }, '⚙️ User outreach preferences updated');
    }
    /**
     * Update user context (from conversation analysis)
     */
    updateUserContext(userId, context) {
        const state = this.getUserState(userId);
        state.context = { ...state.context, ...context };
        userStateStore.set(userId, state);
        // Persist to Firestore (debounced - context updates frequently)
        this.persistUserState(userId, state);
    }
    /**
     * Record that we reached out to a user
     */
    recordOutreach(userId) {
        const state = this.getUserState(userId);
        const now = new Date();
        // Reset daily counter if new day
        if (state.counters.lastOutreachDate) {
            const lastDate = new Date(state.counters.lastOutreachDate);
            if (lastDate.toDateString() !== now.toDateString()) {
                state.counters.outreachToday = 0;
            }
        }
        state.counters.outreachToday++;
        state.counters.outreachThisWeek++;
        state.counters.lastOutreachDate = now;
        userStateStore.set(userId, state);
        // Persist to Firestore
        this.persistUserState(userId, state);
    }
    /**
     * Persist user state to Firestore (fire and forget)
     */
    persistUserState(userId, state) {
        saveOutreachProfile(userId, { state }).catch((err) => {
            log.debug({ err, userId }, 'Failed to persist user state (non-fatal)');
        });
    }
    createDefaultUserState(userId) {
        return {
            userId,
            // OPT-OUT BY DEFAULT: Users must explicitly enable proactive outreach
            outreachEnabled: false,
            allowedChannels: ['email', 'sms'],
            preferences: {
                quietHoursStart: this.config.defaultQuietHoursStart,
                quietHoursEnd: this.config.defaultQuietHoursEnd,
                timezone: 'America/New_York',
                maxPerDay: this.config.defaultMaxPerDay,
                maxPerWeek: this.config.defaultMaxPerWeek,
            },
            patterns: {
                preferredHours: [9, 10, 11, 14, 15, 16, 19, 20],
                preferredDays: [1, 2, 3, 4, 5],
                responseRateByChannel: {
                    sms: 0.5,
                    email: 0.3,
                    call: 0.2,
                    voice_message: 0.2,
                    push: 0.4,
                },
                avgResponseTimeMs: 60 * 60 * 1000,
            },
            counters: {
                outreachToday: 0,
                outreachThisWeek: 0,
            },
            relationshipStage: 'new',
            context: {},
        };
    }
    // ============================================================================
    // DECISION MAKING
    // ============================================================================
    /**
     * Process all pending triggers
     */
    async processPendingTriggers() {
        const now = new Date();
        for (const [userId, triggers] of pendingTriggers.entries()) {
            // Filter to triggers that should be processed now
            const readyTriggers = triggers.filter((t) => {
                if (t.expiresAt && t.expiresAt < now)
                    return false;
                if (t.suggestedTime && t.suggestedTime > now)
                    return false;
                return true;
            });
            for (const trigger of readyTriggers) {
                await this.processTrigger(trigger);
            }
            // Remove processed and expired triggers
            const remaining = triggers.filter((t) => {
                if (t.expiresAt && t.expiresAt < now)
                    return false;
                return !readyTriggers.includes(t);
            });
            if (remaining.length > 0) {
                pendingTriggers.set(userId, remaining);
            }
            else {
                pendingTriggers.delete(userId);
            }
        }
    }
    /**
     * Process a single trigger and make a decision
     */
    async processTrigger(trigger) {
        const state = this.getUserState(trigger.userId);
        const now = new Date();
        log.debug({
            triggerId: trigger.id,
            userId: trigger.userId,
            type: trigger.type,
        }, 'Processing trigger');
        // Decision 1: Is outreach enabled?
        if (!state.outreachEnabled) {
            return this.createDecision(trigger, 'skip', 'Outreach disabled for user');
        }
        // Decision 1.5: Check Redis session suppression (user in session or just finished)
        try {
            const redis = getRedisCache();
            const suppression = await redis.isOutreachSuppressed(trigger.userId);
            if (suppression.suppressed) {
                // Defer until suppression expires (30 min from session end typically)
                const deferTime = new Date(Date.now() + 30 * 60 * 1000);
                return this.createDecision(trigger, 'defer', `Session suppression: ${suppression.reason || 'user in/recently in session'}`, deferTime);
            }
        }
        catch (redisErr) {
            // Redis unavailable - proceed without suppression check
            log.debug({ error: String(redisErr) }, 'Redis suppression check failed (proceeding)');
        }
        // Decision 2: Rate limit check
        if (state.counters.outreachToday >= state.preferences.maxPerDay) {
            return this.createDecision(trigger, 'defer', 'Daily limit reached', this.getNextDay(now));
        }
        if (state.counters.outreachThisWeek >= state.preferences.maxPerWeek) {
            return this.createDecision(trigger, 'defer', 'Weekly limit reached', this.getNextWeek(now));
        }
        // Decision 3: Check for GROUP OUTREACH triggers
        // These are handled by the group outreach system, not single-persona flow
        if (this.isGroupOutreachTrigger(trigger, state)) {
            await this.routeToGroupOutreach(trigger, state);
            // Mark as sent (group outreach handles its own delivery)
            this.recordOutreach(trigger.userId);
            return {
                trigger,
                decision: 'send',
                decidedAt: now,
                // Group outreach - no single persona/channel
            };
        }
        // Decision 4: Is this a good time?
        const timingDecision = await this.evaluateTiming(state, trigger, now);
        if (timingDecision.defer) {
            return this.createDecision(trigger, 'defer', timingDecision.reason || 'Timing not optimal', timingDecision.deferUntil);
        }
        // Decision 5: Select persona
        const persona = trigger.suggestedPersona ||
            selectPersonaForOutreach(trigger.type, trigger.lastPersona || state.lastPersona, trigger.wasRecentConversation);
        // Decision 6: Select channel
        const channel = this.selectChannel(trigger, state);
        if (!channel) {
            return this.createDecision(trigger, 'skip', 'No suitable channel available');
        }
        // Decision 7: Generate the message
        const context = this.buildOutreachContext(trigger, state);
        const tone = this.determineTone(trigger);
        const generatedMessage = generateOutreach(persona, context, channel, tone);
        // Create the decision
        const decision = {
            trigger,
            decision: 'send',
            decidedAt: now,
            persona,
            channel,
            scheduledFor: now,
            generatedMessage,
        };
        // Record in history
        this.recordDecision(trigger.userId, decision);
        // Record that we're reaching out
        this.recordOutreach(trigger.userId);
        // Emit for delivery
        this.emit('outreach-ready', decision);
        log.info({
            triggerId: trigger.id,
            userId: trigger.userId,
            persona,
            channel,
            type: trigger.type,
        }, '📤 Outreach decision: SEND');
        return decision;
    }
    createDecision(trigger, decision, reason, deferUntil) {
        const result = {
            trigger,
            decision,
            decidedAt: new Date(),
            skipReason: decision === 'skip' ? reason : undefined,
            deferUntil: decision === 'defer' ? deferUntil : undefined,
        };
        this.recordDecision(trigger.userId, result);
        log.debug({
            triggerId: trigger.id,
            decision,
            reason,
            deferUntil: deferUntil?.toISOString(),
        }, `Outreach decision: ${decision.toUpperCase()}`);
        return result;
    }
    recordDecision(userId, decision) {
        const history = outreachHistory.get(userId) || [];
        history.push(decision);
        // Keep last 100 decisions per user
        if (history.length > 100) {
            history.shift();
        }
        outreachHistory.set(userId, history);
        // Persist to Firestore
        saveToHistory(userId, decision).catch((err) => {
            log.debug({ err, userId }, 'Failed to persist decision to history (non-fatal)');
        });
        // Remove processed trigger from Firestore
        if (decision.decision === 'send' || decision.decision === 'skip') {
            deleteTrigger(decision.trigger.id).catch((err) => {
                log.debug({ err, triggerId: decision.trigger.id }, 'Failed to delete trigger (non-fatal)');
            });
        }
        else if (decision.decision === 'defer') {
            updateTriggerStatus(decision.trigger.id, 'pending', decision.deferUntil).catch((err) => {
                log.debug({ err, triggerId: decision.trigger.id }, 'Failed to update trigger (non-fatal)');
            });
        }
    }
    // ============================================================================
    // TIMING EVALUATION
    // ============================================================================
    async evaluateTiming(state, trigger, now) {
        const hour = now.getHours();
        const day = now.getDay();
        // Check quiet hours
        const quietStart = parseInt(state.preferences.quietHoursStart.split(':')[0]);
        const quietEnd = parseInt(state.preferences.quietHoursEnd.split(':')[0]);
        const inQuietHours = (quietStart > quietEnd && (hour >= quietStart || hour < quietEnd)) ||
            (quietStart <= quietEnd && hour >= quietStart && hour < quietEnd);
        if (inQuietHours && trigger.priority !== 'urgent') {
            const deferUntil = new Date(now);
            deferUntil.setHours(quietEnd, 0, 0, 0);
            if (hour >= quietStart) {
                deferUntil.setDate(deferUntil.getDate() + 1);
            }
            return { defer: true, reason: 'Quiet hours', deferUntil };
        }
        // Check timing patterns (unless urgent/high priority)
        if (trigger.priority !== 'urgent' && trigger.priority !== 'high') {
            // Try ML timing first (Thompson Sampling)
            try {
                const mlRecommendation = await getTimingRecommendation(state.userId, 'self', 'user');
                // Use ML if we have enough data (not in 'learning' phase)
                if (mlRecommendation.confidenceLevel !== 'learning') {
                    // Check if current time slot matches ML recommendation
                    const currentSlot = hourToTimeSlot(hour);
                    const currentDayName = dayNumberToName(day);
                    const isRecommendedNow = mlRecommendation.recommendedTimeSlot === currentSlot &&
                        mlRecommendation.recommendedDay === currentDayName;
                    if (!isRecommendedNow) {
                        // ML says this isn't a good time - defer to recommended time
                        log.debug({
                            userId: state.userId,
                            currentSlot,
                            currentDay: currentDayName,
                            confidence: mlRecommendation.confidenceLevel,
                        }, '📊 ML timing: deferring to better time');
                        return {
                            defer: true,
                            reason: 'ML timing - not optimal time',
                            deferUntil: mlRecommendation.suggestedSendTime,
                        };
                    }
                    // ML says now is a good time
                    log.debug({ userId: state.userId, currentSlot, currentDay: currentDayName }, '📊 ML timing: current time is optimal');
                    return { defer: false };
                }
            }
            catch (mlError) {
                log.debug({ error: String(mlError), userId: state.userId }, 'ML timing check failed, using static patterns');
            }
            // Fallback to static patterns
            const isPreferredHour = state.patterns.preferredHours.includes(hour);
            const isPreferredDay = state.patterns.preferredDays.includes(day);
            if (!isPreferredHour || !isPreferredDay) {
                // Find next optimal time
                const deferUntil = await this.findNextOptimalTime(state, now);
                return { defer: true, reason: 'Not optimal time', deferUntil };
            }
        }
        return { defer: false };
    }
    async findNextOptimalTime(state, now) {
        const result = new Date(now);
        const currentHour = now.getHours();
        const currentDay = now.getDay();
        // Try ML timing first (Thompson Sampling) - uses 'self' contactId for user-level timing
        try {
            const mlRecommendation = await getTimingRecommendation(state.userId, 'self', 'user');
            // Use ML if we have enough data (not in 'learning' phase)
            if (mlRecommendation.confidenceLevel !== 'learning') {
                // The recommendation already includes the best send time
                // Just use it directly if it's in the future
                if (mlRecommendation.suggestedSendTime > now) {
                    log.debug({
                        userId: state.userId,
                        day: mlRecommendation.recommendedDay,
                        slot: mlRecommendation.recommendedTimeSlot,
                        confidence: mlRecommendation.confidenceLevel,
                    }, '📊 ML timing: using learned optimal time');
                    return mlRecommendation.suggestedSendTime;
                }
                // If suggested time is in the past, calculate next occurrence
                const mlDay = dayNameToNumber(mlRecommendation.recommendedDay);
                const mlHour = timeSlotToHour(mlRecommendation.recommendedTimeSlot);
                // Calculate days until recommended day (at least 1 day since today's time has passed)
                let daysUntil = (mlDay - currentDay + 7) % 7;
                if (daysUntil === 0) {
                    daysUntil = 7; // Same day, defer to next week
                }
                result.setDate(result.getDate() + daysUntil);
                result.setHours(mlHour, 0, 0, 0);
                log.debug({
                    userId: state.userId,
                    day: mlRecommendation.recommendedDay,
                    slot: mlRecommendation.recommendedTimeSlot,
                    confidence: mlRecommendation.confidenceLevel,
                }, '📊 ML timing: using learned optimal time (next occurrence)');
                return result;
            }
        }
        catch (mlError) {
            log.debug({ error: String(mlError), userId: state.userId }, 'ML timing unavailable, using static patterns');
        }
        // Fallback to static patterns if ML confidence is low or unavailable
        // Try to find a good hour today
        const nextGoodHourToday = state.patterns.preferredHours.find((h) => h > currentHour);
        if (nextGoodHourToday !== undefined && state.patterns.preferredDays.includes(currentDay)) {
            result.setHours(nextGoodHourToday, 0, 0, 0);
            return result;
        }
        // Find next good day
        for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
            const futureDay = (currentDay + daysAhead) % 7;
            if (state.patterns.preferredDays.includes(futureDay)) {
                result.setDate(result.getDate() + daysAhead);
                result.setHours(state.patterns.preferredHours[0] || 9, 0, 0, 0);
                return result;
            }
        }
        // Fallback: tomorrow at first preferred hour
        result.setDate(result.getDate() + 1);
        result.setHours(state.patterns.preferredHours[0] || 9, 0, 0, 0);
        return result;
    }
    getNextDay(now) {
        const result = new Date(now);
        result.setDate(result.getDate() + 1);
        result.setHours(9, 0, 0, 0);
        return result;
    }
    getNextWeek(now) {
        const result = new Date(now);
        result.setDate(result.getDate() + 7);
        result.setHours(9, 0, 0, 0);
        return result;
    }
    // ============================================================================
    // CHANNEL SELECTION
    // ============================================================================
    selectChannel(trigger, state) {
        // Get allowed channels based on relationship
        const relationshipPermissions = this.config.relationshipPermissions[state.relationshipStage];
        const allowedByRelationship = relationshipPermissions.allowedChannels;
        // Intersect with user's allowed channels
        const allowedChannels = state.allowedChannels.filter((c) => allowedByRelationship.includes(c));
        if (allowedChannels.length === 0) {
            return null;
        }
        // Check user preference
        if (state.preferences.preferredChannel &&
            allowedChannels.includes(state.preferences.preferredChannel)) {
            return state.preferences.preferredChannel;
        }
        // Select based on trigger type and priority
        if (trigger.priority === 'urgent') {
            // Urgent = most immediate channel
            if (allowedChannels.includes('call'))
                return 'call';
            if (allowedChannels.includes('sms'))
                return 'sms';
        }
        // Content-based selection
        const channelForTrigger = this.getChannelForTriggerType(trigger.type);
        if (channelForTrigger && allowedChannels.includes(channelForTrigger)) {
            return channelForTrigger;
        }
        // Historical success-based selection
        const bestChannel = Object.entries(state.patterns.responseRateByChannel)
            .filter(([channel]) => allowedChannels.includes(channel))
            .sort(([, a], [, b]) => b - a)[0];
        if (bestChannel) {
            return bestChannel[0];
        }
        // Fallback to first allowed
        return allowedChannels[0];
    }
    getChannelForTriggerType(type) {
        const channelMap = {
            // Emotional stuff is better via call or voice
            emotional_support: 'call',
            celebration: 'call',
            // Quick check-ins work well as texts
            commitment_check: 'sms',
            habit_check: 'sms',
            thinking_of_you: 'sms',
            check_in: 'sms',
            // Trust-based triggers work well as texts (personal, non-intrusive)
            growth_reflection: 'sms',
            shared_memory: 'sms',
            life_rhythm_prediction: 'sms',
            // Onboarding check-ins (gentle texts, not too intrusive)
            onboarding_welcome: 'sms',
            onboarding_nextday: 'sms',
            onboarding_topic_deepdive: 'sms',
            onboarding_first_week: 'sms',
            onboarding_momentum: 'sms',
            onboarding_two_week: 'email', // Longer, more celebratory - email fits better
            // Detailed stuff goes to email
            content_share: 'email',
            insight_discovery: 'email',
            reengagement: 'email',
        };
        return channelMap[type] || null;
    }
    // ============================================================================
    // GROUP OUTREACH ROUTING
    // ============================================================================
    /**
     * Determine if a trigger should use group outreach (multiple personas)
     */
    isGroupOutreachTrigger(trigger, state) {
        // Explicit group outreach types
        const groupTriggerTypes = [
            'team_insight',
            'collaborative_support',
            'planning',
            'team_roundtable',
        ];
        if (groupTriggerTypes.includes(trigger.type)) {
            return true;
        }
        // Escalate to group support for severe situations
        if (trigger.type === 'emotional_support' && trigger.priority === 'urgent') {
            return true;
        }
        // Escalate celebratory moments for deep relationships
        if (trigger.type === 'celebration' && state.relationshipStage === 'deep') {
            return true;
        }
        // Complex planning that benefits from multiple perspectives
        if (trigger.type === 'milestone_approaching' && trigger.context?.complexity === 'high') {
            return true;
        }
        return false;
    }
    /**
     * Route trigger to appropriate group outreach handler
     */
    async routeToGroupOutreach(trigger, state) {
        const preferredName = this.getUserNameFromContext(trigger.userId, state);
        log.info({ userId: trigger.userId, type: trigger.type, priority: trigger.priority }, '👥 Routing to group outreach');
        switch (trigger.type) {
            case 'team_roundtable':
                await onNeedsTeamRoundtable(trigger.userId, {
                    topic: String(trigger.context?.topic || trigger.reason),
                    reason: trigger.reason,
                    suggestedPersonas: trigger.context?.personas,
                    collaborationMode: trigger.context?.mode,
                    preferredName,
                });
                break;
            case 'team_insight':
                await onNeedsMultiplePerspectives(trigger.userId, {
                    topic: String(trigger.context?.topic || trigger.reason),
                    insightSummary: trigger.reason,
                    preferredName,
                });
                break;
            case 'collaborative_support':
            case 'emotional_support':
                await onNeedsTeamSupport(trigger.userId, {
                    type: trigger.priority === 'urgent' ? 'crisis' : 'complex_challenge',
                    description: trigger.reason,
                    preferredName,
                    currentStruggles: state.context.currentStruggles,
                });
                break;
            case 'celebration':
                await onNeedsTeamSupport(trigger.userId, {
                    type: 'celebration',
                    description: trigger.milestone || trigger.reason,
                    preferredName,
                });
                break;
            case 'planning':
            case 'milestone_approaching':
                await onNeedsTeamRoundtable(trigger.userId, {
                    topic: trigger.milestone || trigger.event || trigger.reason,
                    reason: trigger.reason,
                    collaborationMode: 'brainstorm',
                    preferredName,
                });
                break;
            default:
                // Fallback to team support
                await onNeedsTeamSupport(trigger.userId, {
                    type: 'complex_challenge',
                    description: trigger.reason,
                    preferredName,
                });
        }
    }
    // ============================================================================
    // CONTEXT BUILDING
    // ============================================================================
    buildOutreachContext(trigger, state) {
        // Get username from context aggregator's personal info
        const userName = this.getUserNameFromContext(trigger.userId, state);
        return {
            userId: trigger.userId,
            userName,
            relationshipStage: state.relationshipStage,
            trigger: {
                type: trigger.type,
                reason: trigger.reason,
                urgency: trigger.priority,
            },
            context: {
                recentTopics: state.context.recentTopics,
                recentWins: state.context.recentWins,
                currentStruggles: state.context.currentStruggles,
                upcomingEvents: state.context.upcomingEvents?.map((e) => e.description),
                emotionalState: state.context.emotionalState,
            },
            commitment: trigger.commitment,
            milestone: trigger.milestone,
            goal: trigger.goal,
            event: trigger.event,
        };
    }
    /**
     * Get user's name from context aggregator or profile
     */
    getUserNameFromContext(userId, state) {
        // Try context aggregator first (has personal info from conversations)
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { getUserContext } = require('./context-aggregator.js');
            const context = getUserContext(userId);
            if (context?.personal?.preferredName) {
                return context.personal.preferredName;
            }
            if (context?.personal?.firstName) {
                return context.personal.firstName;
            }
        }
        catch {
            // Context aggregator not available, fall through
        }
        // Fallback: Try user identification service
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { getGreeting } = require('../user-identification.js');
            const greeting = getGreeting(userId);
            // Parse name from greeting if it contains one
            const nameMatch = greeting.match(/(?:Welcome back|Hey|Hi),?\s+(\w+)/i);
            if (nameMatch?.[1] && nameMatch[1] !== 'there') {
                return nameMatch[1];
            }
        }
        catch {
            // User identification not available, fall through
        }
        // Default friendly fallback
        return 'there';
    }
    determineTone(trigger) {
        const toneMap = {
            celebration: 'celebratory',
            emotional_support: 'supportive',
            commitment_check: 'encouraging',
            habit_check: 'encouraging',
            thinking_of_you: 'casual',
            reengagement: 'casual',
            appointment_reminder: 'informative',
            event_countdown: 'celebratory',
            // Trust-based triggers
            growth_reflection: 'encouraging', // Warm reflection on their journey
            shared_memory: 'casual', // Intimate callback to shared moments
            life_rhythm_prediction: 'supportive', // Proactive support before struggle
            check_in: 'casual', // General friendly check-in
        };
        if (trigger.priority === 'urgent') {
            return 'urgent';
        }
        return toneMap[trigger.type] || 'casual';
    }
    // ============================================================================
    // HISTORY & ANALYTICS
    // ============================================================================
    /**
     * Get outreach history for a user (sync - uses cache)
     */
    getOutreachHistory(userId, limit = 20) {
        const history = outreachHistory.get(userId) || [];
        return history.slice(-limit);
    }
    /**
     * Load outreach history from Firestore (async)
     */
    async loadOutreachHistoryFromFirestore(userId, limit = 50) {
        const history = await loadHistory(userId, limit);
        if (history.length > 0) {
            outreachHistory.set(userId, history);
        }
        return history;
    }
    /**
     * Get analytics for outreach effectiveness
     */
    getAnalytics(userId) {
        const history = outreachHistory.get(userId) || [];
        const analytics = {
            totalSent: 0,
            totalSkipped: 0,
            totalDeferred: 0,
            byChannel: {},
            byTrigger: {},
        };
        for (const decision of history) {
            if (decision.decision === 'send') {
                analytics.totalSent++;
                if (decision.channel) {
                    analytics.byChannel[decision.channel] = (analytics.byChannel[decision.channel] || 0) + 1;
                }
            }
            else if (decision.decision === 'skip') {
                analytics.totalSkipped++;
            }
            else if (decision.decision === 'defer') {
                analytics.totalDeferred++;
            }
            const triggerType = decision.trigger.type;
            analytics.byTrigger[triggerType] = (analytics.byTrigger[triggerType] || 0) + 1;
        }
        return analytics;
    }
    // ============================================================================
    // CLEANUP
    // ============================================================================
    /**
     * Clear all data for a user (for testing or privacy)
     */
    clearUserData(userId) {
        userStateStore.delete(userId);
        pendingTriggers.delete(userId);
        outreachHistory.delete(userId);
        // Also clear from Firestore
        import('./firestore-persistence.js')
            .then(({ deleteAllUserOutreachData }) => {
            deleteAllUserOutreachData(userId).catch((err) => {
                log.warn({ userId, error: String(err) }, 'Failed to delete user outreach data from Firestore');
            });
        })
            .catch((err) => {
            log.warn({ userId, error: String(err) }, 'Failed to import firestore-persistence module');
        });
        log.info({ userId }, 'Cleared all outreach data for user');
    }
    /**
     * Load pending triggers for a user from Firestore
     */
    async loadUserTriggersFromFirestore(userId) {
        const triggers = await loadPendingTriggers(userId);
        if (triggers.length > 0) {
            pendingTriggers.set(userId, triggers);
        }
        return triggers;
    }
    /**
     * Reset weekly counters (call this weekly via cron)
     */
    resetWeeklyCounters() {
        for (const [userId, state] of userStateStore.entries()) {
            state.counters.outreachThisWeek = 0;
            userStateStore.set(userId, state);
        }
        log.info('Reset weekly outreach counters for all users');
    }
    /**
     * Get all user IDs in the system
     */
    getAllUserIds() {
        return Array.from(userStateStore.keys());
    }
    /**
     * Prune history older than a cutoff date
     */
    pruneHistory(userId, cutoffDate) {
        const history = outreachHistory.get(userId) || [];
        const cutoffTime = cutoffDate.getTime();
        const filtered = history.filter((d) => new Date(d.decidedAt).getTime() > cutoffTime);
        const pruned = history.length - filtered.length;
        outreachHistory.set(userId, filtered);
        return pruned;
    }
    /**
     * Alias for clearUserData (for consistency)
     */
    clearUserState(userId) {
        this.clearUserData(userId);
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let engineInstance = null;
export function getOutreachDecisionEngine(config) {
    if (!engineInstance) {
        engineInstance = new OutreachDecisionEngine(config);
    }
    return engineInstance;
}
export function startOutreachDecisionEngine(config) {
    const engine = getOutreachDecisionEngine(config);
    engine.start();
    return engine;
}
export function stopOutreachDecisionEngine() {
    if (engineInstance) {
        engineInstance.stop();
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export { OutreachDecisionEngine };
export default {
    getOutreachDecisionEngine,
    startOutreachDecisionEngine,
    stopOutreachDecisionEngine,
};
//# sourceMappingURL=decision-engine.js.map