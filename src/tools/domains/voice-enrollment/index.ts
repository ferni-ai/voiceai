/**
 * Voice Enrollment Domain Tools
 *
 * Tools for voice enrollment and speaker recognition.
 * Includes phone-based enrollment for sponsored identities.
 *
 * @module tools/domains/voice-enrollment
 */

import type { ToolDefinition } from '../../registry/types.js';
import { getToolDefinitions as getPhoneEnrollmentTools } from './phone-enrollment-tool.js';
import { getToolDefinitions as getSelfRegistrationTools } from './self-registration-tool.js';

/**
 * Get all voice enrollment tool definitions.
 */
export function getToolDefinitions(): ToolDefinition[] {
  return [...getPhoneEnrollmentTools(), ...getSelfRegistrationTools()];
}

export const definitions = getToolDefinitions();

// Re-export individual modules
export * from './phone-enrollment-tool.js';
export * from './self-registration-tool.js';
