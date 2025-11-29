/**
 * Tests for Real-Time Conversation Dynamics
 * Covers: Interruption handling, turn-taking, topic changes, backchanneling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getInterruptionHandler, resetInterruptionHandler } from '../conversation/interruption-handler.js';
import { getTurnTakingMonitor, resetTurnTakingMonitor } from '../conversation/turn-taking.js';
import { getTopicChangeDetector, resetTopicChangeDetector } from '../conversation/topic-change-detector.js';
import { getBackchannelingSystem, resetBackchannelingSystem } from '../speech/backchanneling.js';
import { getConversationManager, resetConversationManager } from '../services/conversation-manager.js';

describe('Interruption Handler', () => {
  beforeEach(() => {
    resetInterruptionHandler();
  });

  it('should detect user interruption', () => {
    const handler = getInterruptionHandler();
    handler.setAgentSpeaking(true, 'This is Jack speaking...');

    const mockAudioFrame: any = {
      sampleRate: 16000,
      samplesPerChannel: 480,
    };

    const interruption = handler.detectInterruption(mockAudioFrame, true);
    expect(interruption).not.toBeNull();
    expect(interruption?.type).toBe('user_started_speaking');
  });

  it('should provide recovery phrases', () => {
    const handler = getInterruptionHandler();
    const recovery = handler.getRecoveryPhrase();
    expect(recovery).toBeTruthy();
    expect(typeof recovery).toBe('string');
  });

  it('should recommend shortening responses after interruptions', () => {
    const handler = getInterruptionHandler();

    // Simulate multiple interruptions
    handler.setAgentSpeaking(true, 'Test utterance 1');
    handler.detectInterruption({ sampleRate: 16000, samplesPerChannel: 480 } as any, true);

    handler.setAgentSpeaking(true, 'Test utterance 2');
    handler.detectInterruption({ sampleRate: 16000, samplesPerChannel: 480 } as any, true);

    handler.setAgentSpeaking(true, 'Test utterance 3');
    handler.detectInterruption({ sampleRate: 16000, samplesPerChannel: 480 } as any, true);

    expect(handler.shouldShortenNextResponse()).toBe(true);
  });
});

describe('Turn-Taking Monitor', () => {
  beforeEach(() => {
    resetTurnTakingMonitor();
  });

  it('should track speaking time', () => {
    const monitor = getTurnTakingMonitor();

    monitor.recordTurn('jack', 5000);
    monitor.recordTurn('user', 2000);

    const stats = monitor.getStats();
    expect(stats.jackSpeakingTime).toBe(5000);
    expect(stats.userSpeakingTime).toBe(2000);
  });

  it('should detect when Jack dominates conversation', () => {
    const monitor = getTurnTakingMonitor();

    // Jack speaks 80% of the time
    monitor.recordTurn('jack', 8000);
    monitor.recordTurn('user', 2000);

    expect(monitor.shouldInviteUserToSpeak()).toBe(true);
  });

  it('should detect consecutive turns', () => {
    const monitor = getTurnTakingMonitor();

    monitor.recordTurn('jack', 1000);
    monitor.recordTurn('jack', 1000);
    monitor.recordTurn('jack', 1000);

    const stats = monitor.getStats();
    expect(stats.consecutiveJackTurns).toBe(3);
    expect(monitor.shouldInviteUserToSpeak()).toBe(true);
  });

  it('should provide invitation phrases', () => {
    const monitor = getTurnTakingMonitor();
    const invitation = monitor.getInvitation();
    expect(invitation).toBeTruthy();
    expect(typeof invitation).toBe('string');
  });

  it('should calculate speaking ratios', () => {
    const monitor = getTurnTakingMonitor();

    monitor.recordTurn('jack', 5000);
    monitor.recordTurn('user', 5000);

    const ratio = monitor.getSpeakingRatio();
    expect(ratio).toBeCloseTo(0.5, 1);
  });
});

describe('Topic Change Detector', () => {
  beforeEach(() => {
    resetTopicChangeDetector();
  });

  it('should detect topic changes', () => {
    const detector = getTopicChangeDetector();

    // First topic
    const result1 = detector.analyzeForTopicChange('I want to invest in stocks');
    expect(result1.detected).toBe(false); // First topic, no change

    // Change to different topic
    const result2 = detector.analyzeForTopicChange("I'm worried about my debt");
    expect(result2.detected).toBe(true);
    expect(result2.previousTopic).toBe('investing');
    expect(result2.newTopic).toBe('debt');
  });

  it('should provide transition phrases', () => {
    const detector = getTopicChangeDetector();

    detector.analyzeForTopicChange('Tell me about retirement');
    const result = detector.analyzeForTopicChange("I'm feeling anxious");

    expect(result.transitionPhrase).toBeTruthy();
    expect(typeof result.transitionPhrase).toBe('string');
  });

  it('should track topic history', () => {
    const detector = getTopicChangeDetector();

    detector.analyzeForTopicChange('I want to save for retirement');
    detector.analyzeForTopicChange('What about index funds?');
    detector.analyzeForTopicChange("I'm worried about debt");

    const history = detector.getTopicHistory();
    expect(history.length).toBeGreaterThan(0);
  });

  it('should detect returning to previous topic', () => {
    const detector = getTopicChangeDetector();

    detector.analyzeForTopicChange('I want to retire early');
    detector.analyzeForTopicChange('What about my debt?');

    expect(detector.isReturningToTopic('retirement')).toBe(true);
  });
});

describe('Backchanneling System', () => {
  beforeEach(() => {
    resetBackchannelingSystem();
  });

  it('should suggest backchanneling for long user speech', () => {
    const system = getBackchannelingSystem();

    const result = system.shouldBackchannel({
      userHasBeenSpeaking: 9000, // 9 seconds
      userPausedBriefly: true,
      userEmotion: {
        primary: 'neutral',
        intensity: 0.5,
        distressLevel: 0.2,
        valence: 'neutral' as const,
        confidence: 0.8,
        markers: [],
        suggestedTone: 'friendly' as const,
      },
      topicWeight: 'medium',
    });

    expect(result.shouldBackchannel).toBe(true);
    expect(result.phrase).toBeTruthy();
  });

  it('should provide empathetic backchannels for distress', () => {
    const system = getBackchannelingSystem();

    const phrase = system.getBackchannel(
      {
        primary: 'sadness',
        intensity: 0.8,
        distressLevel: 0.7,
        valence: 'negative' as const,
        confidence: 0.8,
        markers: [],
        suggestedTone: 'gentle' as const,
      },
      'heavy'
    );

    expect(phrase).toBeTruthy();
    expect(typeof phrase).toBe('string');
  });

  it('should not backchannel too frequently', () => {
    const system = getBackchannelingSystem();

    // First backchannel
    const result1 = system.shouldBackchannel({
      userHasBeenSpeaking: 9000,
      userPausedBriefly: true,
      userEmotion: {
        primary: 'neutral',
        intensity: 0.5,
        distressLevel: 0.2,
        valence: 'neutral' as const,
        confidence: 0.8,
        markers: [],
        suggestedTone: 'friendly' as const,
      },
      topicWeight: 'medium',
    });

    if (result1.shouldBackchannel) {
      system.recordBackchannel();
    }

    // Immediate second attempt (should be rejected)
    const result2 = system.shouldBackchannel({
      userHasBeenSpeaking: 9000,
      userPausedBriefly: true,
      userEmotion: {
        primary: 'neutral',
        intensity: 0.5,
        distressLevel: 0.2,
        valence: 'neutral' as const,
        confidence: 0.8,
        markers: [],
        suggestedTone: 'friendly' as const,
      },
      topicWeight: 'medium',
      lastBackchannelTime: Date.now() - 1000, // 1 second ago
    });

    expect(result2.shouldBackchannel).toBe(false);
  });
});

describe('Conversation Manager Integration', () => {
  beforeEach(() => {
    resetConversationManager();
  });

  it('should coordinate all systems', () => {
    const manager = getConversationManager();
    
    // Reset stats for this test (manager is a singleton and may have state from previous tests)
    const initialStats = manager.getStats();
    const initialUserTime = initialStats.turnTaking.userSpeakingTime;
    const initialJackTime = initialStats.turnTaking.jackSpeakingTime;

    // Simulate user speaking
    manager.handleUserStartedSpeaking();
    manager.handleUserFinishedSpeaking(3000);

    // Simulate agent speaking
    manager.handleAgentStartedSpeaking('This is a test response');
    manager.handleAgentFinishedSpeaking(5000);

    const stats = manager.getStats();
    // Check that the time INCREASED by the expected amount (not absolute value)
    expect(stats.turnTaking.userSpeakingTime - initialUserTime).toBe(3000);
    expect(stats.turnTaking.jackSpeakingTime - initialJackTime).toBe(5000);
  });

  it('should provide conversation enhancements', () => {
    const manager = getConversationManager();

    // Record some turns to create context
    manager.handleAgentStartedSpeaking('Response 1');
    manager.handleAgentFinishedSpeaking(8000);

    manager.handleAgentStartedSpeaking('Response 2');
    manager.handleAgentFinishedSpeaking(8000);

    const enhancements = manager.getConversationEnhancements(
      'Tell me about investing',
      {
        primary: 'neutral',
        intensity: 0.5,
        distressLevel: 0.2,
        valence: 'neutral' as const,
        confidence: 0.8,
        markers: [],
        suggestedTone: 'friendly' as const,
      },
      'medium'
    );

    expect(enhancements).toBeDefined();
    expect(enhancements.lengthGuidance).toBeDefined();
    expect(enhancements.metaGuidance).toBeInstanceOf(Array);
  });

  it('should build conversation guidance string', () => {
    const manager = getConversationManager();

    const enhancements = manager.getConversationEnhancements(
      'What about retirement?',
      {
        primary: 'neutral',
        intensity: 0.5,
        distressLevel: 0.2,
        valence: 'neutral' as const,
        confidence: 0.8,
        markers: [],
        suggestedTone: 'friendly' as const,
      },
      'medium'
    );

    const guidance = manager.buildConversationGuidance(enhancements);
    expect(guidance).toBeTruthy();
    expect(typeof guidance).toBe('string');
    expect(guidance).toContain('[CONVERSATION DYNAMICS]');
  });
});
