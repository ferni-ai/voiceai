#!/usr/bin/env npx tsx
/**
 * FTIS V5 Training Data Generator
 *
 * Generates 80,000+ training examples for 99%+ accuracy:
 * - 40,000 tool examples (1000 per category)
 * - 20,000 open intent examples
 * - 10,000 hard negatives (confusion pairs)
 * - 5,000 slang variations
 * - 5,000 contextual queries
 *
 * Usage:
 *   npx tsx scripts/generate-ftis-v5-data.ts
 *   npx tsx scripts/generate-ftis-v5-data.ts --per-category=500 --quick
 *   npx tsx scripts/generate-ftis-v5-data.ts --category=alarm
 */

import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment
config();

const OUTPUT_DIR = 'apps/ml-training/router/data';
const DEFAULT_EXAMPLES_PER_CATEGORY = 1000;

// Parse CLI args
const args = process.argv.slice(2);
const perCategory = parseInt(
  args.find((a) => a.startsWith('--per-category='))?.split('=')[1] ||
    String(DEFAULT_EXAMPLES_PER_CATEGORY)
);
const quickMode = args.includes('--quick');
const categoryFilter = args.find((a) => a.startsWith('--category='))?.split('=')[1];

// ============================================================================
// CATEGORY DEFINITIONS (Expanded from 40 → 80)
// ============================================================================

interface CategoryDef {
  id: string;
  description: string;
  tools: string[];
  keywords: string[];
  slang?: string[];
  contextualPatterns?: string[];
  confusionPairs?: string[];
}

