/**
 * Voice Enrollment Domain Tools
 *
 * Tools for voice enrollment and speaker recognition.
 * Includes phone-based enrollment for sponsored identities.
 *
 * @module tools/domains/voice-enrollment
 */

import { createDomainExport } from '../../registry/loader.js';
import { getToolDefinitions as getPhoneEnrollmentTools } from './phone-enrollment-tool.js';
import { getToolDefinitions as getSelfRegistrationTools } from './self-registration-tool.js';

const allDefs = [...getPhoneEnrollmentTools(), ...getSelfRegistrationTools()];

export const { getToolDefinitions, domain, definitions } = createDomainExport('voice-enrollment', allDefs);

// Re-export individual modules for backward compatibility
export * from './phone-enrollment-tool.js';
export * from './self-registration-tool.js';
