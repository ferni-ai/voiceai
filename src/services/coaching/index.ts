/**
 * Coaching Services Module
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Structured coaching capabilities for Ferni:
 * - Goal tracking and accountability
 * - Action planning
 * - Obstacle detection and support
 * - Journey reflection and progress visualization
 *
 * Philosophy: Great coaching helps people see what they can't see
 * in themselves and supports them in becoming who they want to be.
 *
 * @module Coaching
 */

// ============================================================================
// GOAL TRACKING
// ============================================================================

export {
  abandonGoal,
  addMilestone,
  buildGoalContext,
  completeMilestone,
  createGoal,
  detectGoalStatement,
  exportGoalProfile,
  generateGoalCheckIn,
  getActiveGoals,
  getGoal,
  getGoalsNeedingCheckIn,
  getGoalStats,
  getGoalToCheckIn,
  getRecentProgress,
  importGoalProfile,
  pauseGoal,
  resumeGoal,
  updateProgress,
  type CoachingGoal,
  type GoalCheckIn,
  type GoalDomain,
  type GoalProfile,
  type GoalProgress,
  type GoalStatus,
  type Milestone,
  type MilestoneStatus,
} from './goal-tracking.js';

// ============================================================================
// ACTION PLANNING
// ============================================================================

export {
  buildActionContext,
  completeAction,
  createAction,
  deferAction,
  detectActionOpportunity,
  exportActionProfile,
  generateActionFollowUp,
  generateActionSuggestions,
  getActionsNeedingFollowUp,
  getActionStats,
  getActionToFollowUp,
  getPendingActions,
  importActionProfile,
  skipAction,
  type ActionItem,
  type ActionPriority,
  type ActionProfile,
  type ActionStatus,
  type ActionSuggestion,
} from './action-planning.js';

// ============================================================================
// OBSTACLE DETECTION
// ============================================================================

export {
  buildObstacleContext,
  detectObstacle,
  exportObstacleProfile,
  generateObstacleResponse,
  getActiveObstacles,
  getMostCommonObstacle,
  getObstaclePatterns,
  getObstacleSupport,
  importObstacleProfile,
  markObstacleAddressed,
  markObstacleResolved,
  type Obstacle,
  type ObstaclePattern,
  type ObstacleProfile,
  type ObstacleSupport,
  type ObstacleType,
} from './obstacle-detection.js';

// ============================================================================
// COACHING STYLE ADAPTATION
// ============================================================================

export {
  buildStyleContext,
  detectStyleSignals,
  exportStyleProfile,
  getPreferredStyle,
  getStyleGuidance,
  getStyleProfile,
  importStyleProfile,
  setExplicitStylePreference,
  type CoachingStyle,
  type CoachingStyleProfile,
  type FeedbackPreference,
  type ProcessingMode,
  type StyleSignal,
} from './style-adaptation.js';

// ============================================================================
// EMOTIONAL GRANULARITY
// ============================================================================

export {
  buildGranularityContext,
  detectVagueExpression,
  exportGranularityProfile,
  getEmotionTeaching,
  getGranularityScore,
  getTopEmotionWords,
  getVocabularySuggestions,
  importGranularityProfile,
  recordExpansionAccepted,
  recordExpansionOffered,
  type EmotionCategory,
  type EmotionWord,
  type GranularityProfile,
} from './emotional-granularity.js';

// ============================================================================
// JOURNEY TRACKING
// ============================================================================

export {
  buildJourneyContext,
  exportJourneyProfile,
  generateJourneyReflection,
  getJourneySummary,
  importJourneyProfile,
  markMilestoneCelebrated,
  recordBreakthrough,
  recordGoalCompletion,
  recordSession,
  type JourneyMilestone,
  type JourneyProfile,
  type JourneyReflection,
  type JourneySnapshot,
  type MilestoneType,
} from './journey-tracking.js';

// ============================================================================
// HANDOFF INTELLIGENCE
// ============================================================================

export {
  buildHandoffContext,
  detectHandoffOpportunity,
  exportTeamExperience,
  generateTeamIntroduction,
  getBestPersonaForTopic,
  getUnmetTeamMembers,
  importTeamExperience,
  recordHandoff,
  type HandoffCandidate,
  type HandoffDecision,
  type PersonaId,
  type TeamMemberProfile,
  type UserTeamExperience,
} from './handoff-intelligence.js';

// ============================================================================
// SOCRATIC ENGINE
// ============================================================================

export {
  buildSocraticContext,
  generateQuestionSequence,
  generateSocraticQuestion,
  generateSocraticResponse,
  selectQuestionType,
  type SocraticContext,
  type SocraticQuestion,
  type SocraticQuestionType,
} from './socratic-engine.js';

// ============================================================================
// COGNITIVE REFRAMES
// ============================================================================

export {
  buildReframeContext,
  detectDistortions,
  generateReframes,
  getCommonDistortions,
  recordReframeFeedback,
  type CognitiveReframe,
  type DistortionType,
  type ReframeOption,
  type ReframeProfile,
} from './cognitive-reframes.js';

