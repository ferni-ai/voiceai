/**
 * Domain Bridge - Connects Semantic Router to Real Domain Tools
 *
 * This module bridges semantic tool IDs to actual domain tool implementations.
 * When a semantic tool matches with high confidence, it delegates execution
 * to the real domain tool rather than using mock responses.
 *
 * COVERAGE: 880+ semantic tools mapped to domain implementations
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
  // ⭐ CANONICAL SEMANTIC IDs (Critical Path)
  // These are the primary semantic IDs used by FTIS validation and routing.
  // ==========================================================================
  music_play: {
    domainToolId: 'playMusic',
    transformArgs: (args) => ({ query: args.query || args.genre || 'music' }),
  },
  alarm_set: {
    domainToolId: 'setAlarm',
    transformArgs: (args) => ({ time: args.time, label: args.label }),
  },
  timer_set: {
    domainToolId: 'setTimer',
    transformArgs: (args) => ({ duration: args.duration, label: args.label }),
  },
  reminder_create: {
    domainToolId: 'createReminder',
    transformArgs: (args) => ({ text: args.text, time: args.time }),
  },
  call_contact: {
    domainToolId: 'callContact',
    transformArgs: (args) => ({ contactName: args.contact || args.name }),
  },
  calendar_create: { domainToolId: 'createCalendarEvent', transformArgs: (args) => args },
  handoff_ferni: {
    domainToolId: 'handoffToFerni',
    transformArgs: (args) => ({ reason: args.reason }),
  },
  handoff_maya: {
    domainToolId: 'handoffToMaya',
    transformArgs: (args) => ({ reason: args.reason }),
  },
  handoff_peter: {
    domainToolId: 'handoffToPeter',
    transformArgs: (args) => ({ reason: args.reason }),
  },
  handoff_alex: {
    domainToolId: 'handoffToAlex',
    transformArgs: (args) => ({ reason: args.reason }),
  },
  handoff_jordan: {
    domainToolId: 'handoffToJordan',
    transformArgs: (args) => ({ reason: args.reason }),
  },
  handoff_nayan: {
    domainToolId: 'handoffToNayan',
    transformArgs: (args) => ({ reason: args.reason }),
  },
  research_topic: {
    domainToolId: 'deepResearch',
    transformArgs: (args) => ({ topic: args.topic, depth: args.depth }),
  },
  research_web: { domainToolId: 'webSearch', transformArgs: (args) => ({ query: args.query }) },

  // ==========================================================================
  // 🎵 MUSIC & ENTERTAINMENT (10 tools)
  // ==========================================================================
  spotify_play: {
    domainToolId: 'playMusic',
    transformArgs: (args) => ({
      query: args.query || args.genre || args.mood || args.artist || 'music',
    }),
  },
  // Shortcut tool that delegates to music domain
  shortcuts_music: {
    domainToolId: 'playMusic',
    transformArgs: (args) => ({
      query: args.query || 'music',
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
  info_sports: {
    domainToolId: 'getTeamScore',
    transformArgs: (args) => ({ teamName: args.team || '' }),
  },
  info_stock: {
    domainToolId: 'getStockQuote',
    transformArgs: (args) => ({ symbol: args.symbol || '' }),
  },
  info_podcast: {
    domainToolId: 'searchPodcasts',
    transformArgs: (args) => ({ query: args.query || '' }),
  },
  info_recipe: {
    domainToolId: 'searchRecipes',
    transformArgs: (args) => ({ dish: args.dish || '' }),
  },
  productivity_routines: {
    domainToolId: 'startRoutine',
    transformArgs: (args) => ({ routineType: args.routineType || 'morning' }),
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
  // 📱 TELEPHONY (5 tools)
  // ==========================================================================

  // Simple business calls (voicemail, quick calls) - uses TwiML voicemail
  telephony_call: {
    domainToolId: 'makePhoneCall',
    transformArgs: (args) => ({
      contact: args.contact,
      phoneNumber: args.phoneNumber,
      message: args.message || 'This is a message from Ferni.',
    }),
  },

  // Personal/conversational calls (family, friends) - Ferni has real conversation
  telephony_converse: {
    domainToolId: 'callAndConverse',
    transformArgs: (args) => ({
      contact: args.contact,
      purpose: args.purpose || 'check in',
      tone: args.tone || 'warm',
    }),
  },

  // Autonomous calls for tasks (appointments, reservations, etc.)
  telephony_call_on_behalf: {
    domainToolId: 'callOnBehalf',
    transformArgs: (args) => ({
      contact: args.contact,
      objective: args.purpose,
      callType: args.callType || 'business',
      preferredTime: args.preferredTime,
    }),
  },

  // Request a callback from a business
  telephony_callback: {
    domainToolId: 'scheduleCallback',
    transformArgs: (args) => ({ contact: args.business || args.contact, when: args.preferredTime }),
  },

  // Check voicemail
  telephony_voicemail: {
    domainToolId: 'checkVoicemail',
    transformArgs: (args) => ({ action: args.action, from: args.from }),
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
    domainToolId: 'trackHabit',
    transformArgs: (args) => ({
      habitName: args.habitName || args.habit,
      completed: args.completed ?? true,
    }),
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
    // Semantic tool extracts 'topic', domain tool expects 'concept'
    transformArgs: (args) => ({ concept: args.topic || args.concept, level: args.level }),
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

  // ==========================================================================
  // 🌅 AMBIENT MODE & AWARENESS (8 tools)
  // ==========================================================================
  ambient_context: { domainToolId: 'getAmbientContext' },
  ambient_nudge: {
    domainToolId: 'suggestNudge',
    transformArgs: (args) => ({ nudgeType: args.type }),
  },
  ambient_quiet_hours: {
    domainToolId: 'setQuietHours',
    transformArgs: (args) => ({ startTime: args.start, endTime: args.end }),
  },
  ambient_preferences: { domainToolId: 'getAmbientPreferences' },
  ambient_toggle: {
    domainToolId: 'toggleAmbientMode',
    transformArgs: (args) => ({ enabled: args.enabled }),
  },
  ambient_seasonal: { domainToolId: 'getSeasonalAwareness' },
  ambient_energy: { domainToolId: 'getEnergyWaveAwareness' },
  ambient_full: { domainToolId: 'getFullAmbientIntelligence' },

  // ==========================================================================
  // 📊 CEO COACHING (12 tools)
  // ==========================================================================
  ceo_briefing: { domainToolId: 'getMorningBriefing' },
  ceo_weekly: { domainToolId: 'weeklyReview' },
  ceo_win: { domainToolId: 'trackWin', transformArgs: (args) => ({ description: args.win }) },
  ceo_energy: { domainToolId: 'trackEnergy', transformArgs: (args) => ({ level: args.level }) },
  ceo_gratitude: {
    domainToolId: 'logGratitude',
    transformArgs: (args) => ({ entry: args.gratitude }),
  },
  ceo_journal: { domainToolId: 'quickJournal', transformArgs: (args) => ({ entry: args.entry }) },
  ceo_priorities: {
    domainToolId: 'managePriorities',
    transformArgs: (args) => ({ action: args.action, priority: args.priority }),
  },
  ceo_blocker: {
    domainToolId: 'trackBlocker',
    transformArgs: (args) => ({ blocker: args.blocker, action: args.action }),
  },
  ceo_decision: {
    domainToolId: 'trackDecision',
    transformArgs: (args) => ({ decision: args.decision }),
  },
  ceo_idea: {
    domainToolId: 'captureIdea',
    transformArgs: (args) => ({ idea: args.idea, tags: args.tags }),
  },
  ceo_focus: {
    domainToolId: 'focusSession',
    transformArgs: (args) => ({ action: args.action, duration: args.duration }),
  },
  ceo_reflection: { domainToolId: 'dailyReflection' },

  // ==========================================================================
  // 📱 DIGITAL WELLNESS (8 tools)
  // ==========================================================================
  digital_audit: {
    domainToolId: 'digitalAudit',
    transformArgs: (args) => ({ concern: args.concern }),
  },
  digital_boundaries: {
    domainToolId: 'digitalBoundaries',
    transformArgs: (args) => ({ boundaryArea: args.area }),
  },
  digital_social_media: {
    domainToolId: 'socialMediaRelationship',
    transformArgs: (args) => ({ platform: args.platform, impact: args.impact }),
  },
  digital_mindful: { domainToolId: 'mindfulTechUse' },
  digital_phone_free: {
    domainToolId: 'phoneFreeTime',
    transformArgs: (args) => ({ resistanceReason: args.reason }),
  },
  digital_notifications: { domainToolId: 'notificationDetox' },
  digital_comparison: {
    domainToolId: 'comparisonTrap',
    transformArgs: (args) => ({ comparingTo: args.comparingTo }),
  },
  digital_screen_time: {
    domainToolId: 'screenTimeInsights',
    transformArgs: (args) => ({ mostUsedApps: args.apps }),
  },

  // ==========================================================================
  // 🏋️ HABIT INTELLIGENCE (8 tools)
  // ==========================================================================
  habit_dna: { domainToolId: 'trackHabitDNA', transformArgs: (args) => ({ habit: args.habit }) },
  habit_friction: { domainToolId: 'mapFriction', transformArgs: (args) => ({ habit: args.habit }) },
  habit_tendency: { domainToolId: 'assessTendency' },
  habit_keystone: { domainToolId: 'detectKeystone' },
  habit_identity: {
    domainToolId: 'trackIdentityShift',
    transformArgs: (args) => ({ identity: args.identity }),
  },
  habit_setback: {
    domainToolId: 'analyzeSetbackPattern',
    transformArgs: (args) => ({ habit: args.habit }),
  },
  habit_autopsy: {
    domainToolId: 'conductHabitAutopsy',
    transformArgs: (args) => ({ habit: args.habit }),
  },
  habit_reminder: {
    domainToolId: 'backgroundHabitReminder',
    transformArgs: (args) => ({ habit: args.habit }),
  },

  // ==========================================================================
  // 💪 HABIT PERSISTENCE (10 tools)
  // ==========================================================================
  habit_accountability: {
    domainToolId: 'gentleAccountability',
    transformArgs: (args) => ({ habit: args.habit }),
  },
  habit_reset: {
    domainToolId: 'compassionateReset',
    transformArgs: (args) => ({ habit: args.habit }),
  },
  habit_tiny_win: {
    domainToolId: 'celebrateTinyWin',
    transformArgs: (args) => ({ win: args.win }),
  },
  habit_resistance: {
    domainToolId: 'identifyResistance',
    transformArgs: (args) => ({ habit: args.habit }),
  },
  habit_pace: {
    domainToolId: 'findSustainablePace',
    transformArgs: (args) => ({ context: args.context }),
  },
  habit_architecture: {
    domainToolId: 'behaviorArchitecture',
    transformArgs: (args) => ({ behavior: args.behavior }),
  },
  habit_pattern: {
    domainToolId: 'surfacePatternInsight',
    transformArgs: (args) => ({ pattern: args.pattern }),
  },
  habit_team_maya: { domainToolId: 'getTeamInsightsForMaya' },
  habit_flag_jordan: {
    domainToolId: 'flagMilestoneForJordan',
    transformArgs: (args) => ({ milestone: args.milestone }),
  },
  habit_request_peter: {
    domainToolId: 'requestPeterAnalysis',
    transformArgs: (args) => ({ topic: args.topic }),
  },

  // ==========================================================================
  // 💔 BREAKUP & DIVORCE (10 tools)
  // ==========================================================================
  breakup_process: {
    domainToolId: 'processBreakup',
    transformArgs: (args) => ({ stage: args.stage }),
  },
  breakup_grief: {
    domainToolId: 'grievingRelationship',
    transformArgs: (args) => ({ relationship: args.relationship }),
  },
  breakup_no_contact: {
    domainToolId: 'noContact',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  breakup_rebuild: { domainToolId: 'rebuildIdentity' },
  breakup_rediscover: { domainToolId: 'rediscoverSelf' },
  divorce_grief: { domainToolId: 'divorceGrief' },
  divorce_coparenting: {
    domainToolId: 'coParentingAfterDivorce',
    transformArgs: (args) => ({ challenge: args.challenge }),
  },
  divorce_identity: { domainToolId: 'divorceIdentityShift' },
  divorce_life_after: { domainToolId: 'lifeAfterDivorce' },
  divorce_faq: { domainToolId: 'divorceFAQ' },

  // ==========================================================================
  // 👨‍👩‍👧 BLENDED FAMILY (3 tools)
  // ==========================================================================
  blended_stepparent: {
    domainToolId: 'stepParentStruggle',
    transformArgs: (args) => ({ struggle: args.struggle }),
  },
  blended_conflict: {
    domainToolId: 'blendedFamilyConflict',
    transformArgs: (args) => ({ conflict: args.conflict }),
  },
  blended_holidays: {
    domainToolId: 'holidaysBlended',
    transformArgs: (args) => ({ situation: args.situation }),
  },

  // ==========================================================================
  // 🧘 BODY RELATIONSHIP (8 tools)
  // ==========================================================================
  body_image: {
    domainToolId: 'bodyImageExplore',
    transformArgs: (args) => ({ concern: args.concern }),
  },
  body_neutrality: { domainToolId: 'bodyNeutrality' },
  body_gratitude: { domainToolId: 'bodyGratitude' },
  body_movement: {
    domainToolId: 'joyfulMovement',
    transformArgs: (args) => ({ preference: args.preference }),
  },
  body_inner_critic: {
    domainToolId: 'innerCriticBody',
    transformArgs: (args) => ({ criticism: args.criticism }),
  },
  body_eating: {
    domainToolId: 'emotionalEating',
    transformArgs: (args) => ({ trigger: args.trigger }),
  },
  body_mirror: { domainToolId: 'mirrorWork' },
  body_checking: { domainToolId: 'bodyCheckingAwareness' },

  // ==========================================================================
  // 👴 CAREGIVER (5 tools)
  // ==========================================================================
  caregiver_burnout: { domainToolId: 'caregiverBurnout' },
  caregiver_guilt: {
    domainToolId: 'caregiverGuilt',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  caregiver_anticipatory: { domainToolId: 'anticipatoryGrief' },
  caregiver_respite: { domainToolId: 'respiteNeed' },
  caregiver_identity: { domainToolId: 'caregiverIdentityLoss' },

  // ==========================================================================
  // ⛪ FAITH & SPIRITUALITY (4 tools)
  // ==========================================================================
  faith_deconstruction: { domainToolId: 'faithDeconstruction' },
  faith_grief: { domainToolId: 'spiritualGrief' },
  faith_family: {
    domainToolId: 'faithAndFamily',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  faith_rebuilding: { domainToolId: 'beliefRebuilding' },

  // ==========================================================================
  // 😤 ENVY (4 tools)
  // ==========================================================================
  envy_understand: {
    domainToolId: 'understandEnvy',
    transformArgs: (args) => ({ target: args.target }),
  },
  envy_transform: { domainToolId: 'transformEnvy', transformArgs: (args) => ({ envy: args.envy }) },
  envy_detox: { domainToolId: 'comparisonDetox' },
  envy_celebrate: {
    domainToolId: 'celebrateOthers',
    transformArgs: (args) => ({ person: args.person }),
  },

  // ==========================================================================
  // 💞 INFIDELITY (4 tools)
  // ==========================================================================
  infidelity_betrayal: { domainToolId: 'betrayalTrauma' },
  infidelity_stay: {
    domainToolId: 'shouldWeStay',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  infidelity_understanding: { domainToolId: 'understandingWhyICheated' },
  infidelity_trust: {
    domainToolId: 'trustRecovery',
    transformArgs: (args) => ({ stage: args.stage }),
  },

  // ==========================================================================
  // 📧 EMAIL INTELLIGENCE (8 tools)
  // ==========================================================================
  email_priority: { domainToolId: 'analyzeInboxPriority' },
  email_followup: { domainToolId: 'getFollowUpNeeded' },
  email_unsubscribe: { domainToolId: 'bulkUnsubscribe' },
  email_summarize: {
    domainToolId: 'summarizeThread',
    transformArgs: (args) => ({ threadId: args.threadId }),
  },
  email_vip: { domainToolId: 'markVipSender', transformArgs: (args) => ({ sender: args.sender }) },
  email_block: { domainToolId: 'blockSender', transformArgs: (args) => ({ sender: args.sender }) },
  email_track: { domainToolId: 'trackFollowUp', transformArgs: (args) => ({ email: args.email }) },
  email_close: { domainToolId: 'closeFollowUp', transformArgs: (args) => ({ id: args.id }) },

  // ==========================================================================
  // 🏠 EMPTY NEST (4 tools)
  // ==========================================================================
  empty_nest_grief: { domainToolId: 'emptyNestGrief' },
  empty_nest_rediscover: { domainToolId: 'rediscoverYourself' },
  empty_nest_couples: { domainToolId: 'couplesRediscovery' },
  empty_nest_freedom: { domainToolId: 'freedomAfterKids' },

  // ==========================================================================
  // 🏥 CHRONIC CONDITIONS (3 tools)
  // ==========================================================================
  chronic_illness: {
    domainToolId: 'chronicIllnessLife',
    transformArgs: (args) => ({ condition: args.condition }),
  },
  chronic_grief: { domainToolId: 'griefOfChronicIllness' },
  chronic_invisible: { domainToolId: 'invisibleIllness' },

  // ==========================================================================
  // 🌈 COMING OUT (2 tools)
  // ==========================================================================
  coming_out_self: { domainToolId: 'comingOutToSelf' },
  coming_out_planning: {
    domainToolId: 'comingOutPlanning',
    transformArgs: (args) => ({ who: args.who }),
  },

  // ==========================================================================
  // 🎯 DEVELOPER TOOLS (10 tools)
  // ==========================================================================
  dev_git_status: { domainToolId: 'gitStatus' },
  dev_git_diff: { domainToolId: 'gitDiff' },
  dev_git_commit: {
    domainToolId: 'gitCommit',
    transformArgs: (args) => ({ message: args.message }),
  },
  dev_git_log: { domainToolId: 'gitLog' },
  dev_ferni_cli: {
    domainToolId: 'runFerniCommand',
    transformArgs: (args) => ({ command: args.command }),
  },
  dev_job_check: {
    domainToolId: 'checkBackgroundJob',
    transformArgs: (args) => ({ jobId: args.jobId }),
  },
  dev_read_file: { domainToolId: 'readFile', transformArgs: (args) => ({ path: args.path }) },
  dev_edit_file: {
    domainToolId: 'editFile',
    transformArgs: (args) => ({ path: args.path, content: args.content }),
  },
  dev_bash: { domainToolId: 'runBash', transformArgs: (args) => ({ command: args.command }) },
  dev_search: { domainToolId: 'searchFiles', transformArgs: (args) => ({ query: args.query }) },

  // ==========================================================================
  // 📄 DOCUMENTS (5 tools)
  // ==========================================================================
  doc_save: {
    domainToolId: 'saveDocument',
    transformArgs: (args) => ({ name: args.name, content: args.content }),
  },
  doc_find: { domainToolId: 'locateDocument', transformArgs: (args) => ({ name: args.name }) },
  doc_expiration: {
    domainToolId: 'trackExpiration',
    transformArgs: (args) => ({ document: args.document, date: args.date }),
  },
  doc_warranty: {
    domainToolId: 'getWarrantyStatus',
    transformArgs: (args) => ({ item: args.item }),
  },
  doc_receipts: { domainToolId: 'organizeReceipts' },

  // ==========================================================================
  // 🚗 VEHICLE (4 tools)
  // ==========================================================================
  vehicle_add: {
    domainToolId: 'addVehicle',
    transformArgs: (args) => ({ make: args.make, model: args.model }),
  },
  vehicle_mileage: {
    domainToolId: 'logMileage',
    transformArgs: (args) => ({ mileage: args.mileage }),
  },
  vehicle_service: {
    domainToolId: 'trackServiceHistory',
    transformArgs: (args) => ({ service: args.service }),
  },
  vehicle_maintenance: { domainToolId: 'getMaintenanceSchedule' },

  // ==========================================================================
  // 🎭 CAMEO (4 tools)
  // ==========================================================================
  cameo_check: { domainToolId: 'checkCameoOpportunity' },
  cameo_invite: {
    domainToolId: 'inviteCameo',
    transformArgs: (args) => ({ persona: args.persona, topic: args.topic }),
  },
  cameo_complete: {
    domainToolId: 'completeCameo',
    transformArgs: (args) => ({ cameoId: args.cameoId }),
  },
  cameo_context: { domainToolId: 'getCameoContext' },

  // ==========================================================================
  // 🎮 GAMES (10 tools)
  // ==========================================================================
  game_suggest: { domainToolId: 'suggestGame', transformArgs: (args) => ({ mood: args.mood }) },
  game_status: { domainToolId: 'getGameStatus' },
  game_hint: { domainToolId: 'getGameHint' },
  game_history: { domainToolId: 'getGameHistory' },
  game_end: { domainToolId: 'endGame' },
  game_skip: { domainToolId: 'skipGameRound' },
  game_submit: {
    domainToolId: 'submitGameAnswer',
    transformArgs: (args) => ({ answer: args.answer }),
  },
  game_text_start: {
    domainToolId: 'startTextGame',
    transformArgs: (args) => ({ gameType: args.gameType }),
  },
  game_text_move: {
    domainToolId: 'makeTextGameMove',
    transformArgs: (args) => ({ move: args.move }),
  },
  game_text_board: { domainToolId: 'getTextGameBoard' },

  // ==========================================================================
  // 🧠 NEURODIVERSITY (6 tools)
  // ==========================================================================
  adhd_body_doubling: { domainToolId: 'adhdBodyDoubling' },
  adhd_task_start: {
    domainToolId: 'adhdTaskStart',
    transformArgs: (args) => ({ task: args.task }),
  },
  adhd_time_blindness: { domainToolId: 'adhdTimeBlindness' },
  autism_sensory: {
    domainToolId: 'autismSensoryRegulation',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  autism_social: {
    domainToolId: 'autismSocialEnergy',
    transformArgs: (args) => ({ context: args.context }),
  },
  executive_function: {
    domainToolId: 'executiveFunctionSupport',
    transformArgs: (args) => ({ challenge: args.challenge }),
  },

  // ==========================================================================
  // 👶 NEW PARENT (3 tools)
  // ==========================================================================
  new_parent_survival: { domainToolId: 'newParentSurvival' },
  postpartum_checkin: { domainToolId: 'postpartumCheckin' },
  parent_identity: { domainToolId: 'parentIdentityShift' },

  // ==========================================================================
  // 💑 INTIMACY (4 tools)
  // ==========================================================================
  intimacy_barriers: {
    domainToolId: 'intimacyBarriers',
    transformArgs: (args) => ({ barrier: args.barrier }),
  },
  intimacy_types: { domainToolId: 'intimacyTypes' },
  intimacy_emotional: {
    domainToolId: 'emotionalIntimacy',
    transformArgs: (args) => ({ relationship: args.relationship }),
  },
  intimacy_desires: { domainToolId: 'communicatingDesires' },

  // ==========================================================================
  // 🍺 SOBRIETY (4 tools)
  // ==========================================================================
  sobriety_checkin: { domainToolId: 'sobrietyCheckin' },
  sobriety_grief: { domainToolId: 'sobrietyGrief' },
  sobriety_social: {
    domainToolId: 'soberSocializing',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  sobriety_milestone: {
    domainToolId: 'trackSobrietyMilestone',
    transformArgs: (args) => ({ days: args.days }),
  },

  // ==========================================================================
  // 😔 SHAME & RESENTMENT (8 tools)
  // ==========================================================================
  shame_explore: {
    domainToolId: 'exploreShame',
    transformArgs: (args) => ({ trigger: args.trigger }),
  },
  shame_triggers: { domainToolId: 'identifyShameTriggers' },
  shame_guilt: { domainToolId: 'distinguishShameFromGuilt' },
  shame_heal: { domainToolId: 'healCoreShame' },
  shame_process: {
    domainToolId: 'processShameExperience',
    transformArgs: (args) => ({ experience: args.experience }),
  },
  resentment_inventory: { domainToolId: 'resentmentInventory' },
  resentment_family: {
    domainToolId: 'resentmentInFamily',
    transformArgs: (args) => ({ relationship: args.relationship }),
  },
  resentment_release: {
    domainToolId: 'releaseResentment',
    transformArgs: (args) => ({ toward: args.toward }),
  },

  // ==========================================================================
  // 💼 JOB LOSS (4 tools)
  // ==========================================================================
  job_loss_grief: { domainToolId: 'jobLossGrief' },
  job_loss_identity: { domainToolId: 'identityAfterLayoff' },
  job_loss_mental: { domainToolId: 'jobSearchMentalHealth' },
  job_loss_search: { domainToolId: 'job-search' },

  // ==========================================================================
  // 🏃 PROCRASTINATION (4 tools)
  // ==========================================================================
  procrastination_patterns: { domainToolId: 'procrastinationPatterns' },
  procrastination_root: {
    domainToolId: 'procrastinationRootCause',
    transformArgs: (args) => ({ task: args.task }),
  },
  procrastination_emotional: {
    domainToolId: 'emotionalProcrastination',
    transformArgs: (args) => ({ emotion: args.emotion }),
  },
  procrastination_two_min: {
    domainToolId: 'twoMinuteRule',
    transformArgs: (args) => ({ task: args.task }),
  },

  // ==========================================================================
  // 🎯 PERFECTIONISM (3 tools)
  // ==========================================================================
  perfectionism_understand: { domainToolId: 'understandPerfectionism' },
  perfectionism_triggers: { domainToolId: 'perfectionismTriggers' },
  perfectionism_healthy: { domainToolId: 'healthyStriving' },

  // ==========================================================================
  // 🗣️ SOCIAL SKILLS (4 tools)
  // ==========================================================================
  social_small_talk: { domainToolId: 'smallTalkMastery' },
  social_anxiety: {
    domainToolId: 'navigateSocialAnxiety',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  social_rejection: {
    domainToolId: 'handleSocialRejection',
    transformArgs: (args) => ({ rejection: args.rejection }),
  },
  social_friendship: { domainToolId: 'socialFriendshipSkills' },

  // ==========================================================================
  // 🎤 DIFFICULT CONVERSATIONS (6 tools)
  // ==========================================================================
  difficult_prepare: {
    domainToolId: 'prepareForDifficultConversation',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  difficult_practice: {
    domainToolId: 'practiceConversation',
    transformArgs: (args) => ({ scenario: args.scenario }),
  },
  difficult_boundary: {
    domainToolId: 'setBoundaryConversation',
    transformArgs: (args) => ({ boundary: args.boundary }),
  },
  difficult_conflict: {
    domainToolId: 'conflictResolution',
    transformArgs: (args) => ({ conflict: args.conflict }),
  },
  difficult_anticipate: {
    domainToolId: 'anticipateResponses',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  difficult_script: {
    domainToolId: 'buildScript',
    transformArgs: (args) => ({ situation: args.situation }),
  },

  // ==========================================================================
  // 🏠 SMART HOME (12 tools)
  // ==========================================================================
  smarthome_scene: {
    domainToolId: 'activateScene',
    transformArgs: (args) => ({ scene: args.scene }),
  },
  smarthome_light: {
    domainToolId: 'controlLight',
    transformArgs: (args) => ({ room: args.room, action: args.action }),
  },
  smarthome_lock: {
    domainToolId: 'controlLock',
    transformArgs: (args) => ({ lock: args.lock, action: args.action }),
  },
  smarthome_devices_list: { domainToolId: 'listDevices' },
  sonos_play: { domainToolId: 'playSonosMusic', transformArgs: (args) => ({ query: args.query }) },
  sonos_pause: { domainToolId: 'pauseSonos' },
  sonos_resume: { domainToolId: 'resumeSonos' },
  sonos_volume: {
    domainToolId: 'setSonosVolume',
    transformArgs: (args) => ({ volume: args.volume }),
  },
  sonos_room: { domainToolId: 'setSonosRoom', transformArgs: (args) => ({ room: args.room }) },
  sonos_rooms: { domainToolId: 'listSonosRooms' },
  sonos_playing: { domainToolId: 'whatsSonosPlaying' },

  // ==========================================================================
  // 🚗 TRANSPORTATION & RIDES (6 tools)
  // ==========================================================================
  ride_request: {
    domainToolId: 'requestRide',
    transformArgs: (args) => ({ destination: args.destination }),
  },
  ride_status: { domainToolId: 'getRideStatus' },
  ride_cancel: { domainToolId: 'cancelRide' },
  ride_schedule: {
    domainToolId: 'scheduleRide',
    transformArgs: (args) => ({ destination: args.destination, time: args.time }),
  },
  commute_time: {
    domainToolId: 'getCommuteTime',
    transformArgs: (args) => ({ destination: args.destination }),
  },
  food_delivery: {
    domainToolId: 'foodDelivery',
    transformArgs: (args) => ({ restaurant: args.restaurant }),
  },

  // ==========================================================================
  // 🍳 MEAL PLANNING & RECIPES (6 tools)
  // ==========================================================================
  meal_plan: { domainToolId: 'planWeeklyMeals' },
  meal_suggest: {
    domainToolId: 'suggestMeals',
    transformArgs: (args) => ({ preferences: args.preferences }),
  },
  recipe_add: {
    domainToolId: 'addRecipe',
    transformArgs: (args) => ({ name: args.name, ingredients: args.ingredients }),
  },
  recipe_cooked: {
    domainToolId: 'markRecipeCooked',
    transformArgs: (args) => ({ recipe: args.recipe }),
  },
  diet_track: {
    domainToolId: 'trackDietaryPreferences',
    transformArgs: (args) => ({ preference: args.preference }),
  },
  grocery_list: { domainToolId: 'generateShoppingList' },

  // ==========================================================================
  // 🎉 MILESTONES & CELEBRATIONS (8 tools)
  // ==========================================================================
  milestone_detect: { domainToolId: 'detectMilestones' },
  milestone_birthdays: { domainToolId: 'getUpcomingBirthdays' },
  milestone_anniversary: {
    domainToolId: 'anniversarySupport',
    transformArgs: (args) => ({ type: args.type }),
  },
  milestone_set_birthday: {
    domainToolId: 'setBirthday',
    transformArgs: (args) => ({ person: args.person, date: args.date }),
  },
  milestone_set_anniversary: {
    domainToolId: 'setAnniversary',
    transformArgs: (args) => ({ type: args.type, date: args.date }),
  },
  celebrate_win: { domainToolId: 'celebrateWin', transformArgs: (args) => ({ win: args.win }) },
  celebrate_progress: {
    domainToolId: 'celebrateProgress',
    transformArgs: (args) => ({ progress: args.progress }),
  },
  celebrate_completion: {
    domainToolId: 'celebrateCompletion',
    transformArgs: (args) => ({ task: args.task }),
  },

  // ==========================================================================
  // 📊 PROACTIVE & BACKGROUND (10 tools)
  // ==========================================================================
  proactive_message: {
    domainToolId: 'generateProactiveMessage',
    transformArgs: (args) => ({ context: args.context }),
  },
  proactive_insights: { domainToolId: 'getProactiveInsights' },
  background_call: {
    domainToolId: 'backgroundCall',
    transformArgs: (args) => ({ contact: args.contact, purpose: args.purpose }),
  },
  background_research: {
    domainToolId: 'backgroundResearch',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  background_reservation: {
    domainToolId: 'backgroundReservation',
    transformArgs: (args) => ({ restaurant: args.restaurant, time: args.time }),
  },
  background_followup: {
    domainToolId: 'backgroundFollowUp',
    transformArgs: (args) => ({ contact: args.contact }),
  },
  concierge_status: { domainToolId: 'checkConciergeStatus' },
  concierge_checkin: { domainToolId: 'proactiveConciergeCheckIn' },
  local_search_status: { domainToolId: 'checkLocalSearchStatus' },
  local_search: {
    domainToolId: 'searchLocalBusinesses',
    transformArgs: (args) => ({ query: args.query }),
  },

  // ==========================================================================
  // 📅 ROUTINES (6 tools)
  // ==========================================================================
  routine_create: {
    domainToolId: 'createRoutine',
    transformArgs: (args) => ({ name: args.name, steps: args.steps }),
  },
  routine_list: { domainToolId: 'listRoutines' },
  routine_run: { domainToolId: 'runRoutine', transformArgs: (args) => ({ routine: args.routine }) },
  routine_toggle: {
    domainToolId: 'toggleRoutine',
    transformArgs: (args) => ({ routine: args.routine }),
  },
  routine_remove: {
    domainToolId: 'removeRoutine',
    transformArgs: (args) => ({ routine: args.routine }),
  },
  routine_suggest: {
    domainToolId: 'suggestRoutines',
    transformArgs: (args) => ({ goal: args.goal }),
  },

  // ==========================================================================
  // 🤖 AUTOMATIONS & WEBHOOKS (8 tools)
  // ==========================================================================
  automation_create: {
    domainToolId: 'createAutomation',
    transformArgs: (args) => ({ trigger: args.trigger, action: args.action }),
  },
  automation_list: { domainToolId: 'listAutomations' },
  automation_pause: { domainToolId: 'pauseAutomation', transformArgs: (args) => ({ id: args.id }) },
  automation_resume: {
    domainToolId: 'resumeAutomation',
    transformArgs: (args) => ({ id: args.id }),
  },
  automation_delete: {
    domainToolId: 'deleteAutomation',
    transformArgs: (args) => ({ id: args.id }),
  },
  automation_trigger: {
    domainToolId: 'triggerAutomation',
    transformArgs: (args) => ({ id: args.id }),
  },
  webhook_list: { domainToolId: 'listWebhooks' },
  webhook_trigger: {
    domainToolId: 'triggerWebhook',
    transformArgs: (args) => ({ webhook: args.webhook }),
  },

  // ==========================================================================
  // 📱 SOCIAL MEDIA POSTING (4 tools)
  // ==========================================================================
  social_post_twitter: {
    domainToolId: 'postToTwitter',
    transformArgs: (args) => ({ content: args.content }),
  },
  social_post_linkedin: {
    domainToolId: 'postToLinkedIn',
    transformArgs: (args) => ({ content: args.content }),
  },
  social_schedule: { domainToolId: 'listScheduledPosts' },
  social_content: {
    domainToolId: 'generateSocialContent',
    transformArgs: (args) => ({ topic: args.topic }),
  },

  // ==========================================================================
  // 🎓 LEARNING (8 tools)
  // ==========================================================================
  learning_path: {
    domainToolId: 'createLearningPath',
    transformArgs: (args) => ({ skill: args.skill }),
  },
  learning_get_path: {
    domainToolId: 'getLearningPath',
    transformArgs: (args) => ({ skill: args.skill }),
  },
  learning_progress: {
    domainToolId: 'trackLearningProgress',
    transformArgs: (args) => ({ skill: args.skill }),
  },
  learning_block: {
    domainToolId: 'overcomeLearningBlock',
    transformArgs: (args) => ({ block: args.block }),
  },
  learning_goal: {
    domainToolId: 'setLearningGoal',
    transformArgs: (args) => ({ goal: args.goal }),
  },
  learning_plan_study: {
    domainToolId: 'planStudySession',
    transformArgs: (args) => ({ subject: args.subject }),
  },
  learning_test: {
    domainToolId: 'testKnowledge',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  learning_spaced: {
    domainToolId: 'scheduleSpacedRepetition',
    transformArgs: (args) => ({ topic: args.topic }),
  },

  // ==========================================================================
  // 📞 HUMAN TRANSFER (3 tools)
  // ==========================================================================
  human_evaluate: {
    domainToolId: 'evaluateHumanTransfer',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  human_connect: {
    domainToolId: 'connectToHumanExpert',
    transformArgs: (args) => ({ expertise: args.expertise }),
  },
  human_crisis: { domainToolId: 'quickCrisisResources' },

  // ==========================================================================
  // 🧘 BEHAVIOR & PRESENCE (6 tools)
  // ==========================================================================
  behavior_shift: { domainToolId: 'shiftMode', transformArgs: (args) => ({ mode: args.mode }) },
  behavior_pacing: { domainToolId: 'adjustPacing', transformArgs: (args) => ({ pace: args.pace }) },
  behavior_processing: { domainToolId: 'processing' },
  behavior_hold_space: { domainToolId: 'holdSpace' },
  behavior_presence: { domainToolId: 'expressPresence' },
  behavior_breathe: { domainToolId: 'breatheWithMe' },

  // ==========================================================================
  // 🔍 AWARENESS & CONTEXT (6 tools)
  // ==========================================================================
  awareness_current: { domainToolId: 'getCurrentContext' },
  awareness_user: { domainToolId: 'getUserContext' },
  awareness_conversation: { domainToolId: 'getConversationAwareness' },
  awareness_today: { domainToolId: 'getTodaySignificance' },
  awareness_trigger: {
    domainToolId: 'triggerAwareness',
    transformArgs: (args) => ({ type: args.type }),
  },
  awareness_predict: { domainToolId: 'getPredictions' },

  // ==========================================================================
  // 🎯 PROJECTS (6 tools)
  // ==========================================================================
  project_create: { domainToolId: 'createProject', transformArgs: (args) => ({ name: args.name }) },
  project_status: {
    domainToolId: 'getProjectStatus',
    transformArgs: (args) => ({ project: args.project }),
  },
  project_task_add: {
    domainToolId: 'addProjectTask',
    transformArgs: (args) => ({ project: args.project, task: args.task }),
  },
  project_task_complete: {
    domainToolId: 'completeProjectTask',
    transformArgs: (args) => ({ taskId: args.taskId }),
  },
  project_templates: { domainToolId: 'listProjectTemplates' },
  project_track: {
    domainToolId: 'trackCreativeProject',
    transformArgs: (args) => ({ project: args.project }),
  },

  // ==========================================================================
  // 📊 SUBSCRIPTIONS & FINANCE TRACKING (4 tools)
  // ==========================================================================
  subscription_detect: { domainToolId: 'detectSubscriptions' },
  subscription_summary: { domainToolId: 'getSubscriptionSummary' },
  subscription_cancel: {
    domainToolId: 'cancelSubscription',
    transformArgs: (args) => ({ subscription: args.subscription }),
  },
  insurance_renewal: {
    domainToolId: 'setInsuranceRenewal',
    transformArgs: (args) => ({ type: args.type, date: args.date }),
  },

  // ==========================================================================
  // 📸 VISUAL MEMORY (4 tools)
  // ==========================================================================
  visual_list: { domainToolId: 'listRecentPhotos' },
  visual_describe: {
    domainToolId: 'describeSharedPhoto',
    transformArgs: (args) => ({ photoId: args.photoId }),
  },
  visual_recall: {
    domainToolId: 'recallVisualMemory',
    transformArgs: (args) => ({ query: args.query }),
  },
  visual_count: { domainToolId: 'countVisualMemories' },

  // ==========================================================================
  // 🎤 VOICE ENROLLMENT (3 tools)
  // ==========================================================================
  voice_enroll_start: { domainToolId: 'getStarted' },
  voice_enroll_friend: {
    domainToolId: 'inviteFriendByCall',
    transformArgs: (args) => ({ name: args.name, phone: args.phone }),
  },
  voice_enroll_support: {
    domainToolId: 'sendSupportCall',
    transformArgs: (args) => ({ contact: args.contact }),
  },

  // ==========================================================================
  // 🎙️ PODCASTS (4 tools)
  // ==========================================================================
  podcast_episodes: {
    domainToolId: 'getPodcastEpisodes',
    transformArgs: (args) => ({ podcast: args.podcast }),
  },
  podcast_recommend: {
    domainToolId: 'getPodcastRecommendations',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  podcast_top: {
    domainToolId: 'getTopPodcasts',
    transformArgs: (args) => ({ category: args.category }),
  },
  video_recommend: {
    domainToolId: 'getVideoRecommendations',
    transformArgs: (args) => ({ topic: args.topic }),
  },

  // ==========================================================================
  // 🧭 LIFE TRANSITIONS (12 tools)
  // ==========================================================================
  transition_acknowledge: {
    domainToolId: 'acknowledgeTransition',
    transformArgs: (args) => ({ transition: args.transition }),
  },
  transition_stage: {
    domainToolId: 'transitionStage',
    transformArgs: (args) => ({ transition: args.transition }),
  },
  transition_navigate: {
    domainToolId: 'navigateTransition',
    transformArgs: (args) => ({ transition: args.transition }),
  },
  transition_anticipate: {
    domainToolId: 'anticipateTransition',
    transformArgs: (args) => ({ transition: args.transition }),
  },
  transition_new_normal: { domainToolId: 'adaptToNewNormal' },
  transition_ritual: {
    domainToolId: 'createTransitionRitual',
    transformArgs: (args) => ({ transition: args.transition }),
  },
  transition_meaning: {
    domainToolId: 'findMeaningInTransition',
    transformArgs: (args) => ({ transition: args.transition }),
  },
  transition_identity: {
    domainToolId: 'exploreIdentityShift',
    transformArgs: (args) => ({ from: args.from, to: args.to }),
  },
  transition_first_time: {
    domainToolId: 'navigateFirstTime',
    transformArgs: (args) => ({ experience: args.experience }),
  },
  transition_what_was: { domainToolId: 'acknowledgeWhatWas' },
  transition_grieve: {
    domainToolId: 'grieveWhatWas',
    transformArgs: (args) => ({ loss: args.loss }),
  },
  transition_keep: { domainToolId: 'identifyWhatToKeep' },

  // ==========================================================================
  // 🌟 LIFE PLANNING (10 tools)
  // ==========================================================================
  life_dream: { domainToolId: 'captureDream', transformArgs: (args) => ({ dream: args.dream }) },
  life_explore: { domainToolId: 'exploreDream', transformArgs: (args) => ({ dream: args.dream }) },
  life_mission: { domainToolId: 'createPersonalMission' },
  life_legacy: { domainToolId: 'defineLegacy' },
  life_chapter: {
    domainToolId: 'exploreLifeChapter',
    transformArgs: (args) => ({ chapter: args.chapter }),
  },
  life_philosophy: { domainToolId: 'exploreLifePhilosophy' },
  life_story: {
    domainToolId: 'captureLifeStory',
    transformArgs: (args) => ({ prompt: args.prompt }),
  },
  life_question: {
    domainToolId: 'captureQuestion',
    transformArgs: (args) => ({ question: args.question }),
  },
  life_explore_question: {
    domainToolId: 'exploreQuestion',
    transformArgs: (args) => ({ question: args.question }),
  },
  life_readiness: { domainToolId: 'assessReadinessForChange' },

  // ==========================================================================
  // 🎯 LIFE THESIS (4 tools)
  // ==========================================================================
  thesis_incubate: {
    domainToolId: 'trackWisdomIncubation',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  thesis_koan: { domainToolId: 'generatePersonalKoan' },
  thesis_sit: {
    domainToolId: 'sitWithBigQuestion',
    transformArgs: (args) => ({ question: args.question }),
  },
  thesis_archive: {
    domainToolId: 'archiveInsight',
    transformArgs: (args) => ({ insight: args.insight }),
  },

  // ==========================================================================
  // 🔮 TIMELESS PERSPECTIVE (8 tools)
  // ==========================================================================
  timeless_future_self: {
    domainToolId: 'futureSelf',
    transformArgs: (args) => ({ years: args.years }),
  },
  timeless_mortality: { domainToolId: 'exploreMortality' },
  timeless_decade: { domainToolId: 'decadeView' },
  timeless_what_matters: { domainToolId: 'whatWillMatter' },
  timeless_zoom_out: { domainToolId: 'zoomOut' },
  timeless_this_passes: { domainToolId: 'thisTooPasses' },
  timeless_enough: { domainToolId: 'enoughForToday' },
  timeless_ethical_will: { domainToolId: 'writeEthicalWill' },

  // ==========================================================================
  // 💫 MEANING & PURPOSE (12 tools)
  // ==========================================================================
  meaning_daily: { domainToolId: 'dailyMeaningPractice' },
  meaning_suffering: {
    domainToolId: 'findMeaningInSuffering',
    transformArgs: (args) => ({ suffering: args.suffering }),
  },
  meaning_find_work: { domainToolId: 'findMeaningInWork' },
  meaning_align_actions: { domainToolId: 'alignActionsWithPurpose' },
  meaning_values_check: { domainToolId: 'checkValuesAlignment' },
  meaning_values_sort: { domainToolId: 'valuesCardSort' },
  meaning_value_resolution: {
    domainToolId: 'valueConflictResolution',
    transformArgs: (args) => ({ conflict: args.conflict }),
  },
  meaning_becoming: { domainToolId: 'whoAmIBecoming' },
  meaning_live_authentic: { domainToolId: 'livingAuthentically' },
  meaning_contribution: { domainToolId: 'reflectOnContribution' },
  meaning_enoughness: { domainToolId: 'enoughness' },
  meaning_track_enough: { domainToolId: 'trackEnough' },

  // ==========================================================================
  // 🧘 PRESENCE & MINDFULNESS (10 tools)
  // ==========================================================================
  presence_moment: { domainToolId: 'noticeThisMoment' },
  presence_protect: { domainToolId: 'protectPresence' },
  presence_joy: { domainToolId: 'noticeJoy' },
  presence_schedule_joy: {
    domainToolId: 'scheduleJoy',
    transformArgs: (args) => ({ activity: args.activity }),
  },
  presence_map_joy: { domainToolId: 'mapJoy' },
  presence_savor: {
    domainToolId: 'savorExperience',
    transformArgs: (args) => ({ experience: args.experience }),
  },
  presence_return: { domainToolId: 'returnToPresent' },
  presence_ground: { domainToolId: 'groundInBody' },
  presence_walking: { domainToolId: 'walkingMeditation' },
  presence_slow: { domainToolId: 'slowDown' },

  // ==========================================================================
  // 💪 VULNERABILITY & GROWTH (8 tools)
  // ==========================================================================
  vulnerability_relationship: {
    domainToolId: 'vulnerabilityInRelationship',
    transformArgs: (args) => ({ relationship: args.relationship }),
  },
  vulnerability_hidden: { domainToolId: 'revealHiddenSelf' },
  vulnerability_blind_spot: { domainToolId: 'revealBlindSpot' },
  vulnerability_safe_space: { domainToolId: 'createSafeSpace' },
  vulnerability_secret: {
    domainToolId: 'holdSecret',
    transformArgs: (args) => ({ context: args.context }),
  },
  growth_areas: { domainToolId: 'exploreGrowthAreas' },
  growth_plateau: { domainToolId: 'embracePlateau' },
  growth_comeback: {
    domainToolId: 'createComebackPlan',
    transformArgs: (args) => ({ setback: args.setback }),
  },

  // ==========================================================================
  // 🎭 PLAY & CREATIVITY (10 tools)
  // ==========================================================================
  play_permission: { domainToolId: 'givePermissionToPlay' },
  play_silly: { domainToolId: 'becomeSilly' },
  play_cultivate: { domainToolId: 'cultivatePlayfulness' },
  play_hobby: {
    domainToolId: 'suggestHobbyBasedOnInterests',
    transformArgs: (args) => ({ interests: args.interests }),
  },
  play_reclaim: {
    domainToolId: 'reclaimLostHobby',
    transformArgs: (args) => ({ hobby: args.hobby }),
  },
  play_spontaneity: { domainToolId: 'spontaneityChallenge' },
  play_possibility: { domainToolId: 'playWithPossibility' },
  creativity_block: {
    domainToolId: 'navigateCreativeBlock',
    transformArgs: (args) => ({ block: args.block }),
  },
  creativity_habit: { domainToolId: 'buildCreativeHabit' },
  creativity_goal: {
    domainToolId: 'setCreativeGoal',
    transformArgs: (args) => ({ goal: args.goal }),
  },

  // ==========================================================================
  // 🌊 QUIET GROWTH (6 tools)
  // ==========================================================================
  quiet_mystery: { domainToolId: 'embraceMystery' },
  quiet_uncertainty: { domainToolId: 'embraceUncertainty' },
  quiet_imperfection: { domainToolId: 'embraceImperfection' },
  quiet_beginners: { domainToolId: 'cultivateBeginnersMind' },
  quiet_wonder: { domainToolId: 'experienceWonder' },
  quiet_paradox: {
    domainToolId: 'holdParadox',
    transformArgs: (args) => ({ paradox: args.paradox }),
  },

  // ==========================================================================
  // 🌱 SECOND CHANCES (4 tools)
  // ==========================================================================
  second_amends: { domainToolId: 'makeAmends', transformArgs: (args) => ({ to: args.to }) },
  second_alternative: {
    domainToolId: 'alternativeLife',
    transformArgs: (args) => ({ choice: args.choice }),
  },
  second_counterfactual: {
    domainToolId: 'simulateCounterfactual',
    transformArgs: (args) => ({ decision: args.decision }),
  },
  second_wisdom: { domainToolId: 'shareSecondChanceWisdom' },

  // ==========================================================================
  // 🤝 CONNECTION & FRIENDSHIP (12 tools)
  // ==========================================================================
  connection_loneliness_type: { domainToolId: 'exploreLonelinessType' },
  connection_sit: { domainToolId: 'sitWithLoneliness' },
  connection_adult_friends: { domainToolId: 'makeAdultFriends' },
  connection_deepen: {
    domainToolId: 'deepenFriendship',
    transformArgs: (args) => ({ friend: args.friend }),
  },
  connection_acquaintance: {
    domainToolId: 'deepenAcquaintance',
    transformArgs: (args) => ({ person: args.person }),
  },
  connection_move: {
    domainToolId: 'moveFromAcquaintanceToFriend',
    transformArgs: (args) => ({ person: args.person }),
  },
  connection_maintain_friendships: { domainToolId: 'maintainFriendships' },
  connection_toxic: {
    domainToolId: 'recognizeToxicFriendship',
    transformArgs: (args) => ({ friend: args.friend }),
  },
  connection_find_people: { domainToolId: 'findYourPeople' },
  connection_network: { domainToolId: 'networkAuthentically' },
  connection_expand: { domainToolId: 'expandNetwork' },
  connection_join: { domainToolId: 'joinNewGroups' },

  // ==========================================================================
  // 💬 DATING (10 tools)
  // ==========================================================================
  dating_readiness: { domainToolId: 'datingReadiness' },
  dating_values: { domainToolId: 'datingValues' },
  dating_intentions: { domainToolId: 'datingIntentions' },
  dating_dealbreakers: { domainToolId: 'dealbreakers' },
  dating_app_fatigue: { domainToolId: 'datingAppFatigue' },
  dating_red_flags: { domainToolId: 'datingRedFlags' },
  dating_rejection: {
    domainToolId: 'datingRejection',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  dating_after_date: {
    domainToolId: 'afterDateReflection',
    transformArgs: (args) => ({ date: args.date }),
  },
  dating_relationship_baby: { domainToolId: 'relationshipAfterBaby' },
  dating_alone_together: { domainToolId: 'balanceAloneAndTogether' },

  // ==========================================================================
  // 💼 CAREER EXTENDED (8 tools)
  // ==========================================================================
  career_satisfaction: { domainToolId: 'assessCareerSatisfaction' },
  career_goals: { domainToolId: 'clarifyCareerGoals' },
  career_transition: { domainToolId: 'planCareerTransition' },
  career_burnout: { domainToolId: 'assessWorkBurnout' },
  career_boundary: {
    domainToolId: 'setWorkBoundary',
    transformArgs: (args) => ({ boundary: args.boundary }),
  },
  career_star: { domainToolId: 'prepareSTARStories' },
  career_salary: { domainToolId: 'researchSalary', transformArgs: (args) => ({ role: args.role }) },
  career_negotiate: {
    domainToolId: 'rolePlayNegotiation',
    transformArgs: (args) => ({ scenario: args.scenario }),
  },

  // ==========================================================================
  // 🏥 HEALTH EXTENDED (8 tools)
  // ==========================================================================
  health_symptom: {
    domainToolId: 'logSymptom',
    transformArgs: (args) => ({ symptom: args.symptom }),
  },
  health_tracking: { domainToolId: 'symptomTracking' },
  health_doctor: {
    domainToolId: 'prepareForDoctorVisit',
    transformArgs: (args) => ({ reason: args.reason }),
  },
  health_second_opinion: { domainToolId: 'prepareSecondOpinionQuestions' },
  health_appointment: {
    domainToolId: 'scheduleHealthcareAppointment',
    transformArgs: (args) => ({ type: args.type }),
  },
  health_preventive: { domainToolId: 'remindPreventiveCare' },
  health_fitness: {
    domainToolId: 'trackFitnessGoal',
    transformArgs: (args) => ({ goal: args.goal }),
  },
  health_nutrition_coach: {
    domainToolId: 'coachOnNutrition',
    transformArgs: (args) => ({ goal: args.goal }),
  },

  // ==========================================================================
  // 🏠 HOME EXTENDED (8 tools)
  // ==========================================================================
  home_project_plan: {
    domainToolId: 'planHomeProject',
    transformArgs: (args) => ({ project: args.project }),
  },
  home_contractor_manage: {
    domainToolId: 'manageContractor',
    transformArgs: (args) => ({ contractor: args.contractor }),
  },
  home_quotes: {
    domainToolId: 'getServiceQuotes',
    transformArgs: (args) => ({ service: args.service }),
  },
  home_repair_track: {
    domainToolId: 'trackRepair',
    transformArgs: (args) => ({ repair: args.repair }),
  },
  home_maintenance_remind: { domainToolId: 'remindHomeMaintenance' },
  home_move_plan: { domainToolId: 'planMove' },
  home_moving: { domainToolId: 'moving' },
  home_declutter_coach: {
    domainToolId: 'coachDecluttering',
    transformArgs: (args) => ({ area: args.area }),
  },

  // ==========================================================================
  // 💰 FINANCE EXTENDED (6 tools)
  // ==========================================================================
  finance_charitable: { domainToolId: 'planCharitableGiving' },
  finance_align_giving: { domainToolId: 'alignGivingWithValues' },
  finance_tax: { domainToolId: 'prepareForTaxSeason' },
  finance_assistance: { domainToolId: 'findFinancialAssistance' },
  finance_insurance: { domainToolId: 'reviewInsuranceCoverage' },
  finance_compare: {
    domainToolId: 'comparePrices',
    transformArgs: (args) => ({ item: args.item }),
  },

  // ==========================================================================
  // 📖 STORIES & REFLECTION (8 tools)
  // ==========================================================================
  story_oral: {
    domainToolId: 'recordOralHistory',
    transformArgs: (args) => ({ prompt: args.prompt }),
  },
  story_family: { domainToolId: 'familyStoryPrompts' },
  story_remember: {
    domainToolId: 'rememberWhen',
    transformArgs: (args) => ({ prompt: args.prompt }),
  },
  story_loved: {
    domainToolId: 'rememberLoved',
    transformArgs: (args) => ({ person: args.person }),
  },
  story_rewrite: { domainToolId: 'rewriteStory', transformArgs: (args) => ({ story: args.story }) },
  story_narrative: { domainToolId: 'findNarrativeThread' },
  story_reframe: {
    domainToolId: 'reframeNarrative',
    transformArgs: (args) => ({ narrative: args.narrative }),
  },
  story_journey: { domainToolId: 'reflectOnJourney' },

  // ==========================================================================
  // 🎯 REFLECTION GAMES (4 tools)
  // ==========================================================================
  reflection_start: {
    domainToolId: 'startReflectionGame',
    transformArgs: (args) => ({ type: args.type }),
  },
  reflection_three_word: { domainToolId: 'threeWordDay' },
  reflection_headline: { domainToolId: 'headlineWriter' },
  reflection_conversation: { domainToolId: 'conversationDeepener' },

  // ==========================================================================
  // 🧓 MIDLIFE & AGING (6 tools)
  // ==========================================================================
  midlife_reckoning: { domainToolId: 'midlifeReckoning' },
  midlife_reinvention: { domainToolId: 'reinventionMidlife' },
  midlife_second_half: { domainToolId: 'secondHalfPurpose' },
  midlife_legacy: { domainToolId: 'legacyBuilding' },
  midlife_end_of_life: { domainToolId: 'endOfLifeConversation' },
  midlife_estate: { domainToolId: 'promptEstatePlanning' },

  // ==========================================================================
  // 🌊 GRIEF EXTENDED (8 tools)
  // ==========================================================================
  grief_companion: { domainToolId: 'companionInGrief' },
  grief_team: { domainToolId: 'getTeamGriefContext' },
  grief_validate: { domainToolId: 'validateGrief', transformArgs: (args) => ({ loss: args.loss }) },
  grief_process: { domainToolId: 'processGrief', transformArgs: (args) => ({ loss: args.loss }) },
  grief_ambiguous: {
    domainToolId: 'navigateAmbiguousLoss',
    transformArgs: (args) => ({ loss: args.loss }),
  },
  grief_dual: {
    domainToolId: 'holdDualEmotions',
    transformArgs: (args) => ({ emotions: args.emotions }),
  },
  grief_hope: { domainToolId: 'holdHopeWhenCant' },
  grief_joy: { domainToolId: 'findMomentsOfJoy' },

  // ==========================================================================
  // 😠 ANGER EXTENDED (6 tools)
  // ==========================================================================
  anger_moment: {
    domainToolId: 'angerInTheMoment',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  anger_repair: {
    domainToolId: 'repairAfterAnger',
    transformArgs: (args) => ({ relationship: args.relationship }),
  },
  anger_flag_maya: { domainToolId: 'flagAngerPatternForMaya' },
  anger_share_nayan: { domainToolId: 'shareAngerInsightWithNayan' },
  anger_dopamine: { domainToolId: 'dopamineManagement' },
  anger_craving: {
    domainToolId: 'cravingSupport',
    transformArgs: (args) => ({ craving: args.craving }),
  },

  // ==========================================================================
  // 🛡️ BOUNDARIES EXTENDED (6 tools)
  // ==========================================================================
  boundary_identify: { domainToolId: 'identifyBoundaryNeeds' },
  boundary_set: {
    domainToolId: 'setBoundary',
    transformArgs: (args) => ({ boundary: args.boundary }),
  },
  boundary_maintain: {
    domainToolId: 'maintainBoundary',
    transformArgs: (args) => ({ boundary: args.boundary }),
  },
  boundary_heal: {
    domainToolId: 'healFromBoundaryViolation',
    transformArgs: (args) => ({ violation: args.violation }),
  },
  boundary_recovery: { domainToolId: 'boundariesForRecovery' },
  boundary_decline: {
    domainToolId: 'practiceDecline',
    transformArgs: (args) => ({ request: args.request }),
  },

  // ==========================================================================
  // 🧠 INNER CRITIC (6 tools)
  // ==========================================================================
  critic_notice: { domainToolId: 'noticeInnerCritic' },
  critic_inner: {
    domainToolId: 'innerCritic',
    transformArgs: (args) => ({ criticism: args.criticism }),
  },
  critic_reframe: {
    domainToolId: 'reframeInnerCritic',
    transformArgs: (args) => ({ thought: args.thought }),
  },
  critic_self_kind: { domainToolId: 'practiceSelfKindness' },
  critic_self_accept: { domainToolId: 'practiceSelfAcceptance' },
  critic_friend: { domainToolId: 'speakToYourselfAsAFriend' },

  // ==========================================================================
  // 🎯 IMPOSTER & CONFIDENCE (4 tools)
  // ==========================================================================
  imposter_syndrome: {
    domainToolId: 'imposterSyndrome',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  imposter_credit: {
    domainToolId: 'giveYourselfCredit',
    transformArgs: (args) => ({ accomplishment: args.accomplishment }),
  },
  imposter_rebuild: { domainToolId: 'rebuildingConfidence' },
  imposter_good_enough: { domainToolId: 'goodEnough' },

  // ==========================================================================
  // 🔗 TEAM COLLABORATION (8 tools)
  // ==========================================================================
  team_insights: { domainToolId: 'getTeamInsights' },
  team_share_pattern: {
    domainToolId: 'sharePatternWithTeam',
    transformArgs: (args) => ({ pattern: args.pattern }),
  },
  team_flag_perfectionism: { domainToolId: 'flagPerfectionismPatternForMaya' },
  team_flag_procrastination: { domainToolId: 'flagProcrastinationPatternForMaya' },
  team_flag_transition: { domainToolId: 'flagTransitionForJordan' },
  team_connection_concern: { domainToolId: 'flagConnectionConcernForMaya' },
  team_request_maya: { domainToolId: 'requestMayaHabitIntervention' },
  team_request_alex: { domainToolId: 'requestAlexProductivitySupport' },

  // ==========================================================================
  // 🎭 WISDOM & PHILOSOPHY (10 tools)
  // ==========================================================================
  wisdom_seasonal: { domainToolId: 'seasonalWisdom' },
  wisdom_apply: {
    domainToolId: 'applySeasonalWisdom',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  wisdom_winter: { domainToolId: 'winterSeason' },
  wisdom_ancestral: { domainToolId: 'ancestralWisdom' },
  wisdom_ancient: {
    domainToolId: 'ancientParallel',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  wisdom_historical: {
    domainToolId: 'historicalParallel',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  wisdom_counter: { domainToolId: 'counterIntuitiveInsight' },
  wisdom_intellectual: {
    domainToolId: 'intellectualExploration',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  wisdom_share_grief: { domainToolId: 'shareGriefInsight' },
  wisdom_share_critic: { domainToolId: 'shareInnerCriticWithNayan' },

  // ==========================================================================
  // 📱 MARKETING & ANALYTICS (4 tools)
  // ==========================================================================
  marketing_analytics: { domainToolId: 'getMarketingAnalytics' },
  marketing_optimal_time: { domainToolId: 'getOptimalSendTime' },
  marketing_data_story: {
    domainToolId: 'dataStorytelling',
    transformArgs: (args) => ({ data: args.data }),
  },
  marketing_headline: {
    domainToolId: 'headlineWriterRespond',
    transformArgs: (args) => ({ topic: args.topic }),
  },

  // ==========================================================================
  // 🔄 FORGIVENESS & HEALING (6 tools)
  // ==========================================================================
  forgiveness_journey: {
    domainToolId: 'forgivenessJourney',
    transformArgs: (args) => ({ toward: args.toward }),
  },
  forgiveness_self: {
    domainToolId: 'practiceSelfForgiveness',
    transformArgs: (args) => ({ for: args.for }),
  },
  forgiveness_compassion: {
    domainToolId: 'compassionateLetter',
    transformArgs: (args) => ({ to: args.to }),
  },
  healing_trauma: { domainToolId: 'selfCompassionTrauma' },
  healing_ptg: { domainToolId: 'postTraumaticGrowth' },
  healing_recovery: {
    domainToolId: 'supportRecoveryJourney',
    transformArgs: (args) => ({ recovery: args.recovery }),
  },

  // ==========================================================================
  // 📍 LOCAL SEARCH & BUSINESS (8 tools)
  // ==========================================================================
  local_business: { domainToolId: 'findBusiness', transformArgs: (args) => ({ type: args.type }) },
  local_restaurant: {
    domainToolId: 'findRestaurants',
    transformArgs: (args) => ({ cuisine: args.cuisine }),
  },
  local_reviews: {
    domainToolId: 'getBusinessReviews',
    transformArgs: (args) => ({ business: args.business }),
  },
  local_info: {
    domainToolId: 'getBusinessInfo',
    transformArgs: (args) => ({ business: args.business }),
  },
  local_phone_lookup: {
    domainToolId: 'lookupBusinessByPhone',
    transformArgs: (args) => ({ phone: args.phone }),
  },
  local_reservation: {
    domainToolId: 'makeRestaurantReservation',
    transformArgs: (args) => ({ restaurant: args.restaurant, time: args.time }),
  },
  local_hotel: {
    domainToolId: 'requestHotelQuotes',
    transformArgs: (args) => ({ location: args.location }),
  },
  local_community: {
    domainToolId: 'findCommunityGroup',
    transformArgs: (args) => ({ interest: args.interest }),
  },

  // ==========================================================================
  // 🎪 EVENTS & CELEBRATIONS (6 tools)
  // ==========================================================================
  event_prepare: {
    domainToolId: 'prepareForUpcomingEvent',
    transformArgs: (args) => ({ event: args.event }),
  },
  event_meaning: {
    domainToolId: 'captureEventMeaning',
    transformArgs: (args) => ({ event: args.event }),
  },
  event_guest: {
    domainToolId: 'getGuestInsights',
    transformArgs: (args) => ({ event: args.event }),
  },
  event_countdown: {
    domainToolId: 'buildCountdown',
    transformArgs: (args) => ({ event: args.event }),
  },
  event_mark: { domainToolId: 'markTheMoment', transformArgs: (args) => ({ moment: args.moment }) },
  event_time_capsule: {
    domainToolId: 'createTimeCapsule',
    transformArgs: (args) => ({ occasion: args.occasion }),
  },

  // ==========================================================================
  // 🌐 COMMUNITY & VOLUNTEERING (4 tools)
  // ==========================================================================
  community_volunteer: {
    domainToolId: 'findVolunteerOpportunity',
    transformArgs: (args) => ({ cause: args.cause }),
  },
  community_track_hours: {
    domainToolId: 'trackVolunteerHours',
    transformArgs: (args) => ({ hours: args.hours }),
  },
  community_civic: { domainToolId: 'engageCivically' },
  community_belonging: { domainToolId: 'createBelonging' },

  // ==========================================================================
  // 📊 PATTERN & INSIGHTS (8 tools)
  // ==========================================================================
  pattern_discover: {
    domainToolId: 'discoverPattern',
    transformArgs: (args) => ({ area: args.area }),
  },
  pattern_record: {
    domainToolId: 'recordPattern',
    transformArgs: (args) => ({ pattern: args.pattern }),
  },
  pattern_predict: {
    domainToolId: 'predictPattern',
    transformArgs: (args) => ({ pattern: args.pattern }),
  },
  pattern_cross_domain: { domainToolId: 'crossDomainConnection' },
  pattern_anomaly: { domainToolId: 'detectAnomaly' },
  pattern_correlation: {
    domainToolId: 'findCorrelation',
    transformArgs: (args) => ({ variables: args.variables }),
  },
  pattern_compare: { domainToolId: 'compareToYesterday' },
  pattern_mirror: { domainToolId: 'surfacePatternMirrorInsight' },

  // ==========================================================================
  // 🎯 DECISIONS EXTENDED (6 tools)
  // ==========================================================================
  decision_frame: {
    domainToolId: 'frameMajorDecision',
    transformArgs: (args) => ({ decision: args.decision }),
  },
  decision_walk: {
    domainToolId: 'walkThroughDecisionFramework',
    transformArgs: (args) => ({ decision: args.decision }),
  },
  decision_risk: {
    domainToolId: 'assessRisk',
    transformArgs: (args) => ({ decision: args.decision }),
  },
  decision_score: {
    domainToolId: 'scoreDecision',
    transformArgs: (args) => ({ decision: args.decision }),
  },
  decision_options: {
    domainToolId: 'scoreOptions',
    transformArgs: (args) => ({ options: args.options }),
  },
  decision_reflect: { domainToolId: 'reflectOnPastDecisions' },

  // ==========================================================================
  // 🌟 CELEBRATION & GRATITUDE (6 tools)
  // ==========================================================================
  celebrate_yourself: { domainToolId: 'celebrateYourself' },
  celebrate_creation: {
    domainToolId: 'celebrateCreation',
    transformArgs: (args) => ({ creation: args.creation }),
  },
  celebrate_maintenance: { domainToolId: 'celebrateMaintenance' },
  celebrate_health: { domainToolId: 'checkCelebrationHealth' },
  note_fun: {
    domainToolId: 'noteThatWasFun',
    transformArgs: (args) => ({ activity: args.activity }),
  },
  recognize_flow: { domainToolId: 'recognizeFlow' },

  // ==========================================================================
  // 🎯 MISC REMAINING TOOLS
  // ==========================================================================
  task_break_down: {
    domainToolId: 'breakDownTask',
    transformArgs: (args) => ({ task: args.task }),
  },
  task_first_step: {
    domainToolId: 'defineFirstStep',
    transformArgs: (args) => ({ goal: args.goal }),
  },
  task_chaos: { domainToolId: 'chaosToOrder' },
  commitment_track: {
    domainToolId: 'trackCommitment',
    transformArgs: (args) => ({ commitment: args.commitment }),
  },
  commitment_review: { domainToolId: 'reviewCommitments' },
  progress_remind: { domainToolId: 'remindOfProgress' },
  progress_check_in: { domainToolId: 'checkInOnJourney' },
  intention_clarify: {
    domainToolId: 'clarifyIntention',
    transformArgs: (args) => ({ intention: args.intention }),
  },
  learning_reflect: { domainToolId: 'reflectOnLearning' },
  lessons_find: {
    domainToolId: 'findTheLessons',
    transformArgs: (args) => ({ experience: args.experience }),
  },
  inspiration_find: {
    domainToolId: 'findInspiration',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  resource_recommend: {
    domainToolId: 'recommendResource',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  anticipation_build: {
    domainToolId: 'anticipationBuilder',
    transformArgs: (args) => ({ event: args.event }),
  },
  safe_resources: {
    domainToolId: 'findSafeResources',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  supports_identify: { domainToolId: 'identifySupports' },
  de_escalate: {
    domainToolId: 'deEscalateAnxiety',
    transformArgs: (args) => ({ anxiety: args.anxiety }),
  },
  somatic_support: { domainToolId: 'somaticSupport' },
  grounding: { domainToolId: 'groundingExercise', transformArgs: (args) => ({ type: args.type }) },
  fear_failure: { domainToolId: 'fearOfFailure' },
  release_urgency: { domainToolId: 'releaseUrgency' },
  rest_as_skill: { domainToolId: 'restAsSkill' },
  honor_rest: { domainToolId: 'honorTheRest' },
  sleep_deprivation: { domainToolId: 'sleepDeprivation' },
  mindful_eating: { domainToolId: 'mindfulEating' },
  nature_prescription: { domainToolId: 'naturePrescription' },
  what_if: { domainToolId: 'whatIf', transformArgs: (args) => ({ scenario: args.scenario }) },
  good_start: { domainToolId: 'goodEnough' },
  energy_budget: { domainToolId: 'energyBudgeting' },
  pacing_plan: { domainToolId: 'pacingPlan' },
  say_no: { domainToolId: 'sayNoWithGrace', transformArgs: (args) => ({ request: args.request }) },
  advocate: {
    domainToolId: 'advocatingForSelf',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  truth_practice: { domainToolId: 'practiceTruth' },
  masking_recovery: { domainToolId: 'maskingRecovery' },
  trauma_responses: { domainToolId: 'traumaResponses' },
  people_pleasing: { domainToolId: 'recoverFromPeoplePleasing' },
  relationship_circles: { domainToolId: 'mapRelationshipCircles' },
  relationship_network: { domainToolId: 'getRelationshipNetworkContext' },
  connection_action: { domainToolId: 'suggestConnectionAction' },
  connection_insight: { domainToolId: 'shareConnectionInsight' },
  connection_wisdom: { domainToolId: 'shareConnectionWisdom' },
  conversation_wisdom: { domainToolId: 'shareConversationWisdom' },
  conversation_start: {
    domainToolId: 'startConversation',
    transformArgs: (args) => ({ with: args.with }),
  },
  message_craft: {
    domainToolId: 'messageCrafting',
    transformArgs: (args) => ({ context: args.context }),
  },
  difficult_email: {
    domainToolId: 'difficultEmailDraft',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  message_schedule: {
    domainToolId: 'scheduleMessage',
    transformArgs: (args) => ({ to: args.to, message: args.message, time: args.time }),
  },
  message_send: {
    domainToolId: 'sendMessageNow',
    transformArgs: (args) => ({ to: args.to, message: args.message }),
  },
  message_broadcast: {
    domainToolId: 'broadcastMessage',
    transformArgs: (args) => ({ message: args.message, to: args.to }),
  },
  contact_save_info: {
    domainToolId: 'saveContactInfo',
    transformArgs: (args) => ({ name: args.name, info: args.info }),
  },
  contact_manage: {
    domainToolId: 'manageContact',
    transformArgs: (args) => ({ contact: args.contact, action: args.action }),
  },
  appointment_manage: {
    domainToolId: 'manageAppointment',
    transformArgs: (args) => ({ appointment: args.appointment }),
  },
  gift_track: {
    domainToolId: 'trackGift',
    transformArgs: (args) => ({ person: args.person, gift: args.gift }),
  },
  gift_suggest: {
    domainToolId: 'suggestGift',
    transformArgs: (args) => ({ person: args.person, occasion: args.occasion }),
  },
  renewal_track: {
    domainToolId: 'trackRenewal',
    transformArgs: (args) => ({ item: args.item, date: args.date }),
  },
  registration_expiry: {
    domainToolId: 'setRegistrationExpiry',
    transformArgs: (args) => ({ vehicle: args.vehicle, date: args.date }),
  },
  impact_track: { domainToolId: 'trackImpact', transformArgs: (args) => ({ action: args.action }) },
  job_application: {
    domainToolId: 'trackJobApplication',
    transformArgs: (args) => ({ company: args.company, role: args.role }),
  },
  books_read: { domainToolId: 'trackBooksRead', transformArgs: (args) => ({ book: args.book }) },
  reading_progress: {
    domainToolId: 'updateReadingProgress',
    transformArgs: (args) => ({ book: args.book, progress: args.progress }),
  },
  book_details: { domainToolId: 'getBookDetails', transformArgs: (args) => ({ book: args.book }) },
  book_recommend: {
    domainToolId: 'getBookRecommendations',
    transformArgs: (args) => ({ genre: args.genre }),
  },
  sports_info: { domainToolId: 'getSports', transformArgs: (args) => ({ query: args.query }) },
  music_info: { domainToolId: 'musicInfo', transformArgs: (args) => ({ query: args.query }) },
  trip_suggestions: {
    domainToolId: 'getTripSuggestions',
    transformArgs: (args) => ({ preferences: args.preferences }),
  },
  dinner_announce: { domainToolId: 'announceDinner' },
  major_announcement: {
    domainToolId: 'majorAnnouncement',
    transformArgs: (args) => ({ announcement: args.announcement }),
  },
  intercom_call: { domainToolId: 'intercomCall', transformArgs: (args) => ({ room: args.room }) },
  wedding_plan: { domainToolId: 'wedding', transformArgs: (args) => ({ aspect: args.aspect }) },
  renovation_plan: {
    domainToolId: 'renovation',
    transformArgs: (args) => ({ project: args.project }),
  },
  restaurant_search: {
    domainToolId: 'restaurant',
    transformArgs: (args) => ({ query: args.query }),
  },
  order_groceries: {
    domainToolId: 'orderGroceries',
    transformArgs: (args) => ({ items: args.items }),
  },
  workflow_templates: { domainToolId: 'listWorkflowTemplates' },
  system_design: {
    domainToolId: 'systemDesign',
    transformArgs: (args) => ({ system: args.system }),
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
      const startTime = performance.now();
      const result = await toolInstance.execute(transformedArgs, {
        // AbortSignal (optional)
      });
      const durationMs = Math.round(performance.now() - startTime);

      // Telemetry: Track which layer handled this tool call
      // 'semantic-router' = Pre-LLM routing bypassed the LLM entirely
      log.info(
        {
          semanticToolId,
          domainToolId: mapping.domainToolId,
          durationMs,
          handledBy: 'semantic-router',
          sessionId: context.sessionId,
          trace: 'E2E_TOOL_SUCCESS',
        },
        `🔍 E2E TRACE [TOOL] Completed: ${mapping.domainToolId} in ${durationMs}ms (via semantic-router)`
      );

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
  totalMappings: number;
  uniqueDomainTools: number;
  categories: number;
  byCategory: Record<string, number>;
} {
  const mappings = Object.keys(TOOL_MAPPINGS);
  const byCategory: Record<string, number> = {};
  const domainTools = new Set<string>();

  for (const id of mappings) {
    const category = id.split('_')[0] || 'other';
    byCategory[category] = (byCategory[category] || 0) + 1;
    domainTools.add(TOOL_MAPPINGS[id].domainToolId);
  }

  return {
    total: mappings.length,
    totalMappings: mappings.length,
    uniqueDomainTools: domainTools.size,
    categories: Object.keys(byCategory).length,
    byCategory,
  };
}

// ==========================================================================
// EXPORTS
// ==========================================================================

export type { ToolMapping };
