/**
 * Trust Systems Analytics
 *
 * Tracks usage and effectiveness of trust-building features.
 * Measures what actually works for building connection.
 *
 * Philosophy: We can't improve what we don't measure. But we measure
 * what matters - genuine connection, not just engagement metrics.
 *
 * @module TrustAnalytics
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { removeUndefined } from '../../utils/firestore-utils.js';
const log = createLogger({ module: 'TrustAnalytics' });
// ============================================================================
// IN-MEMORY TRACKING
// ============================================================================
const recentEvents = [];
const MAX_RECENT_EVENTS = 1000;
const dailyMetrics = new Map();
const userAssignments = new Map();
// ============================================================================
// EVENT TRACKING
// ============================================================================
/**
 * Track a trust system event
 */
export function trackEvent(event) {
    const fullEvent = {
        ...event,
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date(),
    };
    recentEvents.push(fullEvent);
    // Keep bounded
    if (recentEvents.length > MAX_RECENT_EVENTS) {
        recentEvents.shift();
    }
    // Update daily metrics
    const dateKey = new Date().toISOString().split('T')[0];
    const metricKey = `${event.system}_${event.eventType}`;
    const dayMetrics = dailyMetrics.get(dateKey) || {};
    dayMetrics[metricKey] = (dayMetrics[metricKey] || 0) + 1;
    dailyMetrics.set(dateKey, dayMetrics);
    // Fire and forget persistence
    void persistEvent(fullEvent).catch((e) => log.debug({ error: e }, 'Event persistence failed'));
    return fullEvent;
}
/**
 * Persist event to Firestore
 */
async function persistEvent(event) {
    try {
        const db = getFirestore();
        await db.collection('trust_analytics').add(removeUndefined({
            ...event,
            timestamp: FieldValue.serverTimestamp(),
        }));
    }
    catch {
        // Swallow - analytics shouldn't break main flow
    }
}
// ============================================================================
// CONVENIENCE TRACKERS
// ============================================================================
/**
 * Track when a signal is detected
 */
export function trackDetection(userId, system, details = {}) {
    trackEvent({
        userId,
        system,
        eventType: 'detected',
        details,
    });
}
/**
 * Track when context is surfaced to LLM
 */
export function trackSurfaced(userId, system, personaId, details = {}) {
    trackEvent({
        userId,
        system,
        eventType: 'surfaced',
        personaId,
        details,
    });
}
/**
 * Track when AI acts on the context
 */
export function trackActedOn(userId, system, personaId, details = {}) {
    trackEvent({
        userId,
        system,
        eventType: 'acted_on',
        personaId,
        details,
    });
}
/**
 * Track user response to trust action
 */
export function trackUserResponse(userId, system, response, details = {}) {
    trackEvent({
        userId,
        system,
        eventType: 'user_response',
        details: { ...details, response },
    });
    if (response === 'positive') {
        trackEvent({
            userId,
            system,
            eventType: 'positive_outcome',
            details,
        });
    }
}
// ============================================================================
// METRICS CALCULATION
// ============================================================================
/**
 * Calculate metrics for a user over a period
 */
export function calculateUserMetrics(userId, startDate, endDate = new Date()) {
    const userEvents = recentEvents.filter((e) => e.userId === userId && e.timestamp >= startDate && e.timestamp <= endDate);
    const detections = {};
    const surfaced = {};
    const actedOn = {};
    const positiveResponses = {};
    for (const event of userEvents) {
        switch (event.eventType) {
            case 'detected':
                detections[event.system] = (detections[event.system] || 0) + 1;
                break;
            case 'surfaced':
                surfaced[event.system] = (surfaced[event.system] || 0) + 1;
                break;
            case 'acted_on':
                actedOn[event.system] = (actedOn[event.system] || 0) + 1;
                break;
            case 'positive_outcome':
                positiveResponses[event.system] = (positiveResponses[event.system] || 0) + 1;
                break;
        }
    }
    // Calculate effectiveness
    const effectiveness = {};
    for (const system of Object.keys(surfaced)) {
        const surf = surfaced[system] || 0;
        const acted = actedOn[system] || 0;
        effectiveness[system] = surf > 0 ? acted / surf : 0;
    }
    return {
        userId,
        period: 'day',
        startDate,
        detections,
        surfaced,
        actedOn,
        positiveResponses,
        effectiveness,
    };
}
/**
 * Get aggregate metrics across all users
 */
