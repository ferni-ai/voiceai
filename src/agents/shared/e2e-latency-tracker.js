/**
 * E2E Latency Tracker
 *
 * Tracks the complete timeline from user speech to agent response.
 * Helps diagnose whether latency issues are from:
 * - OpenAI/LLM (TTFB - time to first token)
 * - TTS (Cartesia)
 * - Our code (processing time)
 *
 * Timeline tracked:
 * 1. userSpeechEnded - When user stops speaking
 * 2. processingStarted - When we start processing the transcript
 * 3. llmRequestSent - When we call generateReply
 * 4. llmFirstToken - When we receive first LLM output (TTFB)
 * 5. llmComplete - When LLM finishes
 * 6. ttsFirstAudio - When TTS starts sending audio
 * 7. audioStarted - When audio actually starts playing
 *
 * @module agents/shared/e2e-latency-tracker
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'E2ELatency' });
// ============================================================================
// STORAGE
// ============================================================================
// Active timelines by turnId
const activeTimelines = new Map();
// Completed timelines (keep last 100 for analysis)
const completedTimelines = [];
const MAX_COMPLETED = 100;
// Session to current turnId mapping
const sessionTurnMap = new Map();
// ============================================================================
// THRESHOLDS (ms)
// ============================================================================
const THRESHOLDS = {
    OPENAI_TTFB_SLOW: 2000, // OpenAI taking > 2s to first token is slow
    OPENAI_TTFB_CRITICAL: 5000, // > 5s is critical
    TTS_SLOW: 500, // TTS > 500ms is slow
    PROCESSING_SLOW: 500, // Our processing > 500ms is slow
    E2E_SLOW: 3000, // Total E2E > 3s is slow
    E2E_CRITICAL: 6000, // > 6s is critical
};
// ============================================================================
// PUBLIC API
// ============================================================================
/**
 * Start tracking a new turn.
 * Call this when user speech ends or transcript is received.
 */
export function startTurn(sessionId, userTranscript) {
    const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timeline = {
        turnId,
        sessionId,
        userTranscript: userTranscript?.slice(0, 100),
        userSpeechEnded: Date.now(),
    };
    activeTimelines.set(turnId, timeline);
    sessionTurnMap.set(sessionId, turnId);
    log.debug({ turnId, sessionId, transcript: userTranscript?.slice(0, 50) }, '📊 Turn started');
    return turnId;
}
/**
 * Mark when we start processing the transcript.
 */
export function markProcessingStarted(sessionIdOrTurnId) {
    const timeline = getTimeline(sessionIdOrTurnId);
    if (!timeline)
        return;
    timeline.processingStarted = Date.now();
    if (timeline.userSpeechEnded) {
        timeline.processingLatency = timeline.processingStarted - timeline.userSpeechEnded;
    }
}
/**
 * Mark when we send the LLM request.
 */
export function markLLMRequestSent(sessionIdOrTurnId, context) {
    const timeline = getTimeline(sessionIdOrTurnId);
    if (!timeline)
        return;
    timeline.llmRequestSent = Date.now();
    timeline.context = context;
    log.debug({
        turnId: timeline.turnId,
        context,
        timeSinceUserSpeech: timeline.userSpeechEnded
            ? Date.now() - timeline.userSpeechEnded
            : undefined,
    }, '📊 LLM request sent');
}
/**
 * Mark when we receive the first token from LLM.
 * This is the critical TTFB (Time To First Byte) metric.
 */
export function markLLMFirstToken(sessionIdOrTurnId) {
    const timeline = getTimeline(sessionIdOrTurnId);
    if (!timeline)
        return;
    timeline.llmFirstToken = Date.now();
    if (timeline.llmRequestSent) {
        timeline.llmTTFB = timeline.llmFirstToken - timeline.llmRequestSent;
        timeline.isOpenAISlow = timeline.llmTTFB > THRESHOLDS.OPENAI_TTFB_SLOW;
        // Log prominently if OpenAI is slow
        if (timeline.llmTTFB > THRESHOLDS.OPENAI_TTFB_CRITICAL) {
            log.warn({ turnId: timeline.turnId, llmTTFB: timeline.llmTTFB, context: timeline.context }, '🐌 CRITICAL: OpenAI TTFB > 5s - OpenAI is very slow!');
        }
        else if (timeline.isOpenAISlow) {
            log.warn({ turnId: timeline.turnId, llmTTFB: timeline.llmTTFB, context: timeline.context }, '⚠️ OpenAI TTFB > 2s - OpenAI is slow');
        }
        else {
            log.debug({ turnId: timeline.turnId, llmTTFB: timeline.llmTTFB }, '📊 LLM first token received');
        }
    }
}
/**
 * Mark when LLM completes.
 */
export function markLLMComplete(sessionIdOrTurnId) {
    const timeline = getTimeline(sessionIdOrTurnId);
    if (!timeline)
        return;
    timeline.llmComplete = Date.now();
    if (timeline.llmRequestSent) {
        timeline.llmTotal = timeline.llmComplete - timeline.llmRequestSent;
    }
}
/**
 * Mark when TTS starts sending audio.
 */
export function markTTSFirstAudio(sessionIdOrTurnId) {
    const timeline = getTimeline(sessionIdOrTurnId);
    if (!timeline)
        return;
    timeline.ttsFirstAudio = Date.now();
    if (timeline.llmComplete) {
        timeline.ttsLatency = timeline.ttsFirstAudio - timeline.llmComplete;
        timeline.isTTSSlow = timeline.ttsLatency > THRESHOLDS.TTS_SLOW;
        if (timeline.isTTSSlow) {
            log.warn({ turnId: timeline.turnId, ttsLatency: timeline.ttsLatency }, '⚠️ TTS latency > 500ms - Cartesia is slow');
        }
    }
}
/**
 * Mark when audio actually starts playing.
 * This completes the E2E timeline.
 */
