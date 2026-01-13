/**
 * Digital Twin Profile Context Builder
 *
 * Injects the user's Digital Twin profile into conversation context,
 * enabling the AI to speak and respond in ways that feel genuinely
 * like the user.
 *
 * @module intelligence/context-builders/twin-profile-context
 */
import { type ContextBuilder } from '../index.js';
/**
 * Build the complete Digital Twin context for AI injection
 */
export declare function buildTwinProfileContext(userId: string): Promise<string | null>;
/**
 * Get a short summary for greeting personalization
 */
export declare function getTwinGreetingSummary(userId: string): Promise<{
    greeting?: string;
    name?: string;
    interests?: string[];
} | null>;
/**
 * Clear the cache for a user (call after profile update)
 */
export declare function clearTwinProfileCache(userId: string): void;
/**
 * Clear entire cache (useful for testing)
 */
export declare function clearAllTwinProfileCache(): void;
/**
 * Digital Twin Profile Context Builder
 *
 * Injects the user's Digital Twin profile into every conversation turn,
 * enabling highly personalized responses based on their:
 * - Life story and key relationships
 * - Communication style preferences
 * - Signature phrases and mannerisms
 * - Core values and interests
 */
export declare const twinProfileContextBuilder: ContextBuilder;
//# sourceMappingURL=twin-profile-context.d.ts.map