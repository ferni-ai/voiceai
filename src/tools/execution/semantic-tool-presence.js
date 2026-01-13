/**
 * Semantic Tool Presence System
 *
 * "Better than Human" tool feedback that adapts to user emotional state.
 *
 * Philosophy:
 * - When humans help each other, they show presence and care during waits
 * - Robotic feedback ("Checking...") feels transactional
 * - Semantic feedback matches emotional context and relationship depth
 *
 * This module provides:
 * 1. Emotion-aware verbal feedback during tool execution
 * 2. "Still here" presence signals for long operations
 * 3. Tool timing context for natural LLM framing
 *
 * @module semantic-tool-presence
 */
import { getLogger } from '../../utils/safe-logger.js';
import { EventEmitter } from 'events';
const log = getLogger();
// ============================================================================
// SEMANTIC PRESENCE PATTERNS
// ============================================================================
/**
 * Emotion-aware presence patterns.
 * Each pattern provides natural language that matches the emotional context.
 *
 * These are NOT robotic phrases - they're natural presence signals.
 */
const PRESENCE_PATTERNS = {
    anxious: {
        initial: ['Take a breath...', 'I got this...', 'Give me just a sec...'],
        stillHere: ["I'm here...", 'Still on it...', 'Almost...'],
        completion: ['Okay...', 'Here we go...', 'Got it...'],
    },
    stressed: {
        initial: ['One second...', 'Let me grab that...', "I'll get that..."],
        stillHere: ['Still here...', 'Working on it...', 'Hang tight...'],
        completion: ['Okay...', 'There...', 'Got it...'],
    },
    excited: {
        initial: ['Ooh, let me see!', 'Oh!', 'Yes!'],
        stillHere: ['Oh!', 'This is good...', 'Okay okay...'],
        completion: ['Here!', 'Check this out...', 'Oh!'],
    },
    curious: {
        initial: ['Hmm...', 'Let me see...', 'Interesting...'],
        stillHere: ['Hmm...', 'Okay...', '...'],
        completion: ['Ah...', 'So...', 'Interesting...'],
    },
    sad: {
        initial: ['...', 'Give me a moment...', 'Let me...'],
        stillHere: ["I'm here...", '...', 'Just a moment...'],
        completion: ['...', 'Okay...', 'Here...'],
    },
    tired: {
        initial: ['...', 'One sec...', "I'll grab that..."],
        stillHere: ['...', 'Still here...', '...'],
        completion: ['Here...', '...', 'Okay...'],
    },
    calm: {
        initial: ['...', 'Let me see...', 'One moment...'],
        stillHere: ['...', '...', 'Still here...'],
        completion: ['Okay...', '...', 'Here...'],
    },
    neutral: {
        initial: ['...', 'Let me see...', 'One sec...'],
        stillHere: ['...', '...', '...'],
        completion: ['Okay...', 'Here...', '...'],
    },
};
/**
 * Time-of-day modifiers for more natural presence.
 */
const TIME_MODIFIERS = {
    morning: { speedAdjust: 0.95, pauseMultiplier: 1.0 },
    afternoon: { speedAdjust: 1.0, pauseMultiplier: 1.0 },
    evening: { speedAdjust: 0.92, pauseMultiplier: 1.1 },
    'late-night': { speedAdjust: 0.88, pauseMultiplier: 1.3 },
};
/**
 * Tool category to semantic meaning mapping.
 * Helps us understand what the tool is doing conceptually.
 */
const TOOL_SEMANTICS = {
    calendar: { action: 'looking at', domain: 'schedule' },
    gcal: { action: 'checking', domain: 'calendar' },
    search: { action: 'searching', domain: 'information' },
    weather: { action: 'checking', domain: 'weather' },
    news: { action: 'looking at', domain: 'news' },
    stocks: { action: 'checking', domain: 'markets' },
    memory: { action: 'remembering', domain: 'our conversations' },
    recall: { action: 'thinking back', domain: 'what we talked about' },
    music: { action: 'finding', domain: 'music' },
    habits: { action: 'checking', domain: 'habits' },
    goals: { action: 'looking at', domain: 'goals' },
};
// ============================================================================
// PRESENCE SELECTION ENGINE
// ============================================================================
/**
 * Select appropriate presence feedback based on context.
 * This is the core "Better than Human" logic.
 */
