/**
 * WebSocket Keep-Alive Manager
 *
 * Reduces reconnection overhead by maintaining persistent connections
 * with intelligent ping/pong and reconnection strategies.
 *
 * Key Features:
 * - Automatic ping/pong heartbeat
 * - Connection health monitoring
 * - Exponential backoff reconnection
 * - Graceful degradation
 *
 * @module WebSocketKeepAlive
 */
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'WebSocketKeepAlive' });
// ============================================================================
// KEEP-ALIVE MANAGER
// ============================================================================
/**
 * Manages WebSocket connection health with keep-alive pings
 *
 * @example
 * ```ts
 * const keepAlive = new WebSocketKeepAlive({
 *   onDisconnected: (reason) => log.warn(`Disconnected: ${reason}`),
 *   onReconnecting: (attempt) => log.info(`Reconnecting, attempt ${attempt}`),
 * });
 *
 * // Start monitoring
 * keepAlive.start(() => sendPing());
 *
 * // Call when pong received
 * keepAlive.receivedPong();
 *
 * // Stop when done
 * keepAlive.stop();
 * ```
 */
export class WebSocketKeepAlive {
    config;
    events;
    pingInterval = null;
    pongTimeout = null;
    reconnectTimeout = null;
    pingFn = null;
    reconnectFn = null;
    // State tracking
    connected = false;
    lastPingAt = null;
    lastPongAt = null;
    reconnectAttempts = 0;
    totalReconnections = 0;
    connectedAt = null;
    latencies = [];
    MAX_LATENCY_SAMPLES = 100;
    constructor(events = {}, config = {}) {
        this.events = events;
        this.config = {
            pingIntervalMs: config.pingIntervalMs ?? 30000,
            pongTimeoutMs: config.pongTimeoutMs ?? 5000,
            maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
            initialReconnectDelayMs: config.initialReconnectDelayMs ?? 1000,
            maxReconnectDelayMs: config.maxReconnectDelayMs ?? 60000,
            autoReconnect: config.autoReconnect ?? true,
        };
    }
    /**
     * Start the keep-alive mechanism
     *
     * @param pingFn - Function to send a ping (e.g., WebSocket ping)
     * @param reconnectFn - Function to attempt reconnection (returns true if successful)
     */
    start(pingFn, reconnectFn) {
        this.pingFn = pingFn;
        this.reconnectFn = reconnectFn ?? null;
        this.connected = true;
        this.connectedAt = Date.now();
        this.reconnectAttempts = 0;
        // Start ping interval
        this.startPingInterval();
        this.events.onConnected?.();
        log.debug({ pingIntervalMs: this.config.pingIntervalMs }, '🔗 Keep-alive started');
    }
    /**
     * Stop the keep-alive mechanism
     */
    stop() {
        this.clearAllTimers();
        this.connected = false;
        this.pingFn = null;
        this.reconnectFn = null;
        log.debug('🔗 Keep-alive stopped');
    }
    /**
     * Call when pong is received from the server
     */
    receivedPong() {
        const now = Date.now();
        // Clear pong timeout
        if (this.pongTimeout) {
            clearTimeout(this.pongTimeout);
            this.pongTimeout = null;
        }
        // Calculate latency
        if (this.lastPingAt) {
            const latencyMs = now - this.lastPingAt;
            this.recordLatency(latencyMs);
            this.events.onPong?.(latencyMs);
        }
        this.lastPongAt = now;
    }
    /**
     * Call when connection is lost unexpectedly
     */
    connectionLost(reason = 'unknown') {
        this.connected = false;
        this.clearAllTimers();
        this.events.onDisconnected?.(reason);
        log.warn({ reason }, '🔗 Connection lost');
        // Attempt reconnection if enabled
        if (this.config.autoReconnect && this.reconnectFn) {
            void this.attemptReconnect();
        }
    }
    /**
     * Call when connection is restored (after reconnect)
     */
    connectionRestored() {
        this.connected = true;
        this.connectedAt = Date.now();
        this.totalReconnections++;
        this.reconnectAttempts = 0;
        // Restart ping interval
        this.startPingInterval();
        this.events.onConnected?.();
        log.info({ totalReconnections: this.totalReconnections }, '🔗 Connection restored');
    }
    /**
     * Get current connection state
     */
    getState() {
        const avgLatencyMs = this.latencies.length > 0
            ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length)
            : 0;
        return {
            isConnected: this.connected,
            lastPingAt: this.lastPingAt,
            lastPongAt: this.lastPongAt,
            reconnectAttempts: this.reconnectAttempts,
            totalReconnections: this.totalReconnections,
            avgLatencyMs,
            connectionDurationMs: this.connectedAt ? Date.now() - this.connectedAt : 0,
        };
    }
    /**
     * Check if connection is healthy (has recent pong)
     */
    isHealthy() {
        if (!this.connected)
            return false;
        if (this.lastPongAt) {
            const timeSincePong = Date.now() - this.lastPongAt;
            return timeSincePong < this.config.pingIntervalMs * 2;
        }
        // No pong yet - check if we've sent a ping and it's not timed out
        if (this.lastPingAt) {
            const timeSincePing = Date.now() - this.lastPingAt;
            return timeSincePing < this.config.pongTimeoutMs;
        }
        return this.connected;
    }
    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================
    startPingInterval() {
        // Clear existing interval
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
        // Send initial ping
        this.sendPing();
        // Set up interval
        this.pingInterval = setInterval(() => {
            this.sendPing();
        }, this.config.pingIntervalMs);
    }
    sendPing() {
        if (!this.connected || !this.pingFn)
            return;
        this.lastPingAt = Date.now();
        this.events.onPing?.();
        try {
            this.pingFn();
        }
        catch (error) {
            log.warn({ error: String(error) }, 'Failed to send ping');
            this.connectionLost('ping failed');
            return;
        }
        // Set pong timeout
        this.pongTimeout = setTimeout(() => {
            log.warn('Pong timeout - connection may be dead');
            this.connectionLost('pong timeout');
        }, this.config.pongTimeoutMs);
    }
    async attemptReconnect() {
        if (!this.reconnectFn)
            return;
        // Check if we've exceeded max attempts
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            log.error({ attempts: this.reconnectAttempts }, 'Max reconnection attempts reached');
            this.events.onReconnectFailed?.();
            return;
        }
        this.reconnectAttempts++;
        this.events.onReconnecting?.(this.reconnectAttempts);
        // Calculate delay with exponential backoff
        const delay = Math.min(this.config.initialReconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1), this.config.maxReconnectDelayMs);
        log.info({ attempt: this.reconnectAttempts, delayMs: delay }, '🔄 Attempting reconnection');
        // Wait for delay
        await new Promise((resolve) => {
            this.reconnectTimeout = setTimeout(resolve, delay);
        });
        try {
            const success = await this.reconnectFn();
            if (success) {
                this.connectionRestored();
            }
            else {
                // Try again
                void this.attemptReconnect();
            }
        }
        catch (error) {
            log.warn({ error: String(error), attempt: this.reconnectAttempts }, 'Reconnection attempt failed');
            // Try again
            void this.attemptReconnect();
        }
    }
    recordLatency(latencyMs) {
        this.latencies.push(latencyMs);
        if (this.latencies.length > this.MAX_LATENCY_SAMPLES) {
            this.latencies.shift();
        }
    }
    clearAllTimers() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        if (this.pongTimeout) {
            clearTimeout(this.pongTimeout);
            this.pongTimeout = null;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
    }
}
// ============================================================================
// SESSION MANAGER
// ============================================================================
const activeKeepAlives = new Map();
/**
 * Create a keep-alive for a session
 */
export function createSessionKeepAlive(sessionId, pingFn, events, config) {
    // Clean up existing
    const existing = activeKeepAlives.get(sessionId);
    if (existing) {
        existing.stop();
    }
    const keepAlive = new WebSocketKeepAlive(events, config);
    keepAlive.start(pingFn);
    activeKeepAlives.set(sessionId, keepAlive);
    return keepAlive;
}
/**
 * Get keep-alive for a session
 */
export function getSessionKeepAlive(sessionId) {
    return activeKeepAlives.get(sessionId) ?? null;
}
/**
 * Stop and remove keep-alive for a session
 */
export function removeSessionKeepAlive(sessionId) {
    const keepAlive = activeKeepAlives.get(sessionId);
    if (keepAlive) {
        keepAlive.stop();
        activeKeepAlives.delete(sessionId);
    }
}
/**
 * Get health status for all sessions
 */
export function getAllSessionHealth() {
    const health = new Map();
    const entries = Array.from(activeKeepAlives.entries());
    for (const [sessionId, keepAlive] of entries) {
        health.set(sessionId, keepAlive.isHealthy());
    }
    return health;
}
//# sourceMappingURL=websocket-keepalive.js.map