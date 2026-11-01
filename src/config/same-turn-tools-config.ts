/**
 * TOOLS_SAME_TURN (off by default): the tools a turn's words point to reach
 * that turn's request.
 *
 * Topic tools used to reach the agent only after its reply had started
 * (voice-agent/deferred-tool-update.ts), so the turn that asked never had them.
 * Dev release check 2026-10-18: "find me a YouTube video..." and "find me a
 * coffee shop near downtown St. Petersburg" loaded video and local-search
 * 33-97 ms after the transcript, the model called searchWeb at +0.6-1.8 s, and
 * searchYouTube / searchLocalBusinesses arrived at +1.0-2.0 s: searchWeb said
 * "No results" 6 of 6 times.
 *
 * With the flag on, the persona agent's llmNode adds the matched topics' tools
 * to the reply's own tool context (agents/personas/same-turn-tools.ts), built
 * synchronously from domains already in the registry. And since a topic's
 * tools now reach the turn that names it, a call no longer needs most of the
 * essential domains up front: the first agent holds LEAN_ALWAYS_ON_TOOLS (plus
 * handoffs and the call's journal/endCall tools), and a call's standing tool
 * set stays within the initial cap plus the topic headroom (64 + 24 = 88)
 * under append-only tools too. Before: 64 tools at the greeting, 91 after it,
 * 113 after two topics (dev, limit 88); latency grows with tool count (~0.83 s
 * at 30, ~1.0 s at 120, 7.7 s at 340).
 *
 * Every read happens once a call has its caller (after applyCallerFlags), so a
 * cohort can turn it on.
 *
 * @module config/same-turn-tools-config
 */
import { flagOn, type Env } from './env-flag.js';

export function sameTurnToolsEnabled(env: Env = process.env): boolean {
  return flagOn('TOOLS_SAME_TURN', env);
}

/**
 * The always-on tools under TOOLS_SAME_TURN, each with the domain it is
 * registered in. Prod tool calls 2026-10-05..18 (cloud-agents,
 * CA_GeFvEpsNXLSF; 105 calls in 65 sessions): callOnBehalf 19, handoffs 22,
 * playMusic 4, getContactInfo 4, manageContact 3, musicControl 2,
 * recallFromMemory 2, callUser 2, whatCanYouDo 2, one each of rememberAboutUser,
 * tellJoke, softTeamIntro, introduceMember, getCurrentContext, quickText,
 * reachOut, getWeather, endCall. All of those stay; so do crisis, memory,
 * handoff, calendar, reminders, timers, phone calls, weather and music, used or
 * not. Everything else waits for its topic.
 */
export const LEAN_ALWAYS_ON_TOOLS: Readonly<Record<string, string>> = {
  // Safety: never left to a topic
  provideCrisisResources: 'crisis',
  deEscalateAnxiety: 'crisis',
  createSafetyPlan: 'crisis',
  quickCrisisResources: 'human-transfer',
  evaluateHumanTransfer: 'human-transfer',
  connectToHumanExpert: 'human-transfer',
  groundingExercise: 'presence',
  breatheWithMe: 'presence',
  groundingForTrauma: 'trauma-support',
  // Memory
  rememberAboutUser: 'memory',
  recallFromMemory: 'memory',
  recallPreviousConversation: 'memory',
  rememberImportantFact: 'memory',
  surfaceRelevantMemory: 'memory',
  getRelationshipSummary: 'memory',
  updateMemory: 'memory',
  forgetMemory: 'memory',
  // Calendar, reminders, timers
  getCalendarToday: 'calendar',
  getCalendarWeek: 'calendar',
  createCalendarEvent: 'calendar',
  quickCalendar: 'simple-utilities',
  setReminder: 'productivity',
  getReminders: 'productivity',
  quickTimer: 'simple-utilities',
  quickAlarm: 'simple-utilities',
  // Phone calls and texts
  callOnBehalf: 'telephony',
  callStatus: 'telephony',
  callUser: 'telephony',
  scheduleCallback: 'telephony',
  callAndConverse: 'telephony',
  quickCall: 'simple-utilities',
  quickText: 'simple-utilities',
  getContactInfo: 'communication',
  manageContact: 'calendar',
  // Weather, news, web search
  getWeather: 'information',
  getWeatherForecast: 'information',
  quickWeather: 'simple-utilities',
  getNews: 'information',
  searchWeb: 'information',
  // Music
  playMusic: 'entertainment',
  musicControl: 'entertainment',
  musicInfo: 'entertainment',
  musicProvider: 'entertainment',
  quickMusic: 'simple-utilities',
  // Core
  getCurrentContext: 'awareness',
  getUserContext: 'awareness',
  whatCanYouDo: 'simple-utilities',
  tellJoke: 'simple-utilities',
  // Only exist with GAME_STATE=on / COACH_MEDIA=on; no topic loads the games domain.
  gameState: 'games',
  findCoachingResources: 'learning',
  coachingPick: 'learning',
};

/** Built with the session's handoffs (handoff-factory.ts), not registry tools. */
export const LEAN_TEAM_TOOLS: readonly string[] = [
  'softTeamIntro',
  'introduceMember',
  'meetTheTeam',
  'askForTeammate',
];

/** Always-on under TOOLS_SAME_TURN, by name. */
export function isLeanAlwaysOnTool(name: string): boolean {
  return name in LEAN_ALWAYS_ON_TOOLS || LEAN_TEAM_TOOLS.includes(name);
}

/**
 * The session loader's always-loaded domains under TOOLS_SAME_TURN. The other
 * essential domains (calendar, telephony, entertainment, crisis...) keep their
 * always-on tools above and load in full when a topic names them.
 */
export const LEAN_LOADER_DOMAINS: readonly string[] = ['memory', 'handoff'];

/** The most tools the same-turn lookup adds to one request. */
export const SAME_TURN_MAX_TOOLS = 8;
