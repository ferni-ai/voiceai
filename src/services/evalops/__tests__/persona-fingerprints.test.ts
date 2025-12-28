/**
 * Persona Voice Fingerprints Tests
 */
import { describe, expect, it } from 'vitest';

import {
  ferniFingerprint,
  peterFingerprint,
  mayaFingerprint,
  alexFingerprint,
  jordanFingerprint,
  nayanFingerprint,
  personaFingerprints,
  getPersonaFingerprint,
  getFingerprrintedPersonas,
  analyzeSignaturePhraseUsage,
  detectAntiPatterns,
  calculateVoiceDrift,
  getVoiceConsistencyScore,
} from '../persona-fingerprints.js';

describe('PersonaFingerprints', () => {
  describe('Fingerprint Registry', () => {
    it('should have fingerprints for all main personas', () => {
      expect(personaFingerprints['ferni']).toBeDefined();
      expect(personaFingerprints['peter-john']).toBeDefined();
      expect(personaFingerprints['maya-santos']).toBeDefined();
      expect(personaFingerprints['alex-chen']).toBeDefined();
      expect(personaFingerprints['jordan-taylor']).toBeDefined();
      expect(personaFingerprints['nayan-patel']).toBeDefined();
    });

    it('should return correct fingerprint for each persona', () => {
      expect(getPersonaFingerprint('ferni')).toBe(ferniFingerprint);
      expect(getPersonaFingerprint('peter-john')).toBe(peterFingerprint);
      expect(getPersonaFingerprint('maya-santos')).toBe(mayaFingerprint);
    });

    it('should return undefined for unknown persona', () => {
      expect(getPersonaFingerprint('unknown-persona')).toBeUndefined();
    });

    it('should list all fingerprinted personas', () => {
      const personas = getFingerprrintedPersonas();

      expect(personas).toContain('ferni');
      expect(personas).toContain('peter-john');
      expect(personas).toContain('maya-santos');
      expect(personas).toContain('alex-chen');
      expect(personas).toContain('jordan-taylor');
      expect(personas).toContain('nayan-patel');
      expect(personas.length).toBe(6);
    });
  });

  describe('Fingerprint Structure', () => {
    const allFingerprints = [
      ferniFingerprint,
      peterFingerprint,
      mayaFingerprint,
      alexFingerprint,
      jordanFingerprint,
      nayanFingerprint,
    ];

    it('each fingerprint should have required fields', () => {
      for (const fp of allFingerprints) {
        expect(fp.personaId).toBeDefined();
        expect(fp.signaturePhrases.length).toBeGreaterThan(0);
        expect(fp.antiPatterns.length).toBeGreaterThan(0);
        expect(fp.vocabularyProfile).toBeDefined();
        expect(fp.sentenceProfile).toBeDefined();
        expect(fp.emotionalTone).toBeDefined();
        expect(fp.reasoningIndicators).toBeDefined();
      }
    });

    it('each fingerprint should have valid emotional tone values', () => {
      for (const fp of allFingerprints) {
        expect(fp.emotionalTone.warmth).toBeGreaterThanOrEqual(0);
        expect(fp.emotionalTone.warmth).toBeLessThanOrEqual(1);
        expect(fp.emotionalTone.directness).toBeGreaterThanOrEqual(0);
        expect(fp.emotionalTone.directness).toBeLessThanOrEqual(1);
        expect(fp.emotionalTone.energy).toBeGreaterThanOrEqual(0);
        expect(fp.emotionalTone.energy).toBeLessThanOrEqual(1);
      }
    });

    it('should have vocabulary drift indicators', () => {
      for (const fp of allFingerprints) {
        expect(fp.vocabularyProfile.frequentWords.length).toBeGreaterThan(0);
        expect(fp.vocabularyProfile.driftIndicators.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Ferni Fingerprint', () => {
    it('should have narrative reasoning style', () => {
      expect(ferniFingerprint.reasoningIndicators.style).toBe('narrative');
      expect(ferniFingerprint.reasoningIndicators.evidenceUsage).toBe('stories');
    });

    it('should have high warmth', () => {
      expect(ferniFingerprint.emotionalTone.warmth).toBeGreaterThanOrEqual(0.8);
    });

    it('should have high question frequency', () => {
      expect(ferniFingerprint.sentenceProfile.questionFrequency).toBe('high');
    });

    it('should include Wyoming and Japan references in signature phrases', () => {
      expect(ferniFingerprint.signaturePhrases).toContain('Wyoming');
      expect(ferniFingerprint.signaturePhrases.some((p) => p.includes('Japan'))).toBe(true);
    });

    it('should avoid data-driven language as anti-patterns', () => {
      expect(ferniFingerprint.antiPatterns).toContain('the data shows');
      expect(ferniFingerprint.antiPatterns).toContain('research indicates');
    });
  });

  describe('Peter Fingerprint', () => {
    it('should have analytical reasoning style', () => {
      expect(peterFingerprint.reasoningIndicators.style).toBe('analytical');
      expect(peterFingerprint.reasoningIndicators.evidenceUsage).toBe('data');
    });

    it('should have lower warmth than Ferni', () => {
      expect(peterFingerprint.emotionalTone.warmth).toBeLessThan(
        ferniFingerprint.emotionalTone.warmth
      );
    });

    it('should have negative analyticalVsEmotional (strongly analytical)', () => {
      expect(peterFingerprint.emotionalTone.analyticalVsEmotional).toBeLessThan(0);
    });

    it('should include data/research in signature phrases', () => {
      expect(peterFingerprint.signaturePhrases).toContain('the data shows');
      expect(peterFingerprint.signaturePhrases).toContain('research indicates');
    });
  });

  describe('Maya Fingerprint', () => {
    it('should have empathetic reasoning style', () => {
      expect(mayaFingerprint.reasoningIndicators.style).toBe('empathetic');
    });

    it('should have highest warmth', () => {
      expect(mayaFingerprint.emotionalTone.warmth).toBeGreaterThanOrEqual(0.9);
    });

    it('should avoid harsh language', () => {
      expect(mayaFingerprint.antiPatterns).toContain('you should');
      expect(mayaFingerprint.antiPatterns).toContain('failure');
    });

    it('should include gentle/compassionate vocabulary', () => {
      expect(mayaFingerprint.vocabularyProfile.frequentWords).toContain('gentle');
      expect(mayaFingerprint.vocabularyProfile.frequentWords).toContain('compassion');
    });
  });

  describe('Alex Fingerprint', () => {
    it('should have systematic reasoning style', () => {
      expect(alexFingerprint.reasoningIndicators.style).toBe('systematic');
    });

    it('should have high directness', () => {
      expect(alexFingerprint.emotionalTone.directness).toBeGreaterThanOrEqual(0.8);
    });

    it('should have short sentence profile', () => {
      expect(alexFingerprint.sentenceProfile.averageLength).toBe('short');
    });

    it('should include step-by-step and template language', () => {
      expect(alexFingerprint.signaturePhrases).toContain('step by step');
      expect(alexFingerprint.signaturePhrases.some((p) => p.includes('template'))).toBe(true);
    });
  });

  describe('Jordan Fingerprint', () => {
    it('should have pragmatic reasoning style', () => {
      expect(jordanFingerprint.reasoningIndicators.style).toBe('pragmatic');
    });

    it('should have highest energy', () => {
      const allEnergies = [
        ferniFingerprint.emotionalTone.energy,
        peterFingerprint.emotionalTone.energy,
        mayaFingerprint.emotionalTone.energy,
        alexFingerprint.emotionalTone.energy,
        nayanFingerprint.emotionalTone.energy,
      ];
      expect(jordanFingerprint.emotionalTone.energy).toBeGreaterThanOrEqual(
        Math.max(...allEnergies)
      );
    });

    it('should include excitement language', () => {
      expect(jordanFingerprint.signaturePhrases.some((p) => p.includes('exciting'))).toBe(true);
      expect(jordanFingerprint.signaturePhrases).toContain("let's make this happen");
    });
  });

  describe('Nayan Fingerprint', () => {
    it('should have intuitive reasoning style', () => {
      expect(nayanFingerprint.reasoningIndicators.style).toBe('intuitive');
      expect(nayanFingerprint.reasoningIndicators.evidenceUsage).toBe('principles');
    });

    it('should have lowest energy (calm)', () => {
      const allEnergies = [
        ferniFingerprint.emotionalTone.energy,
        peterFingerprint.emotionalTone.energy,
        mayaFingerprint.emotionalTone.energy,
        alexFingerprint.emotionalTone.energy,
        jordanFingerprint.emotionalTone.energy,
      ];
      expect(nayanFingerprint.emotionalTone.energy).toBeLessThanOrEqual(Math.min(...allEnergies));
    });

    it('should have low directness (contemplative)', () => {
      expect(nayanFingerprint.emotionalTone.directness).toBeLessThanOrEqual(0.5);
    });

    it('should avoid rushed language', () => {
      expect(nayanFingerprint.antiPatterns).toContain('quick fix');
      expect(nayanFingerprint.antiPatterns).toContain('immediately');
    });
  });

  describe('analyzeSignaturePhraseUsage', () => {
    it('should detect signature phrases in response', () => {
      const response = 'Let me ask you this - what would it mean if you stay the course?';
      const { used, usageRate } = analyzeSignaturePhraseUsage(response, ferniFingerprint);

      expect(used).toContain('stay the course');
      expect(used).toContain('what would it mean if');
      expect(used).toContain('let me ask you this');
      expect(usageRate).toBeGreaterThan(0);
    });

    it('should return empty array when no phrases detected', () => {
      const response = 'The weather is nice today.';
      const { used, usageRate } = analyzeSignaturePhraseUsage(response, ferniFingerprint);

      expect(used).toEqual([]);
      expect(usageRate).toBe(0);
    });

    it('should be case insensitive', () => {
      const response = 'THE DATA SHOWS a clear pattern here.';
      const { used } = analyzeSignaturePhraseUsage(response, peterFingerprint);

      expect(used).toContain('the data shows');
    });

    it('should calculate usage rate correctly', () => {
      const response = 'Research indicates the trend is positive.';
      const { used, usageRate } = analyzeSignaturePhraseUsage(response, peterFingerprint);

      expect(used.length).toBe(1);
      expect(usageRate).toBe(1 / peterFingerprint.signaturePhrases.length);
    });
  });

  describe('detectAntiPatterns', () => {
    it('should detect anti-patterns in response', () => {
      // Ferni using Peter's language
      const response = 'The data shows you should optimize your workflow.';
      const { detected, violationCount } = detectAntiPatterns(response, ferniFingerprint);

      expect(detected).toContain('the data shows');
      expect(violationCount).toBeGreaterThan(0);
    });

    it('should return empty array when no anti-patterns detected', () => {
      const response = 'Let me ask you this - what matters most to you?';
      const { detected, violationCount } = detectAntiPatterns(response, ferniFingerprint);

      expect(detected).toEqual([]);
      expect(violationCount).toBe(0);
    });

    it('should be case insensitive', () => {
      const response = 'You SHOULD work harder.';
      const { detected } = detectAntiPatterns(response, mayaFingerprint);

      expect(detected).toContain('you should');
    });

    it('should detect multiple anti-patterns', () => {
      // Maya using harsh language
      const response = 'You should not be such a failure. You must do better.';
      const { detected, violationCount } = detectAntiPatterns(response, mayaFingerprint);

      expect(violationCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('calculateVoiceDrift', () => {
    it('should return low drift for on-voice response', () => {
      const onVoiceResponse =
        "Let me ask you this - what would it mean if you stayed the course? I'm curious about your heart's true desire.";
      const drift = calculateVoiceDrift(onVoiceResponse, ferniFingerprint);

      expect(drift).toBeLessThan(0.3);
    });

    it('should return high drift for off-voice response', () => {
      // Ferni speaking like Peter
      const offVoiceResponse =
        'The data shows that statistically you should optimize your algorithm for maximum efficiency.';
      const drift = calculateVoiceDrift(offVoiceResponse, ferniFingerprint);

      expect(drift).toBeGreaterThan(0.2);
    });

    it('should return drift between 0 and 1', () => {
      const responses = [
        'Hello, how are you?',
        'The data shows optimization is key.',
        'Stay the course and believe in yourself.',
      ];

      for (const response of responses) {
        const drift = calculateVoiceDrift(response, ferniFingerprint);
        expect(drift).toBeGreaterThanOrEqual(0);
        expect(drift).toBeLessThanOrEqual(1);
      }
    });

    it('should penalize drift indicators in vocabulary', () => {
      const responseWithDrift = "Let's optimize the algorithm metrics for efficiency.";
      const responseWithoutDrift = "Let's explore what matters most to you.";

      const driftWithIndicators = calculateVoiceDrift(responseWithDrift, ferniFingerprint);
      const driftWithout = calculateVoiceDrift(responseWithoutDrift, ferniFingerprint);

      expect(driftWithIndicators).toBeGreaterThan(driftWithout);
    });
  });

  describe('getVoiceConsistencyScore', () => {
    it('should return high score for on-voice response', () => {
      const onVoice =
        'Stay the course. Let me ask you this - what would it mean to believe in yourself?';
      const score = getVoiceConsistencyScore(onVoice, ferniFingerprint);

      expect(score).toBeGreaterThan(70);
    });

    it('should return lower score for off-voice response', () => {
      const offVoice = 'The data shows you should optimize metrics for efficiency.';
      const score = getVoiceConsistencyScore(offVoice, ferniFingerprint);

      expect(score).toBeLessThan(90);
    });

    it('should return score between 0 and 100', () => {
      const response = 'Test response.';
      const score = getVoiceConsistencyScore(response, ferniFingerprint);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should be inverse of drift', () => {
      const response = 'Stay the course and keep growing.';
      const drift = calculateVoiceDrift(response, ferniFingerprint);
      const score = getVoiceConsistencyScore(response, ferniFingerprint);

      expect(score).toBe(Math.round((1 - drift) * 100));
    });
  });

  describe('Cross-Persona Patterns', () => {
    it("each persona's anti-patterns should include other personas' signatures", () => {
      // Ferni should avoid Peter's signature phrases
      expect(ferniFingerprint.antiPatterns).toContain('the data shows');

      // Peter should avoid Ferni's signature phrases
      expect(peterFingerprint.antiPatterns).toContain('stay the course');

      // Maya should avoid Alex's signature phrases
      expect(mayaFingerprint.antiPatterns.some((p) => p.includes('template'))).toBe(true);
    });

    it('personas should have distinct reasoning styles', () => {
      const styles = new Set([
        ferniFingerprint.reasoningIndicators.style,
        peterFingerprint.reasoningIndicators.style,
        mayaFingerprint.reasoningIndicators.style,
        alexFingerprint.reasoningIndicators.style,
        jordanFingerprint.reasoningIndicators.style,
        nayanFingerprint.reasoningIndicators.style,
      ]);

      // At least 5 distinct styles
      expect(styles.size).toBeGreaterThanOrEqual(5);
    });

    it('personas should have varied energy levels', () => {
      const energies = [
        ferniFingerprint.emotionalTone.energy,
        peterFingerprint.emotionalTone.energy,
        mayaFingerprint.emotionalTone.energy,
        alexFingerprint.emotionalTone.energy,
        jordanFingerprint.emotionalTone.energy,
        nayanFingerprint.emotionalTone.energy,
      ];

      const range = Math.max(...energies) - Math.min(...energies);
      expect(range).toBeGreaterThanOrEqual(0.5); // At least 0.5 difference
    });
  });
});
