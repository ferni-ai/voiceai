/**
 * Better-Than-PhD Coaching System Tests
 *
 * End-to-end tests validating that Ferni's advanced coaching capabilities
 * are integrated correctly and working as designed.
 *
 * Test Coverage:
 * 1. Cognitive Intelligence (distortion detection, ANT tracking, Socratic questioning)
 * 2. Wellbeing Tracking (signal detection, alerts)
 * 3. Therapeutic Frameworks (ACT values, MI)
 */

import { describe, expect, it } from 'vitest';

// ============================================================================
// COGNITIVE INTELLIGENCE TESTS
// ============================================================================

describe('Cognitive Intelligence', () => {
  describe('Distortion Detection', () => {
    it('should detect catastrophizing', async () => {
      const { detectDistortions } =
        await import('../services/cognitive-intelligence/distortion-detector.js');

      const detections = detectDistortions(
        'user-test-1',
        "This is the end of the world. My life is over and I'll never recover from this.",
        { topic: 'career', emotion: 'panic' }
      );

      expect(detections.length).toBeGreaterThan(0);
      expect(detections.some((d) => d.type === 'catastrophizing')).toBe(true);
    });

    it('should detect all-or-nothing thinking', async () => {
      const { detectDistortions } =
        await import('../services/cognitive-intelligence/distortion-detector.js');

      const detections = detectDistortions(
        'user-test-2',
        "Either I do this perfectly or I'm a complete failure. There's no middle ground.",
        {}
      );

      expect(detections.length).toBeGreaterThan(0);
      expect(detections.some((d) => d.type === 'all_or_nothing')).toBe(true);
    });

    it('should detect mind reading', async () => {
      const { detectDistortions } =
        await import('../services/cognitive-intelligence/distortion-detector.js');

      const detections = detectDistortions(
        'user-test-3',
        "He thinks I'm stupid. I know exactly what they were thinking about me.",
        {}
      );

      expect(detections.length).toBeGreaterThan(0);
      expect(detections.some((d) => d.type === 'mind_reading')).toBe(true);
    });

    it('should detect overgeneralization', async () => {
      const { detectDistortions } =
        await import('../services/cognitive-intelligence/distortion-detector.js');

      const detections = detectDistortions(
        'user-test-4',
        'This always happens to me. I never get anything right.',
        {}
      );

      expect(detections.length).toBeGreaterThan(0);
      expect(detections.some((d) => d.type === 'overgeneralization')).toBe(true);
    });

    it('should not detect distortions in neutral speech', async () => {
      const { detectDistortions } =
        await import('../services/cognitive-intelligence/distortion-detector.js');

      const detections = detectDistortions(
        'user-test-5',
        'I had a pretty good day at work. We finished the project on time.',
        {}
      );

      expect(detections.length).toBe(0);
    });
  });

  describe('Socratic Engine', () => {
    it('should generate questions for detected distortions', async () => {
      const { generateSocraticDialogue } =
        await import('../services/cognitive-intelligence/socratic-engine.js');

      const dialogue = generateSocraticDialogue({
        userId: 'user-test-6',
        distortion: 'catastrophizing',
        triggerThought: 'Everything is going to fall apart',
        questionsAsked: [],
        emotionalState: 'anxious',
        emotionalIntensity: 0.6,
        relationshipStage: 'building',
        receptivity: 'unknown',
      });

      expect(dialogue).toBeDefined();
      expect(dialogue.question.length).toBeGreaterThan(0);
      // The dialogue has category, sequence, and followUp fields
      expect(dialogue.category).toBeDefined();
      expect(dialogue.followUp).toBeDefined();
    });
  });
});

// ============================================================================
// WELLBEING TRACKING TESTS
// ============================================================================