export function selectPresenceFeedback(phase, context, elapsedMs) {
    const emotion = context.userEmotion || 'neutral';
    const patterns = PRESENCE_PATTERNS[emotion];
    const pool = patterns[phase];
    // Fast responses (< 1s) need no feedback
    if (phase === 'initial' && elapsedMs < 800) {
        return {
            text: '',
            timing: 'immediate',
            shouldSpeak: false,
            reason: 'Response is fast, no feedback needed',
        };
    }
    // Select a random pattern from the emotion-appropriate pool
    const text = pool[Math.floor(Math.random() * pool.length)];
    // Apply time-of-day modifiers
    const timeModifiers = TIME_MODIFIERS[context.isTimeOfDay || 'afternoon'];
    // Determine Cartesia emotion tag based on context
    const cartesiaEmotion = mapEmotionToCartesia(emotion, phase);
    // For anxious/stressed users, we speak more gently
    const shouldSlowDown = emotion === 'anxious' || emotion === 'stressed' || emotion === 'sad';
    return {
        text,
        timing: phase === 'initial' ? 'delayed' : 'progressive',
        emotion: cartesiaEmotion,
        speedRatio: shouldSlowDown ? 0.9 * timeModifiers.speedAdjust : timeModifiers.speedAdjust,
        shouldSpeak: text !== '...' || elapsedMs > 3000, // Silence is fine unless very long
        reason: `${emotion} emotion, ${phase} phase, ${elapsedMs}ms elapsed`,
    };
}
/**
 * Map emotional context to Cartesia emotion tags.
 */
function mapEmotionToCartesia(emotion, phase) {
    const mapping = {
        anxious: 'caring',
        stressed: 'calm',
        excited: 'excited',
        curious: 'curious',
        sad: 'sympathetic',
        tired: 'calm',
        calm: 'default',
        neutral: 'default',
    };
    // Override for completion phase - be warmer
    if (phase === 'completion' && (emotion === 'anxious' || emotion === 'sad')) {
        return 'supportive';
    }
    return mapping[emotion] || 'default';
}
// ============================================================================
// TOOL TIMING CONTEXT GENERATOR
// ============================================================================
/**
 * Generate context for the LLM about tool execution timing.
 * This helps the LLM frame its response naturally.
 */
export function generateToolTimingContext(toolName, durationMs, userWasPatient = true) {
    const wasLong = durationMs > 2000;
    const wasVeryLong = durationMs > 5000;
    // Get semantic meaning of the tool
    const normalizedTool = toolName.toLowerCase();
    let semantics = TOOL_SEMANTICS['search']; // Default
    for (const [key, value] of Object.entries(TOOL_SEMANTICS)) {
        if (normalizedTool.includes(key)) {
            semantics = value;
            break;
        }
    }
    // Generate framing hint for the LLM
    let framingHint = '';
    if (wasVeryLong) {
        framingHint = userWasPatient
            ? 'The user waited patiently. Acknowledge the result naturally without over-apologizing.'
            : "That took a while. Don't apologize excessively, just share what you found.";
    }
    else if (wasLong) {
        framingHint = 'Brief acknowledgment is fine, then share the result naturally.';
    }
    else {
        framingHint = 'Quick response. Just share the result naturally.';
    }
    return {
        toolName,
        durationMs,
        wasLong,
        wasVeryLong,
        userWasPatient,
        framingHint,
    };
}
// ============================================================================
// TOOL PRESENCE EVENT EMITTER
// ============================================================================
/**
 * Event emitter for tool execution lifecycle.
 * Enables real-time status updates to voice layer.
 */