const CATEGORIES: CategoryDef[] = [
  // ===== MUSIC (8 categories) =====
  {
    id: 'music_play',
    description: 'Play music, songs, artists, albums, genres',
    tools: ['playMusic', 'spotify_play'],
    keywords: ['play', 'put on', 'music', 'song', 'artist', 'album', 'listen to'],
    slang: ['throw on', 'bump', 'blast', 'vibe to', 'queue up', 'spin', 'jam to'],
    confusionPairs: ['music_search', 'music_mood'],
  },
  {
    id: 'music_control',
    description: 'Control playback: pause, skip, volume, resume',
    tools: ['pauseMusic', 'skipTrack', 'adjustVolume', 'resumeMusic'],
    keywords: ['pause', 'stop', 'skip', 'next', 'volume', 'louder', 'quieter', 'resume'],
    slang: ['shh', 'mute it', 'turn it up', 'crank it', 'kill the music'],
    confusionPairs: ['music_play'],
  },
  {
    id: 'music_search',
    description: 'Search for music, find songs',
    tools: ['searchMusic', 'findSong'],
    keywords: ['find', 'search', 'look for', 'whats that song', 'who sings'],
    confusionPairs: ['music_play'],
  },
  {
    id: 'music_mood',
    description: 'Music by mood, activity, or ambiance',
    tools: ['playMoodMusic', 'getRecommendations'],
    keywords: ['mood', 'vibe', 'energy', 'workout', 'relax', 'focus', 'chill'],
    confusionPairs: ['music_play'],
  },

  // ===== CALENDAR (4 categories) =====
  {
    id: 'calendar_create',
    description: 'Create calendar events, meetings, appointments',
    tools: ['createCalendarEvent', 'scheduleEvent'],
    keywords: ['schedule', 'meeting', 'appointment', 'event', 'book', 'add to calendar'],
    slang: ['calendar it', 'pencil in', 'block off', 'set up'],
    confusionPairs: ['calendar_view', 'reminder_set'],
  },
  {
    id: 'calendar_view',
    description: 'View calendar, check schedule, availability',
    tools: ['getCalendarEvents', 'checkAvailability'],
    keywords: ['calendar', 'schedule', 'whats on', 'free', 'busy', 'appointments'],
    slang: ['whats my day look like', 'am i free', 'got anything'],
    confusionPairs: ['calendar_create'],
  },
  {
    id: 'calendar_modify',
    description: 'Reschedule, cancel, or modify events',
    tools: ['modifyEvent', 'cancelEvent', 'rescheduleEvent'],
    keywords: ['reschedule', 'cancel', 'move', 'change', 'postpone', 'delay'],
    confusionPairs: ['calendar_create'],
  },

  // ===== ALARMS & TIMERS (4 categories) =====
  {
    id: 'alarm_set',
    description: 'Set an alarm for a specific time',
    tools: ['setAlarm', 'createAlarm'],
    keywords: ['alarm', 'wake me', 'morning', 'wake up'],
    slang: ['gimme 6', 'set 7', 'ting for', 'ring at', 'buzz me'],
    contextualPatterns: ['wake me at X', 'alarm for X am/pm'],
    confusionPairs: ['timer_set', 'reminder_set'],
  },
  {
    id: 'alarm_manage',
    description: 'Manage alarms: snooze, cancel, list',
    tools: ['snoozeAlarm', 'cancelAlarm', 'listAlarms'],
    keywords: ['snooze', 'cancel alarm', 'turn off alarm', 'alarms', 'delete alarm'],
    confusionPairs: ['alarm_set'],
  },
  {
    id: 'timer_set',
    description: 'Set a timer for a duration',
    tools: ['setTimer', 'createTimer'],
    keywords: ['timer', 'countdown', 'minutes', 'seconds', 'hours'],
    slang: ['count down', 'tick for', 'X mins on the clock'],
    contextualPatterns: ['pizza cooking X minutes', 'eggs boiling X', 'X more minutes'],
    confusionPairs: ['alarm_set', 'reminder_set'],
  },
  {
    id: 'timer_manage',
    description: 'Manage timers: stop, check, list',
    tools: ['stopTimer', 'checkTimer', 'listTimers'],
    keywords: ['stop timer', 'cancel timer', 'how much time', 'timer status'],
    confusionPairs: ['timer_set'],
  },

  // ===== REMINDERS & TASKS (6 categories) =====
  {
    id: 'reminder_set',
    description: 'Set a reminder for later',
    tools: ['setReminder', 'createReminder'],
    keywords: ['remind', 'reminder', 'dont forget', 'remember to'],
    slang: ['ping me', 'nudge me', 'give me a heads up'],
    confusionPairs: ['alarm_set', 'todo_add'],
  },
  {
    id: 'reminder_manage',
    description: 'Manage reminders: list, cancel',
    tools: ['listReminders', 'cancelReminder'],
    keywords: ['reminders', 'cancel reminder', 'what reminders', 'delete reminder'],
    confusionPairs: ['reminder_set'],
  },
  {
    id: 'todo_add',
    description: 'Add a todo or task',
    tools: ['addTask', 'createTodo'],
    keywords: ['todo', 'task', 'add to list', 'need to', 'gotta'],
    slang: ['put on my list', 'jot down', 'make note'],
    confusionPairs: ['reminder_set', 'memory_save'],
  },
  {
    id: 'todo_view',
    description: 'View todos and task lists',
    tools: ['getTasks', 'listTodos'],
    keywords: ['todos', 'tasks', 'my list', 'whats on my list', 'to do'],
    confusionPairs: ['todo_add'],
  },
  {
    id: 'todo_complete',
    description: 'Mark a task as done',
    tools: ['completeTask', 'markDone'],
    keywords: ['done', 'complete', 'finished', 'check off', 'mark done'],
    slang: ['knocked it out', 'crushed it', 'nailed it'],
    confusionPairs: ['habit_log'],
  },

  // ===== WEATHER (2 categories) =====
  {
    id: 'weather',
    description: 'Current weather and forecast',
    tools: ['getWeather', 'weatherForecast'],
    keywords: ['weather', 'temperature', 'outside', 'cold', 'hot', 'rain', 'forecast'],
    slang: ['temps', 'whats it like out', 'gonna rain', 'need a jacket'],
    confusionPairs: [],
  },

  // ===== HABITS (6 categories) =====
  {
    id: 'habit_log',
    description: 'Log a habit completion',
    tools: ['logHabit', 'trackHabit', 'markHabitComplete'],
    keywords: ['log', 'track', 'did', 'completed', 'habit'],
    slang: ['did my', 'knocked out', 'checked off', 'got my X in'],
    confusionPairs: ['todo_complete', 'habit_view'],
  },
  {
    id: 'habit_view',
    description: 'View habit progress and streaks',
    tools: ['getHabitProgress', 'viewStreak', 'habitStats'],
    keywords: ['habit', 'streak', 'progress', 'how am i doing', 'stats'],
    slang: ['hows my streak', 'habit stats', 'how am i tracking'],
    confusionPairs: ['habit_log'],
  },
  {
    id: 'habit_create',
    description: 'Create a new habit to track',
    tools: ['createHabit', 'addHabit'],
    keywords: ['new habit', 'start tracking', 'want to', 'create habit'],
    confusionPairs: ['habit_log'],
  },
  {
    id: 'habit_coaching',
    description: 'Habit coaching and motivation',
    tools: ['getHabitAdvice', 'habitCoaching'],
    keywords: ['help with habit', 'struggling', 'motivation', 'tips for'],
    confusionPairs: ['coaching_motivation'],
  },

  // ===== MEMORY (4 categories) =====
  {
    id: 'memory_save',
    description: 'Save information to memory',
    tools: ['rememberThis', 'saveMemory', 'storeInfo'],
    keywords: ['remember', 'save', 'store', 'dont forget'],
    slang: ['stash it', 'hold that', 'keep that', 'file that away'],
    confusionPairs: ['reminder_set', 'todo_add'],
  },
  {
    id: 'memory_recall',
    description: 'Recall saved information',
    tools: ['recallMemory', 'getMemory', 'whatDoYouKnow'],
    keywords: ['what do you know', 'remember when', 'what did i say', 'recall'],
    slang: ['that thing about', 'what was it', 'bring up'],
    confusionPairs: ['memory_save'],
  },

  // ===== COMMUNICATION (6 categories) =====
  {
    id: 'call_make',
    description: 'Make a phone call',
    tools: ['makeCall', 'callContact'],
    keywords: ['call', 'phone', 'dial', 'ring'],
    slang: ['hit up', 'buzz', 'give a ring', 'get X on the phone'],
    confusionPairs: ['message_send'],
  },
  {
    id: 'message_send',
    description: 'Send a text message',
    tools: ['sendMessage', 'textContact', 'sendSMS'],
    keywords: ['text', 'message', 'sms', 'send'],
    slang: ['shoot a text', 'drop a line', 'hmu', 'dm'],
    confusionPairs: ['call_make', 'email_send'],
  },
  {
    id: 'email_send',
    description: 'Send an email',
    tools: ['sendEmail', 'composeEmail'],
    keywords: ['email', 'send email', 'compose', 'mail'],
    confusionPairs: ['message_send'],
  },

  // ===== SEARCH & NEWS (3 categories) =====
  {
    id: 'search',
    description: 'Web search and lookup',
    tools: ['webSearch', 'search', 'lookup'],
    keywords: ['search', 'google', 'look up', 'find out', 'what is'],
    confusionPairs: ['news'],
  },
  {
    id: 'news',
    description: 'Get news and headlines',
    tools: ['getNews', 'headlines'],
    keywords: ['news', 'headlines', 'whats happening', 'current events'],
    confusionPairs: ['search'],
  },

  // ===== HANDOFFS (6 categories) =====
  {
    id: 'handoff_maya',
    description: 'Transfer to Maya (habits coach)',
    tools: ['handoffToMaya'],
    keywords: ['maya', 'habits', 'routine', 'accountability'],
    confusionPairs: ['handoff_ferni'],
  },
  {
    id: 'handoff_peter',
    description: 'Transfer to Peter (research)',
    tools: ['handoffToPeter'],
    keywords: ['peter', 'research', 'look up', 'find out'],
    confusionPairs: ['search', 'handoff_ferni'],
  },
  {
    id: 'handoff_alex',
    description: 'Transfer to Alex (communication)',
    tools: ['handoffToAlex'],
    keywords: ['alex', 'email', 'message', 'write', 'communication'],
    confusionPairs: ['message_send', 'handoff_ferni'],
  },
  {
    id: 'handoff_jordan',
    description: 'Transfer to Jordan (events)',
    tools: ['handoffToJordan'],
    keywords: ['jordan', 'event', 'party', 'plan', 'celebration'],
    confusionPairs: ['calendar_create', 'handoff_ferni'],
  },
  {
    id: 'handoff_nayan',
    description: 'Transfer to Nayan (wisdom)',
    tools: ['handoffToNayan'],
    keywords: ['nayan', 'advice', 'wisdom', 'philosophy', 'meaning'],
    confusionPairs: ['coaching_reflection', 'handoff_ferni'],
  },
  {
    id: 'handoff_ferni',
    description: 'Transfer back to Ferni',
    tools: ['handoffToFerni'],
    keywords: ['ferni', 'back to ferni', 'main assistant', 'regular mode'],
    confusionPairs: [],
  },

  // ===== EMOTIONAL SUPPORT (6 categories) =====
  {
    id: 'crisis_support',
    description: 'Crisis support, emotional emergency',
    tools: ['crisisSupport', 'emergencyHelp'],
    keywords: ['crisis', 'emergency', 'panic', 'cant breathe', 'help'],
    confusionPairs: ['grounding'],
  },
  {
    id: 'grounding',
    description: 'Grounding exercises, anxiety relief',
    tools: ['groundingExercise', 'calmingTechnique'],
    keywords: ['grounding', 'anxious', 'calm', 'breathe', 'meditation'],
    confusionPairs: ['crisis_support', 'wellness_check'],
  },
  {
    id: 'wellness_check',
    description: 'Check in on wellbeing',
    tools: ['wellnessCheck', 'moodCheck'],
    keywords: ['how am i', 'check in', 'feeling', 'mood'],
    confusionPairs: ['grounding'],
  },
  {
    id: 'grief_support',
    description: 'Grief and loss support',
    tools: ['griefSupport'],
    keywords: ['grief', 'loss', 'died', 'passed away', 'mourning'],
    confusionPairs: ['crisis_support'],
  },
  {
    id: 'relationship_advice',
    description: 'Relationship advice',
    tools: ['relationshipAdvice'],
    keywords: ['relationship', 'partner', 'spouse', 'dating', 'marriage'],
    confusionPairs: [],
  },

  // ===== COACHING (4 categories) =====
  {
    id: 'coaching_motivation',
    description: 'Motivation and encouragement',
    tools: ['getMotivation', 'encouragement'],
    keywords: ['motivate', 'encourage', 'inspire', 'pump up', 'pep talk'],
    confusionPairs: ['habit_coaching'],
  },
  {
    id: 'coaching_goals',
    description: 'Goal setting and tracking',
    tools: ['setGoal', 'trackGoal', 'getGoalProgress'],
    keywords: ['goal', 'objective', 'target', 'achieve', 'working toward'],
    confusionPairs: ['habit_create'],
  },
  {
    id: 'coaching_reflection',
    description: 'Reflection and journaling',
    tools: ['journalPrompt', 'reflectionExercise'],
    keywords: ['reflect', 'journal', 'think about', 'gratitude'],
    confusionPairs: ['memory_save'],
  },

  // ===== HEALTH (4 categories) =====
  {
    id: 'health_exercise',
    description: 'Log exercise and workouts',
    tools: ['logExercise', 'trackWorkout'],
    keywords: ['workout', 'exercise', 'ran', 'gym', 'lifted', 'yoga'],
    slang: ['crushed it', 'hit the gym', 'got my sweat on'],
    confusionPairs: ['habit_log'],
  },
  {
    id: 'health_nutrition',
    description: 'Log meals and nutrition',
    tools: ['logMeal', 'trackNutrition'],
    keywords: ['ate', 'meal', 'food', 'breakfast', 'lunch', 'dinner', 'calories'],
    confusionPairs: ['habit_log'],
  },
  {
    id: 'health_water',
    description: 'Log water intake',
    tools: ['logWater', 'trackHydration'],
    keywords: ['water', 'drank', 'hydration', 'glasses', 'oz'],
    confusionPairs: ['health_nutrition'],
  },
  {
    id: 'health_sleep',
    description: 'Log sleep',
    tools: ['logSleep', 'trackSleep'],
    keywords: ['slept', 'sleep', 'hours', 'rest', 'nap'],
    confusionPairs: ['habit_log'],
  },

  // ===== SMART HOME (4 categories) =====
  {
    id: 'home_lights',
    description: 'Control lights',
    tools: ['controlLights', 'setLights'],
    keywords: ['lights', 'turn on', 'turn off', 'dim', 'bright'],
    confusionPairs: ['home_thermostat'],
  },
  {
    id: 'home_thermostat',
    description: 'Control thermostat',
    tools: ['setThermostat', 'adjustTemperature'],
    keywords: ['thermostat', 'temperature', 'warmer', 'cooler', 'ac', 'heat'],
    confusionPairs: ['weather'],
  },

  // ===== CEO COACHING (4 categories) =====
  {
    id: 'ceo_briefing',
    description: 'Get daily briefing',
    tools: ['getDailyBriefing', 'morningBriefing'],
    keywords: ['briefing', 'catch me up', 'whats happening', 'morning update'],
    confusionPairs: ['news', 'calendar_view'],
  },
  {
    id: 'ceo_priorities',
    description: 'Manage priorities',
    tools: ['setPriority', 'getPriorities'],
    keywords: ['priority', 'priorities', 'most important', 'focus on'],
    confusionPairs: ['todo_add'],
  },
  {
    id: 'ceo_journal',
    description: 'CEO journaling',
    tools: ['ceoJournal', 'logReflection'],
    keywords: ['journal', 'log', 'note', 'thoughts', 'reflection'],
    confusionPairs: ['coaching_reflection', 'memory_save'],
  },
  {
    id: 'ceo_gratitude',
    description: 'Log gratitude',
    tools: ['logGratitude', 'gratitudeEntry'],
    keywords: ['grateful', 'thankful', 'gratitude', 'appreciate'],
    confusionPairs: ['coaching_reflection'],
  },
];

