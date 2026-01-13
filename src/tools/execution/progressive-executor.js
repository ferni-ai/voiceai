/**
 * Progressive Tool Executor
 *
 * Executes tools with progressive feedback to the user.
 * "Better than human" means: never leave the user wondering what's happening.
 *
 * Philosophy:
 * - Fast responses (< 1.5s): No feedback needed, feels instant
 * - Normal responses (1.5-4s): Brief acknowledgment "Let me check..."
 * - Slow responses (4-8s): Update "Still working on that..."
 * - Timeout (> 8s): Return cached/partial data with apology
 */
import { getLogger } from '../../utils/safe-logger.js';
import { toolCache } from './tool-cache.js';
import { circuitBreaker } from './circuit-breaker.js';
import { getToolTimeoutConfig, } from './types.js';
const log = getLogger();
// ============================================================================
// TIMEOUT SYMBOL
// ============================================================================
const TIMEOUT_SYMBOL = Symbol('TIMEOUT');
// ============================================================================
// ACKNOWLEDGMENT PHRASES
// ============================================================================
/**
 * Natural acknowledgment phrases - varies to avoid robotic repetition
 *
 * HUMANIZATION FIX: Removed "Let me see/check/find" patterns - too voice-assistant-y.
 * Keep simple confirmations that don't sound like Alexa/Siri.
 */
const ACKNOWLEDGMENTS = {
    news: ['Checking the news...', 'One moment...', 'On it...'],
    weather: ['Checking the weather...', 'One sec...'],
    stocks: ['Checking the markets...', 'One moment...'],
    search: ['Searching...', 'Looking...', 'On it...'],
    calendar: ['Checking your calendar...', 'One moment...'],
    default: ['One moment...', 'One sec...', 'Checking...'],
};
/**
 * Update phrases when taking longer than expected
 */
const UPDATES = {
    news: ['Still gathering the headlines...', 'Almost there...'],
    weather: ['Still checking...'],
    stocks: ['Still pulling the data...'],
    search: ['Still searching...', 'This is taking a moment...'],
    default: ['Still working on that...', 'Almost there...', 'Just a bit longer...'],
};
/**
 * Apology phrases when we have to give up or use fallback
 */
const APOLOGIES = {
    news: ["Here's what I found recently...", "The news feed is slow, but here's what I have..."],
    weather: ["Weather service is slow, here's what I know..."],
    stocks: ["Market data is delayed, here's the last quote..."],
    default: ["That's taking longer than usual...", "I'm having trouble getting that..."],
};
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Get a random phrase from a category
 */
function getPhrase(phrases, category) {
    const categoryPhrases = phrases[category] || phrases.default;
    return categoryPhrases[Math.floor(Math.random() * categoryPhrases.length)];
}
/**
 * Create a timeout promise
 */
function timeout(ms) {
    return new Promise((resolve) => {
        setTimeout(() => resolve(TIMEOUT_SYMBOL), ms);
    });
}
// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================
export const DEFAULT_PROGRESSIVE_CONFIG = {
    silentWindow: 1500,
    acknowledgmentAt: 2000,
    updateAt: 5000,
    hardTimeout: 8000,
    fallbackStrategy: 'cache',
    cacheMaxAge: 30 * 60 * 1000, // 30 minutes
};
// ============================================================================
// PROGRESSIVE EXECUTOR
// ============================================================================
/**
 * Execute a tool with progressive feedback
 *
 * @param toolName - Name of the tool being executed
 * @param executor - The actual execution function
 * @param sendFeedback - Callback to send feedback to user
 * @param config - Optional configuration overrides
 */
