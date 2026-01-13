/**
 * Speech Coordinator
 *
 * Intelligent, centralized control for ALL speech output to prevent overlap.
 * Uses adaptive timing based on actual speech patterns, not hardcoded values.
 *
 * DESIGN PRINCIPLES:
 * 1. Single source of truth for "who can speak right now"
 * 2. Priority-based queue (crisis > tool result > response > backchannel)
 * 3. Adaptive timing based on actual playout durations
 * 4. Learned patterns for echo prevention and pacing
 *
 * @module speech/coordination/speech-coordinator
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'speech-coordinator' });
// ============================================================================
// TYPES
// ============================================================================
/** Speech priority levels (higher = more urgent) */
export var SpeechPriority;
(function (SpeechPriority) {
    SpeechPriority[SpeechPriority["BACKCHANNEL"] = 10] = "BACKCHANNEL";
    SpeechPriority[SpeechPriority["ACKNOWLEDGMENT"] = 20] = "ACKNOWLEDGMENT";
    SpeechPriority[SpeechPriority["RESPONSE"] = 30] = "RESPONSE";
    SpeechPriority[SpeechPriority["TOOL_RESULT"] = 40] = "TOOL_RESULT";
    SpeechPriority[SpeechPriority["CLARIFICATION"] = 50] = "CLARIFICATION";
    SpeechPriority[SpeechPriority["INTERRUPT_RECOVERY"] = 60] = "INTERRUPT_RECOVERY";
    SpeechPriority[SpeechPriority["CRISIS"] = 100] = "CRISIS";
})(SpeechPriority || (SpeechPriority = {}));
/** Coordinator state */
export var CoordinatorState;
(function (CoordinatorState) {
    CoordinatorState["IDLE"] = "idle";
    CoordinatorState["SPEAKING"] = "speaking";
    CoordinatorState["AWAITING_PLAYOUT"] = "awaiting_playout";
    CoordinatorState["COOLDOWN"] = "cooldown";
})(CoordinatorState || (CoordinatorState = {}));
// ============================================================================
// ADAPTIVE TIMING CALCULATOR
// ============================================================================
/**
 * Calculates adaptive timing parameters based on observed patterns.
 * No hardcoded values - learns from actual speech patterns.
 *
 * CRITICAL FIX (2026-01-10): Added content-aware echo detection to prevent
 * blocking legitimate user requests. The old algorithm only used timing,
 * which caused "Could you check the news?" to be blocked as potential echo.
 */