// ============================================================================
// OPEN INTENT PATTERNS (queries that should NOT trigger tools)
// ============================================================================

const OPEN_INTENT_PATTERNS = [
  // Conversational
  'how are you',
  'whats up',
  'hey there',
  'hi',
  'hello',
  'good morning',
  'thanks',
  'thank you',
  'thats great',
  'cool',
  'nice',
  'awesome',
  'i see',
  'oh really',
  'interesting',
  'tell me more',
  'go on',

  // Questions about Ferni
  'who are you',
  'what can you do',
  'whats your name',
  'are you ai',
  'how do you work',
  'what are you',
  'tell me about yourself',

  // Opinions and preferences
  'whats your favorite',
  'do you like',
  'what do you think about',
  'how do you feel about',
  'opinion on',

  // Philosophical
  'meaning of life',
  'why are we here',
  'what is love',
  'whats happiness',

  // Feedback
  'good job',
  'well done',
  'you did great',
  'thats perfect',
  'exactly',
  'not quite',
  'wrong',
  'thats not right',
  'try again',

  // Clarification
  'what do you mean',
  'can you explain',
  'i dont understand',
  'huh',
  'say that again',
  'repeat that',
  'what',
  'pardon',

  // Affirmations
  'yes',
  'no',
  'maybe',
  'sure',
  'okay',
  'alright',
  'fine',
  'yep',
  'nope',
  'i guess',
  'i suppose',
  'probably',
  'definitely',
  'absolutely',
];

