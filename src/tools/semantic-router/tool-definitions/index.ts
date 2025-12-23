/**
 * Tool Definitions Index
 *
 * Export all semantic tool definitions from this file.
 * These definitions enable pre-LLM routing for common commands.
 *
 * @module tools/semantic-router/tool-definitions
 */

// ============================================================================
// EXPORTS - All semantic tool definitions
// ============================================================================

// Music (Spotify, Apple Music)
export { musicTools, playMusicTool, pauseMusicTool, skipSongTool } from './music.semantic.js';

// Handoff (transfer to other personas)
export { handoffTools, handoffTool, habitHelpTool } from './handoff.semantic.js';

// Weather
export { weatherTools, currentWeatherTool, weatherForecastTool } from './weather.semantic.js';

// Calendar
export {
  calendarTools,
  listCalendarTool,
  createEventTool,
  checkAvailabilityTool,
} from './calendar.semantic.js';

// Habits (Maya's domain)
export {
  habitsTools,
  trackHabitTool,
  getHabitsTool,
  createHabitTool,
  habitCoachingTool,
} from './habits.semantic.js';

// Memory (recall/remember)
export { memoryTools, rememberTool, recallTool, peopleMemoryTool } from './memory.semantic.js';

// Wellness (grounding, mental health support)
export {
  wellnessTools,
  groundingExerciseTool,
  wellnessCheckinTool,
  sleepHelpTool,
} from './wellness.semantic.js';

// Information (time, date, news, search)
export {
  informationTools,
  timeTool,
  dateTool,
  newsTool,
  searchTool,
} from './information.semantic.js';

// Crisis (SAFETY-CRITICAL)
export { crisisTools, crisisSupportTool, safetyPlanningTool } from './crisis.semantic.js';

// Games (entertainment, engagement)
export { gamesTools, playGameTool, triviaTool, storytellingTool } from './games.semantic.js';

// Entertainment (movies, TV)
export {
  entertainmentTools,
  movieRecommendationTool,
  tvShowRecommendationTool,
  trendingEntertainmentTool,
} from './entertainment.semantic.js';

// Finance (budget, bills, calculations)
export {
  financeTools,
  budgetCheckTool,
  billTrackingTool,
  calculatorTool,
  savingsGoalTool,
} from './finance.semantic.js';

// Telephony (calls, voicemail)
export {
  telephonyTools,
  makeCallTool,
  requestCallbackTool,
  voicemailTool,
} from './telephony.semantic.js';

// Relationships (romantic, family, friendship)
export {
  relationshipsTools,
  relationshipAdviceTool,
  conflictResolutionTool,
  friendshipSupportTool,
  familyDynamicsTool,
} from './relationships.semantic.js';

// Grief (loss, mourning, honoring memory)
export {
  griefTools,
  griefSupportTool,
  griefWavesTool,
  honoringMemoryTool,
} from './grief.semantic.js';

// Career (job search, interviews, development)
export {
  careerTools,
  jobSearchTool,
  interviewPrepTool,
  resumeHelpTool,
  careerDevelopmentTool,
  workplaceChallengesTool,
} from './career.semantic.js';

// Decisions (choices, trade-offs, values)
export {
  decisionsTools,
  decisionHelpTool,
  proConListTool,
  valuesAlignmentTool,
  regretMinimizationTool,
} from './decisions.semantic.js';

// Life Coaching (burnout, boundaries, anger, etc.)
export {
  lifeCoachingTools,
  burnoutTool,
  boundariesTool,
  angerTool,
  procrastinationTool,
  perfectionismTool,
  selfCompassionTool,
  motivationTool,
} from './life-coaching.semantic.js';

// Dating (dating advice, apps, breakups)
export {
  datingTools,
  datingAdviceTool,
  datingAppsTool,
  firstDateTool,
  breakupRecoveryTool,
} from './dating.semantic.js';

// Productivity (tasks, notes, focus)
export {
  productivityTools,
  taskManagementTool,
  notesTool,
  focusTool,
  timeManagementTool,
} from './productivity.semantic.js';

// Recommendations (books, podcasts, restaurants, gifts)
export {
  recommendationsTools,
  bookRecommendationTool,
  podcastRecommendationTool,
  restaurantRecommendationTool,
  giftRecommendationTool,
} from './recommendations.semantic.js';

// Smart Home (lights, thermostat, locks)
export {
  smartHomeTools,
  lightsControlTool,
  thermostatControlTool,
  locksControlTool,
  deviceControlTool,
} from './smart-home.semantic.js';

// Learning (education, languages, skills)
export {
  learningTools,
  explainConceptTool,
  languageLearningTool,
  studyHelpTool,
  skillDevelopmentTool,
} from './learning.semantic.js';

// ============================================================================
// AGGREGATED DEFINITIONS
// ============================================================================

import type { SemanticToolDefinition } from '../types.js';

