/**
 * Cross-Session Reflection Context Builder
 *
 * Injects "I've been thinking about..." reflections from previous sessions.
 * Makes the persona feel like they have continuity of thought between conversations.
 */
import { getLogger } from '../../../utils/safe-logger.js';
import { registerContextBuilder, createStandardInjection, } from '../index.js';
import { detectReflectionMoment, selectBestReflection, getReflectionMoments, saveReflectionMoment, markMomentReflectedOn, } from '../../cross-session-reflection.js';
const log = getLogger();
// Track if we've already injected a reflection this session
let reflectionInjectedThisSession = false;
let currentSessionId = null;
/**
 * Cross-Session Reflection Context Builder
 */
const crossSessionReflectionBuilder = {
    name: 'cross-session-reflection',
    description: 'Injects reflections from previous session moments',
    priority: 35, // Early, before memory callbacks
    build: async (input) => {
        const { analysis, services, userData, userProfile, userText } = input;
        const injections = [];
        const turnCount = userData.turnCount || 0;
        // Reset session tracking on new session
        if (currentSessionId !== services.sessionId) {
            currentSessionId = services.sessionId;
            reflectionInjectedThisSession = false;
        }
        // =========================================================================
        // PART 1: Detect and save new reflection moments
        // =========================================================================
        if (userProfile && turnCount > 2) {
            const newMoment = detectReflectionMoment(userText, analysis.topics.primary || analysis.topics.detected[0] || 'this', analysis.emotion.primary, analysis.emotion.intensity || 0, services.sessionId, services.personaId);
            if (newMoment) {
                saveReflectionMoment(userProfile, newMoment);
                log.debug({ type: newMoment.type, topic: newMoment.topic }, 'Detected reflection-worthy moment');
            }
        }
        // =========================================================================
        // PART 2: Inject reflection from previous sessions
        // =========================================================================
        // Only inject once per session, in early turns
        if (reflectionInjectedThisSession)
            return injections;
        if (turnCount < 2 || turnCount > 5)
            return injections;
        const moments = getReflectionMoments(userProfile);
        if (moments.length === 0)
            return injections;
        // Filter to moments from previous sessions
        const previousSessionMoments = moments.filter((m) => m.sessionId !== services.sessionId);
        if (previousSessionMoments.length === 0)
            return injections;
        const reflection = selectBestReflection(previousSessionMoments, analysis.topics.detected, analysis.emotion.primary, turnCount);
        if (reflection) {
            injections.push(createStandardInjection('cross_session_reflection', `[CROSS-SESSION REFLECTION: Something from your last conversation has stayed with you. Consider naturally weaving in: "${reflection.phrase}"]`));
            // Mark as used
            if (userProfile) {
                markMomentReflectedOn(userProfile, reflection.momentId);
            }
            reflectionInjectedThisSession = true;
            log.info({ momentId: reflection.momentId, appropriateness: reflection.appropriateness }, 'Injected cross-session reflection');
        }
        return injections;
    },
};
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder(crossSessionReflectionBuilder);
export { crossSessionReflectionBuilder };
//# sourceMappingURL=cross-session-reflection.js.map