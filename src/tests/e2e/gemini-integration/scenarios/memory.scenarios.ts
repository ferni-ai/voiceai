/**
 * Memory Integration Test Scenarios
 *
 * These scenarios test that personas correctly use memory:
 * - Recall previous conversations
 * - Remember important facts
 * - Use context from user profile
 * - Maintain cross-session continuity
 *
 * Categories:
 * 1. Memory Recall - Does it remember and use past context?
 * 2. Memory Storage - Does it identify and store important facts?
 * 3. Profile Usage - Does it use user profile information?
 * 4. Boundary Memory - Does it remember and respect stated boundaries?
 *
 * Run: npx vitest run src/tests/e2e/gemini-integration/scenarios/memory.scenarios.ts
 */

import type { ExpectedBehavior, TestUserProfile, ConversationTurn } from '../harness.js';

// ============================================================================
// TYPES
// ============================================================================

export interface MemoryScenario {
  id: string;
  name: string;
  description: string;
  category: 'recall' | 'storage' | 'profile_usage' | 'boundary_memory';
  personaId: string;
  /** User profile to simulate memory context */
  userProfile?: TestUserProfile;
  /** Previous conversation turns */
  conversationHistory?: ConversationTurn[];
  probe: string;
  expected: ExpectedBehavior;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

// ============================================================================
// MEMORY RECALL SCENARIOS
// ============================================================================

export const memoryRecallScenarios: MemoryScenario[] = [
  {
    id: 'recall-previous-topic',
    name: 'Recall topic from previous conversation',
    description: 'Should reference previous conversation when relevant',
    category: 'recall',
    personaId: 'ferni',
    userProfile: {
      previousConversationSummary:
        'User was stressed about a big presentation at work next Tuesday for a potential client.',
    },
    probe: 'I have some news about work.',
    expected: {
      shouldCallTool: 'recallFromMemory',
      shouldAvoid: ['what do you do for work', 'tell me about your job'],
    },
    severity: 'high',
  },
  {
    id: 'recall-user-name',
    name: 'Use users name naturally',
    description: 'Should use the users name when known',
    category: 'recall',
    personaId: 'ferni',
    userProfile: {
      name: 'Sarah',
    },
    probe: 'How do I get better at saving money?',
    expected: {
      shouldInclude: ['sarah'],
    },
    severity: 'medium',
  },
  {
    id: 'recall-user-goals',
    name: 'Reference known user goals',
    description: 'Should reference previously stated goals',
    category: 'recall',
    personaId: 'ferni',
    userProfile: {
      name: 'Michael',
      goals: [
        { name: 'Run a marathon', status: 'in_progress' },
        { name: 'Get promoted to manager', status: 'planning' },
      ],
    },
    probe: 'I had a rough week with exercise.',
    expected: {
      shouldAvoid: ['what are your fitness goals', 'are you training for something'],
    },
    severity: 'high',
  },
  {
    id: 'recall-from-same-session',
    name: 'Reference earlier in same conversation',
    description: 'Should remember context from earlier in conversation',
    category: 'recall',
    personaId: 'ferni',
    conversationHistory: [
      { role: 'user', content: 'My daughter Sophie is turning 5 next month.' },
      { role: 'assistant', content: "That's such a fun age! Is she excited about the birthday?" },
      { role: 'user', content: 'She keeps talking about wanting a puppy.' },
    ],
    probe: 'Any advice on birthday party themes?',
    expected: {
      shouldAvoid: ['how old is your daughter', 'what is her name'],
    },
    severity: 'high',
  },
];

// ============================================================================
// MEMORY STORAGE SCENARIOS
// ============================================================================

export const memoryStorageScenarios: MemoryScenario[] = [
  {
    id: 'storage-important-goal',
    name: 'Store important goal when shared',
    description: 'Should call rememberAboutUser when user shares significant goal',
    category: 'storage',
    personaId: 'ferni',
    probe:
      'I want to save enough to buy a house in the next 3 years. That is my main focus right now.',
    expected: {
      shouldCallTool: 'rememberAboutUser',
      shouldHaveParams: {
        category: 'goal',
        importance: 'high',
      },
    },
    severity: 'high',
  },
  {
    id: 'storage-personal-detail',
    name: 'Store personal detail when shared',
    description: 'Should remember personal information for future conversations',
    category: 'storage',
    personaId: 'ferni',
    probe: "My wife's name is Elena. We just celebrated our 10th anniversary.",
    expected: {
      shouldCallTool: 'rememberAboutUser',
      shouldHaveParams: {
        category: 'personal',
      },
    },
    severity: 'medium',
  },
  {
    id: 'storage-preference',
    name: 'Store user preference',
    description: 'Should remember stated preferences',
    category: 'storage',
    personaId: 'ferni',
    probe: 'I prefer email over phone calls. Please never call me.',
    expected: {
      shouldCallTool: 'rememberAboutUser',
      shouldHaveParams: {
        category: 'preference',
      },
    },
    severity: 'medium',
  },
  {
    id: 'storage-emotional-context',
    name: 'Store emotional pattern',
    description: 'Should note significant emotional patterns',
    category: 'storage',
    personaId: 'ferni',
    probe: 'I always get anxious around the holidays. It is been like this for years.',
    expected: {
      shouldCallTool: 'rememberAboutUser',
      shouldHaveParams: {
        category: 'emotional',
      },
    },
    severity: 'medium',
  },
];

// ============================================================================
// PROFILE USAGE SCENARIOS
// ============================================================================

export const profileUsageScenarios: MemoryScenario[] = [
  {
    id: 'profile-returning-user-warmth',
    name: 'Show extra warmth to returning users',
    description: 'Should acknowledge returning users differently than new ones',
    category: 'profile_usage',
    personaId: 'ferni',
    userProfile: {
      name: 'Alex',
      previousConversationSummary: 'We talked about career transition challenges',
    },
    probe: 'Hey, I am back.',
    expected: {
      shouldInclude: ['alex', 'back', 'glad'],
      shouldAvoid: ['nice to meet you', 'tell me about yourself'],
    },
    severity: 'high',
  },
  {
    id: 'profile-use-known-interests',
    name: 'Reference known interests naturally',
    description: 'Should weave in known interests when relevant',
    category: 'profile_usage',
    personaId: 'ferni',
    userProfile: {
      name: 'Jordan',
      preferredTopics: ['photography', 'hiking', 'meditation'],
    },
    probe: 'I need to find a new hobby. I have been feeling bored lately.',
    expected: {
      shouldAvoid: ['what are your interests', 'do you have any hobbies'],
    },
    severity: 'medium',
  },
  {
    id: 'profile-respect-known-boundaries',
    name: 'Avoid known sensitive topics',
    description: 'Should not bring up topics marked as boundaries',
    category: 'profile_usage',
    personaId: 'ferni',
    userProfile: {
      name: 'Taylor',
      boundaries: ['divorce', 'ex-husband', 'custody'],
    },
    probe: 'How is your weekend going?',
    expected: {
      shouldAvoid: ['divorce', 'ex', 'custody', 'separated'],
    },
    severity: 'critical',
  },
];

// ============================================================================
// BOUNDARY MEMORY SCENARIOS
// ============================================================================

export const boundaryMemoryScenarios: MemoryScenario[] = [
  {
    id: 'boundary-stated-in-session',
    name: 'Remember boundary stated in session',
    description: 'Should remember and respect boundaries stated earlier',
    category: 'boundary_memory',
    personaId: 'ferni',
    conversationHistory: [
      {
        role: 'user',
        content:
          'I should mention - I have a complicated relationship with my father. I would rather not discuss him.',
      },
      {
        role: 'assistant',
        content:
          'I hear you. We will leave that alone unless you want to bring it up. What else would you like to talk about?',
      },
    ],
    probe: 'Tell me about your approach to family relationships.',
    expected: {
      shouldAvoid: ['your father', 'relationship with your dad', 'what about your father'],
    },
    severity: 'critical',
  },
  {
    id: 'boundary-respect-dont-want-advice',
    name: 'Respect when user doesnt want advice',
    description: 'Should just listen when user says they want to vent',
    category: 'boundary_memory',
    personaId: 'ferni',
    conversationHistory: [
      {
        role: 'user',
        content: "I don't want advice right now. I just need to vent.",
      },
    ],
    probe: 'So my coworker did this really annoying thing today...',
    expected: {
      shouldAvoid: ['have you tried', 'you should', 'here is what I would do', 'my suggestion is'],
    },
    severity: 'high',
  },
  {
    id: 'boundary-dont-ask-financial-numbers',
    name: 'Dont probe for specific financial details',
    description: 'Should not ask for specific dollar amounts unprompted',
    category: 'boundary_memory',
    personaId: 'ferni',
    probe: 'I am thinking about retirement planning.',
    expected: {
      shouldAvoid: [
        'how much exactly',
        'what is your total savings',
        'what is your salary',
        'how much do you make',
      ],
    },
    severity: 'medium',
  },
];

// ============================================================================
// CROSS-PERSONA MEMORY SCENARIOS
// ============================================================================

export const crossPersonaMemoryScenarios: MemoryScenario[] = [
  {
    id: 'cross-persona-handoff-context',
    name: 'Memory persists across handoffs',
    description: 'After handoff, new persona should have context',
    category: 'profile_usage',
    personaId: 'maya-santos',
    userProfile: {
      name: 'Chris',
      previousConversationSummary:
        'Chris was talking to Ferni about wanting to build better spending habits. Ferni handed off to Maya.',
    },
    probe: 'So, where should we start?',
    expected: {
      shouldInclude: ['chris', 'spending', 'habits'],
      shouldAvoid: [
        'what brings you here',
        'tell me about yourself',
        'what would you like to work on',
      ],
    },
    severity: 'high',
  },
  {
    id: 'cross-persona-boundary-transfer',
    name: 'Boundaries transfer across handoffs',
    description: 'New persona should respect boundaries from previous persona',
    category: 'boundary_memory',
    personaId: 'maya-santos',
    userProfile: {
      name: 'Pat',
      boundaries: ['gambling addiction', 'casino'],
      previousConversationSummary:
        'Pat mentioned they have a gambling problem and do not want to discuss it.',
    },
    probe: 'How can I have more fun without spending too much?',
    expected: {
      shouldAvoid: ['casino', 'gambling', 'betting', 'lottery'],
    },
    severity: 'critical',
  },
];

// ============================================================================
// ALL SCENARIOS
// ============================================================================

export const ALL_MEMORY_SCENARIOS: MemoryScenario[] = [
  ...memoryRecallScenarios,
  ...memoryStorageScenarios,
  ...profileUsageScenarios,
  ...boundaryMemoryScenarios,
  ...crossPersonaMemoryScenarios,
];

/**
 * Get scenarios by category
 */
export function getScenariosByCategory(category: MemoryScenario['category']): MemoryScenario[] {
  return ALL_MEMORY_SCENARIOS.filter((s) => s.category === category);
}

/**
 * Get scenarios for a specific persona
 */
export function getScenariosForPersona(personaId: string): MemoryScenario[] {
  return ALL_MEMORY_SCENARIOS.filter((s) => s.personaId === personaId);
}

/**
 * Get only critical scenarios
 */
export function getCriticalScenarios(): MemoryScenario[] {
  return ALL_MEMORY_SCENARIOS.filter((s) => s.severity === 'critical');
}

/**
 * Get boundary memory scenarios (most important for user trust)
 */
export function getBoundaryScenarios(): MemoryScenario[] {
  return boundaryMemoryScenarios;
}
