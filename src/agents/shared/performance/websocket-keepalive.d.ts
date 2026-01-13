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
export interface KeepAliveConfig {
    /** Ping interval in ms (default: 30000 = 30 seconds) */
    pingIntervalMs?: number;
    /** Pong timeout in ms (default: 5000 = 5 seconds) */
    pongTimeoutMs?: number;
    /** Max reconnection attempts (default: 10) */
    maxReconnectAttempts?: number;
    /** Initial reconnect delay in ms (default: 1000) */
    initialReconnectDelayMs?: number;
    /** Max reconnect delay in ms (default: 60000 = 1 minute) */
    maxReconnectDelayMs?: number;
    /** Enable automatic reconnection (default: true) */
    autoReconnect?: boolean;
}
export interface ConnectionState {
    isConnected: boolean;
    lastPingAt: number | null;
    lastPongAt: number | null;
    reconnectAttempts: number;
    totalReconnections: number;
    avgLatencyMs: number;
    connectionDurationMs: number;
}
export interface KeepAliveEvents {
    onConnected?: () => void;
    onDisconnected?: (reason: string) => void;
    onReconnecting?: (attempt: number) => void;
    onReconnectFailed?: () => void;
    onPing?: () => void;
    onPong?: (latencyMs: number) => void;
}
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
export declare class WebSocketKeepAlive {
    private config;
    private events;
    private pingInterval;
    private pongTimeout;
    private reconnectTimeout;
    private pingFn;
    private reconnectFn;
    private connected;
    private lastPingAt;
    private lastPongAt;
    private reconnectAttempts;
    private totalReconnections;
    private connectedAt;
    private latencies;
    private readonly MAX_LATENCY_SAMPLES;
    constructor(events?: KeepAliveEvents, config?: KeepAliveConfig);
    /**
     * Start the keep-alive mechanism
     *
     * @param pingFn - Function to send a ping (e.g., WebSocket ping)
     * @param reconnectFn - Function to attempt reconnection (returns true if successful)
     */
    start(pingFn: () => void, reconnectFn?: () => Promise<boolean>): void;
    /**
     * Stop the keep-alive mechanism
     */
    stop(): void;
    /**
     * Call when pong is received from the server
     */
    receivedPong(): void;
    /**
     * Call when connection is lost unexpectedly
     */
    connectionLost(reason?: string): void;
    /**
     * Call when connection is restored (after reconnect)
     */
    connectionRestored(): void;
    /**
     * Get current connection state
     */
    getState(): ConnectionState;
    /**
     * Check if connection is healthy (has recent pong)
     */
    isHealthy(): boolean;
    private startPingInterval;
    private sendPing;
    private attemptReconnect;
    private recordLatency;
    private clearAllTimers;
}
/**
 * Create a keep-alive for a session
 */
export declare function createSessionKeepAlive(sessionId: string, pingFn: () => void, events?: KeepAliveEvents, config?: KeepAliveConfig): WebSocketKeepAlive;
/**
 * Get keep-alive for a session
 */
export declare function getSessionKeepAlive(sessionId: string): WebSocketKeepAlive | null;
/**
 * Stop and remove keep-alive for a session
 */
export declare function removeSessionKeepAlive(sessionId: string): void;
/**
 * Get health status for all sessions
 */
export declare function getAllSessionHealth(): Map<string, boolean>;
//# sourceMappingURL=websocket-keepalive.d.ts.map