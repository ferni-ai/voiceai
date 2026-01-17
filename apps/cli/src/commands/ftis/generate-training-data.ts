/**
 * FTIS Training Data Generator
 *
 * Generates synthetic training data for the Ferni Router Model.
 * Uses tool definitions to create diverse query examples.
 *
 * @module cli/commands/ftis/generate-training-data
 */

import { promises as fs } from 'fs';
import path from 'path';

// ============================================================================
// TYPES
// ============================================================================

interface ToolDef {
  id: string;
  name: string;
  description: string;
  domain: string;
  exampleQueries?: string[];
}

interface TrainingExample {
  id: string;
  query: string;
  selected_tools: string[];
  persona_id: string;
  emotion: string;
  time_of_day: string;
  recent_tools: string[];
  was_successful: boolean;
  source: string;
}

interface GenerationConfig {
  examplesPerTool: number;
  outputDir: string;
  includeTypos: boolean;
  includeMultiTool: boolean;
}

// ============================================================================
// HARDCODED TOOL DEFINITIONS (from registry)
// ============================================================================

const CORE_TOOLS: ToolDef[] = [
  // Handoffs
  {
    id: 'handoffToFerni',
    name: 'Handoff to Ferni',
    description: 'Transfer conversation to Ferni, the main life coach',
    domain: 'handoff',
    exampleQueries: [
      'Let me talk to Ferni',
      'Switch to Ferni',
      'I want to speak with Ferni',
      'Transfer me to Ferni',
      'Can I talk to the main coach?',
    ],
  },
  {
    id: 'handoffToMaya',
    name: 'Handoff to Maya',
    description: 'Transfer conversation to Maya for habits and routines',
    domain: 'handoff',
    exampleQueries: [
      'Let me talk to Maya',
      'I need help with my habits',
      'Can Maya help me with routines?',
      'Switch to Maya please',
      'I want to work on my daily routine',
    ],
  },
  {
    id: 'handoffToPeter',
    name: 'Handoff to Peter',
    description: 'Transfer conversation to Peter for research and analysis',
    domain: 'handoff',
    exampleQueries: [
      'Let me talk to Peter',
      'I need some research help',
      'Can Peter look into this?',
      'Switch to Peter',
      'I want data on this topic',
    ],
  },
  {
    id: 'handoffToAlex',
    name: 'Handoff to Alex',
    description: 'Transfer conversation to Alex for communication help',
    domain: 'handoff',
    exampleQueries: [
      'Let me talk to Alex',
      'I need help writing something',
      'Can Alex help me communicate?',
      'Switch to Alex',
      'I have a difficult email to write',
    ],
  },
  {
    id: 'handoffToNayan',
    name: 'Handoff to Nayan',
    description: 'Transfer conversation to Nayan for wisdom and philosophy',
    domain: 'handoff',
    exampleQueries: [
      'Let me talk to Nayan',
      'I need some wisdom',
      'Can Nayan share some perspective?',
      'Switch to Nayan',
      "I'm having an existential moment",
    ],
  },
  // Music
  {
    id: 'playMusic',
    name: 'Play Music',
    description: 'Play music based on mood, genre, or specific request',
    domain: 'music',
    exampleQueries: [
      'Play some music',
      'Put on some jazz',
      'Play relaxing music',
      'I want to hear some upbeat songs',
      'Can you play classical music?',
      'Play something to help me focus',
      'Put on my favorite playlist',
      'Play lo-fi beats',
    ],
  },
  // Weather
  {
    id: 'getWeather',
    name: 'Get Weather',
    description: 'Get current weather and forecast',
    domain: 'weather',
    exampleQueries: [
      "What's the weather like?",
      "How's the weather today?",
      'Is it going to rain?',
      'Weather forecast for tomorrow',
      'Should I bring an umbrella?',
      "What's the temperature outside?",
      'Will it be sunny this weekend?',
    ],
  },
  // Memory
  {
    id: 'recallFromMemory',
    name: 'Recall from Memory',
    description: 'Retrieve information from past conversations',
    domain: 'memory',
    exampleQueries: [
      'Do you remember when I told you about...',
      'What did I say about...',
      "Didn't I mention...",
      'Recall what I said about my job',
      'What do you know about my sister?',
      'Remember our conversation about...',
    ],
  },
  {
    id: 'rememberAboutUser',
    name: 'Remember About User',
    description: 'Store important information about the user',
    domain: 'memory',
    exampleQueries: [
      'Remember that I...',
      "Don't forget I...",
      'Note that my...',
      'Keep in mind that...',
      'Save this: I...',
      "I want you to remember that my wife's name is...",
    ],
  },
  // Reminders
  {
    id: 'setReminder',
    name: 'Set Reminder',
    description: 'Create a reminder for a specific time',
    domain: 'productivity',
    exampleQueries: [
      'Remind me to...',
      'Set a reminder for...',
      "Don't let me forget to...",
      'Remind me at 3pm to...',
      'Set an alarm for tomorrow morning',
      'Remind me to call mom on Sunday',
    ],
  },
  // Habits
  {
    id: 'createHabit',
    name: 'Create Habit',
    description: 'Start tracking a new habit',
    domain: 'habits',
    exampleQueries: [
      'I want to start a new habit',
      'Help me build a habit of...',
      'I want to start meditating daily',
      'Can you help me create a workout habit?',
      'I want to read more',
      'Help me drink more water',
    ],
  },
  {
    id: 'logHabitCompletion',
    name: 'Log Habit Completion',
    description: 'Mark a habit as completed',
    domain: 'habits',
    exampleQueries: [
      'I did my meditation today',
      'Log my workout',
      "I completed today's habit",
      'Mark my reading as done',
      'I drank my water today',
      'Check off my exercise',
    ],
  },
  {
    id: 'getHabits',
    name: 'Get Habits',
    description: 'View current habits and progress',
    domain: 'habits',
    exampleQueries: [
      'Show me my habits',
      "How am I doing with my habits?",
      "What's my streak?",
      'Check my habit progress',
      'How many days in a row?',
      'Show my habit tracker',
    ],
  },
  // Wellness
  {
    id: 'breatheWithMe',
    name: 'Breathe With Me',
    description: 'Guided breathing exercise',
    domain: 'wellness',
    exampleQueries: [
      "I'm feeling anxious",
      'Help me calm down',
      'Can we do some breathing?',
      'I need to relax',
      "I'm stressed",
      'Guide me through breathing',
      'Help me with my anxiety',
    ],
  },
  {
    id: 'groundingExercise',
    name: 'Grounding Exercise',
    description: 'Grounding technique for anxiety',
    domain: 'wellness',
    exampleQueries: [
      'I feel disconnected',
      'Help me ground myself',
      'I need grounding',
      "I'm feeling overwhelmed",
      'Can you help me be present?',
      "I'm having a panic attack",
    ],
  },
  // Goals
  {
    id: 'trackCommitment',
    name: 'Track Commitment',
    description: 'Track a commitment or goal',
    domain: 'goals',
    exampleQueries: [
      "I'm committing to...",
      'I promise to...',
      'I want to achieve...',
      'My goal is to...',
      "I'm going to start...",
      'Help me track my progress on...',
    ],
  },
  {
    id: 'reviewCommitments',
    name: 'Review Commitments',
    description: 'Review current commitments and goals',
    domain: 'goals',
    exampleQueries: [
      'What are my current goals?',
      'Review my commitments',
      "How am I doing on my goals?",
      'Show me my progress',
      'What did I commit to?',
      'Check my goal status',
    ],
  },
  // Calendar
  {
    id: 'manageAppointment',
    name: 'Manage Appointment',
    description: 'Create or modify calendar appointments',
    domain: 'calendar',
    exampleQueries: [
      'Schedule a meeting',
      'Add to my calendar',
      'Set up an appointment',
      'Book time for...',
      "What's on my calendar?",
      'Cancel my appointment',
      'Reschedule the meeting',
    ],
  },
  // Relationships
  {
    id: 'reflectOnRelationship',
    name: 'Reflect on Relationship',
    description: 'Process thoughts about relationships',
    domain: 'relationships',
    exampleQueries: [
      'I want to talk about my relationship',
      "I'm having issues with my partner",
      "My friend and I aren't getting along",
      'Help me understand my relationship',
      "I'm worried about my marriage",
      'Can we talk about my family?',
    ],
  },
  {
    id: 'navigateConflict',
    name: 'Navigate Conflict',
    description: 'Help with interpersonal conflicts',
    domain: 'relationships',
    exampleQueries: [
      'I had a fight with...',
      "We're not getting along",
      'How do I resolve this conflict?',
      "I'm angry at my friend",
      "My partner and I aren't seeing eye to eye",
      'Help me deal with this disagreement',
    ],
  },
  // Career
  {
    id: 'clarifyCareerGoals',
    name: 'Clarify Career Goals',
    description: 'Work on career planning and goals',
    domain: 'career',
    exampleQueries: [
      "I'm thinking about my career",
      'Help me plan my career',
      'Should I change jobs?',
      "I'm not happy at work",
      'What should I do with my career?',
      "I'm considering a promotion",
    ],
  },
  {
    id: 'trackJobApplication',
    name: 'Track Job Application',
    description: 'Track job search progress',
    domain: 'career',
    exampleQueries: [
      'I applied for a job',
      'Track my job application',
      'I had an interview',
      "What's the status of my applications?",
      'I got a callback',
      'Update my job search',
    ],
  },
  // Session
  {
    id: 'endCall',
    name: 'End Call',
    description: 'End the current conversation session',
    domain: 'session',
    exampleQueries: [
      'Goodbye',
      'Talk to you later',
      'Bye for now',
      "I'm going to go",
      "That's all for today",
      'End the call',
      'See you later',
    ],
  },
  // Grief
  {
    id: 'processGrief',
    name: 'Process Grief',
    description: 'Help with grief and loss',
    domain: 'grief',
    exampleQueries: [
      'I lost someone',
      "I'm grieving",
      'Someone close to me died',
      "I can't stop thinking about...",
      "I'm dealing with loss",
      'Help me process my grief',
    ],
  },
  // Trauma
  {
    id: 'groundingForTrauma',
    name: 'Grounding for Trauma',
    description: 'Trauma-informed grounding support',
    domain: 'trauma',
    exampleQueries: [
      'I had a flashback',
      "I'm triggered",
      'Something reminded me of my trauma',
      'I feel unsafe',
      "I'm having trauma symptoms",
      'Help me feel safe',
    ],
  },
];

