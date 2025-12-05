/**
 * Wellness Domain Tools
 *
 * Tools for health, wellness, and emotional support.
 * This domain wraps existing tools in registry-compatible definitions.
 *
 * DOMAIN: wellness
 * TOOLS:
 *   Emotional: addressFinancialAnxiety, provideEncouragement, checkInOnWellbeing
 *   Mindset: reframeMoneyBelief, practiceGratitude
 *   Medications: addMedication, takeMedication, getMedicationSchedule
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext } from '../../registry/types.js';

// Import legacy tool creators
import { createWellnessTools } from '../../wellness.js';
import { createMedicationTools } from '../../medications.js';

// ============================================================================
// LEGACY TOOL WRAPPER
// ============================================================================

function wrapLegacyTool(
  id: string,
  name: string,
  description: string,
  legacyTool: unknown,
  tags?: string[]
): ToolDefinition {
  return {
    id,
    name,
    description,
    domain: 'wellness',
    tags: ['wellness', ...(tags || [])],
    create: (_ctx: ToolContext) => legacyTool,
  };
}

// ============================================================================
// EMOTIONAL WELLNESS TOOLS (Consolidated: 5 → 2 tools)
// ============================================================================

function getEmotionalWellnessToolDefinitions(): ToolDefinition[] {
  const legacyTools = createWellnessTools();

  return [
    wrapLegacyTool(
      'emotionalSupport',
      'Emotional Support',
      'Provide compassionate support for difficult emotions. Handles: anxiety (especially financial), stress, overwhelm, discouragement. Also does wellbeing check-ins, encouragement, and guided gratitude practice. Modes: "support" (listen and validate), "checkin" (how are you really?), or "gratitude" (guided appreciation).',
      legacyTools.addressFinancialAnxiety,
      ['emotional', 'anxiety', 'support', 'checkin', 'gratitude', 'encouragement']
    ),
    wrapLegacyTool(
      'reframeBelief',
      'Reframe Belief',
      'Help reframe unhelpful beliefs into healthier perspectives. Works for: money beliefs, self-worth, scarcity mindset, imposter syndrome, perfectionism. Uses cognitive reframing techniques to shift perspective without dismissing feelings.',
      legacyTools.reframeMoneyBelief,
      ['emotional', 'mindset', 'beliefs', 'reframe', 'cognitive']
    ),
  ];
}

// ============================================================================
// MEDICATION TOOLS (Consolidated: 8 → 2 tools)
// ============================================================================

function getMedicationToolDefinitions(): ToolDefinition[] {
  const legacyTools = createMedicationTools();

  return [
    wrapLegacyTool(
      'manageMedication',
      'Manage Medication',
      'Track medications: add new, log doses taken/skipped, update pill count, or stop tracking. Actions: "add" (new medication with dosage/schedule), "take" (log dose taken), "skip" (log skipped dose), "update" (pill count), or "stop" (remove from tracking). Includes refill reminders.',
      legacyTools.addMedication,
      ['medications', 'add', 'take', 'skip', 'tracking', 'refill']
    ),
    wrapLegacyTool(
      'medicationSchedule',
      'Medication Schedule',
      'View medication schedule and adherence. Modes: "today" (what\'s due now), "all" (list all medications), or "checkin" (adherence summary with missed doses and refill alerts). Supports daily reminders and tracking patterns.',
      legacyTools.getMedicationSchedule,
      ['medications', 'schedule', 'today', 'list', 'checkin', 'adherence']
    ),
  ];
}

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const wellnessTools: ToolDefinition[] = [
  ...getEmotionalWellnessToolDefinitions(),
  ...getMedicationToolDefinitions(),
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'wellness',
  wellnessTools
);

export { getEmotionalWellnessToolDefinitions, getMedicationToolDefinitions };

export default getToolDefinitions;

