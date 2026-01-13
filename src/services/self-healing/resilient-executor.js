/**
 * Resilient Executor
 *
 * Automatic retry with exponential backoff for transient failures.
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'resilient-executor' });
// Default retryable error patterns
const RETRYABLE_PATTERNS = [
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /ENOTFOUND/i,
    /socket hang up/i,
    /network/i,
    /timeout/i,
    /temporarily unavailable/i,
    /rate limit/i,
    /429/,
    /503/,
    /502/,
];
function isRetryableError(error) {
    const errorStr = `${error.name} ${error.message}`;
    return RETRYABLE_PATTERNS.some((pattern) => pattern.test(errorStr));
}
async function sleep(ms) {
    await new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
function calculateDelay(attempt, baseDelay, maxDelay, jitter) {
    // Exponential backoff: baseDelay * 2^attempt
    let delay = baseDelay * Math.pow(2, attempt);
    // Apply jitter
    if (jitter > 0) {
        const jitterAmount = delay * jitter * (Math.random() * 2 - 1);
        delay += jitterAmount;
    }
    // Cap at maxDelay
    return Math.min(delay, maxDelay);
}
/** Handle retry failure (extracted to reduce complexity) */
function handleRetryFailure(err, attempt, opName) {
    log.warn({ attempt, operationName: opName, error: err.message, willRetry: false }, 'Operation failed, no more retries');
    throw err;
}
/** Log and prepare retry (extracted to reduce complexity) */
function prepareRetry(ctx) {
    const { err, attempt, opName, opts, onRetry } = ctx;
    const delay = calculateDelay(attempt, opts.baseDelay, opts.maxDelay, opts.jitter);
    log.debug({ attempt, operationName: opName, error: err.message, nextDelayMs: delay }, `Retrying in ${delay}ms`);
    onRetry?.(attempt + 1, err, delay);
    return delay;
}
export async function withResilience(operation, options = {}) {
    const { maxRetries = 3, baseDelay = 1000, maxDelay = 30000, jitter = 0.1, shouldRetry = isRetryableError, onRetry, operationName = 'operation', } = options;
    const opts = { baseDelay, maxDelay, jitter };
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 0)
                log.debug({ attempt, operationName }, `Retry attempt ${attempt}`);
            const result = await operation(); // eslint-disable-line no-await-in-loop
            if (attempt > 0)
                log.info({ attempt, operationName }, `Succeeded after ${attempt} retries`);
            return result;
        }
        catch (error) {
            lastError = error;
            const canRetry = attempt < maxRetries && shouldRetry(lastError, attempt);
            if (!canRetry)
                handleRetryFailure(lastError, attempt, operationName);
            const delay = prepareRetry({ err: lastError, attempt, opName: operationName, opts, onRetry });
            await sleep(delay); // eslint-disable-line no-await-in-loop
        }
    }
    throw lastError ?? new Error(`${operationName} failed after ${maxRetries} retries`);
}
/**
 * Create a resilient version of an async function
 */
export function makeResilient(fn, options = {}) {
    async function resilientFn(...args) {
        return withResilience(async () => fn(...args), options);
    }
    return resilientFn;
}
//# sourceMappingURL=resilient-executor.js.map