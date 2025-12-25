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
// NOTE: sleepHelpTool removed - consolidated into health domain (see HEALTH-HOME-WELLNESS-AUDIT.md)
export { wellnessTools, groundingExerciseTool, wellnessCheckinTool } from './wellness.semantic.js';

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

// Video (YouTube search, trending, recommendations)
export {
  videoTools,
  searchYouTubeTool,
  getVideoRecommendationsTool,
  getTrendingVideosTool,
  getVideoDetailsTool,
} from './video.semantic.js';

// Travel (flights, hotels, trip planning)
export {
  travelTools,
  searchFlightsTool,
  searchHotelsTool,
  planTripTool,
  getSavedTripsTool,
  getTripSuggestionsTool,
  getFlightPriceTool,
} from './travel.semantic.js';

// Vibe (unified environment control - music, lights, temperature)
export {
  vibeTools,
  setVibeTool,
  getEnvironmentStatusTool,
  adjustLightsTool,
  listVibesTool,
} from './vibe.semantic.js';

// Group Conversation (team roundtables, conference calls)
export {
  groupConversationTools,
  startRoundtableTool,
  inviteParticipantTool,
  endGroupConversationTool,
} from './group-conversation.semantic.js';

// Communication (send messages, drafting, coaching)
export {
  communicationTools,
  sendMessageTool,
  scheduleReminderTool,
  draftMessageTool,
  rolePlayConversationTool,
  analyzeMessageTool,
  communicationStrategyTool,
  buildAssertivenessTool,
  planFollowUpTool,
} from './communication.semantic.js';

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

// Contacts (CRUD, interactions, follow-ups)
export {
  contactsTools,
  saveContactTool,
  getContactInfoTool,
  listContactsTool,
  recordInteractionTool,
  setFollowUpTool,
  completeFollowUpTool,
  getInteractionHistoryTool,
  getContactStatsTool,
  getRelationshipInsightsTool,
} from './contacts.semantic.js';

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
  coachingPerfectionismTool,
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

// Reminders (remind me to...)
export {
  reminderSemanticTools,
  setReminderTool,
  getRemindersTool,
  cancelReminderTool,
} from './reminders.semantic.js';

// Commitments (Better Than Human accountability)
export {
  commitmentSemanticTools,
  recordCommitmentTool,
  getCommitmentsTool,
  completeCommitmentTool,
  deferCommitmentTool,
} from './commitments.semantic.js';

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

// Books (reading list, recommendations, tracking)
export {
  booksTools,
  searchBooksTool,
  whatToReadNextTool,
  popularBooksTool,
  addToReadingListTool,
  getReadingListTool,
  markBookReadTool,
  removeFromReadingListTool,
  readingStatsTool,
} from './books.semantic.js';

// Health (exercise, sleep, hydration, energy)
export {
  healthTools,
  logExerciseTool,
  suggestWorkoutTool,
  trackHydrationTool,
  sleepAnalysisTool,
  sleepHygieneTool,
  energyLevelTool,
  energyBoostTool,
  nutritionCoachingTool,
} from './health.semantic.js';

// Connection (loneliness, friendship, belonging)
export {
  connectionTools,
  acknowledgeLonelinessTool,
  sitWithLonelinessTool,
  makeAdultFriendsTool,
  maintainFriendshipsTool,
  findYourPeopleTool,
  connectionHealthTool,
  smallActsOfConnectionTool,
} from './connection.semantic.js';

// Dictionary (definitions, synonyms, word of day)
export {
  dictionaryTools,
  defineWordTool,
  getSynonymsTool,
  wordOfDayTool,
} from './dictionary.semantic.js';

// Currency (conversion, exchange rates)
export {
  currencyTools,
  convertCurrencyTool,
  getExchangeRateTool,
  listCurrenciesTool,
} from './currency.semantic.js';

// Alarms (wake-up, recurring)
export {
  alarmsTools,
  setAlarmTool,
  getAlarmsTool,
  deleteAlarmTool,
  snoozeAlarmTool,
} from './alarms.semantic.js';

// Lists (packing, bucket, guest, reading)
export {
  listsTools,
  createListTool,
  addToListTool,
  viewListTool,
  getAllListsTool,
  checkOffItemTool,
  deleteListTool,
} from './lists.semantic.js';

// Traffic (commute, directions, locations)
export {
  trafficTools,
  getCommuteTimeTool,
  getDirectionsTool,
  saveLocationTool,
} from './traffic.semantic.js';

// SMS (read text messages, check inbox)
export { smsTools, readSMSTool, checkNewMessagesTool, searchMessagesTool } from './sms.semantic.js';

