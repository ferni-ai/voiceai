/**
 * Call Script Templates
 *
 * Domain-specific conversation scripts for outbound calls on behalf of users.
 * Each script provides guidance, guardrails, and objectives for the agent.
 *
 * @module tools/domains/telephony/scripts
 */

import { healthcareScript } from './healthcare.js';
import { restaurantScript } from './restaurant.js';
import { businessScript } from './business.js';
import { personalScript } from './personal.js';
import type { CallScriptTemplate, CallObjective, ResolvedContact } from '../types.js';

// ============================================================================
// SCRIPT SELECTION
// ============================================================================

export type ScriptType = 'healthcare' | 'restaurant' | 'business' | 'personal';

/**
 * Select the appropriate script based on contact and purpose
 */
export function selectScript(
  contact: ResolvedContact,
  purpose: string
): { script: CallScriptTemplate; type: ScriptType } {
  const relationship = (contact.relationship || '').toLowerCase();
  const purposeLower = purpose.toLowerCase();

  // Healthcare detection
  const healthcareKeywords = [
    'doctor',
    'dr.',
    'physician',
    'dentist',
    'therapist',
    'psychiatrist',
    'psychologist',
    'pharmacy',
    'pharmacist',
    'clinic',
    'hospital',
    'medical',
    'healthcare',
    'nurse',
    'specialist',
  ];

  if (healthcareKeywords.some((kw) => relationship.includes(kw))) {
    return { script: healthcareScript, type: 'healthcare' };
  }

  // Restaurant detection
  const restaurantKeywords = [
    'restaurant',
    'cafe',
    'diner',
    'bistro',
    'eatery',
    'pizzeria',
    'steakhouse',
    'sushi',
    'bar',
    'grill',
    'kitchen',
    'food',
  ];

  if (
    restaurantKeywords.some((kw) => relationship.includes(kw)) ||
    purposeLower.includes('reservation') ||
    purposeLower.includes('table') ||
    purposeLower.includes('takeout') ||
    purposeLower.includes('order')
  ) {
    return { script: restaurantScript, type: 'restaurant' };
  }

  // Personal relationship detection
  const personalKeywords = [
    'mom',
    'mother',
    'dad',
    'father',
    'parent',
    'grandma',
    'grandmother',
    'grandpa',
    'grandfather',
    'sister',
    'brother',
    'wife',
    'husband',
    'partner',
    'spouse',
    'son',
    'daughter',
    'friend',
    'family',
    'relative',
  ];

  if (personalKeywords.some((kw) => relationship.includes(kw))) {
    return { script: personalScript, type: 'personal' };
  }

  // Default to business script
  return { script: businessScript, type: 'business' };
}

/**
 * Build a complete script with placeholders filled in
 */
export function buildCallScript(
  template: CallScriptTemplate,
  params: {
    agentName: string;
    userName: string;
    contactName: string;
    purpose: string;
    objective: CallObjective;
    additionalContext?: string;
    preferredTimes?: string[];
  }
): string {
  const {
    agentName,
    userName,
    contactName,
    purpose,
    objective,
    additionalContext,
    preferredTimes,
  } = params;

  const parts: string[] = [];

  // -------------------------------------------------------------------------
  // Opening
  // -------------------------------------------------------------------------
  parts.push('## CALL SCRIPT\n');
  parts.push(`You are ${agentName}, calling ${contactName} on behalf of ${userName}.\n`);

  // -------------------------------------------------------------------------
  // Introduction Template
  // -------------------------------------------------------------------------
  parts.push('### Opening');
  parts.push(
    template.greeting
      .replace('{agentName}', agentName)
      .replace('{userName}', userName)
      .replace('{contactName}', contactName)
  );
  parts.push(
    template.identityDisclosure.replace('{agentName}', agentName).replace('{userName}', userName)
  );

  // Recording consent if applicable
  if (template.recordingConsentScript) {
    parts.push('\n### Recording Consent');
    parts.push(template.recordingConsentScript);
  }

  // HIPAA note if applicable
  if (template.hipaaNote) {
    parts.push('\n### Healthcare Privacy');
    parts.push(template.hipaaNote.replace('{userName}', userName));
  }

  // -------------------------------------------------------------------------
  // Objective
  // -------------------------------------------------------------------------
  parts.push('\n### Your Objective');
  const objectiveText = template.objectives[objective] || template.objectives['general'] || purpose;
  parts.push(
    objectiveText
      .replace('{userName}', userName)
      .replace('{details}', purpose)
      .replace('{contactName}', contactName)
  );

  // Additional context
  if (additionalContext) {
    parts.push('\n### Additional Context');
    parts.push(additionalContext);
  }

  // Preferred times
  if (preferredTimes && preferredTimes.length > 0) {
    parts.push('\n### Time Preferences');
    parts.push(`${userName}'s preferred times: ${preferredTimes.join(', ')}`);
  }

  // -------------------------------------------------------------------------
  // Guardrails
  // -------------------------------------------------------------------------
  parts.push('\n### Information to Gather');
  template.informationToGather.forEach((item) => {
    parts.push(`- ${item}`);
  });

  parts.push('\n### You MUST Confirm');
  template.mustConfirm.forEach((item) => {
    parts.push(`- ${item}`);
  });

  parts.push('\n### You MUST NOT');
  template.mustNotDo.forEach((item) => {
    parts.push(`- ${item}`);
  });

  // -------------------------------------------------------------------------
  // Closing
  // -------------------------------------------------------------------------
  parts.push('\n### Closing the Call');
  parts.push('- Thank them for their time');
  parts.push('- Confirm any next steps or action items');
  parts.push(`- Mention you'll let ${userName} know how the call went`);

  return parts.join('\n');
}

/**
 * Generate a human-readable summary of what the script covers
 */
export function getScriptSummary(type: ScriptType): string {
  switch (type) {
    case 'healthcare':
      return 'Healthcare call script with HIPAA awareness and appointment handling';
    case 'restaurant':
      return 'Restaurant script for reservations, orders, and inquiries';
    case 'business':
      return 'General business script for professional interactions';
    case 'personal':
      return 'Personal call script for warm, friendly conversations';
    default:
      return 'General call script';
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { healthcareScript, restaurantScript, businessScript, personalScript };

export type { CallScriptTemplate };
