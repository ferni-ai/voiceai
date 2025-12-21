/**
 * Superhuman Services - Better Than Human Capabilities
 *
 * These services implement capabilities that make Ferni genuinely
 * better than human support - not through artificial intelligence,
 * but through perfect memory, constant presence, and pattern recognition
 * that humans simply cannot match.
 *
 * @module services/superhuman
 */

// ============================================================================
// IMPORTS FOR INTERNAL USE
// ============================================================================

import { buildCommitmentContext, detectCommitment } from './commitment-keeper.js';

import { buildPredictiveContextString } from './predictive-coaching.js';

import { buildNarrativeContextString } from './life-narrative.js';

import { buildValuesContext } from './values-alignment.js';

import { buildFirstAidContext, detectCrisis, type CrisisSignal } from './emotional-first-aid.js';

import { buildNetworkContext } from './relationship-network.js';

import { buildCapacityContext } from './capacity-guardian.js';

import { buildDreamContext } from './dream-keeper.js';

import { buildMilestoneContext } from './relationship-milestones.js';

import { buildSeasonalContext } from './seasonal-awareness.js';

// ============================================================================
// RE-EXPORTS
// ============================================================================

// Commitment Keeper
export {
  commitmentKeeper,
  detectCommitment,
  saveCommitment,
  loadUserCommitments,
  updateCommitmentStatus,
  getFollowUpsForUser,
  buildCommitmentContext,
  type Commitment,
  type CommitmentType,
  type CommitmentStatus,
  type CommitmentFollowUp,
} from './commitment-keeper.js';

// Predictive Coaching
export {
  predictiveCoaching,
  recordObservation,
  loadUserPatterns,
  generatePredictions,
  getDayPatterns,
  buildPredictiveContextString,
  type PatternObservation,
  type Prediction,
  type DayPattern,
} from './predictive-coaching.js';

// Life Narrative
export {
  lifeNarrative,
  detectChapterMoment,
  loadUserChapters,
  createOrUpdateChapter,
  loadIdentity,
  recordIdentityShift,
  identifyNarrativeArc,
  buildNarrativeContextString,
  type LifeChapter,
  type ChapterType,
  type NarrativeArc,
  type IdentityEvolution,
} from './life-narrative.js';

// Values Alignment
export {
  valuesAlignment,
  detectValue,
  detectConflict,
  loadUserValues,
  recordValueMention,
  recordConflict,
  buildValuesContext,
  type UserValue,
  type ValueCategory,
  type ValueConflict,
} from './values-alignment.js';

// Emotional First Aid
export {
  emotionalFirstAid,
  detectCrisis,
  detectCrisisFromVoice,
  getFirstAidResponse,
  getVoiceInstructions,
  buildFirstAidContext,
  type CrisisLevel,
  type CrisisSignal,
  type FirstAidResponse,
  type GroundingTechnique,
} from './emotional-first-aid.js';

// Relationship Network
export {
  relationshipNetwork,
  extractPerson,
  analyzeSentiment,
  loadNetwork,
  recordMention,
  findConnectionOpportunities,
  buildNetworkContext,
  type RelationshipPerson,
  type RelationshipType,
  type RelationshipSentiment,
  type ConnectionOpportunity,
} from './relationship-network.js';

// Capacity Guardian
export {
  capacityGuardian,
  detectEnergyLevel,
  detectOvercommitment,
  recordEnergyReading,
  loadEnergyHistory,
  assessBurnoutRisk,
  buildCapacityContext,
  type EnergyLevel,
  type EnergyReading,
  type BurnoutRisk,
  type BurnoutAssessment,
} from './capacity-guardian.js';

// Dream Keeper
export {
  dreamKeeper,
  detectDream,
  loadUserDreams,
  recordDreamMention,
  findDormantDreams,
  buildDreamContext,
  type Dream,
  type DreamType,
  type DreamStatus,
  type DreamReminder,
} from './dream-keeper.js';