// Scheduling (schedule texts, calls, emails for later)
export {
  schedulingTools,
  scheduleTextTool,
  scheduleCallTool,
  scheduleEmailTool,
  sendMessageNowTool,
  listScheduledTool,
  cancelScheduledTool,
  saveContactInfoTool,
} from './scheduling.semantic.js';

// Voice Memos (save, list, play, delete memos)
export {
  voiceMemosTools,
  saveVoiceMemoTool,
  listVoiceMemosTool,
  recallVoiceMemoTool,
  deleteVoiceMemoTool,
  searchVoiceMemosTool,
} from './voice-memos.semantic.js';

// ============================================================================
// PHASE 2: SAFETY-CRITICAL (Anger, Trauma, Burnout)
// ============================================================================

// Anger (emotional regulation)
export {
  angerTools,
  validateAngerTool,
  physicalReleaseTool,
  coolDownTechniqueTool,
  angerToActionTool,
  angerJournalingTool,
  identifyTriggersTool,
  assertiveCommunicationTool,
  angerHistoryTool,
} from './anger.semantic.js';

// Trauma Support (SAFETY-CRITICAL: trauma-informed care)
export {
  traumaSupportTools,
  traumaAwareSupportTool,
  traumaGroundingTool, // Distinct from wellness/groundingExerciseTool
  windowOfToleranceTool,
  traumaEducationTool,
  traumaTimelineTool,
  supportSystemMappingTool,
  professionalResourceFinderTool,
} from './trauma-support.semantic.js';

// Burnout Recovery (assessment, recovery, prevention)
export {
  burnoutRecoveryTools,
  assessBurnoutTool,
  planRecoveryTool,
  setWorkBoundariesTool,
  restoreEnergyTool,
  burnoutPreventionTool,
} from './burnout-recovery.semantic.js';

// ============================================================================
// PHASE 3: GROWTH (Self-Compassion, Dreams, Meaning)
// ============================================================================

// Self-Compassion (inner critic, self-worth, boundaries)
export {
  selfCompassionTools,
  innerCriticDialogueTool,
  selfCompassionBreakTool,
  imposterSyndromeTool,
  perfectionismSelfCompassionTool,
  shameTool,
  selfForgivenessTool,
  selfWorthTool,
  bodyImageCompassionTool,
  comparisonTrapTool,
  selfTalkTool,
  selfCareGuidanceTool,
  boundarySupportTool,
} from './self-compassion.semantic.js';

// Dreams (bucket list, aspirations, life dreams)
export {
  dreamsTools,
  dreamClarificationTool,
  bucketListBuilderTool,
  dreamTimelineTool,
  dreamObstaclesTool,
  dreamProgressTool,
  dreamAccountabilityTool,
  dreamCelebrationTool,
  dreamReconnectionTool,
} from './dreams.semantic.js';

// Meaning (purpose, values, existential reflection)
export {
  meaningTools,
  clarifyValuesTool,
  purposeExplorationTool,
  meaningMakingTool,
  existentialReflectionTool,
  legacyPlanningTool,
  spiritualExplorationTool,
  valueConflictResolutionTool,
  lifePurposeStatementTool,
  meaningfulWorkTool,
  philosophicalDialogueTool,
  moralDilemmaNavigationTool,
  authenticLivingTool,
} from './meaning.semantic.js';

// ============================================================================
// PHASE 4: LIFE MANAGEMENT (Family, Home, Legal-Admin)
// ============================================================================

// Family (parenting, dynamics, elder care)
export {
  familyTools,
  coachParentingChallengeTool,
  navigateDisciplineTool,
  suggestAgeAppropriateActivityTool,
  trackChildMilestoneTool,
  celebrateFamilyMomentTool,
  supportFamilyTransitionTool,
  navigateFamilyConflictTool,
  planFamilyMeetingTool,
  coordinateElderCareTool,
  createFamilyTraditionTool,
  discussValuesTool,
} from './family.semantic.js';

// Home (maintenance, organization, moving)
export {
  homeTools,
  remindHomeMaintenanceTool,
  trackRepairTool,
  coachDeclutteringTool,
  organizeSpaceTool,
  planMoveTool,
  assessEmergencyPreparednessTool,
  planHomeProjectTool,
  manageContractorTool,
} from './home.semantic.js';

