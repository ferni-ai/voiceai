/**
 * Comprehensive Synthetic Training Data Generator
 *
 * Generates synthetic training examples for all 880+ semantic tool mappings.
 * Creates diverse query patterns, variations, and edge cases for ONNX model training.
 *
 * Usage:
 *   npx tsx scripts/generate-ftis-training-data.ts
 *
 * @module tools/intelligence/router/training/synthetic-generator
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import type { TrainingExample, HardNegative, SyntheticGenerationConfig } from './types.js';
import { getAllMappings } from '../../../semantic-router/domain-bridge.js';

const log = createLogger({ module: 'ftis:synthetic-generator' });

// ============================================================================
// TYPES
// ============================================================================

export interface SemanticToolMapping {
  semanticId: string;
  domainToolId: string;
  hasArgTransform: boolean;
}

export interface GenerationResult {
  examples: TrainingExample[];
  hardNegatives: HardNegative[];
  stats: GenerationStats;
}

export interface GenerationStats {
  totalTools: number;
  totalExamples: number;
  examplesPerTool: number;
  hardNegatives: number;
  generationTimeMs: number;
  coverage: {
    domains: number;
    personas: number;
    timeSlots: number;
  };
}

// ============================================================================
// QUERY TEMPLATES BY CATEGORY
// ============================================================================

/**
 * Query templates organized by semantic tool category.
 * Each template has {placeholders} that get filled with context.
 */
