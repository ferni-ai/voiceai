/**
 * Life Coaching Content Integration Tests
 *
 * Tests the PhD-level research base, persona methodologies, and tool integration.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  loadResearchBase,
  loadPersonaMethodology,
  getFramework,
  getDomainResearch,
  getFrameworksForDomain,
  getCognitiveDistortions,
  getAttachmentStyles,
  getFourHorsemen,
  clearContentCaches,
} from '../tools/domains/life-coaching-shared/content/content-loader.js';
import {
  getEnrichedToolContext,
  selectPhrase,
  selectKeyFinding,
  enrichResponse,
  getHandoffNotes,
} from '../tools/domains/life-coaching-shared/content/tool-integration.js';

// ============================================================================
// RESEARCH BASE TESTS
// ============================================================================

describe('Research Base Loading', () => {
  beforeAll(() => {
    clearContentCaches();
  });

  it('should load research base successfully', async () => {
    const research = await loadResearchBase();

    expect(research).toBeDefined();
    expect(research.meta).toBeDefined();
    expect(research.frameworks).toBeDefined();
    expect(research.domainSpecificResearch).toBeDefined();
  });

  it('should have core frameworks', async () => {
    const research = await loadResearchBase();
    const frameworkKeys = Object.keys(research.frameworks);

    expect(frameworkKeys).toContain('cbt');
    expect(frameworkKeys).toContain('act');
    expect(frameworkKeys).toContain('dbt');
    expect(frameworkKeys).toContain('ifs');
    expect(frameworkKeys).toContain('polyvagal');
    expect(frameworkKeys).toContain('attachmentTheory');
    expect(frameworkKeys).toContain('gottmanMethod');
    expect(frameworkKeys).toContain('selfCompassion');
  });

  it('should have domain-specific research', async () => {
    const research = await loadResearchBase();
    const domainKeys = Object.keys(research.domainSpecificResearch);

    expect(domainKeys).toContain('boundaries');
    expect(domainKeys).toContain('anger');
    expect(domainKeys).toContain('procrastination');
    expect(domainKeys).toContain('burnout');
    expect(domainKeys).toContain('trauma');
  });

  it('should have valid framework structure', async () => {
    const cbt = await getFramework('cbt');

    expect(cbt).not.toBeNull();
    expect(cbt!.name).toBe('Cognitive Behavioral Therapy');
    expect(cbt!.coreIdea).toBeDefined();
    expect(cbt!.keyPrinciple).toBeDefined();
    expect(cbt!.efficacy).toBeDefined();
    expect(cbt!.domains).toBeInstanceOf(Array);
    expect(cbt!.citations).toBeInstanceOf(Array);
    expect(cbt!.citations.length).toBeGreaterThan(0);
  });

  it('should have cognitive distortions in CBT', async () => {
    const distortions = await getCognitiveDistortions();

    expect(distortions.length).toBeGreaterThan(0);
    expect(distortions[0]).toHaveProperty('name');
    expect(distortions[0]).toHaveProperty('description');
    expect(distortions[0]).toHaveProperty('example');
  });

  it('should have attachment styles', async () => {
    const styles = await getAttachmentStyles();

    expect(styles.length).toBe(4);
    expect(styles.map((s) => s.style)).toContain('Secure');
    expect(styles.map((s) => s.style)).toContain('Anxious-Preoccupied');
    expect(styles.map((s) => s.style)).toContain('Dismissive-Avoidant');
    expect(styles.map((s) => s.style)).toContain('Fearful-Avoidant');
  });

  it('should have Four Horsemen', async () => {
    const horsemen = await getFourHorsemen();

    expect(horsemen.length).toBe(4);
    expect(horsemen.map((h) => h.horseman)).toContain('Criticism');
    expect(horsemen.map((h) => h.horseman)).toContain('Contempt');
    expect(horsemen.map((h) => h.horseman)).toContain('Defensiveness');
    expect(horsemen.map((h) => h.horseman)).toContain('Stonewalling');

    // Each should have antidote
    horsemen.forEach((h) => {
      expect(h.antidote).toBeDefined();
      expect(h.antidote.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// DOMAIN RESEARCH TESTS
// ============================================================================

describe('Domain Research', () => {
  it('should get boundaries research', async () => {
    const research = await getDomainResearch('boundaries');

    expect(research).not.toBeNull();
    expect(research!.leadingExperts).toBeInstanceOf(Array);
    expect(research!.keyFindings).toBeInstanceOf(Array);
    expect(research!.citations).toBeInstanceOf(Array);
  });

  it('should get anger research', async () => {
    const research = await getDomainResearch('anger');

    expect(research).not.toBeNull();
    expect(research!.leadingExperts.length).toBeGreaterThan(0);
    // Should have meaningful key findings about anger
    expect(research!.keyFindings.length).toBeGreaterThan(0);
    expect(research!.keyFindings.some((f) => f.toLowerCase().includes('anger'))).toBe(true);
  });

  it('should get frameworks for a domain', async () => {
    const frameworks = await getFrameworksForDomain('boundaries');

    expect(frameworks.length).toBeGreaterThan(0);
    // DBT should be relevant to boundaries
    expect(frameworks.map((f) => f.name)).toContain('Dialectical Behavior Therapy');
  });

  it('should handle unknown domains gracefully', async () => {
    const research = await getDomainResearch('nonexistent-domain');
    expect(research).toBeNull();
  });
});

// ============================================================================
// PERSONA METHODOLOGY TESTS
// ============================================================================

describe('Persona Methodologies', () => {
  describe('Maya Methodologies', () => {
    it('should load boundaries methodology', async () => {
      const methodology = await loadPersonaMethodology('maya-santos', 'boundaries');

      expect(methodology).not.toBeNull();
      expect(methodology!.meta.personaId).toBe('maya');
      expect(methodology!.meta.domain).toBe('boundaries');
      expect(methodology!.meta.philosophy).toBeDefined();
    });

    it('should have Maya-specific approach', async () => {
      const methodology = await loadPersonaMethodology('maya-santos', 'boundaries');

      expect(methodology!.mayasApproach).toBeDefined();
      expect(methodology!.mayasApproach.coreBeliefs).toBeInstanceOf(Array);
      expect(methodology!.mayasApproach.uniqueAngle).toBeDefined();
    });

    it('should have Maya phrases', async () => {
      const methodology = await loadPersonaMethodology('maya-santos', 'boundaries');

      expect(methodology!.mayasPhrases).toBeDefined();
      expect(methodology!.mayasPhrases.opening).toBeInstanceOf(Array);
      expect(methodology!.mayasPhrases.validation).toBeInstanceOf(Array);
    });

    it('should load procrastination methodology', async () => {
      const methodology = await loadPersonaMethodology('maya-santos', 'procrastination');
      expect(methodology).not.toBeNull();
      expect(methodology!.meta.domain).toBe('procrastination');
    });

    it('should load burnout-recovery methodology', async () => {
      const methodology = await loadPersonaMethodology('maya-santos', 'burnout-recovery');
      expect(methodology).not.toBeNull();
    });
  });

  describe('Nayan Methodologies', () => {
    it('should load boundaries methodology', async () => {
      const methodology = await loadPersonaMethodology('nayan-patel', 'boundaries');

      expect(methodology).not.toBeNull();
      expect(methodology!.meta.personaId).toBe('nayan');
      expect(methodology!.nayansApproach).toBeDefined();
    });

    it('should have wisdom traditions', async () => {
      const methodology = await loadPersonaMethodology('nayan-patel', 'boundaries');

      expect(methodology!.frameworkIntegration.wisdomTraditions).toBeDefined();
      expect(methodology!.frameworkIntegration.wisdomTraditions.length).toBeGreaterThan(0);
    });

    it('should load anger methodology', async () => {
      const methodology = await loadPersonaMethodology('nayan-patel', 'anger');
      expect(methodology).not.toBeNull();
    });

    it('should load trauma-support methodology', async () => {
      const methodology = await loadPersonaMethodology('nayan-patel', 'trauma-support');
      expect(methodology).not.toBeNull();
      expect(methodology!.safetyProtocols).toBeDefined();
    });
  });

  describe('Alex Methodologies', () => {
    it('should load social-skills methodology', async () => {
      const methodology = await loadPersonaMethodology('alex-chen', 'social-skills');
      expect(methodology).not.toBeNull();
    });

    it('should load dating methodology', async () => {
      const methodology = await loadPersonaMethodology('alex-chen', 'dating');
      expect(methodology).not.toBeNull();
    });
  });

  describe('Jordan Methodologies', () => {
    it('should load life-planning methodology', async () => {
      const methodology = await loadPersonaMethodology('jordan-taylor', 'life-planning');
      expect(methodology).not.toBeNull();
    });

    it('should load breakup-recovery methodology', async () => {
      const methodology = await loadPersonaMethodology('jordan-taylor', 'breakup-recovery');
      expect(methodology).not.toBeNull();
    });
  });

  describe('Ferni Methodologies', () => {
    it('should load core methodology', async () => {
      const methodology = await loadPersonaMethodology('ferni', 'core');
      expect(methodology).not.toBeNull();
      expect(methodology!.fernisApproach).toBeDefined();
      expect(methodology!.betterThanHuman).toBeDefined();
    });
  });
});

// ============================================================================
// TOOL INTEGRATION TESTS
// ============================================================================

describe('Tool Integration', () => {
  describe('Enriched Tool Context', () => {
    it('should get enriched context for Maya + boundaries', async () => {
      const context = await getEnrichedToolContext({
        personaId: 'maya-santos',
        domain: 'boundaries',
      });

      expect(context.research).not.toBeNull();
      expect(context.frameworks.length).toBeGreaterThan(0);
      expect(context.methodology).not.toBeNull();
    });

    it('should include persona phrases', async () => {
      const context = await getEnrichedToolContext({
        personaId: 'maya-santos',
        domain: 'boundaries',
      });

      expect(context.phrases.opening.length).toBeGreaterThan(0);
      expect(context.phrases.validation.length).toBeGreaterThan(0);
    });

    it('should adapt for Four Tendencies', async () => {
      const context = await getEnrichedToolContext({
        personaId: 'maya-santos',
        domain: 'boundaries',
        fourTendency: 'obliger',
      });

      expect(context.tendencyApproach).toBeDefined();
      expect(context.tendencyApproach!.strength).toBeDefined();
      expect(context.tendencyApproach!.challenge).toBeDefined();
      expect(context.tendencyApproach!.approach).toBeDefined();
    });

    it('should handle missing methodology gracefully', async () => {
      const context = await getEnrichedToolContext({
        personaId: 'peter-john', // Peter doesn't have boundaries methodology
        domain: 'boundaries',
      });

      expect(context.methodology).toBeNull();
      expect(context.phrases.opening).toEqual([]);
    });
  });

  describe('Response Enrichment', () => {
    it('should enrich response with validation', async () => {
      const context = await getEnrichedToolContext({
        personaId: 'maya-santos',
        domain: 'boundaries',
      });

      const enriched = enrichResponse('Here is my main response.', context, {
        includeValidation: true,
      });

      expect(enriched).toContain('Here is my main response.');
      // Should have validation phrase added
      expect(enriched.length).toBeGreaterThan('Here is my main response.'.length);
    });

    it('should include research when requested', async () => {
      const context = await getEnrichedToolContext({
        personaId: 'maya-santos',
        domain: 'boundaries',
      });

      const enriched = enrichResponse('Here is my main response.', context, {
        includeResearch: true,
      });

      if (context.research && context.research.keyFindings.length > 0) {
        expect(enriched).toContain('Research shows:');
      }
    });
  });

  describe('Helper Functions', () => {
    it('should select random phrase', () => {
      const phrases = ['First', 'Second', 'Third'];
      const selected = selectPhrase(phrases);

      expect(phrases).toContain(selected);
    });

    it('should handle empty phrases array', () => {
      const selected = selectPhrase([]);
      expect(selected).toBe('');
    });

    it('should select key finding', async () => {
      const research = await getDomainResearch('boundaries');
      const finding = selectKeyFinding(research);

      expect(finding).toBeDefined();
      expect(typeof finding).toBe('string');
    });
  });

  describe('Handoff Notes', () => {
    it('should get handoff notes between personas', async () => {
      const notes = await getHandoffNotes('maya-santos', 'boundaries', 'nayan');

      expect(notes).not.toBeNull();
      expect(notes).toContain('Nayan');
    });

    it('should return null for missing handoff notes', async () => {
      const notes = await getHandoffNotes('nonexistent', 'boundaries', 'maya');
      expect(notes).toBeNull();
    });
  });
});

// ============================================================================
// CONTENT QUALITY TESTS
// ============================================================================

describe('Content Quality', () => {
  it('should have meaningful framework descriptions', async () => {
    const cbt = await getFramework('cbt');

    expect(cbt!.coreIdea.length).toBeGreaterThan(20);
    expect(cbt!.keyPrinciple.length).toBeGreaterThan(20);
  });

  it('should have proper citations format', async () => {
    const cbt = await getFramework('cbt');

    cbt!.citations.forEach((citation) => {
      // Should have author and year format
      expect(citation).toMatch(/\(\d{4}\)/);
    });
  });

  it('should have expert names in proper format', async () => {
    const research = await getDomainResearch('boundaries');

    research!.leadingExperts.forEach((expert) => {
      // Should have Dr., PhD, LCSW, or similar credential
      expect(expert.name).toMatch(/Dr\.|PhD|LCSW|LPC|MSW/i);
    });
  });

  it('should not have placeholder content', async () => {
    const research = await loadResearchBase();

    const researchStr = JSON.stringify(research);
    expect(researchStr).not.toContain('TODO');
    expect(researchStr).not.toContain('placeholder');
    expect(researchStr).not.toContain('Lorem ipsum');
  });
});

// ============================================================================
// CROSS-PERSONA CONSISTENCY TESTS
// ============================================================================

describe('Cross-Persona Consistency', () => {
  it('should have handoff notes to other personas', async () => {
    const mayaBoundaries = await loadPersonaMethodology('maya-santos', 'boundaries');
    const nayanBoundaries = await loadPersonaMethodology('nayan-patel', 'boundaries');

    // Both should reference each other
    expect(mayaBoundaries!.handoffNotes).toBeDefined();
    expect(nayanBoundaries!.handoffNotes).toBeDefined();

    expect(mayaBoundaries!.handoffNotes.toNayan).toBeDefined();
    expect(nayanBoundaries!.handoffNotes.toMaya).toBeDefined();
  });

  it('should reference same underlying frameworks', async () => {
    const mayaBoundaries = await loadPersonaMethodology('maya-santos', 'boundaries');
    const nayanBoundaries = await loadPersonaMethodology('nayan-patel', 'boundaries');

    // Both should reference DBT's DEAR MAN even if applied differently
    const mayaMethodologyStr = JSON.stringify(mayaBoundaries);
    const nayanMethodologyStr = JSON.stringify(nayanBoundaries);

    // At least one common framework reference
    const commonFrameworks = ['DBT', 'IFS', 'Self-Compassion', 'Cloud', 'Townsend'];
    const mayaHasCommon = commonFrameworks.some((f) => mayaMethodologyStr.includes(f));
    const nayanHasCommon = commonFrameworks.some((f) => nayanMethodologyStr.includes(f));

    expect(mayaHasCommon).toBe(true);
    expect(nayanHasCommon).toBe(true);
  });
});
