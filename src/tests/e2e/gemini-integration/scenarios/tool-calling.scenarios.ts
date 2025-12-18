/**
 * Tool Calling Test Scenarios
 *
 * These scenarios test that Gemini CALLS tools rather than SPEAKING about them.
 * This is the core issue: ambiguous prompts cause Gemini to output text like
 * "I'll play some jazz for you" instead of calling the playMusic tool.
 *
 * Categories:
 * 1. Music/Entertainment - playMusic, pauseMusic, etc.
 * 2. Information - getWeather, searchWeb, getNews
 * 3. Handoffs - handoffToMaya, handoffToAlex, etc.
 * 4. Memory - rememberAboutUser, recallFromMemory
 *
 * Run: npx vitest run src/tests/e2e/gemini-integration/scenarios/tool-calling.scenarios.ts
 */

import type { ExpectedBehavior } from '../harness.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ToolCallingScenario {
  id: string;
  name: string;
  description: string;
  category: 'entertainment' | 'information' | 'handoff' | 'memory' | 'session';
  probe: string;
  expected: ExpectedBehavior;
  applicablePersonas: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
}

// ============================================================================
// ENTERTAINMENT TOOL SCENARIOS
// ============================================================================

export const entertainmentScenarios: ToolCallingScenario[] = [
  {
    id: 'music-play-explicit',
    name: 'Explicit music play request',
    description: 'User explicitly asks to play music - should CALL playMusic',
    category: 'entertainment',
    probe: 'Play some jazz music please',
    expected: {
      shouldCallTool: 'playMusic',
      shouldAvoid: ["i'll play", 'let me play', 'i can play', 'i would play'],
    },
    applicablePersonas: ['ferni'],
    severity: 'critical',
  },
  {
    id: 'music-play-mood',
    name: 'Mood-based music request',
    description: 'User wants music for a mood - should CALL playMusic',
    category: 'entertainment',
    probe: "I'm feeling stressed. Can you play something relaxing?",
    expected: {
      shouldCallTool: 'playMusic',
      shouldAvoid: ["i'll play", 'let me find', 'i can put on'],
    },
    applicablePersonas: ['ferni'],
    severity: 'critical',
  },
  {
    id: 'music-play-artist',
    name: 'Artist-specific music request',
    description: 'User asks for specific artist - should CALL playMusic',
    category: 'entertainment',
    probe: 'Put on some Miles Davis',
    expected: {
      shouldCallTool: 'playMusic',
      shouldAvoid: ["i'll put", 'let me play', 'i can play'],
    },
    applicablePersonas: ['ferni'],
    severity: 'critical',
  },
  {
    id: 'music-pause',
    name: 'Pause music request',
    description: 'User wants to pause - should CALL pauseMusic',
    category: 'entertainment',
    probe: 'Pause the music',
    expected: {
      shouldCallTool: 'pauseMusic',
      shouldAvoid: ["i'll pause", 'let me pause', 'pausing'],
    },
    applicablePersonas: ['ferni'],
    severity: 'high',
  },
  {
    id: 'music-resume',
    name: 'Resume music request',
    description: 'User wants to continue - should CALL resumeMusic',
    category: 'entertainment',
    probe: 'Resume the music',
    expected: {
      shouldCallTool: 'resumeMusic',
      shouldAvoid: ["i'll resume", 'resuming now'],
    },
    applicablePersonas: ['ferni'],
    severity: 'high',
  },
];

// ============================================================================
// INFORMATION TOOL SCENARIOS
// ============================================================================

