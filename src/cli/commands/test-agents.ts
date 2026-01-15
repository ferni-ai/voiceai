#!/usr/bin/env node
/**
 * Pre-Deployment Agent Testing CLI
 *
 * Gates deployment by verifying all agents can call their tools correctly.
 * Tests actual Gemini responses with production-matching tool definitions.
 *
 * Usage:
 *   ferni test agents              # Test all agents (critical scenarios)
 *   ferni test agents --persona ferni
 *   ferni test agents --verbose
 *   ferni test agents --report     # Generate detailed report
 *   ferni test agents --gate       # Fail CI if any critical tests fail
 *
 * @module cli/commands/test-agents
 */

import { GoogleGenAI } from '@google/genai';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TestAgents' });

// Use simplified type for tool definitions - SDK handles conversion
interface SimpleFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

// ============================================================================
// RATE LIMITER
// ============================================================================

let lastCallTime = 0;
const MIN_DELAY_MS = 6000; // 6 seconds between calls for gemini-2.0-flash-exp (10 req/min)

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < MIN_DELAY_MS) {
    const waitTime = MIN_DELAY_MS - elapsed;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, waitTime);
    });
  }
  lastCallTime = Date.now();
}

// ============================================================================
// TYPES
// ============================================================================

interface AgentToolConfig {
  agentId: string;
  agentName: string;
  tools: SimpleFunctionDeclaration[];
  systemPrompt: string;
  criticalScenarios: TestScenario[];
}

interface TestScenario {
  id: string;
  probe: string;
  expectedTool: string | null; // null = should NOT call any tool
  description: string;
  critical: boolean;
}

interface TestResult {
  agentId: string;
  scenarioId: string;
  passed: boolean;
  expectedTool: string | null;
  actualTool: string | null;
  spokeInsteadOfCalling: boolean;
  responsePreview: string;
  latencyMs: number;
  error?: string;
}

interface TestReport {
  timestamp: Date;
  totalTests: number;
  passed: number;
  failed: number;
  criticalFailed: number;
  byAgent: Record<
    string,
    {
      total: number;
      passed: number;
      failed: number;
      toolSuccessRate: number;
    }
  >;
  results: TestResult[];
  recommendations: string[];
}

// ============================================================================
// AGENT TOOL DEFINITIONS (MUST MATCH PRODUCTION)
// ============================================================================

// These definitions MUST be synced with what FerniAgent uses in production
const FERNI_TOOLS: SimpleFunctionDeclaration[] = [
  // Music tools
  {
    name: 'playMusic',
    description: `Play music! Works for everyone - no subscription needed.
Use when user asks to:
- Play a song, artist, or genre
- "Put on some music"
- "Play something"
- "Let me hear [song]"

Plays a 30-second preview that everyone can enjoy.
Users with Spotify linked get full tracks.`,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Song name, artist, genre, or search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'pauseMusic',
    description: 'Pause the currently playing music.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'stopMusic',
    description: 'Stop the music and clear the queue.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'whatsPlaying',
    description: "Get what's currently playing.",
    parameters: { type: 'object', properties: {} },
  },
  // Memory tools
  {
    name: 'rememberAboutUser',
    description: 'Remember an important fact about the user for future conversations.',
    parameters: {
      type: 'object',
      properties: {
        fact: { type: 'string', description: 'The fact to remember' },
        category: {
          type: 'string',
          description: 'Category: preferences, goals, life_events, relationships',
        },
      },
      required: ['fact'],
    },
  },
  {
    name: 'recallFromMemory',
    description: 'Recall stored information about the user.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for in memory' },
      },
      required: ['query'],
    },
  },
  // Information tools
  {
    name: 'getWeather',
    description: 'Get current weather for a location.',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City or location name' },
      },
      required: ['location'],
    },
  },
  {
    name: 'searchWeb',
    description: 'Search the web for information.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  // Handoff tools (CRITICAL - must match production exactly)
  {
    name: 'handoffToMaya',
    description:
      'IMMEDIATELY transfer to Maya when user mentions: habits, budgeting, spending tracking, savings goals, morning routine, daily routine, exercise habits, financial wellness, building routines, tracking expenses, or accountability. Do NOT speak about transferring - CALL this tool.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'handoffToAlex',
    description:
      'IMMEDIATELY transfer to Alex when user mentions: calendar, schedule, email, draft email, write email, compose email, meeting, appointment, communication coaching, difficult conversation, scheduling conflict, time management, or inbox management. Do NOT speak about transferring - CALL this tool.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'handoffToPeter',
    description:
      'IMMEDIATELY transfer to Peter when user mentions: stocks, investments, market, portfolio, research, data analysis, financial patterns, retirement planning, or analyzing trends. Do NOT speak about transferring - CALL this tool.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'handoffToJordan',
    description:
      'IMMEDIATELY transfer to Jordan when user mentions: wedding, engagement, birthday party, celebration, anniversary, graduation, baby shower, retirement party, milestone event, life transitions, moving, or planning a special event. Do NOT speak about transferring - CALL this tool.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'handoffToNayan',
    description:
      'IMMEDIATELY transfer to Nayan when user asks about: meaning of life, philosophy, wisdom, purpose, long-term perspective, existential questions, spirituality, what really matters, or needs contemplative guidance. Do NOT speak about transferring - CALL this tool.',
    parameters: { type: 'object', properties: {} },
  },
];

