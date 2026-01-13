/**
 * Device Awareness Context Builder
 *
 * Provides context about the user's device and interaction mode.
 * "Better than Human" - adapt to their context without being asked.
 *
 * Superhuman Capabilities:
 * - "I notice you're on mobile at 2am - quick check-in vs deep conversation?"
 * - "You're using headphones - I can speak more freely"
 * - "Looks like you're walking - I'll keep this brief"
 * - Adapt response length based on mobile vs desktop
 *
 * Context comes from:
 * 1. LiveKit data channel (mobile app sends context)
 * 2. Connection metadata (device type, screen size)
 * 3. Session patterns (typing speed, response patterns)
 *
 * @module intelligence/context-builders/awareness/device-awareness
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { registerContextBuilder, createStandardInjection, createHighInjection, createHintInjection, } from '../index.js';
import { BuilderCategory } from '../core/categories.js';
const log = createLogger({ module: 'context:device-awareness' });
// ============================================================================
// STATE
// ============================================================================
// Store device context per session
const sessionDeviceContext = new Map();
// Track when we last injected device context (avoid spamming)
const lastInjectionTime = new Map();
const INJECTION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
// ============================================================================
// CONTEXT MANAGEMENT
// ============================================================================
/**
 * Update device context from data channel message
 */
export function updateDeviceContext(sessionId, payload) {
    const existing = sessionDeviceContext.get(sessionId);
    const updated = {
        deviceType: payload.deviceType || existing?.deviceType || 'unknown',
        platform: payload.platform || existing?.platform || 'unknown',
        hasHeadphones: payload.hasHeadphones ?? existing?.hasHeadphones,
        orientation: payload.orientation || existing?.orientation,
        inMotion: payload.inMotion ?? existing?.inMotion,
        batteryLevel: payload.batteryLevel ?? existing?.batteryLevel,
        lowPowerMode: payload.lowPowerMode ?? existing?.lowPowerMode,
        screenTimeToday: payload.screenTimeToday ?? existing?.screenTimeToday,
        appForegroundDuration: payload.appForegroundDuration ?? existing?.appForegroundDuration,
        privacyMode: payload.privacyMode ?? existing?.privacyMode,
        connectionQuality: payload.connectionQuality || existing?.connectionQuality,
        timestamp: Date.now(),
    };
    sessionDeviceContext.set(sessionId, updated);
    log.debug({ sessionId, deviceType: updated.deviceType, platform: updated.platform }, 'Device context updated');
}
/**
 * Get device context for session
 */
export function getDeviceContext(sessionId) {
    return sessionDeviceContext.get(sessionId) || null;
}
/**
 * Clear device context on session end
 */
export function clearDeviceContext(sessionId) {
    sessionDeviceContext.delete(sessionId);
    lastInjectionTime.delete(sessionId);
}
/**
 * Infer device type from user agent or connection metadata
 */
export function inferDeviceFromUserAgent(userAgent) {
    if (!userAgent)
        return { deviceType: 'unknown', platform: 'unknown' };
    const ua = userAgent.toLowerCase();
    let deviceType = 'desktop';
    let platform = 'unknown';
    // Platform detection
    if (ua.includes('iphone') || ua.includes('ipad')) {
        platform = 'ios';
        deviceType = ua.includes('ipad') ? 'tablet' : 'mobile';
    }
    else if (ua.includes('android')) {
        platform = 'android';
        deviceType = ua.includes('tablet') || ua.includes('sm-t') ? 'tablet' : 'mobile';
    }
    else if (ua.includes('macintosh') || ua.includes('mac os')) {
        platform = 'macos';
        deviceType = 'desktop';
    }
    else if (ua.includes('windows')) {
        platform = 'windows';
        deviceType = 'desktop';
    }
    else if (ua.includes('mobile')) {
        deviceType = 'mobile';
        platform = 'web';
    }
    return { deviceType, platform };
}
/**
 * Generate insights from device context
 */