const QUERY_TEMPLATES: Record<string, string[]> = {
  // Music & Entertainment
  music: [
    'Play some {mood} music',
    'Put on {genre}',
    'I want to listen to {genre}',
    'Can you play something {mood}?',
    'Music please',
    'Play my favorite songs',
    "What's playing?",
    'Skip this song',
    'Turn up the volume',
    'I need some background music',
  ],

  // Weather
  weather: [
    "What's the weather like?",
    "What's it like outside?",
    'Is it going to rain today?',
    'Do I need an umbrella?',
    "What's the temperature?",
    'Weather forecast for {location}',
    'Will it be sunny tomorrow?',
    "How's the weather this weekend?",
  ],

  // Calendar & Scheduling
  calendar: [
    'Schedule a meeting {timeRef}',
    "What's on my calendar?",
    'Am I free {timeRef}?',
    'Book time for {activity}',
    'Cancel my {timeRef} appointment',
    'Remind me about {event}',
    'When is my next meeting?',
    "What's my schedule look like?",
    'Move my meeting to {timeRef}',
    'Add {event} to my calendar',
  ],

  // Alarms & Timers
  alarm: [
    'Set an alarm for {time}',
    'Wake me up at {time}',
    'Set a timer for {duration}',
    '{duration} timer',
    'Remind me in {duration}',
    'Cancel my alarm',
    'Snooze',
    "What alarms do I have set?",
  ],

  // Tasks & Lists
  task: [
    'Add {item} to my list',
    "What's on my todo list?",
    'Remind me to {action}',
    'Create a list for {purpose}',
    'Mark {task} as done',
    "What do I need to do?",
    'Add a task: {task}',
    'Show my tasks',
  ],

  // Communication
  communication: [
    'Call {person}',
    'Text {person}',
    'Send a message to {person}',
    'Read my messages',
    'Who called?',
    'Call back {person}',
    'Send {person} a voice memo',
    'Message {person} saying {message}',
  ],

  // Habits & Routines
  habit: [
    'Track my {habit}',
    'Did I {habit} today?',
    'How is my {habit} streak?',
    'Start my morning routine',
    'Log my {habit}',
    "What habits haven't I done?",
    'Skip {habit} today',
    'Show my habit progress',
  ],

  // Health & Wellness
  health: [
    'How did I sleep?',
    'Track my {metric}',
    'Log my symptoms',
    'Remind me to take my {medication}',
    'What should I eat?',
    'Guide me through a breathing exercise',
    'I need to relax',
    'Help me meditate',
  ],

  // Finance
  finance: [
    "What's my balance?",
    'Track this expense: {amount}',
    "How much have I spent on {category}?",
    'Budget check',
    'Add {amount} to my savings',
    'Bill reminder for {bill}',
    'Financial summary',
  ],

  // Home
  home: [
    'Turn on the lights',
    'Set temperature to {temp}',
    'Lock the doors',
    'Is the {device} on?',
    'Start the {appliance}',
    'Security status',
    'Turn off everything',
  ],

  // Grief & Support
  grief: [
    "I'm feeling sad about {loss}",
    "I miss {person}",
    "I'm grieving",
    "Today is hard because of {reason}",
    "I need support",
    "Can we talk about loss?",
  ],

  // Career
  career: [
    'Help me prepare for my interview',
    "I'm stressed about work",
    'Career advice',
    'Should I take this job?',
    'How do I ask for a raise?',
    'Work-life balance tips',
  ],

  // Decisions
  decision: [
    'Help me decide between {optionA} and {optionB}',
    "I can't decide what to do",
    'Pros and cons of {option}',
    'Should I {action}?',
    'Walk me through this decision',
  ],

  // Meaning & Purpose
  meaning: [
    'What should I focus on in life?',
    "I'm feeling lost",
    'Help me find purpose',
    'What matters most?',
    "I'm questioning everything",
    'Life advice',
  ],

  // Connection
  connection: [
    "I'm feeling lonely",
    'How do I make friends?',
    'Help me reach out to {person}',
    "I miss my friends",
    'Relationship advice',
  ],

  // Crisis
  crisis: [
    "I'm not okay",
    "I need help right now",
    "I'm having a panic attack",
    "Things are really hard",
    "I don't know what to do",
  ],

  // General Coaching
  coaching: [
    'I need to talk',
    'Can we chat?',
    "How are you?",
    "What should I do about {situation}?",
    'Give me advice',
    'Help me think through this',
  ],

  // Handoffs
  handoff: [
    'I want to talk to Maya',
    'Can Peter help me research this?',
    'Switch to Alex',
    'Get Jordan for event planning',
    "I'd like Nayan's perspective",
  ],

  // Research
  research: [
    'Look up {topic}',
    'Find information about {topic}',
    'Research {topic} for me',
    'What do you know about {topic}?',
    'Deep dive on {topic}',
  ],

  // Learning
  learning: [
    'Help me learn {skill}',
    'Study tips for {subject}',
    'Explain {concept}',
    'Teach me about {topic}',
    'Learning path for {skill}',
  ],

  // Travel
  travel: [
    'Plan a trip to {destination}',
    'Flight options to {destination}',
    'Hotel recommendations in {location}',
    'Things to do in {destination}',
    'Travel checklist',
  ],

  // Events
  event: [
    'Plan a party for {occasion}',
    "It's {person}'s birthday soon",
    'Anniversary ideas',
    'Gift suggestions for {person}',
    'Event planning help',
  ],

  // Books & Media
  books: [
    'Recommend a book about {topic}',
    'What should I read next?',
    "I finished {book}",
    'Book club suggestions',
    'Similar books to {book}',
  ],

  // Games
  games: [
    "Let's play a game",
    '20 questions',
    'Trivia time',
    'Tell me a riddle',
    "I'm bored, entertain me",
  ],
};

// ============================================================================
// PLACEHOLDER VALUES
// ============================================================================