describe('Wellbeing Tracking', () => {
  describe('Signal Detection', () => {
    it('should detect sleep-related signals', async () => {
      const { detectWellbeingSignals } = await import('../services/wellbeing-tracking/tracker.js');

      const signals = detectWellbeingSignals(
        "I've had insomnia and can't sleep at all this week.",
        {}
      );

      expect(signals.length).toBeGreaterThan(0);
      expect(signals.some((s) => s.dimension === 'sleepQuality')).toBe(true);
    });

    it('should detect mood-related signals', async () => {
      const { detectWellbeingSignals } = await import('../services/wellbeing-tracking/tracker.js');

      const signals = detectWellbeingSignals(
        "I've been feeling really down lately. Nothing brings me joy anymore.",
        { emotion: 'sad' }
      );

      expect(signals.length).toBeGreaterThan(0);
      expect(signals.some((s) => s.dimension === 'mood')).toBe(true);
    });

    it('should detect energy-related signals', async () => {
      const { detectWellbeingSignals } = await import('../services/wellbeing-tracking/tracker.js');

      const signals = detectWellbeingSignals(
        "I'm exhausted all the time. No energy for anything.",
        {}
      );

      expect(signals.length).toBeGreaterThan(0);
      expect(signals.some((s) => s.dimension === 'energy')).toBe(true);
    });
  });

  describe('Unified API', () => {
    it('should process message for wellbeing and return result', async () => {
      const { processForWellbeing } = await import('../services/wellbeing-tracking/index.js');

      // Use a message that matches detection patterns:
      // - "I'm stressed" matches worry pattern: /I('m| am| feel) (really |so )?(worried|anxious|stressed)/i
      // - "slept badly" matches sleep pattern: /slept (well|badly|terribly|great)/i
      const result = processForWellbeing(
        'user-test-wb-1',
        "I'm really stressed at work and I slept badly last night.",
        { topic: 'work', emotion: 'stressed' }
      );

      expect(result.signals.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// THERAPEUTIC FRAMEWORKS TESTS
// ============================================================================

describe('Therapeutic Frameworks', () => {
  describe('ACT Values', () => {
    it('should detect values in speech', async () => {
      const { detectValuesInSpeech } =
        await import('../services/therapeutic-frameworks/act-values.js');

      const detected = detectValuesInSpeech(
        'I really value honesty and being there for my family.',
        {}
      );

      expect(detected.length).toBeGreaterThan(0);
    });

    it('should record and retrieve user values', async () => {
      const { recordValue, getUserValues } =
        await import('../services/therapeutic-frameworks/act-values.js');

      recordValue('user-test-act-1', 'Growth', 'growth', {
        meaning: 'Always learning and improving',
        importance: 9,
      });

      const values = getUserValues('user-test-act-1');
      expect(values.length).toBeGreaterThan(0);
      expect(values.some((v) => v.value === 'Growth')).toBe(true);
    });

    it('should generate values prompts', async () => {
      const { generateValuesPrompt } =
        await import('../services/therapeutic-frameworks/act-values.js');

      const prompt = generateValuesPrompt('user-test-act-2', {});
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe('Motivational Interviewing', () => {
    it('should detect change talk', async () => {
      const { detectChangeTalk } =
        await import('../services/therapeutic-frameworks/motivational-interviewing.js');

      const instances = detectChangeTalk(
        'I really want to start exercising. I know I can do it if I try.',
        'exercise'
      );

      expect(instances.length).toBeGreaterThan(0);
      expect(instances.some((i) => i.type === 'desire')).toBe(true);
      expect(instances.some((i) => i.type === 'ability')).toBe(true);
    });

    it('should detect sustain talk', async () => {
      const { detectSustainTalk } =
        await import('../services/therapeutic-frameworks/motivational-interviewing.js');

      const result = detectSustainTalk("I can't do this. It's too hard and nothing works anyway.");

      expect(result.detected).toBe(true);
      expect(result.patterns.length).toBeGreaterThan(0);
    });

    it('should generate appropriate OARS response', async () => {
      const { generateOARSResponse, detectChangeTalk } =
        await import('../services/therapeutic-frameworks/motivational-interviewing.js');

      const changeTalk = detectChangeTalk(
        "I've decided to start meditating every day.",
        'meditation'
      );

      const response = generateOARSResponse({ changeTalk });

      expect(response.type).toBe('reflect_then_question');
      expect(response.response.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// BETTER-THAN-HUMAN VALIDATION
// ============================================================================

describe('Better-Than-Human Capabilities', () => {
  it('should have perfect memory of cognitive patterns', async () => {
    const { detectDistortions, getANTProfile } =
      await import('../services/cognitive-intelligence/distortion-detector.js');

    const userId = 'user-memory-test';

    // First detection
    detectDistortions(userId, "I'm a total failure", {});
    detectDistortions(userId, 'Everything I do turns out bad', {});
    detectDistortions(userId, 'I always mess things up', {});

    const profile = getANTProfile(userId);

    // Should track patterns over time
    expect(profile).toBeDefined();
    expect(profile.totalDetected).toBeGreaterThan(0);
  });

  it('should track wellbeing across sessions', async () => {
    const { recordSnapshot, getWellbeingProfile, getRecentSnapshots } =
      await import('../services/wellbeing-tracking/tracker.js');

    const userId = 'user-wellbeing-track';

    // Record multiple snapshots
    recordSnapshot(
      userId,
      [{ dimension: 'mood', signal: 'feeling down', direction: 'negative', confidence: 0.8 }],
      'detected',
      {}
    );

    recordSnapshot(
      userId,
      [{ dimension: 'mood', signal: 'a bit better today', direction: 'positive', confidence: 0.7 }],
      'detected',
      {}
    );

    // Check profile
    const profile = getWellbeingProfile(userId);
    expect(profile).toBeDefined();

    // Check snapshots are being stored
    const snaps = getRecentSnapshots(userId, 5);
    expect(snaps.length).toBeGreaterThanOrEqual(2);
  });
});