export const informationScenarios: ToolCallingScenario[] = [
  {
    id: 'weather-explicit',
    name: 'Explicit weather request',
    description: 'User asks for weather - should CALL getWeather',
    category: 'information',
    probe: "What's the weather like in New York?",
    expected: {
      shouldCallTool: 'getWeather',
      shouldAvoid: ["i'll check", 'let me look', 'i think the weather'],
    },
    applicablePersonas: ['ferni', 'alex-chen'],
    severity: 'high',
  },
  {
    id: 'weather-implicit',
    name: 'Implicit weather need',
    description: 'User mentions needing weather info - should CALL getWeather',
    category: 'information',
    probe: 'Should I bring an umbrella to Chicago today?',
    expected: {
      shouldCallTool: 'getWeather',
      shouldAvoid: ["i'm not sure", 'probably', 'you might want to'],
    },
    applicablePersonas: ['ferni'],
    severity: 'medium',
  },
  {
    id: 'search-explicit',
    name: 'Explicit search request',
    description: 'User asks to look something up - should CALL searchWeb',
    category: 'information',
    probe: 'Can you look up who won the Super Bowl last year?',
    expected: {
      shouldCallTool: 'searchWeb',
      shouldAvoid: ["i'll search", 'let me find', 'i think it was'],
    },
    applicablePersonas: ['ferni', 'peter-john'],
    severity: 'high',
  },
  {
    id: 'search-factual',
    name: 'Factual question requiring search',
    description: 'User asks factual question - should CALL searchWeb',
    category: 'information',
    probe: "What's the current price of Bitcoin?",
    expected: {
      shouldCallTool: 'searchWeb',
      shouldAvoid: ["i don't have", 'as of my knowledge', 'around'],
    },
    applicablePersonas: ['ferni', 'peter-john'],
    severity: 'high',
  },
  {
    id: 'news-request',
    name: 'News request',
    description: 'User asks for news - should CALL getNews',
    category: 'information',
    probe: "What's happening in the tech world today?",
    expected: {
      shouldCallTool: 'getNews',
      shouldAvoid: ["i don't have real-time", 'as of my knowledge'],
    },
    applicablePersonas: ['ferni', 'peter-john'],
    severity: 'medium',
  },
];

// ============================================================================
// HANDOFF TOOL SCENARIOS
// ============================================================================

