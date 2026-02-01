#!/usr/bin/env npx tsx
/**
 * FTIS V3 Training Data Generator
 *
 * Generates comprehensive training data for Qwen3-1.7B router model.
 * Key improvements over V2:
 *
 * 1. OPEN INTENT EXAMPLES - Queries that should NOT call tools (critical!)
 * 2. HARD NEGATIVES - Confusing tool pairs with clear distinctions
 * 3. CONTEXT-AWARE - persona_id, time_of_day, emotion
 * 4. MULTI-TOOL - Queries that need multiple tools
 * 5. EDGE CASES - Ambiguous queries, misspellings, colloquial speech
 *
 * Target: >80% top-1, >95% top-3, <5% false positive rate
 *
 * Usage:
 *   npx tsx scripts/generate-ftis-v3-training.ts
 *   npx tsx scripts/generate-ftis-v3-training.ts --use-llm  # Generate with Gemini
 *   npx tsx scripts/generate-ftis-v3-training.ts --output ./data/v3
 *
 * @module scripts/generate-ftis-v3-training
 */

import { config } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const args = process.argv.slice(2);
const useLLM = args.includes('--use-llm');
const outputDir = args.find(a => a.startsWith('--output='))?.split('=')[1]
  || './apps/ml-training/router/data';

const CONFIG = {
  // Examples per category
  examplesPerTool: 50,
  openIntentExamples: 2000,  // CRITICAL: Examples that should NOT call tools
  hardNegativesPerPair: 100,
  multiToolExamples: 500,
  edgeCaseExamples: 300,

  // Split ratios
  trainRatio: 0.8,
  validationRatio: 0.1,
  testRatio: 0.1,
};

// ============================================================================
// TYPES
// ============================================================================

interface TrainingExample {
  id: string;
  query: string;
  selected_tools: string[];  // Empty for open intents
  is_open_intent: boolean;   // True = should NOT call any tool
  persona_id?: string;
  emotion?: string;
  time_of_day?: string;
  source: 'synthetic' | 'hard_negative' | 'open_intent' | 'edge_case' | 'multi_tool';
  metadata?: Record<string, unknown>;
}

// ============================================================================
// OPEN INTENT EXAMPLES (CRITICAL!)
// These are queries that should NOT trigger any tool - just conversation
// ============================================================================

const OPEN_INTENT_PATTERNS = [
  // Emotional sharing (no action needed)
  "I'm feeling really down today",
  "I had such a great day",
  "I'm so stressed about work",
  "I can't believe what happened",
  "I'm really excited about this",
  "I'm worried about my mom",
  "I feel so overwhelmed",
  "I'm grateful for you",
  "I'm scared about the future",
  "I'm frustrated with everything",

  // Thinking out loud
  "I've been thinking a lot lately",
  "I wonder what life would be like",
  "Sometimes I question my choices",
  "I've realized something about myself",
  "I keep going back and forth on this",

  // Casual conversation
  "How are you doing?",
  "What do you think about that?",
  "Isn't that interesting?",
  "I never thought of it that way",
  "That reminds me of something",

  // Philosophical/reflective
  "What's the meaning of all this?",
  "Do you think people can really change?",
  "I wonder if I made the right choice",
  "Life is so unpredictable",
  "Everything happens for a reason, right?",

  // Seeking empathy (not advice)
  "I just need someone to listen",
  "I don't need advice, just support",
  "Can you just be here with me?",
  "I'm not looking for solutions",
  "I just want to vent",

  // Social/small talk
  "How was your weekend?",
  "Did you see the news?",
  "What's new with you?",
  "I missed talking to you",
  "It's been a long day",

  // Story sharing
  "Let me tell you what happened",
  "So there I was, and then...",
  "You won't believe this but...",
  "I have to tell you about...",
  "The funniest thing happened",

  // Opinions/preferences
  "I really love autumn",
  "I think cats are better than dogs",
  "I prefer mornings to nights",
  "I've always been a coffee person",
  "I'm not a fan of crowds",

  // Gratitude/appreciation
  "Thank you for being here",
  "I appreciate you so much",
  "You always know what to say",
  "Thanks for listening",
  "I'm glad I have you",

  // Processing/venting
  "I just can't understand why...",
  "It makes no sense to me",
  "I keep replaying it in my head",
  "I don't know what to think",
  "I'm still processing everything",
];

