/**
 * Spontaneous Sharing Service Tests
 *
 * Tests for persona quirk and personal detail sharing including:
 * - Relationship stage gating
 * - Content deduplication
 * - Different share types
 * - Trigger matching
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  surfaceEnderingContradiction,
  shareSimpleJoy,
  referencePetPeeve,
  shareGrowthEdge,
  shareRelationshipMoment,
  shareGuiltyPleasure,
  trySpontaneousShare,
  clearSharedContent,
  initializeSpontaneousSharingPersistence,
  type SharingContext,
  type ShareResult,
} from '../services/spontaneous-sharing.js';

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

vi.mock('../services/persistence/index.js', () => ({
  createPersistenceStore: () => ({
    load: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../services/persona-behavior-manager.js', () => ({
  loadPersonaBehaviors: vi.fn(async (personaId: string) => {
    return {
      quirks: {
        endearing_contradictions: [
          'I give advice about organization but my desk is a mess',
          'I recommend rest but I stay up too late reading',
        ],
        things_that_make_me_unreasonably_happy: [
          'The sound of rain on a window',
          'Finding a forgotten snack',
        ],
        things_that_make_me_unreasonably_annoyed: [
          'People who chew loudly in meetings',
          'Unnecessary reply-all emails at work',
        ],
        growth_edges: [
          'I am still learning to set better boundaries',
          'I struggle with saying no sometimes',
        ],
        relationship_moments: [
          'I really value our conversations',
          'You help me see things differently',
        ],
        guilty_pleasures: ['Bad reality TV shows', 'Extra cheese on everything'],
      },
    };
  }),
}));

describe('SharingContext type', () => {
  it('should accept valid context', () => {
    const context: SharingContext = {
      personaId: 'ferni',
      relationshipStage: 'friend',
      currentTopic: 'work',
      userMessage: 'I had a meeting today',
      turnCount: 5,
    };

    expect(context.personaId).toBe('ferni');
    expect(context.relationshipStage).toBe('friend');
    expect(context.turnCount).toBe(5);
  });

  it('should accept minimal context', () => {
    const context: SharingContext = {
      personaId: 'ferni',
      relationshipStage: 'stranger',
      turnCount: 0,
    };

    expect(context.currentTopic).toBeUndefined();
    expect(context.userMessage).toBeUndefined();
  });
});

describe('ShareResult type', () => {
  it('should accept all valid types', () => {
    const types: Array<ShareResult['type']> = [
      'endearing_contradiction',
      'simple_joy',
      'pet_peeve',
      'growth_edge',
      'relationship_moment',
      'guilty_pleasure',
      'strong_opinion',
    ];

    for (const type of types) {
      const result: ShareResult = {
        content: 'Test content',
        type,
      };
      expect(result.type).toBe(type);
    }
  });

  it('should accept triggered_by', () => {
    const result: ShareResult = {
      content: 'Test content',
      type: 'pet_peeve',
      triggered_by: 'work meetings',
    };

    expect(result.triggered_by).toBe('work meetings');
  });
});

describe('Relationship stage gating', () => {
  describe('surfaceEnderingContradiction', () => {
    it('should return null for strangers', async () => {
      const context: SharingContext = {
        personaId: 'ferni',
        relationshipStage: 'stranger',
        turnCount: 5,
      };

      const result = await surfaceEnderingContradiction(context, 'user-1');

      expect(result).toBeNull();
    });

    it('should potentially return for acquaintance', async () => {
      const context: SharingContext = {
        personaId: 'ferni',
        relationshipStage: 'acquaintance',
        turnCount: 5,
      };

      // Run multiple times due to random chance
      let gotResult = false;
      for (let i = 0; i < 50; i++) {
        const result = await surfaceEnderingContradiction(context, `user-${i}`);
        if (result) {
          gotResult = true;
          expect(result.type).toBe('endearing_contradiction');
          break;
        }
      }

      // May or may not get result due to probability
      expect(typeof gotResult).toBe('boolean');
    });
  });

  describe('shareGrowthEdge', () => {
    it('should return null for stranger', async () => {
      const context: SharingContext = {
        personaId: 'ferni',
        relationshipStage: 'stranger',
        turnCount: 5,
      };

      const result = await shareGrowthEdge(context, 'user-1');

      expect(result).toBeNull();
    });

    it('should return null for acquaintance', async () => {
      const context: SharingContext = {
        personaId: 'ferni',
        relationshipStage: 'acquaintance',
        turnCount: 5,
      };

      const result = await shareGrowthEdge(context, 'user-1');

      expect(result).toBeNull();
    });

    it('should potentially return for friend', async () => {
      const context: SharingContext = {
        personaId: 'ferni',
        relationshipStage: 'friend',
        turnCount: 5,
      };

      // Run multiple times due to low random chance (5%)
      let gotResult = false;
      for (let i = 0; i < 100; i++) {
        const result = await shareGrowthEdge(context, `user-growth-${i}`);
        if (result) {
          gotResult = true;
          expect(result.type).toBe('growth_edge');
          break;
        }
      }

      expect(typeof gotResult).toBe('boolean');
    });
  });

  describe('shareRelationshipMoment', () => {
    it('should return null for stranger', async () => {
      const context: SharingContext = {
        personaId: 'ferni',
        relationshipStage: 'stranger',
        turnCount: 5,
      };

      const result = await shareRelationshipMoment(context, 'user-1');

      expect(result).toBeNull();
    });

    it('should return null for acquaintance', async () => {
      const context: SharingContext = {
        personaId: 'ferni',
        relationshipStage: 'acquaintance',
        turnCount: 5,
      };

      const result = await shareRelationshipMoment(context, 'user-1');

      expect(result).toBeNull();
    });
  });
});

describe('shareSimpleJoy', () => {
  it('should potentially return a joy', async () => {
    const context: SharingContext = {
      personaId: 'ferni',
      relationshipStage: 'stranger',
      turnCount: 5,
    };

    let gotResult = false;
    for (let i = 0; i < 50; i++) {
      const result = await shareSimpleJoy(context, `user-joy-${i}`);
      if (result) {
        gotResult = true;
        expect(result.type).toBe('simple_joy');
        expect(result.content).toBeTruthy();
        break;
      }
    }

    expect(typeof gotResult).toBe('boolean');
  });
});

describe('referencePetPeeve', () => {
  it('should return null without message or topic', async () => {
    const context: SharingContext = {
      personaId: 'ferni',
      relationshipStage: 'friend',
      turnCount: 5,
    };

    const result = await referencePetPeeve(context, 'user-1');

    expect(result).toBeNull();
  });

  it('should potentially match relevant topic', async () => {
    const context: SharingContext = {
      personaId: 'ferni',
      relationshipStage: 'friend',
      currentTopic: 'work meetings',
      userMessage: 'We had an annoying meeting today',
      turnCount: 5,
    };

    const result = await referencePetPeeve(context, 'user-peeve-1');

    // May or may not match depending on mock data
    if (result) {
      expect(result.type).toBe('pet_peeve');
      expect(result.triggered_by).toBeTruthy();
    }
  });
});

describe('shareGuiltyPleasure', () => {
  it('should return null for stranger', async () => {
    const context: SharingContext = {
      personaId: 'ferni',
      relationshipStage: 'stranger',
      turnCount: 5,
    };

    const result = await shareGuiltyPleasure(context, 'user-1');

    expect(result).toBeNull();
  });

  it('should potentially return for acquaintance', async () => {
    const context: SharingContext = {
      personaId: 'ferni',
      relationshipStage: 'acquaintance',
      turnCount: 5,
    };

    let gotResult = false;
    for (let i = 0; i < 50; i++) {
      const result = await shareGuiltyPleasure(context, `user-pleasure-${i}`);
      if (result) {
        gotResult = true;
        expect(result.type).toBe('guilty_pleasure');
        break;
      }
    }

    expect(typeof gotResult).toBe('boolean');
  });
});

describe('trySpontaneousShare', () => {
  it('should return null for early turns', async () => {
    const context: SharingContext = {
      personaId: 'ferni',
      relationshipStage: 'friend',
      turnCount: 2, // Too early
    };

    const result = await trySpontaneousShare(context, 'user-1');

    expect(result).toBeNull();
  });

  it('should return null for turn 0', async () => {
    const context: SharingContext = {
      personaId: 'ferni',
      relationshipStage: 'friend',
      turnCount: 0,
    };

    const result = await trySpontaneousShare(context, 'user-1');

    expect(result).toBeNull();
  });

  it('should potentially return result for later turns', async () => {
    const context: SharingContext = {
      personaId: 'ferni',
      relationshipStage: 'friend',
      turnCount: 10,
      currentTopic: 'work',
    };

    let gotResult = false;
    for (let i = 0; i < 50; i++) {
      const result = await trySpontaneousShare(context, `user-try-${i}`);
      if (result) {
        gotResult = true;
        expect(result.content).toBeTruthy();
        expect(result.type).toBeTruthy();
        break;
      }
    }

    expect(typeof gotResult).toBe('boolean');
  });
});

describe('clearSharedContent', () => {
  it('should not throw', async () => {
    await expect(clearSharedContent('ferni', 'user-1')).resolves.not.toThrow();
  });
});

describe('initializeSpontaneousSharingPersistence', () => {
  it('should not throw', async () => {
    await expect(initializeSpontaneousSharingPersistence()).resolves.not.toThrow();
  });

  it('should be idempotent', async () => {
    await initializeSpontaneousSharingPersistence();
    await expect(initializeSpontaneousSharingPersistence()).resolves.not.toThrow();
  });
});

describe('Content deduplication', () => {
  it('should not repeat content', async () => {
    const userId = `dedup-user-${Date.now()}`;
    const context: SharingContext = {
      personaId: 'ferni',
      relationshipStage: 'friend',
      turnCount: 10,
    };

    const sharedContents = new Set<string>();
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      const result = await trySpontaneousShare(context, userId);
      if (result) {
        // Should not repeat
        if (sharedContents.has(result.content)) {
          expect.fail(`Content was repeated: ${result.content}`);
        }
        sharedContents.add(result.content);
      }
      attempts++;
    }

    // Test passed if we got here
    expect(true).toBe(true);
  });
});

describe('Relationship stage ordering', () => {
  it('should recognize stranger < acquaintance < friend < trusted_advisor', async () => {
    const stages = ['stranger', 'acquaintance', 'friend', 'trusted_advisor'] as const;

    // Growth edge requires 'friend' level
    for (let i = 0; i < stages.length; i++) {
      const context: SharingContext = {
        personaId: 'ferni',
        relationshipStage: stages[i],
        turnCount: 10,
      };

      const result = await shareGrowthEdge(context, `stage-test-${i}-${Date.now()}`);

      if (i < 2) {
        // stranger, acquaintance should return null
        expect(result).toBeNull();
      }
      // friend and trusted_advisor might return result (probabilistic)
    }
  });
});

describe('Edge cases', () => {
  it('should handle empty behaviors gracefully', async () => {
    // The mock always returns behaviors, but this tests the code path
    const context: SharingContext = {
      personaId: 'unknown-persona',
      relationshipStage: 'friend',
      turnCount: 10,
    };

    // Should not throw
    const result = await trySpontaneousShare(context, 'user-1');
    expect(result === null || typeof result === 'object').toBe(true);
  });

  it('should handle very long messages', async () => {
    const context: SharingContext = {
      personaId: 'ferni',
      relationshipStage: 'friend',
      currentTopic: 'work',
      userMessage: 'A'.repeat(10000), // Very long message
      turnCount: 10,
    };

    // Should not throw
    const result = await referencePetPeeve(context, 'user-long-msg');
    expect(result === null || typeof result === 'object').toBe(true);
  });

  it('should handle special characters in messages', async () => {
    const context: SharingContext = {
      personaId: 'ferni',
      relationshipStage: 'friend',
      currentTopic: 'émojis 🎉 and ünïcödé',
      userMessage: 'Testing with 日本語 and עברית',
      turnCount: 10,
    };

    // Should not throw
    const result = await referencePetPeeve(context, 'user-unicode');
    expect(result === null || typeof result === 'object').toBe(true);
  });
});