export async function executeWithProgressiveFeedback(toolName, executor, sendFeedback, config) {
    const startTime = Date.now();
    // Merge tool-specific config with defaults
    const toolConfig = getToolTimeoutConfig(toolName);
    const fullConfig = {
        ...DEFAULT_PROGRESSIVE_CONFIG,
        hardTimeout: toolConfig.hardTimeout,
        acknowledgmentAt: toolConfig.acknowledgmentAt,
        updateAt: toolConfig.updateAt,
        ...config,
    };
    const category = toolConfig.cacheCategory || 'default';
    // Check circuit breaker first
    if (circuitBreaker.shouldSkip(toolName)) {
        log.info({ toolName }, 'Circuit open, using cache fallback');
        // Try to return cached data
        const cached = toolCache.get(toolName, 'default-query');
        if (cached) {
            return {
                success: true,
                data: cached.data,
                latency: Date.now() - startTime,
                usedFallback: true,
                source: 'cache',
                freshness: cached.freshness,
            };
        }
        // No cache, return failure
        return {
            success: false,
            error: 'Service temporarily unavailable',
            latency: Date.now() - startTime,
            usedFallback: true,
            source: 'fallback',
        };
    }
    // Track feedback state
    let acknowledged = false;
    let updated = false;
    // Set up progressive feedback timers
    const timers = [];
    if (sendFeedback) {
        // Acknowledgment timer
        timers.push(setTimeout(() => {
            if (!acknowledged) {
                const phrase = getPhrase(ACKNOWLEDGMENTS, category);
                sendFeedback(phrase, 'acknowledgment');
                acknowledged = true;
                log.debug({ toolName, elapsed: Date.now() - startTime }, 'Sent acknowledgment');
            }
        }, fullConfig.acknowledgmentAt));
        // Update timer
        timers.push(setTimeout(() => {
            if (!updated) {
                const phrase = getPhrase(UPDATES, category);
                sendFeedback(phrase, 'update');
                updated = true;
                log.debug({ toolName, elapsed: Date.now() - startTime }, 'Sent update');
            }
        }, fullConfig.updateAt));
    }
    // Cleanup function
    const cleanup = () => {
        timers.forEach((t) => clearTimeout(t));
    };
    try {
        // Race between execution and hard timeout
        const result = await Promise.race([executor(), timeout(fullConfig.hardTimeout)]);
        cleanup();
        const latency = Date.now() - startTime;
        if (result === TIMEOUT_SYMBOL) {
            // Hard timeout reached
            log.warn({ toolName, latency, hardTimeout: fullConfig.hardTimeout }, 'Tool execution timed out');
            // Record as slow for circuit breaker
            circuitBreaker.recordLatency(toolName, latency);
            circuitBreaker.recordFailure(toolName);
            // Try fallback strategies
            return await handleTimeout(toolName, category, fullConfig, sendFeedback, startTime);
        }
        // Success! Record metrics
        circuitBreaker.recordLatency(toolName, latency);
        circuitBreaker.recordSuccess(toolName);
        // Cache the result
        if (toolConfig.cacheCategory) {
            toolCache.set(toolName, 'default-query', result, toolConfig.cacheCategory);
        }
        log.debug({ toolName, latency, acknowledged, updated }, 'Tool execution completed');
        return {
            success: true,
            data: result,
            latency,
            usedFallback: false,
            source: 'live',
        };
    }
    catch (error) {
        cleanup();
        const latency = Date.now() - startTime;
        const errorStr = String(error);
        const isTimeout = errorStr.includes('timeout') || errorStr.includes('AbortError');
        log.warn({ toolName, error: errorStr, latency, isTimeout }, 'Tool execution failed');
        // Record failure for circuit breaker
        circuitBreaker.recordFailure(toolName);
        // Try fallback
        return await handleTimeout(toolName, category, fullConfig, sendFeedback, startTime, errorStr);
    }
}
/**
 * Handle timeout/error by trying fallback strategies
 */
async function handleTimeout(toolName, category, config, sendFeedback, startTime = Date.now(), error) {
    const latency = Date.now() - startTime;
    // Strategy 1: Try cache
    if (config.fallbackStrategy === 'cache' || config.fallbackStrategy === 'partial') {
        const cached = toolCache.getWithStaleness(toolName, 'default-query', config.cacheMaxAge);
        if (cached && cached.freshness !== 'expired') {
            // Send apology if we're serving stale data
            if (sendFeedback && cached.freshness === 'stale') {
                const phrase = getPhrase(APOLOGIES, category);
                sendFeedback(phrase, 'apology');
            }
            log.info({ toolName, freshness: cached.freshness, cacheAge: Date.now() - cached.timestamp }, 'Serving cached data as fallback');
            return {
                success: true,
                data: cached.data,
                latency,
                usedFallback: true,
                source: 'cache',
                freshness: cached.freshness,
            };
        }
    }
    // Strategy 2: Apologize and return error
    if (sendFeedback) {
        const phrase = getPhrase(APOLOGIES, category);
        sendFeedback(phrase, 'apology');
    }
    return {
        success: false,
        error: error || 'Operation timed out',
        latency,
        usedFallback: true,
        source: 'fallback',
    };
}
// ============================================================================
// CONVENIENCE WRAPPER
// ============================================================================
/**
 * Create a progressive version of any async function
 *
 * @example
 * const progressiveGetNews = makeProgressive('getNews', getNews);
 * const result = await progressiveGetNews(topic, sendFeedback);
 */
export function makeProgressive(toolName, fn, config) {
    return async (sendFeedback, ...args) => {
        return executeWithProgressiveFeedback(toolName, () => fn(...args), sendFeedback, config);
    };
}
// ============================================================================
// EXPORTS
// ============================================================================
export { ACKNOWLEDGMENTS, UPDATES, APOLOGIES };
//# sourceMappingURL=progressive-executor.js.map