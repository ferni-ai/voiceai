/**
 * Permission Prompts for Depth
 *
 * > "Ask before going deep. This feels respectful, not tracked."
 *
 * Provides natural ways to ask permission before surfacing deeper
 * insights, patterns, or challenges.
 *
 * Philosophy:
 * - Asking permission is a sign of respect
 * - It transforms "showing off" into "offering"
 * - It gives them agency over the depth of the conversation
 * - It makes challenging feel like an invitation, not an attack
 *
 * @module services/revelation-moments/permission-prompts
 */
import type { PermissionCategory, PermissionPrompt, CapabilityCategory } from './types.js';
/**
 * All permission prompts organized by category
 */
export declare const PERMISSION_PROMPTS: PermissionPrompt[];
/**
 * Get a random permission prompt for a category
 */
export declare function getPermissionPrompt(category: PermissionCategory): string;
/**
 * Get permission prompt for a capability, respecting trust level
 */
export declare function getPromptForCapability(capability: CapabilityCategory, trustLevel?: number): string | null;
/**
 * Check if a capability requires permission at current trust level
 */
export declare function requiresPermission(capability: CapabilityCategory, trustLevel?: number): boolean;
/**
 * Generate permission guidance for context injection
 */
export declare function getPermissionGuidance(availableCapabilities: CapabilityCategory[], trustLevel: number): string | null;
/**
 * Templates for what to say after they grant permission
 */
export declare const PERMISSION_GRANTED_RESPONSES: Record<PermissionCategory, string[]>;
/**
 * Templates for what to say if they decline permission
 */
export declare const PERMISSION_DECLINED_RESPONSES: string[];
/**
 * Get a response after permission is granted
 */
export declare function getPermissionGrantedResponse(category: PermissionCategory): string;
/**
 * Get a response if permission is declined
 */
export declare function getPermissionDeclinedResponse(): string;
//# sourceMappingURL=permission-prompts.d.ts.map