/**
 * Ambient State Manager
 *
 * > "Better than human means being there even when we're not talking."
 *
 * Manages user's ambient state and generates contextual nudges.
 *
 * @module services/ambient-mode/ambient-state-manager
 */
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
const log = createLogger({ module: 'ambient-state-manager' });
function getFirestoreDb() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const admin = require('firebase-admin');
        return admin.firestore();
    }
    catch {
        log.debug('Firestore not available');
        return null;
    }
}
// ============================================================================
// STATE STORAGE
// ============================================================================
/**
 * Store ambient state for user
 */
export async function storeAmbientState(state) {
    const db = getFirestoreDb();
    if (!db)
        return;
    try {
        await db
            .collection('bogle_users')
            .doc(state.userId)
            .collection('ambient')
            .doc('current_state')
            .set(cleanForFirestore(state), { merge: true });
        log.debug({ userId: state.userId, locationType: state.locationType }, 'Ambient state stored');
    }
    catch (error) {
        log.error({ error: String(error), userId: state.userId }, 'Failed to store ambient state');
    }
}
/**
 * Get current ambient state for user
 */
export async function getAmbientState(userId) {
    const db = getFirestoreDb();
    if (!db)
        return null;
    try {
        const doc = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('ambient')
            .doc('current_state')
            .get();
        if (!doc.exists)
            return null;
        return doc.data();
    }
    catch (error) {
        log.debug({ error: String(error), userId }, 'Failed to get ambient state');
        return null;
    }
}
// ============================================================================
// PREFERENCES
// ============================================================================
/**
 * Get ambient preferences
 */
export async function getAmbientPreferences(userId) {
    const db = getFirestoreDb();
    if (!db)
        return null;
    try {
        const doc = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('settings')
            .doc('ambient_preferences')
            .get();
        if (!doc.exists)
            return null;
        return doc.data();
    }
    catch (error) {
        log.debug({ error: String(error), userId }, 'Failed to get ambient preferences');
        return null;
    }
}
/**
 * Update ambient preferences
 */
export async function updateAmbientPreferences(userId, prefs) {
    const db = getFirestoreDb();
    if (!db)
        return;
    try {
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('settings')
            .doc('ambient_preferences')
            .set(cleanForFirestore({
            ...prefs,
            updatedAt: new Date().toISOString(),
        }), { merge: true });
        log.info({ userId }, 'Ambient preferences updated');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to update ambient preferences');
    }
}
// ============================================================================
// NUDGE GENERATION
// ============================================================================
// Last nudge sent by type (in-memory cache, would be Firestore in production)
const lastNudgeTimes = new Map();
/**
 * Evaluate and generate nudge based on ambient state
 */