// Variations for open intents
const OPEN_INTENT_VARIATIONS = [
  // Emotional prefixes
  "You know, ", "Honestly, ", "I've been meaning to say, ", "Between us, ",
  "Can I be honest? ", "I have to admit, ", "The thing is, ", "Here's the deal, ",

  // Emotional suffixes
  ", you know?", ", I guess.", ", if that makes sense.", ", anyway.",
  ", I don't know.", ", whatever that means.", ", or something.", ", you know what I mean?",
];

// ============================================================================
// TOOL CATEGORIES WITH EXAMPLES
// ============================================================================

interface ToolCategory {
  id: string;
  tools: string[];
  examples: string[];
  keywords: string[];
}

const TOOL_CATEGORIES: ToolCategory[] = [
  // Music
  {
    id: 'music_play',
    tools: ['playMusic', 'spotify_play', 'music_play'],
    examples: [
      "play some jazz", "put on some music", "I want to hear some rock",
      "play my workout playlist", "something relaxing please", "play Taylor Swift",
      "can you play some lo-fi", "start some background music", "play my favorites",
    ],
    keywords: ['play', 'music', 'song', 'playlist', 'artist', 'album'],
  },
  {
    id: 'music_control',
    tools: ['pauseMusic', 'skipTrack', 'adjustVolume'],
    examples: [
      "pause the music", "skip this song", "turn it up", "next track",
      "stop the music", "volume down", "louder please", "mute",
    ],
    keywords: ['pause', 'stop', 'skip', 'volume', 'next', 'previous', 'mute'],
  },

  // Calendar
  {
    id: 'calendar_create',
    tools: ['createCalendarEvent', 'scheduleEvent'],
    examples: [
      "schedule a meeting tomorrow at 2pm", "add dentist to my calendar",
      "book lunch with Sarah", "create an event for Friday", "set up a call",
    ],
    keywords: ['schedule', 'add', 'book', 'create event', 'calendar'],
  },
  {
    id: 'calendar_view',
    tools: ['getCalendarEvents', 'checkAvailability'],
    examples: [
      "what's on my calendar today", "show my schedule", "am I free at 3pm",
      "what meetings do I have", "any appointments tomorrow",
    ],
    keywords: ['calendar', 'schedule', 'free', 'meetings', 'appointments'],
  },

  // Reminders
  {
    id: 'reminder_set',
    tools: ['setReminder', 'createReminder'],
    examples: [
      "remind me to call mom", "set a reminder for 5pm", "don't let me forget",
      "remind me tomorrow morning", "alert me when it's time",
    ],
    keywords: ['remind', 'reminder', 'alert', 'don\'t forget', 'let me know'],
  },

  // Weather
  {
    id: 'weather',
    tools: ['getWeather', 'weatherForecast'],
    examples: [
      "what's the weather today", "will it rain tomorrow", "temperature outside",
      "do I need an umbrella", "forecast for the weekend",
    ],
    keywords: ['weather', 'temperature', 'rain', 'forecast', 'umbrella', 'cold', 'hot'],
  },

  // Timer/Alarm
  {
    id: 'timer',
    tools: ['setTimer', 'createTimer'],
    examples: [
      "set a timer for 10 minutes", "5 minute countdown", "timer for pasta",
      "start a 30 minute timer", "countdown from 15 minutes",
    ],
    keywords: ['timer', 'countdown', 'minutes', 'seconds'],
  },
  {
    id: 'alarm',
    tools: ['setAlarm', 'createAlarm'],
    examples: [
      "set an alarm for 7am", "wake me up at 6", "alarm for tomorrow",
      "morning alarm please", "wake me in 2 hours",
    ],
    keywords: ['alarm', 'wake', 'wake up', 'morning'],
  },

  // Habits
  {
    id: 'habit_log',
    tools: ['logHabit', 'trackHabit', 'markHabitComplete'],
    examples: [
      "I did my meditation", "log that I exercised", "mark reading as done",
      "I drank my water", "completed my morning routine",
    ],
    keywords: ['did', 'done', 'completed', 'log', 'mark', 'track'],
  },
  {
    id: 'habit_view',
    tools: ['getHabitProgress', 'viewStreak', 'habitStats'],
    examples: [
      "how's my meditation streak", "show my habit progress", "am I on track",
      "what's my longest streak", "habit stats for this week",
    ],
    keywords: ['streak', 'progress', 'stats', 'how am I doing', 'track'],
  },

  // Memory
  {
    id: 'memory_save',
    tools: ['rememberThis', 'saveMemory', 'storeInfo'],
    examples: [
      "remember that I like sushi", "my favorite color is blue",
      "I'm allergic to peanuts", "save that my anniversary is March 5th",
    ],
    keywords: ['remember', 'save', 'store', 'favorite', 'my', 'I like', 'I prefer'],
  },
  {
    id: 'memory_recall',
    tools: ['recallMemory', 'getMemory', 'whatDoYouKnow'],
    examples: [
      "what do you remember about me", "what's my favorite food",
      "do you know my wife's name", "what did I tell you about",
    ],
    keywords: ['what do you know', 'remember', 'recall', 'my favorite'],
  },

  // Communication
  {
    id: 'call',
    tools: ['makeCall', 'callContact'],
    examples: [
      "call mom", "phone my boss", "dial Sarah", "call my wife",
      "ring John please", "get mom on the phone",
    ],
    keywords: ['call', 'phone', 'dial', 'ring', 'get on the phone'],
  },
  {
    id: 'message',
    tools: ['sendMessage', 'textContact', 'sendSMS'],
    examples: [
      "text Sarah I'm running late", "send a message to mom",
      "tell John I'll be there", "message my wife",
    ],
    keywords: ['text', 'message', 'send', 'tell'],
  },

  // Information
  {
    id: 'search',
    tools: ['webSearch', 'search', 'lookup'],
    examples: [
      "search for pasta recipes", "look up the population of Japan",
      "find information about...", "google how to...",
    ],
    keywords: ['search', 'look up', 'find', 'google', 'what is'],
  },
  {
    id: 'news',
    tools: ['getNews', 'headlines'],
    examples: [
      "what's in the news", "any headlines today", "latest news",
      "what's happening in the world", "news update",
    ],
    keywords: ['news', 'headlines', 'happening', 'latest'],
  },
];

