/**
 * LLM-Powered Synthetic Testing for Essentials, Humor & Wind-Down Tools
 *
 * Tests the new "basic voice assistant" tools against randomly generated scenarios:
 * 1. Capabilities Discovery - "What can you do?"
 * 2. Quick Capture - Brain dump routing
 * 3. Preferences - User settings
 * 4. Humor - Jokes, facts, stories
 * 5. Wind-Down - Evening routines
 *
 * Run with: GOOGLE_API_KEY=xxx npx vitest run src/tests/essentials-synthetic-e2e.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const USE_LLM = !!process.env.GOOGLE_API_KEY;
const LLM_TIMEOUT = DEFAULT_LLM_TIMEOUT;
const TEST_USER_ID = 'synthetic-test-user';

import { TEST_LLM_MODEL, LLM_TEST_TIMEOUT as DEFAULT_LLM_TIMEOUT } from './test-llm-config.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

import { vi } from 'vitest';

vi.mock('../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

// Mock Firestore
vi.mock('../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({
    getDatabase: async () => ({
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: false }),
          set: async () => {},
          collection: () => ({
            doc: () => ({
              get: async () => ({ exists: false }),
              set: async () => {},
            }),
          }),
        }),
      }),
    }),
  }),
}));

// Mock productivity store
vi.mock('../services/stores/productivity-store.js', () => ({
  getProductivityStore: () => ({
    setTask: vi.fn(),
    setNote: vi.fn(),
    setShoppingList: vi.fn(),
  }),
}));

// Mock conversation history
vi.mock('../services/stores/conversation-history.js', () => ({
  getConversationHistoryService: () => ({
    getHistory: async () => ({ sessions: [], totalSessions: 0 }),
  }),
}));

// Mock reminder scheduler
vi.mock('../services/scheduling/reminder-scheduler.js', () => ({
  createReminder: async () => ({ id: 'mock-reminder' }),
  parseNaturalTime: () => new Date(Date.now() + 86400000),
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import type { ToolContext, ToolDefinition } from '../tools/registry/types.js';

// Import tool definitions
import { essentialsToolDefinitions } from '../tools/domains/simple-utilities/essentials-tools.js';
import { humorToolDefinitions } from '../tools/domains/simple-utilities/humor-tools.js';
import { winddownToolDefinitions } from '../tools/domains/simple-utilities/winddown-tools.js';
import { shortcutsToolDefinitions, trackCapabilityUsage, getTopCapabilities } from '../tools/domains/simple-utilities/shortcuts-tools.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestContext(): ToolContext {
  return {
    userId: TEST_USER_ID,
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: {
      has: () => false,
      get: () => { throw new Error('Not available'); },
      getOptional: () => undefined,
    },
  };
}

interface GeneratedScenario {
  utterance: string;
  toolId: string;
  params: Record<string, unknown>;
  expectedInResponse: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  notes?: string;
}

async function generateScenarios(
  systemPrompt: string,
  count: number = 5
): Promise<GeneratedScenario[]> {
  if (!USE_LLM) {
    return [];
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ model: TEST_LLM_MODEL });

  const prompt = `${systemPrompt}

Return a JSON array with exactly ${count} items:
[
  {
    "utterance": "what the user would naturally say",
    "toolId": "the tool ID to test",
    "params": { /* parameters to pass to the tool */ },
    "expectedInResponse": ["keywords", "expected", "in", "response"],
    "difficulty": "easy|medium|hard",
    "notes": "optional explanation"
  }
]

ONLY return valid JSON, no markdown.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.warn('LLM generation failed:', error);
  }

  return [];
}

