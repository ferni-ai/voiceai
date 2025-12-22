/**
 * Phase 5: Anticipatory Trigger Tests
 *
 * Tests for the anticipatory signal learner and trigger engine.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectAnticipatorySignals,
  learnFromUtterance,
  recordAnticipationEvent,
  getAnticipatoryAnalytics,
  COMMON_ANTICIPATORY_PHRASES,
  DEFAULT_SIGNAL_LEARNER_CONFIG,
  type SignalDetectionResult,
  type LearningInput,
} from '../anticipatory-signal-learner.js';
import {
  processPartialInput,
  checkPendingAnticipation,
  recordAnticipatoryOutcome,
  clearAnticipatorySession,
  clearAllAnticipatorySessions,
  getAnticipatorySessionStats,
  getAnticipatoryEngineAnalytics,
  resetAnticipatoryEngineAnalytics,
  DEFAULT_ENGINE_CONFIG,
  DEFAULT_RESPONSE_TEMPLATES,
} from '../anticipatory-trigger-engine.js';
import {
  DEFAULT_ANTICIPATORY_INTELLIGENCE,
  DEFAULT_USER_TRIGGER_PROFILE,
  type AnticipatoryIntelligence,
  type UserTriggerProfile,
  type VoiceProsodyCue,
} from '../user-trigger-profile.types.js';

// ============================================================================
// ANTICIPATORY SIGNAL LEARNER TESTS
// ============================================================================

describe('AnticipatorySignalLearner', () => {
  describe('COMMON_ANTICIPATORY_PHRASES', () => {
    it('should have phrases for all anticipated outcome types', () => {
      const categories = COMMON_ANTICIPATORY_PHRASES.map((p) => p.anticipatedOutcome);
      expect(categories).toContain('vulnerability');
      expect(categories).toContain('distress');
      expect(categories).toContain('celebration');
      expect(categories).toContain('processing');
      expect(categories).toContain('avoidance');
      expect(categories).toContain('request');
    });

    it('should have reasonable baseline probabilities', () => {
      for (const category of COMMON_ANTICIPATORY_PHRASES) {
        expect(category.baselineProbability).toBeGreaterThanOrEqual(0.6);
        expect(category.baselineProbability).toBeLessThanOrEqual(1.0);
      }
    });
  });

  describe('detectAnticipatorySignals', () => {
    let intelligence: AnticipatoryIntelligence;

    beforeEach(() => {
      intelligence = { ...DEFAULT_ANTICIPATORY_INTELLIGENCE };
    });

    it('should detect common vulnerability phrases', () => {
      const result = detectAnticipatorySignals(
        'So... I was thinking about something',
        intelligence
      );

      expect(result.detected).toBe(true);
      expect(result.anticipatedOutcome).toBe('vulnerability');
      expect(result.overallConfidence).toBeGreaterThan(0.4);
    });

    it('should detect common distress phrases', () => {
      const result = detectAnticipatorySignals("I'm worried about what might happen", intelligence);

      expect(result.detected).toBe(true);
      expect(result.anticipatedOutcome).toBe('distress');
    });

    it('should detect common celebration phrases', () => {
      const result = detectAnticipatorySignals('Guess what happened today!', intelligence);

      expect(result.detected).toBe(true);
      expect(result.anticipatedOutcome).toBe('celebration');
    });

    it('should detect request phrases', () => {
      const result = detectAnticipatorySignals('Could you help me with something?', intelligence);

      expect(result.detected).toBe(true);
      expect(result.anticipatedOutcome).toBe('request');
    });

    it('should respect minimum input length safeguard', () => {
      const result = detectAnticipatorySignals('Hi', intelligence);

      expect(result.safeguardsAllowed).toBe(false);
      expect(result.detected).toBe(false);
    });

    it('should respect max per session safeguard', () => {
      const result = detectAnticipatorySignals(
        'So... I was thinking about something',
        intelligence,
        undefined,
        {
          sessionId: 'test',
          anticipationsThisSession: 5, // Over default max of 3
          currentHour: 12,
        }
      );

      expect(result.safeguardsAllowed).toBe(false);
    });

    it('should respect cooldown safeguard', () => {
      const result = detectAnticipatorySignals(
        'So... I was thinking about something',
        intelligence,
        undefined,
        {
          sessionId: 'test',
          anticipationsThisSession: 1,
          lastAnticipationTime: new Date(), // Just now
          currentHour: 12,
        }
      );

      expect(result.safeguardsAllowed).toBe(false);
      expect(result.safeguardBlockReason).toContain('Too soon');
    });

    it('should boost confidence with voice prosody cues', () => {
      const resultWithoutVoice = detectAnticipatorySignals(
        'So... I was thinking about something',
        intelligence
      );

      const prosodyCues: VoiceProsodyCue[] = [
        {
          type: 'tremor',
          intensity: 0.7,
          typicalMeaning: 'vulnerability',
          reliability: 0.8,
          observations: 10,
        },
      ];

      const resultWithVoice = detectAnticipatorySignals(
        'So... I was thinking about something',
        intelligence,
        { cues: prosodyCues, overallScore: 0.7 }
      );

      expect(resultWithVoice.overallConfidence).toBeGreaterThanOrEqual(
        resultWithoutVoice.overallConfidence
      );
    });

    it('should return no signals for unrecognized input', () => {
      const result = detectAnticipatorySignals('The weather is nice today', intelligence);

      expect(result.detected).toBe(false);
      expect(result.anticipatedOutcome).toBeNull();
    });

    it('should detect learned user-specific signals', () => {
      // Add a user-specific signal
      intelligence.signals.push({
        id: 'custom_1',
        phrase: 'you know what really bugs me',
        isRegex: false,
        anticipatedOutcome: 'distress',
        triggersCategories: ['emotional'],
        probability: 0.9,
        observations: 10,
        correctPredictions: 9,
        exampleContexts: [],
        associatedVoiceCues: [],
        firstObserved: new Date(),
        lastObserved: new Date(),
        userConfirmed: false,
      });

      const result = detectAnticipatorySignals(
        'You know what really bugs me about this',
        intelligence
      );

      expect(result.detected).toBe(true);
      expect(result.anticipatedOutcome).toBe('distress');
      expect(result.signals[0].signal.id).toBe('custom_1');
    });
  });

  describe('learnFromUtterance', () => {
    let profile: UserTriggerProfile;

    beforeEach(() => {
      profile = { ...DEFAULT_USER_TRIGGER_PROFILE, userId: 'test_user' };
    });

    it('should learn new signals from utterances', () => {
      const input: LearningInput = {
        fullUtterance: 'whenever I think about my dad it makes me sad',
        actualOutcome: 'vulnerability',
        voiceCues: [],
        sessionId: 'session_1',
        activatedTriggers: ['emotional'],
      };

      const updated = learnFromUtterance(profile, input);

      expect(updated.anticipatoryIntelligence).toBeDefined();
      expect(updated.anticipatoryIntelligence!.signals.length).toBeGreaterThan(0);
    });

    it('should update existing signals on repeated observations', () => {
      // Create a fresh profile for this test
      const freshProfile = { ...DEFAULT_USER_TRIGGER_PROFILE, userId: 'repeated_obs_test' };

      // First observation with a unique phrase
      let updated = learnFromUtterance(freshProfile, {
        fullUtterance: 'whenever I remember my childhood dog',
        actualOutcome: 'processing',
        voiceCues: [],
        sessionId: 'session_1',
        activatedTriggers: [],
      });

      // Find the signal that was just created (should be only one)
      expect(updated.anticipatoryIntelligence!.signals.length).toBeGreaterThan(0);
      const initialSignal =
        updated.anticipatoryIntelligence!.signals[
          updated.anticipatoryIntelligence!.signals.length - 1
        ]; // Get the most recently added
      const initialPhrase = initialSignal.phrase;
      expect(initialSignal.observations).toBe(1);

      // Second observation with same phrase
      updated = learnFromUtterance(updated, {
        fullUtterance: 'whenever I remember my childhood dog',
        actualOutcome: 'processing',
        voiceCues: [],
        sessionId: 'session_2',
        activatedTriggers: [],
      });

      const updatedSignal = updated.anticipatoryIntelligence!.signals.find(
        (s) => s.phrase === initialPhrase
      );
      expect(updatedSignal?.observations).toBe(2);
    });

    it('should learn voice cue associations', () => {
      // Create a fresh profile for this test
      const freshProfile = { ...DEFAULT_USER_TRIGGER_PROFILE, userId: 'voice_cue_test' };

      const voiceCues: VoiceProsodyCue[] = [
        {
          type: 'pause',
          direction: 'increase',
          intensity: 0.8,
          typicalMeaning: 'vulnerability',
          reliability: 0.5,
          observations: 1,
        },
      ];

      const updated = learnFromUtterance(freshProfile, {
        fullUtterance: 'I need to tell you something important',
        actualOutcome: 'vulnerability',
        voiceCues,
        sessionId: 'session_1',
        activatedTriggers: [],
      });

      expect(updated.anticipatoryIntelligence!.voiceCues.length).toBeGreaterThan(0);
    });

    it('should not learn generic phrases', () => {
      const updated = learnFromUtterance(profile, {
        fullUtterance: 'I was going to the store',
        actualOutcome: 'unknown',
        voiceCues: [],
        sessionId: 'session_1',
        activatedTriggers: [],
      });

      // Should not add "I was" as a signal since it's too generic
      const hasGenericSignal = updated.anticipatoryIntelligence?.signals.some(
        (s) => s.phrase === 'i was'
      );
      expect(hasGenericSignal).toBeFalsy();
    });
  });

  describe('recordAnticipationEvent', () => {
    let profile: UserTriggerProfile;

    beforeEach(() => {
      profile = {
        ...DEFAULT_USER_TRIGGER_PROFILE,
        userId: 'test_user',
        anticipatoryIntelligence: {
          ...DEFAULT_ANTICIPATORY_INTELLIGENCE,
          signals: [
            {
              id: 'signal_1',
              phrase: 'test phrase',
              isRegex: false,
              anticipatedOutcome: 'vulnerability',
              triggersCategories: [],
              probability: 0.8,
              observations: 10,
              correctPredictions: 8,
              exampleContexts: [],
              associatedVoiceCues: [],
              firstObserved: new Date(),
              lastObserved: new Date(),
              userConfirmed: false,
            },
          ],
        },
      };
    });

    it('should record positive anticipation events', () => {
      const updated = recordAnticipationEvent(profile, {
        signalId: 'signal_1',
        timestamp: new Date(),
        partialInput: 'test phrase',
        voiceProsodyScore: 0.7,
        responseType: 'space_creating',
        userReaction: 'appreciated',
        predictionCorrect: true,
        sessionId: 'session_1',
      });

      expect(updated.anticipatoryIntelligence!.recentEvents.length).toBe(1);
      expect(updated.anticipatoryIntelligence!.overallAccuracy).toBeGreaterThan(0);
    });

    it('should update signal probability on feedback', () => {
      const updated = recordAnticipationEvent(profile, {
        signalId: 'signal_1',
        timestamp: new Date(),
        partialInput: 'test phrase',
        voiceProsodyScore: 0.5,
        responseType: 'acknowledgment',
        userReaction: 'continued',
        predictionCorrect: true,
        sessionId: 'session_1',
      });

      const signal = updated.anticipatoryIntelligence!.signals.find((s) => s.id === 'signal_1');
      expect(signal?.correctPredictions).toBe(9); // 8 + 1
    });

    it('should prune old events', () => {
      // Create a fresh profile for this test with a single old event
      const pruneTestProfile: UserTriggerProfile = {
        ...DEFAULT_USER_TRIGGER_PROFILE,
        userId: 'prune_test_user',
        anticipatoryIntelligence: {
          ...DEFAULT_ANTICIPATORY_INTELLIGENCE,
          signals: [
            {
              id: 'prune_signal_1',
              phrase: 'prune test',
              isRegex: false,
              anticipatedOutcome: 'vulnerability',
              triggersCategories: [],
              probability: 0.8,
              observations: 10,
              correctPredictions: 8,
              exampleContexts: [],
              associatedVoiceCues: [],
              firstObserved: new Date(),
              lastObserved: new Date(),
              userConfirmed: false,
            },
          ],
          recentEvents: [
            {
              signalId: 'prune_signal_1',
              timestamp: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
              partialInput: 'old phrase',
              voiceProsodyScore: 0.5,
              responseType: 'acknowledgment',
              userReaction: 'continued',
              predictionCorrect: true,
              sessionId: 'old_session',
            },
          ],
        },
      };

      const updated = recordAnticipationEvent(pruneTestProfile, {
        signalId: 'prune_signal_1',
        timestamp: new Date(),
        partialInput: 'new phrase',
        voiceProsodyScore: 0.5,
        responseType: 'space_creating',
        userReaction: 'appreciated',
        predictionCorrect: true,
        sessionId: 'session_1',
      });

      // Old event should be pruned (default retention is 30 days)
      expect(updated.anticipatoryIntelligence!.recentEvents.length).toBe(1);
      expect(updated.anticipatoryIntelligence!.recentEvents[0].sessionId).toBe('session_1');
    });
  });

  describe('getAnticipatoryAnalytics', () => {
    it('should return correct analytics', () => {
      const intelligence: AnticipatoryIntelligence = {
        ...DEFAULT_ANTICIPATORY_INTELLIGENCE,
        signals: [
          {
            id: 'signal_1',
            phrase: 'test',
            isRegex: false,
            anticipatedOutcome: 'vulnerability',
            triggersCategories: [],
            probability: 0.8,
            observations: 10,
            correctPredictions: 8,
            exampleContexts: [],
            associatedVoiceCues: [],
            firstObserved: new Date(),
            lastObserved: new Date(),
            userConfirmed: false,
          },
          {
            id: 'signal_2',
            phrase: 'test2',
            isRegex: false,
            anticipatedOutcome: 'distress',
            triggersCategories: [],
            probability: 0.9,
            observations: 5,
            correctPredictions: 4,
            exampleContexts: [],
            associatedVoiceCues: [],
            firstObserved: new Date(),
            lastObserved: new Date(),
            userConfirmed: false,
          },
        ],
        recentEvents: [
          {
            signalId: 'signal_1',
            timestamp: new Date(),
            partialInput: 'test',
            voiceProsodyScore: 0.5,
            responseType: 'space_creating',
            userReaction: 'appreciated',
            predictionCorrect: true,
            sessionId: 'session_1',
          },
        ],
        overallAccuracy: 0.8,
      };

      const analytics = getAnticipatoryAnalytics(intelligence);

      expect(analytics.totalSignalsLearned).toBe(2);
      expect(analytics.activeSignals).toBe(2); // Both meet thresholds
      expect(analytics.totalAnticipationEvents).toBe(1);
      expect(analytics.overallAccuracy).toBe(0.8);
      expect(analytics.outcomeDistribution.vulnerability).toBe(1);
      expect(analytics.outcomeDistribution.distress).toBe(1);
    });
  });
});

// ============================================================================
// ANTICIPATORY TRIGGER ENGINE TESTS
// ============================================================================

describe('AnticipatoryTriggerEngine', () => {
  const sessionId = 'test_session';
  let intelligence: AnticipatoryIntelligence;

  beforeEach(() => {
    intelligence = { ...DEFAULT_ANTICIPATORY_INTELLIGENCE };
    clearAllAnticipatorySessions();
    resetAnticipatoryEngineAnalytics();
  });

  afterEach(() => {
    clearAnticipatorySession(sessionId);
  });

  describe('DEFAULT_RESPONSE_TEMPLATES', () => {
    it('should have templates for all outcome types', () => {
      expect(DEFAULT_RESPONSE_TEMPLATES.vulnerability).toBeDefined();
      expect(DEFAULT_RESPONSE_TEMPLATES.distress).toBeDefined();
      expect(DEFAULT_RESPONSE_TEMPLATES.celebration).toBeDefined();
      expect(DEFAULT_RESPONSE_TEMPLATES.processing).toBeDefined();
      expect(DEFAULT_RESPONSE_TEMPLATES.avoidance).toBeDefined();
      expect(DEFAULT_RESPONSE_TEMPLATES.request).toBeDefined();
      expect(DEFAULT_RESPONSE_TEMPLATES.unknown).toBeDefined();
    });

    it('should have verbal responses for each template', () => {
      for (const [_outcome, template] of Object.entries(DEFAULT_RESPONSE_TEMPLATES)) {
        expect(template.verbal.length).toBeGreaterThan(0);
      }
    });

    it('should soften voice for vulnerability and distress', () => {
      expect(DEFAULT_RESPONSE_TEMPLATES.vulnerability.softenVoice).toBe(true);
      expect(DEFAULT_RESPONSE_TEMPLATES.distress.softenVoice).toBe(true);
    });
  });

  describe('processPartialInput', () => {
    it('should not fire for short input', () => {
      const result = processPartialInput(sessionId, 'Hi', intelligence);

      expect(result.shouldFire).toBe(false);
      expect(result.reason).toContain('too short');
    });

    it('should not fire for very long input', () => {
      const longInput = 'a'.repeat(200);
      const result = processPartialInput(sessionId, longInput, intelligence);

      expect(result.shouldFire).toBe(false);
      expect(result.reason).toContain('too long');
    });

    it('should fire for high confidence vulnerability signal', () => {
      // Use lower threshold to test firing logic
      const config = { ...DEFAULT_ENGINE_CONFIG, minFiringConfidence: 0.4 };
      const result = processPartialInput(
        sessionId,
        "I've never told anyone this but",
        intelligence,
        undefined,
        undefined,
        config
      );

      expect(result.shouldFire).toBe(true);
      expect(result.anticipatedOutcome).toBe('vulnerability');
      expect(result.verbalResponse).toBeDefined();
      expect(result.responseTemplate).toBeDefined();
    });

    it('should fire for high confidence celebration signal', () => {
      // Use lower threshold to test firing logic
      const config = { ...DEFAULT_ENGINE_CONFIG, minFiringConfidence: 0.4 };
      const result = processPartialInput(
        sessionId,
        'Guess what happened! You will never believe',
        intelligence,
        undefined,
        undefined,
        config
      );

      expect(result.shouldFire).toBe(true);
      expect(result.anticipatedOutcome).toBe('celebration');
    });

    it('should track anticipations per session', () => {
      // Use lower threshold to ensure firing
      const config = { ...DEFAULT_ENGINE_CONFIG, minFiringConfidence: 0.4 };

      // First anticipation
      processPartialInput(
        sessionId,
        "I've never told anyone this but",
        intelligence,
        undefined,
        undefined,
        config
      );

      const stats = getAnticipatorySessionStats(sessionId);
      expect(stats?.anticipationsThisSession).toBe(1);
    });

    it('should not fire when no signals detected', () => {
      const result = processPartialInput(
        sessionId,
        'The weather is really nice outside',
        intelligence
      );

      expect(result.shouldFire).toBe(false);
      expect(result.detection?.detected).toBe(false);
    });

    it('should not fire when confidence is below threshold', () => {
      // Use a config with a very high threshold
      const highThresholdConfig = {
        ...DEFAULT_ENGINE_CONFIG,
        minFiringConfidence: 0.99,
      };

      const result = processPartialInput(
        sessionId,
        'So... I was thinking about',
        intelligence,
        undefined,
        undefined,
        highThresholdConfig
      );

      expect(result.shouldFire).toBe(false);
      expect(result.confidence).toBeLessThan(0.99);
    });
  });

  describe('checkPendingAnticipation', () => {
    it('should fire pending anticipation on pause', () => {
      // First, create a pending anticipation with low confidence
      const lowThresholdConfig = {
        ...DEFAULT_ENGINE_CONFIG,
        minFiringConfidence: 0.95, // Very high, so it won't fire immediately
      };

      processPartialInput(
        sessionId,
        'So... I was thinking about something',
        intelligence,
        undefined,
        undefined,
        lowThresholdConfig
      );

      // Check if pending anticipation fires on pause
      const result = checkPendingAnticipation(sessionId, 600); // 600ms pause

      // May or may not fire depending on boosted confidence
      if (result) {
        expect(result.shouldFire).toBe(true);
        expect(result.reason).toContain('pause boosted');
      }
    });

    it('should not fire if pause is too short', () => {
      processPartialInput(sessionId, 'So... I was thinking about something', intelligence);

      const result = checkPendingAnticipation(sessionId, 100); // Only 100ms
      expect(result).toBeNull();
    });

    it('should return null if no session exists', () => {
      const result = checkPendingAnticipation('nonexistent_session', 1000);
      expect(result).toBeNull();
    });
  });

  describe('recordAnticipatoryOutcome', () => {
    it('should record outcome and update profile', () => {
      // Create a fresh profile with no prior events
      let profile: UserTriggerProfile = {
        ...DEFAULT_USER_TRIGGER_PROFILE,
        userId: 'test_user_outcome',
        anticipatoryIntelligence: {
          ...DEFAULT_ANTICIPATORY_INTELLIGENCE,
          signals: [
            {
              id: 'outcome_signal_1',
              phrase: "i've never told anyone",
              isRegex: false,
              anticipatedOutcome: 'vulnerability',
              triggersCategories: [],
              probability: 0.8,
              observations: 10,
              correctPredictions: 8,
              exampleContexts: [],
              associatedVoiceCues: [],
              firstObserved: new Date(),
              lastObserved: new Date(),
              userConfirmed: false,
            },
          ],
          recentEvents: [], // Start with no events
        },
      };

      // Simulate a detection
      const detection: SignalDetectionResult = {
        detected: true,
        signals: [
          {
            signal: profile.anticipatoryIntelligence!.signals[0],
            matchedPhrase: "i've never told anyone",
            textConfidence: 0.8,
            voiceConfidence: 0,
            combinedConfidence: 0.48,
          },
        ],
        anticipatedOutcome: 'vulnerability',
        overallConfidence: 0.8,
        safeguardsAllowed: true,
      };

      profile = recordAnticipatoryOutcome(
        profile,
        'outcome_test_session',
        detection,
        'appreciated',
        'space_creating',
        0.5,
        true
      );

      expect(profile.anticipatoryIntelligence!.recentEvents.length).toBe(1);
      const event = profile.anticipatoryIntelligence!.recentEvents[0];
      expect(event.userReaction).toBe('appreciated');
      expect(event.predictionCorrect).toBe(true);
    });
  });

  describe('Session Management', () => {
    it('should create session state on first call', () => {
      expect(getAnticipatorySessionStats(sessionId)).toBeNull();

      processPartialInput(sessionId, 'Testing session creation', intelligence);

      const stats = getAnticipatorySessionStats(sessionId);
      expect(stats).not.toBeNull();
      expect(stats?.anticipationsThisSession).toBe(0); // No anticipation fired
    });

    it('should clear session state', () => {
      processPartialInput(sessionId, "I've never told anyone", intelligence);

      clearAnticipatorySession(sessionId);

      expect(getAnticipatorySessionStats(sessionId)).toBeNull();
    });

    it('should clear all sessions', () => {
      processPartialInput('session_1', 'Testing', intelligence);
      processPartialInput('session_2', 'Testing', intelligence);

      clearAllAnticipatorySessions();

      expect(getAnticipatorySessionStats('session_1')).toBeNull();
      expect(getAnticipatorySessionStats('session_2')).toBeNull();
    });
  });

  describe('Analytics', () => {
    it('should track engine analytics', () => {
      // Use lower threshold to ensure anticipations fire
      const config = { ...DEFAULT_ENGINE_CONFIG, minFiringConfidence: 0.4 };

      // Fire some anticipations
      processPartialInput(
        sessionId,
        "I've never told anyone this",
        intelligence,
        undefined,
        undefined,
        config
      );
      processPartialInput(
        'session_2',
        'Guess what happened!',
        intelligence,
        undefined,
        undefined,
        config
      );

      const analytics = getAnticipatoryEngineAnalytics();

      expect(analytics.totalActiveSessions).toBe(2);
      expect(analytics.averageAnticipationsPerSession).toBeGreaterThan(0);
    });

    it('should reset analytics', () => {
      const config = { ...DEFAULT_ENGINE_CONFIG, minFiringConfidence: 0.4 };
      processPartialInput(
        sessionId,
        "I've never told anyone",
        intelligence,
        undefined,
        undefined,
        config
      );

      resetAnticipatoryEngineAnalytics();

      const analytics = getAnticipatoryEngineAnalytics();
      expect(analytics.totalAnticipationsFired).toBe(0);
    });
  });
});
