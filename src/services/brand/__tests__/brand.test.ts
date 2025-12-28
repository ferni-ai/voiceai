/**
 * Brand Service Tests
 *
 * Tests for persona voice profiles, greetings, response patterns, and anti-patterns.
 */

import { describe, it, expect } from 'vitest';

import {
  PERSONA_VOICES,
  getPersonaVoice,
  getCorePersonas,
  getMarketplacePersonas,
  getRandomGreeting,
  getResponsePatterns,
  containsAntiPattern,
} from '../persona-voices.js';

describe('PersonaVoices', () => {
  describe('PERSONA_VOICES', () => {
    it('should have all core team personas defined', () => {
      expect(PERSONA_VOICES.ferni).toBeDefined();
      expect(PERSONA_VOICES.jack).toBeDefined();
      expect(PERSONA_VOICES.peter).toBeDefined();
      expect(PERSONA_VOICES.alex).toBeDefined();
      expect(PERSONA_VOICES.maya).toBeDefined();
      expect(PERSONA_VOICES.jordan).toBeDefined();
      expect(PERSONA_VOICES.nayan).toBeDefined();
    });

    it('should have all marketplace personas defined', () => {
      expect(PERSONA_VOICES.eli).toBeDefined();
      expect(PERSONA_VOICES.marcus).toBeDefined();
      expect(PERSONA_VOICES.kenji).toBeDefined();
      expect(PERSONA_VOICES.carmen).toBeDefined();
      expect(PERSONA_VOICES.amara).toBeDefined();
      expect(PERSONA_VOICES.sasha).toBeDefined();
      expect(PERSONA_VOICES.ray).toBeDefined();
    });

    it('should have 14 total personas', () => {
      expect(Object.keys(PERSONA_VOICES)).toHaveLength(14);
    });

    it('should have consistent structure for each persona', () => {
      for (const [id, persona] of Object.entries(PERSONA_VOICES)) {
        expect(persona.id).toBe(id);
        expect(typeof persona.name).toBe('string');
        expect(typeof persona.role).toBe('string');
        expect(typeof persona.archetype).toBe('string');
        expect(typeof persona.tone).toBe('string');
        expect(typeof persona.speakingStyle).toBe('string');
        expect(Array.isArray(persona.vocabularyBias)).toBe(true);
        expect(Array.isArray(persona.greetings)).toBe(true);
        expect(Array.isArray(persona.signaturePhrases)).toBe(true);
        expect(Array.isArray(persona.antiPatterns)).toBe(true);
        expect(persona.colors).toBeDefined();
        expect(persona.responsePatterns).toBeDefined();
      }
    });

    it('should have required response pattern contexts', () => {
      const requiredContexts = [
        'celebration',
        'support',
        'coaching',
        'checkin',
        'onboarding',
        'error',
        'notification',
        'marketing',
      ];

      for (const persona of Object.values(PERSONA_VOICES)) {
        for (const context of requiredContexts) {
          expect(
            persona.responsePatterns[context as keyof typeof persona.responsePatterns]
          ).toBeDefined();
        }
      }
    });

    it('should have non-empty greetings for each persona', () => {
      for (const persona of Object.values(PERSONA_VOICES)) {
        expect(persona.greetings.length).toBeGreaterThan(0);
      }
    });

    it('should have non-empty antiPatterns for each persona', () => {
      for (const persona of Object.values(PERSONA_VOICES)) {
        expect(persona.antiPatterns.length).toBeGreaterThan(0);
      }
    });

    it('should have valid color values', () => {
      for (const persona of Object.values(PERSONA_VOICES)) {
        expect(persona.colors.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(persona.colors.secondary).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(persona.colors.glow).toContain('rgba');
      }
    });
  });

  describe('Ferni persona', () => {
    it('should have correct identity', () => {
      const ferni = PERSONA_VOICES.ferni;

      expect(ferni.name).toBe('Ferni');
      expect(ferni.role).toBe('Life Coach');
      expect(ferni.archetype).toBe('The Warm Friend Who Really Listens');
    });

    it('should have warm, human vocabulary bias', () => {
      const ferni = PERSONA_VOICES.ferni;

      expect(ferni.vocabularyBias).toContain('notice');
      expect(ferni.vocabularyBias).toContain('curious');
      expect(ferni.vocabularyBias).toContain('I remember');
    });

    it('should have correct brand color', () => {
      expect(PERSONA_VOICES.ferni.colors.primary).toBe('#4a6741');
    });

    it('should have anti-patterns against robotic speech', () => {
      const ferni = PERSONA_VOICES.ferni;

      expect(ferni.antiPatterns).toContain('As an AI...');
      expect(ferni.antiPatterns).toContain("I'm designed to...");
    });
  });

  describe('getPersonaVoice', () => {
    it('should return persona by ID', () => {
      const ferni = getPersonaVoice('ferni');

      expect(ferni.id).toBe('ferni');
      expect(ferni.name).toBe('Ferni');
    });

    it('should return different personas correctly', () => {
      expect(getPersonaVoice('maya').name).toBe('Maya');
      expect(getPersonaVoice('peter').name).toBe('Peter');
      expect(getPersonaVoice('jordan').name).toBe('Jordan');
      expect(getPersonaVoice('eli').name).toBe('Eli');
    });

    it('should fallback to ferni for unknown persona', () => {
      const unknown = getPersonaVoice('nonexistent' as 'ferni');

      expect(unknown.id).toBe('ferni');
    });
  });

  describe('getCorePersonas', () => {
    it('should return 7 core team personas', () => {
      const core = getCorePersonas();

      expect(core).toHaveLength(7);
    });

    it('should include all core team members', () => {
      const core = getCorePersonas();
      const coreIds = core.map((p) => p.id);

      expect(coreIds).toContain('ferni');
      expect(coreIds).toContain('jack');
      expect(coreIds).toContain('peter');
      expect(coreIds).toContain('alex');
      expect(coreIds).toContain('maya');
      expect(coreIds).toContain('jordan');
      expect(coreIds).toContain('nayan');
    });

    it('should not include marketplace personas', () => {
      const core = getCorePersonas();
      const coreIds = core.map((p) => p.id);

      expect(coreIds).not.toContain('eli');
      expect(coreIds).not.toContain('marcus');
      expect(coreIds).not.toContain('kenji');
    });
  });

  describe('getMarketplacePersonas', () => {
    it('should return 7 marketplace personas', () => {
      const marketplace = getMarketplacePersonas();

      expect(marketplace).toHaveLength(7);
    });

    it('should include all marketplace members', () => {
      const marketplace = getMarketplacePersonas();
      const marketplaceIds = marketplace.map((p) => p.id);

      expect(marketplaceIds).toContain('eli');
      expect(marketplaceIds).toContain('marcus');
      expect(marketplaceIds).toContain('kenji');
      expect(marketplaceIds).toContain('carmen');
      expect(marketplaceIds).toContain('amara');
      expect(marketplaceIds).toContain('sasha');
      expect(marketplaceIds).toContain('ray');
    });

    it('should not include core personas', () => {
      const marketplace = getMarketplacePersonas();
      const marketplaceIds = marketplace.map((p) => p.id);

      expect(marketplaceIds).not.toContain('ferni');
      expect(marketplaceIds).not.toContain('maya');
    });
  });

  describe('getRandomGreeting', () => {
    it('should return a greeting string', () => {
      const greeting = getRandomGreeting('ferni');

      expect(typeof greeting).toBe('string');
      expect(greeting.length).toBeGreaterThan(0);
    });

    it('should return one of the persona greetings', () => {
      const ferni = PERSONA_VOICES.ferni;

      // Run multiple times to test randomness
      for (let i = 0; i < 10; i++) {
        const greeting = getRandomGreeting('ferni');
        expect(ferni.greetings).toContain(greeting);
      }
    });

    it('should work for different personas', () => {
      const mayaGreeting = getRandomGreeting('maya');
      const eliGreeting = getRandomGreeting('eli');

      expect(PERSONA_VOICES.maya.greetings).toContain(mayaGreeting);
      expect(PERSONA_VOICES.eli.greetings).toContain(eliGreeting);
    });
  });

  describe('getResponsePatterns', () => {
    it('should return patterns for valid context', () => {
      const patterns = getResponsePatterns('ferni', 'celebration');

      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should return correct celebration patterns', () => {
      const patterns = getResponsePatterns('ferni', 'celebration');

      expect(patterns).toContain('You did it. I knew you would.');
    });

    it('should return correct support patterns', () => {
      const patterns = getResponsePatterns('ferni', 'support');

      expect(patterns).toContain("I'm here. Take your time.");
    });

    it('should fallback to checkin for unknown context', () => {
      const patterns = getResponsePatterns('ferni', 'unknown_context' as 'checkin');
      const checkinPatterns = getResponsePatterns('ferni', 'checkin');

      expect(patterns).toEqual(checkinPatterns);
    });

    it('should work for marketplace personas', () => {
      const eliPatterns = getResponsePatterns('eli', 'support');

      expect(eliPatterns).toContain('We work with your brain, not against it.');
    });
  });

  describe('containsAntiPattern', () => {
    it('should detect anti-pattern in content', () => {
      // Anti-patterns must be matched exactly (including ...)
      const result = containsAntiPattern('As an AI... I cannot do that', 'ferni');

      expect(result).toBe('As an AI...');
    });

    it('should return null when no anti-pattern found', () => {
      const result = containsAntiPattern("I'm here. What's on your mind?", 'ferni');

      expect(result).toBeNull();
    });

    it('should be case insensitive', () => {
      const result = containsAntiPattern('as an ai... I am designed to help', 'ferni');

      expect(result).toBe('As an AI...');
    });

    it('should detect persona-specific anti-patterns', () => {
      // Maya anti-pattern - exact match
      const mayaResult = containsAntiPattern(
        'You need to be more organized. Fix your habits.',
        'maya'
      );
      expect(mayaResult).toBe('You need to be more organized.');

      // Eli anti-pattern
      const eliResult = containsAntiPattern('Just focus. Try harder.', 'eli');
      expect(eliResult).toBe('Just focus.');

      // Jack anti-pattern
      const jackResult = containsAntiPattern('You should... probably try harder', 'jack');
      expect(jackResult).toBe('You should...');
    });

    it('should work with content containing the full anti-pattern', () => {
      const result = containsAntiPattern("I'm designed to... help you with many tasks", 'ferni');

      expect(result).toBe("I'm designed to...");
    });

    it('should return null when content only has partial match', () => {
      // Content has "As an AI" but not "As an AI..."
      const result = containsAntiPattern('As an AI, I should help', 'ferni');

      expect(result).toBeNull();
    });
  });

  describe('Persona archetypes', () => {
    it('should have unique archetypes for each persona', () => {
      const archetypes = Object.values(PERSONA_VOICES).map((p) => p.archetype);
      const uniqueArchetypes = new Set(archetypes);

      expect(uniqueArchetypes.size).toBe(archetypes.length);
    });

    it('should have relationship-focused archetypes', () => {
      // All archetypes should emphasize human relationships (Friend, Companion, etc.)
      const relationshipPatterns = [
        'friend',
        'companion',
        'partner',
        'ally',
        'guide',
        'catalyst',
        'architect',
        'advisor',
        'grandfather',
      ];

      for (const persona of Object.values(PERSONA_VOICES)) {
        const archetype = persona.archetype.toLowerCase();
        const hasRelationshipFocus = relationshipPatterns.some((pattern) =>
          archetype.includes(pattern)
        );
        expect(hasRelationshipFocus).toBe(true);
      }
    });
  });

  describe('Marketplace persona specialties', () => {
    it('should have Eli focused on ADHD', () => {
      const eli = PERSONA_VOICES.eli;

      expect(eli.role).toBe('ADHD Coach');
      expect(eli.vocabularyBias).toContain('dopamine');
      expect(eli.vocabularyBias).toContain('body double');
    });

    it('should have Marcus focused on sobriety', () => {
      const marcus = PERSONA_VOICES.marcus;

      expect(marcus.role).toBe('Sobriety Companion');
      expect(marcus.vocabularyBias).toContain('one day');
      expect(marcus.vocabularyBias).toContain('not alone');
    });

    it('should have Kenji focused on sleep', () => {
      const kenji = PERSONA_VOICES.kenji;

      expect(kenji.role).toBe('Sleep Guide');
      expect(kenji.vocabularyBias).toContain('rest');
      expect(kenji.vocabularyBias).toContain('breathe');
    });

    it('should have Carmen focused on parenting', () => {
      const carmen = PERSONA_VOICES.carmen;

      expect(carmen.role).toBe('Parenting Partner');
      expect(carmen.vocabularyBias).toContain("you're doing great");
    });

    it('should have Amara focused on chronic illness', () => {
      const amara = PERSONA_VOICES.amara;

      expect(amara.role).toBe('Chronic Illness Ally');
      expect(amara.vocabularyBias).toContain('pace yourself');
      expect(amara.antiPatterns).toContain("You don't look sick.");
    });

    it('should have Sasha focused on creativity', () => {
      const sasha = PERSONA_VOICES.sasha;

      expect(sasha.role).toBe('Creative Catalyst');
      expect(sasha.vocabularyBias).toContain('wild idea');
      expect(sasha.vocabularyBias).toContain('experiment');
    });

    it('should have Ray focused on career', () => {
      const ray = PERSONA_VOICES.ray;

      expect(ray.role).toBe('Career Architect');
      expect(ray.vocabularyBias).toContain('strategy');
      expect(ray.vocabularyBias).toContain('opportunity');
    });
  });
});