class AdaptiveTimingCalculator {
    speechDurations = [];
    echoDelays = [];
    pacingGaps = [];
    lastSpeechEndTime = 0;
    // Track recent agent speech for echo comparison
    recentAgentSpeech = [];
    MAX_RECENT_SPEECH = 5;
    // Defaults based on typical voice patterns (will be overridden by learning)
    INITIAL_COOLDOWN = 300; // Will adapt
    INITIAL_PACING = 150; // Will adapt
    MAX_SAMPLES = 50; // Rolling window
    /**
     * Record a speech event for learning
     */
    recordSpeech(durationMs, spokenText) {
        this.speechDurations.push(durationMs);
        if (this.speechDurations.length > this.MAX_SAMPLES) {
            this.speechDurations.shift();
        }
        // Track recent agent speech for echo comparison
        if (spokenText) {
            this.recentAgentSpeech.push(spokenText.toLowerCase().trim());
            if (this.recentAgentSpeech.length > this.MAX_RECENT_SPEECH) {
                this.recentAgentSpeech.shift();
            }
        }
        // Record gap from last speech for pacing
        if (this.lastSpeechEndTime > 0) {
            const gap = Date.now() - this.lastSpeechEndTime - durationMs;
            if (gap > 0 && gap < 5000) {
                // Reasonable gap range
                this.pacingGaps.push(gap);
                if (this.pacingGaps.length > this.MAX_SAMPLES) {
                    this.pacingGaps.shift();
                }
            }
        }
        this.lastSpeechEndTime = Date.now();
    }
    /**
     * Record when we detected echo (agent audio picked up as user speech)
     */
    recordEchoDetection(delayAfterSpeechMs) {
        this.echoDelays.push(delayAfterSpeechMs);
        if (this.echoDelays.length > this.MAX_SAMPLES) {
            this.echoDelays.shift();
        }
        log.debug({ delayMs: delayAfterSpeechMs }, 'Echo detection recorded for learning');
    }
    /**
     * Get adaptive timing parameters
     */
    getTiming() {
        const avgSpeechDuration = this.average(this.speechDurations) || 2000;
        const avgEchoDelay = this.average(this.echoDelays) || 500;
        const avgPacingGap = this.average(this.pacingGaps) || this.INITIAL_PACING;
        // Cooldown = max of echo delay + buffer, or proportional to speech length
        // Intelligent: longer speech = more reverb = longer cooldown
        const proportionalCooldown = avgSpeechDuration * 0.15; // 15% of speech length
        const echoCooldown = avgEchoDelay * 1.5; // 50% buffer over observed echo
        const cooldown = Math.max(proportionalCooldown, echoCooldown, this.INITIAL_COOLDOWN);
        return {
            avgSpeechDurationMs: avgSpeechDuration,
            avgEchoDelayMs: avgEchoDelay,
            postSpeechCooldownMs: Math.min(cooldown, 2000), // Cap at 2s
            naturalPacingGapMs: Math.min(avgPacingGap, 500), // Cap at 500ms
            sampleCount: this.speechDurations.length,
        };
    }
    /**
     * Calculate echo prevention window for a specific utterance.
     *
     * CRITICAL FIX: Now content-aware! Long, complete sentences that don't
     * match recent agent speech are trusted as legitimate user input.
     *
     * @param utteranceDurationMs - Duration of the last agent utterance
     * @param userTranscript - Optional: the user's transcript to check if it's echo
     * @returns Echo prevention window in milliseconds
     */
    getEchoWindowForUtterance(utteranceDurationMs, userTranscript) {
        // CRITICAL FIX: Content-aware echo detection
        // If we have the transcript, check if it looks like a legitimate new request
        if (userTranscript) {
            const isLikelyLegitimate = this.isLikelyLegitimateRequest(userTranscript);
            if (isLikelyLegitimate) {
                log.debug({ transcript: userTranscript.slice(0, 30), reason: 'content-aware bypass' }, '✅ Echo prevention bypassed - legitimate user request detected');
                return 300; // Minimal window - trust this is a real utterance
            }
        }
        const timing = this.getTiming();
        // Base: learned echo delay with buffer
        const baseWindow = timing.avgEchoDelayMs * 1.5;
        // Proportional: longer utterances need longer windows (more reverb)
        // REDUCED from 0.2 to 0.15 to be less aggressive
        const proportional = utteranceDurationMs * 0.15;
        // Combined, with reasonable bounds
        // REDUCED max from 3000ms to 2000ms - 3s was too long
        return Math.max(300, // Minimum 300ms
        Math.min(baseWindow + proportional, 2000) // Maximum 2s (was 3s)
        );
    }
    /**
     * Check if a transcript is likely a legitimate user request (not echo).
     *
     * Legitimate requests typically:
     * 1. Are longer than typical echo fragments (>15 chars)
     * 2. Don't match recent agent speech
     * 3. Are complete sentences/questions (especially those ending with ?)
     * 4. Contain unique content not in recent agent speech
     * 5. Start with question words or interjections
     */
    isLikelyLegitimateRequest(transcript) {
        const normalized = transcript.toLowerCase().trim();
        // Questions are almost always legitimate user input
        // Users don't just echo back questions - they answer them
        if (normalized.endsWith('?')) {
            // Even short questions like "what?" or "really?" are legitimate
            if (normalized.length >= 5) {
                log.debug({ transcript: normalized.slice(0, 30) }, '✅ Question detected - likely legitimate request');
                return true;
            }
        }
        // Interjections and reactions are typically user-initiated
        const REACTION_PATTERNS = [
            /^(wait|hold on|actually|no|yes|yeah|what|huh|really|okay|oh|hmm|um)/i,
            /^(are you|do you|can you|could you|would you|will you|is it|is that)/i,
            /^(tell me|show me|help me|let me|give me)/i,
        ];
        for (const pattern of REACTION_PATTERNS) {
            if (pattern.test(normalized)) {
                log.debug({ transcript: normalized.slice(0, 30), pattern: pattern.toString() }, '✅ Reaction/question pattern detected - likely legitimate request');
                return true;
            }
        }
        // Short transcripts without question marks or known patterns - use timing-based
        // Reduced from 25 to 15 chars to be less aggressive
        if (normalized.length < 15) {
            return false;
        }
        // Check if it matches or is contained in recent agent speech
        for (const agentSpeech of this.recentAgentSpeech) {
            // Exact match = definitely echo
            if (agentSpeech.includes(normalized) || normalized.includes(agentSpeech)) {
                log.debug({ transcript: normalized.slice(0, 30) }, '🔊 Matches recent agent speech - likely echo');
                return false;
            }
            // High word overlap = likely echo (raised threshold from 0.6 to 0.7)
            const overlap = this.calculateWordOverlap(normalized, agentSpeech);
            if (overlap > 0.7) {
                log.debug({ transcript: normalized.slice(0, 30), overlap: overlap.toFixed(2) }, '🔊 High word overlap with agent speech - likely echo');
                return false;
            }
        }
        // Looks like a new, distinct request
        return true;
    }
    /**
     * Calculate word overlap between two strings (0-1).
     */
    calculateWordOverlap(a, b) {
        const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 2));
        const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 2));
        if (wordsA.size === 0 || wordsB.size === 0)
            return 0;
        let overlap = 0;
        for (const word of wordsA) {
            if (wordsB.has(word))
                overlap++;
        }
        return overlap / Math.min(wordsA.size, wordsB.size);
    }
    average(arr) {
        if (arr.length === 0)
            return 0;
        return arr.reduce((sum, v) => sum + v, 0) / arr.length;
    }
}
// ============================================================================
// SPEECH COORDINATOR
// ============================================================================
/**
 * Centralized speech coordinator.
 * All speech output MUST go through this to prevent overlaps.
 */
