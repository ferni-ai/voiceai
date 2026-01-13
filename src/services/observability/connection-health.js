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
import { getLogger } from '../../utils/safe-logger.js';
const log = getLogger();
// ============================================================================
// CONNECTION HEALTH SERVICE
// ============================================================================
class ConnectionHealthService {
    events = [];
    MAX_EVENTS = 5000;
    // Current state tracking
    activeSessionConnections = new Map();
    // Aggregate metrics
    messagesDelivered = 0;
    messagesFailed = 0;
    packetLossSamples = [];
    jitterSamples = [];
    rttSamples = [];
    /**
     * Record a connection event
     */
    recordEvent(event) {
        const record = {
            ...event,
            id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
        };
        this.events.push(record);
        // Trim old events
        if (this.events.length > this.MAX_EVENTS) {
            this.events = this.events.slice(-this.MAX_EVENTS);
        }
        // Update session state
        this.updateSessionState(record);
        // Log significant events
        if (event.eventType === 'disconnect' || event.eventType === 'reconnect') {
            log.info({
                sessionId: event.sessionId,
                eventType: event.eventType,
                durationMs: event.durationMs,
            }, `🔌 Connection event: ${event.eventType}`);
        }
    }
    /**
     * Update session connection state
     */
    updateSessionState(event) {
        let session = this.activeSessionConnections.get(event.sessionId);
        if (!session) {
            session = {
                state: 'connecting',
                iceState: 'new',
                connectedAt: Date.now(),
                audioActive: false,
                videoActive: false,
                dataChannelOpen: false,
            };
            this.activeSessionConnections.set(event.sessionId, session);
        }
        switch (event.eventType) {
            case 'connect':
                session.state = 'connected';
                session.connectedAt = Date.now();
                session.disconnectedAt = undefined;
                break;
            case 'disconnect':
                session.state = 'disconnected';
                session.disconnectedAt = Date.now();
                break;
            case 'reconnect':
                session.state = event.success ? 'connected' : 'failed';
                if (event.success) {
                    session.connectedAt = Date.now();
                    session.disconnectedAt = undefined;
                }
                break;
            case 'ice_change':
                session.iceState = event.newState || session.iceState;
                break;
            case 'track_change':
                if (event.metadata?.trackType === 'audio') {
                    session.audioActive = event.metadata?.active ?? false;
                }
                if (event.metadata?.trackType === 'video') {
                    session.videoActive = event.metadata?.active ?? false;
                }
                break;
            case 'data_message':
                session.dataChannelOpen = event.success;
                break;
        }
    }
    /**
     * Record connection established
     */
    recordConnect(sessionId) {
        this.recordEvent({
            sessionId,
            eventType: 'connect',
            newState: 'connected',
            success: true,
        });
    }
    /**
     * Record disconnection
     */
    recordDisconnect(sessionId, reason) {
        this.recordEvent({
            sessionId,
            eventType: 'disconnect',
            previousState: 'connected',
            newState: 'disconnected',
            success: true,
            errorMessage: reason,
        });
    }
    /**
     * Record reconnection attempt
     */
    recordReconnect(sessionId, success, durationMs, error) {
        this.recordEvent({
            sessionId,
            eventType: 'reconnect',
            durationMs,
            success,
            errorMessage: error,
        });
    }
    /**
     * Record ICE state change
     */
    recordICEStateChange(sessionId, previousState, newState) {
        this.recordEvent({
            sessionId,
            eventType: 'ice_change',
            previousState,
            newState,
            success: newState !== 'failed',
        });
    }
    /**
     * Record data message delivery
     */
    recordDataMessage(sessionId, success) {
        if (success) {
            this.messagesDelivered++;
        }
        else {
            this.messagesFailed++;
        }
        this.recordEvent({
            sessionId,
            eventType: 'data_message',
            success,
        });
    }
    /**
     * Record quality metrics sample
     */
    recordQualitySample(packetLoss, jitterMs, rttMs) {
        this.packetLossSamples.push(packetLoss);
        this.jitterSamples.push(jitterMs);
        this.rttSamples.push(rttMs);
        // Keep last 1000 samples
        if (this.packetLossSamples.length > 1000) {
            this.packetLossSamples = this.packetLossSamples.slice(-1000);
            this.jitterSamples = this.jitterSamples.slice(-1000);
            this.rttSamples = this.rttSamples.slice(-1000);
        }
    }
    /**
     * Record track state change
     */
    recordTrackChange(sessionId, trackType, active) {
        this.recordEvent({
            sessionId,
            eventType: 'track_change',
            success: true,
            metadata: { trackType, active },
        });
    }
    /**
     * Remove session (on cleanup)
     */
    removeSession(sessionId) {
        this.activeSessionConnections.delete(sessionId);
    }
    /**
     * Get health snapshot
     */
    getSnapshot(windowMinutes = 60) {
        const now = Date.now();
        const windowStart = now - windowMinutes * 60 * 1000;
        const windowEvents = this.events.filter((e) => e.timestamp >= windowStart);
        // Current state from active sessions
        const sessions = Array.from(this.activeSessionConnections.values());
        const activeConnections = sessions.filter((s) => s.state === 'connected').length;
        // Aggregate connection state
        const connectionState = activeConnections > 0
            ? 'connected'
            : sessions.some((s) => s.state === 'reconnecting')
                ? 'reconnecting'
                : 'disconnected';
        // Aggregate ICE state
        const iceStates = sessions.map((s) => s.iceState);
        const iceState = iceStates.includes('connected') || iceStates.includes('completed')
            ? 'connected'
            : iceStates.includes('checking')
                ? 'checking'
                : 'disconnected';
        // Reconnection metrics
        const reconnectEvents = windowEvents.filter((e) => e.eventType === 'reconnect');
        const successfulReconnects = reconnectEvents.filter((e) => e.success);
        const reconnectTimes = successfulReconnects
            .filter((e) => e.durationMs)
            .map((e) => e.durationMs);
        const avgReconnectTime = reconnectTimes.length > 0
            ? reconnectTimes.reduce((a, b) => a + b, 0) / reconnectTimes.length
            : 0;
        const reconnectSuccessRate = reconnectEvents.length > 0
            ? (successfulReconnects.length / reconnectEvents.length) * 100
            : 100;
        // Data channel
        const dataChannelOpen = sessions.some((s) => s.dataChannelOpen);
        const deliveryRate = this.messagesDelivered + this.messagesFailed > 0
            ? (this.messagesDelivered / (this.messagesDelivered + this.messagesFailed)) * 100
            : 100;
        // Audio/Video
        const audioActive = sessions.some((s) => s.audioActive);
        const videoActive = sessions.some((s) => s.videoActive);
        const trackChanges = windowEvents.filter((e) => e.eventType === 'track_change').length;
        // Quality metrics (averages)
        const avgPacketLoss = this.packetLossSamples.length > 0
            ? this.packetLossSamples.reduce((a, b) => a + b, 0) / this.packetLossSamples.length
            : 0;
        const avgJitter = this.jitterSamples.length > 0
            ? this.jitterSamples.reduce((a, b) => a + b, 0) / this.jitterSamples.length
            : 0;
        const avgRtt = this.rttSamples.length > 0
            ? this.rttSamples.reduce((a, b) => a + b, 0) / this.rttSamples.length
            : 0;
        // Uptime calculation
        const connectEvents = windowEvents.filter((e) => e.eventType === 'connect');
        const disconnectEvents = windowEvents.filter((e) => e.eventType === 'disconnect');
        let totalConnectedTime = 0;
        let totalDisconnectedTime = 0;
        // Simple heuristic: count time between connects and disconnects
        const allStateEvents = [...connectEvents, ...disconnectEvents].sort((a, b) => a.timestamp - b.timestamp);
        let lastConnectTime = windowStart;
        let isConnected = sessions.some((s) => s.state === 'connected');
        for (const event of allStateEvents) {
            if (event.eventType === 'connect') {
                if (!isConnected) {
                    totalDisconnectedTime += event.timestamp - lastConnectTime;
                }
                lastConnectTime = event.timestamp;
                isConnected = true;
            }
            else if (event.eventType === 'disconnect') {
                if (isConnected) {
                    totalConnectedTime += event.timestamp - lastConnectTime;
                }
                lastConnectTime = event.timestamp;
                isConnected = false;
            }
        }
        // Add time from last event to now
        if (isConnected) {
            totalConnectedTime += now - lastConnectTime;
        }
        else {
            totalDisconnectedTime += now - lastConnectTime;
        }
        const totalTime = totalConnectedTime + totalDisconnectedTime;
        const availability = totalTime > 0 ? (totalConnectedTime / totalTime) * 100 : 100;
        // Errors
        const errorEvents = windowEvents.filter((e) => !e.success && e.errorMessage);
        const errorsByType = {};
        errorEvents.forEach((e) => {
            const type = e.errorMessage || 'unknown';
            errorsByType[type] = (errorsByType[type] || 0) + 1;
        });
        return {
            activeConnections,
            connectionState,
            iceState,
            reconnectionCount: reconnectEvents.length,
            avgReconnectTimeMs: avgReconnectTime,
            reconnectSuccessRate,
            dataChannelState: dataChannelOpen ? 'open' : 'closed',
            messagesDelivered: this.messagesDelivered,
            messagesFailed: this.messagesFailed,
            deliveryRate,
            audioTrackActive: audioActive,
            videoTrackActive: videoActive,
            trackStateChanges: trackChanges,
            packetLossPercent: avgPacketLoss,
            jitterMs: avgJitter,
            roundTripTimeMs: avgRtt,
            connectionUptimeMs: totalConnectedTime,
            totalDisconnectTimeMs: totalDisconnectedTime,
            availabilityPercent: availability,
            connectionErrors: errorEvents.length,
            errorsByType,
            windowStartTime: windowStart,
            windowEndTime: now,
        };
    }
    /**
     * Clear metrics
     */
    clear() {
        this.events = [];
        this.activeSessionConnections.clear();
        this.messagesDelivered = 0;
        this.messagesFailed = 0;
        this.packetLossSamples = [];
        this.jitterSamples = [];
        this.rttSamples = [];
        log.info('Connection health metrics cleared');
    }
}
// ============================================================================
// SINGLETON EXPORT
// ============================================================================
export const connectionHealthMetrics = new ConnectionHealthService();
//# sourceMappingURL=connection-health.js.map