// Legal-Admin (documents, estate planning, insurance)
export {
  legalAdminTools,
  organizeDocumentsTool,
  locateDocumentTool,
  promptEstatePlanningTool,
  reviewBeneficiariesTool,
  reviewInsuranceCoverageTool,
  prepareForTaxSeasonTool,
  reminderAnnualTasksTool,
} from './legal-admin.semantic.js';

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
import { videoTools } from './video.semantic.js';
import { travelTools } from './travel.semantic.js';
import { communicationTools } from './communication.semantic.js';
import { financeTools } from './finance.semantic.js';
import { telephonyTools } from './telephony.semantic.js';
import { relationshipsTools } from './relationships.semantic.js';
import { griefTools } from './grief.semantic.js';
import { careerTools } from './career.semantic.js';
import { decisionsTools } from './decisions.semantic.js';
import { lifeCoachingTools } from './life-coaching.semantic.js';
import { datingTools } from './dating.semantic.js';
import { productivityTools } from './productivity.semantic.js';
import { reminderSemanticTools } from './reminders.semantic.js';
import { commitmentSemanticTools } from './commitments.semantic.js';
import { recommendationsTools } from './recommendations.semantic.js';
import { smartHomeTools } from './smart-home.semantic.js';
import { learningTools } from './learning.semantic.js';
import { contactsTools } from './contacts.semantic.js';
import { booksTools } from './books.semantic.js';
import { healthTools } from './health.semantic.js';
import { connectionTools } from './connection.semantic.js';
import { dictionaryTools } from './dictionary.semantic.js';
import { currencyTools } from './currency.semantic.js';
import { alarmsTools } from './alarms.semantic.js';
import { listsTools } from './lists.semantic.js';
import { trafficTools } from './traffic.semantic.js';
import { smsTools } from './sms.semantic.js';
import { voiceMemosTools } from './voice-memos.semantic.js';
import { schedulingTools } from './scheduling.semantic.js';

// Phase 2: Safety-Critical
import { angerTools } from './anger.semantic.js';
import { traumaSupportTools } from './trauma-support.semantic.js';
import { burnoutRecoveryTools } from './burnout-recovery.semantic.js';

// Phase 3: Growth
import { selfCompassionTools } from './self-compassion.semantic.js';
import { dreamsTools } from './dreams.semantic.js';
import { meaningTools } from './meaning.semantic.js';

// Phase 4: Life Management
import { familyTools } from './family.semantic.js';
import { homeTools } from './home.semantic.js';
import { legalAdminTools } from './legal-admin.semantic.js';

// Phase 5: Environment & Group
import { vibeTools } from './vibe.semantic.js';
import { groupConversationTools } from './group-conversation.semantic.js';

/**
 * All registered semantic tool definitions
 *
 * These tools are candidates for pre-LLM routing.
 * Total: ~153 tools across 32 categories
 *
 * IMPORTANT: Crisis and safety-critical tools are listed first for priority routing
 */
