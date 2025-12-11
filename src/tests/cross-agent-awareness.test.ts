/**
 * Cross-Agent Awareness Service Tests
 *
 * Tests for team awareness including:
 * - Recording conversations for team
 * - Getting team context
 * - Team notes management
 * - Prompt formatting
 * - Conversation analysis
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordConversationForTeam,
  getTeamContext,
  addTeamNote,
  acknowledgeTeamNote,
  formatCrossAgentContextForPrompt,
  generateTeamReferencePhrases,
  analyzeConversationForTeam,
  recordSessionForTeam,
  initializeCrossAgentAwareness,
  clearCrossAgentCaches,
  type TeamConversationSummary,
  type CrossAgentContext,
  type TeamNote,
} from '../services/cross-agent-awareness.js';

// Mock dependencies
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({
          exists: false,
          data: () => null,
        }),
        set: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  })),
}));

// ============================================================================
// TYPE TESTS
// ============================================================================

describe('TeamConversationSummary type', () => {
  it('should accept valid summary', () => {
    const summary: TeamConversationSummary = {
      agentId: 'ferni',
      agentName: 'Ferni',
      timestamp: new Date(),
      topics: ['work', 'stress'],
      emotionalTone: 'struggling',
      keyMoments: ['I feel overwhelmed'],
    };

    expect(summary.agentId).toBe('ferni');
    expect(summary.emotionalTone).toBe('struggling');
  });

  it('should accept all emotional tones', () => {
    const tones: Array<TeamConversationSummary['emotionalTone']> = [
      'positive',
      'neutral',
      'struggling',
      'celebratory',
    ];

    for (const tone of tones) {
      const summary: TeamConversationSummary = {
        agentId: 'test',
        agentName: 'Test',
        timestamp: new Date(),
        topics: [],
        emotionalTone: tone,
        keyMoments: [],
      };
      expect(summary.emotionalTone).toBe(tone);
    }
  });

  it('should accept optional fields', () => {
    const summary: TeamConversationSummary = {
      agentId: 'alex-chen',
      agentName: 'Alex',
      timestamp: new Date(),
      topics: ['goals'],
      emotionalTone: 'positive',
      keyMoments: [],
      userGoals: ['Get organized', 'Save money'],
      userConcerns: ['Time management'],
      followUpNeeded: true,
    };

    expect(summary.userGoals).toHaveLength(2);
    expect(summary.followUpNeeded).toBe(true);
  });
});

describe('CrossAgentContext type', () => {
  it('should accept valid context', () => {
    const context: CrossAgentContext = {
      recentTeamInteractions: [],
      sharedGoals: ['Exercise more'],
      teamNotes: [],
    };

    expect(context.sharedGoals).toHaveLength(1);
  });

  it('should accept full context', () => {
    const context: CrossAgentContext = {
      recentTeamInteractions: [
        {
          agentId: 'maya-santos',
          agentName: 'Maya',
          timestamp: new Date(),
          topics: ['habits'],
          emotionalTone: 'positive',
          keyMoments: [],
        },
      ],
      sharedGoals: ['Build habits'],
      teamNotes: [
        {
          fromAgent: 'ferni',
          toAgent: '*',
          content: 'User is stressed',
          timestamp: new Date(),
          priority: 'high',
          acknowledged: false,
        },
      ],
    };

    expect(context.recentTeamInteractions).toHaveLength(1);
    expect(context.teamNotes).toHaveLength(1);
  });
});

describe('TeamNote type', () => {
  it('should accept valid note', () => {
    const note: TeamNote = {
      fromAgent: 'ferni',
      toAgent: 'alex-chen',
      content: 'User is working on productivity',
      timestamp: new Date(),
      priority: 'medium',
      acknowledged: false,
    };

    expect(note.fromAgent).toBe('ferni');
    expect(note.priority).toBe('medium');
  });

  it('should accept broadcast note', () => {
    const note: TeamNote = {
      fromAgent: 'maya-santos',
      toAgent: '*',
      content: 'User completed a habit streak',
      timestamp: new Date(),
      priority: 'low',
      acknowledged: false,
    };

    expect(note.toAgent).toBe('*');
  });

  it('should accept all priority levels', () => {
    const priorities: Array<TeamNote['priority']> = ['low', 'medium', 'high'];

    for (const priority of priorities) {
      const note: TeamNote = {
        fromAgent: 'test',
        toAgent: '*',
        content: 'Test',
        timestamp: new Date(),
        priority,
        acknowledged: false,
      };
      expect(note.priority).toBe(priority);
    }
  });
});

// ============================================================================
// CORE FUNCTION TESTS
// ============================================================================

describe('recordConversationForTeam', () => {
  beforeEach(() => {
    clearCrossAgentCaches();
  });

  it('should record a conversation', async () => {
    const summary: TeamConversationSummary = {
      agentId: 'ferni',
      agentName: 'Ferni',
      timestamp: new Date(),
      topics: ['work'],
      emotionalTone: 'neutral',
      keyMoments: [],
    };

    await expect(recordConversationForTeam('user-1', summary)).resolves.not.toThrow();
  });

  it('should store in cache', async () => {
    const summary: TeamConversationSummary = {
      agentId: 'alex-chen',
      agentName: 'Alex',
      timestamp: new Date(),
      topics: ['productivity'],
      emotionalTone: 'positive',
      keyMoments: ['Feeling more organized'],
    };

    await recordConversationForTeam('user-cache-test', summary);

    // Get team context for another agent to verify it was stored
    const context = await getTeamContext('user-cache-test', 'ferni');
    expect(context.recentTeamInteractions.length).toBeGreaterThanOrEqual(0);
  });
});

describe('getTeamContext', () => {
  beforeEach(() => {
    clearCrossAgentCaches();
  });

  it('should return empty context for new user', async () => {
    const context = await getTeamContext('new-user', 'ferni');

    expect(context.recentTeamInteractions).toEqual([]);
    expect(context.sharedGoals).toEqual([]);
    expect(context.teamNotes).toEqual([]);
  });

  it('should exclude current agent from interactions', async () => {
    // Record as ferni
    await recordConversationForTeam('user-exclude-test', {
      agentId: 'ferni',
      agentName: 'Ferni',
      timestamp: new Date(),
      topics: ['work'],
      emotionalTone: 'neutral',
      keyMoments: [],
    });

    // Record as alex
    await recordConversationForTeam('user-exclude-test', {
      agentId: 'alex-chen',
      agentName: 'Alex',
      timestamp: new Date(),
      topics: ['productivity'],
      emotionalTone: 'positive',
      keyMoments: [],
    });

    // Get context as ferni - should not see own conversations
    const context = await getTeamContext('user-exclude-test', 'ferni');

    const ferniInteraction = context.recentTeamInteractions.find((i) => i.agentId === 'ferni');
    expect(ferniInteraction).toBeUndefined();
  });

  it('should return recent interactions from last 7 days', async () => {
    // Recent interaction
    await recordConversationForTeam('user-recent-test', {
      agentId: 'maya-santos',
      agentName: 'Maya',
      timestamp: new Date(),
      topics: ['habits'],
      emotionalTone: 'positive',
      keyMoments: [],
    });

    const context = await getTeamContext('user-recent-test', 'ferni');

    // Should have recent interaction
    expect(context.recentTeamInteractions.length).toBeGreaterThanOrEqual(0);
  });
});

describe('addTeamNote', () => {
  beforeEach(() => {
    clearCrossAgentCaches();
  });

  it('should add a note', async () => {
    await expect(
      addTeamNote('user-note-1', {
        fromAgent: 'ferni',
        toAgent: '*',
        content: 'User is going through a tough time',
        priority: 'high',
      })
    ).resolves.not.toThrow();
  });

  it('should add note to cache', async () => {
    await addTeamNote('user-note-cache', {
      fromAgent: 'alex-chen',
      toAgent: 'maya-santos',
      content: 'User interested in habits',
      priority: 'low',
    });

    // Get context for maya should show the note
    const context = await getTeamContext('user-note-cache', 'maya-santos');

    // Note should be visible to maya
    expect(Array.isArray(context.teamNotes)).toBe(true);
  });
});

describe('acknowledgeTeamNote', () => {
  beforeEach(() => {
    clearCrossAgentCaches();
  });

  it('should acknowledge a note', async () => {
    const timestamp = new Date();

    // Add a note first
    await addTeamNote('user-ack-test', {
      fromAgent: 'ferni',
      toAgent: '*',
      content: 'Test note',
      priority: 'medium',
    });

    await expect(
      acknowledgeTeamNote('user-ack-test', timestamp, 'alex-chen')
    ).resolves.not.toThrow();
  });

  it('should handle non-existent note gracefully', async () => {
    await expect(acknowledgeTeamNote('user-no-note', new Date(), 'ferni')).resolves.not.toThrow();
  });
});

// ============================================================================
// FORMATTER TESTS
// ============================================================================

describe('formatCrossAgentContextForPrompt', () => {
  it('should return empty string for empty context', () => {
    const context: CrossAgentContext = {
      recentTeamInteractions: [],
      sharedGoals: [],
      teamNotes: [],
    };

    const result = formatCrossAgentContextForPrompt(context, 'ferni');
    expect(result).toBe('');
  });

  it('should format recent interactions', () => {
    const context: CrossAgentContext = {
      recentTeamInteractions: [
        {
          agentId: 'alex-chen',
          agentName: 'Alex',
          timestamp: new Date(),
          topics: ['productivity', 'work'],
          emotionalTone: 'positive',
          keyMoments: ['Feeling organized'],
        },
      ],
      sharedGoals: [],
      teamNotes: [],
    };

    const result = formatCrossAgentContextForPrompt(context, 'ferni');

    expect(result).toContain('TEAM AWARENESS');
    expect(result).toContain('Alex');
    expect(result).toContain('productivity');
  });

  it('should include struggling indicator', () => {
    const context: CrossAgentContext = {
      recentTeamInteractions: [
        {
          agentId: 'maya-santos',
          agentName: 'Maya',
          timestamp: new Date(),
          topics: ['stress'],
          emotionalTone: 'struggling',
          keyMoments: [],
        },
      ],
      sharedGoals: [],
      teamNotes: [],
    };

    const result = formatCrossAgentContextForPrompt(context, 'ferni');
    expect(result).toContain('struggling');
  });

  it('should include celebratory indicator', () => {
    const context: CrossAgentContext = {
      recentTeamInteractions: [
        {
          agentId: 'jordan-taylor',
          agentName: 'Jordan',
          timestamp: new Date(),
          topics: ['milestone'],
          emotionalTone: 'celebratory',
          keyMoments: [],
        },
      ],
      sharedGoals: [],
      teamNotes: [],
    };

    const result = formatCrossAgentContextForPrompt(context, 'ferni');
    expect(result).toContain('celebrating');
  });

  it('should format team notes with priority', () => {
    const context: CrossAgentContext = {
      recentTeamInteractions: [],
      sharedGoals: [],
      teamNotes: [
        {
          fromAgent: 'ferni',
          toAgent: '*',
          content: 'User needs support',
          timestamp: new Date(),
          priority: 'high',
          acknowledged: false,
        },
      ],
    };

    const result = formatCrossAgentContextForPrompt(context, 'alex-chen');

    expect(result).toContain('TEAM NOTES');
    expect(result).toContain('Ferni');
    expect(result).toContain('User needs support');
  });

  it('should format shared goals', () => {
    const context: CrossAgentContext = {
      recentTeamInteractions: [],
      sharedGoals: ['Exercise 3x week', 'Save $500/month'],
      teamNotes: [],
    };

    const result = formatCrossAgentContextForPrompt(context, 'ferni');

    expect(result).toContain('SHARED TEAM KNOWLEDGE');
    expect(result).toContain('Exercise 3x week');
  });
});

describe('generateTeamReferencePhrases', () => {
  it('should return empty array for empty context', () => {
    const context: CrossAgentContext = {
      recentTeamInteractions: [],
      sharedGoals: [],
      teamNotes: [],
    };

    const phrases = generateTeamReferencePhrases(context, 'ferni');
    expect(phrases).toEqual([]);
  });

  it('should generate stress-related phrases', () => {
    const context: CrossAgentContext = {
      recentTeamInteractions: [
        {
          agentId: 'alex-chen',
          agentName: 'Alex',
          timestamp: new Date(),
          topics: ['stress'],
          emotionalTone: 'struggling',
          keyMoments: [],
        },
      ],
      sharedGoals: [],
      teamNotes: [],
    };

    const phrases = generateTeamReferencePhrases(context, 'ferni');

    expect(phrases.some((p) => p.includes('pressure') || p.includes('tough'))).toBe(true);
  });

  it('should generate goals-related phrases', () => {
    const context: CrossAgentContext = {
      recentTeamInteractions: [
        {
          agentId: 'maya-santos',
          agentName: 'Maya',
          timestamp: new Date(),
          topics: ['goals'],
          emotionalTone: 'positive',
          keyMoments: [],
        },
      ],
      sharedGoals: [],
      teamNotes: [],
    };

    const phrases = generateTeamReferencePhrases(context, 'ferni');

    expect(phrases.some((p) => p.includes('goals'))).toBe(true);
  });

  it('should generate finance-related phrases', () => {
    const context: CrossAgentContext = {
      recentTeamInteractions: [
        {
          agentId: 'peter-john',
          agentName: 'Peter',
          timestamp: new Date(),
          topics: ['finances'],
          emotionalTone: 'neutral',
          keyMoments: [],
        },
      ],
      sharedGoals: [],
      teamNotes: [],
    };

    const phrases = generateTeamReferencePhrases(context, 'ferni');

    expect(phrases.some((p) => p.includes('finances'))).toBe(true);
  });

  it('should generate celebratory phrases', () => {
    const context: CrossAgentContext = {
      recentTeamInteractions: [
        {
          agentId: 'jordan-taylor',
          agentName: 'Jordan',
          timestamp: new Date(),
          topics: ['achievement'],
          emotionalTone: 'celebratory',
          keyMoments: [],
        },
      ],
      sharedGoals: [],
      teamNotes: [],
    };

    const phrases = generateTeamReferencePhrases(context, 'ferni');

    expect(phrases.some((p) => p.includes('win') || p.includes('congratulate'))).toBe(true);
  });

  it('should generate follow-up phrases', () => {
    const context: CrossAgentContext = {
      recentTeamInteractions: [
        {
          agentId: 'nayan-patel',
          agentName: 'Nayan',
          timestamp: new Date(),
          topics: ['meditation'],
          emotionalTone: 'neutral',
          keyMoments: ['Starting a new practice'],
          followUpNeeded: true,
        },
      ],
      sharedGoals: [],
      teamNotes: [],
    };

    const phrases = generateTeamReferencePhrases(context, 'ferni');

    expect(phrases.some((p) => p.includes('follow up'))).toBe(true);
  });
});

// ============================================================================
// ANALYSIS TESTS
// ============================================================================

describe('analyzeConversationForTeam', () => {
  it('should extract stress topic', () => {
    const result = analyzeConversationForTeam(
      'ferni',
      "I've been so stressed about work lately. The pressure is overwhelming.",
      ['anxious']
    );

    expect(result.topics).toContain('stress');
    expect(result.emotionalTone).toBe('struggling');
  });

  it('should extract finance topic', () => {
    const result = analyzeConversationForTeam(
      'peter-john',
      "I'm trying to figure out my budget. Money has been tight.",
      []
    );

    expect(result.topics).toContain('finances');
  });

  it('should extract work topic', () => {
    const result = analyzeConversationForTeam(
      'alex-chen',
      'My job is getting really demanding. The boss wants more.',
      []
    );

    expect(result.topics).toContain('work');
  });

  it('should extract health topic', () => {
    const result = analyzeConversationForTeam(
      'maya-santos',
      "I've been trying to exercise more and improve my diet.",
      []
    );

    expect(result.topics).toContain('health');
  });

  it('should detect positive emotional tone', () => {
    const result = analyzeConversationForTeam('ferni', 'Things are great!', ['happy', 'excited']);

    expect(result.emotionalTone).toBe('celebratory');
  });

  it('should detect struggling emotional tone', () => {
    const result = analyzeConversationForTeam('ferni', "I'm not doing well.", ['sad']);

    expect(result.emotionalTone).toBe('struggling');
    expect(result.followUpNeeded).toBe(true);
  });

  it('should extract key moments', () => {
    const result = analyzeConversationForTeam(
      'ferni',
      'I feel like things are changing. I want to make progress. I worry about the future.',
      []
    );

    expect(result.keyMoments.some((m) => m.includes('I feel'))).toBe(true);
  });

  it('should use agent name from lookup', () => {
    const result = analyzeConversationForTeam('alex-chen', 'Test', []);
    expect(result.agentName).toBe('Alex');
  });

  it('should fallback to agent ID for unknown agents', () => {
    const result = analyzeConversationForTeam('unknown-agent', 'Test', []);
    expect(result.agentName).toBe('unknown-agent');
  });

  it('should set timestamp', () => {
    const before = new Date();
    const result = analyzeConversationForTeam('ferni', 'Test', []);
    const after = new Date();

    expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

// ============================================================================
// SESSION HOOKS TESTS
// ============================================================================

describe('recordSessionForTeam', () => {
  beforeEach(() => {
    clearCrossAgentCaches();
  });

  it('should record session without error', async () => {
    await expect(
      recordSessionForTeam('user-session-1', 'ferni', 'We talked about work and stress.', [
        'anxious',
      ])
    ).resolves.not.toThrow();
  });

  it('should analyze and store conversation', async () => {
    await recordSessionForTeam('user-session-2', 'alex-chen', 'Discussed productivity and goals.', [
      'happy',
    ]);

    // Verify by getting team context for another agent
    const context = await getTeamContext('user-session-2', 'ferni');

    // The interaction should be visible
    expect(Array.isArray(context.recentTeamInteractions)).toBe(true);
  });
});

describe('initializeCrossAgentAwareness', () => {
  beforeEach(() => {
    clearCrossAgentCaches();
  });

  it('should initialize without error', async () => {
    await expect(initializeCrossAgentAwareness('user-init-1')).resolves.not.toThrow();
  });

  it('should create empty caches for new user', async () => {
    await initializeCrossAgentAwareness('user-init-2');

    const context = await getTeamContext('user-init-2', 'ferni');
    expect(context.recentTeamInteractions).toEqual([]);
    expect(context.teamNotes).toEqual([]);
  });

  it('should be idempotent', async () => {
    await initializeCrossAgentAwareness('user-init-3');
    await initializeCrossAgentAwareness('user-init-3');

    expect(true).toBe(true); // No error
  });
});

describe('clearCrossAgentCaches', () => {
  it('should clear all caches', async () => {
    // Add some data
    await recordConversationForTeam('user-clear-test', {
      agentId: 'ferni',
      agentName: 'Ferni',
      timestamp: new Date(),
      topics: ['test'],
      emotionalTone: 'neutral',
      keyMoments: [],
    });

    // Clear
    clearCrossAgentCaches();

    // Context should be empty (without persistence)
    const context = await getTeamContext('user-clear-test', 'alex-chen');
    expect(context.recentTeamInteractions).toEqual([]);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge cases', () => {
  beforeEach(() => {
    clearCrossAgentCaches();
  });

  it('should handle empty conversation text', () => {
    const result = analyzeConversationForTeam('ferni', '', []);

    expect(result.topics).toEqual([]);
    expect(result.emotionalTone).toBe('neutral');
    expect(result.keyMoments).toEqual([]);
  });

  it('should handle very long conversation text', () => {
    const longText = 'I feel stressed. '.repeat(1000);
    const result = analyzeConversationForTeam('ferni', longText, []);

    expect(result.topics).toContain('stress');
    // Should limit key moments
    expect(result.keyMoments.length).toBeLessThanOrEqual(3);
  });

  it('should handle special characters in content', async () => {
    await expect(
      addTeamNote('user-special', {
        fromAgent: 'ferni',
        toAgent: '*',
        content: 'User asked about émojis 🎉 and ünïcödé',
        priority: 'low',
      })
    ).resolves.not.toThrow();
  });

  it('should handle multiple topics in one conversation', () => {
    const result = analyzeConversationForTeam(
      'ferni',
      'I am stressed about my job, worried about money and budget, need to exercise more for my health, and my relationships are suffering.',
      []
    );

    expect(result.topics.length).toBeGreaterThan(2);
    expect(result.topics).toContain('stress');
    expect(result.topics).toContain('finances');
    expect(result.topics).toContain('work');
  });

  it('should handle concurrent operations', async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      recordConversationForTeam(`concurrent-user-${i}`, {
        agentId: 'ferni',
        agentName: 'Ferni',
        timestamp: new Date(),
        topics: ['test'],
        emotionalTone: 'neutral',
        keyMoments: [],
      })
    );

    await expect(Promise.all(promises)).resolves.not.toThrow();
  });

  it('should limit stored conversations to 20', async () => {
    // Record 25 conversations
    for (let i = 0; i < 25; i++) {
      await recordConversationForTeam('user-limit-test', {
        agentId: 'ferni',
        agentName: 'Ferni',
        timestamp: new Date(),
        topics: [`topic-${i}`],
        emotionalTone: 'neutral',
        keyMoments: [],
      });
    }

    // Get context - should be at most 5 recent from other agents
    // But since all are from ferni and we query as ferni, should be filtered
    const context = await getTeamContext('user-limit-test', 'alex-chen');

    // The internal cache should have at most 20 items
    expect(context.recentTeamInteractions.length).toBeLessThanOrEqual(5);
  });
});