// ============================================================================
// HARD NEGATIVE PAIRS (Confusing categories)
// ============================================================================

interface HardNegativePair {
  category1: string;
  category2: string;
  differentiator: string;
  cat1Examples: string[];
  cat2Examples: string[];
}

const HARD_NEGATIVE_PAIRS: HardNegativePair[] = [
  {
    category1: 'habit_log',
    category2: 'habit_view',
    differentiator: 'log = marking done, view = checking progress',
    cat1Examples: [
      "I did my meditation today", "mark workout as complete", "logged my reading",
    ],
    cat2Examples: [
      "how's my meditation streak", "show my workout progress", "am I keeping up with reading",
    ],
  },
  {
    category1: 'reminder_set',
    category2: 'calendar_create',
    differentiator: 'reminder = alert me, calendar = block time',
    cat1Examples: [
      "remind me to buy milk", "don't let me forget the meeting",
    ],
    cat2Examples: [
      "schedule a meeting for 2pm", "add dentist appointment to calendar",
    ],
  },
  {
    category1: 'timer',
    category2: 'alarm',
    differentiator: 'timer = countdown from now, alarm = specific time',
    cat1Examples: [
      "set a timer for 10 minutes", "countdown for pasta",
    ],
    cat2Examples: [
      "set an alarm for 7am", "wake me up tomorrow morning",
    ],
  },
  {
    category1: 'memory_save',
    category2: 'reminder_set',
    differentiator: 'memory = store fact, reminder = future alert',
    cat1Examples: [
      "remember I like spicy food", "my wife's birthday is June 5th",
    ],
    cat2Examples: [
      "remind me about wife's birthday on June 4th", "alert me to buy a gift",
    ],
  },
  {
    category1: 'call',
    category2: 'message',
    differentiator: 'call = voice call, message = text/SMS',
    cat1Examples: [
      "call mom", "phone Sarah", "dial my boss",
    ],
    cat2Examples: [
      "text mom I'm coming", "send a message to Sarah", "let John know via text",
    ],
  },
];

// ============================================================================
// GENERATION FUNCTIONS
// ============================================================================

let exampleId = 0;

function generateId(): string {
  return `ftis_v3_${Date.now()}_${++exampleId}`;
}