export const handoffScenarios: ToolCallingScenario[] = [
  // Maya (habits, budgeting)
  {
    id: 'handoff-maya-budget',
    name: 'Budget discussion triggers Maya handoff',
    description: 'User mentions budgeting - should CALL handoffToMaya',
    category: 'handoff',
    probe: 'I need help with my budget. I keep overspending.',
    expected: {
      shouldCallTool: 'handoffToMaya',
      shouldAvoid: [
        "i'll connect you",
        'let me transfer',
        "i'm going to hand you off",
        'maya is great at',
      ],
    },
    applicablePersonas: ['ferni'],
    severity: 'critical',
  },
  {
    id: 'handoff-maya-habits',
    name: 'Habit discussion triggers Maya handoff',
    description: 'User wants to build habits - should CALL handoffToMaya',
    category: 'handoff',
    probe: "I want to start exercising regularly but I can't stick to it.",
    expected: {
      shouldCallTool: 'handoffToMaya',
      shouldAvoid: ["i'll transfer", 'maya can help', 'let me connect'],
    },
    applicablePersonas: ['ferni'],
    severity: 'critical',
  },
  {
    id: 'handoff-maya-spending',
    name: 'Spending tracking triggers Maya handoff',
    description: 'User wants spending help - should CALL handoffToMaya',
    category: 'handoff',
    probe: 'I have no idea where my money goes each month.',
    expected: {
      shouldCallTool: 'handoffToMaya',
      shouldAvoid: ['i know someone', 'maya would be perfect'],
    },
    applicablePersonas: ['ferni'],
    severity: 'critical',
  },

  // Alex (calendar, communications)
  {
    id: 'handoff-alex-calendar',
    name: 'Calendar request triggers Alex handoff',
    description: 'User needs calendar help - should CALL handoffToAlex',
    category: 'handoff',
    probe: 'My calendar is a mess. I need help organizing my schedule.',
    expected: {
      shouldCallTool: 'handoffToAlex',
      shouldAvoid: ["i'll connect", 'alex is great', 'let me transfer'],
    },
    applicablePersonas: ['ferni'],
    severity: 'critical',
  },
  {
    id: 'handoff-alex-email',
    name: 'Email request triggers Alex handoff',
    description: 'User needs email help - should CALL handoffToAlex',
    category: 'handoff',
    probe: 'I need to write a difficult email to my boss.',
    expected: {
      shouldCallTool: 'handoffToAlex',
      shouldAvoid: ["i'll transfer", 'alex handles'],
    },
    applicablePersonas: ['ferni'],
    severity: 'critical',
  },

  // Peter (research, investing)
  {
    id: 'handoff-peter-investing',
    name: 'Investment question triggers Peter handoff',
    description: 'User asks about investments - should CALL handoffToPeter',
    category: 'handoff',
    probe: 'Should I invest in index funds or individual stocks?',
    expected: {
      shouldCallTool: 'handoffToPeter',
      shouldAvoid: ["i'll connect", 'peter is our', 'let me get'],
    },
    applicablePersonas: ['ferni'],
    severity: 'critical',
  },
  {
    id: 'handoff-peter-research',
    name: 'Research question triggers Peter handoff',
    description: 'User needs deep research - should CALL handoffToPeter',
    category: 'handoff',
    probe: 'What do the numbers say about the housing market right now?',
    expected: {
      shouldCallTool: 'handoffToPeter',
      shouldAvoid: ["i'll transfer", 'peter can analyze'],
    },
    applicablePersonas: ['ferni'],
    severity: 'critical',
  },

  // Jordan (celebrations, milestones)
  {
    id: 'handoff-jordan-wedding',
    name: 'Wedding planning triggers Jordan handoff',
    description: 'User planning wedding - should CALL handoffToJordan',
    category: 'handoff',
    probe: "I'm getting married next year and I don't know where to start.",
    expected: {
      shouldCallTool: 'handoffToJordan',
      shouldAvoid: ["i'll connect", 'jordan is perfect', 'let me transfer'],
    },
    applicablePersonas: ['ferni'],
    severity: 'critical',
  },
  {
    id: 'handoff-jordan-milestone',
    name: 'Milestone celebration triggers Jordan handoff',
    description: 'User has big milestone - should CALL handoffToJordan',
    category: 'handoff',
    probe: 'My 40th birthday is coming up and I want to make it special.',
    expected: {
      shouldCallTool: 'handoffToJordan',
      shouldAvoid: ["i'll transfer", 'jordan loves'],
    },
    applicablePersonas: ['ferni'],
    severity: 'critical',
  },

  // Nayan (wisdom, philosophy)
  {
    id: 'handoff-nayan-meaning',
    name: 'Meaning of life triggers Nayan handoff',
    description: 'User asks existential questions - should CALL handoffToNayan',
    category: 'handoff',
    probe: "I've been wondering what the point of all this is. What's my purpose?",
    expected: {
      shouldCallTool: 'handoffToNayan',
      shouldAvoid: ["i'll connect", 'nayan is wise', 'let me transfer'],
    },
    applicablePersonas: ['ferni'],
    severity: 'critical',
  },
  {
    id: 'handoff-nayan-wisdom',
    name: 'Deep wisdom request triggers Nayan handoff',
    description: 'User needs philosophical guidance - should CALL handoffToNayan',
    category: 'handoff',
    probe: 'How do I find peace with getting older?',
    expected: {
      shouldCallTool: 'handoffToNayan',
      shouldAvoid: ["i'll transfer", 'nayan can help'],
    },
    applicablePersonas: ['ferni'],
    severity: 'critical',
  },
];

// ============================================================================
// MEMORY TOOL SCENARIOS
// ============================================================================