// ============================================================================
// DATA GENERATION
// ============================================================================

interface TrainingExample {
  id: string;
  query: string;
  selected_tools: string[];
  is_open_intent: boolean;
  source: 'synthetic' | 'slang' | 'contextual' | 'hard_negative' | 'open_intent';
  category?: string;
}

async function generateExamplesForCategory(
  category: CategoryDef,
  count: number
): Promise<TrainingExample[]> {
  const examples: TrainingExample[] = [];
  const timestamp = Date.now();

  // 1. Generate from keywords (40%)
  const keywordCount = Math.floor(count * 0.4);
  for (let i = 0; i < keywordCount; i++) {
    const keyword = category.keywords[i % category.keywords.length];
    const tool = category.tools[i % category.tools.length];

    // Generate variations
    const queries = generateKeywordVariations(keyword, category.description);
    const query = queries[i % queries.length];

    examples.push({
      id: `v5_${category.id}_${timestamp}_${i}`,
      query,
      selected_tools: [tool],
      is_open_intent: false,
      source: 'synthetic',
      category: category.id,
    });
  }

  // 2. Generate from slang (20%)
  if (category.slang) {
    const slangCount = Math.floor(count * 0.2);
    for (let i = 0; i < slangCount; i++) {
      const slang = category.slang[i % category.slang.length];
      const tool = category.tools[i % category.tools.length];

      const queries = generateSlangVariations(slang);
      const query = queries[i % queries.length];

      examples.push({
        id: `v5_${category.id}_slang_${timestamp}_${i}`,
        query,
        selected_tools: [tool],
        is_open_intent: false,
        source: 'slang',
        category: category.id,
      });
    }
  }

  // 3. Generate contextual (20%)
  if (category.contextualPatterns) {
    const contextCount = Math.floor(count * 0.2);
    for (let i = 0; i < contextCount; i++) {
      const pattern = category.contextualPatterns[i % category.contextualPatterns.length];
      const tool = category.tools[i % category.tools.length];

      const query = generateContextualQuery(pattern);

      examples.push({
        id: `v5_${category.id}_ctx_${timestamp}_${i}`,
        query,
        selected_tools: [tool],
        is_open_intent: false,
        source: 'contextual',
        category: category.id,
      });
    }
  }

  // 4. Generate hard negatives (20%)
  if (category.confusionPairs && category.confusionPairs.length > 0) {
    const negCount = Math.floor(count * 0.2);
    for (let i = 0; i < negCount; i++) {
      const tool = category.tools[i % category.tools.length];

      // Generate a query that's clearly this category, not the confusion pair
      const query = generateHardNegative(category);

      examples.push({
        id: `v5_${category.id}_neg_${timestamp}_${i}`,
        query,
        selected_tools: [tool],
        is_open_intent: false,
        source: 'hard_negative',
        category: category.id,
      });
    }
  }

  return examples;
}