// Critical scenarios that must pass before deployment
const FERNI_CRITICAL_SCENARIOS: TestScenario[] = [
  // Music - MUST work in production
  {
    id: 'music-play-explicit',
    probe: 'Play some jazz music',
    expectedTool: 'playMusic',
    description: 'Explicit music request should call playMusic',
    critical: true,
  },
  {
    id: 'music-play-implicit',
    probe: 'Put on something relaxing',
    expectedTool: 'playMusic',
    description: 'Implicit music request should call playMusic',
    critical: true,
  },
  {
    id: 'music-play-artist',
    probe: 'I want to hear Taylor Swift',
    expectedTool: 'playMusic',
    description: 'Artist request should call playMusic',
    critical: true,
  },
  // Handoffs - CRITICAL for team functionality
  {
    id: 'handoff-maya-santos',
    probe: 'I need help building a morning routine',
    expectedTool: 'handoffToMaya',
    description: 'Habits request should handoff to Maya',
    critical: true,
  },
  {
    id: 'handoff-maya-budget',
    probe: 'Can you help me track my spending?',
    expectedTool: 'handoffToMaya',
    description: 'Budget/spending request should handoff to Maya',
    critical: true,
  },
  {
    id: 'handoff-alex-calendar',
    probe: 'I need help with my calendar for next week',
    expectedTool: 'handoffToAlex',
    description: 'Calendar request should handoff to Alex',
    critical: true,
  },
  {
    id: 'handoff-alex-email',
    probe: 'I need to write an email to my boss about a raise',
    expectedTool: 'handoffToAlex',
    description: 'Email request should handoff to Alex',
    critical: true,
  },
  {
    id: 'handoff-peter-stocks',
    probe: "What's happening with tech stocks today?",
    expectedTool: 'handoffToPeter',
    description: 'Stocks request should handoff to Peter',
    critical: true,
  },
  {
    id: 'handoff-peter-investments',
    probe: "I'm thinking about investing in index funds",
    expectedTool: 'handoffToPeter',
    description: 'Investment request should handoff to Peter',
    critical: true,
  },
  {
    id: 'handoff-jordan-wedding',
    probe: "I'm planning my wedding and need help",
    expectedTool: 'handoffToJordan',
    description: 'Wedding planning should handoff to Jordan',
    critical: true,
  },
  {
    id: 'handoff-jordan-birthday',
    probe: 'I want to throw a surprise birthday party',
    expectedTool: 'handoffToJordan',
    description: 'Birthday party should handoff to Jordan',
    critical: true,
  },
  {
    id: 'handoff-nayan-philosophy',
    probe: "What's the meaning of life?",
    expectedTool: 'handoffToNayan',
    description: 'Philosophy question should handoff to Nayan',
    critical: true,
  },
  {
    id: 'handoff-nayan',
    probe: 'I need some wisdom about making big life decisions',
    expectedTool: 'handoffToNayan',
    description: 'Wisdom request should handoff to Nayan',
    critical: true,
  },
  // Weather - basic functionality
  {
    id: 'weather-request',
    probe: "What's the weather like in San Francisco?",
    expectedTool: 'getWeather',
    description: 'Weather request should call getWeather',
    critical: true,
  },
  // Anti-patterns: Should NOT call tools
  {
    id: 'no-tool-greeting',
    probe: 'Hi, how are you?',
    expectedTool: null,
    description: 'Greeting should NOT trigger any tool',
    critical: true,
  },
  {
    id: 'no-tool-conversation',
    probe: 'I had a really great day today',
    expectedTool: null,
    description: 'General conversation should NOT trigger tool',
    critical: true,
  },
];

