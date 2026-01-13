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
import type { ToolDefinition } from '../../registry/types.js';
import { morningSkyCheckDef, kintsugiMomentsDef, questionOfTheWeekDef, emotionalGameDefinitions } from './emotional-games.js';
import { compoundInterestGameDef, tinyBetsDef, financialGameDefinitions } from './financial-games.js';
import { futureSelfLetterDef, lifePorfolioReviewDef, predictionMarketDef, lifePlanningGameDefinitions } from './life-planning-games.js';
import { paradoxOfTheDayDef, questionBeneathDef, wisdomGameDefinitions } from './wisdom-games.js';
import { patternDetectiveDef, weeklyPredictionDef, analyticsGameDefinitions } from './analytics-games.js';
import { inboxZeroChallengeDef, sundayPrepGameDef, productivityGameDefinitions } from './productivity-games.js';
import { teamHuddleDef, quickChallengesDef, reflectionPromptsDef, streakTrackerDef, celebrationMomentDef, teamChallengeDefinitions } from './team-challenges.js';
export { generateWeatherInsight, generateDomainInsight } from './helpers.js';
export { morningSkyCheckDef, kintsugiMomentsDef, questionOfTheWeekDef, compoundInterestGameDef, tinyBetsDef, futureSelfLetterDef, lifePorfolioReviewDef, predictionMarketDef, paradoxOfTheDayDef, questionBeneathDef, patternDetectiveDef, weeklyPredictionDef, inboxZeroChallengeDef, sundayPrepGameDef, teamHuddleDef, quickChallengesDef, reflectionPromptsDef, streakTrackerDef, celebrationMomentDef, };
export { emotionalGameDefinitions, financialGameDefinitions, lifePlanningGameDefinitions, wisdomGameDefinitions, analyticsGameDefinitions, productivityGameDefinitions, teamChallengeDefinitions, };
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map