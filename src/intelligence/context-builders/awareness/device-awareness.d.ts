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
import { type ContextBuilder } from '../index.js';
export interface DeviceContext {
    /** Device type */
    deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown';
    /** Platform */
    platform: 'ios' | 'android' | 'web' | 'macos' | 'windows' | 'unknown';
    /** Whether headphones are connected */
    hasHeadphones?: boolean;
    /** Screen orientation */
    orientation?: 'portrait' | 'landscape';
    /** Whether in motion (accelerometer) */
    inMotion?: boolean;
    /** Battery level (0-100) */
    batteryLevel?: number;
    /** Low power mode active */
    lowPowerMode?: boolean;
    /** Screen time today (minutes) */
    screenTimeToday?: number;
    /** App in foreground duration (seconds) */
    appForegroundDuration?: number;
    /** Privacy mode (someone might be nearby) */
    privacyMode?: boolean;
    /** Connection quality */
    connectionQuality?: 'excellent' | 'good' | 'poor';
    /** Timestamp of context */
    timestamp: number;
}
export interface DeviceAwarenessPayload {
    type: 'device_context';
    payload: Partial<DeviceContext>;
    timestamp: number;
}
/**
 * Update device context from data channel message
 */
export declare function updateDeviceContext(sessionId: string, payload: Partial<DeviceContext>): void;
/**
 * Get device context for session
 */
export declare function getDeviceContext(sessionId: string): DeviceContext | null;
/**
 * Clear device context on session end
 */
export declare function clearDeviceContext(sessionId: string): void;
/**
 * Infer device type from user agent or connection metadata
 */
export declare function inferDeviceFromUserAgent(userAgent?: string): Partial<DeviceContext>;
/**
 * Device Awareness Context Builder
 *
 * Priority: 30 (early, before emotional context, to influence response approach)
 */
export declare const deviceAwarenessBuilder: ContextBuilder;
//# sourceMappingURL=device-awareness.d.ts.map