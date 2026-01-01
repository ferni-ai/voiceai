/**
 * Dynamic Tool Loader - Topic to Domain Mappings
 *
 * Maps conversation topics/keywords to relevant tool domains.
 * This enables intelligent domain loading based on what the user is discussing.
 *
 * EXPANDED: Now covers 150+ topics across all life domains.
 */

import type { ToolDomain } from '../registry/types.js';

// ============================================================================
// TOPIC TO DOMAIN MAPPING
// ============================================================================

export const TOPIC_TO_DOMAINS: Record<string, ToolDomain[]> = {
  // =========================================================================
  // FINANCIAL TOPICS
  // =========================================================================
  money: ['finance'],
  budget: ['finance'],
  budgeting: ['finance'],
  savings: ['finance'],
  saving: ['finance'],
  investment: ['finance', 'research'],
  investing: ['finance', 'research'],
  stocks: ['research', 'finance'],
  stock: ['research', 'finance'],
  retirement: ['finance', 'life-planning'],
  debt: ['finance'],
  loan: ['finance'],
  mortgage: ['finance'],
  taxes: ['finance'],
  tax: ['finance'],
  income: ['finance'],
  expenses: ['finance'],
  spending: ['finance'],
  credit: ['finance'],
  bank: ['finance'],
  banking: ['finance'],
  salary: ['finance'],
  paycheck: ['finance'],
  portfolio: ['finance', 'research'],
  dividend: ['finance', 'research'],
  etf: ['finance', 'research'],
  crypto: ['finance', 'research'],
  bitcoin: ['finance', 'research'],
  '401k': ['finance'],
  ira: ['finance'],

  // =========================================================================
  // PRODUCTIVITY & WORK TOPICS
  // =========================================================================
  task: ['productivity'],
  tasks: ['productivity'],
  todo: ['productivity'],
  schedule: ['calendar', 'productivity', 'scheduling'],
  scheduling: ['calendar', 'productivity', 'scheduling'],
  meeting: ['calendar', 'communication'],
  meetings: ['calendar', 'communication'],
  appointment: ['calendar'],
  appointments: ['calendar'],
  deadline: ['calendar', 'productivity'],
  deadlines: ['calendar', 'productivity'],
  project: ['productivity'],
  projects: ['productivity'],
  reminder: ['productivity', 'calendar', 'scheduling'],
  reminders: ['productivity', 'calendar', 'scheduling'],
  'remind me': ['productivity', 'scheduling'],
  'set a reminder': ['productivity'],
  'set reminder': ['productivity'],
  organize: ['productivity'],
  organized: ['productivity'],
  planning: ['productivity', 'life-planning'],
  plan: ['productivity', 'life-planning'],
  routine: ['habits', 'productivity'],
  routines: ['habits', 'productivity'],
  morning: ['habits', 'awareness'],
  evening: ['habits', 'awareness'],
  work: ['productivity'],
  working: ['productivity'],
  office: ['productivity'],
  email: ['communication', 'productivity', 'scheduling'],
  emails: ['communication', 'productivity', 'scheduling'],
  call: ['telephony', 'communication', 'scheduling'],
  calls: ['telephony', 'communication', 'scheduling'],
  'call me': ['telephony', 'scheduling'],
  'call my': ['telephony', 'communication'], // "call my mom", "call my doctor"
  'call her': ['telephony', 'communication'],
  'call him': ['telephony', 'communication'],
  'call them': ['telephony', 'communication'],
  'make a call': ['telephony'],
  'place a call': ['telephony'],
  'phone call': ['telephony'],
  phone: ['telephony', 'communication', 'scheduling'],
  dial: ['telephony'],
  ring: ['telephony'],
  voicemail: ['telephony'],
  text: ['telephony', 'communication', 'scheduling'],
  sms: ['telephony', 'communication', 'scheduling'],
  message: ['telephony', 'communication', 'scheduling'],
  'text my': ['telephony', 'communication'],
  'send a text': ['telephony', 'communication'],
  'send an sms': ['telephony', 'communication'],
  'leave a voicemail': ['telephony'],

  // =========================================================================
  // WELLNESS & HEALTH TOPICS
  // =========================================================================
  health: ['wellness'],
  healthy: ['wellness', 'habits'],
  medication: ['wellness'],
  medications: ['wellness'],
  medicine: ['wellness'],
  doctor: ['wellness', 'calendar'],
  sleep: ['wellness', 'habits'],
  sleeping: ['wellness', 'habits'],
  insomnia: ['wellness'],
  tired: ['wellness', 'self-compassion'],
  exhausted: ['wellness', 'self-compassion'],
  exercise: ['wellness', 'habits'],
  exercising: ['wellness', 'habits'],
  workout: ['wellness', 'habits'],
  gym: ['wellness', 'habits'],
  fitness: ['wellness', 'habits'],
  diet: ['wellness', 'habits'],
  eating: ['wellness', 'habits'],
  nutrition: ['wellness'],
  weight: ['wellness', 'habits'],
  stress: ['wellness', 'presence'],
  stressed: ['wellness', 'presence'],
  stressful: ['wellness', 'presence'],
  anxiety: ['wellness', 'presence', 'self-compassion'],
  anxious: ['wellness', 'presence', 'self-compassion'],
  depression: ['wellness', 'self-compassion'],
  depressed: ['wellness', 'self-compassion'],
  meditation: ['presence'],
  meditate: ['presence'],
  mindfulness: ['presence'],
  mindful: ['presence'],
  breathe: ['presence'],
  breathing: ['presence'],
  relax: ['presence', 'wellness'],
  relaxing: ['presence', 'wellness'],
  calm: ['presence'],
  peace: ['presence', 'meaning'],
  therapy: ['wellness', 'self-compassion'],
  therapist: ['wellness'],

  // =========================================================================
  // RELATIONSHIP TOPICS
  // =========================================================================
  relationship: ['relationships'],
  relationships: ['relationships'],
  family: ['relationships'],
  friend: ['relationships'],
  friends: ['relationships'],
  friendship: ['relationships'],
  partner: ['relationships'],
  spouse: ['relationships'],
  husband: ['relationships'],
  wife: ['relationships'],
  boyfriend: ['relationships'],
  girlfriend: ['relationships'],
  dating: ['relationships'],
  marriage: ['relationships'],
  married: ['relationships'],
  wedding: ['relationships', 'life-planning'],
  divorce: ['relationships', 'grief'],
  parent: ['relationships'],
  parents: ['relationships'],
  mom: ['relationships'],
  dad: ['relationships'],
  mother: ['relationships'],
  father: ['relationships'],
  kids: ['relationships'],
  children: ['relationships'],
  son: ['relationships'],
  daughter: ['relationships'],
  sibling: ['relationships'],
  brother: ['relationships'],
  sister: ['relationships'],
  conflict: ['relationships', 'communication'],
  argument: ['relationships', 'communication'],
  fight: ['relationships', 'communication'],
  boundary: ['relationships', 'self-compassion'],
  boundaries: ['relationships', 'self-compassion'],
  communication: ['communication', 'relationships'],
  apologize: ['relationships', 'communication'],
  apology: ['relationships', 'communication'],
  forgive: ['relationships', 'self-compassion'],
  forgiveness: ['relationships', 'self-compassion'],
  trust: ['relationships'],
  love: ['relationships', 'meaning'],
  loving: ['relationships'],

  // =========================================================================
  // LIFE PLANNING & GOALS
  // =========================================================================
  goal: ['life-planning', 'habits'],
  goals: ['life-planning', 'habits'],
  dream: ['dreams', 'life-planning'],
  dreams: ['dreams', 'life-planning'],
  aspiration: ['life-planning', 'meaning'],
  career: ['life-planning'],
  job: ['life-planning', 'productivity'],
  promotion: ['life-planning'],
  purpose: ['meaning'],
  values: ['meaning'],
  value: ['meaning'],
  milestone: ['life-planning'],
  milestones: ['life-planning'],
  achievement: ['life-planning'],
  success: ['life-planning'],
  future: ['life-planning', 'dreams'],
  bucket: ['life-planning', 'dreams'], // bucket list
  legacy: ['meaning', 'life-planning'],
  travel: ['life-planning', 'entertainment'],
  vacation: ['life-planning', 'entertainment'],
  trip: ['life-planning', 'calendar'],
  moving: ['life-planning'],
  move: ['life-planning'],
  house: ['life-planning', 'finance'],
  home: ['life-planning'],
  baby: ['life-planning', 'relationships'],
  pregnant: ['life-planning', 'wellness'],
  college: ['life-planning', 'finance'],
  graduation: ['life-planning'],
  retire: ['life-planning', 'finance'],

  // =========================================================================
  // ENTERTAINMENT & LEISURE
  // =========================================================================
  music: ['entertainment'],
  song: ['entertainment'],
  songs: ['entertainment'],
  spotify: ['entertainment'],
  playlist: ['entertainment'],
  play: ['entertainment', 'play'],
  playing: ['entertainment', 'play'],
  fun: ['play', 'entertainment'],
  game: ['play', 'entertainment'],
  games: ['play', 'entertainment'],
  movie: ['entertainment'],
  movies: ['entertainment'],
  show: ['entertainment'],
  shows: ['entertainment'],
  watch: ['video', 'entertainment'],
  watching: ['video', 'entertainment'],
  book: ['books', 'entertainment', 'wisdom'],
  books: ['books', 'entertainment', 'wisdom'],
  read: ['books', 'entertainment', 'wisdom'],
  reading: ['books', 'entertainment', 'wisdom'],
  podcast: ['podcasts', 'entertainment', 'information'],
  podcasts: ['podcasts', 'entertainment', 'information'],
  episode: ['podcasts', 'entertainment'],
  episodes: ['podcasts', 'entertainment'],
  video: ['video', 'entertainment'],
  videos: ['video', 'entertainment'],
  youtube: ['video', 'entertainment'],
  tutorial: ['video', 'entertainment', 'learning'],
  tutorials: ['video', 'entertainment', 'learning'],
  hobby: ['play', 'entertainment'],
  hobbies: ['play', 'entertainment'],
  creative: ['play'],
  art: ['play'],
  dance: ['entertainment', 'wellness'],
  dancing: ['entertainment', 'wellness'],
  laugh: ['play'],
  laughing: ['play'],
  joke: ['play'],
  jokes: ['play'],
  funny: ['play'],

  // =========================================================================
  // INFORMATION & NEWS
  // =========================================================================
  news: ['information'],
  weather: ['information', 'awareness'],
  forecast: ['information', 'awareness'],
  sports: ['information'],
  score: ['information'],
  scores: ['information'],
  search: ['information'],
  find: ['information'],
  lookup: ['information'],
  google: ['information'],
  learn: ['curiosity', 'information'],
  learning: ['curiosity', 'information'],
  research: ['research', 'information'],
  study: ['curiosity', 'information'],
  question: ['curiosity'],
  curious: ['curiosity'],
  wonder: ['curiosity'],
  wondering: ['curiosity'],

  // =========================================================================
  // EMOTIONAL & SPIRITUAL TOPICS
  // =========================================================================
  sad: ['grief', 'self-compassion'],
  sadness: ['grief', 'self-compassion'],
  loss: ['grief'],
  grieving: ['grief'],
  grief: ['grief'],
  death: ['grief'],
  died: ['grief'],
  passed: ['grief'],
  mourning: ['grief'],
  lonely: ['relationships', 'self-compassion'],
  loneliness: ['relationships', 'self-compassion'],
  alone: ['self-compassion', 'relationships'],
  overwhelmed: ['presence', 'self-compassion'],
  grateful: ['presence', 'meaning'],
  gratitude: ['presence', 'meaning'],
  thankful: ['presence', 'meaning'],
  happy: ['presence', 'play'],
  happiness: ['meaning', 'presence'],
  joy: ['meaning', 'presence'],
  hopeful: ['meaning'],
  hope: ['meaning'],
  afraid: ['self-compassion', 'vulnerability'],
  fear: ['vulnerability', 'self-compassion'],
  scared: ['self-compassion', 'vulnerability'],
  worried: ['self-compassion', 'presence'],
  worry: ['self-compassion', 'presence'],
  angry: ['self-compassion', 'relationships'],
  anger: ['self-compassion', 'relationships'],
  frustrated: ['self-compassion'],
  frustration: ['self-compassion'],
  shame: ['self-compassion', 'vulnerability'],
  guilt: ['self-compassion'],
  regret: ['self-compassion', 'meaning'],
  spiritual: ['meaning'],
  spirituality: ['meaning'],
  faith: ['meaning'],
  god: ['meaning'],
  pray: ['meaning'],
  prayer: ['meaning'],
  soul: ['meaning'],
  meaning: ['meaning'],
  life: ['meaning', 'life-planning'],
  exist: ['meaning'],
  existence: ['meaning'],

  // =========================================================================
  // HABITS & SELF-IMPROVEMENT
  // =========================================================================
  habit: ['habits'],
  habits: ['habits'],
  discipline: ['habits'],
  motivation: ['habits', 'meaning'],
  motivated: ['habits', 'meaning'],
  procrastinate: ['habits', 'self-compassion'],
  procrastinating: ['habits', 'self-compassion'],
  focus: ['presence', 'productivity'],
  focused: ['presence', 'productivity'],
  distracted: ['presence', 'habits'],
  addiction: ['habits', 'self-compassion'],
  quit: ['habits'],
  quitting: ['habits'],
  smoking: ['habits', 'wellness'],
  drinking: ['habits', 'wellness'],
  alcohol: ['habits', 'wellness'],

  // =========================================================================
  // COMMUNICATION & SOCIAL
  // Note: 'text', 'sms', 'message' keywords are defined above in TELEPHONY section
  // with domains ['telephony', 'communication'] - don't duplicate here
  // =========================================================================
  'text me': ['scheduling', 'communication'],
  'send text': ['scheduling', 'communication'],
  'schedule text': ['scheduling'],
  'schedule call': ['scheduling', 'telephony'],
  'schedule email': ['scheduling', 'communication'],
  talk: ['communication'],
  talking: ['communication'],
  conversation: ['communication'],
  speaking: ['communication'],
  present: ['communication', 'presence'],
  presentation: ['communication'],
  interview: ['communication', 'life-planning'],
  networking: ['communication', 'life-planning'],
  social: ['relationships', 'communication'],

  // =========================================================================
  // TIME & AWARENESS
  // =========================================================================
  today: ['awareness', 'calendar'],
  tomorrow: ['awareness', 'calendar'],
  yesterday: ['awareness'],
  weekend: ['awareness', 'calendar'],
  week: ['awareness', 'calendar'],
  month: ['awareness', 'calendar'],
  year: ['awareness', 'life-planning'],
  birthday: ['awareness', 'relationships'],
  anniversary: ['awareness', 'relationships'],
  holiday: ['awareness', 'calendar'],
  christmas: ['awareness'],
  thanksgiving: ['awareness'],
  time: ['awareness', 'presence'],

  // =========================================================================
  // MEMORY & RECALL
  // =========================================================================
  remember: ['memory'],
  recall: ['memory'],
  forgot: ['memory'],
  forget: ['memory'],
  remind: ['memory', 'calendar'],
  'remember that': ['memory'],
  "don't forget": ['memory'],
  'did i tell you': ['memory'],
  'i told you': ['memory'],

  // =========================================================================
  // HANDOFF & TRANSFER
  // =========================================================================
  transfer: ['handoff'],
  handoff: ['handoff'],
  'transfer me': ['handoff'],
  'talk to': ['handoff'],
  'speak with': ['handoff'],
  'connect me': ['handoff'],
  'switch to': ['handoff'],
  'let me talk to': ['handoff'],
};

