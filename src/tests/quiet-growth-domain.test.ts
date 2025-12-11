/**
 * Quiet Growth Domain Tests
 *
 * Tests for the anti-hustle, rest-positive growth philosophy domain.
 * Validates tool definitions, wisdom content, and brand alignment.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { ToolDefinition } from '../tools/registry/types.js';

describe('Quiet Growth Domain', () => {
  let tools: ToolDefinition[];

  beforeAll(async () => {
    // Import the definitions directly from the quiet-growth module
    const quietGrowth = await import('../tools/domains/quiet-growth/index.js');
    tools = quietGrowth.definitions;
  });

  describe('Tool Registration', () => {
    it('should export tool definitions', () => {
      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should have expected tool count (10 tools)', () => {
      expect(tools.length).toBe(10);
    });

    it('should have all required properties for each tool', () => {
      for (const tool of tools) {
        expect(tool.id).toBeDefined();
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.domain).toBe('quiet-growth');
        expect(typeof tool.create).toBe('function');
      }
    });

    it('should have unique tool IDs', () => {
      const ids = tools.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Expected Tools', () => {
    const expectedTools = [
      'honorTheRest',
      'celebrateMaintenance',
      'enoughForToday',
      'seasonalWisdom',
      'winterSeason',
      'gentleGoals',
      'releaseUrgency',
      'goodEnough',
      'compareToYesterday',
      'embracePlateau',
    ];

    it.each(expectedTools)('should include %s tool', (toolId) => {
      const tool = tools.find((t) => t.id === toolId);
      expect(tool).toBeDefined();
    });
  });

  describe('Anti-Hustle Philosophy', () => {
    it('should have rest permission tool (honorTheRest)', () => {
      const tool = tools.find((t) => t.id === 'honorTheRest');
      expect(tool).toBeDefined();
      expect(tool?.description.toLowerCase()).toContain('rest');
    });

    it('should have maintenance celebration tool', () => {
      const tool = tools.find((t) => t.id === 'celebrateMaintenance');
      expect(tool).toBeDefined();
      // The tool uses "holding steady" language instead of "maintain"
      expect(tool?.description.toLowerCase()).toContain('holding steady');
    });

    it('should have plateau embracing tool', () => {
      const tool = tools.find((t) => t.id === 'embracePlateau');
      expect(tool).toBeDefined();
    });

    it('should have seasonal wisdom tool', () => {
      const tool = tools.find((t) => t.id === 'seasonalWisdom');
      expect(tool).toBeDefined();
    });
  });

  describe('Brand Alignment', () => {
    it('should use warm, non-judgmental language in descriptions', () => {
      const judgmentalTerms = [
        'lazy',
        'failure',
        'should have',
        'you need to',
        "you're not",
        'wrong',
        "don't be",
        "can't",
        'never',
      ];

      for (const tool of tools) {
        const desc = tool.description.toLowerCase();
        for (const term of judgmentalTerms) {
          expect(desc).not.toContain(term);
        }
      }
    });

    it('should use positive, permissive language', () => {
      const permissiveTerms = ['permission', 'enough', 'gentle', 'allow', 'embrace', 'celebrate'];
      const descriptions = tools.map((t) => t.description.toLowerCase()).join(' ');

      // At least some tools should have permissive language
      const hasPermissiveLanguage = permissiveTerms.some((term) => descriptions.includes(term));
      expect(hasPermissiveLanguage).toBe(true);
    });
  });

  describe('Cross-Domain Integration', () => {
    it('should have additionalDomains for key tools', () => {
      const toolsWithCrossDomain = tools.filter(
        (t) => t.additionalDomains && t.additionalDomains.length > 0
      );
      expect(toolsWithCrossDomain.length).toBeGreaterThan(0);
    });

    it('honorTheRest should link to related domains', () => {
      const tool = tools.find((t) => t.id === 'honorTheRest');
      expect(tool?.additionalDomains).toBeDefined();
      expect(tool?.additionalDomains).toContain('presence');
      expect(tool?.additionalDomains).toContain('self-compassion');
    });
  });

  describe('Tags', () => {
    it('should have tags for filtering', () => {
      for (const tool of tools) {
        expect(tool.tags).toBeDefined();
        expect(Array.isArray(tool.tags)).toBe(true);
        expect(tool.tags?.includes('quiet-growth')).toBe(true);
      }
    });

    it('should have semantic tags', () => {
      const allTags = new Set(tools.flatMap((t) => t.tags || []));
      expect(allTags.has('rest')).toBe(true);
      expect(allTags.has('permission')).toBe(true);
    });
  });
});

describe('Quiet Growth Proactive Triggers', () => {
  // These are tested via dynamic import since the module uses ESM
  let generateRestPermissionMessage: (
    signType: 'overwork' | 'burnout' | 'relentless' | 'no_breaks'
  ) => { opener: string; body: string; question?: string; tone: string };
  let generatePlateauCelebrationMessage: (
    plateauType: 'maintaining' | 'integration' | 'holding_gains'
  ) => { opener: string; body: string; question?: string; tone: string };
  let generateSeasonalTransitionMessage: (season: 'spring' | 'summer' | 'autumn' | 'winter') => {
    opener: string;
    body: string;
    question?: string;
    tone: string;
  };
  let generateEnoughForTodayMessage: () => {
    opener: string;
    body: string;
    question?: string;
    tone: string;
  };
  let generateGentlePaceCheckMessage: (paceType: 'rushing' | 'comparing' | 'urgency') => {
    opener: string;
    body: string;
    question?: string;
    tone: string;
  };

  beforeAll(async () => {
    const module = await import('../tools/proactive-coaching.js');
    generateRestPermissionMessage = module.generateRestPermissionMessage;
    generatePlateauCelebrationMessage = module.generatePlateauCelebrationMessage;
    generateSeasonalTransitionMessage = module.generateSeasonalTransitionMessage;
    generateEnoughForTodayMessage = module.generateEnoughForTodayMessage;
    generateGentlePaceCheckMessage = module.generateGentlePaceCheckMessage;
  });

  describe('Rest Permission Messages', () => {
    it('should generate overwork message', () => {
      const msg = generateRestPermissionMessage('overwork');
      expect(msg.opener).toBeDefined();
      expect(msg.body).toBeDefined();
      expect(msg.tone).toBe('gentle');
    });

    it('should generate burnout message', () => {
      const msg = generateRestPermissionMessage('burnout');
      expect(msg.tone).toBe('warm');
    });
  });

  describe('Plateau Celebration Messages', () => {
    it('should generate maintaining message', () => {
      const msg = generatePlateauCelebrationMessage('maintaining');
      expect(msg.opener).toContain('plateau');
      expect(msg.tone).toBe('celebratory');
    });

    it('should generate integration message', () => {
      const msg = generatePlateauCelebrationMessage('integration');
      expect(msg.tone).toBe('warm');
    });
  });

  describe('Seasonal Transition Messages', () => {
    const seasons = ['spring', 'summer', 'autumn', 'winter'] as const;

    it.each(seasons)('should generate %s message', (season) => {
      const msg = generateSeasonalTransitionMessage(season);
      expect(msg.opener).toBeDefined();
      expect(msg.body).toBeDefined();
      expect(msg.question).toBeDefined();
    });

    it('winter should have gentle tone', () => {
      const msg = generateSeasonalTransitionMessage('winter');
      expect(msg.tone).toBe('gentle');
    });

    it('spring should have encouraging tone', () => {
      const msg = generateSeasonalTransitionMessage('spring');
      expect(msg.tone).toBe('encouraging');
    });
  });

  describe('Enough For Today Messages', () => {
    it('should return a valid message', () => {
      const msg = generateEnoughForTodayMessage();
      expect(msg.opener).toBeDefined();
      expect(msg.body).toBeDefined();
      expect(['warm', 'gentle']).toContain(msg.tone);
    });
  });

  describe('Gentle Pace Check Messages', () => {
    it('should generate rushing message', () => {
      const msg = generateGentlePaceCheckMessage('rushing');
      expect(msg.opener).toBeDefined();
      expect(msg.tone).toBe('curious');
    });

    it('should generate comparing message', () => {
      const msg = generateGentlePaceCheckMessage('comparing');
      expect(msg.body).toContain('comparison');
      expect(msg.tone).toBe('gentle');
    });
  });
});
