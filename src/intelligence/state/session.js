/**
 * Centralized Session State Manager
 *
 * Consolidates all session-level state that was previously scattered
 * across multiple Map instances in various modules.
 *
 * Benefits:
 * - Single source of truth for session state
 * - Proper cleanup on session end
 * - Easier debugging and observability
 * - Prevents memory leaks from orphaned Map entries
 *
 * @module intelligence/session-state
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'session-state' });
// ============================================================================
// SESSION STATE MANAGER
// ============================================================================
class SessionStateManagerImpl {
    sessions = new Map();
    /**
     * Get or create session state
     */
    get(sessionId) {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, this.createInitialState(sessionId));
            log.debug({ sessionId }, 'Created new session state');
        }
        return this.sessions.get(sessionId);
    }
    /**
     * Check if session exists
     */
    has(sessionId) {
        return this.sessions.has(sessionId);
    }
    /**
     * Update session state
     */
    update(sessionId, updates) {
        const state = this.get(sessionId);
        Object.assign(state, updates, { lastUpdated: new Date() });
        return state;
    }
    /**
     * Set user ID for session
     */
    setUserId(sessionId, userId) {
        const state = this.get(sessionId);
        state.userId = userId;
        state.lastUpdated = new Date();
    }
    /**
     * Clear session state
     */
    clear(sessionId) {
        if (this.sessions.has(sessionId)) {
            log.debug({ sessionId }, 'Clearing session state');
            this.sessions.delete(sessionId);
        }
    }
    /**
     * Clear all sessions (for testing)
     */
    clearAll() {
        log.debug({ count: this.sessions.size }, 'Clearing all session states');
        this.sessions.clear();
    }
    /**
     * Get all active session IDs
     */
    getActiveSessionIds() {
        return Array.from(this.sessions.keys());
    }
    /**
     * Get session count
     */
    getSessionCount() {
        return this.sessions.size;
    }
    /**
     * Cleanup stale sessions (older than maxAge)
     */
    cleanupStaleSessions(maxAgeMs = 24 * 60 * 60 * 1000) {
        const now = Date.now();
        let cleaned = 0;
        const sessionsToDelete = [];
        this.sessions.forEach((state, sessionId) => {
            if (now - state.lastUpdated.getTime() > maxAgeMs) {
                sessionsToDelete.push(sessionId);
            }
        });
        for (const sessionId of sessionsToDelete) {
            this.sessions.delete(sessionId);
            cleaned++;
        }
        if (cleaned > 0) {
            log.info({ cleaned, remaining: this.sessions.size }, 'Cleaned up stale sessions');
        }
        return cleaned;
    }
    /**
     * Create initial session state
     */
    createInitialState(sessionId) {
        return {
            sessionId,
            startTime: new Date(),
            voiceEmotion: {
                emotionHistory: [],
                arc: null,
                totalSamples: 0,
                avgStressLevel: 0,
            },
            emotionalTrajectory: {
                startEmotion: 'neutral',
                currentEmotion: 'neutral',
                trend: 'stable',
                avgDistressLevel: 0,
                peakDistressLevel: 0,
                distressHistory: [],
            },
            patterns: {
                patterns: new Map(),
                lastSurfacedTurn: 0,
                topicMentions: new Map(),
                emotionByTopic: new Map(),
                timingPatterns: new Map(),
                avoidedTopics: new Map(),
                statedIntentions: new Map(),
                reportedActions: new Map(),
            },
            cognitiveLoad: {
                currentLevel: 'low',
                loadScore: 0,
                observations: [],
                needsSimplification: false,
            },
            conversationFlow: {
                phase: 'greeting',
                turnCount: 0,
                topicsDiscussed: [],
                currentTopic: null,
                topicsToCircleBack: [],
                keyMoments: [],
                storiesShared: [],
                lastNameUsed: 0,
                referencedMemories: new Set(),
            },
            custom: new Map(),
            lastUpdated: new Date(),
        };
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
export const SessionStateManager = new SessionStateManagerImpl();
// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================
/**
 * Get session state (shorthand)
 */
export function getSessionState(sessionId) {
    return SessionStateManager.get(sessionId);
}
/**
 * Update voice emotion for session
 */
export function updateVoiceEmotion(sessionId, emotion, stressLevel) {
    const state = SessionStateManager.get(sessionId);
    const voiceState = state.voiceEmotion;
    // Update history
    voiceState.emotionHistory.push(emotion);
    if (voiceState.emotionHistory.length > 10) {
        voiceState.emotionHistory.shift();
    }
    // Update stats
    voiceState.totalSamples++;
    voiceState.avgStressLevel =
        (voiceState.avgStressLevel * (voiceState.totalSamples - 1) + stressLevel) /
            voiceState.totalSamples;
    voiceState.lastAnalysis = new Date();
    // Update current emotion
    voiceState.currentEmotion = emotion;
    state.lastUpdated = new Date();
    return voiceState;
}
/**
 * Update emotional trajectory
 */
export function updateEmotionalTrajectory(sessionId, emotion, distressLevel) {
    const state = SessionStateManager.get(sessionId);
    const trajectory = state.emotionalTrajectory;
    // Set start emotion on first update
    if (trajectory.distressHistory.length === 0) {
        trajectory.startEmotion = emotion;
    }
    // Update current
    trajectory.currentEmotion = emotion;
    trajectory.distressHistory.push(distressLevel);
    trajectory.peakDistressLevel = Math.max(trajectory.peakDistressLevel, distressLevel);
    // Calculate average
    trajectory.avgDistressLevel =
        trajectory.distressHistory.reduce((a, b) => a + b, 0) / trajectory.distressHistory.length;
    // Calculate trend (compare first half to second half)
    if (trajectory.distressHistory.length >= 4) {
        const mid = Math.floor(trajectory.distressHistory.length / 2);
        const firstHalf = trajectory.distressHistory.slice(0, mid);
        const secondHalf = trajectory.distressHistory.slice(mid);
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        const diff = secondAvg - firstAvg;
        if (diff < -0.1) {
            trajectory.trend = 'improving';
        }
        else if (diff > 0.1) {
            trajectory.trend = 'declining';
        }
        else {
            trajectory.trend = 'stable';
        }
    }
    state.lastUpdated = new Date();
    return trajectory;
}
/**
 * Update cognitive load
 */
export function updateCognitiveLoad(sessionId, indicator, loadScore) {
    const state = SessionStateManager.get(sessionId);
    const cogLoad = state.cognitiveLoad;
    // Add observation
    cogLoad.observations.push({
        indicator,
        timestamp: new Date(),
    });
    // Keep last 10 observations
    if (cogLoad.observations.length > 10) {
        cogLoad.observations.shift();
    }
    // Update load score (weighted average)
    cogLoad.loadScore = cogLoad.loadScore * 0.7 + loadScore * 0.3;
    // Determine level
    if (cogLoad.loadScore >= 0.8) {
        cogLoad.currentLevel = 'overloaded';
        cogLoad.needsSimplification = true;
    }
    else if (cogLoad.loadScore >= 0.6) {
        cogLoad.currentLevel = 'high';
        cogLoad.needsSimplification = true;
    }
    else if (cogLoad.loadScore >= 0.4) {
        cogLoad.currentLevel = 'moderate';
        cogLoad.needsSimplification = false;
    }
    else {
        cogLoad.currentLevel = 'low';
        cogLoad.needsSimplification = false;
    }
    state.lastUpdated = new Date();
    return cogLoad;
}
/**
 * Record a key moment in the conversation
 */
export function recordKeyMoment(sessionId, summary) {
    const state = SessionStateManager.get(sessionId);
    state.conversationFlow.keyMoments.push({
        summary,
        timestamp: new Date(),
        turnNumber: state.conversationFlow.turnCount,
    });
    state.lastUpdated = new Date();
}
/**
 * Increment turn count
 */
export function incrementTurnCount(sessionId) {
    const state = SessionStateManager.get(sessionId);
    state.conversationFlow.turnCount++;
    state.lastUpdated = new Date();
    return state.conversationFlow.turnCount;
}
/**
 * Set custom state for a builder
 */
export function setCustomState(sessionId, key, value) {
    const state = SessionStateManager.get(sessionId);
    state.custom.set(key, value);
    state.lastUpdated = new Date();
}
/**
 * Get custom state for a builder
 */
export function getCustomState(sessionId, key) {
    const state = SessionStateManager.get(sessionId);
    return state.custom.get(key);
}
/**
 * Mark a memory as referenced (to prevent repetition)
 */
export function markMemoryReferenced(sessionId, memoryId) {
    const state = SessionStateManager.get(sessionId);
    state.conversationFlow.referencedMemories.add(memoryId);
    state.lastUpdated = new Date();
}
/**
 * Check if memory was already referenced
 */
export function wasMemoryReferenced(sessionId, memoryId) {
    const state = SessionStateManager.get(sessionId);
    return state.conversationFlow.referencedMemories.has(memoryId);
}
const COGNITIVE_STATE_KEY = 'cognitive-reasoning';
/**
 * Get cognitive reasoning state for session
 */
export function getCognitiveState(sessionId) {
    let state = getCustomState(sessionId, COGNITIVE_STATE_KEY);
    if (!state) {
        state = {
            reasoningHistory: [],
            userMessages: [],
            activeChain: null,
            userStyle: 'unknown',
            styleConfidence: 0,
            quirksUsed: new Set(),
            habitsUsed: new Set(),
            sharedInsights: new Set(),
            insightCooldowns: new Map(),
        };
        setCustomState(sessionId, COGNITIVE_STATE_KEY, state);
    }
    return state;
}
/**
 * Update cognitive reasoning history
 */
export function addReasoningApproach(sessionId, approach) {
    const state = getCognitiveState(sessionId);
    state.reasoningHistory.push(approach);
    // Keep last 10
    if (state.reasoningHistory.length > 10) {
        state.reasoningHistory.shift();
    }
}
/**
 * Add user message for cognitive style detection
 */
export function addUserMessageForStyleDetection(sessionId, message) {
    const state = getCognitiveState(sessionId);
    state.userMessages.push(message);
    // Keep last 20
    if (state.userMessages.length > 20) {
        state.userMessages.shift();
    }
    return state.userMessages;
}
/**
 * Update detected user cognitive style
 */
export function updateUserCognitiveStyle(sessionId, style, confidence) {
    const state = getCognitiveState(sessionId);
    state.userStyle = style;
    state.styleConfidence = confidence;
}
/**
 * Set active reasoning chain
 */
export function setActiveReasoningChain(sessionId, chain) {
    const state = getCognitiveState(sessionId);
    state.activeChain = chain;
}
/**
 * Get active reasoning chain
 */
export function getActiveReasoningChain(sessionId) {
    const state = getCognitiveState(sessionId);
    return state.activeChain;
}
/**
 * Mark a quirk as used
 */
export function markQuirkUsed(sessionId, quirkId) {
    const state = getCognitiveState(sessionId);
    state.quirksUsed.add(quirkId);
}
/**
 * Check if quirk was used
 */
export function wasQuirkUsed(sessionId, quirkId) {
    const state = getCognitiveState(sessionId);
    return state.quirksUsed.has(quirkId);
}
/**
 * Mark a mental habit as used
 */
export function markHabitUsed(sessionId, habitId) {
    const state = getCognitiveState(sessionId);
    state.habitsUsed.add(habitId);
}
/**
 * Check if habit was used
 */
export function wasHabitUsed(sessionId, habitId) {
    const state = getCognitiveState(sessionId);
    return state.habitsUsed.has(habitId);
}
/**
 * Mark an insight as shared
 */
export function markInsightShared(sessionId, insightKey, turnCount) {
    const state = getCognitiveState(sessionId);
    state.sharedInsights.add(insightKey);
    state.insightCooldowns.set(insightKey, turnCount);
}
/**
 * Check if insight was shared
 */
export function wasInsightShared(sessionId, insightKey) {
    const state = getCognitiveState(sessionId);
    return state.sharedInsights.has(insightKey);
}
/**
 * Check if insight is on cooldown
 */
export function isInsightOnCooldown(sessionId, insightKey, currentTurn, cooldownTurns) {
    const state = getCognitiveState(sessionId);
    const lastUsed = state.insightCooldowns.get(insightKey);
    if (lastUsed === undefined)
        return false;
    return currentTurn - lastUsed < cooldownTurns;
}
const LOVABLE_STATE_KEY = 'lovable-presence';
/**
 * Get lovable presence state for session
 */
export function getLovableState(sessionId) {
    let state = getCustomState(sessionId, LOVABLE_STATE_KEY);
    if (!state) {
        state = {
            tangentsThisSession: 0,
            surprisesThisSession: 0,
            userSmileSignals: 0,
        };
        setCustomState(sessionId, LOVABLE_STATE_KEY, state);
    }
    return state;
}
/**
 * Update lovable presence state
 */
export function updateLovableState(sessionId, updates) {
    const state = getLovableState(sessionId);
    Object.assign(state, updates);
    return state;
}
const SESSION_FLOW_KEY = 'session-flow-tracking';
/**
 * Get session flow tracking state
 */
export function getSessionFlowState(sessionId) {
    let state = getCustomState(sessionId, SESSION_FLOW_KEY);
    if (!state) {
        state = {
            lastTrackedEmotion: null,
            emotionShiftCount: 0,
            lastSignificantMoment: 0,
            topicChanges: 0,
            questionAsked: 0,
            storiesShared: 0,
        };
        setCustomState(sessionId, SESSION_FLOW_KEY, state);
    }
    return state;
}
/**
 * Update session flow tracking state
 */
export function updateSessionFlowState(sessionId, updates) {
    const state = getSessionFlowState(sessionId);
    Object.assign(state, updates);
    return state;
}
// ============================================================================
// EXPORTS
// ============================================================================
export default SessionStateManager;
//# sourceMappingURL=session.js.map