// ============================================================================
// DOMAIN PRIORITY SCORES
// ============================================================================

/**
 * Priority scores for domains (higher = more likely to stay loaded)
 */
export const DOMAIN_PRIORITY: Partial<Record<ToolDomain, number>> = {
  memory: 100, // Always essential
  handoff: 100, // Always essential
  awareness: 90, // World awareness is important
  telephony: 85, // Phone calls are high-value actions - must not be cut off
  information: 70, // Frequently used
  entertainment: 60, // Common request
  productivity: 50,
  calendar: 50,
  habits: 40,
  finance: 40,
  wellness: 40,
  relationships: 40,
  presence: 35,
  meaning: 35,
  communication: 30,
  research: 30,
  'life-planning': 25,
  grief: 20,
  dreams: 20,
  play: 20,
  'self-compassion': 20,
  stories: 15,
  curiosity: 15,
  vulnerability: 15,
  wisdom: 15,
  proactive: 10,
};

// ============================================================================
// DEFAULT ESSENTIAL DOMAINS
// ============================================================================

/**
 * Domains that are pre-loaded at startup (no race conditions).
 * telephony is essential because "call my mom" should work immediately.
 */
export const DEFAULT_ESSENTIAL_DOMAINS: ToolDomain[] = [
  'memory',
  'handoff',
  'awareness',
  'entertainment',
  'information',
  'telephony',
  'communication',
];