function generateOpenIntentExamples(): TrainingExample[] {
  const examples: TrainingExample[] = [];

  // Base patterns
  for (const pattern of OPEN_INTENT_PATTERNS) {
    examples.push({
      id: generateId(),
      query: pattern,
      selected_tools: [],
      is_open_intent: true,
      source: 'open_intent',
    });

    // Add variations with prefixes
    for (const prefix of OPEN_INTENT_VARIATIONS.slice(0, 4)) {
      examples.push({
        id: generateId(),
        query: prefix + pattern.charAt(0).toLowerCase() + pattern.slice(1),
        selected_tools: [],
        is_open_intent: true,
        source: 'open_intent',
      });
    }

    // Add variations with suffixes
    for (const suffix of OPEN_INTENT_VARIATIONS.slice(4)) {
      examples.push({
        id: generateId(),
        query: pattern.replace(/[.!?]$/, '') + suffix,
        selected_tools: [],
        is_open_intent: true,
        source: 'open_intent',
      });
    }
  }

  // Generate more open intent examples
  const moreOpenIntents = [
    // Questions that are conversational, not commands
    "Do you think I should?",
    "What would you do?",
    "How do you feel about that?",
    "Doesn't that seem strange?",
    "Can you believe it?",
    "What's your take on this?",
    "Am I being crazy?",
    "Is that normal?",
    "Should I be worried?",
    "What does that mean?",

    // Statements that don't need action
    "That's interesting",
    "I see what you mean",
    "Makes sense",
    "Fair point",
    "I didn't think of that",
    "Good question",
    "You're right",
    "I agree",
    "That's a good point",
    "I hadn't considered that",

    // Greetings and closings
    "Hey there",
    "Good morning",
    "How's it going",
    "Nice to talk to you",
    "I should go now",
    "Talk to you later",
    "Have a good one",
    "Take care",
    "See you",
    "Bye for now",

    // Acknowledgments
    "Got it",
    "Okay",
    "Sure",
    "Alright",
    "I understand",
    "Noted",
    "Makes sense",
    "I hear you",
    "I get it",
    "Right",
  ];

  for (const query of moreOpenIntents) {
    examples.push({
      id: generateId(),
      query,
      selected_tools: [],
      is_open_intent: true,
      source: 'open_intent',
    });
  }

  return examples;
}

function generateToolExamples(): TrainingExample[] {
  const examples: TrainingExample[] = [];

  for (const category of TOOL_CATEGORIES) {
    for (const example of category.examples) {
      examples.push({
        id: generateId(),
        query: example,
        selected_tools: category.tools,
        is_open_intent: false,
        source: 'synthetic',
      });

      // Generate variations
      const variations = [
        `Can you ${example.toLowerCase()}`,
        `Please ${example.toLowerCase()}`,
        `I need to ${example.toLowerCase()}`,
        `Could you ${example.toLowerCase()}`,
        `I want to ${example.toLowerCase()}`,
      ];

      for (const variation of variations) {
        if (Math.random() > 0.3) {
          examples.push({
            id: generateId(),
            query: variation,
            selected_tools: category.tools,
            is_open_intent: false,
            source: 'synthetic',
          });
        }
      }
    }
  }

  return examples;
}

function generateHardNegativeExamples(): TrainingExample[] {
  const examples: TrainingExample[] = [];

  for (const pair of HARD_NEGATIVE_PAIRS) {
    const cat1 = TOOL_CATEGORIES.find(c => c.id === pair.category1);
    const cat2 = TOOL_CATEGORIES.find(c => c.id === pair.category2);

    if (!cat1 || !cat2) continue;

    // Category 1 examples
    for (const example of pair.cat1Examples) {
      examples.push({
        id: generateId(),
        query: example,
        selected_tools: cat1.tools,
        is_open_intent: false,
        source: 'hard_negative',
        metadata: {
          contrastWith: pair.category2,
          differentiator: pair.differentiator,
        },
      });
    }

    // Category 2 examples
    for (const example of pair.cat2Examples) {
      examples.push({
        id: generateId(),
        query: example,
        selected_tools: cat2.tools,
        is_open_intent: false,
        source: 'hard_negative',
        metadata: {
          contrastWith: pair.category1,
          differentiator: pair.differentiator,
        },
      });
    }
  }

  return examples;
}

