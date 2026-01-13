/**
 * Cognitive Broadcast Service
 *
 * Broadcasts cognitive state updates for real-time dashboards.
 * Uses EventEmitter pattern for extensibility.
 *
 * Can be consumed by:
 * - WebSocket handlers
 * - LiveKit data channels
 * - HTTP SSE endpoints
 * - Direct subscribers
 */
import { EventEmitter } from 'events';
import { getLogger } from '../utils/safe-logger.js';
import { registerCognitiveMetricsBroadcast } from '../utils/cognitive-metrics.js';
// ============================================================================
// BROADCAST SERVICE
// ============================================================================
class CognitiveBroadcastService extends EventEmitter {
    eventHistory = [];
    maxHistory = 100;
    subscribers = new Set();
    constructor() {
        super();
        this.setMaxListeners(50); // Allow many subscribers
    }
    /**
     * Broadcast a cognitive event
     */
    broadcast(event) {
        // Add timestamp if not present
        if (!event.timestamp) {
            event.timestamp = new Date();
        }
        // Store in history
        this.eventHistory.push(event);
        if (this.eventHistory.length > this.maxHistory) {
            this.eventHistory.shift();
        }
        // Emit to EventEmitter subscribers
        this.emit(event.type, event);
        this.emit('*', event); // Wildcard for all events
        // Notify direct subscribers
        for (const subscriber of this.subscribers) {
            try {
                subscriber(event);
            }
            catch (err) {
                getLogger().warn({ err }, 'Cognitive broadcast subscriber error');
            }
        }
        getLogger().debug({
            type: event.type,
            personaId: 'personaId' in event ? event.personaId : undefined,
        }, '📡 Cognitive event broadcast');
    }
    /**
     * Subscribe to all cognitive events
     */
    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }
    /**
     * Get recent event history
     */
    getHistory(limit = 50) {
        return this.eventHistory.slice(-limit);
    }
    /**
     * Get latest event of a specific type
     */
    getLatest(type) {
        for (let i = this.eventHistory.length - 1; i >= 0; i--) {
            if (this.eventHistory[i].type === type) {
                return this.eventHistory[i];
            }
        }
        return null;
    }
    /**
     * Get current cognitive state snapshot
     */
    getCurrentState() {
        return {
            cognitiveMode: this.getLatest('cognitive_mode'),
            userStyle: this.getLatest('user_style'),
            voiceEmotion: this.getLatest('voice_emotion'),
            confidence: this.getLatest('confidence'),
            metrics: this.getLatest('metrics'),
            recentApproaches: this.eventHistory
                .filter((e) => e.type === 'approach_history')
                .slice(-10),
            activeQuirks: this.eventHistory
                .filter((e) => e.type === 'quirk_activated')
                .slice(-5),
        };
    }
    /**
     * Clear history (for testing)
     */
    clearHistory() {
        this.eventHistory = [];
    }
}
// Singleton instance
export const cognitiveBroadcast = new CognitiveBroadcastService();
// ============================================================================
// CONVENIENCE METHODS
// ============================================================================
/**
 * Broadcast cognitive mode change
 */
export function broadcastCognitiveMode(personaId, mode, reason) {
    cognitiveBroadcast.broadcast({
        type: 'cognitive_mode',
        personaId,
        mode,
        reason,
        timestamp: new Date(),
    });
}
/**
 * Broadcast detected user style
 */
export function broadcastUserStyle(userId, style, confidence, signals = {}) {
    cognitiveBroadcast.broadcast({
        type: 'user_style',
        userId,
        style,
        confidence,
        signals,
        timestamp: new Date(),
    });
}
/**
 * Broadcast voice emotion detection
 */
export function broadcastVoiceEmotion(userId, emotion, confidence, trend = 'stable') {
    cognitiveBroadcast.broadcast({
        type: 'voice_emotion',
        userId,
        emotion,
        confidence,
        trend,
        timestamp: new Date(),
    });
}
/**
 * Broadcast confidence level
 */
export function broadcastConfidence(personaId, level, reason) {
    cognitiveBroadcast.broadcast({
        type: 'confidence',
        personaId,
        level,
        reason,
        timestamp: new Date(),
    });
}
/**
 * Broadcast approach used
 */
export function broadcastApproachUsed(personaId, approach, topic, engagementScore) {
    cognitiveBroadcast.broadcast({
        type: 'approach_history',
        personaId,
        approach,
        topic,
        engagementScore,
        timestamp: new Date(),
    });
}
/**
 * Broadcast quirk activation
 */
export function broadcastQuirkActivated(personaId, quirkName, quirkIcon, frequency) {
    cognitiveBroadcast.broadcast({
        type: 'quirk_activated',
        personaId,
        quirkName,
        quirkIcon,
        frequency,
        timestamp: new Date(),
    });
}
/**
 * Broadcast insight generation
 */
export function broadcastInsightGenerated(personaId, insightType, phrase, shared) {
    cognitiveBroadcast.broadcast({
        type: 'insight_generated',
        personaId,
        insightType,
        phrase,
        shared,
        timestamp: new Date(),
    });
}
/**
 * Broadcast performance metrics
 */
export function broadcastMetrics(metrics) {
    cognitiveBroadcast.broadcast({
        type: 'metrics',
        ...metrics,
        timestamp: new Date(),
    });
}
// ============================================================================
// REGISTER WITH UTILS LAYER
// ============================================================================
// Register callback to receive cognitive metrics broadcasts from utils layer
// This follows proper architecture: services layer registers with utils layer
registerCognitiveMetricsBroadcast((metrics) => {
    broadcastMetrics(metrics);
});
export default cognitiveBroadcast;
//# sourceMappingURL=cognitive-broadcast.js.map