// ============================================================================
// MAYA AGENT - Habits & Financial Wellness Coach
// ============================================================================

const MAYA_TOOLS: SimpleFunctionDeclaration[] = [
  // Habit tools - Maya's specialty
  {
    name: 'addHabit',
    description: 'Add a new habit to track. Use when user wants to start tracking a new habit.',
    parameters: {
      type: 'object',
      properties: {
        habitName: { type: 'string', description: 'Name of the habit' },
        frequency: { type: 'string', description: 'How often: daily, weekly, etc' },
      },
      required: ['habitName'],
    },
  },
  {
    name: 'logHabit',
    description: 'Log that a habit was completed today. Use when user says they did their habit.',
    parameters: {
      type: 'object',
      properties: { habitName: { type: 'string', description: 'Name of the habit completed' } },
      required: ['habitName'],
    },
  },
  {
    name: 'getDueHabits',
    description: 'Get list of habits due today. Use when user asks what habits they should do.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'getHabitStats',
    description:
      'Get statistics and streaks for habits. Use when user asks about progress or streaks.',
    parameters: {
      type: 'object',
      properties: {
        habitName: { type: 'string', description: 'Optional: specific habit to check' },
      },
    },
  },
  // Handoffs
  {
    name: 'handoffToFerni',
    description:
      'Transfer back to Ferni for general life coaching, deeper conversations, or topics outside habits/budgeting.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'handoffToAlex',
    description: 'Transfer to Alex for calendar, scheduling, email, or communication coaching.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'handoffToPeter',
    description: 'Transfer to Peter for stocks, investments, market analysis, or data patterns.',
    parameters: { type: 'object', properties: {} },
  },
];

const MAYA_SCENARIOS: TestScenario[] = [
  {
    id: 'maya-add-habit',
    probe: 'I want to start meditating every morning',
    expectedTool: 'addHabit',
    description: 'New habit request should call addHabit',
    critical: true,
  },
  {
    id: 'maya-log-habit',
    probe: 'Log that I completed my workout habit today',
    expectedTool: 'logHabit',
    description: 'Completed habit should call logHabit',
    critical: true,
  },
  {
    id: 'maya-check-stats',
    probe: "How's my running streak going?",
    expectedTool: 'getHabitStats',
    description: 'Streak question should call getHabitStats',
    critical: true,
  },
  {
    id: 'maya-handoff-ferni',
    probe: 'I want to talk about something deeper',
    expectedTool: 'handoffToFerni',
    description: 'General coaching should handoff to Ferni',
    critical: true,
  },
];

const MAYA_SYSTEM_PROMPT = `You are Maya Santos, a warm habits coach who believes in starting small.

## 🛠️ TOOLS - ACT, DON'T ANNOUNCE

When users want to track habits or ask about progress, CALL the tools. Don't announce.

- User wants new habit → CALL addHabit
- User completed a habit → CALL logHabit  
- User asks about streaks/progress → CALL getHabitStats
- User wants general life coaching → CALL handoffToFerni
- User asks about calendar/email → CALL handoffToAlex`;

// ============================================================================
// ALEX AGENT - Communication Coach
// ============================================================================