export async function evaluateNudge(state) {
    const { userId, timeOfDay, locationType, deviceActive, doNotDisturbEnabled } = state;
    // Check preferences
    const prefs = await getAmbientPreferences(userId);
    if (prefs && !prefs.enabled)
        return null;
    if (prefs && !prefs.allowPushNudges)
        return null;
    // Don't nudge during DND
    if (doNotDisturbEnabled)
        return null;
    // Check quiet hours
    if (prefs?.quietHoursStart && prefs?.quietHoursEnd) {
        const now = new Date(state.localTime);
        const hours = now.getHours();
        const startHour = parseInt(prefs.quietHoursStart.split(':')[0]);
        const endHour = parseInt(prefs.quietHoursEnd.split(':')[0]);
        if (startHour > endHour) {
            // Quiet hours cross midnight
            if (hours >= startHour || hours < endHour)
                return null;
        }
        else {
            if (hours >= startHour && hours < endHour)
                return null;
        }
    }
    // Generate potential nudges
    const nudges = [];
    // Morning check-in (7-9am, at home, device becoming active)
    if (timeOfDay === 'morning' && locationType === 'home' && deviceActive) {
        nudges.push({
            type: 'morning_checkin',
            priority: 6,
            message: getMorningMessage(state),
            shouldSend: true,
            reason: 'Morning at home, good time for check-in',
            channel: 'push_notification',
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
        });
    }
    // Evening reflection (8-10pm, at home)
    if (timeOfDay === 'evening' && locationType === 'home') {
        nudges.push({
            type: 'evening_reflection',
            priority: 5,
            message: getEveningMessage(state),
            shouldSend: true,
            reason: 'Evening at home, good time for reflection',
            channel: 'push_notification',
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        });
    }
    // Commute moment (transit, moderate priority)
    if (locationType === 'transit' && state.activityType !== 'driving') {
        nudges.push({
            type: 'commute_moment',
            priority: 4,
            message: getCommuteMessage(state),
            shouldSend: true,
            reason: 'In transit, might have a moment',
            channel: 'push_notification',
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
        });
    }
    // Post-meeting debrief
    if (state.inMeeting === false && state.meetingEndsAt) {
        const meetingEndedAt = new Date(state.meetingEndsAt);
        const minutesSince = (Date.now() - meetingEndedAt.getTime()) / (1000 * 60);
        if (minutesSince < 15 && minutesSince > 2) {
            nudges.push({
                type: 'post_meeting',
                priority: 5,
                message: "How'd that meeting go? Need to process anything?",
                shouldSend: true,
                reason: 'Just finished a meeting',
                channel: 'push_notification',
                generatedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            });
        }
    }
    // Gym/workout encouragement
    if (locationType === 'gym') {
        nudges.push({
            type: 'workout_encouragement',
            priority: 3,
            message: "Nice! Getting a workout in. You've got this! 💪",
            shouldSend: true,
            reason: 'At the gym',
            channel: 'silent', // Just log, don't interrupt workout
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        });
    }
    // Bedtime reminder (late night, at home)
    if (timeOfDay === 'late_night' && locationType === 'home' && deviceActive) {
        nudges.push({
            type: 'bedtime_reminder',
            priority: 4,
            message: "It's getting late. How are you feeling about winding down?",
            shouldSend: true,
            reason: 'Late night, still active',
            channel: 'push_notification',
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        });
    }
    // Weather-related (nice day)
    if (state.weather?.condition === 'sunny' &&
        timeOfDay === 'afternoon' &&
        locationType === 'home') {
        nudges.push({
            type: 'weather_related',
            priority: 2,
            message: `It's ${state.weather.temperature}° and sunny. Might be nice to step outside for a bit.`,
            shouldSend: true,
            reason: 'Nice weather, at home',
            channel: 'push_notification',
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        });
    }
    // Filter by preferences
    let filtered = nudges;
    if (prefs?.allowedNudgeTypes && prefs.allowedNudgeTypes.length > 0) {
        filtered = nudges.filter((n) => prefs.allowedNudgeTypes.includes(n.type));
    }
    // Apply cooldowns
    const withCooldowns = filtered.filter((n) => !isOnCooldown(userId, n.type));
    // Return highest priority
    if (withCooldowns.length === 0)
        return null;
    const best = withCooldowns.sort((a, b) => b.priority - a.priority)[0];
    // Record that we sent this type
    recordNudgeSent(userId, best.type);
    return best;
}
function isOnCooldown(userId, nudgeType) {
    const userNudges = lastNudgeTimes.get(userId);
    if (!userNudges)
        return false;
    const lastTime = userNudges.get(nudgeType);
    if (!lastTime)
        return false;
    // 4-hour cooldown per nudge type
    const cooldownMs = 4 * 60 * 60 * 1000;
    return Date.now() - lastTime < cooldownMs;
}
function recordNudgeSent(userId, nudgeType) {
    let userNudges = lastNudgeTimes.get(userId);
    if (!userNudges) {
        userNudges = new Map();
        lastNudgeTimes.set(userId, userNudges);
    }
    userNudges.set(nudgeType, Date.now());
}
// ============================================================================
// MESSAGE TEMPLATES
// ============================================================================
function getMorningMessage(state) {
    const messages = [
        'Good morning! How are you feeling today?',
        "Morning! What's on your mind as you start the day?",
        'Hey there. Ready to take on today?',
        'Good morning. Anything you want to set your intention on today?',
    ];
    return messages[Math.floor(Math.random() * messages.length)];
}
function getEveningMessage(state) {
    const messages = [
        'How was your day?',
        'Evening check-in. Anything you want to reflect on from today?',
        "Hey there. How's the day been treating you?",
        "Day's winding down. How are you feeling?",
    ];
    return messages[Math.floor(Math.random() * messages.length)];
}
function getCommuteMessage(state) {
    const messages = [
        "Got a moment while you're on the move?",
        "How's the commute? Anything on your mind?",
        'Heading somewhere? Happy to chat if you want company.',
    ];
    return messages[Math.floor(Math.random() * messages.length)];
}
// ============================================================================
// SYNC HANDLER
// ============================================================================
/**
 * Handle ambient state sync from mobile app
 */
