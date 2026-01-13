/**
 * Music Feedback Manager
 *
 * Singleton manager for recording music transition feedback.
 * This allows the feedback recording function to be set by the music handler
 * and called from anywhere (e.g., transcript handler).
 *
 * Why a singleton? Because the music handler creates the feedback function
 * in a closure, but the transcript handler (in a different file) needs to
 * call it when the user speaks after music ends.
 */
import { createLogger } from '../utils/safe-logger.js';
const log = createLogger({ module: 'MusicFeedbackManager' });
// ============================================================================
// SINGLETON STATE
// ============================================================================
let currentFeedbackRecorder = null;
let lastMusicEndedTimestamp = null;
let lastSessionId = null;
// ============================================================================
// PUBLIC API
// ============================================================================
/**
 * Register the feedback recorder for the current session
 * Called by setupMusicHandler when music handler is initialized
 */
export function registerMusicFeedbackRecorder(sessionId, recorder) {
    currentFeedbackRecorder = recorder;
    lastSessionId = sessionId;
    log.debug({ sessionId }, '📊 Music feedback recorder registered');
}
/**
 * Mark that music has ended (call when transition happens)
 * This starts the window for feedback recording
 */
export function markMusicEnded() {
    lastMusicEndedTimestamp = Date.now();
    log.debug({ timestamp: lastMusicEndedTimestamp }, '📊 Music ended timestamp marked');
}
/**
 * Record feedback for the last music transition
 * Call this when user speaks to update per-user learning
 *
 * @param feedback - The feedback signals
 * @param sessionId - Session ID to verify correct session
 * @returns Whether feedback was recorded
 */
export function recordMusicFeedback(feedback, sessionId) {
    // Verify correct session
    if (sessionId && lastSessionId && sessionId !== lastSessionId) {
        log.debug({ sessionId, lastSessionId }, '📊 Session mismatch, skipping feedback');
        return false;
    }
    // No recorder available
    if (!currentFeedbackRecorder) {
        log.debug('📊 No feedback recorder available');
        return false;
    }
    // No recent music ending
    if (!lastMusicEndedTimestamp) {
        log.debug('📊 No recent music ending to record feedback for');
        return false;
    }
    // Check if within feedback window (2 minutes)
    const timeSinceTransition = Date.now() - lastMusicEndedTimestamp;
    if (timeSinceTransition > 2 * 60 * 1000) {
        log.debug({ ageMs: timeSinceTransition }, '📊 Music transition too old for feedback');
        return false;
    }
    // Record the feedback
    try {
        currentFeedbackRecorder({
            ...feedback,
            timeSinceTransitionMs: timeSinceTransition,
        });
        // Clear timestamp to prevent duplicate recording
        lastMusicEndedTimestamp = null;
        return true;
    }
    catch (e) {
        log.warn({ error: String(e) }, '📊 Failed to record music feedback');
        return false;
    }
}
/**
 * Check if there's a recent music transition to provide feedback on
 */
export function hasPendingMusicFeedback() {
    if (!lastMusicEndedTimestamp || !currentFeedbackRecorder) {
        return false;
    }
    const timeSinceTransition = Date.now() - lastMusicEndedTimestamp;
    return timeSinceTransition < 2 * 60 * 1000;
}
/**
 * Clear the feedback recorder (call on session end)
 */
