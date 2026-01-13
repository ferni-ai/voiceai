/**
 * Voice Enrollment Domain Tools
 *
 * Tools for voice enrollment and speaker recognition.
 * Includes phone-based enrollment for sponsored identities.
 *
 * @module tools/domains/voice-enrollment
 */
import type { ToolDefinition } from '../../registry/types.js';
/**
 * Get all voice enrollment tool definitions.
 */
export declare function getToolDefinitions(): ToolDefinition[];
export declare const definitions: ToolDefinition[];
export * from './phone-enrollment-tool.js';
export * from './self-registration-tool.js';
//# sourceMappingURL=index.d.ts.map