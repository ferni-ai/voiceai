/**
 * Engagement Games Domain Tools
 *
 * Fun, interactive games and activities that give users reasons to return
 * and build lasting relationships with the personas.
 *
 * DOMAIN: engagement
 *
 * Module structure:
 * - emotional-games.ts: Morning Sky Check, Kintsugi Moments, Question of the Week
 * - financial-games.ts: Compound & Interest Game, Tiny Bets
 * - life-planning-games.ts: Future Self Letter, Life Portfolio Review, Prediction Market
 * - wisdom-games.ts: Paradox of the Day, Question Beneath
 * - analytics-games.ts: Pattern Detective, Weekly Prediction
 * - productivity-games.ts: Inbox Zero Challenge, Sunday Prep
 * - team-challenges.ts: Team Huddle, Quick Challenges, Reflection Prompts, Streak Tracker, Celebrations
 * - helpers.ts: Utility functions
 *
 * @module engagement
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition } from '../../registry/types.js';

// ============================================================================
// IMPORTS FROM MODULAR FILES
// ============================================================================

// Emotional engagement (Ferni's games)
import {
  morningSkyCheckDef,
  kintsugiMomentsDef,
  questionOfTheWeekDef,
  emotionalGameDefinitions,
} from './emotional-games.js';

// Financial engagement (Maya's games)
import {
  compoundInterestGameDef,
  tinyBetsDef,
  financialGameDefinitions,
} from './financial-games.js';

// Life planning engagement (Jordan's games)
import {
  futureSelfLetterDef,
  lifePorfolioReviewDef,
  predictionMarketDef,
  lifePlanningGameDefinitions,
} from './life-planning-games.js';

// Wisdom engagement (Nayan's games)
import { paradoxOfTheDayDef, questionBeneathDef, wisdomGameDefinitions } from './wisdom-games.js';

// Analytics engagement (Peter's games)
import {
  patternDetectiveDef,
  weeklyPredictionDef,
  analyticsGameDefinitions,
} from './analytics-games.js';

// Productivity engagement (Alex's games)
import {
  inboxZeroChallengeDef,
  sundayPrepGameDef,
  productivityGameDefinitions,
} from './productivity-games.js';

// Team challenges and shared tools
import {
  teamHuddleDef,
  quickChallengesDef,
  reflectionPromptsDef,
  streakTrackerDef,
  celebrationMomentDef,
  teamChallengeDefinitions,
} from './team-challenges.js';

// Helpers
export { generateWeatherInsight, generateDomainInsight } from './helpers.js';

// ============================================================================
// RE-EXPORTS FOR BACKWARD COMPATIBILITY
// ============================================================================

// Individual tool definitions
export {
  // Emotional games (Ferni)
  morningSkyCheckDef,
  kintsugiMomentsDef,
  questionOfTheWeekDef,
  // Financial games (Maya)
  compoundInterestGameDef,
  tinyBetsDef,
  // Life planning games (Jordan)
  futureSelfLetterDef,
  lifePorfolioReviewDef,
  predictionMarketDef,
  // Wisdom games (Nayan)
  paradoxOfTheDayDef,
  questionBeneathDef,
  // Analytics games (Peter)
  patternDetectiveDef,
  weeklyPredictionDef,
  // Productivity games (Alex)
  inboxZeroChallengeDef,
  sundayPrepGameDef,
  // Team challenges
  teamHuddleDef,
  quickChallengesDef,
  reflectionPromptsDef,
  streakTrackerDef,
  celebrationMomentDef,
};

// Tool definition arrays by category
export {
  emotionalGameDefinitions,
  financialGameDefinitions,
  lifePlanningGameDefinitions,
  wisdomGameDefinitions,
  analyticsGameDefinitions,
  productivityGameDefinitions,
  teamChallengeDefinitions,
};

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

const engagementTools: ToolDefinition[] = [
  // Ferni's games
  morningSkyCheckDef,
  kintsugiMomentsDef,
  questionOfTheWeekDef,
  // Maya's games
  compoundInterestGameDef,
  tinyBetsDef,
  // Jordan's games
  futureSelfLetterDef,
  lifePorfolioReviewDef,
  predictionMarketDef,
  // Nayan's games
  paradoxOfTheDayDef,
  questionBeneathDef,
  // Peter's games
  patternDetectiveDef,
  weeklyPredictionDef,
  // Alex's games
  inboxZeroChallengeDef,
  sundayPrepGameDef,
  // Team & Universal
  teamHuddleDef,
  quickChallengesDef,
  reflectionPromptsDef,
  streakTrackerDef,
  celebrationMomentDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'engagement',
  engagementTools
);

export default getToolDefinitions;
