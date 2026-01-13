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
type LogData = Record<string, unknown>;
declare class DiagnosticLogger {
    private _logger;
    /**
     * Lazy getter for logger - only initializes when needed
     */
    private get logger();
    /**
     * Internal log method
     */
    private log;
    /** Entry point logging (agent startup, job received) */
    entry(message: string, data?: LogData): void;
    /** Prewarm phase logging */
    prewarm(message: string, data?: LogData): void;
    /** Speech-to-text logging */
    stt(message: string, data?: LogData): void;
    /** Text-to-speech logging */
    tts(message: string, data?: LogData): void;
    /** Tool execution logging */
    tool(message: string, data?: LogData): void;
    /** Agent state changes */
    state(message: string, data?: LogData): void;
    /** User-related events */
    user(message: string, data?: LogData): void;
    /** Memory/context operations */
    memory(message: string, data?: LogData): void;
    /** Error logging */
    error(message: string, data?: LogData): void;
    /** Performance metrics */
    perf(message: string, data?: LogData): void;
    /** Health checks */
    health(message: string, data?: LogData): void;
    /** Voice handoff between Jack/Peter */
    handoff(message: string, data?: LogData): void;
    /** Session lifecycle */
    session(message: string, data?: LogData): void;
    /** Processing phase tracking (turn processing, LLM waiting, etc.) */
    processing(message: string, data?: LogData): void;
    /** Verbal filler spoken (thinking fillers, backchannels, etc.) */
    filler(message: string, data?: LogData): void;
    /** Thinking music and ambient music events */
    music(message: string, data?: LogData): void;
    /** Log a section divider (dev only) */
    section(title: string): void;
    /** Log with custom level */
    custom(level: 'debug' | 'info' | 'warn' | 'error', category: string, message: string, data?: LogData): void;
    /** Debug level (most verbose) */
    debug(message: string, data?: LogData): void;
    /** Info level */
    info(message: string, data?: LogData): void;
    /** Warning level */
    warn(message: string, data?: LogData): void;
    /** Timing helper - returns a function to call when done */
    time(category: string, operation: string): () => void;
}
export declare const diag: DiagnosticLogger;
export { DiagnosticLogger };
export default diag;
//# sourceMappingURL=diagnostic-logger.d.ts.map