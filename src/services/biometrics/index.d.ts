/**
 * Biometrics Service
 *
 * Integrates with wearable health platforms (Apple HealthKit, Google Fit, Oura, Whoop)
 * to provide superhuman awareness of user's physical state.
 *
 * "Better than Human" Capabilities:
 * - Real-time stress detection from HRV
 * - Sleep quality awareness affecting conversation tone
 * - Activity level correlation with mood
 * - Recovery score integration for gentle/energetic approach
 *
 * @see ./types.ts - Type definitions
 * @see ./token-persistence.ts - Token storage
 * @see ./insights.ts - Insight generation
 * @module services/biometrics
 */
export * from './token-persistence.js';
export { generateBiometricInsight as generateInsight, generateSuperhumanMoment as generateSuperhumanMomentFromSnapshot, } from './insights.js';
export type { ActivityData, BiometricEvent, BiometricInsight, BiometricPlatform, BiometricSnapshot, ConversationAwareness, HRVData, RecoveryData, SleepData, StressLevel, } from './types.js';
import type { BiometricEvent, BiometricInsight, BiometricPlatform, BiometricSnapshot, HRVData, RecoveryData, SleepData, StressLevel } from './types.js';
/**
 * Get OAuth authorization URL for a biometric platform
 */
export declare function getAuthorizationUrl(platform: BiometricPlatform, userId: string, scopes?: string[]): string;
/**
 * Generate a Terra authentication session.
 * This creates a widget session URL that allows users to connect 300+ wearables
 * including Apple Health, Fitbit, Garmin, Samsung Health, and more.
 *
 * @see https://docs.tryterra.co/reference/generate-authentication-url
 */
export declare function generateTerraSession(userId: string, options?: {
    /** Specific providers to show (e.g., ['APPLE', 'FITBIT', 'GARMIN']) */
    providers?: string[];
    /** Language for widget (e.g., 'en', 'es', 'fr') */
    language?: string;
    /** Custom redirect URL after authentication */
    redirectUrl?: string;
}): Promise<{
    success: true;
    url: string;
    sessionId: string;
    expiresAt: Date;
} | {
    success: false;
    error: string;
}>;
/**
 * Handle Terra webhook callback.
 * Terra sends user data via webhooks after successful authentication.
 *
 * @see https://docs.tryterra.co/reference/webhooks
 */
export declare function handleTerraWebhook(webhookBody: unknown, signature?: string): Promise<{
    success: boolean;
    userId?: string;
    error?: string;
}>;
/**
 * Exchange authorization code for tokens
 */
export declare function exchangeCodeForTokens(platform: BiometricPlatform, code: string, userId: string): Promise<boolean>;
/**
 * Sync latest biometric data from connected platform
 */
export declare function syncBiometrics(userId: string): Promise<BiometricSnapshot | null>;
/**
 * Get current biometric snapshot for user
 */
export declare function getCurrentBiometrics(userId: string): BiometricSnapshot | null;
/**
 * Get current stress level
 */
export declare function getStressLevel(userId: string): StressLevel;
/**
 * Get current HRV data
 */
export declare function getCurrentHRV(userId: string): HRVData | null;
/**
 * Get today's sleep quality
 */
export declare function getSleepQuality(userId: string): SleepData | null;
/**
 * Get current recovery status
 */
export declare function getRecoveryStatus(userId: string): RecoveryData | null;
/**
 * Subscribe to real-time biometric events
 */
export declare function subscribeToEvents(userId: string, callback: (event: BiometricEvent) => void): () => void;
/**
 * Check if user has biometrics connected
 */
export declare function hasBiometricsConnected(userId: string): boolean;
/**
 * Check if user has biometrics connected (async - checks persistence)
 */
export declare function hasBiometricsConnectedAsync(userId: string): Promise<boolean>;
/**
 * Get connected platform
 */
export declare function getConnectedPlatform(userId: string): BiometricPlatform | null;
/**
 * Get connected platform (async - checks persistence)
 */
export declare function getConnectedPlatformAsync(userId: string): Promise<BiometricPlatform | null>;
/**
 * Disconnect biometrics
 */
export declare function disconnectBiometrics(userId: string): void;
/**
 * Generate insight for context injection
 * "Better than Human" - notice what humans wouldn't
 */
export declare function generateBiometricInsight(userId: string): BiometricInsight | null;
/**
 * Generate superhuman moment - something no human friend would notice
 */
export declare function generateSuperhumanMoment(userId: string): string | null;
declare const _default: {
    getAuthorizationUrl: typeof getAuthorizationUrl;
    exchangeCodeForTokens: typeof exchangeCodeForTokens;
    syncBiometrics: typeof syncBiometrics;
    getCurrentBiometrics: typeof getCurrentBiometrics;
    getStressLevel: typeof getStressLevel;
    getCurrentHRV: typeof getCurrentHRV;
    getSleepQuality: typeof getSleepQuality;
    getRecoveryStatus: typeof getRecoveryStatus;
    subscribeToEvents: typeof subscribeToEvents;
    hasBiometricsConnected: typeof hasBiometricsConnected;
    hasBiometricsConnectedAsync: typeof hasBiometricsConnectedAsync;
    getConnectedPlatform: typeof getConnectedPlatform;
    getConnectedPlatformAsync: typeof getConnectedPlatformAsync;
    disconnectBiometrics: typeof disconnectBiometrics;
    generateBiometricInsight: typeof generateBiometricInsight;
    generateSuperhumanMoment: typeof generateSuperhumanMoment;
};
export default _default;
//# sourceMappingURL=index.d.ts.map