const ALEX_TOOLS: SimpleFunctionDeclaration[] = [
  {
    name: 'draftEmail',
    description: 'Help draft an email. Use when user needs help writing an email.',
    parameters: {
      type: 'object',
      properties: {
        recipient: { type: 'string', description: 'Who the email is for' },
        purpose: { type: 'string', description: 'Purpose of the email' },
      },
      required: ['purpose'],
    },
  },
  {
    name: 'checkAvailability',
    description: 'Check calendar availability. Use when user asks about scheduling.',
    parameters: {
      type: 'object',
      properties: { date: { type: 'string', description: 'Date to check' } },
    },
  },
  {
    name: 'setReminder',
    description: 'Set a reminder. Use when user wants to be reminded of something.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'What to remind' },
        time: { type: 'string', description: 'When to remind' },
      },
      required: ['message'],
    },
  },
  // Handoffs
  {
    name: 'handoffToFerni',
    description: 'Transfer back to Ferni for general life coaching or deeper conversations.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'handoffToMaya',
    description: 'Transfer to Maya for habits, budgeting, and building routines.',
    parameters: { type: 'object', properties: {} },
  },
];

const ALEX_SCENARIOS: TestScenario[] = [
  {
    id: 'alex-draft-email',
    probe: 'Draft an email to my boss declining the Friday meeting',
    expectedTool: 'draftEmail',
    description: 'Email drafting should call draftEmail',
    critical: true,
  },
  {
    id: 'alex-set-reminder',
    probe: 'Remind me to call mom tomorrow at 3pm',
    expectedTool: 'setReminder',
    description: 'Reminder request should call setReminder',
    critical: true,
  },
  {
    id: 'alex-handoff-ferni',
    probe: 'I need to talk about my life direction',
    expectedTool: 'handoffToFerni',
    description: 'Life coaching should handoff to Ferni',
    critical: true,
  },
];

const ALEX_SYSTEM_PROMPT = `You are Alex Chen, an efficient communication coach.

## 🛠️ TOOLS - ACT, DON'T ANNOUNCE

When users need help with emails, scheduling, or reminders, CALL the tools. Don't announce.

- User needs email help → CALL draftEmail
- User wants a reminder → CALL setReminder
- User asks about scheduling → CALL checkAvailability
- User wants life coaching → CALL handoffToFerni
- User asks about habits → CALL handoffToMaya`;

// ============================================================================
// PETER AGENT - Research & Market Analysis
// ============================================================================

const PETER_TOOLS: SimpleFunctionDeclaration[] = [
  {
    name: 'getStockQuote',
    description: 'Get current stock price and info. Use when user asks about a stock.',
    parameters: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Stock ticker symbol' } },
      required: ['symbol'],
    },
  },
  {
    name: 'getMarketSummary',
    description: 'Get overall market summary. Use when user asks about market conditions.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'analyzeStock',
    description: 'Analyze a stock using Peter Lynch methodology. Use for investment research.',
    parameters: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Stock to analyze' } },
      required: ['symbol'],
    },
  },
  // Handoffs
  {
    name: 'handoffToFerni',
    description: 'Transfer back to Ferni for general life coaching.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'handoffToMaya',
    description: 'Transfer to Maya for budgeting and financial habits.',
    parameters: { type: 'object', properties: {} },
  },
];

const PETER_SCENARIOS: TestScenario[] = [
  {
    id: 'peter-stock-quote',
    probe: "What's Apple stock at right now?",
    expectedTool: 'getStockQuote',
    description: 'Stock price request should call getStockQuote',
    critical: true,
  },
  {
    id: 'peter-market-summary',
    probe: "How's the market doing today?",
    expectedTool: 'getMarketSummary',
    description: 'Market question should call getMarketSummary',
    critical: true,
  },
  {
    id: 'peter-handoff-ferni',
    probe: "I'm feeling stressed about life",
    expectedTool: 'handoffToFerni',
    description: 'Life stress should handoff to Ferni',
    critical: true,
  },
];

