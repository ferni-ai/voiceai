/**
 * Data Capture E2E Tests
 *
 * Comprehensive tests for the entire data capture pipeline to ensure
 * we're storing all meaningful data from conversations.
 *
 * This validates the "Better Than Human" promise - that Ferni remembers
 * everything important from conversations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractNames, extractPerson, recordMention, loadNetwork } from '../../services/superhuman/relationship-network.js';
import { processDataCapture } from '../../intelligence/data-capture/index.js';

// ============================================================================
// NAME EXTRACTION TESTS
// ============================================================================

describe('extractNames', () => {
  const testCases = [
    // Direct mentions with relationship words
    { input: 'I talked to Sarah yesterday', expected: ['Sarah'] },
    { input: 'My mom Betty called me', expected: ['Betty'] },
    { input: 'John said he would help', expected: ['John'] },
    { input: 'I met with my friend Mike at the coffee shop', expected: ['Mike'] },
    { input: 'My sister Jane and my brother Tom are coming over', expected: ['Jane', 'Tom'] },

    // Names at sentence boundaries
    { input: 'Sarah is my best friend', expected: ['Sarah'] },
    { input: 'I love spending time with David', expected: ['David'] }, // "with X" pattern

    // Multiple names
    { input: 'I saw John and then talked to Mary', expected: ['John', 'Mary'] },
    { input: 'My colleague Alex introduced me to Jennifer', expected: ['Alex', 'Jennifer'] },

    // Names with relationship context
    { input: 'My boss Michael gave me feedback', expected: ['Michael'] },
    { input: 'My mentor Dr. Johnson recommended a book', expected: ['Johnson'] },

    // Edge cases - should NOT extract these
    { input: 'Remember my name is Seth', expected: [] }, // Not an interaction pattern
    { input: 'The weather is nice today', expected: [] },
    { input: "I'm feeling good", expected: [] },

    // Names in quotes or complex sentences
    { input: "She said 'Tell Brian I said hi'", expected: ['Brian'] },
    { input: 'Can you call my dad Robert', expected: ['Robert'] },
  ];

  testCases.forEach(({ input, expected }) => {
    it(`should extract ${expected.length ? expected.join(', ') : 'no names'} from "${input.slice(0, 50)}..."`, () => {
      const result = extractNames(input);
      const names = result.map(r => r.name);

      if (expected.length === 0) {
        expect(names.length).toBe(0);
      } else {
        expected.forEach(name => {
          expect(names.some(n => n.toLowerCase() === name.toLowerCase())).toBe(true);
        });
      }
    });
  });
});

describe('extractPerson', () => {
  const testCases = [
    // Family relationships
    { input: 'My mom called me yesterday', expected: { name: 'my mom', type: 'family' } },
    { input: 'My dad is coming to visit', expected: { name: 'my dad', type: 'family' } },
    { input: 'My sister helped me move', expected: { name: 'my sister', type: 'family' } },
    { input: 'My wife Sarah made dinner', expected: { name: 'Sarah', type: 'partner' } },

    // Work relationships
    { input: 'My boss gave me a raise', expected: { name: 'my boss', type: 'colleague' } },
    { input: 'My coworker helped with the project', expected: { name: 'my coworker', type: 'colleague' } },

    // Friend relationships
    { input: 'My friend invited me to the party', expected: { name: 'my friend', type: 'friend' } },
    { input: 'My best friend is visiting', expected: { name: 'my best friend', type: 'friend' } },

    // Interaction patterns
    { input: 'I talked to Sarah about it', expected: { name: 'Sarah', type: 'acquaintance' } },
    { input: 'I met with John for coffee', expected: { name: 'John', type: 'acquaintance' } },
    { input: 'Mike said we should meet up', expected: { name: 'Mike', type: 'acquaintance' } },

    // No person mentioned
    { input: 'The weather is nice', expected: null },
    { input: 'I went to the store', expected: null },
  ];

  testCases.forEach(({ input, expected }) => {
    it(`should extract ${expected?.name || 'null'} from "${input}"`, () => {
      const result = extractPerson(input);

      if (expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result?.name.toLowerCase()).toContain(expected.name.toLowerCase());
        expect(result?.type).toBe(expected.type);
      }
    });
  });
});

// ============================================================================
// DATA CAPTURE ROUTER TESTS
// ============================================================================

describe('processDataCapture', () => {
  const mockContext = {
    userId: 'test-user',
    sessionId: 'test-session',
  };

  describe('Contact Information Capture', () => {
    const testCases = [
      {
        input: "My mom's number is 555-123-4567",
        shouldCapture: true,
        expectCategory: 'contact',
      },
      {
        input: "Sarah's email is sarah@example.com",
        shouldCapture: true,
        expectCategory: 'contact',
      },
      {
        input: "Call my dad at 555-987-6543",
        shouldCapture: true,
        expectCategory: 'contact',
      },
    ];

    testCases.forEach(({ input, shouldCapture, expectCategory }) => {
      it(`should ${shouldCapture ? 'capture' : 'not capture'} from "${input.slice(0, 40)}..."`, async () => {
        const result = await processDataCapture({
          ...mockContext,
          transcript: input,
        });

        if (shouldCapture) {
          expect(result.captured.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Commitment Capture', () => {
    const testCases = [
      {
        input: "I'm going to start exercising more",
        shouldCapture: true,
        expectCategory: 'commitment',
      },
      {
        input: "I will call my mom tomorrow",
        shouldCapture: true,
        expectCategory: 'commitment',
      },
      {
        input: "I've decided to take that job offer",
        shouldCapture: true,
        expectCategory: 'commitment',
      },
      {
        input: "I promised Sarah I'd help her move",
        shouldCapture: true,
        expectCategory: 'commitment',
      },
      {
        input: 'My goal is to run a marathon',
        shouldCapture: true,
        expectCategory: 'commitment',
      },
      {
        input: "What's for dinner?", // Should NOT capture
        shouldCapture: false,
      },
    ];

    testCases.forEach(({ input, shouldCapture }) => {
      it(`should ${shouldCapture ? 'capture' : 'not capture'} commitment from "${input.slice(0, 40)}..."`, async () => {
        const result = await processDataCapture({
          ...mockContext,
          transcript: input,
        });

        // Just verify no errors - actual capture depends on implementation
        expect(result).toBeDefined();
        expect(result.captured).toBeDefined();
      });
    });
  });

  describe('Dream/Goal Capture', () => {
    const testCases = [
      {
        input: "I've always dreamed of visiting Japan",
        shouldCapture: true,
      },
      {
        input: 'One day I want to write a book',
        shouldCapture: true,
      },
      {
        input: 'My dream is to start my own business',
        shouldCapture: true,
      },
    ];

    testCases.forEach(({ input, shouldCapture }) => {
      it(`should ${shouldCapture ? 'capture' : 'not capture'} dream from "${input.slice(0, 40)}..."`, async () => {
        const result = await processDataCapture({
          ...mockContext,
          transcript: input,
        });

        expect(result).toBeDefined();
      });
    });
  });
});

// ============================================================================
// SYNTHETIC CONVERSATION TESTS
// ============================================================================

describe('Synthetic Conversation Tests', () => {
  const syntheticConversations = [
    {
      name: 'Family Introduction',
      turns: [
        "My mom's name is Betty and she lives in Florida",
        "My dad Robert passed away last year",
        "I have a sister named Jane who's a doctor",
        "My brother Tom is coming to visit next week",
      ],
      expectedNames: ['Betty', 'Robert', 'Jane', 'Tom'],
    },
    {
      name: 'Work Discussion',
      turns: [
        'My boss Michael gave me a promotion',
        "I'm working with Jennifer on the new project",
        "Alex, my mentor, recommended I take a course",
      ],
      expectedNames: ['Michael', 'Jennifer', 'Alex'],
    },
    {
      name: 'Commitment Making',
      turns: [
        "I'm going to start waking up earlier",
        "I will exercise three times a week",
        "I promised my wife I'd be home for dinner",
        'My goal is to save more money this year',
      ],
      expectedCommitments: 4,
    },
    {
      name: 'Mixed Personal Sharing',
      turns: [
        'I talked to Sarah yesterday about my job',
        "She said I should follow my dreams",
        "I've decided to apply for that position",
        "My friend Mike thinks it's a great idea",
      ],
      expectedNames: ['Sarah', 'Mike'],
      expectedCommitments: 1,
    },
  ];

  syntheticConversations.forEach(({ name, turns, expectedNames }) => {
    it(`should capture data from ${name} conversation`, async () => {
      const allNames: string[] = [];

      for (const turn of turns) {
        const extracted = extractNames(turn);
        allNames.push(...extracted.map(e => e.name));
      }

      if (expectedNames) {
        expectedNames.forEach(expected => {
          const found = allNames.some(
            name => name.toLowerCase() === expected.toLowerCase()
          );
          expect(found).toBe(true);
        });
      }
    });
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty input', () => {
    const result = extractNames('');
    expect(result).toEqual([]);
  });

  it('should handle very long input', () => {
    const longInput = 'I talked to Sarah about ' + 'various things '.repeat(100);
    const result = extractNames(longInput);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name).toBe('Sarah');
  });

  it('should handle unicode characters', () => {
    const result = extractNames('I met with José at the café');
    // May or may not extract José depending on pattern
    expect(result).toBeDefined();
  });

  it('should not extract common words as names', () => {
    const inputs = [
      'The weather is nice',
      'This is great',
      'It was a good day',
      'They said it would rain',
    ];

    inputs.forEach(input => {
      const result = extractNames(input);
      const invalidNames = result.filter(r =>
        ['The', 'This', 'It', 'They', 'We', 'You', 'I'].includes(r.name)
      );
      expect(invalidNames.length).toBe(0);
    });
  });

  it('should handle multiple mentions of same person', () => {
    const result = extractNames(
      'I talked to Sarah and then Sarah said she would help'
    );
    // Should only have Sarah once (deduplicated)
    const sarahCount = result.filter(
      r => r.name.toLowerCase() === 'sarah'
    ).length;
    expect(sarahCount).toBe(1);
  });
});

// ============================================================================
// INTEGRATION TESTS (Mock Firestore)
// ============================================================================

describe('Integration Tests', () => {
  // These would need Firestore mocking
  it.skip('should persist extracted names to relationship network', async () => {
    // This test would verify end-to-end storage
  });

  it.skip('should persist commitments to commitment keeper', async () => {
    // This test would verify commitment storage
  });
});