// Additional tool variations and synonyms
const QUERY_VARIATIONS = {
  playMusic: [
    'put on some tunes',
    'i want music',
    'can you play something?',
    'music please',
    'let me hear some music',
    'start playing',
    'background music please',
    'throw on some beats',
    'i need music',
    'play something nice',
  ],
  getWeather: [
    'weather check',
    'what should i wear today',
    'is it cold outside',
    'do i need a jacket',
    'forecast please',
    'whats it like out',
    "hows it looking outside",
    'weather report',
    'will it storm',
    'temperature please',
  ],
  setReminder: [
    'ping me later',
    'give me a heads up about',
    'dont let me forget',
    'nudge me at',
    'alert me when',
    'schedule a reminder',
    'i need a reminder',
    'make a note to',
    'add a reminder',
    'tell me to',
  ],
  breatheWithMe: [
    'i cant calm down',
    'my heart is racing',
    'i need to destress',
    'help me breathe',
    'breathing exercise',
    'calm me down',
    'i feel panicky',
    'anxiety help',
    'relax with me',
    'slow down with me',
  ],
  recallFromMemory: [
    'what was that thing i told you',
    'you know that time',
    'i mentioned before',
    'we talked about',
    'did i tell you about',
    'remember i said',
    'what do you know about my',
    'recall that conversation',
    'from our past talks',
    'you should know that i',
  ],
};