const PETER_SYSTEM_PROMPT = `You are Peter John, an 80-year-old analytical mind who sees patterns.

## 🛠️ TOOLS - ACT, DON'T ANNOUNCE

When users ask about stocks or markets, CALL the tools. Don't announce.

- User asks about a stock → CALL getStockQuote
- User asks about market conditions → CALL getMarketSummary
- User wants stock analysis → CALL analyzeStock
- User wants life coaching → CALL handoffToFerni`;

// ============================================================================
// JORDAN AGENT - Life Planning & Events
// ============================================================================

const JORDAN_TOOLS: SimpleFunctionDeclaration[] = [
  {
    name: 'createGoal',
    description: 'Create a new life goal. Use when user wants to set a goal.',
    parameters: {
      type: 'object',
      properties: {
        goalName: { type: 'string', description: 'Name of the goal' },
        targetDate: { type: 'string', description: 'When to achieve it' },
      },
      required: ['goalName'],
    },
  },
  {
    name: 'createEvent',
    description: 'Plan an event or celebration. Use when user wants to plan something.',
    parameters: {
      type: 'object',
      properties: {
        eventType: { type: 'string', description: 'Type of event' },
        date: { type: 'string', description: 'When is it' },
      },
      required: ['eventType'],
    },
  },
  {
    name: 'createLifeMilestone',
    description: 'Record a life milestone. Use when user mentions achieving something big.',
    parameters: {
      type: 'object',
      properties: { milestone: { type: 'string', description: 'What was achieved' } },
      required: ['milestone'],
    },
  },
  // Handoffs
  {
    name: 'handoffToFerni',
    description: 'Transfer back to Ferni for general life coaching.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'handoffToAlex',
    description: 'Transfer to Alex for scheduling and calendar management.',
    parameters: { type: 'object', properties: {} },
  },
];

const JORDAN_SCENARIOS: TestScenario[] = [
  {
    id: 'jordan-create-goal',
    probe: 'Set a goal for me to run a marathon by December 2025',
    expectedTool: 'createGoal',
    description: 'Goal setting should call createGoal',
    critical: true,
  },
  {
    id: 'jordan-plan-event',
    probe: "I'm throwing a graduation party",
    expectedTool: 'createEvent',
    description: 'Event planning should call createEvent',
    critical: true,
  },
  {
    id: 'jordan-handoff-ferni',
    probe: 'I need help processing some emotions',
    expectedTool: 'handoffToFerni',
    description: 'Emotional support should handoff to Ferni',
    critical: true,
  },
];

const JORDAN_SYSTEM_PROMPT = `You are Jordan Taylor, an enthusiastic lifetime planner.

## 🛠️ TOOLS - ACT, DON'T ANNOUNCE

When users want to set goals or plan events, CALL the tools. Don't announce.

- User sets a goal → CALL createGoal
- User plans an event → CALL createEvent
- User achieves something big → CALL createLifeMilestone
- User needs emotional support → CALL handoffToFerni`;

// ============================================================================
// NAYAN AGENT - Wisdom & Philosophy
// ============================================================================

const NAYAN_TOOLS: SimpleFunctionDeclaration[] = [
  {
    name: 'getWisdomQuote',
    description: 'Get a wisdom quote relevant to situation. Use when user needs perspective.',
    parameters: {
      type: 'object',
      properties: { topic: { type: 'string', description: 'Topic for the quote' } },
    },
  },
  {
    name: 'getLifeWisdom',
    description: 'Share life wisdom on a topic. Use for philosophical questions.',
    parameters: {
      type: 'object',
      properties: { question: { type: 'string', description: 'The philosophical question' } },
      required: ['question'],
    },
  },
  // Handoffs
  {
    name: 'handoffToFerni',
    description: 'Transfer back to Ferni for general life coaching.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'handoffToMaya',
    description: 'Transfer to Maya for practical habits and routines.',
    parameters: { type: 'object', properties: {} },
  },
];

