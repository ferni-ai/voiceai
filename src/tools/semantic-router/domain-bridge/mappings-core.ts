/**
 * Core Tool Mappings
 *
 * Canonical semantic IDs, FTIS V7 Stage 2 labels, Music/Entertainment,
 * Weather/Information, Calendar/Scheduling, Alarms/Timers/Reminders.
 *
 * @module tools/semantic-router/domain-bridge/mappings-core
 */

import type { ToolMapping } from './types.js';

export const CORE_MAPPINGS: Record<string, ToolMapping> = {
  // ==========================================================================
  // ⭐ CANONICAL SEMANTIC IDs (Critical Path)
  // ==========================================================================
  music_play: {
    domainToolId: 'playMusic',
    transformArgs: (args) => ({ query: args.query || args.genre || 'music' }),
  },
  alarm_set: {
    domainToolId: 'setAlarm',
    transformArgs: (args) => ({ time: args.time, label: args.label }),
  },
  alarm_manage: {
    domainToolId: 'setAlarm',
    transformArgs: (args) => ({ time: args.time, label: args.label }),
  },
  timer_set: {
    domainToolId: 'setTimer',
    transformArgs: (args) => ({ duration: args.duration, label: args.label }),
  },
  timer_manage: {
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
  team_handoff: {
    domainToolId: 'handoff',
    transformArgs: (args) => ({
      targetPersona: args.targetPersona || args.persona,
      reason: args.reason || args.topic,
    }),
  },
  research_topic: {
    domainToolId: 'deepResearch',
    transformArgs: (args) => ({ topic: args.topic, depth: args.depth }),
  },

  // ==========================================================================
  // 🧠 FTIS V7 Stage 2 Labels
  // ==========================================================================
  music_control: {
    domainToolId: 'musicControl',
    transformArgs: (args) => ({ action: args.action || 'pause' }),
  },
  music_info: {
    domainToolId: 'musicInfo',
    transformArgs: (args) => ({ query: args.query }),
  },
  calendar_read: { domainToolId: 'getCalendarEvents', transformArgs: (args) => args },
  calendar_delete: { domainToolId: 'deleteCalendarEvent', transformArgs: (args) => args },
  calendar_modify: { domainToolId: 'updateCalendarEvent', transformArgs: (args) => args },
  habit_manage: { domainToolId: 'manageHabit', transformArgs: (args) => args },
  habit_coach: { domainToolId: 'habitCoaching', transformArgs: (args) => args },
  habit_stats: { domainToolId: 'getHabitStats', transformArgs: (args) => args },
  task_create: { domainToolId: 'createTask', transformArgs: (args) => args },
  task_read: { domainToolId: 'getTasks', transformArgs: (args) => args },
  task_complete: { domainToolId: 'completeTask', transformArgs: (args) => args },
  reminder_manage: { domainToolId: 'createReminder', transformArgs: (args) => args },
  routine_manage: { domainToolId: 'manageRoutine', transformArgs: (args) => args },
  call_make: { domainToolId: 'makeCall', transformArgs: (args) => args },
  call_schedule: { domainToolId: 'scheduleCall', transformArgs: (args) => args },
  travel_plan: { domainToolId: 'planTrip', transformArgs: (args) => args },
  travel_ride: { domainToolId: 'getRide', transformArgs: (args) => args },
  focus_start: { domainToolId: 'startFocusSession', transformArgs: (args) => args },
  food_plan: { domainToolId: 'mealPlan', transformArgs: (args) => args },
  food_order: { domainToolId: 'orderFood', transformArgs: (args) => args },
  games_play: { domainToolId: 'startGame', transformArgs: (args) => args },
  social_post: { domainToolId: 'createSocialPost', transformArgs: (args) => args },
  message_manage: { domainToolId: 'manageMessages', transformArgs: (args) => args },
  home_control: { domainToolId: 'controlSmartHome', transformArgs: (args) => args },
  document_manage: { domainToolId: 'manageDocument', transformArgs: (args) => args },
  finance_manage: { domainToolId: 'manageFinance', transformArgs: (args) => args },
  concierge_manage: { domainToolId: 'concierge', transformArgs: (args) => args },
  memory_photos: { domainToolId: 'browsePhotos', transformArgs: (args) => args },
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
  shortcuts_music: {
    domainToolId: 'playMusic',
    transformArgs: (args) => ({ query: args.query || 'music' }),
  },
  spotify_pause: { domainToolId: 'musicControl', transformArgs: () => ({ action: 'pause' }) },
  spotify_skip: { domainToolId: 'musicControl', transformArgs: () => ({ action: 'skip' }) },
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
  game_trivia: { domainToolId: 'startGame', transformArgs: () => ({ gameType: 'trivia' }) },
  game_storytelling: {
    domainToolId: 'startGame',
    transformArgs: () => ({ gameType: 'storytelling' }),
  },

  // ==========================================================================
  // 🌤️ WEATHER & INFORMATION (12 tools)
  // ==========================================================================
  knowledge_search: {
    domainToolId: 'getWeather',
    transformArgs: (args) => ({ location: args.location || args.city }),
  },
  knowledge_news: { domainToolId: 'getNews', transformArgs: (args) => ({ query: args.query }) },
  knowledge_media: { domainToolId: 'getNews', transformArgs: (args) => ({ query: args.query }) },
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
  info_search: { domainToolId: 'webSearch', transformArgs: (args) => ({ query: args.query }) },
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
  dictionary_wotd: { domainToolId: 'getWordOfTheDay' },

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
    transformArgs: (args) => ({ contact: args.contact, time: args.time, message: args.message }),
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
    transformArgs: (args) => ({ to: args.to, message: args.message, sendAt: args.sendAt }),
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
  alarms_list: { domainToolId: 'getAlarms' },
  alarms_delete: { domainToolId: 'deleteAlarm', transformArgs: (args) => ({ id: args.id }) },
  alarms_snooze: {
    domainToolId: 'snoozeAlarm',
    transformArgs: (args) => ({ id: args.id, minutes: args.minutes ?? 10 }),
  },
  productivity_set_reminder: {
    domainToolId: 'setReminder',
    transformArgs: (args) => ({ message: args.message, time: args.time }),
  },
  productivity_get_reminders: { domainToolId: 'getReminders' },
  productivity_cancel_reminder: {
    domainToolId: 'cancelReminder',
    transformArgs: (args) => ({ id: args.id }),
  },
};