export class SpeechCoordinator {
    state = CoordinatorState.IDLE;
    queue = [];
    currentRequest = null;
    session = null;
    timing;
    stats;
    stateChangeTime = 0;
    queueWaitTimes = [];
    requestIdCounter = 0;
    constructor() {
        this.timing = new AdaptiveTimingCalculator();
        this.stats = {
            totalRequests: 0,
            requestsSpoken: 0,
            requestsDropped: 0,
            requestsExpired: 0,
            overlapsPrevented: 0,
            avgQueueWaitMs: 0,
            avgSpeechDurationMs: 0,
        };
    }
    /**
     * Attach a session to the coordinator.
     *
     * HANDOFF FIX: If coordinator is stuck in SPEAKING state from a previous session,
     * reset to IDLE and process queue. This happens during handoffs when the old
     * session is replaced before its onSpeechEnded callback fires.
     */
    attachSession(session) {
        const wasInSpeakingState = this.state === CoordinatorState.SPEAKING;
        const hadPendingRequests = this.queue.length > 0;
        this.session = session;
        // HANDOFF FIX: If we're replacing a session that was speaking,
        // the onSpeechEnded callback from the old session won't fire.
        // Reset state to IDLE so queued requests can be processed.
        if (wasInSpeakingState) {
            log.warn({ previousState: this.state, queueLength: this.queue.length }, '⚠️ Attaching session while in SPEAKING state - resetting to IDLE (old session speech orphaned)');
            this.currentRequest = null;
            this.transitionTo(CoordinatorState.IDLE);
        }
        log.info({ queueLength: this.queue.length, wasInSpeakingState }, 'Session attached to speech coordinator');
        // Process any pending queue items after a brief delay
        // (allows the new session to fully initialize)
        if (hadPendingRequests || wasInSpeakingState) {
            setTimeout(() => {
                if (this.state === CoordinatorState.IDLE && this.queue.length > 0) {
                    log.info({ queueLength: this.queue.length }, '🔄 Processing pending speech queue after session attach');
                    this.processQueue();
                }
            }, 100);
        }
    }
    /**
     * Detach session (on cleanup)
     */
    detachSession() {
        this.session = null;
        this.queue = [];
        this.currentRequest = null;
        this.state = CoordinatorState.IDLE;
        log.info('Session detached from speech coordinator');
    }
    /**
     * Request to speak. Returns immediately - speech is async.
     */
    async requestSpeak(request) {
        const id = `speech-${++this.requestIdCounter}-${Date.now()}`;
        const fullRequest = {
            ...request,
            id,
            queuedAt: Date.now(),
            maxAge: request.maxAge ?? this.getDefaultMaxAge(request.priority),
        };
        this.stats.totalRequests++;
        // Validate
        if (!this.session) {
            log.warn({ id }, 'No session attached - dropping speech request');
            this.stats.requestsDropped++;
            return { accepted: false, id, reason: 'No session attached' };
        }
        if (!fullRequest.text.trim()) {
            log.debug({ id }, 'Empty text - dropping speech request');
            this.stats.requestsDropped++;
            return { accepted: false, id, reason: 'Empty text' };
        }
        // Check if we should skip lower-priority items
        if (this.shouldDrop(fullRequest)) {
            log.debug({ id, priority: fullRequest.priority, state: this.state }, 'Dropping low-priority request');
            this.stats.requestsDropped++;
            return { accepted: false, id, reason: 'Dropped due to priority/state' };
        }
        // Add to priority queue
        this.enqueue(fullRequest);
        // Process queue
        this.processQueue();
        return { accepted: true, id };
    }
    /**
     * Convenience: Speak a tool result
     */
    async speakToolResult(text, toolId) {
        return this.requestSpeak({
            text,
            priority: SpeechPriority.TOOL_RESULT,
            source: 'tool',
            allowInterruptions: true,
        });
    }
    /**
     * Convenience: Speak an acknowledgment (for slow operations)
     */
    async speakAcknowledgment(text) {
        return this.requestSpeak({
            text,
            priority: SpeechPriority.ACKNOWLEDGMENT,
            source: 'acknowledgment',
            allowInterruptions: true,
            maxAge: 3000, // Acknowledgments expire fast
        });
    }
    /**
     * Convenience: Speak a backchannel
     */
    async speakBackchannel(text) {
        return this.requestSpeak({
            text,
            priority: SpeechPriority.BACKCHANNEL,
            source: 'backchannel',
            allowInterruptions: true,
            maxAge: 1500, // Backchannels expire very fast
        });
    }
    /**
     * Check if we're currently speaking or in cooldown
     */
    isBusy() {
        return this.state !== CoordinatorState.IDLE;
    }
    /**
     * Get current state
     */
    getState() {
        return this.state;
    }
    /**
     * Get adaptive timing parameters
     */
    getAdaptiveTiming() {
        return this.timing.getTiming();
    }
    /**
     * Get echo prevention window for current context.
     *
     * CRITICAL FIX: Now content-aware! Pass userTranscript to enable
     * intelligent detection of legitimate requests vs echoes.
     *
     * @param lastUtteranceDurationMs - Duration of last agent utterance
     * @param userTranscript - The user's transcript (for content-aware detection)
     */
    getEchoWindow(lastUtteranceDurationMs, userTranscript) {
        return this.timing.getEchoWindowForUtterance(lastUtteranceDurationMs ?? this.timing.getTiming().avgSpeechDurationMs, userTranscript);
    }
    /**
     * Record that we detected echo (for learning)
     */
    recordEchoDetection(delayAfterSpeechMs) {
        this.timing.recordEchoDetection(delayAfterSpeechMs);
        log.debug({ delayMs: delayAfterSpeechMs }, 'Echo detected - adjusting timing');
    }
    /**
     * Get statistics
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * Notify that speech ended (call from session state handler)
     *
     * @param wasInterrupted - Whether the speech was interrupted
     * @param durationMs - Duration of the speech in milliseconds
     * @param spokenText - Optional: the text that was spoken (for echo comparison)
     */
    onSpeechEnded(wasInterrupted, durationMs, spokenText) {
        this.timing.recordSpeech(durationMs, spokenText);
        if (this.currentRequest?.onEnd) {
            this.currentRequest.onEnd(wasInterrupted);
        }
        this.currentRequest = null;
        this.transitionTo(CoordinatorState.COOLDOWN);
        // Cooldown then process next
        const cooldown = this.timing.getTiming().postSpeechCooldownMs;
        setTimeout(() => {
            if (this.state === CoordinatorState.COOLDOWN) {
                this.transitionTo(CoordinatorState.IDLE);
                this.processQueue();
            }
        }, cooldown);
    }
    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================
    shouldDrop(request) {
        // Never drop crisis
        if (request.priority >= SpeechPriority.CRISIS) {
            return false;
        }
        // Drop backchannels if we're speaking or in cooldown
        if (request.priority === SpeechPriority.BACKCHANNEL) {
            if (this.state !== CoordinatorState.IDLE) {
                this.stats.overlapsPrevented++;
                return true;
            }
        }
        // Drop acknowledgments if queue already has higher-priority items
        if (request.priority === SpeechPriority.ACKNOWLEDGMENT) {
            const hasHigherPriority = this.queue.some((q) => q.priority > request.priority);
            if (hasHigherPriority) {
                return true;
            }
        }
        return false;
    }
    enqueue(request) {
        // Insert in priority order (higher priority first)
        const insertIndex = this.queue.findIndex((q) => q.priority < request.priority);
        if (insertIndex === -1) {
            this.queue.push(request);
        }
        else {
            this.queue.splice(insertIndex, 0, request);
        }
        log.debug({ id: request.id, priority: request.priority, queueLength: this.queue.length }, 'Request enqueued');
    }
    processQueue() {
        // Can't process if busy or no session
        if (this.state !== CoordinatorState.IDLE || !this.session) {
            return;
        }
        // Remove expired requests
        this.expireOldRequests();
        // Get next request
        const next = this.queue.shift();
        if (!next) {
            return;
        }
        // Track wait time
        const waitTime = Date.now() - next.queuedAt;
        this.queueWaitTimes.push(waitTime);
        if (this.queueWaitTimes.length > 50) {
            this.queueWaitTimes.shift();
        }
        this.stats.avgQueueWaitMs =
            this.queueWaitTimes.reduce((a, b) => a + b, 0) / this.queueWaitTimes.length;
        // Speak!
        this.speak(next);
    }
    speak(request) {
        if (!this.session) {
            log.warn({ id: request.id }, 'No session - cannot speak');
            return;
        }
        this.currentRequest = request;
        this.transitionTo(CoordinatorState.SPEAKING);
        this.stats.requestsSpoken++;
        log.info({ id: request.id, source: request.source, priority: request.priority }, 'Speaking via coordinator');
        request.onStart?.();
        try {
            this.session.say(request.text, {
                allowInterruptions: request.allowInterruptions ?? true,
            });
            // Note: onSpeechEnded() will be called by session state handler
        }
        catch (error) {
            const errorStr = String(error);
            // Expected error when session disconnects - use debug level
            if (errorStr.includes('AgentSession is not running')) {
                log.debug({ error: errorStr, id: request.id }, 'Speech skipped - session closed');
            }
            else {
                log.error({ error: errorStr, id: request.id }, 'Speech failed');
            }
            this.currentRequest = null;
            this.transitionTo(CoordinatorState.IDLE);
            this.processQueue();
        }
    }
    expireOldRequests() {
        const now = Date.now();
        const expired = this.queue.filter((r) => r.maxAge && now - r.queuedAt > r.maxAge);
        for (const r of expired) {
            log.debug({ id: r.id, age: now - r.queuedAt, maxAge: r.maxAge }, 'Request expired');
            this.stats.requestsExpired++;
        }
        this.queue = this.queue.filter((r) => !r.maxAge || now - r.queuedAt <= r.maxAge);
    }
    transitionTo(newState) {
        const oldState = this.state;
        this.state = newState;
        this.stateChangeTime = Date.now();
        log.debug({ oldState, newState }, 'Coordinator state transition');
    }
    getDefaultMaxAge(priority) {
        // Intelligent defaults based on priority
        switch (priority) {
            case SpeechPriority.BACKCHANNEL:
                return 1500; // Backchannels are time-sensitive
            case SpeechPriority.ACKNOWLEDGMENT:
                return 4000; // Acknowledgments have medium shelf life
            case SpeechPriority.RESPONSE:
                return 10000; // Responses can wait longer
            case SpeechPriority.TOOL_RESULT:
                return 15000; // Tool results should be delivered
            case SpeechPriority.CRISIS:
                return 60000; // Crisis MUST be delivered
            default:
                return 8000;
        }
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let coordinatorInstance = null;
export function getSpeechCoordinator() {
    if (!coordinatorInstance) {
        coordinatorInstance = new SpeechCoordinator();
    }
    return coordinatorInstance;
}
/**
 * Reset coordinator (for testing)
 */
export function resetSpeechCoordinator() {
    if (coordinatorInstance) {
        coordinatorInstance.detachSession();
    }
    coordinatorInstance = null;
}
//# sourceMappingURL=speech-coordinator.js.map