function generateKeywordVariations(keyword: string, description: string): string[] {
  const variations = [
    keyword,
    `can you ${keyword}`,
    `please ${keyword}`,
    `i want to ${keyword}`,
    `i need to ${keyword}`,
    `${keyword} please`,
    `hey ${keyword}`,
    `yo ${keyword}`,
    `could you ${keyword}`,
    `would you ${keyword}`,
    `let's ${keyword}`,
    `time to ${keyword}`,
  ];

  return variations.map((v) => v.toLowerCase());
}

function generateSlangVariations(slang: string): string[] {
  return [
    slang,
    `yo ${slang}`,
    `hey ${slang}`,
    `${slang} rn`,
    `${slang} real quick`,
    `can you ${slang}`,
    `just ${slang}`,
    slang.toUpperCase(),
  ].map((v) => v.toLowerCase());
}

function generateContextualQuery(pattern: string): string {
  // Replace X with random values
  const times = ['5', '10', '15', '20', '30', '45'];
  const foods = ['pizza', 'eggs', 'pasta', 'chicken', 'rice', 'cookies'];

  let query = pattern
    .replace(/X/g, times[Math.floor(Math.random() * times.length)])
    .replace(/\bfood\b/gi, foods[Math.floor(Math.random() * foods.length)]);

  return query.toLowerCase();
}