export function markAudioStarted(sessionIdOrTurnId) {
    const timeline = getTimeline(sessionIdOrTurnId);
    if (!timeline)
        return;
    timeline.audioStarted = Date.now();
    if (timeline.userSpeechEnded) {
        timeline.e2eTotal = timeline.audioStarted - timeline.userSpeechEnded;
    }
    // Calculate processing time (our code) vs external services
    timeline.isProcessingSlow =
        timeline.processingLatency !== undefined &&
            timeline.processingLatency > THRESHOLDS.PROCESSING_SLOW;
    // Complete and log the timeline
    completeTurn(timeline);
}
/**
 * Force complete a turn (for timeout or error cases).
 */
export function completeTurnWithError(sessionIdOrTurnId, error) {
    const timeline = getTimeline(sessionIdOrTurnId);
    if (!timeline)
        return;
    timeline.context = `${timeline.context || ''} [ERROR: ${error}]`;
    completeTurn(timeline);
}
// ============================================================================
// ANALYSIS
// ============================================================================
/**
 * Get recent latency stats for dashboard.
 */
export function getLatencyStats() {
    const recent = completedTimelines.slice(-20);
    if (recent.length === 0) {
        return {
            avgE2E: 0,
            avgLLMTTFB: 0,
            avgTTS: 0,
            avgProcessing: 0,
            slowOpenAIPercent: 0,
            slowTTSPercent: 0,
            recentTimelines: [],
        };
    }
    const e2es = recent.filter((t) => t.e2eTotal).map((t) => t.e2eTotal);
    const ttfbs = recent.filter((t) => t.llmTTFB).map((t) => t.llmTTFB);
    const ttss = recent.filter((t) => t.ttsLatency).map((t) => t.ttsLatency);
    const procs = recent.filter((t) => t.processingLatency).map((t) => t.processingLatency);
    const avg = (arr) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const slowOpenAI = recent.filter((t) => t.isOpenAISlow).length;
    const slowTTS = recent.filter((t) => t.isTTSSlow).length;
    return {
        avgE2E: Math.round(avg(e2es)),
        avgLLMTTFB: Math.round(avg(ttfbs)),
        avgTTS: Math.round(avg(ttss)),
        avgProcessing: Math.round(avg(procs)),
        slowOpenAIPercent: Math.round((slowOpenAI / recent.length) * 100),
        slowTTSPercent: Math.round((slowTTS / recent.length) * 100),
        recentTimelines: recent.slice(-5),
    };
}
/**
 * Get the current turn's timeline for a session.
 */
export function getCurrentTimeline(sessionId) {
    const turnId = sessionTurnMap.get(sessionId);
    if (!turnId)
        return null;
    return activeTimelines.get(turnId) || null;
}
// ============================================================================
// INTERNAL
// ============================================================================
function getTimeline(sessionIdOrTurnId) {
    // Try direct turnId lookup first
    if (activeTimelines.has(sessionIdOrTurnId)) {
        return activeTimelines.get(sessionIdOrTurnId);
    }
    // Try session lookup
    const turnId = sessionTurnMap.get(sessionIdOrTurnId);
    if (turnId && activeTimelines.has(turnId)) {
        return activeTimelines.get(turnId);
    }
    return null;
}
function completeTurn(timeline) {
    // Remove from active
    activeTimelines.delete(timeline.turnId);
    // Add to completed
    completedTimelines.push(timeline);
    if (completedTimelines.length > MAX_COMPLETED) {
        completedTimelines.shift();
    }
    // Determine what's causing slowness
    const bottleneck = determineBottleneck(timeline);
    // Log comprehensive summary
    const summary = {
        turnId: timeline.turnId,
        transcript: timeline.userTranscript?.slice(0, 30),
        e2eTotal: timeline.e2eTotal,
        llmTTFB: timeline.llmTTFB,
        llmTotal: timeline.llmTotal,
        ttsLatency: timeline.ttsLatency,
        processingLatency: timeline.processingLatency,
        bottleneck,
        isOpenAISlow: timeline.isOpenAISlow,
        isTTSSlow: timeline.isTTSSlow,
        isProcessingSlow: timeline.isProcessingSlow,
    };
    if (timeline.e2eTotal && timeline.e2eTotal > THRESHOLDS.E2E_CRITICAL) {
        log.error(summary, '🚨 CRITICAL E2E LATENCY > 6s');
    }
    else if (timeline.e2eTotal && timeline.e2eTotal > THRESHOLDS.E2E_SLOW) {
        log.warn(summary, '⚠️ Slow E2E latency > 3s');
    }
    else {
        log.info(summary, '📊 Turn complete');
    }
}
function determineBottleneck(timeline) {
    if (timeline.isOpenAISlow)
        return 'openai';
    if (timeline.isTTSSlow)
        return 'tts';
    if (timeline.isProcessingSlow)
        return 'processing';
    return 'unknown';
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    startTurn,
    markProcessingStarted,
    markLLMRequestSent,
    markLLMFirstToken,
    markLLMComplete,
    markTTSFirstAudio,
    markAudioStarted,
    completeTurnWithError,
    getLatencyStats,
    getCurrentTimeline,
};
//# sourceMappingURL=e2e-latency-tracker.js.map