export function clearMusicFeedbackRecorder(sessionId) {
    if (sessionId && lastSessionId && sessionId !== lastSessionId) {
        return; // Don't clear if session doesn't match
    }
    currentFeedbackRecorder = null;
    lastMusicEndedTimestamp = null;
    lastSessionId = null;
    log.debug('📊 Music feedback recorder cleared');
}
const POSITIVE_PATTERNS = [
    // Gratitude (strong positive signal)
    { pattern: /thank(s| you)( (so much|for that))?/i, weight: 0.8, category: 'gratitude' },
    { pattern: /appreciate (that|it|this)/i, weight: 0.7, category: 'gratitude' },
    // Emotional relief (very strong signal - music helped emotionally)
    {
        pattern: /i (feel|felt|'m feeling) (so much )?(better|calmer|more relaxed|at peace|grounded|centered)/i,
        weight: 0.95,
        category: 'relief',
    },
    { pattern: /(that|this|it) (really )?(helped|helped me)/i, weight: 0.9, category: 'relief' },
    { pattern: /needed (that|this|to hear that)/i, weight: 0.85, category: 'relief' },
    { pattern: /exactly what i needed/i, weight: 0.95, category: 'relief' },
    { pattern: /weight off my (shoulders|chest)/i, weight: 0.9, category: 'relief' },
    // Enjoyment (moderate signal)
    {
        pattern: /that (was |felt )?(nice|good|great|lovely|perfect|beautiful|wonderful|amazing)/i,
        weight: 0.7,
        category: 'enjoyment',
    },
    { pattern: /love(d)? (that|it|the music|this)/i, weight: 0.75, category: 'enjoyment' },
    { pattern: /beautiful( music| song)?/i, weight: 0.6, category: 'enjoyment' },
    { pattern: /so (good|nice|calming|peaceful|relaxing)/i, weight: 0.7, category: 'enjoyment' },
    {
        pattern: /(good|great|perfect) (choice|pick|song|music)/i,
        weight: 0.65,
        category: 'enjoyment',
    },
    // Emotional resonance (strong signal)
    { pattern: /hit(s)? (me |the spot|different)/i, weight: 0.8, category: 'emotional' },
    { pattern: /spoke to me/i, weight: 0.85, category: 'emotional' },
    { pattern: /really (resonated|connected)/i, weight: 0.8, category: 'emotional' },
    { pattern: /brought (tears|a smile)/i, weight: 0.9, category: 'emotional' },
    { pattern: /made me (feel|smile|cry)/i, weight: 0.85, category: 'emotional' },
    // Practical effectiveness (moderate signal)
    { pattern: /i('m| am) (ready|able) to/i, weight: 0.6, category: 'practical' },
    { pattern: /now i can/i, weight: 0.55, category: 'practical' },
    { pattern: /cleared my (head|mind)/i, weight: 0.75, category: 'practical' },
    { pattern: /helped me (think|focus|process)/i, weight: 0.8, category: 'practical' },
    // Energy shift (moderate signal)
    { pattern: /feel (more )?energized/i, weight: 0.65, category: 'energy' },
    { pattern: /that was fun/i, weight: 0.6, category: 'energy' },
    { pattern: /(pumped|hyped)( me)? up/i, weight: 0.7, category: 'energy' },
    // Continuation signals (weak but positive)
    { pattern: /more( of that| please| music)?$/i, weight: 0.5, category: 'enjoyment' },
    { pattern: /play (that|it|another) again/i, weight: 0.7, category: 'enjoyment' },
    { pattern: /can you play/i, weight: 0.4, category: 'enjoyment' }, // Requesting more
];
const NEGATIVE_PATTERNS = [
    // Strong negative
    { pattern: /not (really |what i |helping|working)/i, weight: 0.8, category: 'negative' },
    { pattern: /don't like/i, weight: 0.85, category: 'negative' },
    { pattern: /hate (that|this|it)/i, weight: 0.95, category: 'negative' },
    { pattern: /stop( the music| it| playing)?/i, weight: 0.9, category: 'negative' },
    { pattern: /turn (it|that|this) off/i, weight: 0.9, category: 'negative' },
    { pattern: /annoying/i, weight: 0.8, category: 'negative' },
    { pattern: /too (loud|quiet|much|long)/i, weight: 0.6, category: 'negative' },
    { pattern: /not (in the |the right )?mood/i, weight: 0.7, category: 'negative' },
    { pattern: /can('t| not) (focus|concentrate|think) with/i, weight: 0.75, category: 'negative' },
    { pattern: /(weird|strange|wrong|off)/i, weight: 0.5, category: 'negative' },
    { pattern: /makes? me (feel )?(worse|sad|anxious)/i, weight: 0.9, category: 'negative' },
];
/**
 * Auto-detect feedback signals from user response
 *
 * Enhanced with semantic understanding:
 * - Multiple pattern categories with weighted scoring
 * - Confidence based on signal strength
 * - Better handling of nuanced responses
 *
 * @param userResponse - What the user said
 * @returns Detected feedback signals with confidence
 */
export function detectFeedbackFromResponse(userResponse) {
    const response = userResponse.toLowerCase();
    const feedback = {
        userResponse,
        continuedSession: true,
    };
    // Calculate weighted positive score
    let positiveScore = 0;
    let negativeScore = 0;
    const matchedCategories = [];
    for (const { pattern, weight, category } of POSITIVE_PATTERNS) {
        if (pattern.test(response)) {
            positiveScore += weight;
            if (!matchedCategories.includes(category)) {
                matchedCategories.push(category);
            }
        }
    }
    for (const { pattern, weight, category } of NEGATIVE_PATTERNS) {
        if (pattern.test(response)) {
            negativeScore += weight;
            if (!matchedCategories.includes(category)) {
                matchedCategories.push(category);
            }
        }
    }
    // Normalize scores (cap at 1.0)
    positiveScore = Math.min(positiveScore, 1.0);
    negativeScore = Math.min(negativeScore, 1.0);
    // Determine sentiment with confidence
    const scoreDiff = positiveScore - negativeScore;
    if (scoreDiff > 0.2) {
        // Clear positive signal
        feedback.wasPositive = true;
        feedback.confidence = Math.min(0.5 + scoreDiff, 1.0);
    }
    else if (scoreDiff < -0.2) {
        // Clear negative signal
        feedback.wasPositive = false;
        feedback.confidence = Math.min(0.5 + Math.abs(scoreDiff), 1.0);
    }
    else if (positiveScore > 0.3 && negativeScore === 0) {
        // Weak but clear positive
        feedback.wasPositive = true;
        feedback.confidence = positiveScore;
    }
    else if (negativeScore > 0.3 && positiveScore === 0) {
        // Weak but clear negative
        feedback.wasPositive = false;
        feedback.confidence = negativeScore;
    }
    // If mixed or neutral, leave wasPositive undefined
    if (matchedCategories.length > 0) {
        feedback.matchedCategories = matchedCategories;
    }
    return feedback;
}
/**
 * Simple feedback detection (backward compatible)
 * Returns basic wasPositive without confidence scoring
 */
export function detectFeedbackSimple(userResponse) {
    const result = detectFeedbackFromResponse(userResponse);
    // Strip confidence for backward compatibility
    const { confidence: _, matchedCategories: __, ...basic } = result;
    return basic;
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    registerMusicFeedbackRecorder,
    markMusicEnded,
    recordMusicFeedback,
    hasPendingMusicFeedback,
    clearMusicFeedbackRecorder,
    detectFeedbackFromResponse,
};
//# sourceMappingURL=music-feedback-manager.js.map