const PLACEHOLDER_VALUES: Record<string, string[]> = {
  mood: ['relaxing', 'upbeat', 'chill', 'energetic', 'calm', 'happy', 'sad', 'focused'],
  genre: ['jazz', 'classical', 'rock', 'pop', 'indie', 'ambient', 'lo-fi', 'electronic'],
  location: ['San Francisco', 'New York', 'London', 'Paris', 'Tokyo', 'here', 'home'],
  timeRef: ['tomorrow', 'next week', 'Friday', 'at 3pm', 'this afternoon', 'Monday morning'],
  time: ['7am', '8:30', '6 in the morning', 'noon', '10pm'],
  duration: ['10 minutes', '30 minutes', '1 hour', '5 minutes', '2 hours'],
  activity: ['exercise', 'reading', 'meditation', 'work', 'lunch', 'deep work'],
  event: ['dentist appointment', 'team meeting', 'dinner with Sarah', 'workout'],
  item: ['milk', 'groceries', 'birthday card', 'book to return', 'call mom'],
  action: ['buy flowers', 'call the dentist', 'submit the report', 'water plants'],
  task: ['finish report', 'email John', 'grocery shopping', 'workout'],
  purpose: ['groceries', 'trip packing', 'home projects', 'gift ideas'],
  person: ['Mom', 'John', 'Sarah', 'my sister', 'David', 'the team'],
  message: ["I'll be late", "thinking of you", 'call me back', 'miss you'],
  habit: ['meditation', 'exercise', 'reading', 'journaling', 'water intake', 'sleep'],
  metric: ['weight', 'steps', 'water', 'mood', 'energy'],
  medication: ['vitamins', 'prescription', 'supplements'],
  amount: ['$50', '$120', '$25.99', '$500'],
  category: ['food', 'entertainment', 'transportation', 'shopping'],
  bill: ['electric', 'internet', 'rent', 'subscription'],
  temp: ['72', '68', '70 degrees', 'cooler', 'warmer'],
  device: ['TV', 'air conditioner', 'heater', 'fan'],
  appliance: ['dishwasher', 'laundry', 'coffee maker', 'robot vacuum'],
  loss: ['my grandmother', 'my dog', 'my job', 'my relationship'],
  reason: ["it's the anniversary", 'memories', 'a tough day'],
  optionA: ['job offer A', 'staying', 'the safer choice'],
  optionB: ['job offer B', 'leaving', 'taking a risk'],
  option: ['moving', 'changing careers', 'this opportunity'],
  situation: ['my relationship', 'work stress', 'family drama', 'this decision'],
  topic: ['investing', 'AI', 'history', 'psychology', 'meditation'],
  skill: ['Spanish', 'piano', 'coding', 'cooking', 'public speaking'],
  subject: ['math', 'physics', 'languages', 'history'],
  concept: ['blockchain', 'mindfulness', 'stoicism', 'habit formation'],
  destination: ['Italy', 'Japan', 'Hawaii', 'Paris', 'Costa Rica'],
  occasion: ['birthday', 'graduation', 'anniversary', 'retirement'],
  book: ['Atomic Habits', 'The Alchemist', 'Sapiens', 'Deep Work'],
};

// ============================================================================
// SEMANTIC ID TO CATEGORY MAPPING
// ============================================================================

/**
 * Maps semantic tool ID prefixes to query template categories
 */
function getQueryCategory(semanticId: string): string {
  const prefix = semanticId.split('_')[0];

  const categoryMap: Record<string, string> = {
    music: 'music',
    spotify: 'music',
    audio: 'music',
    weather: 'weather',
    calendar: 'calendar',
    schedule: 'calendar',
    meeting: 'calendar',
    alarm: 'alarm',
    timer: 'alarm',
    reminder: 'alarm',
    task: 'task',
    todo: 'task',
    list: 'task',
    call: 'communication',
    text: 'communication',
    message: 'communication',
    contact: 'communication',
    email: 'communication',
    habit: 'habit',
    routine: 'habit',
    streak: 'habit',
    health: 'health',
    sleep: 'health',
    wellness: 'health',
    meditation: 'health',
    breathe: 'health',
    finance: 'finance',
    budget: 'finance',
    expense: 'finance',
    home: 'home',
    light: 'home',
    thermostat: 'home',
    smarthome: 'home',
    sonos: 'home',
    grief: 'grief',
    loss: 'grief',
    career: 'career',
    job: 'career',
    work: 'career',
    decision: 'decision',
    meaning: 'meaning',
    purpose: 'meaning',
    wisdom: 'meaning',
    connection: 'connection',
    lonely: 'connection',
    friend: 'connection',
    crisis: 'crisis',
    emergency: 'crisis',
    handoff: 'handoff',
    transfer: 'handoff',
    navigate: 'handoff',
    research: 'research',
    learn: 'learning',
    study: 'learning',
    travel: 'travel',
    trip: 'travel',
    event: 'event',
    party: 'event',
    birthday: 'event',
    milestone: 'event',
    book: 'books',
    read: 'books',
    game: 'games',
    play: 'games',
  };

  return categoryMap[prefix] || 'coaching';
}

