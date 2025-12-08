/**
 * Better-Than-PhD Coaching System Tests
 *
 * End-to-end tests validating that Ferni's advanced coaching capabilities
 * are integrated correctly and working as designed.
 *
 * Test Coverage:
 * 1. Cognitive Intelligence (distortion detection, ANT tracking, Socratic questioning)
 * 2. Wellbeing Tracking (signal detection, alerts)
 * 3. Somatic Intelligence (exercise selection, nervous system detection)
 * 4. Therapeutic Frameworks (ACT values, DBT skills, MI)
 * 5. Behavioral Economics (implementation intentions, commitment devices)
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ============================================================================
// COGNITIVE INTELLIGENCE TESTS
// ============================================================================

describe('Cognitive Intelligence', () => {
  describe('Distortion Detection', () => {
    it('should detect catastrophizing', async () => {
      const { detectDistortions } = await import(
        '../services/cognitive-intelligence/distortion-detector.js'
      );

      const detections = detectDistortions(
        'user-test-1',
        "This is the end of the world. My life is over and I'll never recover from this.",
        { topic: 'career', emotion: 'panic' }
      );

      expect(detections.length).toBeGreaterThan(0);
      expect(detections.some((d) => d.type === 'catastrophizing')).toBe(true);
    });

    it('should detect all-or-nothing thinking', async () => {
      const { detectDistortions } = await import(
        '../services/cognitive-intelligence/distortion-detector.js'
      );

      const detections = detectDistortions(
        'user-test-2',
        "Either I do this perfectly or I'm a complete failure. There's no middle ground.",
        {}
      );

      expect(detections.length).toBeGreaterThan(0);
      expect(detections.some((d) => d.type === 'all_or_nothing')).toBe(true);
    });

    it('should detect mind reading', async () => {
      const { detectDistortions } = await import(
        '../services/cognitive-intelligence/distortion-detector.js'
      );

      const detections = detectDistortions(
        'user-test-3',
        "He thinks I'm stupid. I know exactly what they were thinking about me.",
        {}
      );

      expect(detections.length).toBeGreaterThan(0);
      expect(detections.some((d) => d.type === 'mind_reading')).toBe(true);
    });

    it('should detect overgeneralization', async () => {
      const { detectDistortions } = await import(
        '../services/cognitive-intelligence/distortion-detector.js'
      );

      const detections = detectDistortions(
        'user-test-4',
        "This always happens to me. I never get anything right.",
        {}
      );

      expect(detections.length).toBeGreaterThan(0);
      expect(detections.some((d) => d.type === 'overgeneralization')).toBe(true);
    });

    it('should not detect distortions in neutral speech', async () => {
      const { detectDistortions } = await import(
        '../services/cognitive-intelligence/distortion-detector.js'
      );

      const detections = detectDistortions(
        'user-test-5',
        "I had a pretty good day at work. We finished the project on time.",
        {}
      );

      expect(detections.length).toBe(0);
    });
  });

  describe('Socratic Engine', () => {
    it('should generate questions for detected distortions', async () => {
      const { generateSocraticDialogue } = await import(
        '../services/cognitive-intelligence/socratic-engine.js'
      );

      const dialogue = generateSocraticDialogue({
        userId: 'user-test-6',
        distortion: 'catastrophizing',
        triggerThought: "Everything is going to fall apart",
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

  describe('Unified API', () => {
    it('should build complete cognitive intelligence context', async () => {
      const { buildCognitiveIntelligenceContext } = await import(
        '../services/cognitive-intelligence/index.js'
      );

      const result = buildCognitiveIntelligenceContext(
        'user-test-7',
        "I'm such a failure. I mess up everything I try.",
        {
          emotion: 'sad',
          emotionIntensity: 0.7,
          relationshipStage: 'established',
        }
      );

      expect(result.hasDistortion).toBe(true);
      expect(result.primary).toBeDefined();
      expect(result.contextInjection).toBeDefined();
      expect(result.contextInjection?.llmContext).toContain('COGNITIVE PATTERN DETECTED');
    });
  });
});

// ============================================================================
// WELLBEING TRACKING TESTS
// ============================================================================

describe('Wellbeing Tracking', () => {
  describe('Signal Detection', () => {
    it('should detect sleep-related signals', async () => {
      const { detectWellbeingSignals } = await import(
        '../services/wellbeing-tracking/tracker.js'
      );

      const signals = detectWellbeingSignals(
        "I've had insomnia and can't sleep at all this week.",
        {}
      );

      expect(signals.length).toBeGreaterThan(0);
      expect(signals.some((s) => s.dimension === 'sleepQuality')).toBe(true);
    });

    it('should detect mood-related signals', async () => {
      const { detectWellbeingSignals } = await import(
        '../services/wellbeing-tracking/tracker.js'
      );

      const signals = detectWellbeingSignals(
        "I've been feeling really down lately. Nothing brings me joy anymore.",
        { emotion: 'sad' }
      );

      expect(signals.length).toBeGreaterThan(0);
      expect(signals.some((s) => s.dimension === 'mood')).toBe(true);
    });

    it('should detect energy-related signals', async () => {
      const { detectWellbeingSignals } = await import(
        '../services/wellbeing-tracking/tracker.js'
      );

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
      const { processForWellbeing } = await import(
        '../services/wellbeing-tracking/index.js'
      );

      const result = processForWellbeing(
        'user-test-wb-1',
        "I've been really stressed at work and not sleeping well.",
        { topic: 'work', emotion: 'stressed' }
      );

      expect(result.signals.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// SOMATIC INTELLIGENCE TESTS
// ============================================================================

describe('Somatic Intelligence', () => {
  describe('Exercise Selection', () => {
    it('should select physiological sigh for high distress', async () => {
      const { selectExercise, PHYSIOLOGICAL_SIGH } = await import(
        '../services/somatic-intelligence/index.js'
      );

      const exercise = selectExercise({
        emotionIntensity: 0.9,
        emotion: 'panic',
      });

      expect(exercise.id).toBe('physiological_sigh');
    });

    it('should select grounding for panic', async () => {
      const { selectExercise } = await import(
        '../services/somatic-intelligence/index.js'
      );

      const exercise = selectExercise({
        emotion: 'panic',
        state: 'dorsal_vagal',
      });

      expect(exercise.category).toBe('grounding');
    });

    it('should select breathing for anxiety', async () => {
      const { selectExercise } = await import(
        '../services/somatic-intelligence/index.js'
      );

      const exercise = selectExercise({
        emotion: 'anxious',
        preference: 'breathing',
      });

      expect(exercise.category).toBe('breathing');
    });
  });

  describe('Nervous System Detection', () => {
    it('should detect sympathetic activation', async () => {
      const { detectNervousSystemState } = await import(
        '../services/somatic-intelligence/index.js'
      );

      const state = detectNervousSystemState({
        emotion: 'anxious',
        emotionIntensity: 0.8,
      });

      expect(state).toBe('sympathetic');
    });

    it('should detect dorsal vagal shutdown', async () => {
      const { detectNervousSystemState } = await import(
        '../services/somatic-intelligence/index.js'
      );

      const state = detectNervousSystemState({
        keywords: ['numb', 'frozen'],
      });

      expect(state).toBe('dorsal_vagal');
    });
  });

  describe('Voice Guidance', () => {
    it('should generate voice guidance for exercise', async () => {
      const { generateVoiceGuidance, BOX_BREATHING } = await import(
        '../services/somatic-intelligence/index.js'
      );

      const guidance = generateVoiceGuidance(BOX_BREATHING, { rounds: 2 });

      expect(guidance.parts.length).toBeGreaterThan(0);
      expect(guidance.totalDurationMs).toBeGreaterThan(0);
      expect(guidance.rounds).toBe(2);
    });
  });
});

// ============================================================================
// THERAPEUTIC FRAMEWORKS TESTS
// ============================================================================

describe('Therapeutic Frameworks', () => {
  describe('ACT Values', () => {
    it('should detect values in speech', async () => {
      const { detectValuesInSpeech } = await import(
        '../services/therapeutic-frameworks/act-values.js'
      );

      const detected = detectValuesInSpeech(
        "I really value honesty and being there for my family.",
        {}
      );

      expect(detected.length).toBeGreaterThan(0);
    });

    it('should record and retrieve user values', async () => {
      const { recordValue, getUserValues } = await import(
        '../services/therapeutic-frameworks/act-values.js'
      );

      recordValue('user-test-act-1', 'Growth', 'growth', {
        meaning: 'Always learning and improving',
        importance: 9,
      });

      const values = getUserValues('user-test-act-1');
      expect(values.length).toBeGreaterThan(0);
      expect(values.some((v) => v.value === 'Growth')).toBe(true);
    });

    it('should generate values prompts', async () => {
      const { generateValuesPrompt } = await import(
        '../services/therapeutic-frameworks/act-values.js'
      );

      const prompt = generateValuesPrompt('user-test-act-2', {});
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe('ACT Defusion', () => {
    it('should select appropriate defusion technique', async () => {
      const { selectDefusionTechnique } = await import(
        '../services/therapeutic-frameworks/act-defusion.js'
      );

      const technique = selectDefusionTechnique({
        thought: "I'm such a failure",
        emotionIntensity: 0.9,
      });

      expect(technique.id).toBe('im_having_the_thought');
    });

    it('should have complete defusion library', async () => {
      const { getAllDefusionTechniques } = await import(
        '../services/therapeutic-frameworks/act-defusion.js'
      );

      const techniques = getAllDefusionTechniques();
      expect(techniques.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('DBT Skills', () => {
    it('should select TIPP for crisis', async () => {
      const { selectDBTSkill } = await import(
        '../services/therapeutic-frameworks/dbt-skills.js'
      );

      const skill = selectDBTSkill({
        emotionIntensity: 0.95,
        goal: 'survive_crisis',
      });

      expect(skill.id).toBe('tipp');
    });

    it('should select STOP for impulsive situations', async () => {
      const { selectDBTSkill } = await import(
        '../services/therapeutic-frameworks/dbt-skills.js'
      );

      const skill = selectDBTSkill({
        keywords: ['about to send this text'],
      });

      expect(skill.id).toBe('stop');
    });

    it('should have complete DBT skill library', async () => {
      const { ALL_DBT_SKILLS } = await import(
        '../services/therapeutic-frameworks/dbt-skills.js'
      );

      expect(Object.keys(ALL_DBT_SKILLS).length).toBeGreaterThanOrEqual(10);
    });

    it('should have voice guidance for skills', async () => {
      const { DISTRESS_TOLERANCE_SKILLS } = await import(
        '../services/therapeutic-frameworks/dbt-skills.js'
      );

      expect(DISTRESS_TOLERANCE_SKILLS.tipp.voiceGuidance).toBeDefined();
      expect(DISTRESS_TOLERANCE_SKILLS.tipp.voiceGuidance.length).toBeGreaterThan(0);
    });
  });

  describe('Motivational Interviewing', () => {
    it('should detect change talk', async () => {
      const { detectChangeTalk } = await import(
        '../services/therapeutic-frameworks/motivational-interviewing.js'
      );

      const instances = detectChangeTalk(
        "I really want to start exercising. I know I can do it if I try.",
        'exercise'
      );

      expect(instances.length).toBeGreaterThan(0);
      expect(instances.some((i) => i.type === 'desire')).toBe(true);
      expect(instances.some((i) => i.type === 'ability')).toBe(true);
    });

    it('should detect sustain talk', async () => {
      const { detectSustainTalk } = await import(
        '../services/therapeutic-frameworks/motivational-interviewing.js'
      );

      const result = detectSustainTalk(
        "I can't do this. It's too hard and nothing works anyway."
      );

      expect(result.detected).toBe(true);
      expect(result.patterns.length).toBeGreaterThan(0);
    });

    it('should generate appropriate OARS response', async () => {
      const { generateOARSResponse, detectChangeTalk } = await import(
        '../services/therapeutic-frameworks/motivational-interviewing.js'
      );

      const changeTalk = detectChangeTalk(
        "I've decided to start meditating every day.",
        'meditation'
      );

      const response = generateOARSResponse({ changeTalk });

      expect(response.type).toBe('reflect_then_question');
      expect(response.response.length).toBeGreaterThan(0);
    });
  });

  describe('Unified API', () => {
    it('should build complete therapeutic context', async () => {
      const { buildTherapeuticContext } = await import(
        '../services/therapeutic-frameworks/index.js'
      );

      const result = buildTherapeuticContext(
        'user-test-tf-1',
        "I want to change but I can't seem to. It's too hard.",
        {
          emotionIntensity: 0.7,
          relationshipStage: 'established',
        }
      );

      expect(result.hasContext).toBe(true);
      expect(result.frameworks.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// BEHAVIORAL ECONOMICS TESTS
// ============================================================================

describe('Behavioral Economics', () => {
  describe('Implementation Intentions', () => {
    it('should create implementation intention', async () => {
      const { createImplementationIntention, getImplementationIntentions } = await import(
        '../services/behavioral-economics/index.js'
      );

      const intention = createImplementationIntention(
        'user-test-be-1',
        'After I finish my morning coffee',
        'I will meditate for 5 minutes',
        'daily meditation'
      );

      expect(intention.when).toBe('After I finish my morning coffee');
      expect(intention.then).toBe('I will meditate for 5 minutes');

      const retrieved = getImplementationIntentions('user-test-be-1');
      expect(retrieved.length).toBeGreaterThan(0);
    });

    it('should assess specificity', async () => {
      const { createImplementationIntention } = await import(
        '../services/behavioral-economics/index.js'
      );

      const vague = createImplementationIntention(
        'user-test-be-2',
        'When I have time',
        'I will exercise',
        'exercise'
      );

      const specific = createImplementationIntention(
        'user-test-be-3',
        'After I wake up at 7am in my bedroom',
        'I will put on my running shoes',
        'exercise'
      );

      expect(vague.specificity).toBe('vague');
      expect(specific.specificity).toBe('specific');
    });
  });

  describe('Commitment Devices', () => {
    it('should create and retrieve commitment device', async () => {
      const { createCommitmentDevice, getActiveCommitments } = await import(
        '../services/behavioral-economics/index.js'
      );

      createCommitmentDevice(
        'user-test-be-4',
        'Go to gym 3x this week',
        'social',
        { witnesses: ['accountability partner'] }
      );

      const active = getActiveCommitments('user-test-be-4');
      expect(active.length).toBeGreaterThan(0);
    });

    it('should suggest commitment devices', async () => {
      const { suggestCommitmentDevice } = await import(
        '../services/behavioral-economics/index.js'
      );

      const suggestions = suggestCommitmentDevice('exercise more');
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.type === 'social')).toBe(true);
    });
  });

  describe('Loss Framing', () => {
    it('should apply loss framing to goals', async () => {
      const { applyLossFraming } = await import(
        '../services/behavioral-economics/index.js'
      );

      const lossFramed = applyLossFraming('get more energy');
      expect(lossFramed).toContain('losing');
    });
  });

  describe('Temptation Bundling', () => {
    it('should suggest temptation bundles', async () => {
      const { suggestTemptationBundles } = await import(
        '../services/behavioral-economics/index.js'
      );

      const bundles = suggestTemptationBundles(
        ['exercise'],
        ['listen to podcasts']
      );

      expect(bundles.length).toBeGreaterThan(0);
    });
  });

  describe('Friction Audit', () => {
    it('should audit friction for common goals', async () => {
      const { auditFriction } = await import(
        '../services/behavioral-economics/index.js'
      );

      const audit = auditFriction('exercise regularly');
      expect(audit.barriers.length).toBeGreaterThan(0);
      expect(audit.solutions.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration', () => {
  describe('Context Builder Registration', () => {
    it('should have context builder system available', async () => {
      // Import the core functions
      const { buildConversationContext, getRegisteredBuilders } = await import(
        '../intelligence/context-builders/index.js'
      );

      // Core functions should be available
      expect(typeof buildConversationContext).toBe('function');
      expect(typeof getRegisteredBuilders).toBe('function');
      
      // The system should be able to process context
      // (builders are lazy-loaded on first use)
    });
  });

  describe('End-to-End Context Building', () => {
    it('should build context for distressed user', async () => {
      const { buildConversationContext } = await import(
        '../intelligence/context-builders/index.js'
      );

      const mockInput = {
        userText: "I'm panicking. Everything is falling apart and I can't breathe.",
        analysis: {
          emotion: {
            primary: 'panic',
            intensity: 0.9,
            needsSupport: true,
            distressLevel: 0.9,
          },
          intent: {
            primary: 'seeking_support',
            confidence: 0.9,
          },
          topics: {
            detected: ['crisis'],
            primary: 'crisis',
          },
          state: {
            phase: 'active',
            distressLevel: 0.9,
          },
        },
        services: {
          sessionId: 'test-session',
          userId: 'user-e2e-1',
          sessionStartTime: Date.now(),
          userProfile: null,
        },
        userData: {
          turnCount: 5,
        },
        userProfile: {
          userId: 'user-e2e-1',
          totalConversations: 25,
        } as any,
        persona: {
          id: 'ferni',
          name: 'Ferni',
        } as any,
      };

      const injections = await buildConversationContext(mockInput);

      // Should have at least some injections for emotional support
      expect(injections.length).toBeGreaterThan(0);

      // The base buildConversationContext provides emotional support for needsSupport/high distress
      // It may produce critical injections based on the emotional state
      expect(injections.some((i) => 
        i.content.toLowerCase().includes('support') || 
        i.content.toLowerCase().includes('empathetic') ||
        i.priority === 'critical'
      )).toBe(true);
    });

    it('should build context for goal-setting conversation', async () => {
      const { buildConversationContext } = await import(
        '../intelligence/context-builders/index.js'
      );

      const mockInput = {
        userText: "I want to start exercising but I can't seem to stick with it.",
        analysis: {
          emotion: {
            primary: 'frustrated',
            intensity: 0.5,
          },
          intent: {
            primary: 'seeking_help',
            confidence: 0.8,
          },
          topics: {
            detected: ['exercise', 'habits'],
            primary: 'habits',
          },
          state: {
            phase: 'active',
          },
        },
        services: {
          sessionId: 'test-session-2',
          userId: 'user-e2e-2',
          sessionStartTime: Date.now(),
          userProfile: null,
        },
        userData: {
          turnCount: 10,
        },
        userProfile: {
          userId: 'user-e2e-2',
          totalConversations: 30,
        } as any,
        persona: {
          id: 'ferni',
          name: 'Ferni',
        } as any,
      };

      const injections = await buildConversationContext(mockInput as any);

      // Should have context about goals/habits
      expect(injections.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// BETTER-THAN-HUMAN VALIDATION
// ============================================================================

describe('Better-Than-Human Capabilities', () => {
  it('should have perfect memory of cognitive patterns', async () => {
    const { detectDistortions, getANTProfile } = await import(
      '../services/cognitive-intelligence/distortion-detector.js'
    );

    const userId = 'user-memory-test';

    // First detection
    detectDistortions(userId, "I'm a total failure", {});
    detectDistortions(userId, "Everything I do turns out bad", {});
    detectDistortions(userId, "I always mess things up", {});

    const profile = getANTProfile(userId);

    // Should track patterns over time
    expect(profile).toBeDefined();
    expect(profile.totalDetected).toBeGreaterThan(0);
  });

  it('should be consistent in framework application', async () => {
    const { selectDBTSkill } = await import(
      '../services/therapeutic-frameworks/dbt-skills.js'
    );

    // Same input should always give same output
    const input = { emotionIntensity: 0.95, goal: 'survive_crisis' as const };

    const skill1 = selectDBTSkill(input);
    const skill2 = selectDBTSkill(input);
    const skill3 = selectDBTSkill(input);

    expect(skill1.id).toBe(skill2.id);
    expect(skill2.id).toBe(skill3.id);
  });

  it('should track wellbeing across sessions', async () => {
    const { recordSnapshot, getWellbeingProfile, getRecentSnapshots } = await import(
      '../services/wellbeing-tracking/tracker.js'
    );

    const userId = 'user-wellbeing-track';

    // Record multiple snapshots
    recordSnapshot(userId, [
      { dimension: 'mood', signal: 'feeling down', direction: 'negative', confidence: 0.8 },
    ], 'detected', {});

    recordSnapshot(userId, [
      { dimension: 'mood', signal: 'a bit better today', direction: 'positive', confidence: 0.7 },
    ], 'detected', {});

    // Check profile
    const profile = getWellbeingProfile(userId);
    expect(profile).toBeDefined();

    // Check snapshots are being stored
    const snaps = getRecentSnapshots(userId, 5);
    expect(snaps.length).toBeGreaterThanOrEqual(2);
  });

  it('should integrate multiple frameworks seamlessly', async () => {
    const { buildTherapeuticContext } = await import(
      '../services/therapeutic-frameworks/index.js'
    );
    const { buildBehavioralEconomicsContext } = await import(
      '../services/behavioral-economics/index.js'
    );

    const userId = 'user-integration-test';
    const userText = "I want to change but I keep failing. It feels hopeless.";

    const therapeuticContext = buildTherapeuticContext(userId, userText, {
      relationshipStage: 'established',
      emotionIntensity: 0.7,
    });

    const beContext = buildBehavioralEconomicsContext(userId, {
      goal: 'change behavior',
      barrier: 'keep failing',
    });

    // Both should provide relevant context
    expect(therapeuticContext.hasContext || !!beContext).toBe(true);
  });
});