// Relationship Milestones
export {
  relationshipMilestones,
  checkAndRecordMilestones,
  recordSpecialMilestone,
  acknowledgeMilestone,
  buildRelationshipSummary,
  buildMilestoneContext,
  type RelationshipMilestone,
  type MilestoneType,
  type RelationshipSummary,
} from './relationship-milestones.js';

// Seasonal Awareness
export {
  seasonalAwareness,
  getCurrentSeason,
  getDaysUntilSeasonChange,
  detectSeasonalPattern,
  loadSeasonalObservations,
  loadPersonalDates,
  recordSeasonalObservation,
  recordPersonalDate,
  findUpcomingDates,
  buildSeasonalContext,
  type Season,
  type SeasonalPattern,
  type SeasonalObservation,
  type PersonalDate,
} from './seasonal-awareness.js';

// Jordan ↔ Alex Coordinator (Cross-Persona)
export {
  findOptimalMilestoneWindows,
  suggestTimeBlocks,
  detectMilestoneConflicts,
  getCapacityForNewMilestone,
  getCoordinationContext,
  type TimeWindow,
  type MilestoneConflict,
  type CapacityAssessment,
  type MilestoneTimeBlock,
  type SimpleMilestone,
} from './jordan-alex-coordinator.js';

// ============================================================================
// UNIFIED CONTEXT BUILDER
// ============================================================================

export interface SuperhumanContext {
  commitments: string;
  predictions: string;
  narrative: string;
  values: string;
  crisis: string | null;
  network: string;
  capacity: string;
  dreams: string;
  milestones: string;
  seasonal: string;
}

/**
 * Build complete superhuman context for a user.
 * Use this in the main context builder to inject all capabilities.
 */
export async function buildSuperhumanContext(
  userId: string,
  options?: {
    crisisSignal?: { type: 'text' | 'voice'; signal: string };
    relationshipStats?: {
      totalConversations: number;
      firstConversation: number;
      lastConversation: number;
      vulnerableMoments?: number;
      breakthroughs?: number;
    };
  }
): Promise<SuperhumanContext> {
  const { crisisSignal, relationshipStats } = options || {};

  // Build all contexts in parallel
  const [
    commitments,
    predictions,
    narrative,
    values,
    network,
    capacity,
    dreams,
    milestones,
    seasonal,
  ] = await Promise.all([
    buildCommitmentContext(userId),
    buildPredictiveContextString(userId),
    buildNarrativeContextString(userId),
    buildValuesContext(userId),
    buildNetworkContext(userId),
    buildCapacityContext(userId),
    buildDreamContext(userId),
    relationshipStats ? buildMilestoneContext(userId, relationshipStats) : Promise.resolve(''),
    buildSeasonalContext(userId),
  ]);

  // Check for crisis (from passed signal or detect from context)
  let crisis: string | null = null;
  if (crisisSignal) {
    const detected = detectCrisis(crisisSignal.signal);
    if (detected) {
      crisis = buildFirstAidContext(detected);
    }
  }

  return {
    commitments,
    predictions,
    narrative,
    values,
    crisis,
    network,
    capacity,
    dreams,
    milestones,
    seasonal,
  };
}

/**
 * Format superhuman context for LLM injection.
 * Prioritizes crisis context if present.
 */
export function formatSuperhumanContextForPrompt(context: SuperhumanContext): string {
  const sections: string[] = [];

  // Crisis takes priority
  if (context.crisis) {
    sections.push(context.crisis);
    sections.push('\n---\n');
  }

  // Core superhuman capabilities
  const capabilities = [
    context.commitments,
    context.predictions,
    context.narrative,
    context.values,
    context.capacity,
    context.dreams,
    context.network,
    context.seasonal,
    context.milestones,
  ].filter((c) => c && c.length > 0);

  if (capabilities.length > 0) {
    sections.push('[SUPERHUMAN CAPABILITIES ACTIVE]');
    sections.push('You have access to capabilities no human friend has.');
    sections.push('Use them wisely. Be magical, not mechanical.\n');
    sections.push(...capabilities);
  }

  return sections.join('\n');
}
