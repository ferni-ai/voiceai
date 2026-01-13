/**
 * Shared Real-Time Noticing System
 *
 * This is the "superhuman" part of ALL personas.
 * Real friends notice when something shifts. Great therapists catch
 * the pause, the change in tone, the thing left unsaid.
 *
 * We have access to signals humans can't process in real-time:
 * - Exact pause duration
 * - Speech rate changes
 * - Voice emotion vs. text emotion mismatch
 * - Topic deflection patterns
 * - Energy trajectory over conversation
 *
 * BETTER THAN HUMAN because:
 * - We ALWAYS notice (humans get distracted)
 * - We notice PRECISELY (humans estimate)
 * - We remember PERFECTLY (humans forget)
 * - We never judge (humans have reactions)
 *
 * Generalized from: personas/bundles/ferni/realtime-noticing.ts
 *
 * @module personas/shared/realtime-noticing
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'shared-realtime-noticing' });
const DEFAULT_THRESHOLDS = {
    shortPauseMs: 1500,
    longPauseMs: 2500,
    veryLongPauseMs: 5000,
    energyDropArousal: 0.3,
    energyDropValence: 0,
    energyRiseArousal: 0.7,
    energyRiseValence: 0,
    speechSlowdownRatio: 0.7,
    speechSpeedupRatio: 1.3,
    subtleSlowdownRatio: 0.8,
    subtleSpeedupRatio: 1.2,
    minVoiceConfidence: 0.6,
    repeatedThemeCount: 3,
    minTurnsBetweenNoticing: 4,
    maxNoticingsPerSession: 3,
    sensitivityMultiplier: 1.0,
};
// Per-persona threshold overrides
const PERSONA_THRESHOLDS = {
    'maya-santos': {
        // Maya is warm and nurturing - notices pauses sooner
        shortPauseMs: 1200,
        longPauseMs: 2000,
        sensitivityMultiplier: 1.2,
    },
    'peter-john': {
        // Peter is analytical - needs more data before noticing
        shortPauseMs: 2000,
        longPauseMs: 3000,
        sensitivityMultiplier: 0.8,
    },
    'alex-chen': {
        // Alex is direct - notices efficiency changes
        speechSlowdownRatio: 0.75,
        speechSpeedupRatio: 1.25,
        sensitivityMultiplier: 0.9,
    },
    'jordan-taylor': {
        // Jordan is celebratory - notices energy shifts easily
        energyRiseArousal: 0.6,
        sensitivityMultiplier: 1.1,
    },
    'nayan-patel': {
        // Nayan is patient - allows more reflection time
        shortPauseMs: 2000,
        veryLongPauseMs: 7000,
        sensitivityMultiplier: 0.9,
    },
};
function getThresholds(personaId) {
    const overrides = PERSONA_THRESHOLDS[personaId] ?? {};
    return { ...DEFAULT_THRESHOLDS, ...overrides };
}
// ============================================================================
// PERSONA-AWARE ACKNOWLEDGMENTS
// ============================================================================
/**
 * Get persona-voiced acknowledgment for a noticing type
 */