// ============================================================================
// GENERATION FUNCTIONS
// ============================================================================

const PERSONAS = ['ferni', 'maya', 'peter', 'alex', 'jordan', 'nayan'];
const TIME_OF_DAY = ['morning', 'afternoon', 'evening', 'night'];
const EMOTIONS = ['neutral', 'happy', 'sad', 'anxious', 'excited', 'frustrated', 'calm'];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateId(): string {
  return `synth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function introduceTypo(query: string): string {
  const words = query.split(' ');
  if (words.length < 2) return query;

  const wordIndex = Math.floor(Math.random() * words.length);
  const word = words[wordIndex];

  if (word.length < 3) return query;

  const typoType = Math.floor(Math.random() * 3);
  let typoWord = word;

  switch (typoType) {
    case 0: // Character swap
      if (word.length >= 2) {
        const i = Math.floor(Math.random() * (word.length - 1));
        typoWord = word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
      }
      break;
    case 1: // Missing character
      {
        const i = Math.floor(Math.random() * word.length);
        typoWord = word.slice(0, i) + word.slice(i + 1);
      }
      break;
    case 2: // Double character
      {
        const i = Math.floor(Math.random() * word.length);
        typoWord = word.slice(0, i) + word[i] + word.slice(i);
      }
      break;
  }

  words[wordIndex] = typoWord;
  return words.join(' ');
}

function generateExampleForTool(tool: ToolDef, queryVariation: string): TrainingExample {
  return {
    id: generateId(),
    query: queryVariation,
    selected_tools: [tool.id],
    persona_id: randomChoice(PERSONAS),
    emotion: randomChoice(EMOTIONS),
    time_of_day: randomChoice(TIME_OF_DAY),
    recent_tools: [],
    was_successful: true,
    source: 'synthetic',
  };
}

function generateMultiToolExample(tools: ToolDef[]): TrainingExample | null {
  // Create logical multi-tool combinations
  const combinations = [
    ['getWeather', 'manageAppointment'],
    ['playMusic', 'setReminder'],
    ['recallFromMemory', 'trackCommitment'],
    ['breatheWithMe', 'groundingExercise'],
    ['reflectOnRelationship', 'navigateConflict'],
    ['createHabit', 'setReminder'],
    ['clarifyCareerGoals', 'trackJobApplication'],
  ];

  const combo = randomChoice(combinations);
  const toolsInCombo = combo.filter((id) => tools.find((t) => t.id === id));

  if (toolsInCombo.length < 2) return null;

  const queries: Record<string, string[]> = {
    'getWeather,manageAppointment': [
      "What's the weather for my outdoor meeting tomorrow?",
      'Check if it will rain and schedule my run',
      'Is it nice enough to plan a picnic this weekend?',
    ],
    'playMusic,setReminder': [
      'Play focus music and remind me to take a break in an hour',
      'Start my study playlist and set a timer for 30 minutes',
      'Put on relaxing music and tell me when dinner is ready',
    ],
    'recallFromMemory,trackCommitment': [
      "What goals did I set last week and how am I doing?",
      'Remember what I committed to and check my progress',
      'What did I promise to do this month?',
    ],
    'breatheWithMe,groundingExercise': [
      "I'm having a panic attack, help me calm down",
      'I need full anxiety support right now',
      'Help me get grounded and regulated',
    ],
    'reflectOnRelationship,navigateConflict': [
      "My partner and I are fighting, help me understand what's happening",
      "There's tension in my marriage, can we talk?",
      "I had a big argument with my friend, I'm confused",
    ],
    'createHabit,setReminder': [
      'I want to start meditating daily, set up reminders',
      'Help me build a reading habit with daily nudges',
      'Create a workout routine and remind me to do it',
    ],
    'clarifyCareerGoals,trackJobApplication': [
      "I'm job searching, help me stay organized",
      'I applied to a job, can you help me think through my career?',
      'Track my applications and discuss my career direction',
    ],
  };

  const key = combo.join(',');
  const queryOptions = queries[key];
  if (!queryOptions) return null;

  return {
    id: generateId(),
    query: randomChoice(queryOptions),
    selected_tools: toolsInCombo,
    persona_id: randomChoice(PERSONAS),
    emotion: randomChoice(EMOTIONS),
    time_of_day: randomChoice(TIME_OF_DAY),
    recent_tools: [],
    was_successful: true,
    source: 'synthetic',
  };
}

async function generateTrainingData(config: GenerationConfig): Promise<TrainingExample[]> {
  const examples: TrainingExample[] = [];

  console.log(`Generating training data for ${CORE_TOOLS.length} tools...`);

  // Generate examples for each tool
  for (const tool of CORE_TOOLS) {
    // Use provided example queries
    const queries = [...(tool.exampleQueries || [])];

    // Add variation queries if available
    const variations = QUERY_VARIATIONS[tool.id as keyof typeof QUERY_VARIATIONS] || [];
    queries.push(...variations);

    // Generate examples from queries
    for (const query of queries) {
      examples.push(generateExampleForTool(tool, query));

      // Add typo variations
      if (config.includeTypos && Math.random() < 0.3) {
        const typoQuery = introduceTypo(query);
        if (typoQuery !== query) {
          examples.push(generateExampleForTool(tool, typoQuery));
        }
      }
    }

    // Generate additional paraphrases to reach target
    const targetCount = config.examplesPerTool;
    while (examples.filter((e) => e.selected_tools.includes(tool.id)).length < targetCount) {
      // Create simple variations
      const baseQuery = randomChoice(queries);
      const prefixes = ['', 'please ', 'can you ', 'i want to ', 'help me ', 'i need to '];
      const suffixes = ['', ' please', ' now', ' today', ' for me'];
      const variation = randomChoice(prefixes) + baseQuery + randomChoice(suffixes);
      examples.push(generateExampleForTool(tool, variation.trim()));
    }
  }

  // Generate multi-tool examples
  if (config.includeMultiTool) {
    console.log('Generating multi-tool examples...');
    for (let i = 0; i < 200; i++) {
      const example = generateMultiToolExample(CORE_TOOLS);
      if (example) {
        examples.push(example);
      }
    }
  }

  return examples;
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const shuffled = [...array];
  let currentSeed = seed;

  const random = () => {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    return currentSeed / 233280;
  };

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

async function exportDataset(examples: TrainingExample[], outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });

  // Shuffle and split
  const shuffled = shuffleWithSeed(examples, 42);
  const trainEnd = Math.floor(shuffled.length * 0.8);
  const valEnd = Math.floor(shuffled.length * 0.9);

  const train = shuffled.slice(0, trainEnd);
  const validation = shuffled.slice(trainEnd, valEnd);
  const test = shuffled.slice(valEnd);

  // Write JSONL files
  const writeJsonl = async (data: TrainingExample[], filename: string) => {
    const lines = data.map((ex) => JSON.stringify(ex));
    await fs.writeFile(path.join(outputDir, filename), lines.join('\n'));
  };

  await writeJsonl(train, 'train.jsonl');
  await writeJsonl(validation, 'validation.jsonl');
  await writeJsonl(test, 'test.jsonl');

  // Write label map
  const tools = [...new Set(examples.flatMap((e) => e.selected_tools))].sort();
  const labelMap: Record<string, number> = {};
  tools.forEach((tool, idx) => {
    labelMap[tool] = idx;
  });
  await fs.writeFile(
    path.join(outputDir, 'label_map.json'),
    JSON.stringify(labelMap, null, 2)
  );

  // Write metadata
  const metadata = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    splits: {
      train: train.length,
      validation: validation.length,
      test: test.length,
    },
    totalExamples: examples.length,
    uniqueTools: tools.length,
    tools: tools,
  };
  await fs.writeFile(
    path.join(outputDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  console.log(`
Dataset exported to ${outputDir}:
  - train.jsonl: ${train.length} examples
  - validation.jsonl: ${validation.length} examples
  - test.jsonl: ${test.length} examples
  - label_map.json: ${tools.length} tools
  - metadata.json
`);
}

// ============================================================================
// MAIN
// ============================================================================

export async function generateFTISTrainingData(options: {
  outputDir?: string;
  examplesPerTool?: number;
  includeTypos?: boolean;
  includeMultiTool?: boolean;
} = {}): Promise<void> {
  const config: GenerationConfig = {
    outputDir: options.outputDir || './data/ftis-training',
    examplesPerTool: options.examplesPerTool || 50,
    includeTypos: options.includeTypos ?? true,
    includeMultiTool: options.includeMultiTool ?? true,
  };

  console.log('FTIS Training Data Generator');
  console.log('============================');
  console.log(`Config: ${JSON.stringify(config, null, 2)}`);

  const examples = await generateTrainingData(config);
  console.log(`Generated ${examples.length} total examples`);

  await exportDataset(examples, config.outputDir);
  console.log('Done!');
}

// CLI entry point
if (process.argv[1]?.includes('generate-training-data')) {
  const outputDir = process.argv.find((a) => a.startsWith('--output='))?.split('=')[1];
  const examplesPerTool = parseInt(
    process.argv.find((a) => a.startsWith('--examples='))?.split('=')[1] || '50',
    10
  );

  generateFTISTrainingData({
    outputDir,
    examplesPerTool,
    includeTypos: true,
    includeMultiTool: true,
  }).catch(console.error);
}
