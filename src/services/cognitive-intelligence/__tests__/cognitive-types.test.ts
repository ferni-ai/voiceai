/**
 * Cognitive Intelligence Types Tests
 *
 * Tests for cognitive distortion detection, ANT tracking,
 * Socratic questioning, and thought record types.
 */

import { describe, it, expect } from 'vitest';

import {
  type CognitiveDistortion,
  type DistortionMetadata,
  type DistortionDetection,
  type ResponseApproach,
  type DistortionResponse,
  type ANTInstance,
  type ANTProfile,
  type SocraticSequence,
  type SocraticContext,
  type ThoughtRecord,
  type RestructuringProgress,
  type CognitiveContextInjection,
  type CognitiveIntelligenceConfig,
  DEFAULT_CONFIG,
} from '../types.js';

describe('CognitiveIntelligence Types', () => {
  describe('CognitiveDistortion type', () => {
    it('should support all 15 distortion types', () => {
      const distortions: CognitiveDistortion[] = [
        'catastrophizing',
        'mind_reading',
        'all_or_nothing',
        'fortune_telling',
        'personalization',
        'overgeneralization',
        'mental_filtering',
        'disqualifying_positive',
        'should_statements',
        'emotional_reasoning',
        'labeling',
        'magnification',
        'minimization',
        'jumping_to_conclusions',
        'blame',
      ];

      expect(distortions).toHaveLength(15);
    });

    it('should have string literal values', () => {
      const distortion: CognitiveDistortion = 'catastrophizing';
      expect(typeof distortion).toBe('string');
    });
  });

  describe('DistortionMetadata', () => {
    it('should create valid metadata object', () => {
      const metadata: DistortionMetadata = {
        type: 'catastrophizing',
        name: 'Catastrophizing',
        description: 'Expecting the worst possible outcome',
        indicatorPhrases: ['worst case', 'disaster', 'everything will'],
        patterns: [/worst/i, /disaster/i],
        gentleLabel: 'jumping to the worst conclusion',
        contextTriggers: ['health', 'finances', 'relationships'],
        associatedEmotions: ['anxiety', 'fear', 'dread'],
      };

      expect(metadata.type).toBe('catastrophizing');
      expect(metadata.indicatorPhrases).toHaveLength(3);
      expect(metadata.patterns).toHaveLength(2);
    });

    it('should support regex patterns for detection', () => {
      const patterns: RegExp[] = [/always/i, /never/i, /everyone/i];
      const testText = "Everyone always thinks I'm wrong";

      const matches = patterns.filter((p) => p.test(testText));
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  describe('DistortionDetection', () => {
    it('should create valid detection result', () => {
      const detection: DistortionDetection = {
        type: 'mind_reading',
        confidence: 0.85,
        triggerPhrase: 'they probably think',
        userMessage: "They probably think I'm stupid",
        detectedAt: new Date(),
        gentleChallenge: 'What evidence do you have for what they think?',
        reframe: 'Maybe they were just focused on their own concerns',
        validation: "It makes sense to care about others' opinions",
        patternCount: 3,
        relatedDistortions: ['personalization', 'fortune_telling'],
        isRecurring: true,
      };

      expect(detection.confidence).toBe(0.85);
      expect(detection.isRecurring).toBe(true);
      expect(detection.relatedDistortions).toContain('personalization');
    });

    it('should support optional context fields', () => {
      const detection: DistortionDetection = {
        type: 'all_or_nothing',
        confidence: 0.7,
        triggerPhrase: 'complete failure',
        userMessage: "I'm a complete failure",
        detectedAt: new Date(),
        gentleChallenge: 'Can you think of any successes, even small ones?',
        reframe: "One setback doesn't define your whole worth",
        validation: "It hurts to feel like things aren't going well",
        topic: 'career',
        emotion: 'frustrated',
        emotionIntensity: 0.8,
        patternCount: 1,
        relatedDistortions: [],
        isRecurring: false,
      };

      expect(detection.topic).toBe('career');
      expect(detection.emotionIntensity).toBe(0.8);
    });

    it('should track pattern count for learning', () => {
      const detection: DistortionDetection = {
        type: 'should_statements',
        confidence: 0.9,
        triggerPhrase: 'I should have',
        userMessage: 'I should have done better',
        detectedAt: new Date(),
        gentleChallenge: 'Says who? What rule are you measuring against?',
        reframe: 'You did what you could with what you knew then',
        validation: 'Having high standards shows you care',
        patternCount: 7,
        relatedDistortions: ['labeling'],
        isRecurring: true,
      };

      expect(detection.patternCount).toBe(7);
    });
  });

  describe('ResponseApproach', () => {
    it('should have all response approaches', () => {
      const approaches: ResponseApproach[] = [
        'socratic',
        'validate',
        'gentle_name',
        'reframe',
        'wait',
      ];

      expect(approaches).toHaveLength(5);
    });
  });

  describe('DistortionResponse', () => {
    it('should create Socratic response', () => {
      const response: DistortionResponse = {
        approach: 'socratic',
        reason: 'User seems open to exploration',
        suggestion: 'What evidence supports this thought?',
        injectIntoContext: true,
        priority: 80,
      };

      expect(response.approach).toBe('socratic');
      expect(response.injectIntoContext).toBe(true);
    });

    it('should create wait response when timing is wrong', () => {
      const response: DistortionResponse = {
        approach: 'wait',
        reason: 'User is too distressed, need to stabilize first',
        injectIntoContext: false,
        priority: 0,
      };

      expect(response.approach).toBe('wait');
      expect(response.suggestion).toBeUndefined();
    });
  });

  describe('ANTInstance', () => {
    it('should create automatic negative thought instance', () => {
      const ant: ANTInstance = {
        id: 'ant_123',
        userId: 'user-456',
        timestamp: new Date(),
        thought: 'Nobody likes me',
        distortions: ['overgeneralization', 'mind_reading'],
        confidence: 0.75,
        topic: 'social',
        emotion: 'lonely',
        timeOfDay: 'evening',
        dayOfWeek: 5,
        wasAddressed: true,
        reframeAttempted: 'Some people do appreciate you',
        userResponse: 'receptive',
      };

      expect(ant.distortions).toHaveLength(2);
      expect(ant.wasAddressed).toBe(true);
      expect(ant.userResponse).toBe('receptive');
    });

    it('should track time patterns', () => {
      const morningAnt: ANTInstance = {
        id: 'ant_morning',
        userId: 'user-123',
        timestamp: new Date(),
        thought: 'Today is going to be terrible',
        distortions: ['fortune_telling'],
        confidence: 0.8,
        timeOfDay: 'morning',
        dayOfWeek: 1,
        wasAddressed: false,
      };

      const nightAnt: ANTInstance = {
        id: 'ant_night',
        userId: 'user-123',
        timestamp: new Date(),
        thought: 'I wasted another day',
        distortions: ['all_or_nothing'],
        confidence: 0.7,
        timeOfDay: 'night',
        dayOfWeek: 1,
        wasAddressed: false,
      };

      expect(morningAnt.timeOfDay).toBe('morning');
      expect(nightAnt.timeOfDay).toBe('night');
    });

    it('should support all user response types', () => {
      const responses: ANTInstance['userResponse'][] = [
        'receptive',
        'resistant',
        'neutral',
        'breakthrough',
      ];

      responses.forEach((response) => {
        expect(typeof response).toBe('string');
      });
    });
  });

  describe('ANTProfile', () => {
    it('should aggregate ANT patterns', () => {
      const profile: ANTProfile = {
        userId: 'user-123',
        totalDetected: 42,
        byDistortion: new Map([
          ['catastrophizing', 15],
          ['should_statements', 12],
          ['all_or_nothing', 8],
          ['mind_reading', 7],
        ]),
        topDistortions: ['catastrophizing', 'should_statements', 'all_or_nothing'],
        byTimeOfDay: new Map([
          ['morning', ['fortune_telling', 'catastrophizing']],
          ['evening', ['all_or_nothing', 'should_statements']],
        ]),
        byDayOfWeek: new Map([
          [0, ['catastrophizing']], // Sunday
          [1, ['should_statements']], // Monday
        ]),
        topicTriggers: new Map([
          ['work', ['should_statements', 'catastrophizing']],
          ['relationships', ['mind_reading', 'personalization']],
        ]),
        emotionCorrelations: new Map([
          ['anxiety', ['catastrophizing', 'fortune_telling']],
          ['guilt', ['should_statements', 'personalization']],
        ]),
        trend: 'improving',
        reframeSuccessRate: 0.65,
        lastUpdated: new Date(),
      };

      expect(profile.totalDetected).toBe(42);
      expect(profile.topDistortions).toHaveLength(3);
      expect(profile.trend).toBe('improving');
      expect(profile.reframeSuccessRate).toBe(0.65);
    });

    it('should track temporal patterns', () => {
      const profile: ANTProfile = {
        userId: 'user-123',
        totalDetected: 10,
        byDistortion: new Map(),
        topDistortions: [],
        byTimeOfDay: new Map([
          ['morning', ['fortune_telling']],
          ['night', ['all_or_nothing', 'catastrophizing']],
        ]),
        byDayOfWeek: new Map([
          [0, ['catastrophizing']], // Sunday blues
          [1, ['should_statements']], // Monday stress
        ]),
        topicTriggers: new Map(),
        emotionCorrelations: new Map(),
        trend: 'stable',
        reframeSuccessRate: 0.5,
        lastUpdated: new Date(),
      };

      expect(profile.byTimeOfDay.get('night')).toHaveLength(2);
      expect(profile.byDayOfWeek.get(1)).toContain('should_statements');
    });
  });

  describe('SocraticSequence', () => {
    it('should create question sequence for distortion', () => {
      const sequence: SocraticSequence = {
        distortion: 'catastrophizing',
        evidenceFor: [
          'What specific evidence supports this worst-case scenario?',
          'Has this exact thing happened before?',
        ],
        evidenceAgainst: [
          'What are some ways this could turn out differently?',
          'Have similar situations ever worked out okay?',
        ],
        alternativeViews: [
          'What would you tell a friend in this situation?',
          'How might someone else see this?',
        ],
        realityTest: [
          'On a scale of 1-10, how likely is this really?',
          "What's the most realistic outcome?",
        ],
        decatastrophize: [
          'If the worst did happen, how would you cope?',
          'What resources would you have to handle it?',
        ],
        ferniIntro: "I notice you're imagining the worst...",
        peterApproach: "Let's look at the data objectively...",
        mayaApproach: "Let's break this down into smaller pieces...",
      };

      expect(sequence.evidenceFor).toHaveLength(2);
      expect(sequence.decatastrophize).toHaveLength(2);
      expect(sequence.ferniIntro).toContain('imagining the worst');
    });

    it('should support persona-specific approaches', () => {
      const sequence: SocraticSequence = {
        distortion: 'all_or_nothing',
        evidenceFor: ['What makes you see this as all-or-nothing?'],
        evidenceAgainst: ['What shades of gray might exist here?'],
        alternativeViews: ['Is there a middle ground?'],
        realityTest: ['What would a 50% success look like?'],
        decatastrophize: ['What if partial success is still valuable?'],
        ferniIntro: 'I hear you seeing this in black and white...',
        peterApproach: "Let's quantify the spectrum of outcomes...",
      };

      expect(sequence.peterApproach).toContain('quantify');
      expect(sequence.mayaApproach).toBeUndefined();
    });
  });

  describe('SocraticContext', () => {
    it('should provide context for question selection', () => {
      const context: SocraticContext = {
        userId: 'user-123',
        distortion: 'mind_reading',
        triggerThought: 'They probably hate me',
        questionsAsked: [
          'What makes you think that?',
          'Did they say anything that suggested that?',
        ],
        emotionalState: 'anxious',
        emotionalIntensity: 0.7,
        relationshipStage: 'established',
        receptivity: 'high',
      };

      expect(context.questionsAsked).toHaveLength(2);
      expect(context.relationshipStage).toBe('established');
      expect(context.receptivity).toBe('high');
    });

    it('should support all relationship stages', () => {
      const stages: SocraticContext['relationshipStage'][] = [
        'new',
        'building',
        'established',
        'deep',
      ];

      stages.forEach((stage) => {
        expect(typeof stage).toBe('string');
      });
    });

    it('should support all receptivity levels', () => {
      const levels: SocraticContext['receptivity'][] = ['high', 'medium', 'low', 'unknown'];

      levels.forEach((level) => {
        expect(typeof level).toBe('string');
      });
    });
  });

  describe('ThoughtRecord', () => {
    it('should create complete thought record', () => {
      const record: ThoughtRecord = {
        id: 'tr_123',
        userId: 'user-456',
        createdAt: new Date('2024-12-25T10:00:00Z'),
        updatedAt: new Date('2024-12-25T10:30:00Z'),
        situation: {
          what: 'Got critical feedback on my project',
          when: new Date('2024-12-25T09:00:00Z'),
          where: 'work meeting',
          who: ['manager', 'team lead'],
        },
        automaticThoughts: [
          {
            thought: "I'm terrible at my job",
            beliefStrength: 85,
            distortions: ['all_or_nothing', 'labeling'],
          },
          {
            thought: 'Everyone saw how bad I am',
            beliefStrength: 70,
            distortions: ['mind_reading', 'overgeneralization'],
          },
        ],
        emotions: [
          { emotion: 'shame', intensity: 80 },
          { emotion: 'anxiety', intensity: 65 },
        ],
        bodySensations: ['tight chest', 'racing heart', 'sweaty palms'],
        evidenceFor: ['The feedback mentioned areas for improvement'],
        evidenceAgainst: [
          "I've received positive feedback before",
          'The feedback also mentioned strengths',
          'Colleagues still asked for my input after',
        ],
        balancedThought: "I received constructive feedback that doesn't define my overall ability",
        newBeliefStrength: 30,
        newEmotions: [
          { emotion: 'disappointment', intensity: 40 },
          { emotion: 'determination', intensity: 60 },
        ],
        whatLearned: 'Feedback is about specific work, not my worth as a person',
        source: 'voice_guided',
        status: 'completed',
        durationMinutes: 25,
      };

      expect(record.automaticThoughts).toHaveLength(2);
      expect(record.emotions).toHaveLength(2);
      expect(record.evidenceAgainst).toHaveLength(3);
      expect(record.newBeliefStrength).toBeLessThan(record.automaticThoughts[0].beliefStrength);
    });

    it('should support in-progress records', () => {
      const record: ThoughtRecord = {
        id: 'tr_inprogress',
        userId: 'user-789',
        createdAt: new Date(),
        updatedAt: new Date(),
        situation: {
          what: 'Argument with friend',
          when: new Date(),
        },
        automaticThoughts: [
          {
            thought: "They don't care about me",
            beliefStrength: 90,
            distortions: ['mind_reading'],
          },
        ],
        emotions: [{ emotion: 'hurt', intensity: 75 }],
        evidenceFor: [],
        evidenceAgainst: [],
        source: 'ferni_suggested',
        status: 'in_progress',
      };

      expect(record.status).toBe('in_progress');
      expect(record.balancedThought).toBeUndefined();
    });

    it('should support all record sources', () => {
      const sources: ThoughtRecord['source'][] = [
        'voice_guided',
        'text_guided',
        'user_initiated',
        'ferni_suggested',
      ];

      sources.forEach((source) => {
        expect(typeof source).toBe('string');
      });
    });
  });

  describe('RestructuringProgress', () => {
    it('should track overall restructuring progress', () => {
      const progress: RestructuringProgress = {
        userId: 'user-123',
        avgDistortionsPerConversation: 1.5,
        overallTrend: 'improving',
        byDistortion: new Map([
          [
            'catastrophizing',
            {
              frequency: 12,
              trend: 'improving',
              successfulReframes: 8,
              totalAttempts: 10,
              reframeSuccessRate: 0.8,
              lastDetected: new Date(),
            },
          ],
          [
            'should_statements',
            {
              frequency: 8,
              trend: 'stable',
              successfulReframes: 4,
              totalAttempts: 7,
              reframeSuccessRate: 0.57,
            },
          ],
        ]),
        thoughtRecordsCompleted: 5,
        avgEmotionReduction: 35,
        selfCaughtDistortions: 3,
        userInitiatedReframes: 2,
        milestones: {
          firstDistortionDetected: new Date('2024-11-01'),
          firstReframeSuccess: new Date('2024-11-05'),
          firstSelfCatch: new Date('2024-11-20'),
          tenReframesCompleted: new Date('2024-12-01'),
          thoughtRecordCompleted: new Date('2024-12-10'),
        },
        firstRecorded: new Date('2024-11-01'),
        lastUpdated: new Date(),
      };

      expect(progress.overallTrend).toBe('improving');
      expect(progress.thoughtRecordsCompleted).toBe(5);
      expect(progress.selfCaughtDistortions).toBe(3);
      expect(progress.milestones.firstSelfCatch).toBeDefined();
    });

    it('should calculate reframe success rates', () => {
      const distortionProgress = {
        frequency: 20,
        trend: 'improving' as const,
        successfulReframes: 15,
        totalAttempts: 20,
        reframeSuccessRate: 0.75,
      };

      expect(distortionProgress.reframeSuccessRate).toBe(
        distortionProgress.successfulReframes / distortionProgress.totalAttempts
      );
    });
  });

  describe('CognitiveContextInjection', () => {
    it('should create injection when distortion detected', () => {
      const injection: CognitiveContextInjection = {
        hasDistortion: true,
        detection: {
          type: 'catastrophizing',
          confidence: 0.8,
          triggerPhrase: 'everything will fall apart',
          userMessage: "If this doesn't work, everything will fall apart",
          detectedAt: new Date(),
          gentleChallenge: 'What are some other possible outcomes?',
          reframe: "One outcome doesn't determine everything",
          validation: "It's natural to worry about important things",
          patternCount: 2,
          relatedDistortions: [],
          isRecurring: false,
        },
        response: {
          approach: 'socratic',
          reason: 'Medium confidence, established relationship',
          suggestion: 'Ask about alternative outcomes',
          injectIntoContext: true,
          priority: 75,
        },
        llmContext:
          'User appears to be catastrophizing about outcomes. Consider gently exploring alternative perspectives.',
        priority: 75,
      };

      expect(injection.hasDistortion).toBe(true);
      expect(injection.detection?.type).toBe('catastrophizing');
      expect(injection.llmContext).toContain('catastrophizing');
    });

    it('should handle no distortion case', () => {
      const injection: CognitiveContextInjection = {
        hasDistortion: false,
        response: {
          approach: 'wait',
          reason: 'No distortion detected',
          injectIntoContext: false,
          priority: 0,
        },
        llmContext: '',
        priority: 0,
      };

      expect(injection.hasDistortion).toBe(false);
      expect(injection.detection).toBeUndefined();
    });
  });

  describe('CognitiveIntelligenceConfig', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_CONFIG.detectionThreshold).toBe(0.6);
      expect(DEFAULT_CONFIG.contextInjectionThreshold).toBe(0.7);
      expect(DEFAULT_CONFIG.recurringThreshold).toBe(3);
      expect(DEFAULT_CONFIG.enableANTTracking).toBe(true);
      expect(DEFAULT_CONFIG.enableThoughtRecords).toBe(true);
      expect(DEFAULT_CONFIG.enableProgressTracking).toBe(true);
    });

    it('should allow custom configuration', () => {
      const customConfig: CognitiveIntelligenceConfig = {
        detectionThreshold: 0.7,
        contextInjectionThreshold: 0.85,
        recurringThreshold: 5,
        enableANTTracking: false,
        enableThoughtRecords: true,
        enableProgressTracking: false,
      };

      expect(customConfig.detectionThreshold).toBeGreaterThan(DEFAULT_CONFIG.detectionThreshold);
      expect(customConfig.enableANTTracking).toBe(false);
    });

    it('should have injection threshold higher than detection', () => {
      expect(DEFAULT_CONFIG.contextInjectionThreshold).toBeGreaterThan(
        DEFAULT_CONFIG.detectionThreshold
      );
    });
  });

  describe('Integration scenarios', () => {
    it('should support full detection → response flow', () => {
      // 1. Detect distortion
      const detection: DistortionDetection = {
        type: 'emotional_reasoning',
        confidence: 0.78,
        triggerPhrase: 'I feel stupid, so I must be',
        userMessage: 'I feel stupid, so I must be stupid',
        detectedAt: new Date(),
        gentleChallenge: 'Can feelings tell us facts about ourselves?',
        reframe: "Feeling something doesn't make it true",
        validation: 'That feeling is uncomfortable',
        patternCount: 1,
        relatedDistortions: ['labeling'],
        isRecurring: false,
      };

      // 2. Determine response
      const response: DistortionResponse = {
        approach: 'validate',
        reason: 'First time seeing this pattern, start with validation',
        suggestion: detection.validation,
        injectIntoContext: true,
        priority: 65,
      };

      // 3. Create context injection
      const injection: CognitiveContextInjection = {
        hasDistortion: true,
        detection,
        response,
        llmContext: `Detected emotional reasoning: "${detection.triggerPhrase}". Respond with validation first.`,
        priority: response.priority,
      };

      expect(injection.hasDistortion).toBe(true);
      expect(injection.response.approach).toBe('validate');
    });

    it('should track progress across sessions', () => {
      // Week 1: First detection
      const week1Ant: ANTInstance = {
        id: 'ant_w1',
        userId: 'user-123',
        timestamp: new Date('2024-12-01'),
        thought: 'I always mess things up',
        distortions: ['overgeneralization'],
        confidence: 0.85,
        timeOfDay: 'morning',
        dayOfWeek: 1,
        wasAddressed: true,
        reframeAttempted: "Can you think of times you didn't?",
        userResponse: 'resistant',
      };

      // Week 3: Same pattern, different response
      const week3Ant: ANTInstance = {
        id: 'ant_w3',
        userId: 'user-123',
        timestamp: new Date('2024-12-15'),
        thought: 'I always forget things',
        distortions: ['overgeneralization'],
        confidence: 0.75,
        timeOfDay: 'morning',
        dayOfWeek: 1,
        wasAddressed: true,
        reframeAttempted: 'Always? What about yesterday?',
        userResponse: 'receptive',
      };

      // Progress shows improvement
      const progress: RestructuringProgress = {
        userId: 'user-123',
        avgDistortionsPerConversation: 0.8,
        overallTrend: 'improving',
        byDistortion: new Map([
          [
            'overgeneralization',
            {
              frequency: 5,
              trend: 'improving',
              successfulReframes: 3,
              totalAttempts: 5,
              reframeSuccessRate: 0.6,
            },
          ],
        ]),
        thoughtRecordsCompleted: 0,
        avgEmotionReduction: 0,
        selfCaughtDistortions: 0,
        userInitiatedReframes: 0,
        milestones: {
          firstDistortionDetected: week1Ant.timestamp,
          firstReframeSuccess: week3Ant.timestamp,
        },
        firstRecorded: week1Ant.timestamp,
        lastUpdated: week3Ant.timestamp,
      };

      expect(week1Ant.userResponse).toBe('resistant');
      expect(week3Ant.userResponse).toBe('receptive');
      expect(progress.overallTrend).toBe('improving');
    });
  });
});
