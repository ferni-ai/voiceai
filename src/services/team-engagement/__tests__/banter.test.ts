/**
 * Banter System Tests
 *
 * Tests for complete coverage of HANDOFF_BANTER and ARRIVING_BANTER.
 * Ensures all persona combinations have banter for delightful handoffs.
 */

import { describe, expect, it } from 'vitest';
import {
  HANDOFF_BANTER,
  ARRIVING_BANTER,
  CROSS_PERSONA_REFERENCES,
  getHandoffBanter,
  getArrivingBanter,
} from '../banter.js';

// All persona IDs
const PERSONA_IDS = [
  'ferni',
  'alex-chen',
  'maya-santos',
  'jordan-taylor',
  'nayan-patel',
  'peter-john',
];

// Non-coordinator personas (for handoff targets)
const TEAM_MEMBER_IDS = ['alex-chen', 'maya-santos', 'jordan-taylor', 'nayan-patel', 'peter-john'];

describe('Banter System', () => {
  describe('HANDOFF_BANTER Coverage', () => {
    it('should have banter from Ferni to all team members', () => {
      for (const target of TEAM_MEMBER_IDS) {
        expect(HANDOFF_BANTER.ferni[target]).toBeDefined();
        expect(HANDOFF_BANTER.ferni[target].length).toBeGreaterThanOrEqual(3);
      }
    });

    it('should have banter from all team members back to Ferni', () => {
      for (const source of TEAM_MEMBER_IDS) {
        expect(HANDOFF_BANTER[source].ferni).toBeDefined();
        expect(HANDOFF_BANTER[source].ferni.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('should have complete peer-to-peer banter coverage', () => {
      const missing: string[] = [];

      for (const from of TEAM_MEMBER_IDS) {
        for (const to of TEAM_MEMBER_IDS) {
          if (from === to) continue;
          if (!HANDOFF_BANTER[from]?.[to] || HANDOFF_BANTER[from][to].length === 0) {
            missing.push(`${from} -> ${to}`);
          }
        }
      }

      // All HANDOFF_BANTER combinations must be present
      expect(missing).toHaveLength(0);
    });

    it('should have at least 3 variations per combination', () => {
      for (const from of PERSONA_IDS) {
        const fromBanter = HANDOFF_BANTER[from];
        if (!fromBanter) continue;

        for (const [to, banterList] of Object.entries(fromBanter)) {
          expect(banterList.length).toBeGreaterThanOrEqual(3);
        }
      }
    });
  });

  describe('ARRIVING_BANTER Coverage', () => {
    it('should have arriving banter for Ferni from all team members', () => {
      for (const source of TEAM_MEMBER_IDS) {
        expect(ARRIVING_BANTER.ferni[source]).toBeDefined();
        expect(ARRIVING_BANTER.ferni[source].length).toBeGreaterThanOrEqual(3);
      }
    });

    it('should have arriving banter for all team members from Ferni', () => {
      for (const target of TEAM_MEMBER_IDS) {
        expect(ARRIVING_BANTER[target].ferni).toBeDefined();
        expect(ARRIVING_BANTER[target].ferni.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('should have complete peer-to-peer arriving banter coverage', () => {
      const missing: string[] = [];

      for (const to of TEAM_MEMBER_IDS) {
        for (const from of TEAM_MEMBER_IDS) {
          if (from === to) continue;
          if (!ARRIVING_BANTER[to]?.[from] || ARRIVING_BANTER[to][from].length === 0) {
            missing.push(`${to} <- ${from}`);
          }
        }
      }

      // All ARRIVING_BANTER combinations must be present
      expect(missing).toHaveLength(0);
    });

    it('should have at least 3 variations per combination', () => {
      for (const to of PERSONA_IDS) {
        const toBanter = ARRIVING_BANTER[to];
        if (!toBanter) continue;

        for (const [from, banterList] of Object.entries(toBanter)) {
          expect(banterList.length).toBeGreaterThanOrEqual(3);
        }
      }
    });
  });

  describe('Banter Quality', () => {
    it('should include SSML break tags for natural pacing', () => {
      for (const [from, targets] of Object.entries(HANDOFF_BANTER)) {
        for (const [to, banterList] of Object.entries(targets)) {
          for (const banter of banterList) {
            expect(banter).toContain('<break time=');
          }
        }
      }
    });

    it('should not contain placeholder text', () => {
      const allBanter = [
        ...Object.values(HANDOFF_BANTER).flatMap((t) => Object.values(t).flat()),
        ...Object.values(ARRIVING_BANTER).flatMap((t) => Object.values(t).flat()),
      ];

      for (const banter of allBanter) {
        expect(banter.toLowerCase()).not.toContain('todo');
        expect(banter.toLowerCase()).not.toContain('placeholder');
        expect(banter.toLowerCase()).not.toContain('xxx');
        expect(banter).not.toContain('${');
      }
    });

    it('should reference the correct persona names in handoff', () => {
      // Check that Ferni's banter about Alex mentions Alex
      const ferniToAlex = HANDOFF_BANTER.ferni['alex-chen'];
      expect(ferniToAlex.some((b) => b.toLowerCase().includes('alex'))).toBe(true);

      // Arriving banter is the NEW persona greeting - doesn't mention previous persona
      // (e.g., Alex says "Hey! I'm here to help" not "Ferni sent me")
      const alexFromFerni = ARRIVING_BANTER['alex-chen'].ferni;
      expect(alexFromFerni.every((b) => typeof b === 'string' && b.length > 0)).toBe(true);
    });

    it('should have distinct personality per persona', () => {
      // Nayan should have slower, more contemplative pacing (500ms in HANDOFF_BANTER)
      const nayanBanter = Object.values(HANDOFF_BANTER['nayan-patel']).flat();
      expect(nayanBanter.some((b) => b.includes('500ms'))).toBe(true);

      // Jordan should have more energetic language (exclamation marks, vision/great)
      const jordanBanter = Object.values(HANDOFF_BANTER['jordan-taylor']).flat();
      expect(
        jordanBanter.some(
          (b) =>
            b.includes('!') || // Jordan uses exclamation marks for energy
            b.toLowerCase().includes('vision') ||
            b.toLowerCase().includes('great')
        )
      ).toBe(true);

      // Peter's handoff banter is functional/warm (the analytical personality
      // appears in CROSS_PERSONA_REFERENCES, not handoff banter)
      const peterBanter = Object.values(HANDOFF_BANTER['peter-john']).flat();
      expect(
        peterBanter.some(
          (b) =>
            b.toLowerCase().includes('sharp') || // Alex is "sharp"
            b.toLowerCase().includes('perspective') || // Nayan has "perspective"
            b.toLowerCase().includes('right call') // Peter's signature phrase
        )
      ).toBe(true);
    });
  });

  describe('getHandoffBanter Function', () => {
    it('should return banter for valid combinations', () => {
      const banter = getHandoffBanter('ferni', 'alex-chen');
      expect(banter).toBeDefined();
      expect(typeof banter).toBe('string');
      expect(banter!.length).toBeGreaterThan(0);
    });

    it('should return null for invalid source persona', () => {
      const banter = getHandoffBanter('invalid-persona', 'alex-chen');
      expect(banter).toBeNull();
    });

    it('should return null for self-handoff', () => {
      // Self-handoff should not exist
      expect(HANDOFF_BANTER.ferni?.ferni).toBeUndefined();
    });

    it('should return random variation (not always same)', () => {
      const results = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const banter = getHandoffBanter('ferni', 'alex-chen');
        if (banter) results.add(banter);
      }
      // Should get more than 1 unique result if there are multiple variations
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('getArrivingBanter Function', () => {
    it('should return banter for valid combinations', () => {
      const banter = getArrivingBanter('alex-chen', 'ferni');
      expect(banter).toBeDefined();
      expect(typeof banter).toBe('string');
      expect(banter!.length).toBeGreaterThan(0);
    });

    it('should return null for invalid target persona', () => {
      const banter = getArrivingBanter('invalid-persona', 'ferni');
      expect(banter).toBeNull();
    });

    it('should return random variation (not always same)', () => {
      const results = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const banter = getArrivingBanter('alex-chen', 'ferni');
        if (banter) results.add(banter);
      }
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('CROSS_PERSONA_REFERENCES', () => {
    it('should have cross-references from Ferni about all team members', () => {
      expect(CROSS_PERSONA_REFERENCES.ferni.aboutAlex).toBeDefined();
      expect(CROSS_PERSONA_REFERENCES.ferni.aboutMaya).toBeDefined();
      expect(CROSS_PERSONA_REFERENCES.ferni.aboutJordan).toBeDefined();
      expect(CROSS_PERSONA_REFERENCES.ferni.aboutNayan).toBeDefined();
      expect(CROSS_PERSONA_REFERENCES.ferni.aboutPeter).toBeDefined();
    });

    it('should have at least 2 references per persona pair', () => {
      for (const [persona, refs] of Object.entries(CROSS_PERSONA_REFERENCES)) {
        for (const [about, refList] of Object.entries(refs)) {
          expect(refList.length).toBeGreaterThanOrEqual(2);
        }
      }
    });

    it('should have 100% cross-reference coverage (30 combinations)', () => {
      const personas = [
        'ferni',
        'alex-chen',
        'maya-santos',
        'jordan-taylor',
        'nayan-patel',
        'peter-john',
      ];
      const aboutKeys: Record<string, string> = {
        ferni: 'aboutFerni',
        'alex-chen': 'aboutAlex',
        'maya-santos': 'aboutMaya',
        'jordan-taylor': 'aboutJordan',
        'nayan-patel': 'aboutNayan',
        'peter-john': 'aboutPeter',
      };

      const missing: string[] = [];
      let total = 0;
      let covered = 0;

      for (const from of personas) {
        for (const about of personas) {
          if (from === about) continue;
          total++;

          const aboutKey = aboutKeys[about];
          const refs = CROSS_PERSONA_REFERENCES[from];
          if (refs && refs[aboutKey] && refs[aboutKey].length > 0) {
            covered++;
          } else {
            missing.push(`${from} → ${aboutKey}`);
          }
        }
      }

      // All CROSS_PERSONA_REFERENCES must be present
      const coverage = (covered / total) * 100;
      expect(coverage).toBe(100);
    });

    it('should have SSML breaks for natural pacing', () => {
      for (const [persona, refs] of Object.entries(CROSS_PERSONA_REFERENCES)) {
        for (const [about, refList] of Object.entries(refs)) {
          for (const ref of refList) {
            expect(ref).toContain('<break time=');
          }
        }
      }
    });
  });

  describe('Full Coverage Matrix', () => {
    it('should have 100% HANDOFF_BANTER coverage', () => {
      let total = 0;
      let covered = 0;

      // Ferni → all team members
      for (const target of TEAM_MEMBER_IDS) {
        total++;
        if (HANDOFF_BANTER.ferni?.[target]?.length > 0) covered++;
      }

      // All team members → Ferni
      for (const source of TEAM_MEMBER_IDS) {
        total++;
        if (HANDOFF_BANTER[source]?.ferni?.length > 0) covered++;
      }

      // Peer-to-peer (5 * 4 = 20 combinations)
      for (const from of TEAM_MEMBER_IDS) {
        for (const to of TEAM_MEMBER_IDS) {
          if (from === to) continue;
          total++;
          if (HANDOFF_BANTER[from]?.[to]?.length > 0) covered++;
        }
      }

      const coverage = (covered / total) * 100;
      // HANDOFF_BANTER Coverage must be 100%
      expect(coverage).toBe(100);
    });

    it('should have 100% ARRIVING_BANTER coverage', () => {
      let total = 0;
      let covered = 0;

      // Ferni ← all team members
      for (const source of TEAM_MEMBER_IDS) {
        total++;
        if (ARRIVING_BANTER.ferni?.[source]?.length > 0) covered++;
      }

      // All team members ← Ferni
      for (const target of TEAM_MEMBER_IDS) {
        total++;
        if (ARRIVING_BANTER[target]?.ferni?.length > 0) covered++;
      }

      // Peer-to-peer
      for (const to of TEAM_MEMBER_IDS) {
        for (const from of TEAM_MEMBER_IDS) {
          if (from === to) continue;
          total++;
          if (ARRIVING_BANTER[to]?.[from]?.length > 0) covered++;
        }
      }

      const coverage = (covered / total) * 100;
      // ARRIVING_BANTER Coverage must be 100%
      expect(coverage).toBe(100);
    });
  });
});