export const allToolDefinitions: SemanticToolDefinition[] = [
  // SAFETY-CRITICAL: Crisis tools get priority
  ...crisisTools, // 2 tools: crisis support, safety planning
  ...traumaSupportTools, // 7 tools: trauma support, grounding, window of tolerance, education, timeline, support system, resources

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
  ...videoTools, // 4 tools: YouTube search, recommendations, trending, details

  // Travel
  ...travelTools, // 6 tools: flights, hotels, trip planning, suggestions, prices

  // Communication (sending, drafting, coaching)
  ...communicationTools, // 8 tools: send, reminder, draft, roleplay, analyze, strategy, assertiveness, follow-up

  // Life domains
  ...financeTools, // 4 tools: budget, bills, calculator, savings
  ...telephonyTools, // 3 tools: call, callback, voicemail
  ...contactsTools, // 9 tools: save, info, list, interaction, follow-up, history, stats, insights
  ...relationshipsTools, // 4 tools: romantic, conflict, friendship, family
  ...griefTools, // 3 tools: grief support, waves, honoring
  ...careerTools, // 5 tools: job search, interview, resume, development, workplace
  ...decisionsTools, // 4 tools: decision help, pro/con, values, regret

  // Life coaching
  ...lifeCoachingTools, // 7 tools: burnout, boundaries, anger, procrastination, perfectionism, self-compassion, motivation
  ...datingTools, // 4 tools: dating advice, apps, first date, breakup

  // Productivity & Learning
  ...productivityTools, // 4 tools: tasks, notes, focus, time management
  ...reminderSemanticTools, // 3 tools: set, list, cancel reminders
  ...commitmentSemanticTools, // 4 tools: record, list, complete, defer commitments
  ...learningTools, // 4 tools: explain, language, study, skills

  // Recommendations & Smart Home
  ...recommendationsTools, // 4 tools: books, podcasts, restaurants, gifts
  ...smartHomeTools, // 4 tools: lights, thermostat, locks, devices

  // Phase 1 additions (High Impact)
  ...booksTools, // 8 tools: search, recommend, popular, reading list CRUD, stats
  ...healthTools, // 8 tools: exercise, workout, hydration, sleep, energy, nutrition
  ...connectionTools, // 7 tools: loneliness, friendship, belonging, connection health

  // General utilities
  ...dictionaryTools, // 3 tools: define word, synonyms, word of day
  ...currencyTools, // 3 tools: convert, exchange rate, list currencies
  ...alarmsTools, // 4 tools: set, list, delete, snooze
  ...listsTools, // 6 tools: create, add, view, all, check off, delete
  ...trafficTools, // 3 tools: commute time, directions, save location
  ...smsTools, // 3 tools: read, check new, search messages
  ...voiceMemosTools, // 5 tools: save, list, recall, delete, search memos
  ...schedulingTools, // 7 tools: schedule text, call, email, send now, list, cancel, save contact

  // Phase 2: Safety-Critical (Emotional Regulation)
  ...angerTools, // 8 tools: validate, physical release, cool down, action, journaling, triggers, communication, history
  ...burnoutRecoveryTools, // 5 tools: assess, plan recovery, boundaries, energy, prevention

  // Phase 3: Growth (Self-Compassion, Dreams, Meaning)
  ...selfCompassionTools, // 12 tools: inner critic, break, imposter, perfectionism, shame, forgiveness, worth, body image, comparison, self-talk, self-care, boundaries
  ...dreamsTools, // 8 tools: clarification, bucket list, timeline, obstacles, progress, accountability, celebration, reconnection
  ...meaningTools, // 12 tools: values, purpose, meaning, existential, legacy, spiritual, conflict, purpose statement, work, philosophical, moral, authentic

  // Phase 4: Life Management (Family, Home, Legal)
  ...familyTools, // 11 tools: parenting, discipline, activities, milestones, celebration, transition, conflict, meeting, elder care, traditions, values
  ...homeTools, // 8 tools: maintenance, repair, declutter, organize, move, emergency, projects, contractors
  ...legalAdminTools, // 7 tools: documents, locate, estate, beneficiaries, insurance, taxes, annual tasks

  // Phase 5: Environment & Group Interactions
  ...vibeTools, // 4 tools: set vibe, environment status, adjust lights, list vibes
  ...groupConversationTools, // 3 tools: start roundtable, invite participant, end group conversation
];

/**
 * Tool definitions by category for selective loading
 */
export const toolsByCategory: Record<string, SemanticToolDefinition[]> = {
  // Safety-critical (highest priority)
  crisis: crisisTools,
  'trauma-support': traumaSupportTools,

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
  video: videoTools,

  // Travel
  travel: travelTools,

  // Communication
  communication: communicationTools,

  // Life domains
  finance: financeTools,
  telephony: telephonyTools,
  contacts: contactsTools,
  relationships: relationshipsTools,
  grief: griefTools,
  career: careerTools,
  decisions: decisionsTools,

  // Life coaching
  'life-coaching': lifeCoachingTools,
  dating: datingTools,

  // Productivity & Learning
  productivity: productivityTools,
  reminders: reminderSemanticTools,
  commitments: commitmentSemanticTools,
  learning: learningTools,

  // Recommendations & Smart Home
  recommendations: recommendationsTools,
  'smart-home': smartHomeTools,

  // Phase 1 additions (High Impact)
  books: booksTools,
  health: healthTools,
  connection: connectionTools,

  // General utilities
  dictionary: dictionaryTools,
  currency: currencyTools,
  alarms: alarmsTools,
  lists: listsTools,
  traffic: trafficTools,
  sms: smsTools,
  'voice-memos': voiceMemosTools,
  scheduling: schedulingTools,

  // Phase 2: Safety-Critical (Emotional Regulation)
  anger: angerTools,
  'burnout-recovery': burnoutRecoveryTools,

  // Phase 3: Growth
  'self-compassion': selfCompassionTools,
  dreams: dreamsTools,
  meaning: meaningTools,

  // Phase 4: Life Management
  family: familyTools,
  home: homeTools,
  'legal-admin': legalAdminTools,

  // Phase 5: Environment & Group
  vibe: vibeTools,
  'group-conversation': groupConversationTools,
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
 * Get high-priority tools (crisis + safety-critical + core functionality)
 * These should always be loaded for routing
 */
export function getHighPriorityTools(): SemanticToolDefinition[] {
  return [
    // Safety-critical
    ...crisisTools,
    ...traumaSupportTools,
    // Core functionality
    ...musicTools,
    ...handoffTools,
    ...weatherTools,
    ...calendarTools,
  ];
}