export const toolPresenceEvents = new EventEmitter();
/**
 * Emit a tool presence event.
 * Voice layer listens to these for real-time feedback.
 */
export function emitToolPresence(event) {
    toolPresenceEvents.emit('presence', event);
    log.debug({
        type: event.type,
        tool: event.context.toolName,
        elapsed: event.elapsedMs,
        shouldSpeak: event.feedback?.shouldSpeak,
    }, 'Tool presence event emitted');
}
const activeExecutions = new Map();
/**
 * Start tracking a tool execution for semantic presence.
 */
export function startToolPresence(context, onProgress) {
    const key = `${context.sessionId}:${context.toolName}`;
    // Clear any existing execution for this tool
    stopToolPresence(context.sessionId, context.toolName);
    const execution = {
        context,
        progressCount: 0,
    };
    // Set up progressive feedback timer
    if (onProgress) {
        execution.progressTimer = setInterval(() => {
            execution.progressCount++;
            const elapsedMs = Date.now() - context.startTime;
            // First progress at 2s, then every 3s
            if (elapsedMs >= 2000) {
                const feedback = selectPresenceFeedback('stillHere', context, elapsedMs);
                if (feedback.shouldSpeak) {
                    onProgress(feedback);
                }
                // Emit event for other listeners
                emitToolPresence({
                    type: 'progress',
                    context,
                    elapsedMs,
                    feedback,
                });
            }
        }, 2500); // Check every 2.5s
    }
    activeExecutions.set(key, execution);
    // Emit start event
    emitToolPresence({
        type: 'start',
        context,
        elapsedMs: 0,
    });
    log.debug({ tool: context.toolName, session: context.sessionId }, 'Started tool presence tracking');
}
/**
 * Stop tracking a tool execution.
 */
export function stopToolPresence(sessionId, toolName) {
    const key = `${sessionId}:${toolName}`;
    const execution = activeExecutions.get(key);
    if (!execution) {
        return null;
    }
    // Clear progress timer
    if (execution.progressTimer) {
        clearInterval(execution.progressTimer);
    }
    const durationMs = Date.now() - execution.context.startTime;
    // Generate timing context for LLM
    const timingContext = generateToolTimingContext(toolName, durationMs);
    // Emit completion event
    emitToolPresence({
        type: 'complete',
        context: execution.context,
        elapsedMs: durationMs,
        feedback: selectPresenceFeedback('completion', execution.context, durationMs),
    });
    activeExecutions.delete(key);
    log.debug({ tool: toolName, session: sessionId, durationMs }, 'Stopped tool presence tracking');
    return timingContext;
}
/**
 * Clean up all tool presence for a session.
 */
export function cleanupSessionToolPresence(sessionId) {
    for (const [key, execution] of activeExecutions.entries()) {
        if (key.startsWith(`${sessionId}:`)) {
            if (execution.progressTimer) {
                clearInterval(execution.progressTimer);
            }
            activeExecutions.delete(key);
        }
    }
}
// ============================================================================
// CONTEXT INJECTION FOR LLM
// ============================================================================
/**
 * Generate LLM context injection about recent tool executions.
 * This helps the LLM frame its response naturally.
 */
export function generateToolContextInjection(timingContexts) {
    if (timingContexts.length === 0) {
        return '';
    }
    const parts = ['## Tool Execution Context'];
    for (const ctx of timingContexts) {
        if (ctx.wasLong || ctx.wasVeryLong) {
            parts.push(`- ${ctx.toolName}: ${ctx.framingHint}`);
        }
    }
    if (parts.length === 1) {
        return ''; // No significant timing to report
    }
    return parts.join('\n');
}
// ============================================================================
// EXPORTS
// ============================================================================
export { PRESENCE_PATTERNS, TIME_MODIFIERS, TOOL_SEMANTICS };
//# sourceMappingURL=semantic-tool-presence.js.map