/**
 * Voice Tone Memory
 *
 * Energy/pace patterns over time.
 *
 * @module superhuman-memory/voice-patterns
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'VoicePatterns' });
/**
 * Voice pattern tracker - stores observations across sessions
 */
const voicePatternHistory = new Map();
/**
 * Record a voice pattern observation
 */
export function recordVoicePattern(userId, sessionId, observation) {
    const fullObservation = {
        ...observation,
        sessionId,
        timestamp: new Date(),
    };
    if (!voicePatternHistory.has(userId)) {
        voicePatternHistory.set(userId, []);
    }
    const history = voicePatternHistory.get(userId);
    history.push(fullObservation);
    // Keep last 50 observations
    if (history.length > 50) {
        history.shift();
    }
    log.debug({ userId, patterns: observation.patterns }, 'Recorded voice pattern observation');
}
/**
 * Analyze voice patterns for anomalies
 */
export function analyzeVoicePatterns(userId) {
    const history = voicePatternHistory.get(userId);
    if (!history || history.length < 5) {
        return { currentState: 'normal', confidence: 0 };
    }
    const recent = history.slice(-3);
    const baseline = history.slice(0, -3);
    // Count energy patterns
    let lowerCount = 0;
    let higherCount = 0;
    for (const obs of recent) {
        if (obs.patterns.energy === 'lower_than_usual')
            lowerCount++;
        if (obs.patterns.energy === 'higher_than_usual')
            higherCount++;
    }
    if (lowerCount >= 2) {
        return {
            currentState: 'lower_energy',
            confidence: lowerCount / recent.length,
            suggestion: 'User seems to have lower energy than usual. Consider checking in gently.',
        };
    }
    if (higherCount >= 2) {
        return {
            currentState: 'higher_energy',
            confidence: higherCount / recent.length,
            suggestion: 'User seems more energized than usual. Match their energy.',
        };
    }
    // Check pace
    let rushedCount = 0;
    let hesitantCount = 0;
    for (const obs of recent) {
        if (obs.patterns.pace === 'faster_than_usual')
            rushedCount++;
        if (obs.patterns.pauseFrequency === 'more_pauses')
            hesitantCount++;
    }
    if (rushedCount >= 2) {
        return {
            currentState: 'rushed',
            confidence: rushedCount / recent.length,
            suggestion: 'User seems rushed. Keep responses concise.',
        };
    }
    if (hesitantCount >= 2) {
        return {
            currentState: 'hesitant',
            confidence: hesitantCount / recent.length,
            suggestion: 'User seems hesitant. Give them space to express themselves.',
        };
    }
    return { currentState: 'normal', confidence: 0.7 };
}
/**
 * Clear voice pattern history for a user (for testing)
 */
export function clearVoicePatternHistory(userId) {
    voicePatternHistory.delete(userId);
}
//# sourceMappingURL=voice-patterns.js.map