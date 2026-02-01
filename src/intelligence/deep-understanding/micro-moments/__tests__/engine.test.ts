/**
 * Micro-Moment Detector Tests
 *
 * @module @ferni/intelligence/deep-understanding/micro-moments/__tests__/engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMicroMomentDetector,
  type IMicroMomentDetector,
  type MicroMomentContext,
  type MicroMomentType,
} from '../index.js';

describe('MicroMomentDetector', () => {
  let detector: IMicroMomentDetector;

  beforeEach(() => {
    detector = createMicroMomentDetector();
  });

  // Helper to create context
  const createContext = (
    message: string,
    overrides: Partial<MicroMomentContext> = {}
  ): MicroMomentContext => ({
    message,
    ...overrides,
  });

  // ============================================================================
  // VULNERABILITY EDGE TESTS
  // ============================================================================

  describe('vulnerability-edge detection', () => {
    it('detects "I\'ve never told anyone"', () => {
      const analysis = detector.detect(
        createContext("I've never told anyone this before, but I was bullied in school.")
      );

      expect(analysis.hasSignificantMoment).toBe(true);
      expect(analysis.primaryMoment?.type).toBe('vulnerability-edge');
    });

    it('detects "This is hard to say"', () => {
      const analysis = detector.detect(
        createContext('This is hard to say, but I think I need help.')
      );

      expect(analysis.hasSignificantMoment).toBe(true);
      expect(analysis.primaryMoment?.type).toBe('vulnerability-edge');
    });

    it('detects trust language', () => {
      const analysis = detector.detect(
        createContext('Can I tell you something? I trust you with this.')
      );

      expect(analysis.moments.some((m) => m.type === 'vulnerability-edge')).toBe(true);
    });
  });

  // ============================================================================
  // SMALL WIN TESTS
  // ============================================================================

  describe('small-win detection', () => {
    it('detects "I finally did"', () => {
      const analysis = detector.detect(createContext('I finally did it! I went to the gym today.'));

      expect(analysis.hasSignificantMoment).toBe(true);
      expect(analysis.primaryMoment?.type).toBe('small-win');
    });

    it('detects "For the first time"', () => {
      const analysis = detector.detect(
        createContext('For the first time, I stood up for myself in a meeting.')
      );

      expect(analysis.hasSignificantMoment).toBe(true);
      expect(analysis.primaryMoment?.type).toBe('small-win');
    });

    it('detects "I managed to"', () => {
      const analysis = detector.detect(createContext('I managed to finish the project on time.'));

      expect(analysis.hasSignificantMoment).toBe(true);
      expect(analysis.primaryMoment?.type).toBe('small-win');
    });
  });

  // ============================================================================
  // HOPE GLIMMER TESTS
  // ============================================================================

  describe('hope-glimmer detection', () => {
    it('detects "Maybe things could"', () => {
      const analysis = detector.detect(
        createContext('Maybe things could actually get better this year.')
      );

      expect(analysis.hasSignificantMoment).toBe(true);
      expect(analysis.primaryMoment?.type).toBe('hope-glimmer');
    });

    it('detects "I\'m starting to believe"', () => {
      const analysis = detector.detect(
        createContext("I'm starting to believe that I can do this.")
      );

      expect(analysis.hasSignificantMoment).toBe(true);
      expect(analysis.primaryMoment?.type).toBe('hope-glimmer');
    });

    it('detects "There\'s a chance"', () => {
      const analysis = detector.detect(
        createContext("There's a chance this might work out after all.")
      );

      expect(analysis.hasSignificantMoment).toBe(true);
      expect(analysis.primaryMoment?.type).toBe('hope-glimmer');
    });
  });

  // ============================================================================
  // SELF-COMPASSION TESTS
  // ============================================================================

  describe('self-compassion detection', () => {
    it('detects "I guess it\'s okay that"', () => {
      const analysis = detector.detect(
        createContext("I guess it's okay that I'm not perfect at this yet.")
      );

      expect(analysis.hasSignificantMoment).toBe(true);
      expect(analysis.primaryMoment?.type).toBe('self-compassion');
    });

    it('detects "I\'m doing my best"', () => {
      const analysis = detector.detect(
        createContext("I'm doing my best, and that has to be enough.")
      );

      expect(analysis.hasSignificantMoment).toBe(true);
      expect(analysis.primaryMoment?.type).toBe('self-compassion');
    });

    it('detects "I\'m only human"', () => {
      const analysis = detector.detect(createContext("I'm only human. I can't do everything."));

      expect(analysis.hasSignificantMoment).toBe(true);
      expect(analysis.primaryMoment?.type).toBe('self-compassion');
    });
  });

  // ============================================================================
  // BOUNDARY ATTEMPT TESTS
  // ============================================================================

  describe('boundary-attempt detection', () => {
    it('detects "I told them no"', () => {
      const analysis = detector.detect(createContext("I told them no. I can't keep doing this."));

      expect(analysis.hasSignificantMoment).toBe(true);
      expect(analysis.primaryMoment?.type).toBe('boundary-attempt');
    });

    it('detects "I stood up for myself"', () => {
      const analysis = detector.detect(
        createContext('I stood up for myself for the first time in years.')
      );

      // Could be small-win or boundary-attempt
      expect(analysis.hasSignificantMoment).toBe(true);
      expect(['boundary-attempt', 'small-win']).toContain(analysis.primaryMoment?.type);
    });

    it('detects boundary language', () => {
      const analysis = detector.detect(createContext('I need to set boundaries with my family.'));

      expect(analysis.moments.some((m) => m.type === 'boundary-attempt')).toBe(true);
    });
  });

  // ============================================================================
  // GROWTH EVIDENCE TESTS
  // ============================================================================

  describe('growth-evidence detection', () => {
    it('detects "I used to but now"', () => {
      const analysis = detector.detect(
        createContext('I used to panic about these things, but now I handle them better.')
      );

      expect(analysis.hasSignificantMoment).toBe(true);
      expect(analysis.primaryMoment?.type).toBe('growth-evidence');
    });

    it('detects "I\'ve changed"', () => {
      const analysis = detector.detect(createContext("I've changed so much since then."));

      expect(analysis.hasSignificantMoment).toBe(true);
      expect(analysis.primaryMoment?.type).toBe('growth-evidence');
    });

    it('detects "Looking back"', () => {
      const analysis = detector.detect(createContext("Looking back, I can see how far I've come."));

      expect(analysis.hasSignificantMoment).toBe(true);
      expect(analysis.primaryMoment?.type).toBe('growth-evidence');
    });
  });

  // ============================================================================
  // RELATIONSHIP SHIFT TESTS
  // ============================================================================

  describe('relationship-shift detection', () => {
    it('detects "I used to think of them"', () => {
      const analysis = detector.detect(
        createContext('I used to think of them as my hero, but now I see their flaws.')
      );

      expect(analysis.moments.some((m) => m.type === 'relationship-shift')).toBe(true);
    });

    it('detects perspective change', () => {
      const analysis = detector.detect(createContext("They're not who I thought they were."));

      expect(analysis.moments.some((m) => m.type === 'relationship-shift')).toBe(true);
    });
  });

  // ============================================================================
  // LANGUAGE CHANGE TESTS
  // ============================================================================

  describe('language-change detection', () => {
    it('detects "we" language with baseline', () => {
      const analysis = detector.detect(
        createContext("We can do this together. We're going to be okay. We have each other.", {
          languageBaseline: {
            usesWeFrequency: 0.1, // Normally uses "we" 10% of time
            selfReferencesPositively: false,
            typicalBoundaryStrength: 'weak',
          },
          previousMessages: ["I feel so alone. I don't know what to do."],
        })
      );

      expect(analysis.moments.some((m) => m.type === 'language-change')).toBe(true);
    });

    it('detects "Together, we"', () => {
      const analysis = detector.detect(createContext('Together, we can figure this out.'));

      expect(analysis.moments.some((m) => m.type === 'language-change')).toBe(true);
    });
  });

  // ============================================================================
  // ACKNOWLEDGMENT TESTS
  // ============================================================================

  describe('getAcknowledgment()', () => {
    it('returns acknowledgment for detected moment', () => {
      const analysis = detector.detect(createContext("I've never told anyone this before."));

      if (analysis.primaryMoment) {
        const ack = detector.getAcknowledgment(analysis.primaryMoment);

        expect(ack.phrase.length).toBeGreaterThan(0);
        expect(ack.ssml.length).toBeGreaterThan(0);
        expect(ack.type).toBeDefined();
      }
    });

    it('returns appropriate timing for vulnerability', () => {
      const analysis = detector.detect(createContext("I've never told anyone this before."));

      if (analysis.primaryMoment) {
        const ack = detector.getAcknowledgment(analysis.primaryMoment);
        expect(ack.timing).toBe('immediate');
      }
    });
  });

  // ============================================================================
  // CONTEXT INJECTION TESTS
  // ============================================================================

  describe('buildContextInjection()', () => {
    it('builds context for significant moment', () => {
      const analysis = detector.detect(
        createContext("I've never told anyone this before, but I struggle with anxiety.")
      );

      const injection = detector.buildContextInjection(analysis);

      expect(injection).toContain('[MICRO-MOMENT DETECTED]');
      expect(injection.toLowerCase()).toContain('vulnerable');
    });

    it('returns empty for no significant moments', () => {
      const analysis = detector.detect(createContext('The weather is nice today.'));

      const injection = detector.buildContextInjection(analysis);

      expect(injection).toBe('');
    });
  });

  // ============================================================================
  // OUTCOME TRACKING TESTS
  // ============================================================================

  describe('recordOutcome()', () => {
    it('records outcomes without error', () => {
      const analysis = detector.detect(createContext("I've never told anyone this before."));

      if (analysis.primaryMoment) {
        expect(() => {
          detector.recordOutcome(analysis.primaryMoment!, 'positive');
        }).not.toThrow();
      }
    });
  });

  // ============================================================================
  // RESET TESTS
  // ============================================================================

  describe('reset()', () => {
    it('resets without error', () => {
      detector.detect(createContext("I've never told anyone this before."));

      expect(() => detector.reset()).not.toThrow();
    });
  });

  // ============================================================================
  // MULTIPLE MOMENTS TESTS
  // ============================================================================

  describe('multiple moments', () => {
    it('detects multiple moments in complex message', () => {
      const analysis = detector.detect(
        createContext(
          "I've never told anyone this before, but I finally did it - I set a boundary with my mom. I'm proud of myself."
        )
      );

      // Should detect multiple: vulnerability-edge, small-win/boundary-attempt
      expect(analysis.moments.length).toBeGreaterThan(1);
    });

    it('ranks moments by confidence', () => {
      const analysis = detector.detect(
        createContext("I've never told anyone this before, but maybe things could get better.")
      );

      if (analysis.moments.length > 1) {
        // Primary moment should have highest confidence
        const confidences = analysis.moments.map((m) => m.confidence);
        expect(confidences[0]).toBe(Math.max(...confidences));
      }
    });
  });
});