const NAYAN_SCENARIOS: TestScenario[] = [
  {
    id: 'nayan-quote',
    probe: 'I need some perspective on patience',
    expectedTool: 'getWisdomQuote',
    description: 'Perspective request should call getWisdomQuote',
    critical: true,
  },
  {
    id: 'nayan-life-wisdom',
    probe: 'What is the nature of happiness?',
    expectedTool: 'getLifeWisdom',
    description: 'Philosophy question should call getLifeWisdom',
    critical: true,
  },
  {
    id: 'nayan-handoff-maya',
    probe: 'I need help building a daily routine',
    expectedTool: 'handoffToMaya',
    description: 'Routine building should handoff to Maya',
    critical: true,
  },
];

const NAYAN_SYSTEM_PROMPT = `You are Nayan Patel, a mystic lifetime coach who thinks in decades.

## 🛠️ TOOLS - ACT, DON'T ANNOUNCE

When users seek wisdom or perspective, CALL the tools. Don't announce.

- User needs perspective → CALL getWisdomQuote
- User asks philosophical question → CALL getLifeWisdom
- User wants practical habits → CALL handoffToMaya`;

// ============================================================================
// SYSTEM PROMPT (MUST MATCH PRODUCTION) - FERNI
// ============================================================================

const FERNI_SYSTEM_PROMPT = `You are Ferni, a warm and wise life coach.

## 🛠️ TOOLS - ACT, DON'T ANNOUNCE

**CRITICAL: When using tools, CALL THEM. Don't speak about them.**

You have tools for: music, weather, information, memory, and team handoffs.

### The Rule: Act, Don't Announce

- ❌ "Let me put on some music for you" → ✅ Just call playMusic
- ❌ "I'll check the weather" → ✅ Just call getWeather  
- ❌ "Let me connect you with Maya" → ✅ Just call handoffToMaya
- ❌ "I'm going to remember that" → ✅ Just call rememberAboutUser
- ❌ "I'll transfer you to Jordan for that" → ✅ Just call handoffToJordan

### Team Handoffs - When to Connect

Transfer **immediately** when the topic matches a specialist:

- Habits, budgeting, spending, daily routines → handoffToMaya
- Calendar, email, scheduling, communication → handoffToAlex
- Stocks, investments, data analysis, research → handoffToPeter
- Wedding, birthday, celebration, milestone → handoffToJordan
- Meaning of life, philosophy, wisdom → handoffToNayan`;

// ============================================================================
// TEST RUNNER
// ============================================================================

