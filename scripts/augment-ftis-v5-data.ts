#!/usr/bin/env npx tsx
/**
 * FTIS V5 LLM Data Augmentation
 *
 * Uses Gemini to generate high-quality variations of training examples:
 * - Slang and casual variations
 * - Typos and abbreviations
 * - Contextual variations
 * - Edge cases and ambiguous queries
 *
 * Usage:
 *   npx tsx scripts/augment-ftis-v5-data.ts
 *   npx tsx scripts/augment-ftis-v5-data.ts --category=alarm --count=500
 *   npx tsx scripts/augment-ftis-v5-data.ts --dry-run
 */

import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment
config();

const OUTPUT_DIR = 'apps/ml-training/router/data';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!GOOGLE_API_KEY) {
  console.error('❌ GOOGLE_API_KEY not set in environment');
  process.exit(1);
}

// Parse CLI args
const args = process.argv.slice(2);
const categoryFilter = args.find((a) => a.startsWith('--category='))?.split('=')[1];
const countArg = parseInt(args.find((a) => a.startsWith('--count='))?.split('=')[1] || '100');
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');

// ============================================================================
// CATEGORY DEFINITIONS FOR AUGMENTATION
// ============================================================================

interface AugmentCategory {
  id: string;
  tools: string[];
  seedExamples: string[];
  augmentationPrompt: string;
}

const AUGMENT_CATEGORIES: AugmentCategory[] = [
  {
    id: 'alarm_set',
    tools: ['setAlarm', 'createAlarm'],
    seedExamples: ['set an alarm for 7am', 'wake me up at 6:30', 'alarm for tomorrow morning'],
    augmentationPrompt: `Generate natural variations of alarm-setting requests. Include:
- Numeric shortcuts ("gimme 6", "set 7")
- Casual language ("wake me at 6")  
- Context ("alarm for my interview tomorrow")
- Slang ("ting for 6", "buzz me at 7")
- Abbreviated ("alrm 6am", "wakeup 630")`,
  },
  {
    id: 'timer_set',
    tools: ['setTimer', 'createTimer'],
    seedExamples: ['set a timer for 10 minutes', 'countdown 5 minutes', 'timer for 30 seconds'],
    augmentationPrompt: `Generate natural variations of timer-setting requests. Include:
- Cooking context ("timer for the pasta", "10 mins for the eggs")
- Exercise context ("30 second rest timer")
- Casual ("gimme 5 mins", "10 on the clock")
- Abbreviated ("tmr 10m", "5min timer")
- Implicit ("count down from 60")`,
  },
  {
    id: 'habit_log',
    tools: ['logHabit', 'trackHabit', 'markHabitComplete'],
    seedExamples: ['log my workout', 'I did my meditation', 'mark exercise complete'],
    augmentationPrompt: `Generate natural variations of habit-logging requests. Include:
- Casual confirmation ("did my pushups", "got my workout in")
- Slang ("crushed my meditation", "knocked out my reading")
- Past tense ("I worked out", "just finished yoga")
- Abbreviated ("log workout", "done meditate")
- Contextual ("finished my morning routine")`,
  },
  {
    id: 'music_play',
    tools: ['playMusic', 'spotify_play'],
    seedExamples: ['play some jazz', 'put on Taylor Swift', 'play my workout playlist'],
    augmentationPrompt: `Generate natural variations of music-playing requests. Include:
- Slang ("throw on some beats", "bump that new Drake")
- Mood-based ("play something chill", "need pump up music")
- Contextual ("music for cooking", "study tunes")
- Abbreviated ("play jazz", "spotify workout")
- Casual ("let's hear some rock")`,
  },
  {
    id: 'music_control',
    tools: ['pauseMusic', 'skipTrack', 'adjustVolume'],
    seedExamples: ['pause the music', 'skip this song', 'turn it up'],
    augmentationPrompt: `Generate natural variations of music control. Include:
- Ultra-short ("stop", "next", "skip", "pause")
- Slang ("mute it", "kill the music", "crank it")
- Contextual ("done listening", "phone call coming")
- Volume ("louder", "quieter", "volume up")
- Abbreviated ("nxt", "vol+")`,
  },
  {
    id: 'memory_save',
    tools: ['rememberThis', 'saveMemory', 'storeInfo'],
    seedExamples: [
      'remember that my wife likes roses',
      'save this for later',
      'dont forget I have a meeting at 3',
    ],
    augmentationPrompt: `Generate natural variations of memory-saving requests. Include:
- Implicit saves ("my daughter's birthday is June 15th")
- Casual ("hold that thought", "stash this")
- Contextual ("remember what I just said")
- Abbreviated ("save that", "remember: dentist tuesday")
- Natural speech ("oh btw my mom's allergic to shellfish")`,
  },
  {
    id: 'calendar_create',
    tools: ['createCalendarEvent', 'scheduleEvent'],
    seedExamples: [
      'schedule a meeting for tomorrow at 2pm',
      'add dentist appointment to my calendar',
      'book lunch with Sarah on Friday',
    ],
    augmentationPrompt: `Generate natural variations of calendar event creation. Include:
- Casual ("pencil in", "block off", "set up")
- Contextual ("meeting with boss about review")
- Abbreviated ("mtg tmrw 2pm", "cal: dentist fri")
- Natural speech ("I have a thing with John on Tuesday")
- Implicit ("coffee with mom saturday morning")`,
  },
  {
    id: 'reminder_set',
    tools: ['setReminder', 'createReminder'],
    seedExamples: [
      'remind me to call mom at 5pm',
      'reminder to pick up groceries',
      'dont let me forget to take my medicine',
    ],
    augmentationPrompt: `Generate natural variations of reminder-setting. Include:
- Casual ("ping me about", "nudge me to")
- Time-based ("in 2 hours remind me", "tomorrow morning")
- Location-based ("when I get home remind me")
- Abbreviated ("rmdr: call doc", "remind 5pm mom")
- Contextual ("before I leave remind me to grab keys")`,
  },
  {
    id: 'weather',
    tools: ['getWeather', 'weatherForecast'],
    seedExamples: ['whats the weather like', 'is it going to rain today', 'temperature outside'],
    augmentationPrompt: `Generate natural variations of weather queries. Include:
- Casual ("whats it like out", "need a jacket?")
- Planning ("weather this weekend", "rain tomorrow?")
- Location ("weather in NYC", "temps in chicago")
- Abbreviated ("wthr", "forecast tmrw")
- Contextual ("should I bring an umbrella")`,
  },
  {
    id: 'call_make',
    tools: ['makeCall', 'callContact'],
    seedExamples: ['call mom', 'dial 555-1234', 'phone John'],
    augmentationPrompt: `Generate natural variations of making calls. Include:
- Casual ("hit up mom", "buzz John")
- Contextual ("call the doctor back", "ring my wife")
- Abbreviated ("call mom", "dial doc")
- Natural ("get Sarah on the phone")
- Slang ("ring up", "give X a call")`,
  },
  {
    id: 'message_send',
    tools: ['sendMessage', 'textContact', 'sendSMS'],
    seedExamples: ['text mom I love you', 'send a message to John', 'sms Sarah running late'],
    augmentationPrompt: `Generate natural variations of sending messages. Include:
- Casual ("shoot a text to", "drop a line to")
- Quick messages ("text mom: omw", "msg john: late")
- Contextual ("tell Sarah I'm on my way")
- Abbreviated ("txt mom", "sms john hi")
- Slang ("hmu when ready", "dm Sarah")`,
  },
];