function getPersonaAcknowledgment(personaId, type, defaultAck) {
    // Each persona has a slightly different voice for acknowledgments
    const personaAcks = {
        'maya-santos': {
            significant_pause: "You took a moment there. <break time='200ms'/>That's okay. Take the time you need.",
            energy_drop: "I noticed something shifted. <break time='200ms'/>I'm here with you.",
            mismatch: "You said you're okay, but... <break time='200ms'/>I hear something else. What's really going on?",
            breakthrough_moment: "Wait—<break time='150ms'/>something just clicked for you. <break time='200ms'/>Let's honor that.",
            protective_language: "I hear the words, but... <break time='200ms'/>what's underneath them?",
        },
        'peter-john': {
            significant_pause: "You paused there. <break time='200ms'/>The data says pauses often precede important thoughts.",
            energy_drop: "Something shifted in your voice. <break time='200ms'/>I noticed.",
            breakthrough_moment: "There it is—<break time='150ms'/>that realization. <break time='200ms'/>Those moments matter.",
            repeated_theme: "You've come back to this topic several times. <break time='200ms'/>There's something here worth exploring.",
        },
        'alex-chen': {
            significant_pause: "Take your time. <break time='200ms'/>Some thoughts need space.",
            mismatch: "I'm hearing two messages. <break time='200ms'/>Let's get clear on what you really want to say.",
            energy_drop: "Your energy shifted. <break time='200ms'/>What's going on?",
            protective_language: "You said it's fine, but <break time='150ms'/>—let's be direct. What's really happening?",
        },
        'jordan-taylor': {
            significant_pause: "You paused—<break time='200ms'/>sometimes the big stuff needs a runway.",
            breakthrough_moment: "YES! <break time='150ms'/>I just watched something click for you! <break time='200ms'/>Let's celebrate this.",
            energy_rise: "I can HEAR the energy shift! <break time='200ms'/>Something good just happened.",
            energy_drop: "Hey—<break time='200ms'/>something shifted. <break time='150ms'/>I'm here.",
        },
        'nayan-patel': {
            significant_pause: "That pause. <break time='300ms'/>Sometimes silence holds more than words.",
            mismatch: "The words say one thing. <break time='200ms'/>The voice says another. <break time='150ms'/>What's the truth beneath?",
            breakthrough_moment: "Something opened. <break time='200ms'/>I saw it. <break time='150ms'/>Be with it.",
            energy_drop: "Something is present now. <break time='200ms'/>Heavy, perhaps. <break time='150ms'/>Can you name it?",
            protective_language: "'It's fine.' <break time='200ms'/>The most common lie we tell. <break time='150ms'/>What's really there?",
        },
    };
    return personaAcks[personaId]?.[type] || defaultAck;
}
// ============================================================================
// NOTICING DETECTORS
// ============================================================================
/**
 * Detect if there's something worth noticing
 */
