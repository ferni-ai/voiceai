#!/usr/bin/env npx tsx
/**
 * FTIS Hierarchical Training Data Generator
 * 
 * Two-stage classification for 95%+ accuracy:
 * - Stage 1: 10 super-categories (99%+ accuracy)
 * - Stage 2: Fine categories within each super-category (95%+)
 * 
 * Combined accuracy: 99% × 95% = 94%+ minimum
 */

import { config } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

// Load .env FIRST
config();
process.env.USE_VERTEX_AI = 'false';

// Import Gemini AFTER setting env vars
const { getGeminiClient, isGeminiConfigured, getGeminiConfigStatus } = await import('../src/config/gemini-config.js');

const OUTPUT_DIR = 'models/ftis-hierarchical';
const EXAMPLES_PER_FINE_CATEGORY = 500;

// ============================================================================
// HIERARCHICAL CATEGORY STRUCTURE
// ============================================================================

interface FineCategory {
  id: string;
  description: string;
  keywords: string[];
}

interface SuperCategory {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  fineCategories: FineCategory[];
}

const HIERARCHY: SuperCategory[] = [
  // 1. MEDIA & ENTERTAINMENT
  {
    id: 'media',
    name: 'Media & Entertainment',
    description: 'Music, movies, books, podcasts, games, jokes',
    keywords: ['play', 'music', 'movie', 'book', 'podcast', 'game', 'joke', 'watch', 'listen', 'read', 'funny'],
    fineCategories: [
      { id: 'music_play', description: 'Play music, songs, artists', keywords: ['play', 'music', 'song', 'artist', 'album'] },
      { id: 'music_control', description: 'Control playback', keywords: ['pause', 'skip', 'volume', 'stop', 'resume', 'next'] },
      { id: 'music_search', description: 'Search music', keywords: ['find', 'search', 'look for', 'discover'] },
      { id: 'music_playlist', description: 'Playlist management', keywords: ['playlist', 'queue', 'add to'] },
      { id: 'music_mood', description: 'Music by mood', keywords: ['mood', 'vibe', 'energy', 'workout', 'relax', 'focus'] },
      { id: 'movie_rec', description: 'Movie recommendations', keywords: ['movie', 'film', 'watch', 'netflix'] },
      { id: 'book_rec', description: 'Book recommendations', keywords: ['book', 'read', 'recommend'] },
      { id: 'podcast_rec', description: 'Podcast recommendations', keywords: ['podcast', 'episode'] },
      { id: 'game', description: 'Play a game', keywords: ['game', 'trivia', 'quiz'] },
      { id: 'joke', description: 'Tell a joke', keywords: ['joke', 'funny', 'laugh', 'humor'] },
    ]
  },

  // 2. CALENDAR & TIME
  {
    id: 'calendar',
    name: 'Calendar & Time Management',
    description: 'Scheduling, events, alarms, timers, reminders',
    keywords: ['schedule', 'meeting', 'alarm', 'timer', 'remind', 'calendar', 'appointment', 'wake', 'event'],
    fineCategories: [
      { id: 'calendar_create', description: 'Create events', keywords: ['schedule', 'meeting', 'appointment', 'book'] },
      { id: 'calendar_view', description: 'View calendar', keywords: ['calendar', 'whats on', 'free', 'busy', 'schedule'] },
      { id: 'calendar_modify', description: 'Change events', keywords: ['reschedule', 'cancel', 'move', 'change'] },
      { id: 'alarm_set', description: 'Set alarm', keywords: ['alarm', 'wake', 'morning'] },
      { id: 'alarm_manage', description: 'Manage alarms', keywords: ['snooze', 'cancel alarm', 'turn off'] },
      { id: 'timer_set', description: 'Set timer', keywords: ['timer', 'countdown', 'minutes'] },
      { id: 'timer_manage', description: 'Manage timers', keywords: ['stop timer', 'cancel timer', 'how much time'] },
      { id: 'reminder_set', description: 'Set reminder', keywords: ['remind', 'reminder', 'dont forget'] },
      { id: 'reminder_manage', description: 'Manage reminders', keywords: ['reminders', 'cancel reminder'] },
    ]
  },

  // 3. TASKS & PRODUCTIVITY
  {
    id: 'productivity',
    name: 'Tasks & Productivity',
    description: 'Todos, lists, priorities, journal, notes, memos',
    keywords: ['todo', 'task', 'list', 'priority', 'journal', 'note', 'memo', 'briefing', 'gratitude'],
    fineCategories: [
      { id: 'todo_add', description: 'Add todo', keywords: ['todo', 'task', 'add to list'] },
      { id: 'todo_view', description: 'View todos', keywords: ['todos', 'tasks', 'my list'] },
      { id: 'todo_complete', description: 'Complete todo', keywords: ['done', 'complete', 'finished', 'check off'] },
      { id: 'list_manage', description: 'Manage lists', keywords: ['list', 'shopping', 'grocery'] },
      { id: 'voice_memo', description: 'Voice memo', keywords: ['voice memo', 'record', 'note to self'] },
      { id: 'memory_save', description: 'Save to memory', keywords: ['remember', 'save', 'store'] },
      { id: 'memory_recall', description: 'Recall from memory', keywords: ['recall', 'what did i', 'remember when'] },
      { id: 'briefing', description: 'Daily briefing', keywords: ['briefing', 'summary', 'catch me up'] },
      { id: 'priorities', description: 'Set priorities', keywords: ['priority', 'important', 'focus on'] },
      { id: 'journal', description: 'Journal entry', keywords: ['journal', 'diary', 'write about'] },
      { id: 'gratitude', description: 'Gratitude practice', keywords: ['grateful', 'gratitude', 'thankful'] },
    ]
  },

  // 4. COMMUNICATION
  {
    id: 'communication',
    name: 'Communication',
    description: 'Calls, messages, emails, contacts',
    keywords: ['call', 'text', 'message', 'email', 'contact', 'phone', 'send'],
    fineCategories: [
      { id: 'call_make', description: 'Make call', keywords: ['call', 'phone', 'dial', 'ring'] },
      { id: 'call_manage', description: 'Manage calls', keywords: ['hang up', 'end call', 'hold', 'mute'] },
      { id: 'message_send', description: 'Send message', keywords: ['text', 'message', 'sms', 'send'] },
      { id: 'message_read', description: 'Read messages', keywords: ['read message', 'messages', 'unread'] },
      { id: 'email_send', description: 'Send email', keywords: ['email', 'send email', 'compose'] },
      { id: 'email_read', description: 'Read emails', keywords: ['read email', 'inbox', 'emails'] },
      { id: 'contact_manage', description: 'Manage contacts', keywords: ['contact', 'add contact', 'phone number'] },
    ]
  },

  // 5. HEALTH & WELLNESS
  {
    id: 'health',
    name: 'Health & Wellness',
    description: 'Habits, exercise, nutrition, sleep, water, wellness',
    keywords: ['habit', 'exercise', 'workout', 'food', 'water', 'sleep', 'health', 'routine', 'track'],
    fineCategories: [
      { id: 'habit_log', description: 'Log habit', keywords: ['log', 'track', 'did', 'completed'] },
      { id: 'habit_create', description: 'Create habit', keywords: ['new habit', 'start habit', 'want to'] },
      { id: 'habit_view', description: 'View habits', keywords: ['habit', 'streak', 'progress'] },
      { id: 'habit_coaching', description: 'Habit coaching', keywords: ['help with habit', 'struggling', 'motivation'] },
      { id: 'routine_run', description: 'Run routine', keywords: ['routine', 'morning routine', 'bedtime'] },
      { id: 'routine_manage', description: 'Manage routines', keywords: ['create routine', 'edit routine'] },
      { id: 'exercise_log', description: 'Log exercise', keywords: ['exercise', 'workout', 'ran', 'gym', 'steps'] },
      { id: 'nutrition', description: 'Nutrition tracking', keywords: ['food', 'ate', 'calories', 'meal'] },
      { id: 'water', description: 'Water tracking', keywords: ['water', 'hydration', 'drank', 'glasses'] },
      { id: 'sleep', description: 'Sleep tracking', keywords: ['sleep', 'slept', 'insomnia', 'tired'] },
    ]
  },

  // 6. EMOTIONAL SUPPORT
  {
    id: 'emotional',
    name: 'Emotional Support',
    description: 'Crisis, anxiety, grief, relationships, self-compassion, coaching',
    keywords: ['anxious', 'sad', 'stressed', 'help', 'feeling', 'grief', 'breakup', 'relationship', 'crisis'],
    fineCategories: [
      { id: 'crisis_support', description: 'Crisis support', keywords: ['crisis', 'emergency', 'panic', 'cant breathe'] },
      { id: 'grounding', description: 'Grounding exercises', keywords: ['grounding', 'anxious', 'calm', 'breathe', 'meditation'] },
      { id: 'wellness_check', description: 'Wellness check', keywords: ['how am i', 'check in', 'feeling'] },
      { id: 'coaching_motivation', description: 'Motivation', keywords: ['motivate', 'encourage', 'inspire', 'pump up'] },
      { id: 'coaching_goals', description: 'Goal setting', keywords: ['goal', 'objective', 'target', 'achieve'] },
      { id: 'coaching_reflection', description: 'Reflection', keywords: ['reflect', 'journal', 'think about'] },
      { id: 'grief_support', description: 'Grief support', keywords: ['grief', 'loss', 'died', 'passed away'] },
      { id: 'relationship_advice', description: 'Relationship advice', keywords: ['relationship', 'partner', 'spouse', 'dating'] },
      { id: 'breakup_support', description: 'Breakup support', keywords: ['breakup', 'broke up', 'ex', 'heartbreak'] },
      { id: 'self_compassion', description: 'Self-compassion', keywords: ['self-compassion', 'self-care', 'hard on myself'] },
      { id: 'imposter_syndrome', description: 'Imposter syndrome', keywords: ['imposter', 'fraud', 'dont belong'] },
    ]
  },

  // 7. SMART HOME
  {
    id: 'home',
    name: 'Smart Home',
    description: 'Lights, thermostat, locks, garage',
    keywords: ['lights', 'light', 'thermostat', 'temperature', 'lock', 'garage', 'door', 'home'],
    fineCategories: [
      { id: 'lights', description: 'Control lights', keywords: ['lights', 'lamp', 'bright', 'dim', 'turn on', 'turn off'] },
      { id: 'thermostat', description: 'Control thermostat', keywords: ['thermostat', 'temperature', 'heat', 'ac', 'cool'] },
      { id: 'locks', description: 'Control locks', keywords: ['lock', 'unlock', 'door', 'secure'] },
      { id: 'garage', description: 'Control garage', keywords: ['garage', 'garage door'] },
    ]
  },

  // 8. TRAVEL & NAVIGATION
  {
    id: 'travel',
    name: 'Travel & Navigation',
    description: 'Trips, flights, directions, weather',
    keywords: ['travel', 'trip', 'flight', 'directions', 'weather', 'navigate', 'vacation'],
    fineCategories: [
      { id: 'travel_plan', description: 'Plan trip', keywords: ['trip', 'travel', 'vacation', 'plan'] },
      { id: 'flights', description: 'Search flights', keywords: ['flight', 'fly', 'airline', 'airport'] },
      { id: 'directions', description: 'Get directions', keywords: ['directions', 'navigate', 'how to get', 'route'] },
      { id: 'weather_current', description: 'Current weather', keywords: ['weather', 'temperature', 'outside', 'cold', 'hot'] },
      { id: 'weather_forecast', description: 'Weather forecast', keywords: ['forecast', 'tomorrow', 'weekend', 'this week'] },
    ]
  },

  // 9. FINANCE
  {
    id: 'finance',
    name: 'Finance',
    description: 'Budget, bills, spending',
    keywords: ['budget', 'money', 'bill', 'payment', 'spending', 'finances'],
    fineCategories: [
      { id: 'budget', description: 'Budget tracking', keywords: ['budget', 'spending', 'money', 'finances'] },
      { id: 'bills', description: 'Bills and payments', keywords: ['bill', 'payment', 'due', 'pay'] },
    ]
  },

  // 10. TEAM HANDOFFS & UTILITY
  {
    id: 'system',
    name: 'System & Handoffs',
    description: 'Transfer to team members, time, date, capabilities, conversation',
    keywords: ['maya', 'peter', 'alex', 'jordan', 'nayan', 'ferni', 'time', 'date', 'what can you', 'help', 'talk', 'chat'],
    fineCategories: [
      { id: 'handoff_maya', description: 'Transfer to Maya', keywords: ['maya', 'habits', 'accountability'] },
      { id: 'handoff_peter', description: 'Transfer to Peter', keywords: ['peter', 'research', 'look up'] },
      { id: 'handoff_alex', description: 'Transfer to Alex', keywords: ['alex', 'email', 'write'] },
      { id: 'handoff_jordan', description: 'Transfer to Jordan', keywords: ['jordan', 'event', 'party', 'plan'] },
      { id: 'handoff_nayan', description: 'Transfer to Nayan', keywords: ['nayan', 'advice', 'wisdom', 'philosophy'] },
      { id: 'handoff_ferni', description: 'Transfer to Ferni', keywords: ['ferni', 'back to ferni'] },
      { id: 'time', description: 'Get time', keywords: ['time', 'what time', 'clock'] },
      { id: 'date', description: 'Get date', keywords: ['date', 'what day', 'today'] },
      { id: 'capabilities', description: 'What can you do', keywords: ['what can you', 'help', 'capabilities', 'features'] },
      { id: 'conversation', description: 'General conversation', keywords: ['chat', 'talk', 'how are you', 'whats up'] },
    ]
  },
];