// ============================================================================
// GENERATOR CLASS
// ============================================================================

export class SyntheticTrainingGenerator {
  private config: SyntheticGenerationConfig;
  private examples: TrainingExample[] = [];
  private hardNegatives: HardNegative[] = [];

  constructor(config: Partial<SyntheticGenerationConfig> = {}) {
    this.config = {
      examplesPerTool: config.examplesPerTool ?? 12,
      paraphraseCount: config.paraphraseCount ?? 3,
      includeMultiTool: config.includeMultiTool ?? true,
      temperature: config.temperature ?? 0.7,
      personaWeights: config.personaWeights ?? {
        ferni: 0.3,
        maya: 0.2,
        peter: 0.15,
        alex: 0.15,
        jordan: 0.1,
        nayan: 0.1,
      },
      timeWeights: config.timeWeights ?? {
        morning: 0.3,
        afternoon: 0.25,
        evening: 0.3,
        night: 0.15,
      },
    };
  }

  // ==========================================================================
  // MAIN GENERATION
  // ==========================================================================

  /**
   * Generate synthetic training data for all semantic tool mappings.
   */
  async generateAll(): Promise<GenerationResult> {
    const startTime = Date.now();
    this.examples = [];
    this.hardNegatives = [];

    // Load all semantic tool mappings
    const mappings = this.loadSemanticMappings();
    log.info({ totalMappings: mappings.length }, 'Loaded semantic tool mappings');

    // Generate examples for each mapping
    for (const mapping of mappings) {
      const toolExamples = this.generateForMapping(mapping);
      this.examples.push(...toolExamples);
    }

    // Generate hard negatives
    this.generateHardNegatives(mappings);

    // Generate multi-tool sequences
    if (this.config.includeMultiTool) {
      const multiToolExamples = this.generateMultiToolExamples(mappings);
      this.examples.push(...multiToolExamples);
    }

    const stats: GenerationStats = {
      totalTools: mappings.length,
      totalExamples: this.examples.length,
      examplesPerTool: this.examples.length / mappings.length,
      hardNegatives: this.hardNegatives.length,
      generationTimeMs: Date.now() - startTime,
      coverage: {
        domains: new Set(mappings.map((m) => m.semanticId.split('_')[0])).size,
        personas: Object.keys(this.config.personaWeights).length,
        timeSlots: Object.keys(this.config.timeWeights).length,
      },
    };

    log.info(stats, 'Synthetic data generation complete');

    return {
      examples: this.examples,
      hardNegatives: this.hardNegatives,
      stats,
    };
  }

  // ==========================================================================
  // MAPPING LOADING
  // ==========================================================================

  /**
   * Load semantic tool mappings from domain bridge.
   */
  private loadSemanticMappings(): SemanticToolMapping[] {
    const allMappings = getAllMappings();
    const result: SemanticToolMapping[] = [];

    for (const [semanticId, mapping] of Object.entries(allMappings)) {
      result.push({
        semanticId,
        domainToolId: mapping.domainToolId,
        hasArgTransform: !!mapping.transformArgs,
      });
    }

    return result;
  }

  // ==========================================================================
  // EXAMPLE GENERATION
  // ==========================================================================