export async function handleAmbientSync(request) {
    const { userId, state: partialState } = request;
    log.debug({ userId, locationType: partialState.locationType }, 'Processing ambient sync');
    try {
        // Check if ambient mode is enabled
        const prefs = await getAmbientPreferences(userId);
        if (prefs && !prefs.enabled) {
            return {
                success: false,
                nextSyncInterval: 3600, // Check again in an hour
            };
        }
        // Build full state
        const fullState = {
            userId,
            updatedAt: new Date().toISOString(),
            timezone: partialState.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            localTime: partialState.localTime || new Date().toISOString(),
            timeOfDay: partialState.timeOfDay || calculateTimeOfDay(new Date()),
            deviceType: partialState.deviceType || 'ios',
            deviceActive: partialState.deviceActive ?? true,
            ...partialState,
        };
        // Store state
        await storeAmbientState(fullState);
        // Evaluate if we should send a nudge
        const nudge = await evaluateNudge(fullState);
        // Determine next sync interval
        let nextSyncInterval = 900; // 15 minutes default
        if (fullState.deviceActive) {
            nextSyncInterval = 300; // 5 minutes when active
        }
        if (fullState.activityType === 'driving') {
            nextSyncInterval = 1800; // 30 minutes when driving
        }
        if (fullState.doNotDisturbEnabled) {
            nextSyncInterval = 3600; // 1 hour during DND
        }
        return {
            success: true,
            pendingNudge: nudge || undefined,
            nextSyncInterval,
        };
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Ambient sync failed');
        return {
            success: false,
            nextSyncInterval: 900,
        };
    }
}
function calculateTimeOfDay(date) {
    const hour = date.getHours();
    if (hour >= 5 && hour < 7)
        return 'early_morning';
    if (hour >= 7 && hour < 12)
        return 'morning';
    if (hour >= 12 && hour < 17)
        return 'afternoon';
    if (hour >= 17 && hour < 21)
        return 'evening';
    if (hour >= 21 || hour < 1)
        return 'night';
    return 'late_night';
}
// ============================================================================
// CONTEXT FOR LLM
// ============================================================================
/**
 * Build ambient context for LLM injection
 */
export async function buildAmbientContext(userId) {
    const state = await getAmbientState(userId);
    const prefs = await getAmbientPreferences(userId);
    if (!state || (prefs && !prefs.enabled)) {
        return {
            hasAmbientData: false,
        };
    }
    const context = {
        hasAmbientData: true,
        insights: [],
        conversationStarters: [],
    };
    // Time awareness
    const timeDescriptions = {
        early_morning: 'very early in the morning',
        morning: 'morning',
        afternoon: 'afternoon',
        evening: 'evening',
        night: 'night',
        late_night: 'late at night',
    };
    context.timeAwareness = `It's ${timeDescriptions[state.timeOfDay]} for the user (${state.localTime})`;
    // Location awareness (if allowed)
    if (prefs?.allowLocation && state.locationType && state.locationType !== 'unknown') {
        const locationDescriptions = {
            home: 'at home',
            work: 'at work',
            gym: 'at the gym',
            restaurant: 'at a restaurant',
            transit: 'traveling/commuting',
            outdoors: 'outside',
        };
        context.locationAwareness = `User appears to be ${locationDescriptions[state.locationType]}`;
    }
    // Activity awareness
    if (prefs?.allowActivityDetection && state.activityType) {
        if (state.activityType === 'walking') {
            context.activityAwareness = 'User is walking';
        }
        else if (state.activityType === 'running') {
            context.activityAwareness = 'User is running';
        }
        else if (state.inMeeting) {
            context.activityAwareness = 'User may be in a meeting';
        }
    }
    // Environmental
    if (state.weather) {
        context.environmentAwareness = `Weather: ${state.weather.condition}, ${state.weather.temperature}°${state.weather.unit}`;
    }
    // Generate insights
    if (state.timeOfDay === 'late_night' && state.deviceActive) {
        context.insights?.push('User is up late and still on their device');
        context.conversationStarters?.push("It's late - everything okay?");
    }
    if (state.locationType === 'gym') {
        context.insights?.push('User is at the gym');
        context.conversationStarters?.push("Getting a workout in! How's it going?");
    }
    return context;
}
/**
 * Format ambient context for LLM injection
 */
export async function getAmbientContextInjection(userId) {
    const context = await buildAmbientContext(userId);
    if (!context.hasAmbientData) {
        return '';
    }
    const lines = ['[AMBIENT AWARENESS - Better Than Human]'];
    lines.push('');
    lines.push('You know where the user is and what time it is for them:');
    if (context.timeAwareness)
        lines.push(`- ${context.timeAwareness}`);
    if (context.locationAwareness)
        lines.push(`- ${context.locationAwareness}`);
    if (context.activityAwareness)
        lines.push(`- ${context.activityAwareness}`);
    if (context.environmentAwareness)
        lines.push(`- ${context.environmentAwareness}`);
    if (context.insights && context.insights.length > 0) {
        lines.push('');
        lines.push('Insights:');
        for (const insight of context.insights) {
            lines.push(`- ${insight}`);
        }
    }
    lines.push('');
    lines.push('GUIDANCE:');
    lines.push("- Use this context naturally - don't announce that you know their location");
    lines.push('- "Hope your evening is going well" instead of "I see you\'re at home at night"');
    lines.push('- This is "better than human" - a phone friend wouldn\'t know this context');
    return lines.join('\n');
}
// ============================================================================
// EXPORTS
// ============================================================================
export const ambientStateManager = {
    storeAmbientState,
    getAmbientState,
    getAmbientPreferences,
    updateAmbientPreferences,
    evaluateNudge,
    handleAmbientSync,
    buildAmbientContext,
    getAmbientContextInjection,
};
//# sourceMappingURL=ambient-state-manager.js.map