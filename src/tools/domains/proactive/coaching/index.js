/**
 * Proactive Coaching Module
 *
 * Trigger detection for proactive coaching behaviors:
 * - Life coaching triggers (loneliness, belonging, transitions)
 * - Quiet growth triggers (rest permission, plateau celebration)
 * - Standard triggers (streaks, patterns, milestones)
 */
export { 
// Main detection function
detectProactiveTriggers, 
// Life Coaching Message Generators
generateLonelinessCheckInMessage, generateSocialWinCelebrationMessage, generateConversationFollowUpMessage, generateBoundaryCheckInMessage, generateRebuildingMilestoneMessage, generateFreshStartAnniversaryMessage, generateTransitionStageShiftMessage, generateLifeTransitionCheckInMessage, generateBelongingMilestoneMessage, 
// Quiet Growth Message Generators
generateRestPermissionMessage, generatePlateauCelebrationMessage, generateSeasonalTransitionMessage, generateEnoughForTodayMessage, generateGentlePaceCheckMessage, 
// Tools
createProactiveCoachingTools, } from './proactive-coaching.js';
export default createProactiveCoachingTools;
import { createProactiveCoachingTools } from './proactive-coaching.js';
//# sourceMappingURL=index.js.map