export function getAggregateMetrics(startDate, endDate = new Date()) {
    const events = recentEvents.filter((e) => e.timestamp >= startDate && e.timestamp <= endDate);
    const bySystem = {};
    for (const event of events) {
        if (!bySystem[event.system]) {
            bySystem[event.system] = {};
        }
        bySystem[event.system][event.eventType] = (bySystem[event.system][event.eventType] || 0) + 1;
    }
    // Calculate effectiveness per system
    const topPerformers = [];
    for (const [system, counts] of Object.entries(bySystem)) {
        const surf = counts.surfaced || 0;
        const positive = counts.positive_outcome || 0;
        const effectiveness = surf > 0 ? positive / surf : 0;
        topPerformers.push({ system, effectiveness });
    }
    topPerformers.sort((a, b) => b.effectiveness - a.effectiveness);
    return {
        totalEvents: events.length,
        bySystem,
        topPerformers,
    };
}
// ============================================================================
// A/B TESTING
// ============================================================================
const activeTests = new Map();
/**
 * Create an A/B test
 */
export function createABTest(config) {
    activeTests.set(config.id, config);
    log.info({ testId: config.id, name: config.name }, '🧪 A/B test created');
}
/**
 * Get user's test assignment
 */
export function getTestAssignment(userId, testId) {
    const test = activeTests.get(testId);
    if (!test || (test.endDate && test.endDate < new Date())) {
        return null;
    }
    // Check existing assignment
    const userTests = userAssignments.get(userId) || {};
    if (userTests[testId]) {
        return userTests[testId];
    }
    // Assign deterministically based on userId hash
    const hash = simpleHash(userId + testId);
    const assignment = hash % 100 < test.treatmentPercentage * 100 ? 'treatment' : 'control';
    userTests[testId] = assignment;
    userAssignments.set(userId, userTests);
    return assignment;
}
/**
 * Check if feature is enabled for user (for A/B tests)
 */
export function isFeatureEnabled(userId, testId) {
    const assignment = getTestAssignment(userId, testId);
    return assignment === 'treatment';
}
/**
 * Simple hash function for deterministic assignment
 */
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}
// ============================================================================
// REPORTING
// ============================================================================
/**
 * Get daily summary for a date
 */
export function getDailySummary(date) {
    const dateKey = date.toISOString().split('T')[0];
    return dailyMetrics.get(dateKey) || {};
}
/**
 * Get trust system health check
 */
export function getHealthCheck() {
    const systems = {};
    const systemNames = [
        'reading_between_lines',
        'boundary_memory',
        'growth_reflection',
        'inside_jokes',
        'small_wins',
        'thinking_of_you',
    ];
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const system of systemNames) {
        const lastEvent = recentEvents
            .filter((e) => e.system === system)
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
        systems[system] = {
            active: lastEvent ? lastEvent.timestamp > oneHourAgo : false,
            lastEvent: lastEvent?.timestamp,
        };
    }
    const activeCount = Object.values(systems).filter((s) => s.active).length;
    const status = activeCount === systemNames.length
        ? 'healthy'
        : activeCount >= systemNames.length / 2
            ? 'degraded'
            : 'unhealthy';
    return {
        status,
        systems,
        recentEventCount: recentEvents.length,
    };
}
/**
 * Export analytics data for external analysis
 */
export function exportAnalytics(startDate, endDate = new Date()) {
    const events = recentEvents.filter((e) => e.timestamp >= startDate && e.timestamp <= endDate);
    return {
        events,
        metrics: getAggregateMetrics(startDate, endDate),
        health: getHealthCheck(),
    };
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    trackEvent,
    trackDetection,
    trackSurfaced,
    trackActedOn,
    trackUserResponse,
    calculateUserMetrics,
    getAggregateMetrics,
    createABTest,
    getTestAssignment,
    isFeatureEnabled,
    getDailySummary,
    getHealthCheck,
    exportAnalytics,
};
//# sourceMappingURL=analytics.js.map