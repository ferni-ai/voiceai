/**
 * Tests for First Meeting Magic Context Builder
 *
 * Verifies the "better than human" first meeting behaviors:
 * - Energy detection from voice and text
 * - First meeting detection logic
 * - Appropriate injection generation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// We need to mock the logger before importing the module
vi.mock('../../utils/safe-logger.js', () => {
  const createMockLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => createMockLogger()),
  });
  const mockLogger = createMockLogger();
  return {
    createLogger: () => mockLogger,
    getLogger: () => mockLogger,
  };
});

// Import after mocks are set up
import {
  firstMeetingMagicBuilder,
  checkIsFirstMeeting,
  detectUserEnergy as getDetectedEnergy,
} from '../../intelligence/context-builders/relationship/arc/first-meeting-magic.js';
import type { ContextBuilderInput } from '../../intelligence/context-builders/index.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createMockInput(overrides: Partial<ContextBuilderInput> = {}): ContextBuilderInput {
  return {
    userText: overrides.userText ?? 'Hello, I just wanted to talk',
    analysis: {
      emotion: {
        primary: 'neutral',
        intensity: 0.5,
        valence: 'neutral',
        needsSupport: false,
      },
      intent: {
        primary: 'general_conversation',
        requiresAction: false,
      },
      topics: {
        detected: [],
        emerging: [],
      },
      state: {
        phase: 'greeting',
        energy: 'medium',
      },
      ...overrides.analysis,
    },
    userData: {
      turnCount: 0,
      relationshipStage: 'stranger',
      isReturningUser: false,
      ...overrides.userData,
    },
    persona: {
      identity: {
        id: 'ferni',
        name: 'Ferni',
      },
      ...overrides.persona,
    },
    services: {
      sessionId: 'test-session',
      ...overrides.services,
    },
    voiceEmotion: overrides.voiceEmotion,
    ...overrides,
  } as ContextBuilderInput;
}

// ============================================================================
// FIRST MEETING DETECTION TESTS
// ============================================================================

describe('First Meeting Detection', () => {
  it('should detect first meeting on turn 0', () => {
    const input = createMockInput({ userData: { turnCount: 0 } });
    expect(checkIsFirstMeeting(input)).toBe(true);
  });

  it('should detect first meeting on turn 1', () => {
    const input = createMockInput({ userData: { turnCount: 1 } });
    expect(checkIsFirstMeeting(input)).toBe(true);
  });

  it('should detect first meeting on turn 2', () => {
    const input = createMockInput({ userData: { turnCount: 2 } });
    expect(checkIsFirstMeeting(input)).toBe(true);
  });

  it('should detect first meeting on turn 3', () => {
    const input = createMockInput({ userData: { turnCount: 3 } });
    expect(checkIsFirstMeeting(input)).toBe(true);
  });

  it('should NOT detect first meeting on turn 4+', () => {
    const input = createMockInput({ userData: { turnCount: 4 } });
    expect(checkIsFirstMeeting(input)).toBe(false);
  });

  it('should NOT detect first meeting for returning users after turn 1', () => {
    const input = createMockInput({
      userData: { turnCount: 2, isReturningUser: true },
    });
    expect(checkIsFirstMeeting(input)).toBe(false);
  });

  it('should NOT detect first meeting for returning users (even on turn 0)', () => {
    // Returning users have talked before - it's never their "first meeting"
    const input = createMockInput({
      userData: { turnCount: 0, isReturningUser: true },
    });
    expect(checkIsFirstMeeting(input)).toBe(false);
  });

  it('should NOT detect first meeting for users with many conversations after turn 1', () => {
    const input = createMockInput({
      userData: { turnCount: 2 },
    });
    // @ts-expect-error Setting userProfile for test
    input.userProfile = { totalConversations: 5 };
    expect(checkIsFirstMeeting(input)).toBe(false);
  });
});

// ============================================================================
// ENERGY DETECTION TESTS
// ============================================================================

describe('Energy Detection', () => {
  it('should detect neutral energy for normal greeting', () => {
    const energy = getDetectedEnergy('Hello, nice to meet you');
    expect(energy).toBe('neutral');
  });

  it('should detect rushed energy from text', () => {
    const energy = getDetectedEnergy("Quick question - I don't have much time");
    expect(energy).toBe('rushed');
  });

  it('should detect anxious energy from text', () => {
    const energy = getDetectedEnergy("I'm not sure if this is okay but...");
    expect(energy).toBe('anxious');
  });

  it('should detect excited energy from text', () => {
    const energy = getDetectedEnergy("I'm so excited to finally talk to someone!");
    expect(energy).toBe('excited');
  });

  it('should detect low energy from text', () => {
    const energy = getDetectedEnergy("I'm exhausted, had a rough day");
    expect(energy).toBe('low');
  });

  it('should detect guarded energy from text', () => {
    const energy = getDetectedEnergy('Just trying this out, not sure if it will help');
    expect(energy).toBe('guarded');
  });

  it('should prioritize voice emotion over text', () => {
    // Text says excited but voice says anxious
    const energy = getDetectedEnergy("I'm excited!", { primary: 'anxious', intensity: 0.8 });
    expect(energy).toBe('anxious');
  });

  it('should detect excited from voice emotion', () => {
    const energy = getDetectedEnergy('Hello', { primary: 'excited', intensity: 0.7 });
    expect(energy).toBe('excited');
  });

  it('should detect guarded from low voice intensity', () => {
    const energy = getDetectedEnergy('Hello', { primary: 'neutral', intensity: 0.2 });
    expect(energy).toBe('guarded');
  });
});

// ============================================================================
// BUILDER OUTPUT TESTS
// ============================================================================

describe('First Meeting Magic Builder', () => {
  it('should have correct metadata', () => {
    expect(firstMeetingMagicBuilder.name).toBe('first-meeting-magic');
    expect(firstMeetingMagicBuilder.priority).toBe(25);
    expect(firstMeetingMagicBuilder.category).toBe('humanizing');
  });

  it('should return injections for first meeting', async () => {
    const input = createMockInput({ userData: { turnCount: 0 } });
    const result = await firstMeetingMagicBuilder.build(input);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].source).toBe('first_meeting_core');
    expect(result[0].priority).toBe('high');
  });

  it('should return empty for non-first-meeting', async () => {
    const input = createMockInput({ userData: { turnCount: 5 } });
    const result = await firstMeetingMagicBuilder.build(input);

    expect(result).toHaveLength(0);
  });

  it('should include energy guidance in output', async () => {
    const input = createMockInput({
      userText: "Quick question - I'm in a hurry",
      userData: { turnCount: 1 },
    });
    const result = await firstMeetingMagicBuilder.build(input);

    const energyInjection = result.find((i) => i.source === 'first_meeting_energy');
    expect(energyInjection).toBeDefined();
    expect(energyInjection?.content).toContain('RUSHED');
  });

  it('should include noticing guidance for meaningful first words', async () => {
    const input = createMockInput({
      userText: "I've been thinking about this for a while...",
      userData: { turnCount: 1, lastUserMessage: "I've been thinking about this for a while..." },
    });
    const result = await firstMeetingMagicBuilder.build(input);

    const noticingInjection = result.find((i) => i.source === 'first_meeting_noticing');
    expect(noticingInjection).toBeDefined();
  });

  it('should include anti-explaining guidance', async () => {
    const input = createMockInput({ userData: { turnCount: 0 } });
    const result = await firstMeetingMagicBuilder.build(input);

    const coreInjection = result.find((i) => i.source === 'first_meeting_core');
    expect(coreInjection?.content).toContain('ZERO EXPLAINING');
    expect(coreInjection?.content).toContain("I'm here to help you with");
  });

  it('should include model vulnerability guidance', async () => {
    const input = createMockInput({ userData: { turnCount: 0 } });
    const result = await firstMeetingMagicBuilder.build(input);

    const coreInjection = result.find((i) => i.source === 'first_meeting_core');
    expect(coreInjection?.content).toContain('MODEL VULNERABILITY');
    expect(coreInjection?.content).toContain('cold coffee');
  });

  it('should include callback guidance for first words', async () => {
    const input = createMockInput({
      userText: 'I finally decided to try this because my friend recommended it',
      userData: { turnCount: 1 },
    });
    const result = await firstMeetingMagicBuilder.build(input);

    const callbackInjection = result.find((i) => i.source === 'first_meeting_callback');
    expect(callbackInjection).toBeDefined();
    expect(callbackInjection?.content).toContain('REMEMBER THEIR FIRST WORDS');
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty user text', async () => {
    const input = createMockInput({
      userText: '',
      userData: { turnCount: 0 },
    });
    const result = await firstMeetingMagicBuilder.build(input);

    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle undefined userData', async () => {
    const input = createMockInput({});
    // @ts-expect-error Testing undefined userData
    input.userData = undefined;

    const result = await firstMeetingMagicBuilder.build(input);
    // Should default to first meeting behavior
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle missing voice emotion gracefully', async () => {
    const input = createMockInput({
      userText: 'Hello',
      userData: { turnCount: 0 },
      voiceEmotion: undefined,
    });
    const result = await firstMeetingMagicBuilder.build(input);

    expect(result.length).toBeGreaterThan(0);
  });
});
