/**
 * Domain Bridge - Connects Semantic Router to Real Domain Tools
 *
 * This module bridges semantic tool IDs to actual domain tool implementations.
 * When a semantic tool matches with high confidence, it delegates execution
 * to the real domain tool rather than using mock responses.
 *
 * COVERAGE: 260 semantic tools mapped to domain implementations
 *
 * @module tools/semantic-router/domain-bridge
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getTool as getDomainTool } from '../registry/index.js';
import type { ServiceRegistry } from '../registry/types.js';
import type { ToolExecutionContext, ToolExecutionResult } from './types.js';

const log = createLogger({ module: 'domain-bridge' });

// ============================================================================
// TOOL ID MAPPING: Semantic → Domain
// ============================================================================

/**
 * Maps semantic tool IDs to domain tool IDs and any argument transformations needed.
 */
interface ToolMapping {
  /** Domain tool ID to delegate to */
  domainToolId: string;
  /** Optional argument transformation */
  transformArgs?: (args: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Comprehensive mapping from semantic tool IDs to domain tool configurations.
 * Organized by category for maintainability.
 *
 * Total: 260 semantic tools mapped
 */
const TOOL_MAPPINGS: Record<string, ToolMapping> = {
  // ==========================================================================
  // 🎵 MUSIC & ENTERTAINMENT (10 tools)
  // ==========================================================================
  spotify_play: {
    domainToolId: 'playMusic',
    transformArgs: (args) => ({
      query: args.query || args.genre || args.mood || args.artist || 'music',
    }),
  },
  spotify_pause: {
    domainToolId: 'musicControl',
    transformArgs: () => ({ action: 'pause' }),
  },
  spotify_skip: {
    domainToolId: 'musicControl',
    transformArgs: () => ({ action: 'skip' }),
  },
  entertainment_movie: {
    domainToolId: 'recommendMovie',
    transformArgs: (args) => ({ genre: args.genre, mood: args.mood }),
  },
  entertainment_tv: {
    domainToolId: 'recommendTVShow',
    transformArgs: (args) => ({ genre: args.genre, mood: args.mood }),
  },
  entertainment_trending: {
    domainToolId: 'getTrending',
    transformArgs: (args) => ({ category: args.category || 'all' }),
  },
  game_play: {
    domainToolId: 'startGame',
    transformArgs: (args) => ({ gameType: args.gameType || args.game }),
  },
  game_trivia: {
    domainToolId: 'startGame',
    transformArgs: () => ({ gameType: 'trivia' }),
  },
  game_storytelling: {
    domainToolId: 'startGame',
    transformArgs: () => ({ gameType: 'storytelling' }),
  },

  // ==========================================================================
  // 🌤️ WEATHER & INFORMATION (12 tools)
  // ==========================================================================
  weather_current: {
    domainToolId: 'getWeather',
    transformArgs: (args) => ({ location: args.location || args.city }),
  },
  weather_forecast: {
    domainToolId: 'getWeatherForecast',
    transformArgs: (args) => ({ location: args.location || args.city, days: args.days ?? 5 }),
  },
  info_news: {
    domainToolId: 'getNews',
    transformArgs: (args) => ({ topic: args.topic, category: args.category }),
  },
  info_search: {
    domainToolId: 'webSearch',
    transformArgs: (args) => ({ query: args.query }),
  },
  info_time: {
    domainToolId: 'getCurrentTime',
    transformArgs: (args) => ({ timezone: args.timezone }),
  },
  info_date: {
    domainToolId: 'getCurrentDate',
    transformArgs: (args) => ({ timezone: args.timezone }),
  },
  traffic_commute: {
    domainToolId: 'getTrafficConditions',
    transformArgs: (args) => ({ origin: args.origin, destination: args.destination }),
  },
  traffic_directions: {
    domainToolId: 'getDirections',
    transformArgs: (args) => ({ origin: args.origin, destination: args.destination }),
  },
  traffic_save_location: {
    domainToolId: 'saveLocation',
    transformArgs: (args) => ({ name: args.name, address: args.address }),
  },
  dictionary_define: {
    domainToolId: 'defineWord',
    transformArgs: (args) => ({ word: args.word }),
  },
  dictionary_synonyms: {
    domainToolId: 'getSynonyms',
    transformArgs: (args) => ({ word: args.word }),
  },
  dictionary_wotd: {
    domainToolId: 'getWordOfTheDay',
  },

  // ==========================================================================
  // 📅 CALENDAR & SCHEDULING (15 tools)
  // ==========================================================================
  calendar_list_events: {
    domainToolId: 'getCalendarToday',
    transformArgs: (args) => ({ date: args.date, maxResults: args.maxResults ?? 10 }),
  },
  calendar_create_event: {
    domainToolId: 'createCalendarEvent',
    transformArgs: (args) => ({
      title: args.title || args.name,
      startTime: args.startTime || args.start || args.when,
      duration: args.duration ?? 60,
      description: args.description,
      location: args.location,
    }),
  },
  calendar_check_availability: {
    domainToolId: 'checkAvailability',
    transformArgs: (args) => ({ date: args.date, duration: args.duration }),
  },
  scheduling_best_time: {
    domainToolId: 'suggestMeetingTime',
    transformArgs: (args) => ({ participants: args.participants, duration: args.duration }),
  },
  scheduling_optimal_time: {
    domainToolId: 'scheduleAtBestTime',
    transformArgs: (args) => ({ task: args.task, duration: args.duration }),
  },
  scheduling_call: {
    domainToolId: 'scheduleCall',
    transformArgs: (args) => ({
      contact: args.contact,
      time: args.time,
      message: args.message,
    }),
  },
  scheduling_email: {
    domainToolId: 'scheduleEmail',
    transformArgs: (args) => ({
      to: args.to,
      subject: args.subject,
      body: args.body,
      sendAt: args.sendAt,
    }),
  },
  scheduling_text: {
    domainToolId: 'scheduleText',
    transformArgs: (args) => ({
      to: args.to,
      message: args.message,
      sendAt: args.sendAt,
    }),
  },
  scheduling_cancel: {
    domainToolId: 'cancelScheduled',
    transformArgs: (args) => ({ id: args.id }),
  },
  scheduling_list: {
    domainToolId: 'listScheduled',
    transformArgs: (args) => ({ type: args.type }),
  },
  scheduling_save_contact: {
    domainToolId: 'saveContact',
    transformArgs: (args) => ({ name: args.name, phone: args.phone, email: args.email }),
  },
  scheduling_send_now: {
    domainToolId: 'sendNow',
    transformArgs: (args) => ({ type: args.type, to: args.to, content: args.content }),
  },

  // ==========================================================================
  // ⏰ ALARMS, TIMERS & REMINDERS (12 tools)
  // ==========================================================================
  alarms_set: {
    domainToolId: 'setAlarm',
    transformArgs: (args) => ({ time: args.time, label: args.label, recurring: args.recurring }),
  },
  alarms_list: {
    domainToolId: 'getAlarms',
  },
  alarms_delete: {
    domainToolId: 'deleteAlarm',
    transformArgs: (args) => ({ id: args.id }),
  },
  alarms_snooze: {
    domainToolId: 'snoozeAlarm',
    transformArgs: (args) => ({ id: args.id, minutes: args.minutes ?? 10 }),
  },
  productivity_set_reminder: {
    domainToolId: 'setReminder',
    transformArgs: (args) => ({ message: args.message, time: args.time }),
  },
  productivity_get_reminders: {
    domainToolId: 'getReminders',
  },
  productivity_cancel_reminder: {
    domainToolId: 'cancelReminder',
    transformArgs: (args) => ({ id: args.id }),
  },

  // ==========================================================================
  // 📝 PRODUCTIVITY & LISTS (15 tools)
  // ==========================================================================
  productivity_tasks: {
    domainToolId: 'manageTasks',
    transformArgs: (args) => ({ action: args.action, task: args.task }),
  },
  productivity_notes: {
    domainToolId: 'manageNotes',
    transformArgs: (args) => ({ action: args.action, content: args.content }),
  },
  productivity_focus: {
    domainToolId: 'startFocusSession',
    transformArgs: (args) => ({ duration: args.duration, task: args.task }),
  },
  productivity_time: {
    domainToolId: 'timeTracker',
    transformArgs: (args) => ({ action: args.action, project: args.project }),
  },
  productivity_record_commitment: {
    domainToolId: 'recordCommitment',
    transformArgs: (args) => ({ commitment: args.commitment, deadline: args.deadline }),
  },
  productivity_get_commitments: {
    domainToolId: 'getCommitments',
  },
  productivity_complete_commitment: {
    domainToolId: 'completeCommitment',
    transformArgs: (args) => ({ id: args.id }),
  },
  productivity_defer_commitment: {
    domainToolId: 'deferCommitment',
    transformArgs: (args) => ({ id: args.id, newDeadline: args.newDeadline }),
  },
  lists_create: {
    domainToolId: 'createList',
    transformArgs: (args) => ({ name: args.name, type: args.type }),
  },
  lists_add: {
    domainToolId: 'addToList',
    transformArgs: (args) => ({ listName: args.listName, item: args.item }),
  },
  lists_view: {
    domainToolId: 'viewList',
    transformArgs: (args) => ({ listName: args.listName }),
  },
  lists_check: {
    domainToolId: 'checkOffItem',
    transformArgs: (args) => ({ listName: args.listName, item: args.item }),
  },
  lists_delete: {
    domainToolId: 'deleteList',
    transformArgs: (args) => ({ listName: args.listName }),
  },
  lists_all: {
    domainToolId: 'getAllLists',
  },

  // ==========================================================================
  // 💬 COMMUNICATION & CONTACTS (20 tools)
  // ==========================================================================
  comm_send_message: {
    domainToolId: 'sendMessage',
    transformArgs: (args) => ({ to: args.to, message: args.message, type: args.type }),
  },
  comm_draft_message: {
    domainToolId: 'draftMessage',
    transformArgs: (args) => ({ to: args.to, subject: args.subject, context: args.context }),
  },
  comm_schedule_reminder: {
    domainToolId: 'scheduleReminder',
    transformArgs: (args) => ({ contact: args.contact, when: args.when, about: args.about }),
  },
  comm_roleplay: {
    domainToolId: 'roleplayConversation',
    transformArgs: (args) => ({ scenario: args.scenario, role: args.role }),
  },
  comm_analyze_message: {
    domainToolId: 'analyzeMessage',
    transformArgs: (args) => ({ message: args.message }),
  },
  comm_strategy: {
    domainToolId: 'communicationStrategy',
    transformArgs: (args) => ({ situation: args.situation, goal: args.goal }),
  },
  comm_assertiveness: {
    domainToolId: 'assertNotAggressive',
    transformArgs: (args) => ({ message: args.message, context: args.context }),
  },
  comm_follow_up: {
    domainToolId: 'scheduleFollowUp',
    transformArgs: (args) => ({ contact: args.contact, topic: args.topic, when: args.when }),
  },
  // Contact tools - mapped to existing communication domain tools
  contact_save: {
    domainToolId: 'saveContact', // Exact match
    transformArgs: (args) => ({ name: args.name, phone: args.phone, email: args.email }),
  },
  contact_info: {
    domainToolId: 'getContactInfo', // Exact match
    transformArgs: (args) => ({ name: args.name }),
  },
  contact_list: {
    domainToolId: 'getContactsNeedingAttention', // Uses attention list
    transformArgs: (args) => ({ filter: args.filter }),
  },
  contact_interaction: {
    domainToolId: 'recordContactInteraction', // Uses exact existing tool
    transformArgs: (args) => ({ contact: args.contact, type: args.type, notes: args.notes }),
  },
  contact_followup_set: {
    domainToolId: 'setContactFollowUp', // Uses exact existing tool
    transformArgs: (args) => ({ contact: args.contact, when: args.when, about: args.about }),
  },
  contact_followup_complete: {
    domainToolId: 'completeContactFollowUp', // Uses exact existing tool
    transformArgs: (args) => ({ id: args.id }),
  },
  contact_history: {
    domainToolId: 'getContactInteractionHistory', // Uses exact existing tool
    transformArgs: (args) => ({ contact: args.contact }),
  },
  contact_stats: {
    domainToolId: 'getContactStats', // Exact match
    transformArgs: (args) => ({ contact: args.contact }),
  },
  contact_insights: {
    domainToolId: 'getContactInsights', // Uses exact existing tool
    transformArgs: (args) => ({ contact: args.contact }),
  },
  sms_read: {
    domainToolId: 'readSMS',
    transformArgs: (args) => ({ from: args.from, count: args.count ?? 5 }),
  },
  sms_check_new: {
    domainToolId: 'checkNewMessages',
  },
  sms_search: {
    domainToolId: 'searchMessages',
    transformArgs: (args) => ({ query: args.query }),
  },

  // ==========================================================================
  // 🧠 MEMORY & VOICE MEMOS (8 tools)
  // ==========================================================================
  memory_save: {
    domainToolId: 'saveMemory',
    transformArgs: (args) => ({ content: args.content, tags: args.tags, type: args.type }),
  },
  memory_recall: {
    domainToolId: 'recallMemory',
    transformArgs: (args) => ({ query: args.query, type: args.type }),
  },
  memory_people: {
    domainToolId: 'rememberPerson',
    transformArgs: (args) => ({ name: args.name, details: args.details }),
  },
  voice_memo_save: {
    domainToolId: 'saveVoiceMemo',
    transformArgs: (args) => ({ content: args.content, tags: args.tags }),
  },
  voice_memo_list: {
    domainToolId: 'listVoiceMemos',
    transformArgs: (args) => ({ filter: args.filter }),
  },
  voice_memo_recall: {
    domainToolId: 'recallVoiceMemo',
    transformArgs: (args) => ({ query: args.query }),
  },
  voice_memo_search: {
    domainToolId: 'searchVoiceMemos',
    transformArgs: (args) => ({ query: args.query }),
  },
  voice_memo_delete: {
    domainToolId: 'deleteVoiceMemo',
    transformArgs: (args) => ({ id: args.id }),
  },

  // ==========================================================================
  // 🤝 HANDOFF & NAVIGATION (3 tools)
  // ==========================================================================
  handoff: {
    domainToolId: 'handoff',
    transformArgs: (args) => ({
      targetPersona: args.targetPersona || args.persona,
      reason: args.reason,
    }),
  },
  handoff_maya_implicit: {
    domainToolId: 'handoff',
    transformArgs: (args) => ({ targetPersona: 'maya', reason: args.topic || 'habit coaching' }),
  },

  // ==========================================================================
  // 📱 TELEPHONY (3 tools)
  // ==========================================================================
  telephony_call: {
    domainToolId: 'initiateCall',
    transformArgs: (args) => ({ contact: args.contact, reason: args.reason }),
  },
  telephony_callback: {
    domainToolId: 'scheduleCallback',
    transformArgs: (args) => ({ contact: args.contact, when: args.when }),
  },
  telephony_voicemail: {
    domainToolId: 'checkVoicemail',
  },

  // ==========================================================================
  // 🏋️ HABITS & ROUTINES (8 tools)
  // ==========================================================================
  habit_create: {
    domainToolId: 'addHabit',
    transformArgs: (args) => ({
      name: args.name,
      frequency: args.frequency,
      cue: args.cue,
      reward: args.reward,
    }),
  },
  habit_track: {
    domainToolId: 'logHabit',
    transformArgs: (args) => ({ habitName: args.habitName, completed: args.completed ?? true }),
  },
  habit_coaching: {
    domainToolId: 'habitCoaching',
    transformArgs: (args) => ({ topic: args.topic, habit: args.habit }),
  },
  habits_list: {
    domainToolId: 'getDueHabits',
  },

  // ==========================================================================
  // 🚨 CRISIS & SAFETY (4 tools)
  // ==========================================================================
  crisis_support: {
    domainToolId: 'provideCrisisResources',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  safety_planning: {
    domainToolId: 'createSafetyPlan',
    transformArgs: (args) => ({
      triggers: args.triggers,
      copingStrategies: args.copingStrategies,
    }),
  },
  grounding_exercise: {
    domainToolId: 'guideGroundingExercise',
    transformArgs: (args) => ({ type: args.type || '54321' }),
  },

  // ==========================================================================
  // 💭 GRIEF & LOSS (3 tools)
  // ==========================================================================
  grief_support: {
    domainToolId: 'acknowledgeLoss',
    transformArgs: (args) => ({ lossType: args.lossType, stage: args.stage }),
  },
  grief_waves: {
    domainToolId: 'navigateGriefWave',
    transformArgs: (args) => ({ trigger: args.trigger }),
  },
  grief_honor: {
    domainToolId: 'honorMemory',
    transformArgs: (args) => ({ person: args.person, memory: args.memory }),
  },

  // ==========================================================================
  // 🌟 DREAMS & ASPIRATIONS (8 tools)
  // ==========================================================================
  dreams_clarify: {
    domainToolId: 'clarifyDream',
    transformArgs: (args) => ({ dream: args.dream }),
  },
  dreams_bucket_list: {
    domainToolId: 'bucketList',
    transformArgs: (args) => ({ action: args.action, item: args.item }),
  },
  dreams_timeline: {
    domainToolId: 'createDreamTimeline',
    transformArgs: (args) => ({ dream: args.dream, targetDate: args.targetDate }),
  },
  dreams_obstacles: {
    domainToolId: 'identifyObstacles',
    transformArgs: (args) => ({ dream: args.dream }),
  },
  dreams_progress: {
    domainToolId: 'trackDreamProgress',
    transformArgs: (args) => ({ dream: args.dream }),
  },
  dreams_accountability: {
    domainToolId: 'dreamAccountability',
    transformArgs: (args) => ({ dream: args.dream, commitment: args.commitment }),
  },
  dreams_celebration: {
    domainToolId: 'celebrateDreamProgress',
    transformArgs: (args) => ({ dream: args.dream, milestone: args.milestone }),
  },
  dreams_reconnection: {
    domainToolId: 'reconnectWithDream',
    transformArgs: (args) => ({ dream: args.dream }),
  },

  // ==========================================================================
  // 🤔 DECISIONS (4 tools)
  // ==========================================================================
  decision_help: {
    domainToolId: 'decisionFramework',
    transformArgs: (args) => ({ decision: args.decision, options: args.options }),
  },
  decision_procon: {
    domainToolId: 'analyzeProsAndCons',
    transformArgs: (args) => ({ option: args.option }),
  },
  decision_values: {
    domainToolId: 'alignWithValues',
    transformArgs: (args) => ({ decision: args.decision }),
  },
  decision_regret: {
    domainToolId: 'regretMinimization',
    transformArgs: (args) => ({ decision: args.decision }),
  },

  // ==========================================================================
  // 🔥 BURNOUT & ENERGY (5 tools)
  // ==========================================================================
  burnout_assess: {
    domainToolId: 'assessBurnout',
  },
  burnout_plan_recovery: {
    domainToolId: 'burnoutRecoveryPlan',
    transformArgs: (args) => ({ severity: args.severity }),
  },
  burnout_work_boundaries: {
    domainToolId: 'workBoundaries',
    transformArgs: (args) => ({ area: args.area }),
  },
  burnout_restore_energy: {
    domainToolId: 'restoreEnergy',
    transformArgs: (args) => ({ energyLevel: args.energyLevel }),
  },
  burnout_prevention: {
    domainToolId: 'burnoutWarningSigns',
  },

  // ==========================================================================
  // 💼 CAREER (5 tools)
  // ==========================================================================
  career_job_search: {
    domainToolId: 'suggestJobSearchStrategy',
    transformArgs: (args) => ({ field: args.field, experience: args.experience }),
  },
  career_interview: {
    domainToolId: 'practiceInterview',
    transformArgs: (args) => ({ jobType: args.jobType, interviewType: args.interviewType }),
  },
  career_resume: {
    domainToolId: 'reviewResume',
    transformArgs: (args) => ({ content: args.content }),
  },
  career_development: {
    domainToolId: 'careerDevelopment',
    transformArgs: (args) => ({ goal: args.goal, currentRole: args.currentRole }),
  },
  career_workplace: {
    domainToolId: 'workplaceChallenge',
    transformArgs: (args) => ({ challenge: args.challenge }),
  },

  // ==========================================================================
  // 💰 FINANCE (5 tools)
  // ==========================================================================
  finance_budget: {
    domainToolId: 'budgeting',
    transformArgs: (args) => ({ action: args.action, category: args.category }),
  },
  finance_bills: {
    domainToolId: 'manageBills',
    transformArgs: (args) => ({ action: args.action, bill: args.bill }),
  },
  finance_calculator: {
    domainToolId: 'financialCalculator',
    transformArgs: (args) => ({ type: args.type, values: args.values }),
  },
  finance_savings: {
    domainToolId: 'savingsGoals',
    transformArgs: (args) => ({ action: args.action, goal: args.goal }),
  },
  currency_convert: {
    domainToolId: 'convertCurrency',
    transformArgs: (args) => ({ amount: args.amount, from: args.from, to: args.to }),
  },
  currency_rate: {
    domainToolId: 'getExchangeRate',
    transformArgs: (args) => ({ from: args.from, to: args.to }),
  },
  currency_list: {
    domainToolId: 'listCurrencies',
  },

  // ==========================================================================
  // 👨‍👩‍👧‍👦 FAMILY (11 tools)
  // ==========================================================================
  // Family tools - mapped to existing domain tools
  family_parenting_challenge: {
    domainToolId: 'coachParentingChallenge', // Uses exact existing tool
    transformArgs: (args) => ({ challenge: args.challenge, childAge: args.childAge }),
  },
  family_discipline: {
    domainToolId: 'navigateDiscipline', // Uses exact existing tool
    transformArgs: (args) => ({ behavior: args.behavior, childAge: args.childAge }),
  },
  family_activities: {
    domainToolId: 'suggestAgeAppropriateActivity', // Exact match
    transformArgs: (args) => ({ childAge: args.childAge, context: args.context }),
  },
  family_milestones: {
    domainToolId: 'trackChildMilestone', // Uses exact existing tool
    transformArgs: (args) => ({ child: args.child, milestone: args.milestone }),
  },
  family_celebrate: {
    domainToolId: 'celebrateFamilyMoment', // Exact match
    transformArgs: (args) => ({ moment: args.moment }),
  },
  family_transition: {
    domainToolId: 'supportFamilyTransition', // Exact match
    transformArgs: (args) => ({ transition: args.transition }),
  },
  family_conflict: {
    domainToolId: 'navigateFamilyConflict', // Uses exact existing tool
    transformArgs: (args) => ({ conflict: args.conflict }),
  },
  family_meeting: {
    domainToolId: 'planFamilyMeeting', // Exact match
    transformArgs: (args) => ({ topics: args.topics }),
  },
  family_elder_care: {
    domainToolId: 'coordinateElderCare', // Uses exact existing tool
    transformArgs: (args) => ({ concern: args.concern }),
  },
  family_traditions: {
    domainToolId: 'createFamilyTradition', // Uses exact existing tool
    transformArgs: (args) => ({ action: args.action, tradition: args.tradition }),
  },
  family_values: {
    domainToolId: 'discussValues', // Uses exact existing tool
  },

  // ==========================================================================
  // 🤗 CONNECTION & LONELINESS (7 tools)
  // ==========================================================================
  connection_loneliness: {
    domainToolId: 'acknowledgeLoneliness',
  },
  connection_presence: {
    domainToolId: 'offerPresence',
  },
  connection_make_friends: {
    domainToolId: 'makeFriends',
    transformArgs: (args) => ({ context: args.context }),
  },
  connection_maintain: {
    domainToolId: 'maintainConnections',
    transformArgs: (args) => ({ relationship: args.relationship }),
  },
  connection_belonging: {
    domainToolId: 'findBelonging',
    transformArgs: (args) => ({ interests: args.interests }),
  },
  connection_health: {
    domainToolId: 'assessConnectionHealth',
  },
  connection_small_acts: {
    domainToolId: 'smallActsOfConnection',
  },

  // ==========================================================================
  // 😠 ANGER MANAGEMENT (8 tools)
  // ==========================================================================
  // Anger tools - mapped to existing domain tools
  anger_validate: {
    domainToolId: 'understandAnger', // Maps to understandAnger for validation
    transformArgs: (args) => ({ situation: args.situation, context: 'validate' }),
  },
  anger_physical_release: {
    domainToolId: 'angerCoolDown', // Physical release uses cool down techniques
    transformArgs: (args) => ({ method: 'physical' }),
  },
  anger_cool_down: {
    domainToolId: 'angerCoolDown',
    transformArgs: (args) => ({ intensity: args.intensity }),
  },
  anger_to_action: {
    domainToolId: 'expressAngerHealthily', // Channel to action uses healthy expression
    transformArgs: (args) => ({ situation: args.situation, mode: 'constructive' }),
  },
  anger_journaling: {
    domainToolId: 'expressAngerHealthily', // Journaling is healthy expression
    transformArgs: (args) => ({ trigger: args.trigger, method: 'journaling' }),
  },
  anger_identify_triggers: {
    domainToolId: 'identifyAngerTriggers',
  },
  anger_assertive_communication: {
    domainToolId: 'assertNotAggressive',
    transformArgs: (args) => ({ message: args.message }),
  },
  anger_history: {
    domainToolId: 'chronicAnger', // History exploration uses chronic anger patterns
    transformArgs: (args) => ({ mode: 'history_exploration' }),
  },

  // ==========================================================================
  // 💕 DATING (4 tools)
  // ==========================================================================
  dating_advice: {
    domainToolId: 'datingAdvice',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  dating_apps: {
    domainToolId: 'datingAppStrategy',
    transformArgs: (args) => ({ platform: args.platform }),
  },
  dating_first_date: {
    domainToolId: 'firstDatePrep',
    transformArgs: (args) => ({ context: args.context }),
  },
  dating_breakup: {
    domainToolId: 'breakupSupport',
    transformArgs: (args) => ({ stage: args.stage }),
  },

  // ==========================================================================
  // 📚 BOOKS (8 tools)
  // ==========================================================================
  books_search: {
    domainToolId: 'searchBooks',
    transformArgs: (args) => ({ query: args.query, genre: args.genre }),
  },
  books_what_to_read: {
    domainToolId: 'recommendBook',
    transformArgs: (args) => ({ mood: args.mood, genre: args.genre }),
  },
  books_popular: {
    domainToolId: 'getPopularBooks',
    transformArgs: (args) => ({ genre: args.genre }),
  },
  books_add_to_list: {
    domainToolId: 'addToReadingList',
    transformArgs: (args) => ({ title: args.title, author: args.author }),
  },
  books_get_list: {
    domainToolId: 'getReadingList',
  },
  books_mark_read: {
    domainToolId: 'markBookRead',
    transformArgs: (args) => ({ title: args.title, rating: args.rating }),
  },
  books_remove: {
    domainToolId: 'removeFromReadingList',
    transformArgs: (args) => ({ title: args.title }),
  },
  books_stats: {
    domainToolId: 'getReadingStats',
  },

  // ==========================================================================
  // 🎬 VIDEO (4 tools)
  // ==========================================================================
  video_search_youtube: {
    domainToolId: 'searchYouTube',
    transformArgs: (args) => ({ query: args.query }),
  },
  video_recommendations: {
    domainToolId: 'recommendVideos',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  video_trending: {
    domainToolId: 'getTrendingVideos',
    transformArgs: (args) => ({ category: args.category }),
  },
  video_details: {
    domainToolId: 'getVideoDetails',
    transformArgs: (args) => ({ videoId: args.videoId }),
  },

  // ==========================================================================
  // 🏥 HEALTH & WELLNESS (12 tools)
  // ==========================================================================
  health_energy: {
    domainToolId: 'assessEnergyLevel',
  },
  health_energy_boost: {
    domainToolId: 'suggestEnergyBoost',
    transformArgs: (args) => ({ currentEnergy: args.currentEnergy }),
  },
  health_hydration: {
    domainToolId: 'trackHydration',
    transformArgs: (args) => ({ glasses: args.glasses }),
  },
  health_sleep: {
    domainToolId: 'analyzeSleepPattern',
    transformArgs: (args) => ({ hours: args.hours, quality: args.quality }),
  },
  health_sleep_tips: {
    domainToolId: 'suggestSleepHygiene',
    transformArgs: (args) => ({ issue: args.issue }),
  },
  health_nutrition: {
    domainToolId: 'nutritionAdvice',
    transformArgs: (args) => ({ goal: args.goal }),
  },
  health_log_exercise: {
    domainToolId: 'logExercise',
    transformArgs: (args) => ({ type: args.type, duration: args.duration }),
  },
  health_suggest_workout: {
    domainToolId: 'suggestWorkout',
    transformArgs: (args) => ({ fitness: args.fitness, time: args.time }),
  },
  sleep_help: {
    domainToolId: 'sleepSupport',
    transformArgs: (args) => ({ issue: args.issue }),
  },
  wellness_checkin: {
    domainToolId: 'wellnessCheckin',
  },

  // ==========================================================================
  // 🏠 HOME (7 tools)
  // ==========================================================================
  home_maintenance: {
    domainToolId: 'homeMaintenanceReminder',
    transformArgs: (args) => ({ area: args.area }),
  },
  home_repair: {
    domainToolId: 'homeRepairAdvice',
    transformArgs: (args) => ({ issue: args.issue }),
  },
  home_contractor: {
    domainToolId: 'findContractor',
    transformArgs: (args) => ({ service: args.service }),
  },
  home_organize: {
    domainToolId: 'organizeSpace',
    transformArgs: (args) => ({ space: args.space }),
  },
  home_declutter: {
    domainToolId: 'declutterHelp',
    transformArgs: (args) => ({ area: args.area }),
  },
  home_move: {
    domainToolId: 'movingChecklist',
    transformArgs: (args) => ({ timeline: args.timeline }),
  },
  home_project: {
    domainToolId: 'homeProjectPlanner',
    transformArgs: (args) => ({ project: args.project }),
  },
  home_emergency: {
    domainToolId: 'assessEmergencyPreparedness',
  },

  // ==========================================================================
  // 📖 LEARNING (4 tools)
  // ==========================================================================
  learning_skills: {
    domainToolId: 'learnNewSkill',
    transformArgs: (args) => ({ skill: args.skill }),
  },
  learning_study: {
    domainToolId: 'studyTechniques',
    transformArgs: (args) => ({ subject: args.subject }),
  },
  learning_language: {
    domainToolId: 'languageLearning',
    transformArgs: (args) => ({ language: args.language, level: args.level }),
  },
  learning_explain: {
    domainToolId: 'explainConcept',
    transformArgs: (args) => ({ concept: args.concept, level: args.level }),
  },

  // ==========================================================================
  // ⚖️ LEGAL & ADMIN (7 tools)
  // ==========================================================================
  legal_organize_docs: {
    domainToolId: 'organizeDocuments',
    transformArgs: (args) => ({ category: args.category }),
  },
  legal_locate_doc: {
    domainToolId: 'findDocument',
    transformArgs: (args) => ({ docType: args.docType }),
  },
  legal_estate_planning: {
    domainToolId: 'estatePlanningChecklist',
  },
  legal_insurance: {
    domainToolId: 'insuranceReview',
    transformArgs: (args) => ({ type: args.type }),
  },
  legal_beneficiaries: {
    domainToolId: 'reviewBeneficiaries',
  },
  legal_tax_prep: {
    domainToolId: 'taxPrepChecklist',
    transformArgs: (args) => ({ year: args.year }),
  },
  legal_annual_tasks: {
    domainToolId: 'reminderAnnualTasks',
  },

  // ==========================================================================
  // 🧘 SELF-COMPASSION (12 tools)
  // ==========================================================================
  self_compassion_inner_critic: {
    domainToolId: 'innerCriticWork',
    transformArgs: (args) => ({ criticism: args.criticism }),
  },
  self_compassion_self_talk: {
    domainToolId: 'reframeSelfTalk',
    transformArgs: (args) => ({ thought: args.thought }),
  },
  self_compassion_forgiveness: {
    domainToolId: 'selfForgiveness',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  self_compassion_perfectionism: {
    domainToolId: 'addressPerfectionism',
    transformArgs: (args) => ({ area: args.area }),
  },
  self_compassion_imposter: {
    domainToolId: 'addressImposter',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  self_compassion_comparison: {
    domainToolId: 'stopComparing',
    transformArgs: (args) => ({ trigger: args.trigger }),
  },
  self_compassion_shame: {
    domainToolId: 'processShame',
    transformArgs: (args) => ({ trigger: args.trigger }),
  },
  self_compassion_worth: {
    domainToolId: 'affirmWorth',
  },
  self_compassion_break: {
    domainToolId: 'selfCompassionBreak',
  },
  self_compassion_self_care: {
    domainToolId: 'suggestSelfCare',
    transformArgs: (args) => ({ need: args.need }),
  },
  self_compassion_boundaries: {
    domainToolId: 'boundaryInventory',
  },
  self_compassion_body_image: {
    domainToolId: 'bodyImageCompassion',
    transformArgs: (args) => ({ trigger: args.trigger }),
  },

  // ==========================================================================
  // 🧠 MEANING & PURPOSE (12 tools)
  // ==========================================================================
  meaning_clarify_values: {
    domainToolId: 'clarifyValues',
  },
  meaning_purpose: {
    domainToolId: 'explorePurpose',
    transformArgs: (args) => ({ area: args.area }),
  },
  meaning_purpose_statement: {
    domainToolId: 'createPurposeStatement',
  },
  meaning_legacy: {
    domainToolId: 'exploreLegacy',
  },
  meaning_existential: {
    domainToolId: 'existentialExploration',
    transformArgs: (args) => ({ question: args.question }),
  },
  meaning_philosophical: {
    domainToolId: 'philosophicalInquiry',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  meaning_spiritual: {
    domainToolId: 'spiritualExploration',
    transformArgs: (args) => ({ tradition: args.tradition }),
  },
  meaning_value_conflict: {
    domainToolId: 'valueConflict',
    transformArgs: (args) => ({ values: args.values }),
  },
  meaning_moral_dilemma: {
    domainToolId: 'moralDilemma',
    transformArgs: (args) => ({ dilemma: args.dilemma }),
  },
  meaning_authentic: {
    domainToolId: 'authenticLiving',
    transformArgs: (args) => ({ area: args.area }),
  },
  meaning_making: {
    domainToolId: 'meaningMaking',
    transformArgs: (args) => ({ experience: args.experience }),
  },
  meaning_work: {
    domainToolId: 'meaningfulWork',
    transformArgs: (args) => ({ currentSituation: args.currentSituation }),
  },

  // ==========================================================================
  // 🛡️ TRAUMA SUPPORT (7 tools)
  // ==========================================================================
  trauma_aware_support: {
    domainToolId: 'traumaAwareSupport',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  trauma_grounding: {
    domainToolId: 'groundingForTrauma',
    transformArgs: (args) => ({ intensity: args.intensity }),
  },
  trauma_education: {
    domainToolId: 'traumaEducation',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  trauma_window_of_tolerance: {
    domainToolId: 'windowOfTolerance',
    transformArgs: (args) => ({ state: args.state }),
  },
  trauma_support_system: {
    domainToolId: 'buildSupportSystem',
  },
  trauma_professional_resources: {
    domainToolId: 'professionalResources',
    transformArgs: (args) => ({ need: args.need }),
  },
  trauma_timeline: {
    domainToolId: 'processTraumaTimeline',
    transformArgs: (args) => ({ ready: args.ready }),
  },

  // ==========================================================================
  // 💑 RELATIONSHIPS (3 tools)
  // ==========================================================================
  // Relationship tools - mapped to existing domain tools
  relationship_advice: {
    domainToolId: 'assessRelationshipHealth', // Uses health assessment for advice
    transformArgs: (args) => ({ situation: args.situation }),
  },
  relationship_conflict: {
    domainToolId: 'navigateConflict', // Uses exact existing tool
    transformArgs: (args) => ({ conflict: args.conflict }),
  },
  relationship_family: {
    domainToolId: 'supportFamilyTransition', // Uses family transition for relationships
    transformArgs: (args) => ({ relationship: args.relationship }),
  },
  relationship_friendship: {
    domainToolId: 'checkInOnSomeone', // Uses check-in for friendship advice
    transformArgs: (args) => ({ situation: args.situation }),
  },

  // ==========================================================================
  // 🎁 RECOMMENDATIONS (4 tools)
  // ==========================================================================
  recommend_books: {
    domainToolId: 'recommendBook',
    transformArgs: (args) => ({ mood: args.mood, genre: args.genre }),
  },
  recommend_podcasts: {
    domainToolId: 'recommendPodcast',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  recommend_restaurants: {
    domainToolId: 'recommendRestaurant',
    transformArgs: (args) => ({ cuisine: args.cuisine, occasion: args.occasion }),
  },
  recommend_gifts: {
    domainToolId: 'recommendGift',
    transformArgs: (args) => ({ person: args.person, occasion: args.occasion }),
  },

  // ==========================================================================
  // ✈️ TRAVEL (6 tools)
  // ==========================================================================
  travel_search_flights: {
    domainToolId: 'searchFlights',
    transformArgs: (args) => ({
      from: args.from,
      to: args.to,
      date: args.date,
      returnDate: args.returnDate,
    }),
  },
  travel_search_hotels: {
    domainToolId: 'searchHotels',
    transformArgs: (args) => ({
      location: args.location,
      checkIn: args.checkIn,
      checkOut: args.checkOut,
    }),
  },
  travel_flight_price: {
    domainToolId: 'getFlightPrice',
    transformArgs: (args) => ({ from: args.from, to: args.to, date: args.date }),
  },
  travel_plan_trip: {
    domainToolId: 'planTrip',
    transformArgs: (args) => ({ destination: args.destination, duration: args.duration }),
  },
  travel_suggestions: {
    domainToolId: 'suggestDestination',
    transformArgs: (args) => ({ preferences: args.preferences }),
  },
  travel_saved_trips: {
    domainToolId: 'getSavedTrips',
  },

  // ==========================================================================
  // 🏠 SMART HOME & VIBE (8 tools)
  // ==========================================================================
  smarthome_lights: {
    domainToolId: 'controlLights',
    transformArgs: (args) => ({
      room: args.room,
      action: args.action,
      brightness: args.brightness,
    }),
  },
  smarthome_thermostat: {
    domainToolId: 'setThermostatTemperature',
    transformArgs: (args) => ({ temperature: args.temperature }),
  },
  smarthome_locks: {
    domainToolId: 'controlLocks',
    transformArgs: (args) => ({ lock: args.lock, action: args.action }),
  },
  smarthome_devices: {
    domainToolId: 'listSmartDevices',
  },
  setVibe: {
    domainToolId: 'setVibe',
    transformArgs: (args) => ({ vibe: args.vibe, room: args.room }),
  },
  listVibes: {
    domainToolId: 'listVibes',
  },
  adjustLights: {
    domainToolId: 'adjustLights',
    transformArgs: (args) => ({ room: args.room, level: args.level, color: args.color }),
  },
  getEnvironmentStatus: {
    domainToolId: 'getEnvironmentStatus',
  },

  // ==========================================================================
  // 👥 GROUP CONVERSATIONS (3 tools)
  // ==========================================================================
  startRoundtable: {
    domainToolId: 'startRoundtable',
    transformArgs: (args) => ({ topic: args.topic, participants: args.participants }),
  },
  inviteParticipant: {
    domainToolId: 'inviteToConversation',
    transformArgs: (args) => ({ participant: args.participant }),
  },
  endGroupConversation: {
    domainToolId: 'endGroupConversation',
  },

  // ==========================================================================
  // 🧠 COACHING SPECIALTIES (7 tools)
  // ==========================================================================
  coaching_motivation: {
    domainToolId: 'motivationCoaching',
    transformArgs: (args) => ({ area: args.area }),
  },
  coaching_procrastination: {
    domainToolId: 'procrastinationSupport',
    transformArgs: (args) => ({ task: args.task }),
  },
  coaching_perfectionism: {
    domainToolId: 'addressPerfectionism',
    transformArgs: (args) => ({ area: args.area }),
  },
  coaching_boundaries: {
    domainToolId: 'boundaryCoaching',
    transformArgs: (args) => ({ relationship: args.relationship }),
  },
  coaching_self_compassion: {
    domainToolId: 'selfCompassionCoaching',
  },
  coaching_burnout: {
    domainToolId: 'burnoutCoaching',
    transformArgs: (args) => ({ severity: args.severity }),
  },
  coaching_anger: {
    domainToolId: 'angerCoaching',
    transformArgs: (args) => ({ trigger: args.trigger }),
  },
};

// ==========================================================================
// BRIDGE FUNCTIONS
// ==========================================================================

/**
 * Check if a semantic tool has a domain mapping.
 */
export function hasDomainMapping(semanticToolId: string): boolean {
  return semanticToolId in TOOL_MAPPINGS;
}

/**
 * Get the domain tool ID for a semantic tool.
 */
export function getDomainToolId(semanticToolId: string): string | undefined {
  return TOOL_MAPPINGS[semanticToolId]?.domainToolId;
}

/**
 * Transform arguments from semantic format to domain format.
 */
export function transformArguments(
  semanticToolId: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const mapping = TOOL_MAPPINGS[semanticToolId];
  if (!mapping) return args;

  return mapping.transformArgs ? mapping.transformArgs(args) : args;
}

// ==========================================================================
// GRACEFUL FALLBACK RESPONSES
// ==========================================================================

/**
 * Category-specific fallback responses when a domain tool isn't implemented yet.
 * These provide warm, human responses while allowing the LLM to continue the conversation.
 */
const FALLBACK_RESPONSES: Record<string, (args: Record<string, unknown>) => string> = {
  // Coaching & Support
  coaching: () =>
    "I'd love to help with that. Let me share some thoughts based on what I know about you.",
  support: () => "I hear you. Let's talk through this together.",
  motivation: () =>
    'Finding motivation can be tricky. Let me share what I think might help based on our conversations.',

  // Self-Compassion & Mindfulness
  self: () =>
    "Self-care is so important. Let me offer some gentle guidance from what I've learned about what works for you.",
  affirm: () =>
    "You deserve kindness, especially from yourself. Let's explore what's coming up for you.",
  mindful: () => 'Taking a mindful moment is a beautiful practice. Let me guide you through it.',

  // Relationships & Communication
  conflict: () =>
    'Navigating conflict is hard. I can help you think through this from what I know about your situation.',
  relationship: () =>
    "Relationships are so important. Let me share some thoughts based on what you've told me.",
  dating: () =>
    'Dating can be exciting and nerve-wracking! Let me help you think through your approach.',
  breakup: () =>
    "I'm here for you during this difficult time. Let's process what you're feeling together.",

  // Dreams & Purpose
  dream: () =>
    "Your dreams matter so much. Let me help you explore this based on what you've shared about your aspirations.",
  purpose: () =>
    'Finding purpose is a beautiful journey. Let me reflect back what I see in our conversations.',
  meaning: () =>
    "Questions of meaning are profound. I'd love to explore this with you based on what I know about your values.",

  // Career & Work
  career: () =>
    "Career growth is important. Let me share some thoughts based on what you've told me about your goals.",
  work: () =>
    'Work challenges can be tough. Let me help you think through this from your perspective.',
  burnout: () =>
    "Recognizing burnout is the first step. Let's explore some strategies that might work for you.",
  imposter: () =>
    'Imposter syndrome is so common among capable people. Let me share what I see in you.',

  // Home & Life Admin
  home: () =>
    "Home projects can feel overwhelming. Let me help you think through priorities based on what you've mentioned.",
  control: () =>
    "I'd help control that for you, but let me share some thoughts on how to approach it.",

  // Communication & Follow-ups
  draft: () =>
    "I'd love to help you draft that. Let me suggest some approaches based on what you've told me.",
  schedule: () =>
    "Scheduling is important. While I can't set that up directly right now, let me help you plan it out.",
  recall: () => 'Let me think about what I remember from our conversations that might be relevant.',

  // Default fallback
  default: () => 'I hear what you need. Let me share my thoughts on how I can help with that.',
};

/**
 * Generate a graceful fallback response when a domain tool isn't implemented.
 */
function generateFallbackResponse(semanticToolId: string, args: Record<string, unknown>): string {
  // Extract category from semantic tool ID (e.g., "coaching_motivation" -> "coaching")
  const parts = semanticToolId.toLowerCase().split('_');

  // Try to find a matching fallback category
  for (const part of parts) {
    if (FALLBACK_RESPONSES[part]) {
      return FALLBACK_RESPONSES[part](args);
    }
  }

  // Try the first part as primary category
  if (parts[0] && FALLBACK_RESPONSES[parts[0]]) {
    return FALLBACK_RESPONSES[parts[0]](args);
  }

  // Default fallback
  return FALLBACK_RESPONSES.default(args);
}

/**
 * Execute a domain tool via the semantic router bridge.
 *
 * This is the main entry point for executing real tools from semantic routing.
 * It handles:
 * 1. Looking up the domain tool mapping
 * 2. Transforming arguments
 * 3. Executing the real domain tool
 * 4. Returning the result in a format the semantic router understands
 */
export async function executeDomainTool(
  semanticToolId: string,
  args: Record<string, unknown>,
  context: Omit<ToolExecutionContext, 'originalText' | 'confidence'>
): Promise<ToolExecutionResult> {
  const mapping = TOOL_MAPPINGS[semanticToolId];

  if (!mapping) {
    log.warn({ semanticToolId }, 'No domain mapping found for semantic tool');
    return {
      success: false,
      error: `No domain implementation for ${semanticToolId}`,
      naturalResponse: "I couldn't find the tool to do that. Let me try another way.",
    };
  }

  // Get the real domain tool
  const domainTool = getDomainTool(mapping.domainToolId);

  if (!domainTool) {
    // GRACEFUL FALLBACK: Domain tool not implemented yet
    // Instead of failing, provide a helpful response and allow LLM to handle
    log.warn(
      { semanticToolId, domainToolId: mapping.domainToolId },
      'Domain tool not found in registry - using graceful fallback'
    );

    // Generate a helpful fallback response based on the semantic tool category
    const fallbackResponse = generateFallbackResponse(semanticToolId, args);

    return {
      success: true, // Mark as success so caller doesn't retry
      naturalResponse: fallbackResponse,
      speakImmediately: true,
      data: {
        fallback: true,
        semanticToolId,
        requestedDomainTool: mapping.domainToolId,
        hint: `LLM should handle "${semanticToolId}" conversationally since domain tool is not yet implemented`,
      },
    };
  }

  // Transform arguments
  const transformedArgs = mapping.transformArgs ? mapping.transformArgs(args) : args;

  log.info(
    {
      semanticToolId,
      domainToolId: mapping.domainToolId,
      originalArgs: args,
      transformedArgs,
    },
    '🔗 Bridging semantic tool to domain tool'
  );

  try {
    // Domain tools use a `create` factory pattern
    // We need to create the tool instance first, then execute it
    if (!domainTool.create) {
      log.warn({ domainToolId: mapping.domainToolId }, 'Domain tool has no create method');
      return {
        success: false,
        error: 'Domain tool has no create method',
        naturalResponse: "I couldn't run that tool. Let me try another way.",
      };
    }

    // Create empty service registry for semantic routing execution
    // This throws on get() since no services are available
    const emptyServices: ServiceRegistry = {
      has: () => false,
      get: () => {
        throw new Error('No services available in semantic routing context');
      },
      getOptional: () => undefined,
    };

    // Create tool instance with context
    const toolInstance = domainTool.create({
      userId: context.userId,
      agentId: context.personaId || 'ferni',
      agentDisplayName: context.personaId || 'Ferni',
      services: (context.services as ServiceRegistry | undefined) ?? emptyServices,
    });

    // Execute the tool
    // The tool instance is a Vercel AI SDK tool with an execute function
    if (toolInstance && typeof toolInstance.execute === 'function') {
      const result = await toolInstance.execute(transformedArgs, {
        // AbortSignal (optional)
      });

      // Domain tools return strings, convert to ToolExecutionResult
      if (typeof result === 'string') {
        return {
          success: true,
          naturalResponse: result,
          speakImmediately: true,
          data: { result },
        };
      }

      // If already a result object, return as-is
      return {
        success: true,
        naturalResponse: String(result),
        speakImmediately: true,
        data: { result },
      };
    }

    log.warn({ domainToolId: mapping.domainToolId }, 'Domain tool instance has no execute method');
    return {
      success: false,
      error: 'Domain tool instance has no execute method',
      naturalResponse: "I couldn't run that tool. Let me try another way.",
    };
  } catch (error) {
    log.error(
      {
        semanticToolId,
        domainToolId: mapping.domainToolId,
        error: String(error),
      },
      'Domain tool execution failed'
    );

    return {
      success: false,
      error: String(error),
      naturalResponse: 'Something went wrong. Let me try another way.',
    };
  }
}

/**
 * Get all registered semantic-to-domain mappings.
 * Useful for debugging and testing.
 */
export function getAllMappings(): Record<string, ToolMapping> {
  return { ...TOOL_MAPPINGS };
}

/**
 * Register a new tool mapping dynamically.
 * Useful for extensions and plugins.
 */
export function registerMapping(semanticToolId: string, mapping: ToolMapping): void {
  if (TOOL_MAPPINGS[semanticToolId]) {
    log.warn({ semanticToolId }, 'Overwriting existing tool mapping');
  }
  TOOL_MAPPINGS[semanticToolId] = mapping;
  log.info({ semanticToolId, domainToolId: mapping.domainToolId }, 'Tool mapping registered');
}

/**
 * Get mapping statistics for debugging.
 */
export function getMappingStats(): {
  total: number;
  byCategory: Record<string, number>;
} {
  const mappings = Object.keys(TOOL_MAPPINGS);
  const byCategory: Record<string, number> = {};

  for (const id of mappings) {
    const category = id.split('_')[0] || 'other';
    byCategory[category] = (byCategory[category] || 0) + 1;
  }

  return {
    total: mappings.length,
    byCategory,
  };
}

// ==========================================================================
// EXPORTS
// ==========================================================================

export type { ToolMapping };
