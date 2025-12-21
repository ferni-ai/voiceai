/**
 * Emotional Context Builder Tests
 *
 * Tests for emotional awareness and support:
 * - High distress detection and crisis support
 * - Moderate distress detection
 * - Validation needs detection
 * - Emotional mirroring (match user's energy)
 * - Voice + text emotion merging
 * - Voice prosody response
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted to define mocks available when vi.mock is hoisted
const {
  mockRegisterContextBuilder,
  mockCreateCriticalInjection,
  mockCreateStandardInjection,
  mockCreateHintInjection,
  mockLogger,
} = vi.hoisted(() => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  return {
    mockRegisterContextBuilder: vi.fn(),
    mockCreateCriticalInjection: vi.fn((source: string, content: string) => ({
      source,
      content,
      priority: 'critical',
    })),
    mockCreateStandardInjection: vi.fn((source: string, content: string) => ({
      source,
      content,
      priority: 'standard',
    })),
    mockCreateHintInjection: vi.fn((source: string, content: string) => ({
      source,
      content,
      priority: 'hint',
    })),
    mockLogger: logger,
  };
});

// Mock dependencies
vi.mock('../intelligence/context-builders/index.js', () => ({
  registerContextBuilder: mockRegisterContextBuilder,
  createCriticalInjection: mockCreateCriticalInjection,
  createStandardInjection: mockCreateStandardInjection,
  createHintInjection: mockCreateHintInjection,
}));

vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => mockLogger),
  createLogger: vi.fn(() => mockLogger),
}));

import { buildEmotionalContext } from '../intelligence/context-builders/emotional/emotional.js';
import type { ContextBuilderInput } from '../intelligence/context-builders/index.js';

// ============================================================================
// HELPERS
// ============================================================================

function createInput(overrides: Partial<ContextBuilderInput> = {}): ContextBuilderInput {
  return {
    userText: '',
    analysis: {
      emotion: {
        primary: 'neutral',
        intensity: 0.5,
        valence: 'neutral',
        distressLevel: 0,
      },
      intent: {
        primary: 'share',
        confidence: 0.8,
      },
      topics: {
        detected: [],
      },
      state: {
        phase: 'active',
      },
    },
    services: {
      sessionId: 'test-session',
      sessionStartTime: Date.now(),
      userProfile: null,
    },
    userData: {},
    userProfile: null,
    persona: {
      id: 'ferni',
      displayName: 'Ferni',
    },
    ...overrides,
  } as ContextBuilderInput;
}

// ============================================================================
// TESTS
// ============================================================================

describe('buildEmotionalContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registration', () => {
    it('should export buildEmotionalContext function', () => {
      expect(typeof buildEmotionalContext).toBe('function');
    });
  });

  describe('high distress detection', () => {
    it('should create critical injection for high distress (>0.7)', async () => {
      const input = createInput({
        userText: 'I feel so overwhelmed, I can not take this anymore',
        analysis: {
          emotion: {
            primary: 'despair',
            intensity: 0.9,
            valence: 'negative',
            distressLevel: 0.85,
          },
          intent: { primary: 'venting', confidence: 0.9 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      const crisisInjection = result.find((i) => i.source === 'emotional_crisis');
      expect(crisisInjection).toBeDefined();
      expect(crisisInjection?.priority).toBe('critical');
      expect(crisisInjection?.content).toContain('EMOTIONAL CRISIS');
      expect(crisisInjection?.content).toContain('85%');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should include guidance for crisis response', async () => {
      const input = createInput({
        userText: 'Everything is falling apart',
        analysis: {
          emotion: {
            primary: 'fear',
            intensity: 0.95,
            valence: 'negative',
            distressLevel: 0.8,
          },
          intent: { primary: 'share', confidence: 0.8 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      const crisisInjection = result.find((i) => i.source === 'emotional_crisis');
      expect(crisisInjection?.content).toContain('PRESENT');
      expect(crisisInjection?.content).toContain('DO NOT');
      expect(crisisInjection?.content).toContain('Soft, slow');
    });
  });

  describe('moderate distress detection', () => {
    it('should create standard injection for moderate distress (0.5-0.7)', async () => {
      const input = createInput({
        userText: 'I have been stressed about work lately',
        analysis: {
          emotion: {
            primary: 'anxious',
            intensity: 0.6,
            valence: 'negative',
            distressLevel: 0.55,
          },
          intent: { primary: 'share', confidence: 0.8 },
          topics: { detected: ['work'] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      const alertInjection = result.find((i) => i.source === 'emotional_alert');
      expect(alertInjection).toBeDefined();
      expect(alertInjection?.content).toContain('EMOTIONAL ALERT');
      expect(alertInjection?.content).toContain('anxious');
      expect(alertInjection?.content).toContain('55%');
    });

    it('should recommend empathy-first approach for moderate distress', async () => {
      const input = createInput({
        userText: 'I do not know what to do anymore',
        analysis: {
          emotion: {
            primary: 'confused',
            intensity: 0.65,
            valence: 'negative',
            distressLevel: 0.6,
          },
          intent: { primary: 'help', confidence: 0.85 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      const alertInjection = result.find((i) => i.source === 'emotional_alert');
      expect(alertInjection?.content).toContain('Empathy FIRST');
    });
  });

  describe('negative emotion context', () => {
    it('should create context injection for negative emotion with low distress', async () => {
      const input = createInput({
        userText: 'I am a bit frustrated with this',
        analysis: {
          emotion: {
            primary: 'frustrated',
            intensity: 0.4,
            valence: 'negative',
            distressLevel: 0.3,
          },
          intent: { primary: 'share', confidence: 0.7 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      const contextInjection = result.find((i) => i.source === 'emotional_context');
      expect(contextInjection).toBeDefined();
      expect(contextInjection?.content).toContain('frustrated');
      expect(contextInjection?.content).toContain('Acknowledge');
    });
  });

  describe('positive emotion context', () => {
    it('should create hint injection for positive emotion', async () => {
      const input = createInput({
        userText: 'I am so excited about this opportunity!',
        analysis: {
          emotion: {
            primary: 'excited',
            intensity: 0.8,
            valence: 'positive',
            distressLevel: 0,
          },
          intent: { primary: 'share', confidence: 0.9 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      const positiveInjection = result.find((i) => i.source === 'emotional_positive');
      expect(positiveInjection).toBeDefined();
      expect(positiveInjection?.content).toContain('excited');
      expect(positiveInjection?.content).toContain('Match their energy');
    });
  });

  describe('validation needs detection', () => {
    it('should detect "am i crazy" validation pattern', async () => {
      const input = createInput({
        userText: 'Am I crazy for wanting to quit my job?',
        analysis: {
          emotion: {
            primary: 'uncertain',
            intensity: 0.5,
            valence: 'neutral',
            distressLevel: 0.3,
          },
          intent: { primary: 'question', confidence: 0.8 },
          topics: { detected: ['career'] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      const validationInjection = result.find((i) => i.source === 'validation_needed');
      expect(validationInjection).toBeDefined();
      expect(validationInjection?.content).toContain('VALIDATION NEEDED');
      expect(validationInjection?.content).toContain('makes complete sense');
    });

    it('should detect "is it wrong" validation pattern', async () => {
      const input = createInput({
        userText: 'Is it wrong to feel jealous of my friends success?',
        analysis: {
          emotion: {
            primary: 'guilty',
            intensity: 0.6,
            valence: 'negative',
            distressLevel: 0.4,
          },
          intent: { primary: 'question', confidence: 0.8 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      const validationInjection = result.find((i) => i.source === 'validation_needed');
      expect(validationInjection).toBeDefined();
    });

    it('should detect "normal to" validation pattern', async () => {
      const input = createInput({
        userText: 'Is it normal to feel anxious before big decisions?',
        analysis: {
          emotion: {
            primary: 'anxious',
            intensity: 0.5,
            valence: 'negative',
            distressLevel: 0.35,
          },
          intent: { primary: 'question', confidence: 0.85 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      const validationInjection = result.find((i) => i.source === 'validation_needed');
      expect(validationInjection).toBeDefined();
    });

    it('should detect "stupid for" validation pattern', async () => {
      const input = createInput({
        userText: 'Am I stupid for trusting them?',
        analysis: {
          emotion: {
            primary: 'regret',
            intensity: 0.6,
            valence: 'negative',
            distressLevel: 0.4,
          },
          intent: { primary: 'question', confidence: 0.8 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      const validationInjection = result.find((i) => i.source === 'validation_needed');
      expect(validationInjection).toBeDefined();
    });

    it('should trigger validation for fear emotion with moderate distress', async () => {
      const input = createInput({
        userText: 'I am scared about making this change',
        analysis: {
          emotion: {
            primary: 'fear',
            intensity: 0.6,
            valence: 'negative',
            distressLevel: 0.45,
          },
          intent: { primary: 'confiding', confidence: 0.8 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      const validationInjection = result.find((i) => i.source === 'validation_needed');
      expect(validationInjection).toBeDefined();
    });

    it('should trigger validation for confiding intent with negative valence', async () => {
      const input = createInput({
        userText: 'I have been feeling really down lately',
        analysis: {
          emotion: {
            primary: 'sad',
            intensity: 0.5,
            valence: 'negative',
            distressLevel: 0.4,
          },
          intent: { primary: 'confiding', confidence: 0.85 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      const validationInjection = result.find((i) => i.source === 'validation_needed');
      expect(validationInjection).toBeDefined();
    });

    it('should include validation phrases', async () => {
      const input = createInput({
        userText: 'Am I crazy to think this way?',
        analysis: {
          emotion: {
            primary: 'anxious',
            intensity: 0.5,
            valence: 'negative',
            distressLevel: 0.3,
          },
          intent: { primary: 'question', confidence: 0.8 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      const validationInjection = result.find((i) => i.source === 'validation_needed');
      expect(validationInjection?.content).toContain('Anyone would feel that way');
      expect(validationInjection?.content).toContain('DO NOT say "but..."');
    });
  });

  describe('emotional mirroring', () => {
    it('should suggest matching high energy (>0.7)', async () => {
      const input = createInput({
        userText: 'This is amazing! I am so pumped!',
        analysis: {
          emotion: {
            primary: 'excited',
            intensity: 0.85,
            valence: 'positive',
            distressLevel: 0,
          },
          intent: { primary: 'share', confidence: 0.9 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      const mirroringInjection = result.find((i) => i.source === 'emotional_mirroring');
      expect(mirroringInjection).toBeDefined();
      expect(mirroringInjection?.content).toContain('HIGH energy');
      expect(mirroringInjection?.content).toContain('85%');
      expect(mirroringInjection?.content).toContain('enthusiasm');
    });

    it('should suggest being gentle for low energy (<0.3)', async () => {
      const input = createInput({
        userText: 'yeah... I guess so',
        analysis: {
          emotion: {
            primary: 'tired',
            intensity: 0.2,
            valence: 'neutral',
            distressLevel: 0.1,
          },
          intent: { primary: 'agree', confidence: 0.6 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      const mirroringInjection = result.find((i) => i.source === 'emotional_mirroring');
      expect(mirroringInjection).toBeDefined();
      expect(mirroringInjection?.content).toContain('LOW energy');
      expect(mirroringInjection?.content).toContain('gentle');
      expect(mirroringInjection?.content).toContain('Give space');
    });

    it('should suggest celebration for positive + high energy', async () => {
      const input = createInput({
        userText: 'I got the promotion! I can not believe it!',
        analysis: {
          emotion: {
            primary: 'happy',
            intensity: 0.9,
            valence: 'positive',
            distressLevel: 0,
          },
          intent: { primary: 'share', confidence: 0.95 },
          topics: { detected: ['career'] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      const celebrationInjection = result.find((i) => i.source === 'emotional_celebration');
      expect(celebrationInjection).toBeDefined();
      expect(celebrationInjection?.content).toContain('HAPPY/EXCITED');
      expect(celebrationInjection?.content).toContain('Celebrate');
    });

    it('should not suggest mirroring for medium energy (0.3-0.7)', async () => {
      const input = createInput({
        userText: 'That sounds reasonable',
        analysis: {
          emotion: {
            primary: 'neutral',
            intensity: 0.5,
            valence: 'neutral',
            distressLevel: 0,
          },
          intent: { primary: 'agree', confidence: 0.7 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      const mirroringInjection = result.find((i) => i.source === 'emotional_mirroring');
      expect(mirroringInjection).toBeUndefined();
    });
  });

  describe('voice emotion merging', () => {
    it('should merge voice and text emotions with 60/40 weighting', async () => {
      const input = createInput({
        userText: 'I am fine',
        analysis: {
          emotion: {
            primary: 'neutral',
            intensity: 0.3,
            valence: 'neutral',
            distressLevel: 0.35, // Moderate text distress
          },
          intent: { primary: 'share', confidence: 0.7 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
        userData: {
          voiceEmotion: {
            primary: 'stressed',
            confidence: 0.8,
            stressLevel: 0.9, // High voice stress
            arousal: 0.7,
            valence: 0.3,
          },
        },
      });

      const result = await buildEmotionalContext(input);

      // Merged: 0.35 * 0.6 + 0.9 * 0.4 = 0.21 + 0.36 = 0.57
      // Should trigger moderate distress alert (>0.5)
      const alertInjection = result.find((i) => i.source === 'emotional_alert');
      expect(alertInjection).toBeDefined();
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should boost distress for anxiety markers', async () => {
      const input = createInput({
        userText: 'I am doing okay',
        analysis: {
          emotion: {
            primary: 'calm',
            intensity: 0.4,
            valence: 'neutral',
            distressLevel: 0.4,
          },
          intent: { primary: 'share', confidence: 0.7 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
        userData: {
          voiceEmotion: {
            primary: 'anxious',
            confidence: 0.85,
            stressLevel: 0.6,
            arousal: 0.75,
            valence: 0.35,
            anxietyMarkers: true, // Voice trembling, pitch variation
          },
        },
      });

      const result = await buildEmotionalContext(input);

      // Base merged: 0.4 * 0.6 + 0.6 * 0.4 = 0.24 + 0.24 = 0.48
      // With anxiety boost: 0.48 + 0.15 = 0.63
      const alertInjection = result.find((i) => i.source === 'emotional_alert');
      expect(alertInjection).toBeDefined();
    });
  });

  describe('voice prosody guidance', () => {
    it('should create prosody guidance for high voice stress', async () => {
      const input = createInput({
        userText: 'I need help with something',
        analysis: {
          emotion: {
            primary: 'neutral',
            intensity: 0.5,
            valence: 'neutral',
            distressLevel: 0.3,
          },
          intent: { primary: 'help', confidence: 0.8 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
        userData: {
          voiceEmotion: {
            primary: 'stressed',
            confidence: 0.8,
            stressLevel: 0.7,
            arousal: 0.6,
            valence: 0.4,
          },
        },
      });

      const result = await buildEmotionalContext(input);

      const prosodyInjection = result.find((i) => i.source === 'voice_prosody');
      expect(prosodyInjection).toBeDefined();
      expect(prosodyInjection?.content).toContain('VOICE ANALYSIS');
      expect(prosodyInjection?.content).toContain('stress');
    });

    it('should detect anxiety markers in voice', async () => {
      const input = createInput({
        userText: 'Well, um, I was thinking about...',
        analysis: {
          emotion: {
            primary: 'uncertain',
            intensity: 0.4,
            valence: 'neutral',
            distressLevel: 0.2,
          },
          intent: { primary: 'share', confidence: 0.6 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
        userData: {
          voiceEmotion: {
            primary: 'anxious',
            confidence: 0.85,
            stressLevel: 0.65,
            arousal: 0.7,
            valence: 0.3,
            anxietyMarkers: true,
          },
        },
      });

      const result = await buildEmotionalContext(input);

      const prosodyInjection = result.find((i) => i.source === 'voice_prosody');
      expect(prosodyInjection?.content).toContain('anxiety markers');
      expect(prosodyInjection?.content).toContain('calm presence');
    });

    it('should detect agitated and negative voice', async () => {
      const input = createInput({
        userText: 'This is so frustrating!',
        analysis: {
          emotion: {
            primary: 'angry',
            intensity: 0.7,
            valence: 'negative',
            distressLevel: 0.4,
          },
          intent: { primary: 'venting', confidence: 0.85 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
        userData: {
          voiceEmotion: {
            primary: 'frustrated',
            confidence: 0.9,
            stressLevel: 0.75,
            arousal: 0.8,
            valence: 0.2,
          },
        },
      });

      const result = await buildEmotionalContext(input);

      const prosodyInjection = result.find((i) => i.source === 'voice_prosody');
      expect(prosodyInjection?.content).toContain('agitated');
      expect(prosodyInjection?.content).toContain('upset');
    });

    it('should detect sad voice even when text does not say it', async () => {
      const input = createInput({
        userText: 'Yeah, everything is fine',
        analysis: {
          emotion: {
            primary: 'neutral',
            intensity: 0.3,
            valence: 'neutral',
            distressLevel: 0.2,
          },
          intent: { primary: 'share', confidence: 0.6 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
        userData: {
          voiceEmotion: {
            primary: 'sad',
            confidence: 0.8,
            stressLevel: 0.4,
            arousal: 0.3,
            valence: 0.2,
          },
        },
      });

      const result = await buildEmotionalContext(input);

      const prosodyInjection = result.find((i) => i.source === 'voice_prosody');
      expect(prosodyInjection).toBeDefined();
      expect(prosodyInjection?.content).toContain('sad');
      expect(prosodyInjection?.content).toContain('emotional undertones');
    });

    it('should detect positive/happy voice', async () => {
      const input = createInput({
        userText: 'Thank you so much!',
        analysis: {
          emotion: {
            primary: 'grateful',
            intensity: 0.7,
            valence: 'positive',
            distressLevel: 0,
          },
          intent: { primary: 'thank', confidence: 0.9 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
        userData: {
          voiceEmotion: {
            primary: 'happy',
            confidence: 0.85,
            stressLevel: 0.1,
            arousal: 0.6,
            valence: 0.8,
          },
        },
      });

      const result = await buildEmotionalContext(input);

      const prosodyInjection = result.find((i) => i.source === 'voice_prosody');
      expect(prosodyInjection).toBeDefined();
      expect(prosodyInjection?.content).toContain('happy');
      expect(prosodyInjection?.content).toContain('positive energy');
    });

    it('should not create prosody guidance for low stress voice', async () => {
      const input = createInput({
        userText: 'Can you tell me about investing?',
        analysis: {
          emotion: {
            primary: 'curious',
            intensity: 0.5,
            valence: 'neutral',
            distressLevel: 0.1,
          },
          intent: { primary: 'question', confidence: 0.9 },
          topics: { detected: ['investing'] },
          state: { phase: 'active' },
        },
        userData: {
          voiceEmotion: {
            primary: 'neutral',
            confidence: 0.7,
            stressLevel: 0.2,
            arousal: 0.4,
            valence: 0.5,
          },
        },
      });

      const result = await buildEmotionalContext(input);

      const prosodyInjection = result.find((i) => i.source === 'voice_prosody');
      expect(prosodyInjection).toBeUndefined();
    });
  });

  describe('multiple injections', () => {
    it('should return multiple injections when appropriate', async () => {
      const input = createInput({
        userText: 'Am I crazy for feeling so happy about this?',
        analysis: {
          emotion: {
            primary: 'happy',
            intensity: 0.8,
            valence: 'positive',
            distressLevel: 0,
          },
          intent: { primary: 'share', confidence: 0.9 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      // Should have: positive emotion, high energy mirroring, celebration, validation (due to "am i crazy")
      expect(result.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('edge cases', () => {
    it('should return empty array for neutral conversation', async () => {
      const input = createInput({
        userText: 'What is the weather like today?',
        analysis: {
          emotion: {
            primary: 'neutral',
            intensity: 0.4,
            valence: 'neutral',
            distressLevel: 0,
          },
          intent: { primary: 'question', confidence: 0.9 },
          topics: { detected: ['weather'] },
          state: { phase: 'active' },
        },
      });

      const result = await buildEmotionalContext(input);

      // No emotional injections for neutral query
      const emotionalInjections = result.filter(
        (i) =>
          i.source.startsWith('emotional') ||
          i.source === 'validation_needed' ||
          i.source === 'voice_prosody'
      );
      expect(emotionalInjections).toHaveLength(0);
    });

    it('should handle missing emotion fields gracefully', async () => {
      const input = createInput({
        userText: 'Hello',
        analysis: {
          emotion: {
            primary: 'neutral',
          } as ContextBuilderInput['analysis']['emotion'],
          intent: { primary: 'greet', confidence: 0.9 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      await expect(buildEmotionalContext(input)).resolves.not.toThrow();
    });

    it('should handle undefined voice emotion', async () => {
      const input = createInput({
        userText: 'Test message',
        analysis: {
          emotion: {
            primary: 'neutral',
            intensity: 0.5,
            valence: 'neutral',
            distressLevel: 0.3,
          },
          intent: { primary: 'share', confidence: 0.8 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
        userData: {
          voiceEmotion: undefined,
        },
      });

      await expect(buildEmotionalContext(input)).resolves.not.toThrow();

      const result = await buildEmotionalContext(input);
      const prosodyInjection = result.find((i) => i.source === 'voice_prosody');
      expect(prosodyInjection).toBeUndefined();
    });
  });
});