export function detectNoticing(input) {
    const detectors = [
        detectSignificantPause,
        detectEnergyShift,
        detectVoiceTextMismatch,
        detectTopicDeflection,
        detectSpeechRateChange,
        detectRepeatedTheme,
        detectUnfinishedThought,
        detectProtectiveLanguage,
        detectBreakthroughMoment,
    ];
    for (const detector of detectors) {
        const result = detector(input);
        if (result && result.shouldAcknowledge) {
            // Apply persona voice to the acknowledgment
            result.acknowledgment = getPersonaAcknowledgment(input.personaId, result.type, result.acknowledgment);
            result.personaId = input.personaId;
            log.debug({
                sessionId: input.sessionId,
                personaId: input.personaId,
                type: result.type,
                confidence: result.confidence,
            }, 'Noticing detected');
            return result;
        }
    }
    return null;
}
// ============================================================================
// INDIVIDUAL DETECTORS
// ============================================================================
function detectSignificantPause(input) {
    const thresholds = getThresholds(input.personaId);
    const pauseMs = input.pauseBeforeMs;
    // Three tiers of pause detection for nuanced response
    const isShortPause = pauseMs >= thresholds.shortPauseMs && pauseMs < thresholds.longPauseMs;
    const isLongPause = pauseMs >= thresholds.longPauseMs && pauseMs < thresholds.veryLongPauseMs;
    const isVeryLongPause = pauseMs >= thresholds.veryLongPauseMs;
    if (!isShortPause && !isLongPause && !isVeryLongPause) {
        return null;
    }
    // Tiered acknowledgments based on pause length
    let acknowledgment;
    let timing;
    let subtlety;
    let confidence;
    let observation;
    if (isVeryLongPause) {
        acknowledgment = "You took a moment there. <break time='250ms'/>Is everything okay?";
        timing = 'immediate';
        subtlety = 'gentle';
        confidence = Math.min(pauseMs / thresholds.veryLongPauseMs, 1);
        observation = 'User paused for a significant time before speaking';
    }
    else if (isLongPause) {
        acknowledgment = "I noticed you paused. <break time='200ms'/>Take your time.";
        timing = 'gentle_delay';
        subtlety = 'gentle';
        confidence =
            0.5 +
                ((pauseMs - thresholds.longPauseMs) / (thresholds.veryLongPauseMs - thresholds.longPauseMs)) *
                    0.3;
        observation = 'User took a moment before responding';
    }
    else {
        // Short pause - very subtle acknowledgment
        acknowledgment = "Hmm. <break time='150ms'/>";
        timing = 'wait_for_opening';
        subtlety = 'whisper';
        confidence =
            0.3 +
                ((pauseMs - thresholds.shortPauseMs) / (thresholds.longPauseMs - thresholds.shortPauseMs)) *
                    0.2;
        observation = 'User paused briefly before speaking';
    }
    // Apply sensitivity modifier
    confidence = Math.min(confidence * thresholds.sensitivityMultiplier, 1);
    return {
        type: 'significant_pause',
        observation,
        acknowledgment,
        shouldAcknowledge: true,
        confidence,
        timing,
        subtlety,
        personaId: input.personaId,
    };
}
function detectEnergyShift(input) {
    if (!input.voiceEmotion || !input.previousTurns || input.previousTurns.length < 2) {
        return null;
    }
    const thresholds = getThresholds(input.personaId);
    if (input.voiceEmotion.confidence < 0.5)
        return null;
    const currentArousal = input.voiceEmotion.arousal ?? 0.5;
    const currentValence = input.voiceEmotion.valence ?? 0;
    // Calculate previous turn's average energy for comparison
    const previousEmotions = input.previousTurns
        .slice(-3)
        .filter((t) => t.voiceEmotion)
        .map((t) => {
        // Map common emotion strings to approximate arousal values
        const emotionArousalMap = {
            happy: 0.7,
            excited: 0.9,
            anxious: 0.7,
            stressed: 0.6,
            sad: 0.2,
            calm: 0.3,
            neutral: 0.5,
            angry: 0.8,
            fearful: 0.6,
            content: 0.4,
        };
        return emotionArousalMap[t.voiceEmotion?.toLowerCase() ?? 'neutral'] ?? 0.5;
    });
    const avgPreviousArousal = previousEmotions.length > 0
        ? previousEmotions.reduce((a, b) => a + b, 0) / previousEmotions.length
        : 0.5;
    // Calculate shift magnitude
    const arousalShift = currentArousal - avgPreviousArousal;
    // Significant energy drop
    if (currentArousal < thresholds.energyDropArousal &&
        currentValence < thresholds.energyDropValence) {
        const shiftMagnitude = Math.abs(arousalShift);
        return {
            type: 'energy_drop',
            observation: 'Voice energy dropped noticeably',
            acknowledgment: "Something shifted just now. <break time='200ms'/>I heard it.",
            shouldAcknowledge: true,
            confidence: Math.min(0.5 + shiftMagnitude * thresholds.sensitivityMultiplier, 0.9),
            timing: 'gentle_delay',
            subtlety: 'gentle',
            personaId: input.personaId,
        };
    }
    // Gradual energy drop (more subtle)
    if (currentArousal < 0.4 && arousalShift < -0.15 && currentValence <= 0) {
        return {
            type: 'energy_drop',
            observation: 'Voice energy gradually decreased',
            acknowledgment: "Your energy shifted a bit there. <break time='150ms'/>",
            shouldAcknowledge: Math.random() < 0.4 * thresholds.sensitivityMultiplier,
            confidence: 0.45,
            timing: 'wait_for_opening',
            subtlety: 'whisper',
            personaId: input.personaId,
        };
    }
    // Significant energy rise
    if (currentArousal > thresholds.energyRiseArousal &&
        currentValence > thresholds.energyRiseValence) {
        return {
            type: 'energy_rise',
            observation: 'Voice energy lifted',
            acknowledgment: "Something lifted there. <break time='150ms'/>I can hear it.",
            shouldAcknowledge: true,
            confidence: Math.min(0.5 + Math.abs(arousalShift) * thresholds.sensitivityMultiplier, 0.8),
            timing: 'gentle_delay',
            subtlety: 'whisper',
            personaId: input.personaId,
        };
    }
    // Gradual energy rise (more subtle)
    if (currentArousal > 0.6 && arousalShift > 0.15 && currentValence >= 0) {
        return {
            type: 'energy_rise',
            observation: 'Voice energy gradually increased',
            acknowledgment: "I can hear something lifting. <break time='100ms'/>",
            shouldAcknowledge: Math.random() < 0.5 * thresholds.sensitivityMultiplier,
            confidence: 0.4,
            timing: 'wait_for_opening',
            subtlety: 'whisper',
            personaId: input.personaId,
        };
    }
    return null;
}
function detectVoiceTextMismatch(input) {
    if (!input.voiceEmotion || !input.textEmotion)
        return null;
    const thresholds = getThresholds(input.personaId);
    if (input.voiceEmotion.confidence < thresholds.minVoiceConfidence)
        return null;
    const voicePrimary = input.voiceEmotion.primary.toLowerCase();
    const textPrimary = input.textEmotion.primary.toLowerCase();
    const textIsPositive = ['happy', 'content', 'neutral', 'fine'].includes(textPrimary);
    const voiceIsNegative = ['sad', 'anxious', 'stressed', 'fearful', 'angry'].includes(voicePrimary);
    if (textIsPositive && voiceIsNegative) {
        return {
            type: 'mismatch',
            observation: `Text says ${textPrimary} but voice indicates ${voicePrimary}`,
            acknowledgment: "You said you're okay, but... <break time='200ms'/>your voice tells a different story. <break time='150ms'/>What's really going on?",
            shouldAcknowledge: true,
            confidence: input.voiceEmotion.confidence * thresholds.sensitivityMultiplier,
            timing: 'gentle_delay',
            subtlety: 'gentle',
            personaId: input.personaId,
        };
    }
    return null;
}
function detectTopicDeflection(input) {
    if (!input.previousTurns || input.previousTurns.length < 2)
        return null;
    if (!input.currentTopics || input.currentTopics.length === 0)
        return null;
    const lastTurn = input.previousTurns[input.previousTurns.length - 1];
    if (!lastTurn.topics || lastTurn.topics.length === 0)
        return null;
    const wasEmotionalTopic = lastTurn.voiceEmotion &&
        ['sad', 'anxious', 'stressed', 'angry', 'fearful'].includes(lastTurn.voiceEmotion);
    const topicChanged = !lastTurn.topics.some((t) => input.currentTopics.some((ct) => ct.toLowerCase().includes(t.toLowerCase())));
    if (wasEmotionalTopic && topicChanged) {
        return {
            type: 'topic_deflection',
            observation: 'Changed topic after emotional content',
            acknowledgment: "We can talk about this new thing, but... <break time='200ms'/>I noticed we moved away from what you were just saying. <break time='150ms'/>We can come back to it when you're ready.",
            shouldAcknowledge: Math.random() < 0.6,
            confidence: 0.6,
            timing: 'wait_for_opening',
            subtlety: 'gentle',
            personaId: input.personaId,
        };
    }
    return null;
}
function detectSpeechRateChange(input) {
    if (!input.speechRateWPM || !input.previousTurns)
        return null;
    const thresholds = getThresholds(input.personaId);
    const recentRates = input.previousTurns
        .slice(-3)
        .filter((t) => t.speechRate)
        .map((t) => t.speechRate);
    if (recentRates.length < 2)
        return null;
    const avgRate = recentRates.reduce((a, b) => a + b, 0) / recentRates.length;
    const currentRate = input.speechRateWPM;
    const rateRatio = currentRate / avgRate;
    // Significant slowdown (strong detection)
    if (rateRatio < thresholds.speechSlowdownRatio) {
        return {
            type: 'speech_rate_change',
            observation: 'Speaking noticeably slower',
            acknowledgment: "You're taking your time with this. <break time='150ms'/>That feels important.",
            shouldAcknowledge: true,
            confidence: 0.65 * thresholds.sensitivityMultiplier,
            timing: 'gentle_delay',
            subtlety: 'whisper',
            personaId: input.personaId,
        };
    }
    // Subtle slowdown
    if (rateRatio < thresholds.subtleSlowdownRatio && rateRatio >= thresholds.speechSlowdownRatio) {
        return {
            type: 'speech_rate_change',
            observation: 'Speaking slightly slower',
            acknowledgment: "Mm-hmm. <break time='100ms'/>",
            shouldAcknowledge: Math.random() < 0.3 * thresholds.sensitivityMultiplier,
            confidence: 0.35,
            timing: 'wait_for_opening',
            subtlety: 'whisper',
            personaId: input.personaId,
        };
    }
    // Significant speedup (strong detection)
    if (rateRatio > thresholds.speechSpeedupRatio) {
        return {
            type: 'speech_rate_change',
            observation: 'Speaking noticeably faster',
            acknowledgment: "I can hear the energy in your voice. <break time='150ms'/>Lot going on there.",
            shouldAcknowledge: true,
            confidence: 0.55 * thresholds.sensitivityMultiplier,
            timing: 'gentle_delay',
            subtlety: 'whisper',
            personaId: input.personaId,
        };
    }
    // Subtle speedup
    if (rateRatio > thresholds.subtleSpeedupRatio && rateRatio <= thresholds.speechSpeedupRatio) {
        return {
            type: 'speech_rate_change',
            observation: 'Speaking slightly faster',
            acknowledgment: "Mm. <break time='100ms'/>",
            shouldAcknowledge: Math.random() < 0.25 * thresholds.sensitivityMultiplier,
            confidence: 0.3,
            timing: 'wait_for_opening',
            subtlety: 'whisper',
            personaId: input.personaId,
        };
    }
    return null;
}
function detectRepeatedTheme(input) {
    if (!input.previousTurns || input.previousTurns.length < 4)
        return null;
    if (!input.currentTopics || input.currentTopics.length === 0)
        return null;
    const thresholds = getThresholds(input.personaId);
    const topicCounts = new Map();
    for (const turn of input.previousTurns) {
        for (const topic of turn.topics || []) {
            const key = topic.toLowerCase();
            topicCounts.set(key, (topicCounts.get(key) || 0) + 1);
        }
    }
    for (const topic of input.currentTopics) {
        const key = topic.toLowerCase();
        topicCounts.set(key, (topicCounts.get(key) || 0) + 1);
    }
    for (const [topic, count] of topicCounts) {
        if (count >= thresholds.repeatedThemeCount) {
            return {
                type: 'repeated_theme',
                observation: `Topic "${topic}" keeps coming up (${count} times)`,
                acknowledgment: `You keep coming back to ${topic}. <break time='200ms'/>There's something there, isn't there?`,
                shouldAcknowledge: true,
                confidence: Math.min((count / 5) * thresholds.sensitivityMultiplier, 0.9),
                timing: 'wait_for_opening',
                subtlety: 'gentle',
                personaId: input.personaId,
            };
        }
    }
    return null;
}
function detectUnfinishedThought(input) {
    const transcript = input.currentTranscript.trim();
    const unfinishedPatterns = [
        /\.\.\.\s*$/,
        /but\s*$/i,
        /and\s*$/i,
        /so\s*$/i,
        /I mean\s*$/i,
        /it's just\s*$/i,
        /I don't know\s*$/i,
    ];
    for (const pattern of unfinishedPatterns) {
        if (pattern.test(transcript)) {
            return {
                type: 'unfinished_thought',
                observation: 'Sentence trailed off',
                acknowledgment: "You trailed off there. <break time='200ms'/>What were you about to say?",
                shouldAcknowledge: true,
                confidence: 0.7,
                timing: 'immediate',
                subtlety: 'gentle',
                personaId: input.personaId,
            };
        }
    }
    return null;
}
function detectProtectiveLanguage(input) {
    const transcript = input.currentTranscript.toLowerCase();
    const protectivePatterns = [
        { pattern: /i('m| am) fine/i, response: "When you say you're fine..." },
        { pattern: /it('s| is) nothing/i, response: "You said it's nothing, but..." },
        { pattern: /doesn('t| not) matter/i, response: "You said it doesn't matter, but..." },
        { pattern: /i('m| am) (over it|past it)/i, response: 'Are you though?' },
        { pattern: /whatever/i, response: "That 'whatever'..." },
        { pattern: /i don('t| do not) care/i, response: "I hear you saying you don't care, but..." },
        { pattern: /it('s| is) not a big deal/i, response: 'Not a big deal, you said, but...' },
    ];
    for (const { pattern, response } of protectivePatterns) {
        if (pattern.test(transcript)) {
            if (input.voiceEmotion &&
                ['sad', 'anxious', 'stressed'].includes(input.voiceEmotion.primary.toLowerCase())) {
                return {
                    type: 'protective_language',
                    observation: 'Using protective language with emotional voice',
                    acknowledgment: `${response} <break time='200ms'/>your voice tells me something else.`,
                    shouldAcknowledge: true,
                    confidence: 0.75,
                    timing: 'gentle_delay',
                    subtlety: 'gentle',
                    personaId: input.personaId,
                };
            }
        }
    }
    return null;
}
function detectBreakthroughMoment(input) {
    if (!input.voiceEmotion)
        return null;
    const breakthroughIndicators = [
        /i (just )?realized/i,
        /wait,? (a minute)?/i,
        /oh!?/i,
        /that('s| is) it/i,
        /i (never|didn't) (think|see|realize)/i,
        /holy (crap|shit|cow)/i,
        /wow/i,
    ];
    const hasBreakthroughPhrase = breakthroughIndicators.some((p) => p.test(input.currentTranscript));
    const voiceIsPositive = input.voiceEmotion.valence && input.voiceEmotion.valence > 0.3;
    const hasEnergy = input.voiceEmotion.arousal && input.voiceEmotion.arousal > 0.5;
    if (hasBreakthroughPhrase && (voiceIsPositive || hasEnergy)) {
        return {
            type: 'breakthrough_moment',
            observation: 'Positive realization or breakthrough detected',
            acknowledgment: "I just watched something click for you. <break time='200ms'/>That's a big moment.",
            shouldAcknowledge: true,
            confidence: 0.8,
            timing: 'immediate',
            subtlety: 'direct',
            personaId: input.personaId,
        };
    }
    return null;
}
const sessionStates = new Map();
/**
 * Check if we should throttle noticing (don't over-notice)
 */
export function shouldThrottleNoticing(sessionId, turnCount, result, personaId) {
    const thresholds = getThresholds(personaId ?? result.personaId);
    let state = sessionStates.get(sessionId);
    if (!state) {
        state = {
            lastNoticingTurn: -100,
            noticingTypes: [],
            acknowledgedCount: 0,
        };
        sessionStates.set(sessionId, state);
    }
    // Don't notice more than once every N turns (per persona setting)
    if (turnCount - state.lastNoticingTurn < thresholds.minTurnsBetweenNoticing) {
        return true;
    }
    // Don't over-acknowledge (max N per session, per persona setting)
    // Breakthrough moments are always allowed
    if (state.acknowledgedCount >= thresholds.maxNoticingsPerSession &&
        result.type !== 'breakthrough_moment') {
        return true;
    }
    // Don't repeat same noticing type in same session
    if (state.noticingTypes.includes(result.type)) {
        return true;
    }
    return false;
}
/**
 * Record that we noticed something
 */
export function recordNoticing(sessionId, turnCount, type) {
    let state = sessionStates.get(sessionId);
    if (!state) {
        state = {
            lastNoticingTurn: turnCount,
            noticingTypes: [type],
            acknowledgedCount: 1,
        };
    }
    else {
        state.lastNoticingTurn = turnCount;
        state.noticingTypes.push(type);
        state.acknowledgedCount++;
    }
    sessionStates.set(sessionId, state);
}
/**
 * Clear session noticing state
 */
export function clearNoticingState(sessionId) {
    sessionStates.delete(sessionId);
}
// ============================================================================
// EXPORTS
// ============================================================================
export const sharedRealtimeNoticing = {
    detect: detectNoticing,
    shouldThrottle: shouldThrottleNoticing,
    record: recordNoticing,
    clear: clearNoticingState,
};
export default sharedRealtimeNoticing;
//# sourceMappingURL=realtime-noticing.js.map