export const memoryScenarios: ToolCallingScenario[] = [
  {
    id: 'memory-remember-goal',
    name: 'User shares goal - should remember',
    description: 'User shares an important goal - should CALL rememberAboutUser',
    category: 'memory',
    probe: 'I really want to save enough to buy a house in the next 3 years.',
    expected: {
      shouldCallTool: 'rememberAboutUser',
      shouldAvoid: ["i'll note that", 'noted'],
    },
    applicablePersonas: ['ferni', 'maya-santos'],
    severity: 'medium',
  },
  {
    id: 'memory-remember-personal',
    name: 'User shares personal info - should remember',
    description: 'User shares personal detail - should CALL rememberAboutUser',
    category: 'memory',
    probe: 'My daughter Sophie just turned 5 last week.',
    expected: {
      shouldCallTool: 'rememberAboutUser',
    },
    applicablePersonas: ['ferni'],
    severity: 'medium',
  },
  {
    id: 'memory-recall-reference',
    name: 'User references previous conversation',
    description: 'User references something discussed before - should CALL recallFromMemory',
    category: 'memory',
    probe: 'Remember that thing we talked about last time? With my sister?',
    expected: {
      shouldCallTool: 'recallFromMemory',
      shouldAvoid: ["i don't remember", 'could you remind me'],
    },
    applicablePersonas: ['ferni'],
    severity: 'high',
  },
];

// ============================================================================
// NEGATIVE SCENARIOS (Should NOT call tools)
// ============================================================================

export const negativeScenarios: ToolCallingScenario[] = [
  {
    id: 'negative-not-music',
    name: 'Talking about music - NOT a play request',
    description: 'User discusses music but is not asking to play - should NOT call playMusic',
    category: 'entertainment',
    probe: 'I used to play guitar when I was younger. I miss it.',
    expected: {
      shouldAvoid: ['playMusic'],
      shouldInclude: ['guitar', 'music'],
    },
    applicablePersonas: ['ferni'],
    severity: 'high',
  },
  {
    id: 'negative-not-handoff',
    name: 'Mentions topic but not needing specialist',
    description: 'User mentions budget casually - should NOT handoff',
    category: 'handoff',
    probe: 'I had a good day today. Stayed under budget for groceries.',
    expected: {
      shouldAvoid: ['handoffToMaya'],
    },
    applicablePersonas: ['ferni'],
    severity: 'high',
  },
  {
    id: 'negative-emotional-support',
    name: 'User needs emotional support, not handoff',
    description: 'User is venting about finances - needs support, not immediate handoff',
    category: 'handoff',
    probe: "I'm so frustrated with my finances. I just needed to vent.",
    expected: {
      shouldAvoid: ['handoffToMaya', "i'll transfer"],
      shouldInclude: ['hear you', 'frustrating', 'understand'],
    },
    applicablePersonas: ['ferni'],
    severity: 'high',
  },
];

// ============================================================================
// ALL SCENARIOS
// ============================================================================

export const ALL_TOOL_CALLING_SCENARIOS: ToolCallingScenario[] = [
  ...entertainmentScenarios,
  ...informationScenarios,
  ...handoffScenarios,
  ...memoryScenarios,
  ...negativeScenarios,
];

/**
 * Get scenarios by category
 */
export function getScenariosByCategory(
  category: ToolCallingScenario['category']
): ToolCallingScenario[] {
  return ALL_TOOL_CALLING_SCENARIOS.filter((s) => s.category === category);
}

/**
 * Get scenarios for a specific persona
 */
export function getScenariosForPersona(personaId: string): ToolCallingScenario[] {
  return ALL_TOOL_CALLING_SCENARIOS.filter(
    (s) => s.applicablePersonas.length === 0 || s.applicablePersonas.includes(personaId)
  );
}

/**
 * Get only critical scenarios
 */
export function getCriticalScenarios(): ToolCallingScenario[] {
  return ALL_TOOL_CALLING_SCENARIOS.filter((s) => s.severity === 'critical');
}

/**
 * Get handoff-specific scenarios (the most problematic)
 */
export function getHandoffScenarios(): ToolCallingScenario[] {
  return handoffScenarios;
}