  /**
   * Generate examples for a single semantic tool mapping.
   */
  private generateForMapping(mapping: SemanticToolMapping): TrainingExample[] {
    const examples: TrainingExample[] = [];
    const category = getQueryCategory(mapping.semanticId);
    const templates = QUERY_TEMPLATES[category] || QUERY_TEMPLATES.coaching;

    for (let i = 0; i < this.config.examplesPerTool; i++) {
      // Select a random template
      const template = templates[Math.floor(Math.random() * templates.length)];

      // Fill in placeholders
      const query = this.fillTemplate(template);

      // Generate variations
      const queries = [query, ...this.generateVariations(query)];

      for (const q of queries.slice(0, this.config.paraphraseCount + 1)) {
        const example = this.createExample(
          mapping.semanticId,
          q,
          mapping.domainToolId
        );
        examples.push(example);
      }
    }

    return examples;
  }

  /**
   * Fill a template with random placeholder values.
   */
  private fillTemplate(template: string): string {
    let result = template;

    for (const [placeholder, values] of Object.entries(PLACEHOLDER_VALUES)) {
      const regex = new RegExp(`\\{${placeholder}\\}`, 'g');
      if (regex.test(result)) {
        const value = values[Math.floor(Math.random() * values.length)];
        result = result.replace(regex, value);
      }
    }

    return result;
  }

  /**
   * Generate variations of a query.
   */
  private generateVariations(query: string): string[] {
    const variations: string[] = [];

    // Add polite prefix
    if (Math.random() > 0.5) {
      variations.push(`Hey, ${query.toLowerCase()}`);
    }

    // Add please
    if (Math.random() > 0.5 && !query.includes('please')) {
      variations.push(`${query}, please`);
    }

    // Question form
    if (!query.includes('?') && Math.random() > 0.5) {
      variations.push(`Can you ${query.toLowerCase()}?`);
    }

    // Casual form
    if (Math.random() > 0.6) {
      variations.push(query.toLowerCase().replace(/[.,!?]/g, ''));
    }

    return variations;
  }