class AgentTester {
  private genai: GoogleGenAI;
  private model = 'gemini-2.0-flash-exp';

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY environment variable required');
    }
    this.genai = new GoogleGenAI({ apiKey });
  }

  async runScenario(agent: AgentToolConfig, scenario: TestScenario): Promise<TestResult> {
    const startTime = Date.now();

    try {
      await rateLimit();

      const response = await this.genai.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: scenario.probe }] }],
        config: {
          tools: [{ functionDeclarations: agent.tools as unknown[] }],
          temperature: 0.7,
          maxOutputTokens: 500,
        },
        systemInstruction: agent.systemPrompt,
      } as Parameters<typeof this.genai.models.generateContent>[0]);

      const latencyMs = Date.now() - startTime;
      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      // Check for tool calls
      let actualTool: string | null = null;
      let responseText = '';

      for (const part of parts) {
        if (part.functionCall) {
          actualTool = part.functionCall.name ?? null;
        }
        if (part.text) {
          responseText += part.text;
        }
      }

      // Detect "spoke instead of calling" anti-pattern
      const spokePatterns = [
        /let me (?:connect|transfer|put|play|check)/i,
        /i'll (?:connect|transfer|put|play|check|get)/i,
        /i'm going to (?:connect|transfer|put|play|check)/i,
        /connecting you/i,
        /transferring you/i,
        /putting on/i,
      ];
      const spokeInsteadOfCalling = spokePatterns.some((p) => p.test(responseText));

      // Determine pass/fail
      let passed: boolean;
      if (scenario.expectedTool === null) {
        // Should NOT call any tool
        passed = actualTool === null && !spokeInsteadOfCalling;
      } else {
        // Should call specific tool
        passed = actualTool === scenario.expectedTool;
      }

      return {
        agentId: agent.agentId,
        scenarioId: scenario.id,
        passed,
        expectedTool: scenario.expectedTool,
        actualTool,
        spokeInsteadOfCalling,
        responsePreview: responseText.slice(0, 200),
        latencyMs,
      };
    } catch (error) {
      return {
        agentId: agent.agentId,
        scenarioId: scenario.id,
        passed: false,
        expectedTool: scenario.expectedTool,
        actualTool: null,
        spokeInsteadOfCalling: false,
        responsePreview: '',
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async testAgent(agent: AgentToolConfig, verbose = false): Promise<TestResult[]> {
    const results: TestResult[] = [];

    console.log(`\n🤖 Testing ${agent.agentName} (${agent.criticalScenarios.length} scenarios)`);
    console.log('─'.repeat(60));

    for (const scenario of agent.criticalScenarios) {
      process.stdout.write(`  ${scenario.critical ? '🔴' : '⚪'} ${scenario.id}... `);

      const result = await this.runScenario(agent, scenario);
      results.push(result);

      if (result.passed) {
        console.log(`✅ PASS (${result.latencyMs}ms)`);
      } else {
        console.log(`❌ FAIL`);
        console.log(`     Expected: ${result.expectedTool || 'no tool'}`);
        console.log(`     Got: ${result.actualTool || 'no tool'}`);
        if (result.spokeInsteadOfCalling) {
          console.log(`     ⚠️  Spoke instead of calling tool!`);
        }
        if (verbose && result.responsePreview) {
          console.log(`     Response: "${result.responsePreview.slice(0, 100)}..."`);
        }
        if (result.error) {
          console.log(`     Error: ${result.error}`);
        }
      }
    }

    return results;
  }

  generateReport(results: TestResult[]): TestReport {
    const byAgent: Record<
      string,
      { total: number; passed: number; failed: number; toolSuccessRate: number }
    > = {};

    let criticalFailed = 0;
    for (const result of results) {
      if (!byAgent[result.agentId]) {
        byAgent[result.agentId] = { total: 0, passed: 0, failed: 0, toolSuccessRate: 0 };
      }
      byAgent[result.agentId].total++;
      if (result.passed) {
        byAgent[result.agentId].passed++;
      } else {
        byAgent[result.agentId].failed++;
        // Check if critical - look in all scenario lists
        const allScenarios = [
          ...FERNI_CRITICAL_SCENARIOS,
          ...MAYA_SCENARIOS,
          ...ALEX_SCENARIOS,
          ...PETER_SCENARIOS,
          ...JORDAN_SCENARIOS,
          ...NAYAN_SCENARIOS,
        ];
        const scenario = allScenarios.find((s) => s.id === result.scenarioId);
        if (scenario?.critical) {
          criticalFailed++;
        }
      }
    }

    // Calculate success rates
    for (const agentId of Object.keys(byAgent)) {
      const stats = byAgent[agentId];
      stats.toolSuccessRate = stats.total > 0 ? (stats.passed / stats.total) * 100 : 0;
    }

    // Generate recommendations
    const recommendations: string[] = [];

    const musicFails = results.filter((r) => r.scenarioId.startsWith('music-') && !r.passed);
    if (musicFails.length > 0) {
      recommendations.push(
        '🎵 Music tool calls are failing - check if MUSIC_ENABLED=true and playMusic description matches production'
      );
    }

    const handoffFails = results.filter((r) => r.scenarioId.startsWith('handoff-') && !r.passed);
    if (handoffFails.length > 0) {
      recommendations.push(
        `🤝 ${handoffFails.length} handoff(s) failing - verify handoff tool descriptions have explicit trigger keywords`
      );
    }

    const spokeInstead = results.filter((r) => r.spokeInsteadOfCalling);
    if (spokeInstead.length > 0) {
      recommendations.push(
        `🗣️ ${spokeInstead.length} scenario(s) where agent spoke instead of calling - strengthen "ACT DON'T ANNOUNCE" instructions`
      );
    }

    return {
      timestamp: new Date(),
      totalTests: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      criticalFailed,
      byAgent,
      results,
      recommendations,
    };
  }
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

export async function runTestAgents(options: {
  persona?: string;
  verbose?: boolean;
  report?: boolean;
  gate?: boolean;
}): Promise<number> {
  console.log('\n🧪 Ferni Agent Tool Testing');
  console.log('═'.repeat(60));
  console.log('Pre-deployment gate: Verify all agents can call their tools\n');

  const tester = new AgentTester();

  // Build agent configs
  const agents: AgentToolConfig[] = [];

  const allPersonas = !options.persona || options.persona === 'all';

  if (allPersonas || options.persona === 'ferni') {
    agents.push({
      agentId: 'ferni',
      agentName: 'Ferni',
      tools: FERNI_TOOLS,
      systemPrompt: FERNI_SYSTEM_PROMPT,
      criticalScenarios: FERNI_CRITICAL_SCENARIOS,
    });
  }

  if (allPersonas || options.persona === 'maya') {
    agents.push({
      agentId: 'maya',
      agentName: 'Maya',
      tools: MAYA_TOOLS,
      systemPrompt: MAYA_SYSTEM_PROMPT,
      criticalScenarios: MAYA_SCENARIOS,
    });
  }

  if (allPersonas || options.persona === 'alex') {
    agents.push({
      agentId: 'alex',
      agentName: 'Alex',
      tools: ALEX_TOOLS,
      systemPrompt: ALEX_SYSTEM_PROMPT,
      criticalScenarios: ALEX_SCENARIOS,
    });
  }

  if (allPersonas || options.persona === 'peter') {
    agents.push({
      agentId: 'peter',
      agentName: 'Peter',
      tools: PETER_TOOLS,
      systemPrompt: PETER_SYSTEM_PROMPT,
      criticalScenarios: PETER_SCENARIOS,
    });
  }

  if (allPersonas || options.persona === 'jordan') {
    agents.push({
      agentId: 'jordan',
      agentName: 'Jordan',
      tools: JORDAN_TOOLS,
      systemPrompt: JORDAN_SYSTEM_PROMPT,
      criticalScenarios: JORDAN_SCENARIOS,
    });
  }

  if (allPersonas || options.persona === 'nayan') {
    agents.push({
      agentId: 'nayan',
      agentName: 'Nayan',
      tools: NAYAN_TOOLS,
      systemPrompt: NAYAN_SYSTEM_PROMPT,
      criticalScenarios: NAYAN_SCENARIOS,
    });
  }

  // Run tests
  const allResults: TestResult[] = [];
  for (const agent of agents) {
    const results = await tester.testAgent(agent, options.verbose);
    allResults.push(...results);
  }

  // Generate report
  const report = tester.generateReport(allResults);

  // Print summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(
    `Total: ${report.totalTests} | ✅ Passed: ${report.passed} | ❌ Failed: ${report.failed}`
  );
  console.log(`Critical Failures: ${report.criticalFailed}`);

  if (report.recommendations.length > 0) {
    console.log('\n📋 RECOMMENDATIONS:');
    for (const rec of report.recommendations) {
      console.log(`  ${rec}`);
    }
  }

  // Output detailed report if requested
  if (options.report) {
    const reportPath = `./test-reports/agent-tools-${Date.now()}.json`;
    const fs = await import('fs/promises');
    await fs.mkdir('./test-reports', { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  }

  // Exit code for CI gating
  if (options.gate) {
    if (report.criticalFailed > 0) {
      console.log(`\n🚨 DEPLOYMENT BLOCKED: ${report.criticalFailed} critical test(s) failed`);
      return 1;
    }
    console.log('\n✅ All critical tests passed - safe to deploy');
  }

  return report.criticalFailed > 0 ? 1 : 0;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  runTestAgents({
    persona: args.find((a) => a.startsWith('--persona='))?.split('=')[1],
    verbose: args.includes('--verbose') || args.includes('-v'),
    report: args.includes('--report'),
    gate: args.includes('--gate'),
  })
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