// Import all tool arrays
import { musicTools } from './music.semantic.js';
import { handoffTools } from './handoff.semantic.js';
import { weatherTools } from './weather.semantic.js';
import { calendarTools } from './calendar.semantic.js';
import { habitsTools } from './habits.semantic.js';
import { memoryTools } from './memory.semantic.js';
import { wellnessTools } from './wellness.semantic.js';
import { informationTools } from './information.semantic.js';
import { crisisTools } from './crisis.semantic.js';
import { gamesTools } from './games.semantic.js';
import { entertainmentTools } from './entertainment.semantic.js';
import { financeTools } from './finance.semantic.js';
import { telephonyTools } from './telephony.semantic.js';
import { relationshipsTools } from './relationships.semantic.js';
import { griefTools } from './grief.semantic.js';
import { careerTools } from './career.semantic.js';
import { decisionsTools } from './decisions.semantic.js';
import { lifeCoachingTools } from './life-coaching.semantic.js';
import { datingTools } from './dating.semantic.js';
import { productivityTools } from './productivity.semantic.js';
import { recommendationsTools } from './recommendations.semantic.js';
import { smartHomeTools } from './smart-home.semantic.js';
import { learningTools } from './learning.semantic.js';

/**
 * All registered semantic tool definitions
 *
 * These tools are candidates for pre-LLM routing.
 * Total: ~75 tools across 23 categories
 *
 * IMPORTANT: Crisis tools are listed first for priority routing
 */
export const allToolDefinitions: SemanticToolDefinition[] = [
  // SAFETY-CRITICAL: Crisis tools get priority
  ...crisisTools, // 2 tools: crisis support, safety planning

  // Core functionality
  ...musicTools, // 3 tools: play, pause, skip
  ...handoffTools, // 2 tools: handoff, habit help
  ...weatherTools, // 2 tools: current, forecast
  ...calendarTools, // 3 tools: list, create, availability
  ...habitsTools, // 4 tools: track, list, create, coaching
  ...memoryTools, // 3 tools: save, recall, people
  ...wellnessTools, // 3 tools: grounding, checkin, sleep
  ...informationTools, // 4 tools: time, date, news, search

  // Entertainment & Games
  ...gamesTools, // 3 tools: play game, trivia, storytelling
  ...entertainmentTools, // 3 tools: movie, TV, trending

  // Life domains
  ...financeTools, // 4 tools: budget, bills, calculator, savings
  ...telephonyTools, // 3 tools: call, callback, voicemail
  ...relationshipsTools, // 4 tools: romantic, conflict, friendship, family
  ...griefTools, // 3 tools: grief support, waves, honoring
  ...careerTools, // 5 tools: job search, interview, resume, development, workplace
  ...decisionsTools, // 4 tools: decision help, pro/con, values, regret

  // Life coaching
  ...lifeCoachingTools, // 7 tools: burnout, boundaries, anger, procrastination, perfectionism, self-compassion, motivation
  ...datingTools, // 4 tools: dating advice, apps, first date, breakup

  // Productivity & Learning
  ...productivityTools, // 4 tools: tasks, notes, focus, time management
  ...learningTools, // 4 tools: explain, language, study, skills

  // Recommendations & Smart Home
  ...recommendationsTools, // 4 tools: books, podcasts, restaurants, gifts
  ...smartHomeTools, // 4 tools: lights, thermostat, locks, devices
];

/**
 * Tool definitions by category for selective loading
 */
export const toolsByCategory: Record<string, SemanticToolDefinition[]> = {
  // Safety-critical
  crisis: crisisTools,

  // Core
  music: musicTools,
  handoff: handoffTools,
  weather: weatherTools,
  calendar: calendarTools,
  habits: habitsTools,
  memory: memoryTools,
  wellness: wellnessTools,
  information: informationTools,

  // Entertainment
  games: gamesTools,
  entertainment: entertainmentTools,

  // Life domains
  finance: financeTools,
  telephony: telephonyTools,
  relationships: relationshipsTools,
  grief: griefTools,
  career: careerTools,
  decisions: decisionsTools,

  // Life coaching
  'life-coaching': lifeCoachingTools,
  dating: datingTools,

  // Productivity & Learning
  productivity: productivityTools,
  learning: learningTools,

  // Recommendations & Smart Home
  recommendations: recommendationsTools,
  'smart-home': smartHomeTools,
};

/**
 * Get tool count by category (for debugging)
 */
export function getToolStats(): Record<string, number> {
  const stats = Object.fromEntries(
    Object.entries(toolsByCategory).map(([category, tools]) => [category, tools.length])
  );

  // Add total
  stats.total = allToolDefinitions.length;

  return stats;
}

/**
 * Get high-priority tools (crisis + core functionality)
 * These should always be loaded for routing
 */
export function getHighPriorityTools(): SemanticToolDefinition[] {
  return [
    ...crisisTools,
    ...musicTools,
    ...handoffTools,
    ...weatherTools,
    ...calendarTools,
  ];
}
