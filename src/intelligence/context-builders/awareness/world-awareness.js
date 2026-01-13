/**
 * World Awareness Context Builder
 *
 * "Better Than Human" - Ferni already knows what's happening in the world.
 * This builder injects world context NATURALLY into conversations.
 *
 * Key principle: No "let me check" moments.
 * The WorldAwarenessService pre-fetches everything, this builder just decides
 * WHEN and HOW to inject that knowledge.
 *
 * Injection Strategy:
 * - Turn 0-1: Holiday greetings, weather hooks, exciting games
 * - Turn 2-5: Can reference news naturally if relevant
 * - Any turn: Sports updates if user has shown interest
 * - Occasional: Historical "on this day" facts
 *
 * @module WorldAwarenessBuilder
 */
import { detectTeamMention, getConversationStarter, getWorldSnapshot, updateUserInterests, } from '../../../services/world-awareness/index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { createHintInjection, createStandardInjection, registerContextBuilder, } from '../index.js';
const log = createLogger({ module: 'WorldAwarenessBuilder' });
// ============================================================================
// INJECTION LOGIC
// ============================================================================
/**
 * Should we inject world awareness this turn?
 * We don't want to overwhelm - be selective and natural.
 */
function shouldInjectWorldContext(turnCount, snapshot, userText) {
    // Always inject on first turn if we have a holiday
    if (turnCount <= 1 && snapshot.cultural.holiday) {
        return { shouldInject: true, reason: 'holiday_greeting' };
    }
    // Always inject if there's an exciting game for a tracked team
    if (snapshot.sports?.excitingGame) {
        return { shouldInject: true, reason: 'exciting_game' };
    }
    // Inject weather hook on first turn if interesting
    if (turnCount <= 1 && snapshot.weather?.conversationHook) {
        return { shouldInject: true, reason: 'weather_hook' };
    }
    // Check if user is asking about the world
    const worldQueryPatterns = [
        /what('s| is)?\s+(happening|going on|new|up)/i,
        /any\s+news/i,
        /what('s| did)?\s+(the|my)\s+\w+\s+(do|score|play)/i, // sports
        /how('s| is)?\s+the\s+(weather|market)/i,
        /catch me up/i,
    ];
    if (worldQueryPatterns.some((p) => p.test(userText))) {
        return { shouldInject: true, reason: 'user_asked' };
    }
    // Occasionally inject historical fact (10% chance after turn 3)
    if (turnCount > 3 && snapshot.cultural.historicalEvent && Math.random() < 0.1) {
        return { shouldInject: true, reason: 'historical_fact' };
    }
    // Inject upcoming major holiday warning (1-2 days away)
    const upcomingMajor = snapshot.cultural.upcomingHolidays.find((h) => h.type === 'major');
    if (upcomingMajor && turnCount <= 2) {
        const daysAway = Math.ceil((upcomingMajor.date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        if (daysAway <= 2) {
            return { shouldInject: true, reason: 'upcoming_holiday' };
        }
    }
    return { shouldInject: false, reason: 'no_trigger' };
}
/**
 * Build the actual injection content based on what we know
 */
function buildWorldInjection(snapshot, reason, turnCount) {
    switch (reason) {
        case 'holiday_greeting':
            if (snapshot.cultural.holiday) {
                return createStandardInjection('world_awareness', `[WORLD AWARENESS - TODAY]
Today is ${snapshot.cultural.holiday.name}. 
Natural acknowledgment: "${snapshot.cultural.holiday.acknowledgment}"
${snapshot.cultural.holiday.sensitivity ? `Note: ${snapshot.cultural.holiday.sensitivity}` : ''}
Weave this naturally into your greeting - don't make it the whole focus.`);
            }
            break;
        case 'exciting_game':
            if (snapshot.sports?.excitingGame) {
                return createStandardInjection('world_awareness', `[WORLD AWARENESS - LIVE SPORTS]
${snapshot.sports.excitingGame}
If relevant to this user, mention it naturally - sports can be a great connector.`);
            }
            break;
        case 'weather_hook':
            if (snapshot.weather?.conversationHook) {
                return createHintInjection('world_awareness', `[WORLD AWARENESS - WEATHER]
${snapshot.weather.conversationHook}
Current: ${snapshot.weather.current}
Use this as a natural conversation starter if appropriate.`);
            }
            break;
        case 'user_asked':
            // User explicitly asked - give them the full picture
            const parts = ['[WORLD AWARENESS - USER ASKED FOR UPDATE]'];
            if (snapshot.weather) {
                parts.push(`Weather: ${snapshot.weather.current}`);
            }
            if (snapshot.news?.topStory) {
                parts.push(`Top News: ${snapshot.news.topStory}`);
            }
            if (snapshot.sports && snapshot.sports.scores.size > 0) {
                const scores = Array.from(snapshot.sports.scores.values()).slice(0, 2);
                parts.push(`Sports: ${scores.join(' | ')}`);
            }
            if (snapshot.cultural.holiday) {
                parts.push(`Today: ${snapshot.cultural.holiday.name}`);
            }
            parts.push('\nShare this naturally - you already KNOW these things, no need to "check".');
            return createStandardInjection('world_awareness', parts.join('\n'));
        case 'historical_fact':
            if (snapshot.cultural.historicalEvent) {
                return createHintInjection('world_awareness', `[WORLD AWARENESS - HISTORICAL]
${snapshot.cultural.historicalEvent}
Only mention if it fits naturally in conversation - don't force it.`);
            }
            break;
        case 'upcoming_holiday':
            const upcoming = snapshot.cultural.upcomingHolidays.find((h) => h.type === 'major');
            if (upcoming) {
                const daysAway = Math.ceil((upcoming.date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                return createHintInjection('world_awareness', `[WORLD AWARENESS - UPCOMING]
${upcoming.name} is ${daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`}.
You might naturally acknowledge plans or preparations if it fits.`);
            }
            break;
    }
    return null;
}
/**
 * Check for user mentioning sports teams and track them
 */
function checkForTeamInterest(userText, userId) {
    const team = detectTeamMention(userText);
    if (team) {
        log.debug({ userId, team }, 'Detected sports team interest');
        updateUserInterests(userId, { favoriteTeams: [team] });
    }
}
// ============================================================================
// MAIN BUILDER
// ============================================================================
async function buildWorldAwarenessContext(input) {
    const injections = [];
    const { userText, userData, services } = input;
    const userId = services?.userId || 'anonymous';
    const turnCount = userData?.turnCount ?? 0;
    // Check if user mentioned a sports team (background tracking)
    if (userText && userId !== 'anonymous') {
        checkForTeamInterest(userText, userId);
    }
    // Get the pre-cached world snapshot
    const snapshot = getWorldSnapshot(userId);
    // Decide if we should inject world context
    const { shouldInject, reason } = shouldInjectWorldContext(turnCount, snapshot, userText || '');
    if (!shouldInject) {
        return injections;
    }
    // Build the injection
    const injection = buildWorldInjection(snapshot, reason, turnCount);
    if (injection) {
        injections.push(injection);
        log.debug({ userId, reason, turnCount }, 'World awareness injected');
    }
    // Add seasonal context hint on first turn
    if (turnCount <= 1 && snapshot.cultural.seasonalContext) {
        injections.push(createHintInjection('world_awareness_seasonal', `[SEASONAL AWARENESS]
${snapshot.cultural.seasonalContext}
This can inform your energy and conversation tone.`));
    }
    return injections;
}
// ============================================================================
// REGISTRATION
// ============================================================================
registerContextBuilder({
    name: 'world_awareness',
    description: 'Injects world context (weather, news, sports, holidays) naturally into conversations. Better Than Human - Ferni already knows.',
    priority: 45, // Run after core builders but before personality
    build: buildWorldAwarenessContext,
});
// ============================================================================
// GREETING HELPER (for direct use in greetings)
// ============================================================================
/**
 * Get a natural world-aware greeting enhancement.
 * Call this when building a greeting to add world context.
 *
 * @returns A phrase to weave into the greeting, or null
 */
export function getWorldAwareGreetingHook(userId) {
    return getConversationStarter(userId);
}
/**
 * Get current weather summary for a user's location.
 * Returns null if no location set or weather unavailable.
 */
export function getCurrentWeatherSummary(userId) {
    const snapshot = getWorldSnapshot(userId);
    return snapshot.weather?.current || null;
}
/**
 * Get any exciting sports updates for user's tracked teams.
 */
export function getSportsUpdate(userId) {
    const snapshot = getWorldSnapshot(userId);
    if (snapshot.sports?.excitingGame) {
        return snapshot.sports.excitingGame;
    }
    // Return latest score if available
    if (snapshot.sports && snapshot.sports.scores.size > 0) {
        const [firstScore] = snapshot.sports.scores.values();
        return firstScore;
    }
    return null;
}
/**
 * Get today's holiday if any.
 */
export function getTodayHoliday(userId) {
    const snapshot = getWorldSnapshot(userId);
    if (snapshot.cultural.holiday) {
        return {
            name: snapshot.cultural.holiday.name,
            acknowledgment: snapshot.cultural.holiday.acknowledgment,
        };
    }
    return null;
}
// ============================================================================
// EXPORTS
// ============================================================================
export { buildWorldAwarenessContext };
//# sourceMappingURL=world-awareness.js.map