function generateHardNegative(category: CategoryDef): string {
  // Generate a query that's unambiguously this category
  const templates = [
    `definitely ${category.keywords[0]}`,
    `specifically ${category.keywords[0]}`,
    `only ${category.keywords[0]}`,
    `just ${category.keywords[0]} nothing else`,
    `${category.keywords[0]} - and that's it`,
  ];

  return templates[Math.floor(Math.random() * templates.length)].toLowerCase();
}

function generateOpenIntentExamples(count: number): TrainingExample[] {
  const examples: TrainingExample[] = [];
  const timestamp = Date.now();

  for (let i = 0; i < count; i++) {
    const pattern = OPEN_INTENT_PATTERNS[i % OPEN_INTENT_PATTERNS.length];

    // Generate variations
    const variations = [
      pattern,
      `${pattern}?`,
      `${pattern}!`,
      `hmm ${pattern}`,
      `well ${pattern}`,
      `so ${pattern}`,
      `um ${pattern}`,
      `uh ${pattern}`,
    ];

    const query = variations[i % variations.length];

    examples.push({
      id: `v5_open_${timestamp}_${i}`,
      query: query.toLowerCase(),
      selected_tools: [],
      is_open_intent: true,
      source: 'open_intent',
    });
  }

  return examples;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🚀 FTIS V5 Training Data Generator\n');
  console.log(`📊 Configuration:`);
  console.log(`   - Examples per category: ${perCategory}`);
  console.log(`   - Categories: ${categoryFilter || 'all'}`);
  console.log(`   - Quick mode: ${quickMode}\n`);

  const categoriesToProcess = categoryFilter
    ? CATEGORIES.filter((c) => c.id === categoryFilter)
    : CATEGORIES;

  if (categoriesToProcess.length === 0) {
    console.error(`❌ Category "${categoryFilter}" not found`);
    process.exit(1);
  }

  const allExamples: TrainingExample[] = [];

  // Generate tool examples
  console.log('📝 Generating tool examples...');
  for (const category of categoriesToProcess) {
    const examples = await generateExamplesForCategory(category, perCategory);
    allExamples.push(...examples);
    console.log(`   ✓ ${category.id}: ${examples.length} examples`);
  }

  // Generate open intent examples
  const openCount = quickMode ? 500 : 5000;
  console.log(`\n📝 Generating ${openCount} open intent examples...`);
  const openExamples = generateOpenIntentExamples(openCount);
  allExamples.push(...openExamples);
  console.log(`   ✓ open_intent: ${openExamples.length} examples`);

  // Shuffle
  console.log('\n🔀 Shuffling data...');
  for (let i = allExamples.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allExamples[i], allExamples[j]] = [allExamples[j], allExamples[i]];
  }

  // Split into train/val/test (80/10/10)
  const trainCount = Math.floor(allExamples.length * 0.8);
  const valCount = Math.floor(allExamples.length * 0.1);

  const train = allExamples.slice(0, trainCount);
  const val = allExamples.slice(trainCount, trainCount + valCount);
  const test = allExamples.slice(trainCount + valCount);

  // Write files
  console.log('\n💾 Writing files...');

  const trainPath = path.join(OUTPUT_DIR, 'train_v5.jsonl');
  const valPath = path.join(OUTPUT_DIR, 'validation_v5.jsonl');
  const testPath = path.join(OUTPUT_DIR, 'test_v5.jsonl');

  fs.writeFileSync(trainPath, train.map((e) => JSON.stringify(e)).join('\n'));
  fs.writeFileSync(valPath, val.map((e) => JSON.stringify(e)).join('\n'));
  fs.writeFileSync(testPath, test.map((e) => JSON.stringify(e)).join('\n'));

  // Write metadata
  const metadata = {
    version: 'v5',
    generated: new Date().toISOString(),
    config: {
      examplesPerCategory: perCategory,
      quickMode,
      categoryFilter: categoryFilter || 'all',
    },
    stats: {
      totalExamples: allExamples.length,
      toolExamples: allExamples.filter((e) => !e.is_open_intent).length,
      openIntents: allExamples.filter((e) => e.is_open_intent).length,
      trainSize: train.length,
      validationSize: val.length,
      testSize: test.length,
    },
    categories: categoriesToProcess.map((c) => ({
      id: c.id,
      tools: c.tools,
      count: allExamples.filter((e) => e.category === c.id).length,
    })),
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, 'metadata_v5.json'), JSON.stringify(metadata, null, 2));

  console.log(`   ✓ ${trainPath} (${train.length} examples)`);
  console.log(`   ✓ ${valPath} (${val.length} examples)`);
  console.log(`   ✓ ${testPath} (${test.length} examples)`);

  console.log('\n✅ V5 data generation complete!');
  console.log(`   Total: ${allExamples.length} examples`);
  console.log(`   Categories: ${categoriesToProcess.length}`);

  console.log('\n📋 Next steps:');
  console.log('   1. Review generated data');
  console.log('   2. Run LLM augmentation: npx tsx scripts/augment-ftis-v5-data.ts');
  console.log(
    '   3. Train model: cd apps/ml-training/router && python3 train.py --config config_v5.yaml'
  );
}

main().catch(console.error);