// ============================================================================
// GENERATION
// ============================================================================

// Lazy-initialized client
let geminiClient: any = null;

async function generateExamples(
  category: FineCategory,
  superCategory: SuperCategory,
  count: number
): Promise<string[]> {
  // Initialize client lazily
  if (!geminiClient) {
    geminiClient = await getGeminiClient();
    if (!geminiClient) {
      throw new Error('Failed to initialize Gemini client');
    }
  }

  const prompt = `Generate exactly ${count} unique, natural voice queries for this category.

Super-category: ${superCategory.name} (${superCategory.description})
Fine category: ${category.id} - ${category.description}
Keywords: ${category.keywords.join(', ')}

CRITICAL RULES:
1. Each query must be something a REAL person would SAY to a voice assistant
2. Vary phrasing dramatically - casual, formal, mumbled, clear
3. Include typos, misspellings, abbreviations (pls, u, tmrw, etc.)
4. Mix short commands with longer requests
5. Include different contexts (morning, rushed, relaxed, stressed)
6. Some queries should be ambiguous but still clearly in this category

Output ONLY a JSON array of strings. No explanation.

Example: ["query 1", "query 2", ...]`;

  try {
    // Using stable gemini-2.5-flash (not exp)
    const response = await geminiClient.models.generateContent({
      model: 'models/gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text || '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const queries = JSON.parse(match[0]) as string[];
    return queries.filter((q: unknown): q is string => typeof q === 'string' && q.length > 0);
  } catch (error) {
    console.log(`    ❌ Error: ${error}`);
    return [];
  }
}

async function main() {
  console.log('🚀 FTIS Hierarchical Training Data Generator');
  console.log('   Target: 95%+ accuracy with two-stage classification');
  console.log('============================================================\n');

  // Setup
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  mkdirSync(`${OUTPUT_DIR}/stage1`, { recursive: true });
  mkdirSync(`${OUTPUT_DIR}/stage2`, { recursive: true });

  // Check Gemini config
  if (!isGeminiConfigured()) {
    console.error('❌ Gemini not configured');
    console.error(getGeminiConfigStatus());
    process.exit(1);
  }
  console.log(`📡 Gemini: ${getGeminiConfigStatus()} (using gemini-2.5-flash)\n`);

  // Generate data for each fine category
  const stage1Data: { query: string; label: string }[] = [];
  const stage2Data: Record<string, { query: string; label: string }[]> = {};
  
  const superLabelMap: Record<string, number> = {};
  const fineLabelMaps: Record<string, Record<string, number>> = {};

  for (let si = 0; si < HIERARCHY.length; si++) {
    const superCat = HIERARCHY[si];
    superLabelMap[superCat.id] = si;
    fineLabelMaps[superCat.id] = {};
    stage2Data[superCat.id] = [];

    console.log(`\n[${'='.repeat(60)}]`);
    console.log(`📦 Super-category ${si + 1}/${HIERARCHY.length}: ${superCat.name}`);
    console.log(`[${'='.repeat(60)}]`);

    for (let fi = 0; fi < superCat.fineCategories.length; fi++) {
      const fineCat = superCat.fineCategories[fi];
      fineLabelMaps[superCat.id][fineCat.id] = fi;

      console.log(`\n  [${fi + 1}/${superCat.fineCategories.length}] ${fineCat.id}...`);

      // Generate in batches for reliability
      let allExamples: string[] = [];
      const batchSize = 200;
      const batches = Math.ceil(EXAMPLES_PER_FINE_CATEGORY / batchSize);

      for (let b = 0; b < batches && allExamples.length < EXAMPLES_PER_FINE_CATEGORY; b++) {
        const remaining = EXAMPLES_PER_FINE_CATEGORY - allExamples.length;
        const thisBatch = Math.min(batchSize, remaining);
        
        const examples = await generateExamples(fineCat, superCat, thisBatch);
        allExamples.push(...examples);
        
        console.log(`    Batch ${b + 1}/${batches}: +${examples.length} (total: ${allExamples.length})`);
        
        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Trim to exact count
      allExamples = allExamples.slice(0, EXAMPLES_PER_FINE_CATEGORY);

      // Add to both datasets
      for (const query of allExamples) {
        // Stage 1: super-category classification
        stage1Data.push({ query, label: superCat.id });
        
        // Stage 2: fine-category classification (within super-category)
        stage2Data[superCat.id].push({ query, label: fineCat.id });
      }

      console.log(`    ✅ ${allExamples.length} examples`);
    }
  }

  // Shuffle all data
  const shuffle = <T>(arr: T[]): T[] => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // Split and save Stage 1 data
  console.log('\n💾 Writing Stage 1 data (super-categories)...');
  const s1Shuffled = shuffle([...stage1Data]);
  const s1TrainSize = Math.floor(s1Shuffled.length * 0.8);
  const s1ValSize = Math.floor(s1Shuffled.length * 0.1);
  
  writeFileSync(`${OUTPUT_DIR}/stage1/train.json`, JSON.stringify(s1Shuffled.slice(0, s1TrainSize), null, 2));
  writeFileSync(`${OUTPUT_DIR}/stage1/validation.json`, JSON.stringify(s1Shuffled.slice(s1TrainSize, s1TrainSize + s1ValSize), null, 2));
  writeFileSync(`${OUTPUT_DIR}/stage1/test.json`, JSON.stringify(s1Shuffled.slice(s1TrainSize + s1ValSize), null, 2));
  writeFileSync(`${OUTPUT_DIR}/stage1/label_map.json`, JSON.stringify(superLabelMap, null, 2));
  
  console.log(`   Stage 1: ${s1Shuffled.length} total examples, ${Object.keys(superLabelMap).length} labels`);

  // Split and save Stage 2 data (per super-category)
  console.log('\n💾 Writing Stage 2 data (fine-categories per super)...');
  for (const superCat of HIERARCHY) {
    const data = stage2Data[superCat.id];
    if (data.length === 0) continue;

    const dir = `${OUTPUT_DIR}/stage2/${superCat.id}`;
    mkdirSync(dir, { recursive: true });

    const shuffled = shuffle([...data]);
    const trainSize = Math.floor(shuffled.length * 0.8);
    const valSize = Math.floor(shuffled.length * 0.1);
    
    writeFileSync(`${dir}/train.json`, JSON.stringify(shuffled.slice(0, trainSize), null, 2));
    writeFileSync(`${dir}/validation.json`, JSON.stringify(shuffled.slice(trainSize, trainSize + valSize), null, 2));
    writeFileSync(`${dir}/test.json`, JSON.stringify(shuffled.slice(trainSize + valSize), null, 2));
    writeFileSync(`${dir}/label_map.json`, JSON.stringify(fineLabelMaps[superCat.id], null, 2));
    
    console.log(`   ${superCat.id}: ${shuffled.length} examples, ${Object.keys(fineLabelMaps[superCat.id]).length} labels`);
  }

  // Save hierarchy for inference
  const hierarchyMap = HIERARCHY.map(sc => ({
    id: sc.id,
    name: sc.name,
    fineCategories: sc.fineCategories.map(fc => fc.id)
  }));
  writeFileSync(`${OUTPUT_DIR}/hierarchy.json`, JSON.stringify(hierarchyMap, null, 2));

  // Copy category_to_tools from v3 for final tool mapping
  if (existsSync('models/ftis-router-v3/category_to_tools.json')) {
    const mapping = readFileSync('models/ftis-router-v3/category_to_tools.json', 'utf-8');
    writeFileSync(`${OUTPUT_DIR}/category_to_tools.json`, mapping);
  }

  console.log(`
✅ Generation Complete!

📊 Statistics:
   Stage 1: ${stage1Data.length} examples, ${HIERARCHY.length} super-categories
   Stage 2: ${HIERARCHY.reduce((sum, sc) => sum + sc.fineCategories.length, 0)} fine categories

📁 Output:
   ${OUTPUT_DIR}/stage1/          - Super-category classifier data
   ${OUTPUT_DIR}/stage2/{super}/  - Fine-category classifier data (one per super)
   ${OUTPUT_DIR}/hierarchy.json   - Category hierarchy mapping

📋 Next steps:
   1. Train Stage 1 model (10 labels → 99%+ expected)
   2. Train Stage 2 models (one per super-category → 95%+ each)
   3. Combine in inference code
   4. Expected combined accuracy: 95%+
`);
}

main().catch(console.error);
