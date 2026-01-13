/**
 * Diagnostic Logger
 *
 * Drop-in replacement for console.log that provides:
 * - Structured logging in production
 * - Visual emoji output in development
 * - Toggleable via environment variables
 * - Categories for filtering
 *
 * Usage:
 *   import { diag } from '../services/diagnostic-logger.js';
 *   diag.entry('Session starting', { sessionId });
 *   diag.stt('Audio received', { frames: 100 });
 *   diag.tool('Tool executed', { name: 'getWeather', elapsed: 150 });
 */
import { getLogger } from '../utils/safe-logger.js';
// ============================================================================
// CONFIGURATION
// ============================================================================
import { isDebugEnabled } from '../config/feature-flags.js';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
// Use centralized feature flag system for debug toggle
const DEBUG_AGENT = isDebugEnabled('agent');
const LOG_LEVEL = process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug');
// Log levels (lower = more verbose)
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    silent: 4,
};
const currentLevel = LOG_LEVELS[LOG_LEVEL] ?? 1;
// Category emojis for visual scanning in dev
const CATEGORY_EMOJIS = {
    entry: '🚀',
    prewarm: '♨️',
    stt: '🎤',
    tts: '🔊',
    tool: '🔧',
    state: '📊',
    user: '👤',
    memory: '🧠',
    error: '❌',
    perf: '⏱️',
    health: '💓',
    handoff: '🤝',
    session: '📡',
    processing: '⏳', // Processing phase tracking
    filler: '🗣️', // Verbal fillers spoken
    music: '🎵', // Thinking music / ambient
    default: '📋',
};
class DiagnosticLogger {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _logger = null;
    /**
     * Lazy getter for logger - only initializes when needed
     */
    get logger() {
        if (!this._logger) {
            try {
                this._logger = getLogger();
            }
            catch {
                // Logger not initialized yet - use console fallback
                return null;
            }
        }
        return this._logger;
    }
    /**
     * Internal log method
     */
    log(level, category, message, data) {
        // Check if we should log at this level
        const levelNum = LOG_LEVELS[level] ?? 1;
        if (levelNum < currentLevel)
            return;
        const emoji = CATEGORY_EMOJIS[category] || CATEGORY_EMOJIS.default;
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        if (IS_PRODUCTION && !DEBUG_AGENT) {
            // Production: Use structured logger only (if available)
            const logData = { category, ...data };
            const lgr = this.logger;
            if (lgr) {
                switch (level) {
                    case 'debug':
                        lgr.debug(logData, message);
                        break;
                    case 'info':
                        lgr.info(logData, message);
                        break;
                    case 'warn':
                        lgr.warn(logData, message);
                        break;
                    case 'error':
                        lgr.error(logData, message);
                        break;
                }
            }
        }
        else {
            // Development: Console with emojis + structured logger
            const prefix = `${emoji} [${timestamp}] [${category.toUpperCase()}]`;
            if (data && Object.keys(data).length > 0) {
                console.log(`${prefix} ${message}`, data);
            }
            else {
                console.log(`${prefix} ${message}`);
            }
            // Also log to structured logger for consistency (if available)
            const logData = { category, ...data };
            const lgr = this.logger;
            if (lgr) {
                lgr[level](logData, message);
            }
        }
    }
    // ============================================================================
    // CATEGORY-SPECIFIC METHODS
    // ============================================================================
    /** Entry point logging (agent startup, job received) */
    entry(message, data) {
        this.log('info', 'entry', message, data);
    }
    /** Prewarm phase logging */
    prewarm(message, data) {
        this.log('info', 'prewarm', message, data);
    }
    /** Speech-to-text logging */
    stt(message, data) {
        this.log('debug', 'stt', message, data);
    }
    /** Text-to-speech logging */
    tts(message, data) {
        this.log('debug', 'tts', message, data);
    }
    /** Tool execution logging */
    tool(message, data) {
        this.log('info', 'tool', message, data);
    }
    /** Agent state changes */
    state(message, data) {
        this.log('debug', 'state', message, data);
    }
    /** User-related events */
    user(message, data) {
        this.log('info', 'user', message, data);
    }
    /** Memory/context operations */
    memory(message, data) {
        this.log('debug', 'memory', message, data);
    }
    /** Error logging */
    error(message, data) {
        this.log('error', 'error', message, data);
    }
    /** Performance metrics */
    perf(message, data) {
        this.log('info', 'perf', message, data);
    }
    /** Health checks */
    health(message, data) {
        this.log('debug', 'health', message, data);
    }
    /** Voice handoff between Jack/Peter */
    handoff(message, data) {
        this.log('info', 'handoff', message, data);
    }
    /** Session lifecycle */
    session(message, data) {
        this.log('info', 'session', message, data);
    }
    /** Processing phase tracking (turn processing, LLM waiting, etc.) */
    processing(message, data) {
        this.log('debug', 'processing', message, data);
    }
    /** Verbal filler spoken (thinking fillers, backchannels, etc.) */
    filler(message, data) {
        this.log('info', 'filler', message, data);
    }
    /** Thinking music and ambient music events */
    music(message, data) {
        this.log('debug', 'music', message, data);
    }
    // ============================================================================
    // UTILITY METHODS
    // ============================================================================
    /** Log a section divider (dev only) */
    section(title) {
        if (!IS_PRODUCTION || DEBUG_AGENT) {
            console.log('========================================');
            console.log(`=== ${title} ===`);
            console.log('========================================');
        }
        const lgr = this.logger;
        if (lgr) {
            lgr.info({ section: title }, `=== ${title} ===`);
        }
    }
    /** Log with custom level */
    custom(level, category, message, data) {
        this.log(level, category, message, data);
    }
    /** Debug level (most verbose) */
    debug(message, data) {
        this.log('debug', 'default', message, data);
    }
    /** Info level */
    info(message, data) {
        this.log('info', 'default', message, data);
    }
    /** Warning level */
    warn(message, data) {
        this.log('warn', 'default', message, data);
    }
    /** Timing helper - returns a function to call when done */
    time(category, operation) {
        const start = Date.now();
        return () => {
            const elapsed = Date.now() - start;
            this.perf(`${operation} completed`, { category, elapsed, operation });
        };
    }
}
// Singleton instance
export const diag = new DiagnosticLogger();
// Also export class for testing
export { DiagnosticLogger };
export default diag;
//# sourceMappingURL=diagnostic-logger.js.map