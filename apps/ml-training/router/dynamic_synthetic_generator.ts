#!/usr/bin/env npx tsx
/**
 * Dynamic Synthetic LLM Conversation Generator
 *
 * Uses an LLM to generate realistic conversation variations for router validation.
 * This approach:
 * 1. Generates diverse, realistic queries for each tool category
 * 2. Creates adversarial edge cases programmatically
 * 3. Identifies patterns that fail routing
 * 4. Builds training data for gaps
 *
 * @module apps/ml-training/router/dynamic_synthetic_generator
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Initialize Gemini
const genai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// Rate limiting helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Track API calls for rate limiting
let lastApiCall = 0;
const MIN_API_INTERVAL_MS = 7000; // 7 seconds between calls (10 RPM limit)

async function rateLimitedGenerate(prompt: string): Promise<string> {
  const now = Date.now();
  const elapsed = now - lastApiCall;
  if (elapsed < MIN_API_INTERVAL_MS) {
    await sleep(MIN_API_INTERVAL_MS - elapsed);
  }
  lastApiCall = Date.now();

  const response = await genai.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: prompt,
  });

  return response.text || '';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// TOOL DEFINITIONS (What we're testing)
// ============================================================================

interface ToolCategory {
  name: string;
  tools: string[];
  description: string;
  examplePhrases: string[];
}

const TOOL_CATEGORIES: ToolCategory[] = [
  {
    name: 'music',
    tools: ['playMusic', 'music_play', 'spotify_play'],
    description: 'Playing music, songs, playlists, genres, artists',
    examplePhrases: ['play some jazz', 'put on music', 'I want to listen to rock'],
  },
  {
    name: 'pause_music',
    tools: ['pauseMusic'],
    description: 'Pausing or stopping music playback',
    examplePhrases: ['pause the music', 'stop playing', 'silence please'],
  },
  {
    name: 'weather',
    tools: ['getWeather', 'weatherForecast'],
    description: 'Weather conditions, temperature, forecast',
    examplePhrases: ["what's the weather", 'will it rain', 'temperature outside'],
  },
  {
    name: 'create_event',
    tools: ['createCalendarEvent', 'scheduleEvent'],
    description: 'Creating calendar events, meetings, appointments',
    examplePhrases: ['schedule a meeting', 'add to my calendar', 'book an appointment'],
  },
  {
    name: 'get_events',
    tools: ['getCalendarEvents', 'checkAvailability'],
    description: 'Checking calendar, viewing schedule, availability',
    examplePhrases: ["what's on my calendar", 'am I free tomorrow', 'check my schedule'],
  },
  {
    name: 'reminder',
    tools: ['createReminder', 'setReminder'],
    description: 'Setting reminders for tasks or events',
    examplePhrases: ['remind me to', 'set a reminder', "don't let me forget"],
  },
  {
    name: 'alarm',
    tools: ['setAlarm', 'createAlarm'],
    description: 'Setting alarms to wake up or for specific times',
    examplePhrases: ['set an alarm', 'wake me up at', 'alarm for 7am'],
  },
  {
    name: 'timer',
    tools: ['setTimer', 'createTimer'],
    description: 'Setting countdown timers',
    examplePhrases: ['set a timer for', '10 minute timer', 'countdown 5 minutes'],
  },
  {
    name: 'call',
    tools: ['callContact', 'makeCall'],
    description: 'Making phone calls to contacts',
    examplePhrases: ['call mom', 'phone Sarah', 'dial John'],
  },
  {
    name: 'message',
    tools: ['sendMessage', 'sendSMS', 'textContact'],
    description: 'Sending text messages or SMS',
    examplePhrases: ['text mom', 'send a message to', 'sms John hello'],
  },
  {
    name: 'log_habit',
    tools: ['logHabit', 'trackHabit', 'markHabitComplete'],
    description: 'Logging or tracking habit completion',
    examplePhrases: ['log my workout', 'mark meditation done', 'I did my habit'],
  },
  {
    name: 'habit_progress',
    tools: ['getHabitProgress', 'habitStats', 'viewStreak'],
    description: 'Viewing habit progress, streaks, statistics',
    examplePhrases: ['how am I doing with habits', 'show my streak', 'habit progress'],
  },
  {
    name: 'news',
    tools: ['getNews', 'headlines'],
    description: 'Getting news headlines and updates',
    examplePhrases: ['give me the news', 'headlines today', "what's happening in the world"],
  },
  {
    name: 'save_memory',
    tools: ['rememberThis', 'saveMemory', 'storeInfo'],
    description: 'Saving information for later recall',
    examplePhrases: ['remember this', 'save that', 'note that down'],
  },
  {
    name: 'search',
    tools: ['search', 'webSearch', 'lookup'],
    description: 'Searching the web for information',
    examplePhrases: ['search for', 'look up', 'find information about'],
  },
];

// ============================================================================
// LLM GENERATION
// ============================================================================

interface GeneratedQuery {
  query: string;
  category: string;
  tools: string[];
  difficulty: 'easy' | 'medium' | 'hard' | 'adversarial';
  reasoning: string;
}

async function generateQueriesForCategory(
  category: ToolCategory,
  count: number = 10,
  difficulty: 'easy' | 'medium' | 'hard' | 'adversarial' = 'medium'
): Promise<GeneratedQuery[]> {
  const difficultyPrompts = {
    easy: `Generate ${count} EASY, straightforward queries that clearly indicate the user wants to ${category.description}.
These should use obvious keywords and be unambiguous.`,

    medium: `Generate ${count} MEDIUM difficulty queries that indicate the user wants to ${category.description}.
These should be natural conversational phrases that a real person might say, with some variety in phrasing.`,

    hard: `Generate ${count} HARD queries that subtly indicate the user wants to ${category.description}.
These should:
- Use indirect language
- Be conversational and casual
- Avoid obvious keywords
- Be the kind of thing a real person would say in passing`,

    adversarial: `Generate ${count} ADVERSARIAL queries that should route to ${category.description} but are tricky because:
- They use words that could be confused with other intents
- They're very short (1-3 words)
- They're embedded in longer casual conversation
- They use slang, abbreviations, or colloquialisms
- They might be mistaken for open conversation`,
  };

  const prompt = `You are generating test data for a voice assistant intent router.

CATEGORY: ${category.name}
TOOLS: ${category.tools.join(', ')}
DESCRIPTION: ${category.description}
EXAMPLE PHRASES: ${category.examplePhrases.join(', ')}

${difficultyPrompts[difficulty]}

IMPORTANT RULES:
1. Each query should DEFINITELY require this tool category (not be ambiguous)
2. Vary the sentence structure, length, and style
3. Include natural speech patterns (contractions, filler words sometimes)
4. Don't use the exact example phrases - generate new variations
5. Make them sound like real voice assistant queries

Return a JSON array with this structure:
[
  {
    "query": "the natural language query",
    "reasoning": "brief explanation of why this maps to ${category.name}"
  }
]

Return ONLY the JSON array, no other text.`;

  try {
    const text = await rateLimitedGenerate(prompt);
    // Extract JSON from response (may have markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((item: { query: string; reasoning: string }) => ({
      query: item.query,
      category: category.name,
      tools: category.tools,
      difficulty,
      reasoning: item.reasoning,
    }));
  } catch (error) {
    console.error(`Error generating queries for ${category.name}:`, error);
    return [];
  }
}

async function generateOpenIntentQueries(count: number = 20): Promise<GeneratedQuery[]> {
  const prompt = `You are generating test data for a voice assistant intent router.

Generate ${count} queries that should be classified as OPEN INTENT (general conversation, not tool calls).

These should include:
- Greetings and small talk
- Emotional expressions
- Questions about the assistant itself
- General conversation that doesn't require any tool
- Statements that are just sharing information

IMPORTANT: These should NOT require any tool action - they're just conversation.

Return a JSON array with this structure:
[
  {
    "query": "the natural language query",
    "reasoning": "why this is open conversation, not a tool call"
  }
]

Return ONLY the JSON array, no other text.`;

  try {
    const text = await rateLimitedGenerate(prompt);
    // Extract JSON from response (may have markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((item: { query: string; reasoning: string }) => ({
      query: item.query,
      category: 'OPEN',
      tools: [],
      difficulty: 'medium' as const,
      reasoning: item.reasoning,
    }));
  } catch (error) {
    console.error('Error generating open intent queries:', error);
    return [];
  }
}

// ============================================================================
// ROUTER VALIDATION
// ============================================================================

interface ValidationResult {
  query: string;
  expected: {
    category: string;
    tools: string[];
  };
  actual: {
    toolId: string | null;
    confidence: number;
    isOpenIntent: boolean;
  };
  passed: boolean;
  difficulty: string;
  reasoning: string;
}

async function validateWithRouter(
  queries: GeneratedQuery[]
): Promise<ValidationResult[]> {
  // Import routers
  const { routeHybrid } = await import(
    '../../../src/tools/semantic-router/integration/ftis-hybrid-router.js'
  );
  const { initializeFtisRouter } = await import(
    '../../../src/tools/semantic-router/integration/ftis-unified-router.js'
  );

  // Initialize
  await initializeFtisRouter();

  const results: ValidationResult[] = [];

  for (const query of queries) {
    const result = await routeHybrid(query.query, { threshold: 0.05 });

    // Check if result matches expected
    let passed = false;
    if (query.category === 'OPEN') {
      passed = result.isOpenIntent;
    } else {
      passed = query.tools.includes(result.toolId || '');
    }

    results.push({
      query: query.query,
      expected: {
        category: query.category,
        tools: query.tools,
      },
      actual: {
        toolId: result.toolId,
        confidence: result.hybridScore,
        isOpenIntent: result.isOpenIntent,
      },
      passed,
      difficulty: query.difficulty,
      reasoning: query.reasoning,
    });
  }

  return results;
}

// ============================================================================
// ANALYSIS & REPORTING
// ============================================================================

interface AnalysisReport {
  totalQueries: number;
  passed: number;
  failed: number;
  accuracy: number;
  byDifficulty: Record<string, { total: number; passed: number; accuracy: number }>;
  byCategory: Record<string, { total: number; passed: number; accuracy: number }>;
  failures: ValidationResult[];
  suggestedTrainingData: Array<{ input: string; labels: string[] }>;
}

function analyzeResults(results: ValidationResult[]): AnalysisReport {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  // By difficulty
  const byDifficulty: Record<string, { total: number; passed: number; accuracy: number }> = {};
  for (const result of results) {
    if (!byDifficulty[result.difficulty]) {
      byDifficulty[result.difficulty] = { total: 0, passed: 0, accuracy: 0 };
    }
    byDifficulty[result.difficulty].total++;
    if (result.passed) byDifficulty[result.difficulty].passed++;
  }
  for (const key of Object.keys(byDifficulty)) {
    byDifficulty[key].accuracy = (byDifficulty[key].passed / byDifficulty[key].total) * 100;
  }

  // By category
  const byCategory: Record<string, { total: number; passed: number; accuracy: number }> = {};
  for (const result of results) {
    const cat = result.expected.category;
    if (!byCategory[cat]) {
      byCategory[cat] = { total: 0, passed: 0, accuracy: 0 };
    }
    byCategory[cat].total++;
    if (result.passed) byCategory[cat].passed++;
  }
  for (const key of Object.keys(byCategory)) {
    byCategory[key].accuracy = (byCategory[key].passed / byCategory[key].total) * 100;
  }

  // Failures
  const failures = results.filter((r) => !r.passed);

  // Generate training data from failures
  const suggestedTrainingData = failures
    .filter((f) => f.expected.category !== 'OPEN')
    .map((f) => ({
      input: f.query,
      labels: f.expected.tools,
    }));

  return {
    totalQueries: results.length,
    passed,
    failed,
    accuracy: (passed / results.length) * 100,
    byDifficulty,
    byCategory,
    failures,
    suggestedTrainingData,
  };
}

function printReport(report: AnalysisReport): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 DYNAMIC SYNTHETIC VALIDATION REPORT');
  console.log('='.repeat(80));

  console.log(`\n📈 OVERALL: ${report.passed}/${report.totalQueries} (${report.accuracy.toFixed(1)}%)`);

  console.log('\n📊 BY DIFFICULTY:');
  for (const [diff, stats] of Object.entries(report.byDifficulty)) {
    const bar = '█'.repeat(Math.round(stats.accuracy / 5)) + '░'.repeat(20 - Math.round(stats.accuracy / 5));
    console.log(`   ${diff.padEnd(12)} ${bar} ${stats.accuracy.toFixed(1)}% (${stats.passed}/${stats.total})`);
  }

  console.log('\n📊 BY CATEGORY:');
  const sortedCategories = Object.entries(report.byCategory).sort((a, b) => a[1].accuracy - b[1].accuracy);
  for (const [cat, stats] of sortedCategories) {
    const bar = '█'.repeat(Math.round(stats.accuracy / 5)) + '░'.repeat(20 - Math.round(stats.accuracy / 5));
    const status = stats.accuracy === 100 ? '✅' : stats.accuracy >= 80 ? '⚠️' : '❌';
    console.log(`   ${status} ${cat.padEnd(15)} ${bar} ${stats.accuracy.toFixed(1)}% (${stats.passed}/${stats.total})`);
  }

  if (report.failures.length > 0) {
    console.log('\n❌ FAILURES:');
    for (const failure of report.failures.slice(0, 20)) {
      console.log(`   "${failure.query.slice(0, 50)}..."`);
      console.log(`      Expected: ${failure.expected.category} (${failure.expected.tools.join(', ')})`);
      console.log(`      Got:      ${failure.actual.isOpenIntent ? 'OPEN_INTENT' : failure.actual.toolId} (${(failure.actual.confidence * 100).toFixed(0)}%)`);
      console.log(`      Reason:   ${failure.reasoning}`);
    }
    if (report.failures.length > 20) {
      console.log(`   ... and ${report.failures.length - 20} more failures`);
    }
  }

  if (report.suggestedTrainingData.length > 0) {
    console.log('\n📝 SUGGESTED TRAINING DATA (add to hard_negatives):');
    for (const item of report.suggestedTrainingData.slice(0, 10)) {
      console.log(`   ${JSON.stringify(item)}`);
    }
  }

  console.log('\n' + '='.repeat(80));
}

// ============================================================================
// MAIN
// ============================================================================

// CLI argument parsing
const args = process.argv.slice(2);
const QUICK_MODE = args.includes('--quick');
const VALIDATE_ONLY = args.includes('--validate-only');
const GENERATE_ONLY = args.includes('--generate-only');
const FOCUS_CATEGORY = args.find(a => a.startsWith('--category='))?.split('=')[1];

async function main() {
  console.log('🧪 Dynamic Synthetic LLM Conversation Generator\n');

  if (QUICK_MODE) {
    console.log('⚡ QUICK MODE: Generating minimal test set\n');
  }
  if (VALIDATE_ONLY) {
    console.log('🔄 VALIDATE-ONLY: Using existing queries\n');
  }
  if (FOCUS_CATEGORY) {
    console.log(`🎯 FOCUS: Only testing ${FOCUS_CATEGORY} category\n`);
  }

  let allQueries: GeneratedQuery[] = [];
  const queriesPath = path.join(__dirname, 'data', 'dynamic_synthetic_queries.json');

  // Load existing queries if validate-only
  if (VALIDATE_ONLY && fs.existsSync(queriesPath)) {
    console.log('📂 Loading existing queries from file...');
    allQueries = JSON.parse(fs.readFileSync(queriesPath, 'utf-8'));
    console.log(`   ✓ Loaded ${allQueries.length} queries`);
  } else if (!VALIDATE_ONLY) {
    // Generate queries
    const categoriesToTest = FOCUS_CATEGORY
      ? TOOL_CATEGORIES.filter(c => c.name === FOCUS_CATEGORY)
      : TOOL_CATEGORIES;

    const difficulties: Array<'easy' | 'medium' | 'hard' | 'adversarial'> =
      QUICK_MODE ? ['medium', 'adversarial'] : ['easy', 'medium', 'hard', 'adversarial'];

    const queriesPerDifficulty = QUICK_MODE ? 3 : 5;

    for (const category of categoriesToTest) {
      console.log(`\n📝 Generating queries for: ${category.name}`);
      for (const difficulty of difficulties) {
        process.stdout.write(`   ${difficulty}...`);
        const queries = await generateQueriesForCategory(category, queriesPerDifficulty, difficulty);
        allQueries.push(...queries);
        console.log(` ✓ (${queries.length} queries)`);
      }
    }

    // Generate open intent queries
    if (!FOCUS_CATEGORY) {
      console.log('\n📝 Generating OPEN intent queries...');
      const openCount = QUICK_MODE ? 10 : 30;
      const openQueries = await generateOpenIntentQueries(openCount);
      allQueries.push(...openQueries);
      console.log(`   ✓ (${openQueries.length} queries)`);
    }

    console.log(`\n📊 Total queries generated: ${allQueries.length}`);

    // Save generated queries
    fs.writeFileSync(queriesPath, JSON.stringify(allQueries, null, 2));
    console.log(`💾 Saved queries to: ${queriesPath}`);
  }

  if (GENERATE_ONLY) {
    console.log('\n✅ Generation complete (--generate-only mode)');
    return;
  }

  if (allQueries.length === 0) {
    console.log('\n❌ No queries to validate. Run without --validate-only first.');
    return;
  }

  // Filter by category if specified
  if (FOCUS_CATEGORY && VALIDATE_ONLY) {
    allQueries = allQueries.filter(q => q.category === FOCUS_CATEGORY || q.category === 'OPEN');
    console.log(`   Filtered to ${allQueries.length} queries for ${FOCUS_CATEGORY}`);
  }

  // Validate with router
  console.log('\n🔄 Validating with hybrid router...');
  const results = await validateWithRouter(allQueries);

  // Analyze results
  const report = analyzeResults(results);
  printReport(report);

  // Save full report
  const reportPath = path.join(__dirname, 'data', 'dynamic_validation_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Full report saved to: ${reportPath}`);

  // Save suggested training data
  if (report.suggestedTrainingData.length > 0) {
    const trainingPath = path.join(__dirname, 'data', 'suggested_training_data.jsonl');
    const jsonl = report.suggestedTrainingData.map((d) => JSON.stringify(d)).join('\n');
    fs.writeFileSync(trainingPath, jsonl);
    console.log(`💾 Suggested training data saved to: ${trainingPath}`);
  }

  // Summary
  const targetAccuracy = 99;
  const gap = targetAccuracy - report.accuracy;
  if (gap > 0) {
    console.log(`\n🎯 Gap to ${targetAccuracy}%: ${gap.toFixed(1)}%`);
    console.log(`   Need to fix ~${Math.ceil((gap / 100) * report.totalQueries)} more queries`);
  } else {
    console.log(`\n🎉 TARGET ACHIEVED! ${report.accuracy.toFixed(1)}% >= ${targetAccuracy}%`);
  }
}

main().catch(console.error);
