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
// EMOTIONAL WELLNESS TOOLS
// ============================================================================

function getEmotionalWellnessToolDefinitions(): ToolDefinition[] {
  const legacyTools = createWellnessTools();

  return [
    wrapLegacyTool(
      'addressFinancialAnxiety',
      'Address Financial Anxiety',
      'Provide compassionate support for financial anxiety and stress',
      legacyTools.addressFinancialAnxiety,
      ['emotional', 'anxiety', 'support']
    ),
    wrapLegacyTool(
      'provideEncouragement',
      'Provide Encouragement',
      'Offer genuine encouragement and positive reinforcement',
      legacyTools.provideEncouragement,
      ['emotional', 'encouragement', 'motivation']
    ),
    wrapLegacyTool(
      'reframeMoneyBelief',
      'Reframe Money Belief',
      'Help reframe unhelpful beliefs about money into healthier perspectives',
      legacyTools.reframeMoneyBelief,
      ['emotional', 'mindset', 'beliefs']
    ),
    wrapLegacyTool(
      'checkInOnWellbeing',
      'Check In On Wellbeing',
      'Do a gentle check-in on the user\'s overall wellbeing',
      legacyTools.checkInOnWellbeing,
      ['emotional', 'checkin', 'support']
    ),
    wrapLegacyTool(
      'practiceGratitude',
      'Practice Gratitude',
      'Guide a brief gratitude practice to shift perspective',
      legacyTools.practiceGratitude,
      ['emotional', 'gratitude', 'mindfulness']
    ),
  ];
}

// ============================================================================
// MEDICATION TOOLS
// ============================================================================

function getMedicationToolDefinitions(): ToolDefinition[] {
  const legacyTools = createMedicationTools();

  return [
    wrapLegacyTool(
      'addMedication',
      'Add Medication',
      'Add a medication to track with dosage and schedule',
      legacyTools.addMedication,
      ['medications', 'add', 'tracking']
    ),
    wrapLegacyTool(
      'takeMedication',
      'Take Medication',
      'Log taking a medication dose',
      legacyTools.takeMedication,
      ['medications', 'log', 'tracking']
    ),
    wrapLegacyTool(
      'skipMedication',
      'Skip Medication',
      'Log that a medication dose was skipped',
      legacyTools.skipMedication,
      ['medications', 'skip', 'tracking']
    ),
    wrapLegacyTool(
      'getMedicationSchedule',
      'Get Medication Schedule',
      'Get today\'s medication schedule with what\'s due',
      legacyTools.getMedicationSchedule,
      ['medications', 'schedule', 'today']
    ),
    wrapLegacyTool(
      'getAllMedications',
      'Get All Medications',
      'List all medications being tracked',
      legacyTools.getAllMedications,
      ['medications', 'list', 'all']
    ),
    wrapLegacyTool(
      'updatePillCount',
      'Update Pill Count',
      'Update the remaining pill count for a medication',
      legacyTools.updatePillCount,
      ['medications', 'refill', 'inventory']
    ),
    wrapLegacyTool(
      'stopMedication',
      'Stop Medication',
      'Stop tracking a medication',
      legacyTools.stopMedication,
      ['medications', 'stop', 'remove']
    ),
    wrapLegacyTool(
      'medicationCheckIn',
      'Medication Check-In',
      'Get a summary of medication adherence and reminders',
      legacyTools.medicationCheckIn,
      ['medications', 'checkin', 'summary']
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

