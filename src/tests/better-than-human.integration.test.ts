/**
 * Better Than Human Integration Tests
 *
 * Tests the complete "Better Than Human" pipeline:
 * 1. Live superhuman injections (per-turn)
 * 2. Voice-text mismatch detection (hybrid scoring)
 * 3. Speech state events (active listening)
 * 4. Trust moment write-through
 * 5. Anticipation signals
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// LIVE SUPERHUMAN INJECTIONS
// ============================================================================

describe('Live Superhuman Injections', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('detects commitment language', async () => {
    const { detectCommitmentLanguage } =
      await import('../agents/processors/live-superhuman-injections.js');

    // Test various commitment phrases
    const tests = [
      { text: "I'm going to start exercising tomorrow", expected: 'intention' },
      { text: 'I promise to call my mom this weekend', expected: 'promise' },
      { text: "I've decided to quit my job", expected: 'decision' },
      { text: 'My goal is to lose 10 pounds', expected: 'goal' },
      { text: 'The weather is nice today', expected: null },
    ];

    for (const { text, expected } of tests) {
      const result = detectCommitmentLanguage(text);
      if (expected) {
        expect(result.detected).toBe(true);
        expect(result.type).toBe(expected);
      } else {
        expect(result.detected).toBe(false);
      }
    }
  });

  it('detects values language and conflicts', async () => {
    const { detectValuesLanguage } =
      await import('../agents/processors/live-superhuman-injections.js');

    // Test values detection
    const valuesResult = detectValuesLanguage("It's important to me that I spend time with family");
    expect(valuesResult.detected).toBe(true);
    expect(valuesResult.value).toBeTruthy();

    // Test conflict detection
    const conflictResult = detectValuesLanguage(
      "I value honesty but I also don't want to hurt them"
    );
    expect(conflictResult.potential_conflict).toBe(true);

    // Test no values
    const neutralResult = detectValuesLanguage('I went to the store today');
    expect(neutralResult.detected).toBe(false);
  });

  it('detects capacity signals with correct severity', async () => {
    const { detectCapacitySignals } =
      await import('../agents/processors/live-superhuman-injections.js');

    // Critical
    const critical = detectCapacitySignals("I can't do this anymore, I'm at my breaking point");
    expect(critical.level).toBe('critical');

    // High
    const high = detectCapacitySignals("I'm completely burnt out");
    expect(high.level).toBe('high');

    // Moderate
    const moderate = detectCapacitySignals("I'm feeling pretty tired lately");
    expect(moderate.level).toBe('moderate');

    // None
    const none = detectCapacitySignals('I had a productive day');
    expect(none.level).toBe('none');
  });

  it('builds full superhuman injections for context', async () => {
    const { buildLiveSuperhumanInjections } =
      await import('../agents/processors/live-superhuman-injections.js');

    const result = await buildLiveSuperhumanInjections({
      userId: 'test-user',
      sessionId: 'test-session',
      userText: "I'm going to start going to the gym, it's important to me to get healthy",
      emotionalState: {
        primary: 'determined',
        secondary: undefined,
        intensity: 0.7,
        valence: 0.6,
        distressLevel: 0.1,
      },
      analysis: {
        intent: 'statement',
        emotion: 'positive',
        confidence: 0.8,
        topics: ['health'],
      },
      turnCount: 5,
    });

    // Should have detected commitment and values
    expect(result.signals.commitmentDetected).toBe(true);
    expect(result.injections.length).toBeGreaterThan(0);
    expect(result.processingTimeMs).toBeLessThan(100); // Fast enough for real-time
  });
});

// ============================================================================
// VOICE-TEXT MISMATCH DETECTION
// ============================================================================

describe('Voice-Text Mismatch Detection', () => {
  it('detects masking "I\'m fine" with negative voice', async () => {
    const { detectMismatch } = await import('../intelligence/voice-text-mismatch.js');

    const result = detectMismatch(
      "I'm fine, everything's okay",
      {
        primary: 'sad',
        confidence: 0.7,
        stressLevel: 0.5,
        anxietyMarkers: false,
        arousal: 0.3,
        valence: -0.5,
      },
      { primary: 'neutral', confidence: 0.8 }
    );

    expect(result.hasMismatch).toBe(true);
    expect(result.type).toBe('masking_negative');
    expect(result.shouldSurface).toBe(true);
  });

  it('uses hybrid confidence scoring for low voice confidence', async () => {
    const { detectMismatch } = await import('../intelligence/voice-text-mismatch.js');

    // Low voice confidence but strong text signals
    const result = detectMismatch(
      "I'm struggling so much, it's really hard and I can't handle it",
      {
        primary: 'anxious',
        confidence: 0.3, // Low voice confidence
        stressLevel: 0.4,
        anxietyMarkers: true,
        arousal: 0.6,
        valence: -0.4,
      },
      { primary: 'negative', confidence: 0.9 }
    );

    // Should still detect because text signals boost confidence
    expect(result.hasMismatch).toBe(true);
  });

  it('does not false positive on neutral conversation', async () => {
    const { detectMismatch } = await import('../intelligence/voice-text-mismatch.js');

    const result = detectMismatch(
      'I went to the grocery store today',
      {
        primary: 'neutral',
        confidence: 0.8,
        stressLevel: 0.1,
        anxietyMarkers: false,
        arousal: 0.3,
        valence: 0.1,
      },
      { primary: 'neutral', confidence: 0.9 }
    );

    expect(result.hasMismatch).toBe(false);
  });
});

// ============================================================================
// SPEECH STATE DISPATCHER
// ============================================================================

describe('Speech State Dispatcher', () => {
  it('dispatches speech pause events with correct nod types', async () => {
    const { dispatchSpeechPause, dispatchSpeechStart, clearSpeechStateTracker } =
      await import('../agents/realtime/speech-state-dispatcher.js');

    const sendDataMessage = vi.fn().mockResolvedValue(undefined);
    const sessionId = 'test-session';

    // Clear any existing state
    clearSpeechStateTracker(sessionId);

    // Start speaking first
    await dispatchSpeechStart(sessionId, sendDataMessage);
    expect(sendDataMessage).toHaveBeenCalledWith(
      'speech_state',
      expect.objectContaining({
        type: 'speech_start',
      })
    );

    // Send a pause
    await dispatchSpeechPause(sessionId, sendDataMessage, 300);
    expect(sendDataMessage).toHaveBeenCalledWith(
      'speech_state',
      expect.objectContaining({
        type: 'speech_pause',
        pauseType: 'breath',
        nodType: 'micro',
      })
    );

    // Longer pause = different nod type
    await dispatchSpeechPause(sessionId, sendDataMessage, 600);
    expect(sendDataMessage).toHaveBeenCalledWith(
      'speech_state',
      expect.objectContaining({
        pauseType: 'thinking',
        nodType: 'subtle',
      })
    );
  });

  it('estimates breath rate from pause patterns', async () => {
    const { dispatchSpeechPause, dispatchSpeechStart, dispatchSpeechEnd, clearSpeechStateTracker } =
      await import('../agents/realtime/speech-state-dispatcher.js');

    const sendDataMessage = vi.fn().mockResolvedValue(undefined);
    const sessionId = 'breath-test';

    clearSpeechStateTracker(sessionId);
    await dispatchSpeechStart(sessionId, sendDataMessage);

    // Simulate natural speech pauses
    for (let i = 0; i < 5; i++) {
      await dispatchSpeechPause(sessionId, sendDataMessage, 300 + Math.random() * 100);
    }

    await dispatchSpeechEnd(sessionId, sendDataMessage);

    // The final call should include breath rate
    const speechEndCall = sendDataMessage.mock.calls.find(
      (call) => call[0] === 'speech_state' && call[1].type === 'speech_end'
    );
    expect(speechEndCall).toBeTruthy();
    expect(speechEndCall![1].breathRate).toBeDefined();
  });
});

// ============================================================================
// TRUST MOMENT WRITE-THROUGH
// ============================================================================

describe('Trust Moment Write-Through', () => {
  it('exports recordTrustMoment function', async () => {
    const { recordTrustMoment } = await import('../services/trust-systems/unified-recorder.js');
    expect(typeof recordTrustMoment).toBe('function');
  });

  it('recordConversationTurn detects and records small wins', async () => {
    // Mock the internal functions that get called
    vi.mock('../services/trust-systems/small-wins.js', () => ({
      detectSmallWin: vi.fn(() => ({
        type: 'progress',
        description: 'Made progress on goal',
      })),
      detectIntention: vi.fn(() => null),
      recordCelebrationResponse: vi.fn(),
    }));

    const { recordConversationTurn } =
      await import('../services/trust-systems/unified-recorder.js');

    await expect(
      recordConversationTurn({
        userId: 'test-user',
        text: 'I finally finished my project!',
        analysis: {
          emotion: { primary: 'happy', intensity: 0.8 },
          topic: 'work',
          sentiment: 'positive',
        },
      })
    ).resolves.not.toThrow();
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe('BTH Pipeline Performance', () => {
  it('live superhuman injections complete under 80ms', async () => {
    const { buildLiveSuperhumanInjections } =
      await import('../agents/processors/live-superhuman-injections.js');

    const start = Date.now();
    await buildLiveSuperhumanInjections({
      userId: 'perf-test',
      sessionId: 'perf-session',
      userText: "I'm going to start a new project, it's really important to me",
      emotionalState: {
        primary: 'excited',
        intensity: 0.7,
        valence: 0.8,
        distressLevel: 0,
      },
      analysis: {
        intent: 'statement',
        emotion: 'positive',
        confidence: 0.9,
        topics: ['project'],
      },
      turnCount: 10,
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(80);
  });

  it('mismatch detection completes under 5ms', async () => {
    const { detectMismatch } = await import('../intelligence/voice-text-mismatch.js');

    const start = Date.now();
    detectMismatch(
      "I'm fine, really",
      {
        primary: 'sad',
        confidence: 0.8,
        stressLevel: 0.6,
        anxietyMarkers: true,
        arousal: 0.5,
        valence: -0.5,
      },
      { primary: 'neutral', confidence: 0.7 }
    );
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5);
  });
});

// ============================================================================
// END-TO-END FLOW TEST
// ============================================================================

describe('BTH End-to-End Flow', () => {
  it('full BTH pipeline processes user turn correctly', async () => {
    // This test verifies the conceptual flow works
    // In production, this happens in turn-processor.ts

    const { buildLiveSuperhumanInjections } =
      await import('../agents/processors/live-superhuman-injections.js');
    const { detectMismatch } = await import('../intelligence/voice-text-mismatch.js');

    // Simulate user saying "I'm fine" with distressed voice
    const userText = "I'm fine, just a bit tired";
    const voiceEmotion = {
      primary: 'sad',
      confidence: 0.65,
      stressLevel: 0.55,
      anxietyMarkers: false,
      arousal: 0.3,
      valence: -0.4,
    };

    // 1. Detect mismatch
    const mismatch = detectMismatch(userText, voiceEmotion);
    expect(mismatch.hasMismatch).toBe(true);
    expect(mismatch.type).toBe('masking_negative');

    // 2. Build live superhuman injections
    const superhuman = await buildLiveSuperhumanInjections({
      userId: 'e2e-test',
      sessionId: 'e2e-session',
      userText,
      voiceEmotion: {
        primary: voiceEmotion.primary,
        confidence: voiceEmotion.confidence,
        stressLevel: voiceEmotion.stressLevel,
      },
      emotionalState: {
        primary: 'sad',
        intensity: 0.6,
        valence: -0.4,
        distressLevel: 0.5,
      },
      analysis: {
        intent: 'statement',
        emotion: 'negative',
        confidence: 0.7,
        topics: ['feelings'],
      },
      turnCount: 3,
    });

    // 3. Verify superhuman detected the distress signals
    expect(superhuman.signals.voiceDistressDetected).toBe(true);

    // 4. Verify injections include guidance for Ferni
    const hasVoiceInjection = superhuman.injections.some((i) => i.category === 'superhuman_voice');
    expect(hasVoiceInjection).toBe(true);
  });
});