function generateDeviceInsight(context, hour) {
    const insights = [];
    // Late night mobile - likely in bed
    if (context.deviceType === 'mobile' && (hour >= 22 || hour < 5)) {
        insights.push({
            type: 'awareness',
            message: `User is on mobile late at night (${hour >= 22 ? 'after 10pm' : 'early morning'}). They may be in bed, unable to sleep. Keep responses short and soothing.`,
            priority: 'normal',
        });
    }
    // In motion - walking or driving
    if (context.inMotion) {
        insights.push({
            type: 'adaptation',
            message: 'User appears to be in motion (walking/commuting). Keep responses brief and conversational. Avoid suggesting actions that require hands.',
            priority: 'high',
        });
    }
    // No headphones + mobile = potential privacy concern
    if (context.deviceType === 'mobile' && context.hasHeadphones === false) {
        insights.push({
            type: 'awareness',
            message: 'User is on mobile without headphones - someone nearby might hear. Be mindful of sensitive topics.',
            priority: 'normal',
        });
    }
    // Privacy mode explicit
    if (context.privacyMode) {
        insights.push({
            type: 'adaptation',
            message: 'User has indicated privacy mode - someone else may be present. Keep responses appropriate for others to hear.',
            priority: 'high',
        });
    }
    // Low battery
    if (context.batteryLevel !== undefined && context.batteryLevel < 15) {
        insights.push({
            type: 'awareness',
            message: `User's battery is low (${context.batteryLevel}%). Keep this conversation focused in case they need to go.`,
            priority: 'low',
        });
    }
    // Poor connection
    if (context.connectionQuality === 'poor') {
        insights.push({
            type: 'adaptation',
            message: 'Connection quality is poor. Keep responses shorter to avoid audio issues.',
            priority: 'normal',
        });
    }
    // High screen time
    if (context.screenTimeToday && context.screenTimeToday > 360) {
        // 6+ hours
        insights.push({
            type: 'suggestion',
            message: `User has had ${Math.round(context.screenTimeToday / 60)} hours of screen time today. If appropriate, gently encourage a screen break.`,
            priority: 'low',
        });
    }
    // Return highest priority insight
    insights.sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    return insights[0] || null;
}
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
/**
 * Device Awareness Context Builder
 *
 * Priority: 30 (early, before emotional context, to influence response approach)
 */
export const deviceAwarenessBuilder = {
    name: 'device-awareness',
    description: 'Adapts responses based on device type, motion, headphones, and privacy context',
    priority: 30,
    category: BuilderCategory.EXTERNAL,
    build: async (input) => {
        const { services, userData } = input;
        const sessionId = services?.sessionId;
        if (!sessionId)
            return [];
        const injections = [];
        // Get device context
        let context = getDeviceContext(sessionId);
        // If no context from data channel, try to infer from connection metadata
        const userAgent = userData?.userAgent;
        if (!context && userAgent) {
            const inferred = inferDeviceFromUserAgent(userAgent);
            context = {
                ...inferred,
                timestamp: Date.now(),
            };
        }
        if (!context)
            return [];
        // Check cooldown
        const lastInjection = lastInjectionTime.get(sessionId) || 0;
        if (Date.now() - lastInjection < INJECTION_COOLDOWN_MS) {
            return [];
        }
        // Get current hour for time-based insights
        const now = new Date();
        const hour = now.getHours();
        // Generate insight
        const insight = generateDeviceInsight(context, hour);
        if (insight) {
            if (insight.priority === 'high') {
                injections.push(createHighInjection('device_awareness', insight.message, {
                    category: 'device-context',
                }));
            }
            else {
                injections.push(createStandardInjection('device_awareness', insight.message, {
                    category: 'device-context',
                }));
            }
            lastInjectionTime.set(sessionId, Date.now());
            log.debug({
                sessionId,
                deviceType: context.deviceType,
                insightType: insight.type,
            }, 'Device insight injected');
        }
        // Always inject basic device type for response length adaptation (lower priority)
        if (context.deviceType === 'mobile' && !insight) {
            injections.push(createHintInjection('device_type', '[DEVICE: User is on mobile. Prefer concise responses unless they ask for detail.]', {
                category: 'device-context',
            }));
        }
        return injections;
    },
};
// Register the builder
registerContextBuilder(deviceAwarenessBuilder);
//# sourceMappingURL=device-awareness.js.map