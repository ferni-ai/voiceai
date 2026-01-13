/**
 * Connection Health Metrics
 *
 * Tracks connection stability and reliability:
 * - WebSocket reconnection events
 * - LiveKit ICE connection state
 * - Data channel reliability
 * - Audio/video track state
 * - Packet loss and jitter
 */
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed';
export type ICEState = 'new' | 'checking' | 'connected' | 'completed' | 'failed' | 'disconnected' | 'closed';
export interface ConnectionEvent {
    id: string;
    timestamp: number;
    sessionId: string;
    eventType: 'connect' | 'disconnect' | 'reconnect' | 'ice_change' | 'track_change' | 'data_message';
    previousState?: string;
    newState?: string;
    durationMs?: number;
    success: boolean;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
}
export interface ConnectionHealthSnapshot {
    activeConnections: number;
    connectionState: ConnectionState;
    iceState: ICEState;
    reconnectionCount: number;
    avgReconnectTimeMs: number;
    reconnectSuccessRate: number;
    dataChannelState: 'open' | 'closed' | 'connecting';
    messagesDelivered: number;
    messagesFailed: number;
    deliveryRate: number;
    audioTrackActive: boolean;
    videoTrackActive: boolean;
    trackStateChanges: number;
    packetLossPercent: number;
    jitterMs: number;
    roundTripTimeMs: number;
    connectionUptimeMs: number;
    totalDisconnectTimeMs: number;
    availabilityPercent: number;
    connectionErrors: number;
    errorsByType: Record<string, number>;
    windowStartTime: number;
    windowEndTime: number;
}
declare class ConnectionHealthService {
    private events;
    private readonly MAX_EVENTS;
    private activeSessionConnections;
    private messagesDelivered;
    private messagesFailed;
    private packetLossSamples;
    private jitterSamples;
    private rttSamples;
    /**
     * Record a connection event
     */
    recordEvent(event: Omit<ConnectionEvent, 'id' | 'timestamp'>): void;
    /**
     * Update session connection state
     */
    private updateSessionState;
    /**
     * Record connection established
     */
    recordConnect(sessionId: string): void;
    /**
     * Record disconnection
     */
    recordDisconnect(sessionId: string, reason?: string): void;
    /**
     * Record reconnection attempt
     */
    recordReconnect(sessionId: string, success: boolean, durationMs: number, error?: string): void;
    /**
     * Record ICE state change
     */
    recordICEStateChange(sessionId: string, previousState: ICEState, newState: ICEState): void;
    /**
     * Record data message delivery
     */
    recordDataMessage(sessionId: string, success: boolean): void;
    /**
     * Record quality metrics sample
     */
    recordQualitySample(packetLoss: number, jitterMs: number, rttMs: number): void;
    /**
     * Record track state change
     */
    recordTrackChange(sessionId: string, trackType: 'audio' | 'video', active: boolean): void;
    /**
     * Remove session (on cleanup)
     */
    removeSession(sessionId: string): void;
    /**
     * Get health snapshot
     */
    getSnapshot(windowMinutes?: number): ConnectionHealthSnapshot;
    /**
     * Clear metrics
     */
    clear(): void;
}
export declare const connectionHealthMetrics: ConnectionHealthService;
export {};
//# sourceMappingURL=connection-health.d.ts.map