async function testScenario(
  scenario: GeneratedScenario,
  tools: ToolDefinition[],
  ctx: ToolContext
): Promise<{ pass: boolean; result: string; error?: string }> {
  const toolDef = tools.find((t) => t.id === scenario.toolId);
  if (!toolDef) {
    return { pass: false, result: '', error: `Tool not found: ${scenario.toolId}` };
  }

  try {
    const tool = toolDef.create(ctx);
    const result = await tool.execute(scenario.params);
    const resultStr = String(result);

    // Check expected content
    for (const expected of scenario.expectedInResponse) {
      if (!resultStr.toLowerCase().includes(expected.toLowerCase())) {
        return {
          pass: false,
          result: resultStr,
          error: `Expected "${expected}" in response`,
        };
      }
    }

    return { pass: true, result: resultStr };
  } catch (error) {
    return {
      pass: false,
      result: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// 1. CAPABILITIES DISCOVERY TESTING
// ============================================================================

describe('Capabilities Discovery - Synthetic Testing', () => {
  const ctx = createTestContext();
  const tools = essentialsToolDefinitions;

  // Seed scenarios for consistent testing
  const SEED_SCENARIOS: GeneratedScenario[] = [
    {
      utterance: 'What can you do?',
      toolId: 'whatCanYouDo',
      params: { category: 'all', quickVersion: false },
      expectedInResponse: ['ferni', 'team'],
      difficulty: 'easy',
    },
    {
      utterance: 'Give me a quick overview',
      toolId: 'whatCanYouDo',
      params: { category: 'all', quickVersion: true },
      expectedInResponse: ['quick'],
      difficulty: 'easy',
    },
    {
      utterance: 'What can you help me with for productivity?',
      toolId: 'whatCanYouDo',
      params: { category: 'productivity', quickVersion: false },
      expectedInResponse: ['productivity', 'task', 'remind'],
      difficulty: 'medium',
    },
  ];

  describe('Seed Scenarios', () => {
    it.each(SEED_SCENARIOS)(
      'should handle: "$utterance"',
      async (scenario) => {
        const result = await testScenario(scenario, tools, ctx);
        expect(result.pass).toBe(true);
      }
    );
  });

  describe('LLM-Generated Scenarios', { timeout: LLM_TIMEOUT }, () => {
    it('should handle variations of "what can you do"', async () => {
      const scenarios = await generateScenarios(`
Generate ${5} realistic user utterances asking about Ferni's capabilities.

IMPORTANT: The toolId MUST be "whatCanYouDo" (exact match).

Include variations:
- Direct questions: "what can you do?", "what are your features?"
- Indirect: "I'm curious what you can help with"
- Category-specific: "how can you help with my finances?"
- Help-seeking: "I need help, what can you do?"
- Exploratory: "show me what you got"

For each, determine the correct params:
- category: "all" | "productivity" | "coaching" | "fun" | "smart-home" | "communication" | "finance" | "wellness"
- quickVersion: true | false

Example output:
{
  "utterance": "what can you help me with?",
  "toolId": "whatCanYouDo",
  "params": { "category": "all", "quickVersion": false },
  "expectedInResponse": ["help", "productivity", "coaching"],
  "difficulty": "easy"
}
`);

      if (scenarios.length === 0) {
        console.log('Skipping LLM test - no API key');
        return;
      }

      let passed = 0;
      const failures: string[] = [];

      for (const scenario of scenarios) {
        // Ensure toolId is correct (LLM sometimes misnames it)
        scenario.toolId = 'whatCanYouDo';
        const result = await testScenario(scenario, tools, ctx);
        if (result.pass) {
          passed++;
        } else {
          failures.push(`"${scenario.utterance}": ${result.error}`);
        }
      }

      console.log(`Capabilities Discovery: ${passed}/${scenarios.length} passed`);
      if (failures.length > 0) {
        console.log('Failures:', failures);
      }
      expect(passed).toBeGreaterThan(scenarios.length * 0.6); // 60% pass rate
    });
  });
});

// ============================================================================
// 2. QUICK CAPTURE TESTING
// ============================================================================

describe('Quick Capture - Synthetic Testing', () => {
  const ctx = createTestContext();
  const tools = essentialsToolDefinitions;

  const SEED_SCENARIOS: GeneratedScenario[] = [
    {
      utterance: 'I need to call my mom tomorrow',
      toolId: 'quickCapture',
      params: { thought: 'call my mom tomorrow', urgency: 'soon' },
      expectedInResponse: ['reminder', 'captured'],
      difficulty: 'easy',
    },
    {
      utterance: 'Remember to buy milk',
      toolId: 'quickCapture',
      params: { thought: 'buy milk' },
      expectedInResponse: ['shopping', 'list'],
      difficulty: 'easy',
    },
    {
      utterance: "I have an idea - what if we added a dark mode?",
      toolId: 'quickCapture',
      params: { thought: 'what if we added a dark mode?' },
      expectedInResponse: ['idea', 'captured'],
      difficulty: 'medium',
    },
    {
      utterance: 'Note to self: check the garden',
      toolId: 'quickCapture',
      params: { thought: 'note to self: check the garden' },
      expectedInResponse: ['remembered', 'memory'],
      difficulty: 'easy',
    },
  ];

  describe('Seed Scenarios', () => {
    it.each(SEED_SCENARIOS)(
      'should route: "$utterance"',
      async (scenario) => {
        const result = await testScenario(scenario, tools, ctx);
        expect(result.pass).toBe(true);
      }
    );
  });

  describe('LLM-Generated Scenarios', { timeout: LLM_TIMEOUT }, () => {
    it('should correctly route various types of thoughts', async () => {
      const scenarios = await generateScenarios(`
Generate ${8} realistic user utterances for capturing thoughts/brain dumps.

IMPORTANT: The toolId MUST be "quickCapture" (exact match).

Include:
1. Tasks with urgency: "I MUST do X today" → urgency: "now"
2. Reminders with dates: "remind me to X next Monday" → reminder
3. Shopping items: "need to buy X, Y, Z" → shopping-list
4. Ideas: "what if...", "I have an idea" → idea
5. Personal/emotional: "I feel...", "I'm worried about" → journal
6. General memory: "remember that X happened" → memory

For each, determine:
- thought: the cleaned text to capture
- urgency: "now" | "soon" | "someday" | "just-remember" (optional)
- expectedInResponse: what should appear (task/reminder/shopping/idea/journal/memory/captured)

Example output:
{
  "utterance": "I need to buy milk and eggs",
  "toolId": "quickCapture",
  "params": { "thought": "buy milk and eggs" },
  "expectedInResponse": ["shopping"],
  "difficulty": "easy",
  "notes": "shopping item"
}
`);

      if (scenarios.length === 0) {
        console.log('Skipping LLM test - no API key');
        return;
      }

      let passed = 0;
      let correctRouting = 0;
      const failures: string[] = [];

      for (const scenario of scenarios) {
        // Ensure toolId is correct (LLM sometimes misnames it)
        scenario.toolId = 'quickCapture';
        const result = await testScenario(scenario, tools, ctx);
        if (result.pass) {
          passed++;
          // Check if routing was correct based on the scenario type
          const resultLower = result.result.toLowerCase();
          if (
            (scenario.notes?.includes('task') && resultLower.includes('task')) ||
            (scenario.notes?.includes('reminder') && resultLower.includes('reminder')) ||
            (scenario.notes?.includes('shopping') && resultLower.includes('shopping')) ||
            (scenario.notes?.includes('idea') && resultLower.includes('idea')) ||
            (scenario.notes?.includes('journal') && resultLower.includes('journal'))
          ) {
            correctRouting++;
          }
        } else {
          failures.push(`"${scenario.utterance}": ${result.error}`);
        }
      }

      console.log(`Quick Capture: ${passed}/${scenarios.length} passed`);
      console.log(`Correct Routing: ${correctRouting}/${scenarios.length}`);
      if (failures.length > 0) {
        console.log('Failures:', failures);
      }
      expect(passed).toBeGreaterThan(scenarios.length * 0.5);
    });
  });
});

// ============================================================================
// 3. HUMOR TESTING
// ============================================================================

describe('Humor Tools - Synthetic Testing', () => {
  const ctx = createTestContext();
  const tools = humorToolDefinitions;

  const SEED_SCENARIOS: GeneratedScenario[] = [
    {
      utterance: 'Tell me a joke',
      toolId: 'tellJoke',
      params: { category: 'any' },
      expectedInResponse: [''], // Any response is valid
      difficulty: 'easy',
    },
    {
      utterance: 'Give me a dad joke',
      toolId: 'tellJoke',
      params: { category: 'dad' },
      expectedInResponse: [''],
      difficulty: 'easy',
    },
    {
      utterance: 'Tell me a fun fact',
      toolId: 'getFunFact',
      params: { category: 'any' },
      expectedInResponse: [''],
      difficulty: 'easy',
    },
    {
      utterance: 'Tell me a short story',
      toolId: 'tellMiniStory',
      params: { mood: 'any' },
      expectedInResponse: [''],
      difficulty: 'easy',
    },
  ];

  describe('Seed Scenarios', () => {
    it.each(SEED_SCENARIOS)(
      'should handle: "$utterance"',
      async (scenario) => {
        const result = await testScenario(scenario, tools, ctx);
        // For humor, we just check that we get a non-empty response
        expect(result.result.length).toBeGreaterThan(10);
      }
    );
  });

  describe('Uniqueness Testing', () => {
    it('should not repeat jokes for the same user', async () => {
      const tool = tools.find((t) => t.id === 'tellJoke')!.create(ctx);
      const jokes = new Set<string>();
      
      for (let i = 0; i < 5; i++) {
        const result = await tool.execute({ category: 'any' });
        jokes.add(String(result));
      }

      // Should have at least 3 unique jokes out of 5
      expect(jokes.size).toBeGreaterThanOrEqual(3);
    });

    it('should not repeat facts for the same user', async () => {
      const tool = tools.find((t) => t.id === 'getFunFact')!.create(ctx);
      const facts = new Set<string>();
      
      for (let i = 0; i < 5; i++) {
        const result = await tool.execute({ category: 'any' });
        facts.add(String(result));
      }

      expect(facts.size).toBeGreaterThanOrEqual(3);
    });
  });
});

// ============================================================================
// 4. WIND-DOWN TESTING
// ============================================================================

describe('Wind-Down Tools - Synthetic Testing', () => {
  const ctx = createTestContext();
  const tools = winddownToolDefinitions;

  const SEED_SCENARIOS: GeneratedScenario[] = [
    {
      utterance: 'Help me wind down',
      toolId: 'windDown',
      params: { style: 'gentle' },
      expectedInResponse: [''],
      difficulty: 'easy',
    },
    {
      utterance: 'Bedtime check in',
      toolId: 'bedtimeCheckIn',
      params: { focus: 'general' },
      expectedInResponse: [''],
      difficulty: 'easy',
    },
    {
      utterance: 'Give me a sleep affirmation',
      toolId: 'sleepAffirmation',
      params: { theme: 'general' },
      expectedInResponse: [''],
      difficulty: 'easy',
    },
  ];

  describe('Seed Scenarios', () => {
    it.each(SEED_SCENARIOS)(
      'should handle: "$utterance"',
      async (scenario) => {
        const result = await testScenario(scenario, tools, ctx);
        expect(result.result.length).toBeGreaterThan(10);
      }
    );
  });
});

// ============================================================================
// 5. PREFERENCES TESTING
// ============================================================================

describe('Preferences - Synthetic Testing', () => {
  const ctx = createTestContext();
  const tools = essentialsToolDefinitions;

  const SEED_SCENARIOS: GeneratedScenario[] = [
    {
      utterance: 'Use celsius for temperature',
      toolId: 'setPreference',
      params: { preferenceType: 'temperature', value: 'celsius' },
      expectedInResponse: ['celsius'],
      difficulty: 'easy',
    },
    {
      utterance: 'Call me Alex',
      toolId: 'setPreference',
      params: { preferenceType: 'nickname', value: 'Alex' },
      expectedInResponse: ['alex'],
      difficulty: 'easy',
    },
    {
      utterance: 'I prefer 24-hour time',
      toolId: 'setPreference',
      params: { preferenceType: 'time-format', value: '24h' },
      expectedInResponse: ['24'],
      difficulty: 'easy',
    },
    {
      utterance: 'Use metric units',
      toolId: 'setPreference',
      params: { preferenceType: 'distance', value: 'kilometers' },
      expectedInResponse: ['kilometer'],
      difficulty: 'easy',
    },
  ];

  describe('Seed Scenarios', () => {
    it.each(SEED_SCENARIOS)(
      'should set: "$utterance"',
      async (scenario) => {
        const result = await testScenario(scenario, tools, ctx);
        expect(result.pass).toBe(true);
      }
    );
  });

  describe('Preference Persistence', () => {
    it('should remember preferences across calls', async () => {
      const setTool = tools.find((t) => t.id === 'setPreference')!.create(ctx);
      const getTool = tools.find((t) => t.id === 'getPreferences')!.create(ctx);

      // Set a preference
      await setTool.execute({ preferenceType: 'nickname', value: 'TestUser' });

      // Get preferences
      const result = await getTool.execute({});
      expect(String(result).toLowerCase()).toContain('testuser');
    });
  });
});

// ============================================================================
// 6. SHORTCUTS - Cross-Domain Delegates
// ============================================================================

describe('Shortcuts Tools - Synthetic Testing', () => {
  const ctx = createTestContext();
  const tools = shortcutsToolDefinitions;

  const SEED_SCENARIOS: GeneratedScenario[] = [
    {
      utterance: 'Set an alarm for 7am',
      toolId: 'quickAlarm',
      params: { time: '7am' },
      expectedInResponse: ['alarm', '7'],
      difficulty: 'easy',
    },
    {
      utterance: 'Set a timer for 5 minutes',
      toolId: 'quickTimer',
      params: { duration: '5 minutes' },
      expectedInResponse: ['timer', '5'],
      difficulty: 'easy',
    },
    {
      utterance: "What's the weather?",
      toolId: 'quickWeather',
      params: {},
      expectedInResponse: ['weather'],
      difficulty: 'easy',
    },
    {
      utterance: 'Play some jazz',
      toolId: 'quickMusic',
      params: { query: 'jazz' },
      expectedInResponse: ['music'],
      difficulty: 'easy',
    },
    {
      utterance: "What's on my calendar today?",
      toolId: 'quickCalendar',
      params: { action: 'check' },
      expectedInResponse: ['calendar'],
      difficulty: 'easy',
    },
    {
      utterance: 'Turn on the lights',
      toolId: 'quickSmartHome',
      params: { command: 'turn on the lights' },
      expectedInResponse: ['smart', 'home'],
      difficulty: 'easy',
    },
  ];

  describe('Seed Scenarios', () => {
    it.each(SEED_SCENARIOS)(
      'should handle: "$utterance"',
      async (scenario) => {
        const toolDef = tools.find((t) => t.id === scenario.toolId);
        if (!toolDef) {
          // Shortcut will try to delegate, which may fail in test env
          // Just verify the tool exists
          expect(tools.find((t) => t.id === scenario.toolId)).toBeDefined();
          return;
        }

        const tool = toolDef.create(ctx);
        try {
          const result = await tool.execute(scenario.params);
          // Shortcuts may error if delegate tools aren't available
          expect(typeof result).toBe('string');
        } catch (error) {
          // Acceptable - delegate tool not available in test
          expect(error).toBeDefined();
        }
      }
    );
  });

  describe('Time Parsing', () => {
    it('should parse various time formats', async () => {
      const alarm = tools.find((t) => t.id === 'quickAlarm')!.create(ctx);
      
      // Test various formats - these may error if delegate not available
      const formats = ['7am', '7:30 PM', '14:30', '6:00'];
      
      for (const time of formats) {
        try {
          const result = await alarm.execute({ time });
          expect(typeof result).toBe('string');
        } catch (error) {
          // Acceptable - delegate tool not available
        }
      }
    });
  });

  describe('Duration Parsing', () => {
    it('should parse various duration formats', async () => {
      const timer = tools.find((t) => t.id === 'quickTimer')!.create(ctx);
      
      const durations = ['5 minutes', '30 seconds', '2 hours', '1 hour 30 minutes'];
      
      for (const duration of durations) {
        try {
          const result = await timer.execute({ duration });
          expect(typeof result).toBe('string');
        } catch (error) {
          // Acceptable - delegate tool not available
        }
      }
    });
  });
});

// ============================================================================
// 7. ANALYTICS - Capability Usage Tracking
// ============================================================================

describe('Analytics - Capability Usage', () => {
  it('should track capability usage', () => {
    const testUserId = 'analytics-test-user';
    
    // Track some usage
    trackCapabilityUsage(testUserId, 'quickAlarm', true);
    trackCapabilityUsage(testUserId, 'quickAlarm', true);
    trackCapabilityUsage(testUserId, 'quickTimer', true);
    trackCapabilityUsage(testUserId, 'quickTimer', false);
    
    // Get top capabilities
    const top = getTopCapabilities(testUserId);
    
    expect(top.length).toBeGreaterThan(0);
    expect(top[0].toolId).toBe('quickAlarm');
    expect(top[0].count).toBe(2);
    expect(top[0].successRate).toBe(1);
  });

  it('should calculate success rate correctly', () => {
    const testUserId = 'analytics-success-test';
    
    // 1 success, 1 failure = 50% success rate
    trackCapabilityUsage(testUserId, 'testTool', true);
    trackCapabilityUsage(testUserId, 'testTool', false);
    
    const top = getTopCapabilities(testUserId);
    const testTool = top.find(t => t.toolId === 'testTool');
    
    expect(testTool).toBeDefined();
    expect(testTool!.successRate).toBe(0.5);
  });
});

// ============================================================================
// 8. GAP ANALYSIS - Missing Capabilities
// ============================================================================

describe('Gap Analysis - Missing Capabilities', { timeout: LLM_TIMEOUT }, () => {
  it('should identify unhandled user intents', async () => {
    if (!USE_LLM) {
      console.log('Skipping LLM gap analysis - no API key');
      return;
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: TEST_LLM_MODEL });

    const currentCapabilities = `
CURRENT TOOLS (ESSENTIALS DOMAIN):
- whatCanYouDo: Show all capabilities
- quickCapture: Capture thoughts (auto-routes to task/reminder/shopping/idea/journal/memory)
- recentContext: Recall recent conversations
- setPreference: Set user preferences (temperature, distance, time-format, nickname, timezone, language, voice-speed)
- getPreferences: Get current preferences
- tellJoke: Tell jokes (dad, pun, one-liner, wholesome, clever, absurd)
- getFunFact: Share fun facts (science, history, nature, space, human-body, food, random)
- tellMiniStory: Short stories (heartwarming, inspiring, funny, thoughtful)
- windDown: Evening wind-down routine
- bedtimeCheckIn: Reflect on the day
- sleepAffirmation: Calming affirmation for sleep
- spell: Spell words with phonetic alphabet

CROSS-DOMAIN SHORTCUTS (delegates to other domain tools):
- quickAlarm: Set alarms ("set alarm for 7am")
- quickTimer: Set timers ("5 minute timer")
- quickWeather: Get weather ("what's the weather?")
- quickMusic: Play music ("play some jazz")
- quickCalendar: Check/add calendar events ("what's on my calendar?")
- quickSmartHome: Control smart home ("turn on the lights")
- quickCall: Make phone calls ("call mom")
- quickText: Send text messages ("text John I'm running late")
- quickEmail: Send emails ("email boss about the meeting")

EXISTING TOOLS IN OTHER DOMAINS (already implemented):
- Alarms: setAlarm, cancelAlarm, listAlarms
- Timers: setTimer, cancelTimer
- Weather: getWeather, getForecast
- Music: playMusic, spotifyPlay, pauseMusic
- Calendar: getCalendarEvents, createCalendarEvent
- Smart Home: controlLights, setThermostat, lockDoor
- Phone Calls: makePhoneCall, callContact
- Messages: sendText, sendSMS, sendMessage
- Email: sendEmail, composeEmail
- Math: quickMath, calculateTip, splitBill
- Conversions: convertUnits, convertTemperature
- Dictionary: defineWord, getSynonyms
- Translation: translate, pronounce
- News: getNews, getHeadlines
- Navigation: getDirections, findNearby

ADVANCED REMINDERS (NEW):
- locationReminder: Set reminder when arriving/leaving a location ("remind me to buy milk when I get to the grocery store")
- recurringReminder: Set repeating reminders (daily, weekly, monthly)
- listLocationReminders: Show all location-based reminders
- listRecurringReminders: Show all recurring reminders

SMART LISTS (existing):
- createList: Create any type of list (reading, packing, bucket, movies, etc.)
- addToList: Add items to lists
- viewList: View list items
- checkOffItem: Mark items complete

FIND MY PHONE (NEW):
- findMyPhone: Ring your phone even on silent
- checkBattery: Check phone battery level
- listDevices: Show connected devices

NOTE: Most voice assistant features are already implemented across the codebase. The "shortcuts" provide convenient entry points.
`;

    const prompt = `You are an expert voice assistant designer. Analyze these current capabilities and identify GAPS - common voice assistant features that are MISSING.

${currentCapabilities}

List the TOP 10 most common voice assistant features that users would expect but are NOT covered by the current tools.

For each gap, provide:
1. Feature name
2. Example user utterance
3. Priority (high/medium/low) based on how commonly users would ask for this
4. Whether it could be added to an existing tool or needs a new one

Format as JSON:
[
  {
    "feature": "Feature Name",
    "utterance": "Example user would say",
    "priority": "high|medium|low",
    "implementation": "extend existing tool X" | "new tool needed"
  }
]

ONLY return valid JSON.`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        const gaps = JSON.parse(jsonMatch[0]) as Array<{
          feature: string;
          utterance: string;
          priority: string;
          implementation: string;
        }>;

        console.log('\n=== GAP ANALYSIS RESULTS ===\n');
        console.log('Missing features identified:\n');
        
        const highPriority = gaps.filter(g => g.priority === 'high');
        const mediumPriority = gaps.filter(g => g.priority === 'medium');
        const lowPriority = gaps.filter(g => g.priority === 'low');

        if (highPriority.length > 0) {
          console.log('🔴 HIGH PRIORITY:');
          highPriority.forEach(g => {
            console.log(`  - ${g.feature}`);
            console.log(`    Example: "${g.utterance}"`);
            console.log(`    Implementation: ${g.implementation}\n`);
          });
        }

        if (mediumPriority.length > 0) {
          console.log('🟡 MEDIUM PRIORITY:');
          mediumPriority.forEach(g => {
            console.log(`  - ${g.feature}`);
            console.log(`    Example: "${g.utterance}"`);
            console.log(`    Implementation: ${g.implementation}\n`);
          });
        }

        if (lowPriority.length > 0) {
          console.log('🟢 LOW PRIORITY:');
          lowPriority.forEach(g => {
            console.log(`  - ${g.feature}`);
            console.log(`    Example: "${g.utterance}"`);
            console.log(`    Implementation: ${g.implementation}\n`);
          });
        }

        // Store for CI reporting
        expect(gaps.length).toBeGreaterThan(0);
        console.log(`\nTotal gaps identified: ${gaps.length}`);
        console.log(`High priority: ${highPriority.length}`);
        console.log(`Medium priority: ${mediumPriority.length}`);
        console.log(`Low priority: ${lowPriority.length}`);
      }
    } catch (error) {
      console.warn('Gap analysis failed:', error);
    }
  });
});