// ============================================================================
// SEASONAL AWARENESS
// ============================================================================

export {
  buildSeasonalContext,
  exportSeasonalProfile,
  getCurrentSeason,
  getDayLength,
  getSeasonalContext,
  getUpcomingHolidays,
  importSeasonalProfile,
  isCurrentlyDifficultTime,
  recordDifficultTime,
  setHolidayPreferences,
  type Holiday,
  type HolidayType,
  type Season,
  type SeasonalContext,
  type UserSeasonalProfile,
} from './seasonal-awareness.js';

// ============================================================================
// RE-ENGAGEMENT
// ============================================================================

export {
  exportEngagementProfile,
  generateNudge,
  getUsersNeedingNudges,
  importEngagementProfile,
  optInToReengagement,
  optOutOfReengagement,
  recordSession as recordEngagementSession,
  shouldSendNudge,
  type AbsenceReason,
  type NudgeType,
  type ReengagementNudge,
  type UserEngagementProfile,
} from './reengagement.js';

// ============================================================================
// VALUES COACHING
// ============================================================================

export {
  buildValuesContext,
  exportValuesProfile,
  generateValuesCheck,
  getValuesExplorationPrompt,
  identifyValue,
  importValuesProfile,
  recordValueAlignment,
  recordValuesExplorationResponse,
  suggestValuesFromConversation,
  type Value,
  type ValueDomain,
  type ValuesProfile,
} from './values-coaching.js';

// ============================================================================
// PROGRESS METRICS
// ============================================================================

export {
  buildProgressContext,
  exportProgressProfile,
  generateProgressReflection,
  generateProgressSummary,
  getStreakInfo,
  importProgressProfile,
  recordHighlight,
  recordProgressSession,
  resetStreak,
  type GrowthHighlight,
  type ProgressProfile,
  type ProgressSummary,
} from './progress-metrics.js';

// ============================================================================
// CROSS-PERSONA CONTEXT
// ============================================================================

export {
  addCrossPersonaItem,
  buildCrossPersonaContext,
  exportTeamContext,
  getContextForPersona,
  getHandoffSummary,
  importTeamContext,
  recordPersonaInteraction,
  shareContext,
  updateCurrentSituation,
  type PersonaInteraction,
  type SharedContext,
  type UserTeamContext,
} from './cross-persona-context.js';

// ============================================================================
// PERSISTENCE
// ============================================================================

export {
  exportAllCoachingProfiles,
  importAllCoachingProfiles,
  initializeCoachingForSession,
  persistCoachingForSession,
  type CoachingProfileBundle,
} from './persistence.js';

// ============================================================================
// UNIFIED API
// ============================================================================

import { createLogger } from '../../utils/safe-logger.js';
import {
  buildActionContext,
  detectActionOpportunity,
  getActionToFollowUp,
} from './action-planning.js';
import { buildReframeContext, detectDistortions } from './cognitive-reframes.js';
import { buildCrossPersonaContext } from './cross-persona-context.js';
import { buildGranularityContext, detectVagueExpression } from './emotional-granularity.js';
import {
  buildGoalContext,
  detectGoalStatement,
  getActiveGoals,
  getGoalToCheckIn,
} from './goal-tracking.js';
import {
  buildHandoffContext,
  detectHandoffOpportunity,
  type PersonaId,
} from './handoff-intelligence.js';
import { buildJourneyContext, generateJourneyReflection } from './journey-tracking.js';
import { buildObstacleContext, detectObstacle } from './obstacle-detection.js';
import { buildProgressContext } from './progress-metrics.js';
import { buildSeasonalContext } from './seasonal-awareness.js';
import { buildSocraticContext } from './socratic-engine.js';
import { buildStyleContext, detectStyleSignals } from './style-adaptation.js';
import { buildValuesContext, suggestValuesFromConversation } from './values-coaching.js';

const log = createLogger({ module: 'Coaching' });

/**
 * Get a comprehensive coaching-aware context injection for the conversation.
 * Includes goals, actions, obstacles, style, journey, and team coordination.
 */