  /**
   * Create a training example.
   */
  private createExample(
    semanticId: string,
    query: string,
    domainToolId: string
  ): TrainingExample {
    // Select persona based on weights
    const personaId = this.selectWeighted(this.config.personaWeights);

    // Select time of day based on weights
    const timeOfDay = this.selectWeighted(this.config.timeWeights) as
      | 'morning'
      | 'afternoon'
      | 'evening'
      | 'night';

    return {
      id: `syn_${semanticId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      query,
      personaId,
      emotion: this.randomEmotion(),
      timeOfDay,
      recentTools: this.randomRecentTools(),
      userAffinities: {},
      selectedTools: [semanticId],
      wasSuccessful: true, // Synthetic data is ground truth
      timestamp: new Date(),
      sessionId: `syn_session_${Date.now()}`,
      userId: `syn_user_${Math.random().toString(36).slice(2, 8)}`,
      source: 'synthetic',
    };
  }

  // ==========================================================================
  // HARD NEGATIVES
  // ==========================================================================

  /**
   * Generate hard negatives from similar tools.
   */
  private generateHardNegatives(mappings: SemanticToolMapping[]): void {
    // Group by category
    const byCategory = new Map<string, SemanticToolMapping[]>();
    for (const mapping of mappings) {
      const category = getQueryCategory(mapping.semanticId);
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(mapping);
    }

    // Create hard negatives within categories
    for (const [category, categoryMappings] of byCategory) {
      if (categoryMappings.length < 2) continue;

      for (let i = 0; i < categoryMappings.length; i++) {
        for (let j = i + 1; j < Math.min(i + 3, categoryMappings.length); j++) {
          const toolA = categoryMappings[i];
          const toolB = categoryMappings[j];

          // Create a query that could be confused between the two
          const templates = QUERY_TEMPLATES[category] || QUERY_TEMPLATES.coaching;
          const template = templates[Math.floor(Math.random() * templates.length)];
          const query = this.fillTemplate(template);

          this.hardNegatives.push({
            originalId: `hn_${toolA.semanticId}_${toolB.semanticId}`,
            query,
            wrongTool: toolB.semanticId,
            correctTool: toolA.semanticId,
            toolSimilarity: 0.8, // Same category = high similarity
            reason: `same_category:${category}`,
          });
        }
      }
    }

    log.debug(
      { hardNegativeCount: this.hardNegatives.length },
      'Generated hard negatives'
    );
  }

  // ==========================================================================
  // MULTI-TOOL EXAMPLES
  // ==========================================================================

  /**
   * Generate examples that involve multiple tools in sequence.
   */
  private generateMultiToolExamples(
    mappings: SemanticToolMapping[]
  ): TrainingExample[] {
    const examples: TrainingExample[] = [];

    // Common multi-tool patterns
    const patterns = [
      {
        query: "What's the weather and set a reminder to bring an umbrella",
        tools: ['weather_current', 'reminder_create'],
      },
      {
        query: 'Play some music and dim the lights',
        tools: ['music_play', 'smarthome_light'],
      },
      {
        query: "Check my calendar and then call John",
        tools: ['calendar_today', 'call_contact'],
      },
      {
        query: 'Track my meditation and log my mood',
        tools: ['habit_track', 'health_mood'],
      },
      {
        query: 'Add milk to my list and set a timer for 30 minutes',
        tools: ['task_add', 'timer_set'],
      },
    ];

    for (const pattern of patterns) {
      // Verify tools exist
      const validTools = pattern.tools.filter((t) =>
        mappings.some((m) => m.semanticId === t)
      );

      if (validTools.length >= 2) {
        const example: TrainingExample = {
          id: `syn_multi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          query: pattern.query,
          personaId: this.selectWeighted(this.config.personaWeights),
          emotion: 'neutral',
          timeOfDay: this.selectWeighted(this.config.timeWeights) as
            | 'morning'
            | 'afternoon'
            | 'evening'
            | 'night',
          recentTools: [],
          userAffinities: {},
          selectedTools: validTools,
          wasSuccessful: true,
          timestamp: new Date(),
          sessionId: `syn_session_${Date.now()}`,
          userId: `syn_user_${Math.random().toString(36).slice(2, 8)}`,
          source: 'synthetic',
        };
        examples.push(example);
      }
    }

    return examples;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Select a value based on weights.
   */
  private selectWeighted(weights: Record<string, number>): string {
    const entries = Object.entries(weights);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let random = Math.random() * total;

    for (const [key, weight] of entries) {
      random -= weight;
      if (random <= 0) return key;
    }

    return entries[0][0];
  }

  /**
   * Generate random emotion.
   */
  private randomEmotion(): string {
    const emotions = [
      'neutral',
      'happy',
      'calm',
      'curious',
      'focused',
      'tired',
      'stressed',
      'excited',
    ];
    return emotions[Math.floor(Math.random() * emotions.length)];
  }

  /**
   * Generate random recent tools.
   */
  private randomRecentTools(): string[] {
    if (Math.random() > 0.6) return [];

    const tools = [
      'weather_current',
      'music_play',
      'calendar_today',
      'habit_track',
      'task_list',
    ];
    const count = Math.floor(Math.random() * 3) + 1;
    return tools.slice(0, count);
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  getExamples(): TrainingExample[] {
    return this.examples;
  }

  getHardNegatives(): HardNegative[] {
    return this.hardNegatives;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let generatorInstance: SyntheticTrainingGenerator | null = null;

export function getSyntheticGenerator(): SyntheticTrainingGenerator {
  if (!generatorInstance) {
    generatorInstance = new SyntheticTrainingGenerator();
  }
  return generatorInstance;
}

export function resetSyntheticGenerator(): void {
  generatorInstance = null;
}
