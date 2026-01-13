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
export { abandonGoal, addMilestone, buildGoalContext, completeMilestone, createGoal, detectGoalStatement, exportGoalProfile, generateGoalCheckIn, getActiveGoals, getGoal, getGoalsNeedingCheckIn, getGoalStats, getGoalToCheckIn, getRecentProgress, importGoalProfile, pauseGoal, resumeGoal, updateProgress, type CoachingGoal, type GoalCheckIn, type GoalDomain, type GoalProfile, type GoalProgress, type GoalStatus, type Milestone, type MilestoneStatus, } from './goal-tracking.js';
export { buildActionContext, completeAction, createAction, deferAction, detectActionOpportunity, exportActionProfile, generateActionFollowUp, generateActionSuggestions, getActionsNeedingFollowUp, getActionStats, getActionToFollowUp, getPendingActions, importActionProfile, skipAction, type ActionItem, type ActionPriority, type ActionProfile, type ActionStatus, type ActionSuggestion, } from './action-planning.js';
export { buildObstacleContext, detectObstacle, exportObstacleProfile, generateObstacleResponse, getActiveObstacles, getMostCommonObstacle, getObstaclePatterns, getObstacleSupport, importObstacleProfile, markObstacleAddressed, markObstacleResolved, type Obstacle, type ObstaclePattern, type ObstacleProfile, type ObstacleSupport, type ObstacleType, } from './obstacle-detection.js';
export { buildStyleContext, detectStyleSignals, exportStyleProfile, getPreferredStyle, getStyleGuidance, getStyleProfile, importStyleProfile, setExplicitStylePreference, type CoachingStyle, type CoachingStyleProfile, type FeedbackPreference, type ProcessingMode, type StyleSignal, } from './style-adaptation.js';
export { buildGranularityContext, detectVagueExpression, exportGranularityProfile, getEmotionTeaching, getGranularityScore, getTopEmotionWords, getVocabularySuggestions, importGranularityProfile, recordExpansionAccepted, recordExpansionOffered, type EmotionCategory, type EmotionWord, type GranularityProfile, } from './emotional-granularity.js';
export { buildJourneyContext, exportJourneyProfile, generateJourneyReflection, getJourneySummary, importJourneyProfile, markMilestoneCelebrated, recordBreakthrough, recordGoalCompletion, recordSession, type JourneyMilestone, type JourneyProfile, type JourneyReflection, type JourneySnapshot, type MilestoneType, } from './journey-tracking.js';
export { buildHandoffContext, detectHandoffOpportunity, exportTeamExperience, generateTeamIntroduction, getBestPersonaForTopic, getUnmetTeamMembers, importTeamExperience, recordHandoff, type HandoffCandidate, type HandoffDecision, type PersonaId, type TeamMemberProfile, type UserTeamExperience, } from './handoff-intelligence.js';
export { buildSocraticContext, generateQuestionSequence, generateSocraticQuestion, generateSocraticResponse, selectQuestionType, type SocraticContext, type SocraticQuestion, type SocraticQuestionType, } from './socratic-engine.js';
export { buildReframeContext, detectDistortions, generateReframes, getCommonDistortions, recordReframeFeedback, type CognitiveReframe, type DistortionType, type ReframeOption, type ReframeProfile, } from './cognitive-reframes.js';
export { buildSeasonalContext, exportSeasonalProfile, getCurrentSeason, getDayLength, getSeasonalContext, getUpcomingHolidays, importSeasonalProfile, isCurrentlyDifficultTime, recordDifficultTime, setHolidayPreferences, type Holiday, type HolidayType, type Season, type SeasonalContext, type UserSeasonalProfile, } from './seasonal-awareness.js';
export { exportEngagementProfile, generateNudge, getUsersNeedingNudges, importEngagementProfile, optInToReengagement, optOutOfReengagement, recordSession as recordEngagementSession, shouldSendNudge, type AbsenceReason, type NudgeType, type ReengagementNudge, type UserEngagementProfile, } from './reengagement.js';
export { buildValuesContext, exportValuesProfile, generateValuesCheck, getValuesExplorationPrompt, identifyValue, importValuesProfile, recordValueAlignment, recordValuesExplorationResponse, suggestValuesFromConversation, type Value, type ValueDomain, type ValuesProfile, } from './values-coaching.js';
export { buildProgressContext, exportProgressProfile, generateProgressReflection, generateProgressSummary, getStreakInfo, importProgressProfile, recordHighlight, recordProgressSession, resetStreak, type GrowthHighlight, type ProgressProfile, type ProgressSummary, } from './progress-metrics.js';
export { addCrossPersonaItem, buildCrossPersonaContext, exportTeamContext, getContextForPersona, getHandoffSummary, importTeamContext, recordPersonaInteraction, shareContext, updateCurrentSituation, type PersonaInteraction, type SharedContext, type UserTeamContext, } from './cross-persona-context.js';
export { exportAllCoachingProfiles, importAllCoachingProfiles, initializeCoachingForSession, persistCoachingForSession, type CoachingProfileBundle, } from './persistence.js';
import { type PersonaId } from './handoff-intelligence.js';
/**
 * Get a comprehensive coaching-aware context injection for the conversation.
 * Includes goals, actions, obstacles, style, journey, and team coordination.
 */
export declare function getCoachingContextForLLM(userId: string, options?: {
    currentPersona?: PersonaId;
    userMessage?: string;
}): string | null;
/**
 * Analyze user message for all coaching opportunities
 */
export declare function analyzeForCoaching(userId: string, userMessage: string, options?: {
    currentPersona?: PersonaId;
}): {
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
    suggestedValues?: Array<{
        value: string;
        domain: string;
        confidence: number;
    }>;
};
declare const _default: {
    getCoachingContextForLLM: typeof getCoachingContextForLLM;
    analyzeForCoaching: typeof analyzeForCoaching;
};
export default _default;
//# sourceMappingURL=index.d.ts.map