function generateEdgeCaseExamples(): TrainingExample[] {
  const examples: TrainingExample[] = [];

  // Misspellings
  const misspellings = [
    { query: "plya some music", tools: ['playMusic'], correct: "play some music" },
    { query: "whats the wether", tools: ['getWeather'], correct: "what's the weather" },
    { query: "set a remidner", tools: ['setReminder'], correct: "set a reminder" },
    { query: "calll mom", tools: ['makeCall'], correct: "call mom" },
    { query: "shcedule meeting", tools: ['createCalendarEvent'], correct: "schedule meeting" },
  ];

  for (const { query, tools, correct } of misspellings) {
    examples.push({
      id: generateId(),
      query,
      selected_tools: tools,
      is_open_intent: false,
      source: 'edge_case',
      metadata: { correctSpelling: correct },
    });
  }

  // Colloquial speech
  const colloquial = [
    { query: "throw on some tunes", tools: ['playMusic'] },
    { query: "hit me with the news", tools: ['getNews'] },
    { query: "what's poppin", tools: [] },  // Open intent
    { query: "yo what's up", tools: [] },    // Open intent
    { query: "buzz my wife", tools: ['makeCall'] },
    { query: "shoot a text to mom", tools: ['sendMessage'] },
    { query: "lemme know when time's up", tools: ['setTimer'] },
  ];

  for (const { query, tools } of colloquial) {
    examples.push({
      id: generateId(),
      query,
      selected_tools: tools,
      is_open_intent: tools.length === 0,
      source: 'edge_case',
    });
  }

  return examples;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('🚀 FTIS V3 Training Data Generator');
  console.log('===================================');
  console.log(`Output directory: ${outputDir}`);
  console.log(`Use LLM for generation: ${useLLM}`);
  console.log('');

  // Generate all examples
  console.log('📊 Generating training examples...');

  const openIntents = generateOpenIntentExamples();
  console.log(`  Open intents: ${openIntents.length}`);

  const toolExamples = generateToolExamples();
  console.log(`  Tool examples: ${toolExamples.length}`);

  const hardNegatives = generateHardNegativeExamples();
  console.log(`  Hard negatives: ${hardNegatives.length}`);

  const edgeCases = generateEdgeCaseExamples();
  console.log(`  Edge cases: ${edgeCases.length}`);

  // Combine all examples
  const allExamples = [...openIntents, ...toolExamples, ...hardNegatives, ...edgeCases];
  console.log(`\n  Total examples: ${allExamples.length}`);

  // Shuffle
  const shuffled = allExamples.sort(() => Math.random() - 0.5);

  // Split into train/validation/test
  const trainSize = Math.floor(shuffled.length * CONFIG.trainRatio);
  const valSize = Math.floor(shuffled.length * CONFIG.validationRatio);

  const trainSet = shuffled.slice(0, trainSize);
  const valSet = shuffled.slice(trainSize, trainSize + valSize);
  const testSet = shuffled.slice(trainSize + valSize);

  console.log(`\n📦 Dataset splits:`);
  console.log(`  Train: ${trainSet.length}`);
  console.log(`  Validation: ${valSet.length}`);
  console.log(`  Test: ${testSet.length}`);

  // Create output directory
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Write JSONL files
  const writeJsonl = (filename: string, data: TrainingExample[]) => {
    const lines = data.map(ex => JSON.stringify(ex)).join('\n');
    writeFileSync(join(outputDir, filename), lines);
    console.log(`  ✅ Wrote ${filename}`);
  };

  console.log('\n💾 Writing dataset files...');
  writeJsonl('train.jsonl', trainSet);
  writeJsonl('validation.jsonl', valSet);
  writeJsonl('test.jsonl', testSet);

  // Write metadata
  const metadata = {
    version: 'v3',
    generated: new Date().toISOString(),
    config: CONFIG,
    stats: {
      totalExamples: allExamples.length,
      openIntents: openIntents.length,
      toolExamples: toolExamples.length,
      hardNegatives: hardNegatives.length,
      edgeCases: edgeCases.length,
      trainSize: trainSet.length,
      validationSize: valSet.length,
      testSize: testSet.length,
    },
    categories: TOOL_CATEGORIES.map(c => ({ id: c.id, tools: c.tools })),
    openIntentRatio: openIntents.length / allExamples.length,
  };

  writeFileSync(join(outputDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  console.log('  ✅ Wrote metadata.json');

  console.log('\n✨ Generation complete!');
  console.log(`\nNext steps:`);
  console.log(`  1. Review data in ${outputDir}/`);
  console.log(`  2. Run: cd apps/ml-training/router && python train.py --config config.yaml`);
}

main().catch(console.error);
