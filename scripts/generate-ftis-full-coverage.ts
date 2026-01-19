#!/usr/bin/env npx tsx
/**
 * FTIS Full Coverage Training Data Generator
 *
 * Generates training data for ALL 886 semantic tool IDs.
 * Target: 300K+ examples for maximum coverage.
 *
 * Usage:
 *   npx tsx scripts/generate-ftis-full-coverage.ts
 *
 * @module scripts/generate-ftis-full-coverage
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { performance } from 'perf_hooks';
import * as path from 'path';

const OUTPUT_DIR = './models/ftis-router-v2';
const EXAMPLES_PER_TOOL = 350; // 886 tools × 350 = 310,100 examples

// ============================================================================
// UNIVERSAL QUERY TEMPLATES
// ============================================================================

// These templates work for ANY tool by using the tool's action/keywords
const DIRECT_TEMPLATES = [
  '{action}',
  '{action} please',
  '{action} now',
  'just {action}',
  'go {action}',
  'do {action}',
  '{action} for me',
  '{action} real quick',
  'quickly {action}',
];

const POLITE_TEMPLATES = [
  'can you {action}',
  'could you {action}',
  'would you {action}',
  'will you {action}',
  'please {action}',
  'can you please {action}',
  'could you please {action}',
  'would you mind {action}',
  "I'd appreciate if you could {action}",
  'help me {action}',
];

const DESIRE_TEMPLATES = [
  'I want to {action}',
  'I need to {action}',
  "I'd like to {action}",
  'I would like to {action}',
  'I wanna {action}',
  "let's {action}",
  'time to {action}',
  "I'm trying to {action}",
  'I was hoping to {action}',
];

const QUESTION_TEMPLATES = [
  'how do I {action}',
  'can I {action}',
  'is it possible to {action}',
  'help me {action}',
  'show me how to {action}',
  'what if I want to {action}',
];

const CASUAL_TEMPLATES = [
  'yo {action}',
  'hey {action}',
  'ok {action}',
  'alright {action}',
  'so {action}',
  'um {action}',
  'uh {action}',
  'hmm {action}',
  'actually {action}',
  'wait {action}',
];

// ============================================================================
// CATEGORY-SPECIFIC ACTION GENERATORS
// ============================================================================

interface ActionGenerator {
  prefixes: string[];
  verbs: string[];
  objects: string[];
  suffixes: string[];
}

const CATEGORY_GENERATORS: Record<string, ActionGenerator> = {
  // Music
  music: {
    prefixes: ['', 'some ', 'my '],
    verbs: ['play', 'put on', 'start', 'queue', 'shuffle'],
    objects: ['music', 'songs', 'tunes', 'tracks', 'playlist', 'jazz', 'rock', 'pop'],
    suffixes: ['', ' on spotify', ' for me'],
  },
  spotify: {
    prefixes: ['', 'my '],
    verbs: ['play', 'pause', 'skip', 'resume', 'shuffle'],
    objects: ['spotify', 'music', 'playlist', 'song', 'track'],
    suffixes: ['', ' on spotify'],
  },
  
  // Weather
  weather: {
    prefixes: ['the ', ''],
    verbs: ['check', 'get', 'show', 'tell me'],
    objects: ['weather', 'forecast', 'temperature', 'conditions'],
    suffixes: ['', ' today', ' tomorrow', ' this week'],
  },
  
  // Calendar
  calendar: {
    prefixes: ['my ', 'the ', ''],
    verbs: ['check', 'show', 'create', 'add', 'schedule', 'list'],
    objects: ['calendar', 'schedule', 'events', 'appointments', 'meeting'],
    suffixes: ['', ' today', ' tomorrow', ' this week'],
  },
  scheduling: {
    prefixes: ['a ', 'my ', ''],
    verbs: ['schedule', 'book', 'set up', 'arrange', 'plan'],
    objects: ['meeting', 'call', 'appointment', 'event', 'time'],
    suffixes: ['', ' for tomorrow', ' next week'],
  },
  
  // Alarms & Timers
  alarms: {
    prefixes: ['an ', 'my ', ''],
    verbs: ['set', 'create', 'delete', 'cancel', 'show', 'list', 'snooze'],
    objects: ['alarm', 'alarms', 'wake up call'],
    suffixes: ['', ' for 7am', ' for tomorrow'],
  },
  timer: {
    prefixes: ['a ', ''],
    verbs: ['set', 'start', 'create', 'stop', 'cancel'],
    objects: ['timer', 'countdown'],
    suffixes: ['', ' for 10 minutes', ' for 1 hour'],
  },
  
  // Reminders
  reminder: {
    prefixes: ['a ', 'my ', ''],
    verbs: ['set', 'create', 'remind', 'show', 'list', 'cancel'],
    objects: ['reminder', 'reminders'],
    suffixes: ['', ' to call mom', ' for tomorrow'],
  },
  productivity: {
    prefixes: ['my ', 'a ', ''],
    verbs: ['set', 'show', 'create', 'track', 'manage', 'get'],
    objects: ['reminder', 'task', 'tasks', 'notes', 'focus', 'commitments'],
    suffixes: ['', ' for today'],
  },
  
  // Habits
  habit: {
    prefixes: ['my ', 'a ', ''],
    verbs: ['track', 'log', 'create', 'check', 'show', 'complete'],
    objects: ['habit', 'habits', 'routine', 'streak', 'progress'],
    suffixes: ['', ' meditation', ' exercise', ' reading'],
  },
  habits: {
    prefixes: ['my ', ''],
    verbs: ['show', 'list', 'check', 'get'],
    objects: ['habits', 'habit list', 'habit progress', 'streaks'],
    suffixes: [''],
  },
  
  // Handoffs
  handoff: {
    prefixes: ['', 'to '],
    verbs: ['transfer', 'switch', 'talk to', 'hand off', 'connect', 'let me speak with'],
    objects: ['Ferni', 'Maya', 'Peter', 'Alex', 'Jordan', 'Nayan', 'someone else'],
    suffixes: ['', ' please'],
  },
  
  // Communication
  call: {
    prefixes: ['', 'my '],
    verbs: ['call', 'phone', 'dial', 'ring'],
    objects: ['mom', 'dad', 'John', 'Sarah', 'friend', 'boss'],
    suffixes: ['', ' please'],
  },
  comm: {
    prefixes: ['a ', ''],
    verbs: ['send', 'draft', 'write', 'compose'],
    objects: ['message', 'text', 'email'],
    suffixes: ['', ' to John', ' to mom'],
  },
  sms: {
    prefixes: ['my ', ''],
    verbs: ['read', 'check', 'show', 'search'],
    objects: ['messages', 'texts', 'SMS'],
    suffixes: ['', ' from today'],
  },
  telephony: {
    prefixes: ['a ', ''],
    verbs: ['make', 'schedule', 'check'],
    objects: ['call', 'callback', 'voicemail'],
    suffixes: ['', ' to John'],
  },
  contact: {
    prefixes: ['a ', 'my ', ''],
    verbs: ['save', 'add', 'find', 'show', 'list'],
    objects: ['contact', 'contacts', 'phone number'],
    suffixes: ['', ' for John'],
  },
  
  // Research
  research: {
    prefixes: ['', 'about '],
    verbs: ['research', 'look up', 'find out', 'search', 'investigate'],
    objects: ['topic', 'AI', 'history', 'science', 'information'],
    suffixes: ['', ' for me'],
  },
  info: {
    prefixes: ['the ', ''],
    verbs: ['get', 'show', 'tell me', 'what is'],
    objects: ['time', 'date', 'news', 'weather', 'sports scores'],
    suffixes: ['', ' today'],
  },
  
  // Crisis
  crisis: {
    prefixes: ['', 'some '],
    verbs: ['need', 'want', 'get'],
    objects: ['help', 'support', 'crisis support', 'someone to talk to'],
    suffixes: ['', ' right now'],
  },
  grounding: {
    prefixes: ['a ', ''],
    verbs: ['do', 'start', 'guide me through'],
    objects: ['grounding exercise', 'breathing exercise', 'calming exercise'],
    suffixes: ['', ' please'],
  },
  safety: {
    prefixes: ['a ', 'my ', ''],
    verbs: ['create', 'make', 'update'],
    objects: ['safety plan', 'crisis plan'],
    suffixes: [''],
  },
  
  // Smart Home
  smarthome: {
    prefixes: ['the ', 'my ', ''],
    verbs: ['turn on', 'turn off', 'set', 'adjust', 'control'],
    objects: ['lights', 'thermostat', 'locks', 'door', 'temperature'],
    suffixes: ['', ' in the bedroom', ' to 72'],
  },
  
  // Games
  game: {
    prefixes: ['a ', ''],
    verbs: ['play', 'start', 'begin'],
    objects: ['game', 'trivia', 'quiz', 'story game'],
    suffixes: ['', ' with me'],
  },
  
  // Lists
  lists: {
    prefixes: ['my ', 'a ', 'the ', ''],
    verbs: ['add to', 'show', 'create', 'check', 'view'],
    objects: ['list', 'grocery list', 'shopping list', 'todo list'],
    suffixes: ['', ' milk', ' items'],
  },
  
  // Health
  health: {
    prefixes: ['my ', ''],
    verbs: ['track', 'log', 'show', 'check', 'record'],
    objects: ['exercise', 'workout', 'sleep', 'water', 'health', 'nutrition'],
    suffixes: ['', ' today'],
  },
  wellness: {
    prefixes: ['a ', ''],
    verbs: ['do', 'start', 'check'],
    objects: ['wellness check', 'check-in', 'grounding exercise'],
    suffixes: [''],
  },
  sleep: {
    prefixes: ['my ', ''],
    verbs: ['track', 'show', 'analyze', 'help with'],
    objects: ['sleep', 'sleep quality', 'sleep schedule'],
    suffixes: ['', ' last night'],
  },
  
  // Finance
  finance: {
    prefixes: ['my ', 'the ', ''],
    verbs: ['check', 'show', 'track', 'calculate'],
    objects: ['budget', 'spending', 'bills', 'expenses', 'savings'],
    suffixes: ['', ' this month'],
  },
  currency: {
    prefixes: ['', ''],
    verbs: ['convert', 'exchange', 'calculate'],
    objects: ['currency', 'dollars', 'euros', 'exchange rate'],
    suffixes: ['', ' to euros'],
  },
  
  // Travel
  travel: {
    prefixes: ['a ', ''],
    verbs: ['search', 'find', 'book', 'plan'],
    objects: ['flights', 'hotels', 'trip', 'vacation', 'travel'],
    suffixes: ['', ' to Paris', ' to New York'],
  },
  
  // Memory
  memory: {
    prefixes: ['', 'that '],
    verbs: ['remember', 'save', 'recall', 'note'],
    objects: ['this', 'that', 'fact', 'information'],
    suffixes: ['', ' about me'],
  },
  
  // Voice Memos
  voice: {
    prefixes: ['a ', 'my ', ''],
    verbs: ['save', 'record', 'play', 'list', 'search'],
    objects: ['voice memo', 'memo', 'note', 'recording'],
    suffixes: [''],
  },
  
  // Books
  books: {
    prefixes: ['', 'a '],
    verbs: ['find', 'search', 'add', 'show', 'recommend'],
    objects: ['books', 'book', 'reading list'],
    suffixes: ['', ' about AI', ' to read'],
  },
  
  // Recommendations
  recommend: {
    prefixes: ['', 'some '],
    verbs: ['recommend', 'suggest', 'find'],
    objects: ['restaurants', 'books', 'podcasts', 'gifts', 'movies'],
    suffixes: ['', ' near me', ' for dinner'],
  },
  local: {
    prefixes: ['', 'a '],
    verbs: ['find', 'search', 'look up'],
    objects: ['restaurants', 'places', 'businesses', 'stores'],
    suffixes: ['', ' nearby', ' near me'],
  },
  
  // Coaching
  coaching: {
    prefixes: ['', 'some '],
    verbs: ['need', 'want', 'get', 'help with'],
    objects: ['motivation', 'advice', 'help', 'coaching', 'support'],
    suffixes: ['', ' please'],
  },
  burnout: {
    prefixes: ['', 'my '],
    verbs: ['assess', 'help with', 'recover from', 'prevent'],
    objects: ['burnout', 'exhaustion', 'stress'],
    suffixes: [''],
  },
  
  // Grief
  grief: {
    prefixes: ['', 'my '],
    verbs: ['process', 'deal with', 'handle', 'support'],
    objects: ['grief', 'loss', 'sadness'],
    suffixes: [''],
  },
  
  // Decisions
  decision: {
    prefixes: ['a ', 'this ', ''],
    verbs: ['make', 'help with', 'decide', 'analyze'],
    objects: ['decision', 'choice', 'options'],
    suffixes: ['', ' for me'],
  },
  
  // Self Compassion
  self: {
    prefixes: ['', 'my '],
    verbs: ['work on', 'help with', 'practice'],
    objects: ['self compassion', 'self forgiveness', 'self worth', 'inner critic'],
    suffixes: [''],
  },
  
  // Meaning
  meaning: {
    prefixes: ['my ', ''],
    verbs: ['find', 'discover', 'clarify', 'explore'],
    objects: ['purpose', 'meaning', 'values', 'direction'],
    suffixes: ['', ' in life'],
  },
  
  // Career
  career: {
    prefixes: ['my ', 'a ', ''],
    verbs: ['help with', 'find', 'prepare for', 'improve'],
    objects: ['job', 'career', 'interview', 'resume', 'job search'],
    suffixes: [''],
  },
  
  // Relationships
  relationship: {
    prefixes: ['my ', ''],
    verbs: ['help with', 'improve', 'fix', 'work on'],
    objects: ['relationship', 'relationships', 'conflict', 'issues'],
    suffixes: [''],
  },
  
  // Dating
  dating: {
    prefixes: ['', 'my '],
    verbs: ['help with', 'give advice on', 'support'],
    objects: ['dating', 'breakup', 'love life'],
    suffixes: [''],
  },
  breakup: {
    prefixes: ['my ', 'a ', ''],
    verbs: ['process', 'deal with', 'get over', 'heal from'],
    objects: ['breakup', 'ex', 'heartbreak'],
    suffixes: [''],
  },
  
  // Family
  family: {
    prefixes: ['my ', ''],
    verbs: ['help with', 'manage', 'improve', 'deal with'],
    objects: ['family', 'parenting', 'kids', 'conflict', 'relationships'],
    suffixes: [''],
  },
  
  // Anger
  anger: {
    prefixes: ['my ', ''],
    verbs: ['manage', 'control', 'deal with', 'process'],
    objects: ['anger', 'frustration', 'rage'],
    suffixes: [''],
  },
  
  // Home
  home: {
    prefixes: ['my ', 'the ', ''],
    verbs: ['organize', 'declutter', 'plan', 'maintain', 'repair'],
    objects: ['home', 'house', 'room', 'space'],
    suffixes: [''],
  },
  
  // Entertainment
  entertainment: {
    prefixes: ['', 'a '],
    verbs: ['recommend', 'find', 'suggest'],
    objects: ['movie', 'TV show', 'show', 'something to watch'],
    suffixes: ['', ' to watch'],
  },
  video: {
    prefixes: ['', 'a '],
    verbs: ['search', 'find', 'play', 'show'],
    objects: ['video', 'YouTube video', 'videos'],
    suffixes: ['', ' about cooking'],
  },
  
  // Learning
  learning: {
    prefixes: ['', 'a '],
    verbs: ['learn', 'study', 'explain', 'teach'],
    objects: ['topic', 'skill', 'language', 'subject'],
    suffixes: ['', ' to me'],
  },
  
  // Legal/Admin
  legal: {
    prefixes: ['my ', ''],
    verbs: ['organize', 'find', 'manage', 'track'],
    objects: ['documents', 'legal docs', 'insurance', 'estate'],
    suffixes: [''],
  },
  doc: {
    prefixes: ['a ', 'my ', ''],
    verbs: ['save', 'find', 'track', 'locate'],
    objects: ['document', 'documents', 'receipt', 'warranty'],
    suffixes: [''],
  },
  
  // Vibe
  vibe: {
    prefixes: ['the ', 'a ', ''],
    verbs: ['set', 'change', 'create', 'adjust'],
    objects: ['vibe', 'mood', 'atmosphere', 'environment'],
    suffixes: ['', ' to relaxing', ' to energetic'],
  },
  ambient: {
    prefixes: ['', 'the '],
    verbs: ['set', 'adjust', 'change'],
    objects: ['ambient', 'lighting', 'mood', 'atmosphere'],
    suffixes: [''],
  },
  
  // CEO
  ceo: {
    prefixes: ['my ', ''],
    verbs: ['show', 'give me', 'prepare', 'log'],
    objects: ['briefing', 'priorities', 'wins', 'journal', 'gratitude'],
    suffixes: ['', ' for today'],
  },
  
  // Projects
  project: {
    prefixes: ['a ', 'my ', ''],
    verbs: ['create', 'track', 'update', 'show'],
    objects: ['project', 'projects', 'task', 'status'],
    suffixes: [''],
  },
  
  // Digital
  digital: {
    prefixes: ['my ', ''],
    verbs: ['audit', 'manage', 'check', 'reduce'],
    objects: ['digital', 'screen time', 'social media', 'notifications'],
    suffixes: [''],
  },
  
  // Boundary
  boundary: {
    prefixes: ['', 'my '],
    verbs: ['set', 'maintain', 'identify', 'enforce'],
    objects: ['boundaries', 'boundary', 'limits'],
    suffixes: [''],
  },
  
  // Transition
  transition: {
    prefixes: ['this ', 'my ', ''],
    verbs: ['navigate', 'process', 'handle', 'manage'],
    objects: ['transition', 'change', 'life change'],
    suffixes: [''],
  },
  
  // Story
  story: {
    prefixes: ['my ', 'a ', ''],
    verbs: ['tell', 'share', 'record', 'explore'],
    objects: ['story', 'life story', 'narrative', 'memories'],
    suffixes: [''],
  },
  
  // Presence
  presence: {
    prefixes: ['', 'the '],
    verbs: ['practice', 'find', 'cultivate', 'experience'],
    objects: ['presence', 'moment', 'mindfulness', 'joy'],
    suffixes: [''],
  },
  
  // Play
  play: {
    prefixes: ['', 'more '],
    verbs: ['allow', 'cultivate', 'embrace', 'experience'],
    objects: ['play', 'fun', 'spontaneity', 'creativity'],
    suffixes: [''],
  },
  
  // Growth
  growth: {
    prefixes: ['my ', ''],
    verbs: ['identify', 'work on', 'assess', 'track'],
    objects: ['growth', 'growth areas', 'development'],
    suffixes: [''],
  },
  
  // Vulnerability
  vulnerability: {
    prefixes: ['my ', ''],
    verbs: ['explore', 'share', 'process', 'embrace'],
    objects: ['vulnerability', 'feelings', 'emotions'],
    suffixes: [''],
  },
  
  // Connection
  connection: {
    prefixes: ['', 'more '],
    verbs: ['find', 'build', 'maintain', 'deepen'],
    objects: ['connection', 'connections', 'friendships', 'relationships'],
    suffixes: [''],
  },
  
  // Wisdom
  wisdom: {
    prefixes: ['', 'some '],
    verbs: ['share', 'give me', 'find', 'apply'],
    objects: ['wisdom', 'insight', 'perspective', 'advice'],
    suffixes: [''],
  },
  
  // Team
  team: {
    prefixes: ['the ', ''],
    verbs: ['share with', 'coordinate with', 'get insights from'],
    objects: ['team', 'insights', 'patterns'],
    suffixes: [''],
  },
  
  // Pattern
  pattern: {
    prefixes: ['my ', 'the ', ''],
    verbs: ['discover', 'identify', 'analyze', 'track'],
    objects: ['patterns', 'pattern', 'trends'],
    suffixes: [''],
  },
  
  // Celebrate
  celebrate: {
    prefixes: ['my ', 'this ', ''],
    verbs: ['celebrate', 'acknowledge', 'recognize'],
    objects: ['win', 'progress', 'achievement', 'success'],
    suffixes: [''],
  },
  
  // Task
  task: {
    prefixes: ['this ', 'my ', ''],
    verbs: ['break down', 'start', 'organize', 'tackle'],
    objects: ['task', 'tasks', 'project', 'work'],
    suffixes: [''],
  },
  
  // Commitment
  commitment: {
    prefixes: ['my ', 'a ', ''],
    verbs: ['track', 'record', 'review', 'complete'],
    objects: ['commitment', 'commitments', 'promise'],
    suffixes: [''],
  },
  
  // Progress
  progress: {
    prefixes: ['my ', ''],
    verbs: ['check', 'track', 'show', 'review'],
    objects: ['progress', 'advancement', 'development'],
    suffixes: [''],
  },
  
  // Sobriety
  sobriety: {
    prefixes: ['my ', ''],
    verbs: ['check in on', 'support', 'track'],
    objects: ['sobriety', 'recovery', 'journey'],
    suffixes: [''],
  },
  
  // Shame
  shame: {
    prefixes: ['my ', ''],
    verbs: ['process', 'explore', 'heal', 'work through'],
    objects: ['shame', 'guilt', 'feelings'],
    suffixes: [''],
  },
  
  // Resentment
  resentment: {
    prefixes: ['my ', ''],
    verbs: ['process', 'release', 'explore', 'work through'],
    objects: ['resentment', 'anger', 'bitterness'],
    suffixes: [''],
  },
  
  // Procrastination
  procrastination: {
    prefixes: ['my ', ''],
    verbs: ['overcome', 'address', 'understand', 'beat'],
    objects: ['procrastination', 'avoidance', 'delay'],
    suffixes: [''],
  },
  
  // Perfectionism
  perfectionism: {
    prefixes: ['my ', ''],
    verbs: ['address', 'overcome', 'understand', 'manage'],
    objects: ['perfectionism', 'perfectionist tendencies'],
    suffixes: [''],
  },
  
  // Social
  social: {
    prefixes: ['my ', ''],
    verbs: ['improve', 'practice', 'work on', 'handle'],
    objects: ['social skills', 'small talk', 'social anxiety'],
    suffixes: [''],
  },
  
  // Difficult
  difficult: {
    prefixes: ['a ', 'this ', ''],
    verbs: ['prepare for', 'practice', 'handle', 'navigate'],
    objects: ['difficult conversation', 'tough talk', 'hard discussion'],
    suffixes: [''],
  },
  
  // Imposter
  imposter: {
    prefixes: ['my ', ''],
    verbs: ['overcome', 'address', 'deal with', 'manage'],
    objects: ['imposter syndrome', 'self doubt', 'insecurity'],
    suffixes: [''],
  },
  
  // Critic
  critic: {
    prefixes: ['my ', ''],
    verbs: ['quiet', 'manage', 'reframe', 'address'],
    objects: ['inner critic', 'self criticism', 'negative voice'],
    suffixes: [''],
  },
  
  // Forgiveness
  forgiveness: {
    prefixes: ['', 'self '],
    verbs: ['practice', 'work on', 'cultivate', 'find'],
    objects: ['forgiveness', 'self forgiveness', 'compassion'],
    suffixes: [''],
  },
  
  // Healing
  healing: {
    prefixes: ['my ', ''],
    verbs: ['support', 'continue', 'work on', 'focus on'],
    objects: ['healing', 'recovery', 'journey'],
    suffixes: [''],
  },
  
  // Event
  event: {
    prefixes: ['an ', 'the ', ''],
    verbs: ['prepare for', 'plan', 'mark', 'remember'],
    objects: ['event', 'occasion', 'milestone', 'celebration'],
    suffixes: [''],
  },
  
  // Milestone
  milestone: {
    prefixes: ['a ', 'this ', ''],
    verbs: ['mark', 'celebrate', 'track', 'remember'],
    objects: ['milestone', 'birthday', 'anniversary'],
    suffixes: [''],
  },
  
  // Community
  community: {
    prefixes: ['', 'my '],
    verbs: ['find', 'join', 'contribute to', 'connect with'],
    objects: ['community', 'group', 'people'],
    suffixes: [''],
  },
  
  // Routine
  routine: {
    prefixes: ['my ', 'a ', ''],
    verbs: ['create', 'run', 'show', 'manage'],
    objects: ['routine', 'routines', 'schedule'],
    suffixes: [''],
  },
  
  // Automation
  automation: {
    prefixes: ['an ', 'my ', ''],
    verbs: ['create', 'run', 'pause', 'manage'],
    objects: ['automation', 'automations', 'workflow'],
    suffixes: [''],
  },
  
  // Webhook
  webhook: {
    prefixes: ['a ', ''],
    verbs: ['trigger', 'list', 'create'],
    objects: ['webhook', 'webhooks'],
    suffixes: [''],
  },
  
  // Marketing
  marketing: {
    prefixes: ['', 'a '],
    verbs: ['create', 'generate', 'analyze', 'post'],
    objects: ['marketing content', 'social post', 'analytics'],
    suffixes: [''],
  },
  
  // Ride
  ride: {
    prefixes: ['a ', ''],
    verbs: ['request', 'book', 'cancel', 'schedule'],
    objects: ['ride', 'uber', 'lyft', 'car'],
    suffixes: [''],
  },
  
  // Food
  food: {
    prefixes: ['', 'some '],
    verbs: ['order', 'find', 'search for'],
    objects: ['food', 'delivery', 'takeout', 'dinner'],
    suffixes: [''],
  },
  meal: {
    prefixes: ['a ', 'my ', ''],
    verbs: ['plan', 'suggest', 'prepare', 'track'],
    objects: ['meal', 'meals', 'menu', 'diet'],
    suffixes: [''],
  },
  recipe: {
    prefixes: ['a ', ''],
    verbs: ['find', 'add', 'search', 'save'],
    objects: ['recipe', 'recipes'],
    suffixes: ['', ' for dinner'],
  },
  grocery: {
    prefixes: ['my ', 'a ', ''],
    verbs: ['add to', 'show', 'order'],
    objects: ['grocery list', 'groceries'],
    suffixes: [''],
  },
  
  // Traffic
  traffic: {
    prefixes: ['the ', ''],
    verbs: ['check', 'show', 'get'],
    objects: ['traffic', 'commute', 'directions', 'route'],
    suffixes: ['', ' to work'],
  },
  
  // Dictionary
  dictionary: {
    prefixes: ['', 'the '],
    verbs: ['define', 'look up', 'spell', 'explain'],
    objects: ['word', 'definition', 'synonym', 'meaning'],
    suffixes: [''],
  },
  
  // Sonos
  sonos: {
    prefixes: ['', 'my '],
    verbs: ['play', 'pause', 'control', 'adjust'],
    objects: ['sonos', 'speaker', 'music', 'volume'],
    suffixes: [''],
  },
  
  // Vehicle
  vehicle: {
    prefixes: ['my ', ''],
    verbs: ['track', 'add', 'service', 'maintain'],
    objects: ['vehicle', 'car', 'mileage', 'maintenance'],
    suffixes: [''],
  },
  
  // Cameo
  cameo: {
    prefixes: ['a ', ''],
    verbs: ['check', 'invite', 'complete', 'setup'],
    objects: ['cameo', 'guest appearance'],
    suffixes: [''],
  },
  
  // ADHD
  adhd: {
    prefixes: ['with ', 'my '],
    verbs: ['help', 'support', 'manage', 'start'],
    objects: ['ADHD', 'focus', 'task', 'body doubling'],
    suffixes: [''],
  },
  
  // Autism
  autism: {
    prefixes: ['with ', ''],
    verbs: ['help', 'support', 'manage'],
    objects: ['sensory', 'social', 'overwhelm'],
    suffixes: [''],
  },
  
  // Executive
  executive: {
    prefixes: ['my ', ''],
    verbs: ['help with', 'support', 'improve'],
    objects: ['executive function', 'planning', 'organization'],
    suffixes: [''],
  },
  
  // Parent
  parent: {
    prefixes: ['new ', 'my '],
    verbs: ['help with', 'support', 'navigate'],
    objects: ['parenting', 'parent life', 'baby'],
    suffixes: [''],
  },
  postpartum: {
    prefixes: ['', 'my '],
    verbs: ['check in', 'support', 'help with'],
    objects: ['postpartum', 'recovery', 'adjustment'],
    suffixes: [''],
  },
  
  // Intimacy
  intimacy: {
    prefixes: ['', 'my '],
    verbs: ['improve', 'explore', 'discuss', 'work on'],
    objects: ['intimacy', 'connection', 'relationship'],
    suffixes: [''],
  },
  
  // Chronic
  chronic: {
    prefixes: ['my ', ''],
    verbs: ['manage', 'cope with', 'support'],
    objects: ['chronic illness', 'condition', 'pain'],
    suffixes: [''],
  },
  
  // Coming Out
  coming: {
    prefixes: ['', 'my '],
    verbs: ['plan', 'prepare for', 'process'],
    objects: ['coming out', 'identity'],
    suffixes: [''],
  },
  
  // Dev
  dev: {
    prefixes: ['', 'the '],
    verbs: ['run', 'check', 'show', 'execute'],
    objects: ['git status', 'code', 'file', 'command'],
    suffixes: [''],
  },
  
  // Blended Family
  blended: {
    prefixes: ['my ', ''],
    verbs: ['navigate', 'manage', 'handle'],
    objects: ['blended family', 'stepfamily', 'coparenting'],
    suffixes: [''],
  },
  
  // Body Image
  body: {
    prefixes: ['my ', ''],
    verbs: ['work on', 'improve', 'explore'],
    objects: ['body image', 'relationship with body', 'self image'],
    suffixes: [''],
  },
  
  // Caregiver
  caregiver: {
    prefixes: ['', 'my '],
    verbs: ['support', 'help with', 'manage'],
    objects: ['caregiver burnout', 'caregiving', 'caregiver stress'],
    suffixes: [''],
  },
  
  // Faith
  faith: {
    prefixes: ['my ', ''],
    verbs: ['explore', 'process', 'rebuild', 'discuss'],
    objects: ['faith', 'beliefs', 'spirituality', 'deconstruction'],
    suffixes: [''],
  },
  
  // Envy
  envy: {
    prefixes: ['my ', ''],
    verbs: ['process', 'understand', 'transform', 'manage'],
    objects: ['envy', 'jealousy', 'comparison'],
    suffixes: [''],
  },
  
  // Infidelity
  infidelity: {
    prefixes: ['', 'the '],
    verbs: ['process', 'heal from', 'navigate', 'discuss'],
    objects: ['infidelity', 'betrayal', 'affair', 'trust'],
    suffixes: [''],
  },
  
  // Email
  email: {
    prefixes: ['my ', 'this ', ''],
    verbs: ['check', 'prioritize', 'manage', 'unsubscribe'],
    objects: ['email', 'emails', 'inbox'],
    suffixes: [''],
  },
  
  // Empty Nest
  empty: {
    prefixes: ['the ', ''],
    verbs: ['navigate', 'process', 'adjust to'],
    objects: ['empty nest', 'transition', 'change'],
    suffixes: [''],
  },
  
  // Job Loss
  job: {
    prefixes: ['my ', ''],
    verbs: ['process', 'cope with', 'recover from'],
    objects: ['job loss', 'layoff', 'unemployment'],
    suffixes: [''],
  },
  
  // Midlife
  midlife: {
    prefixes: ['my ', ''],
    verbs: ['navigate', 'explore', 'embrace'],
    objects: ['midlife', 'second half', 'life transition'],
    suffixes: [''],
  },
  
  // Reflection
  reflection: {
    prefixes: ['a ', 'my ', ''],
    verbs: ['start', 'do', 'guide'],
    objects: ['reflection', 'review', 'check-in'],
    suffixes: [''],
  },
  
  // Life
  life: {
    prefixes: ['my ', ''],
    verbs: ['explore', 'plan', 'design', 'discover'],
    objects: ['life', 'purpose', 'dream', 'legacy', 'mission'],
    suffixes: [''],
  },
  
  // Thesis
  thesis: {
    prefixes: ['my ', 'a ', ''],
    verbs: ['explore', 'incubate', 'develop', 'sit with'],
    objects: ['thesis', 'idea', 'philosophy', 'koan'],
    suffixes: [''],
  },
  
  // Timeless
  timeless: {
    prefixes: ['', 'the '],
    verbs: ['explore', 'consider', 'reflect on'],
    objects: ['timeless', 'mortality', 'future self', 'what matters'],
    suffixes: [''],
  },
  
  // Quiet
  quiet: {
    prefixes: ['', 'the '],
    verbs: ['embrace', 'sit with', 'explore'],
    objects: ['quiet', 'mystery', 'uncertainty', 'not knowing'],
    suffixes: [''],
  },
  
  // Second Chances
  second: {
    prefixes: ['', 'a '],
    verbs: ['explore', 'consider', 'find'],
    objects: ['second chance', 'alternative', 'new path'],
    suffixes: [''],
  },
  
  // Human
  human: {
    prefixes: ['a ', ''],
    verbs: ['connect with', 'talk to', 'evaluate'],
    objects: ['human', 'real person', 'professional'],
    suffixes: [''],
  },
  
  // Behavior
  behavior: {
    prefixes: ['my ', ''],
    verbs: ['shift', 'change', 'adjust', 'process'],
    objects: ['behavior', 'response', 'patterns'],
    suffixes: [''],
  },
  
  // Awareness
  awareness: {
    prefixes: ['my ', ''],
    verbs: ['build', 'check', 'expand', 'track'],
    objects: ['awareness', 'self awareness', 'mindfulness'],
    suffixes: [''],
  },
  
  // Subscription
  subscription: {
    prefixes: ['my ', ''],
    verbs: ['check', 'manage', 'cancel', 'track'],
    objects: ['subscriptions', 'subscription', 'recurring payments'],
    suffixes: [''],
  },
  
  // Insurance
  insurance: {
    prefixes: ['my ', ''],
    verbs: ['check', 'renew', 'manage', 'review'],
    objects: ['insurance', 'policy', 'coverage'],
    suffixes: [''],
  },
  
  // Visual
  visual: {
    prefixes: ['', 'this '],
    verbs: ['describe', 'list', 'count', 'analyze'],
    objects: ['visual', 'image', 'picture', 'photo'],
    suffixes: [''],
  },
  
  // Podcast
  podcast: {
    prefixes: ['a ', ''],
    verbs: ['find', 'recommend', 'play', 'search'],
    objects: ['podcast', 'podcasts', 'episode'],
    suffixes: ['', ' about business'],
  },
  
  // Group
  group: {
    prefixes: ['a ', ''],
    verbs: ['start', 'end', 'manage', 'create'],
    objects: ['group conversation', 'roundtable', 'meeting'],
    suffixes: [''],
  },
  
  // Humor
  humor: {
    prefixes: ['', 'a '],
    verbs: ['tell', 'share', 'give me'],
    objects: ['joke', 'fun fact', 'funny story'],
    suffixes: [''],
  },
  
  // Wind down
  winddown: {
    prefixes: ['', 'a '],
    verbs: ['start', 'help me', 'begin'],
    objects: ['wind down', 'bedtime routine', 'relaxation'],
    suffixes: [''],
  },
  
  // Essentials
  essentials: {
    prefixes: ['', 'the '],
    verbs: ['show', 'tell me', 'list'],
    objects: ['essentials', 'what you can do', 'capabilities'],
    suffixes: [''],
  },
  
  // Shortcuts  
  shortcuts: {
    prefixes: ['', 'a '],
    verbs: ['run', 'execute', 'use'],
    objects: ['shortcut', 'quick action'],
    suffixes: [''],
  },
  
  // Concierge
  concierge: {
    prefixes: ['', 'a '],
    verbs: ['book', 'arrange', 'find', 'check'],
    objects: ['concierge', 'reservation', 'appointment', 'service'],
    suffixes: [''],
  },
  
  // Proactive
  proactive: {
    prefixes: ['', 'a '],
    verbs: ['send', 'share', 'provide'],
    objects: ['proactive', 'insight', 'suggestion', 'message'],
    suffixes: [''],
  },
  
  // Background
  background: {
    prefixes: ['a ', ''],
    verbs: ['do', 'run', 'start', 'make'],
    objects: ['background', 'call', 'research', 'reservation'],
    suffixes: [''],
  },
  
  // Default fallback
  default: {
    prefixes: ['', 'the ', 'my '],
    verbs: ['help with', 'do', 'show', 'get', 'find', 'check', 'set', 'create'],
    objects: ['this', 'that', 'it', 'something'],
    suffixes: ['', ' please', ' for me'],
  },
};

// Conversation (negative class)
const CONVERSATION_EXAMPLES = [
  'hey', 'hi', 'hello', "how's it going", 'how are you', "what's up",
  'thanks', 'thank you', 'cool', 'nice', 'okay', 'sure', 'yeah', 'yep',
  'no', 'nope', 'maybe', 'I guess', "I'm not sure", 'whatever', 'never mind',
  "that's fine", 'sounds good', 'got it', 'makes sense', 'interesting',
  'tell me more', 'go on', 'I see', 'hmm', 'uh huh', 'right',
  "that's true", 'I agree', 'I disagree', "I don't know", 'good question',
  'let me think', 'so anyway', 'by the way', 'that reminds me', "I've been thinking",
  "I'm bored", "I'm tired", "I'm hungry", 'just talking', "how's your day",
  'what do you think', 'do you agree', 'really', 'no way', 'seriously',
  'oh wow', 'crazy', 'wild', 'haha', 'lol', 'funny', 'cool story',
];

// ============================================================================
// GENERATION
// ============================================================================

interface Example {
  query: string;
  label: string;
  category: string;
}

function getGenerator(category: string): ActionGenerator {
  // Try exact match
  if (CATEGORY_GENERATORS[category]) {
    return CATEGORY_GENERATORS[category];
  }
  // Try prefix match
  for (const [key, gen] of Object.entries(CATEGORY_GENERATORS)) {
    if (category.startsWith(key)) {
      return gen;
    }
  }
  // Default
  return CATEGORY_GENERATORS.default;
}

function generateAction(gen: ActionGenerator): string {
  const prefix = gen.prefixes[Math.floor(Math.random() * gen.prefixes.length)];
  const verb = gen.verbs[Math.floor(Math.random() * gen.verbs.length)];
  const obj = gen.objects[Math.floor(Math.random() * gen.objects.length)];
  const suffix = gen.suffixes[Math.floor(Math.random() * gen.suffixes.length)];
  return `${verb} ${prefix}${obj}${suffix}`.replace(/\s+/g, ' ').trim();
}

function applyTemplate(action: string, templates: string[]): string {
  const template = templates[Math.floor(Math.random() * templates.length)];
  return template.replace('{action}', action);
}

function generateExamplesForTool(toolId: string, count: number): Example[] {
  const examples: Example[] = [];
  const category = toolId.split('_')[0];
  const gen = getGenerator(category);
  
  const allTemplates = [
    ...DIRECT_TEMPLATES,
    ...POLITE_TEMPLATES,
    ...DESIRE_TEMPLATES,
    ...QUESTION_TEMPLATES,
    ...CASUAL_TEMPLATES,
  ];
  
  while (examples.length < count) {
    const action = generateAction(gen);
    
    // Direct action
    examples.push({ query: action, label: toolId, category });
    
    // Template variations
    for (const templateGroup of [DIRECT_TEMPLATES, POLITE_TEMPLATES, DESIRE_TEMPLATES]) {
      if (examples.length >= count) break;
      const query = applyTemplate(action, templateGroup);
      examples.push({ query, label: toolId, category });
    }
  }
  
  return examples.slice(0, count);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   FTIS FULL COVERAGE GENERATOR - ALL 886 SEMANTIC IDS      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  const startTime = performance.now();

  // Load all tools from domain bridge
  console.log('📦 Loading tool IDs from domain bridge...');
  const { getAllMappings } = await import('../src/tools/semantic-router/domain-bridge.js');
  const allMappings = getAllMappings();
  const toolIds = Object.keys(allMappings);
  console.log(`   ✅ Found ${toolIds.length} semantic tool IDs\n`);

  // Create output directory
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const totalTarget = toolIds.length * EXAMPLES_PER_TOOL;
  console.log(`📊 Configuration:`);
  console.log(`   Tools:              ${toolIds.length}`);
  console.log(`   Examples/Tool:      ${EXAMPLES_PER_TOOL}`);
  console.log(`   Target Total:       ${totalTarget.toLocaleString()}`);
  console.log('');

  // Generate examples
  console.log('🔄 Generating examples...');
  
  const allExamples: Example[] = [];
  const labelMap: Record<string, number> = {};
  
  let labelIndex = 0;
  for (let i = 0; i < toolIds.length; i++) {
    const toolId = toolIds[i];
    const examples = generateExamplesForTool(toolId, EXAMPLES_PER_TOOL);
    allExamples.push(...examples);
    labelMap[toolId] = labelIndex++;
    
    if ((i + 1) % 100 === 0) {
      process.stdout.write(`   Processed ${i + 1}/${toolIds.length} tools...\r`);
    }
  }
  
  // Add conversation examples
  console.log(`\n   Adding conversation examples...`);
  for (const query of CONVERSATION_EXAMPLES) {
    for (let i = 0; i < 50; i++) { // 50 variations each
      const prefix = ['', 'hey ', 'um ', 'so ', 'well '][Math.floor(Math.random() * 5)];
      allExamples.push({ 
        query: prefix + query, 
        label: '__conversation__', 
        category: 'conversation' 
      });
    }
  }
  labelMap['__conversation__'] = labelIndex++;
  
  console.log(`   ✅ Generated ${allExamples.length.toLocaleString()} total examples\n`);

  // Shuffle
  console.log('🔀 Shuffling...');
  for (let i = allExamples.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allExamples[i], allExamples[j]] = [allExamples[j], allExamples[i]];
  }

  // Split
  const trainEnd = Math.floor(allExamples.length * 0.8);
  const valEnd = trainEnd + Math.floor(allExamples.length * 0.1);
  
  const trainData = allExamples.slice(0, trainEnd);
  const valData = allExamples.slice(trainEnd, valEnd);
  const testData = allExamples.slice(valEnd);

  console.log(`   Train:      ${trainData.length.toLocaleString()}`);
  console.log(`   Validation: ${valData.length.toLocaleString()}`);
  console.log(`   Test:       ${testData.length.toLocaleString()}\n`);

  // Write files
  console.log('💾 Writing files...');
  
  writeFileSync(path.join(OUTPUT_DIR, 'train.json'), JSON.stringify(trainData, null, 2));
  writeFileSync(path.join(OUTPUT_DIR, 'validation.json'), JSON.stringify(valData, null, 2));
  writeFileSync(path.join(OUTPUT_DIR, 'test.json'), JSON.stringify(testData, null, 2));
  writeFileSync(path.join(OUTPUT_DIR, 'label_map.json'), JSON.stringify(labelMap, null, 2));

  const duration = ((performance.now() - startTime) / 1000).toFixed(1);
  
  console.log(`   ✅ Done in ${duration}s\n`);

  // Show samples
  console.log('📝 Sample Queries:');
  console.log('─'.repeat(70));
  
  const samples = allExamples.slice(0, 20);
  for (const s of samples) {
    console.log(`   "${s.query.slice(0, 45).padEnd(45)}" → ${s.label}`);
  }
  console.log('─'.repeat(70));
  console.log('');

  // Summary
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    GENERATION COMPLETE                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📊 Final Stats:`);
  console.log(`   Total Examples:     ${allExamples.length.toLocaleString()}`);
  console.log(`   Unique Labels:      ${Object.keys(labelMap).length}`);
  console.log(`   Train Set:          ${trainData.length.toLocaleString()}`);
  console.log(`   Validation Set:     ${valData.length.toLocaleString()}`);
  console.log(`   Test Set:           ${testData.length.toLocaleString()}`);
  console.log('');
  console.log('🚀 Next Step: python models/ftis-router-v2/train.py');
  console.log('');
}

main().catch(console.error);