export function getCoachingContextForLLM(
  userId: string,
  options?: { currentPersona?: PersonaId; userMessage?: string }
): string | null {
  const parts: string[] = [];

  // Add goal context if any active goals
  const goalContext = buildGoalContext(userId);
  if (goalContext) {
    parts.push(goalContext);
  }

  // Add action context
  const actionContext = buildActionContext(userId);
  if (actionContext) {
    parts.push('');
    parts.push(actionContext);
  }

  // Add obstacle context
  const obstacleContext = buildObstacleContext(userId);
  if (obstacleContext) {
    parts.push('');
    parts.push(obstacleContext);
  }

  // Add coaching style context
  const styleContext = buildStyleContext(userId);
  if (styleContext) {
    parts.push('');
    parts.push(styleContext);
  }

  // Add emotional granularity context
  const granularityContext = buildGranularityContext(userId);
  if (granularityContext) {
    parts.push('');
    parts.push(granularityContext);
  }

  // Add journey context
  const journeyContext = buildJourneyContext(userId);
  if (journeyContext) {
    parts.push('');
    parts.push(journeyContext);
  }

  // Add values context
  const valuesContext = buildValuesContext(userId);
  if (valuesContext) {
    parts.push('');
    parts.push(valuesContext);
  }

  // Add seasonal context
  const seasonalContext = buildSeasonalContext(userId);
  if (seasonalContext) {
    parts.push('');
    parts.push(seasonalContext);
  }

  // Add team handoff context
  const handoffContext = buildHandoffContext(userId, options?.currentPersona || 'ferni');
  if (handoffContext) {
    parts.push('');
    parts.push(handoffContext);
  }

  // Add cross-persona context
  const crossPersonaCtx = buildCrossPersonaContext(userId, options?.currentPersona || 'ferni');
  if (crossPersonaCtx) {
    parts.push('');
    parts.push(crossPersonaCtx);
  }

  // Add progress context
  const progressCtx = buildProgressContext(userId);
  if (progressCtx) {
    parts.push('');
    parts.push(progressCtx);
  }

  // Add Socratic questioning context (always useful)
  if (options?.userMessage) {
    const socraticContext = buildSocraticContext(options.userMessage);
    if (socraticContext) {
      parts.push('');
      parts.push(socraticContext);
    }

    // Check for cognitive distortions
    const distortions = detectDistortions(options.userMessage);
    const reframeContext = buildReframeContext(userId, distortions);
    if (reframeContext) {
      parts.push('');
      parts.push(reframeContext);
    }
  }

  // Check if there's a goal needing check-in
  const checkIn = getGoalToCheckIn(userId);
  if (checkIn) {
    parts.push('');
    parts.push('[📋 GOAL CHECK-IN OPPORTUNITY]');
    parts.push(`Consider asking: "${checkIn.checkIn.question}"`);
    parts.push(`(${checkIn.checkIn.context.daysSinceUpdate} days since last update)`);
  }

  // Check if there's an action needing follow-up
  const actionFollowUp = getActionToFollowUp(userId);
  if (actionFollowUp) {
    parts.push('');
    parts.push('[✅ ACTION FOLLOW-UP]');
    parts.push(`Ask about: "${actionFollowUp.action.action}"`);
  }

  // Check for journey reflection opportunity
  const journeyReflection = generateJourneyReflection(userId);
  if (journeyReflection) {
    parts.push('');
    parts.push('[🛤️ JOURNEY REFLECTION OPPORTUNITY]');
    parts.push(`"${journeyReflection.content}"`);
  }

  if (parts.length === 0) return null;

  return parts.join('\n');
}

/**
 * Analyze user message for all coaching opportunities
 */
export function analyzeForCoaching(
  userId: string,
  userMessage: string,
  options?: { currentPersona?: PersonaId }
): {
  hasGoalStatement: boolean;
  goalText?: string;
  domain?: string;
  hasActiveGoals: boolean;
  activeGoalCount: number;
  hasActionOpportunity: boolean;
  hasObstacle: boolean;
  obstacleType?: string;
  hasVagueEmotion: boolean;
  emotionExpansion?: string;
  suggestedHandoff: boolean;
  handoffTarget?: PersonaId;
  suggestedValues?: Array<{ value: string; domain: string; confidence: number }>;
} {
  const goalDetection = detectGoalStatement(userId, userMessage);
  const activeGoals = getActiveGoals(userId);
  const actionOpportunity = detectActionOpportunity(userMessage);
  const obstacle = detectObstacle(userId, userMessage);
  const vagueEmotion = detectVagueExpression(userId, userMessage);
  const handoffOpportunity = detectHandoffOpportunity(
    userId,
    userMessage,
    options?.currentPersona || 'ferni'
  );

  // Also detect style signals in the background
  detectStyleSignals(userId, userMessage);

  // Check for values mentions
  const valuesSuggestions = suggestValuesFromConversation(userMessage);

  return {
    hasGoalStatement: goalDetection.detected,
    goalText: goalDetection.goalText,
    domain: goalDetection.domain,
    hasActiveGoals: activeGoals.length > 0,
    activeGoalCount: activeGoals.length,
    hasActionOpportunity: actionOpportunity.isOpportunity,
    hasObstacle: obstacle !== null,
    obstacleType: obstacle?.type,
    hasVagueEmotion: vagueEmotion.isVague,
    emotionExpansion: vagueEmotion.expansionPrompt,
    suggestedHandoff: handoffOpportunity.shouldHandoff,
    handoffTarget: handoffOpportunity.candidate?.personaId,
    suggestedValues: valuesSuggestions.length > 0 ? valuesSuggestions : undefined,
  };
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  getCoachingContextForLLM,
  analyzeForCoaching,
};