// ============================================================================
// GEMINI API
// ============================================================================

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
  }>;
}

async function callGemini(prompt: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 4096,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as GeminiResponse;
  return data.candidates[0]?.content?.parts[0]?.text || '';
}

// ============================================================================
// AUGMENTATION LOGIC
// ============================================================================

interface TrainingExample {
  id: string;
  query: string;
  selected_tools: string[];
  is_open_intent: boolean;
  source: string;
  category?: string;
}

async function augmentCategory(
  category: AugmentCategory,
  count: number
): Promise<TrainingExample[]> {
  const prompt = `You are generating training data for a voice assistant tool classifier.

Category: ${category.id}
Tools that should be selected: ${category.tools.join(', ')}

Seed examples:
${category.seedExamples.map((e) => `- "${e}"`).join('\n')}

${category.augmentationPrompt}

Generate ${count} unique, natural variations of user queries that should trigger the ${category.tools.join(' or ')} tool(s).

IMPORTANT RULES:
1. Each query should be on its own line
2. No numbering, bullets, or formatting
3. Queries should be realistic user speech
4. Include typos and abbreviations (10-20% of queries)
5. Include slang and casual speech (30-40%)
6. Include contextual variations (20-30%)
7. Keep queries SHORT (1-10 words typical)
8. NO explanations, just the queries

Output ONLY the queries, one per line:`;

  if (verbose) {
    console.log(`\n📝 Prompt for ${category.id}:\n${prompt.slice(0, 500)}...\n`);
  }

  if (dryRun) {
    console.log(`   [DRY RUN] Would generate ${count} examples for ${category.id}`);
    return [];
  }

  const response = await callGemini(prompt);

  // Parse response into queries
  const queries = response
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length < 200)
    .filter((line) => !line.startsWith('-') && !line.match(/^\d+\./));

  const timestamp = Date.now();
  const examples: TrainingExample[] = queries.map((query, i) => ({
    id: `v5_aug_${category.id}_${timestamp}_${i}`,
    query: query.toLowerCase().replace(/^["']|["']$/g, ''),
    selected_tools: category.tools,
    is_open_intent: false,
    source: 'llm_augmented',
    category: category.id,
  }));

  return examples;
}

async function augmentOpenIntents(count: number): Promise<TrainingExample[]> {
  const prompt = `You are generating training data for a voice assistant tool classifier.

Generate ${count} unique queries that should NOT trigger any tools. These are conversational, philosophical, or feedback statements.

Categories to include:
- Greetings and small talk ("hey", "how are you", "whats up")
- Gratitude ("thanks", "appreciate it", "you're the best")  
- Affirmations ("yes", "no", "maybe", "okay", "sure")
- Feedback ("good job", "not quite", "try again")
- Questions about the assistant ("who are you", "what can you do")
- Philosophical questions ("meaning of life", "what is happiness")
- Clarification requests ("what do you mean", "say that again")
- Filler words ("um", "uh", "hmm", "well")

IMPORTANT RULES:
1. Each query should be on its own line
2. No numbering or formatting
3. Keep queries SHORT (1-5 words typical)
4. These should NOT trigger tools like music, calendar, alarm, etc.
5. Include casual speech and abbreviations

Output ONLY the queries, one per line:`;

  if (dryRun) {
    console.log(`   [DRY RUN] Would generate ${count} open intent examples`);
    return [];
  }

  const response = await callGemini(prompt);

  const queries = response
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length < 100)
    .filter((line) => !line.startsWith('-') && !line.match(/^\d+\./));

  const timestamp = Date.now();
  const examples: TrainingExample[] = queries.map((query, i) => ({
    id: `v5_aug_open_${timestamp}_${i}`,
    query: query.toLowerCase().replace(/^["']|["']$/g, ''),
    selected_tools: [],
    is_open_intent: true,
    source: 'llm_augmented',
  }));

  return examples;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🤖 FTIS V5 LLM Data Augmentation\n');
  console.log(`📊 Configuration:`);
  console.log(`   - Category: ${categoryFilter || 'all'}`);
  console.log(`   - Count per category: ${countArg}`);
  console.log(`   - Dry run: ${dryRun}`);
  console.log(`   - Verbose: ${verbose}\n`);

  const categoriesToProcess = categoryFilter
    ? AUGMENT_CATEGORIES.filter((c) => c.id === categoryFilter)
    : AUGMENT_CATEGORIES;

  if (categoriesToProcess.length === 0) {
    console.error(`❌ Category "${categoryFilter}" not found`);
    console.log(`Available categories: ${AUGMENT_CATEGORIES.map((c) => c.id).join(', ')}`);
    process.exit(1);
  }

  const allExamples: TrainingExample[] = [];

  // Augment tool categories
  console.log('📝 Augmenting tool categories...');
  for (const category of categoriesToProcess) {
    try {
      console.log(`   🔄 ${category.id}...`);
      const examples = await augmentCategory(category, countArg);
      allExamples.push(...examples);
      console.log(`   ✓ ${category.id}: ${examples.length} examples`);

      // Rate limiting - wait between API calls
      if (!dryRun) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`   ❌ ${category.id}: ${error}`);
    }
  }

  // Augment open intents
  if (!categoryFilter) {
    console.log('\n📝 Augmenting open intents...');
    try {
      const openExamples = await augmentOpenIntents(Math.floor(countArg * 2));
      allExamples.push(...openExamples);
      console.log(`   ✓ open_intent: ${openExamples.length} examples`);
    } catch (error) {
      console.error(`   ❌ open_intent: ${error}`);
    }
  }

  if (dryRun) {
    console.log('\n✅ Dry run complete. No files written.');
    return;
  }

  if (allExamples.length === 0) {
    console.log('\n⚠️ No examples generated.');
    return;
  }

  // Shuffle
  console.log('\n🔀 Shuffling data...');
  for (let i = allExamples.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allExamples[i], allExamples[j]] = [allExamples[j], allExamples[i]];
  }

  // Append to existing V5 training file
  const trainPath = path.join(OUTPUT_DIR, 'train_v5.jsonl');
  const augmentedPath = path.join(OUTPUT_DIR, 'augmented_v5.jsonl');

  // Write augmented data to separate file
  fs.writeFileSync(augmentedPath, allExamples.map((e) => JSON.stringify(e)).join('\n'));
  console.log(`\n💾 Written augmented data to ${augmentedPath}`);

  // Append to training file
  const existingData = fs.readFileSync(trainPath, 'utf-8');
  const newData = allExamples.map((e) => JSON.stringify(e)).join('\n');
  fs.writeFileSync(trainPath, existingData + '\n' + newData);

  console.log(`✅ Appended ${allExamples.length} examples to ${trainPath}`);

  // Update metadata
  const metadataPath = path.join(OUTPUT_DIR, 'metadata_v5.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  metadata.augmented = {
    timestamp: new Date().toISOString(),
    count: allExamples.length,
    categories: categoriesToProcess.map((c) => c.id),
  };
  metadata.stats.totalExamples += allExamples.length;
  metadata.stats.trainSize += allExamples.length;
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  console.log(`\n📊 Updated totals:`);
  console.log(`   - Total examples: ${metadata.stats.totalExamples}`);
  console.log(`   - Training size: ${metadata.stats.trainSize}`);

  console.log('\n✅ Augmentation complete!');
}

main().catch(console.error);
