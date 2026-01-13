/**
 * Phone Voice Enrollment Tool
 *
 * Enables Ferni to offer and complete voice enrollment for callers
 * during phone conversations. This is especially useful for sponsored
 * identities (family members) who may not use the web app.
 *
 * Usage:
 * - Ferni offers voice enrollment to known callers who aren't enrolled
 * - Collects 3 voice samples during natural conversation
 * - Creates voice profile linked to sponsored identity
 *
 * @module tools/domains/voice-enrollment/phone-enrollment-tool
 */
import type { ToolDefinition } from '../../registry/types.js';
export declare function getToolDefinitions(): ToolDefinition[];
export declare const definitions: ToolDefinition[];
//# sourceMappingURL=phone-enrollment-tool.d.ts.map