/**
 * Ferni TTS Context Bridge Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  bridgeToFerniContext,
  extractVoiceAgentContext,
  convertToFerniSuperhumanContext,
  getCachedOrComputeContext,
  clearContextCache,
  clearAllContextCache,
  type VoiceSessionUserData,
} from '../ferni-tts-context-bridge.js';

describe('bridgeToFerniContext', () => {
  afterEach(() => {
    clearAllContextCache();
  });

  it('should return empty context for null/undefined userData', () => {
    const context1 = bridgeToFerniContext(null);
    const context2 = bridgeToFerniContext(undefined);

    expect(context1).toEqual({});
    expect(context2).toEqual({});
  });

  it('should extract basic fields from userData', () => {
    const userData: VoiceSessionUserData = {
      userId: 'user-123',
      personaId: 'ferni',
      turnCount: 5,
      userEnergy: 0.7,
      speakingRate: 1.2,
    };

    const context = bridgeToFerniContext(userData);

    expect(context.turnNumber).toBe(5);
    expect(context.userEnergy).toBe(0.7);
    expect(context.userSpeakingRate).toBe(1.2);
  });

  it('should extract emotion with intensity', () => {
    const userData: VoiceSessionUserData = {
      currentEmotion: 'joy',
      emotionIntensity: 0.8,
    };

    const context = bridgeToFerniContext(userData);

    expect(context.userEmotion).toEqual(['joy', 0.8]);
  });

  it('should default emotion intensity to 0.5 when not provided', () => {
    const userData: VoiceSessionUserData = {
      currentEmotion: 'sadness',
      // emotionIntensity not provided
    };

    const context = bridgeToFerniContext(userData);

    expect(context.userEmotion).toEqual(['sadness', 0.5]);
  });

  it('should calculate relationship stage from days and interactions', () => {
    const userData: VoiceSessionUserData = {
      relationshipDays: 182, // ~half year
      totalInteractions: 50, // half of 100
    };

    const context = bridgeToFerniContext(userData);

    // daysFactor = 0.5 * 0.4 = 0.2
    // interactionsFactor = 0.5 * 0.6 = 0.3
    // total = 0.5
    expect(context.relationshipStage).toBeCloseTo(0.5, 1);
  });

  it('should use trustLevel if provided', () => {
    const userData: VoiceSessionUserData = {
      relationshipDays: 100,
      totalInteractions: 50,
      trustLevel: 0.9, // Should override calculated value
    };

    const context = bridgeToFerniContext(userData);

    expect(context.relationshipStage).toBe(0.9);
  });

  it('should convert memory entities', () => {
    const userData: VoiceSessionUserData = {
      activeMemoryEntities: [
        { name: 'Sarah', type: 'person', familiarity: 0.9, sentiment: 0.7 },
        { name: 'NYC', type: 'location', familiarity: 0.5, sentiment: 0.3 },
      ],
    };

    const context = bridgeToFerniContext(userData);

    expect(context.rememberedEntities).toHaveLength(2);
    expect(context.rememberedEntities?.[0]).toEqual({
      name: 'Sarah',
      entityType: 'person',
      familiarity: 0.9,
      emotionalValence: 0.7,
    });
    expect(context.rememberedEntities?.[1]).toEqual({
      name: 'NYC',
      entityType: 'place', // 'location' normalized to 'place'
      familiarity: 0.5,
      emotionalValence: 0.3,
    });
  });
});

describe('extractVoiceAgentContext', () => {
  it('should extract session service ID', () => {
    const userData = {
      services: {
        sessionId: 'session-abc',
      },
    };

    const context = extractVoiceAgentContext(userData);

    expect(context.sessionId).toBe('session-abc');
  });
});

describe('Context Caching', () => {
  beforeEach(() => {
    clearAllContextCache();
  });

  afterEach(() => {
    clearAllContextCache();
  });

  it('should cache computed context', () => {
    const userData: VoiceSessionUserData = {
      turnCount: 10,
    };

    const context1 = getCachedOrComputeContext('session-1', userData);
    const context2 = getCachedOrComputeContext('session-1', userData);

    // Should return same reference (cached)
    expect(context1).toBe(context2);
  });

  it('should return different context for different sessions', () => {
    const userData1: VoiceSessionUserData = { turnCount: 10 };
    const userData2: VoiceSessionUserData = { turnCount: 20 };

    const context1 = getCachedOrComputeContext('session-1', userData1);
    const context2 = getCachedOrComputeContext('session-2', userData2);

    expect(context1.turnNumber).toBe(10);
    expect(context2.turnNumber).toBe(20);
  });

  it('should clear specific session cache', () => {
    const userData: VoiceSessionUserData = { turnCount: 10 };

    const context1 = getCachedOrComputeContext('session-1', userData);
    clearContextCache('session-1');
    const context2 = getCachedOrComputeContext('session-1', userData);

    // Should not be same reference (cache was cleared)
    expect(context1).not.toBe(context2);
  });
});

describe('VoiceEmotion Extraction', () => {
  it('should extract emotion from voiceEmotion structure', () => {
    const userData: VoiceSessionUserData = {
      voiceEmotion: {
        primary: 'anxiety',
        confidence: 0.75,
        arousal: 0.6,
        stressLevel: 0.4,
      },
    };

    const context = bridgeToFerniContext(userData);

    expect(context.userEmotion).toEqual(['anxiety', 0.75]);
  });

  it('should use arousal as fallback for emotion intensity', () => {
    const userData: VoiceSessionUserData = {
      voiceEmotion: {
        primary: 'excitement',
        // No confidence, but has arousal
        arousal: 0.8,
      },
    };

    const context = bridgeToFerniContext(userData);

    expect(context.userEmotion).toEqual(['excitement', 0.8]);
  });

  it('should extract energy from voiceEmotion.arousal', () => {
    const userData: VoiceSessionUserData = {
      voiceEmotion: {
        arousal: 0.5, // Range is -1 to 1, maps to 0-1
      },
    };

    const context = bridgeToFerniContext(userData);

    // arousal 0.5 maps to (0.5 + 1) / 2 = 0.75
    expect(context.userEnergy).toBeCloseTo(0.75, 2);
  });

  it('should extract speaking rate from voiceEmotion.prosody', () => {
    const userData: VoiceSessionUserData = {
      voiceEmotion: {
        prosody: {
          speechRate: 1.3,
        },
      },
    };

    const context = bridgeToFerniContext(userData);

    expect(context.userSpeakingRate).toBe(1.3);
  });

  it('should detect vulnerability from voiceEmotion.anxietyMarkers', () => {
    const userData: VoiceSessionUserData = {
      voiceEmotion: {
        anxietyMarkers: true,
        stressLevel: 0.5,
      },
    };

    const agentContext = extractVoiceAgentContext(userData);

    expect(agentContext.isVulnerable).toBe(true);
  });

  it('should detect vulnerability from high stressLevel', () => {
    const userData: VoiceSessionUserData = {
      voiceEmotion: {
        stressLevel: 0.85, // > 0.7 threshold
      },
    };

    const agentContext = extractVoiceAgentContext(userData);

    expect(agentContext.isVulnerable).toBe(true);
  });

  it('should prefer voiceEmotion over legacy fields', () => {
    const userData: VoiceSessionUserData = {
      // Legacy fields
      currentEmotion: 'joy',
      emotionIntensity: 0.5,
      userEnergy: 0.3,
      // VoiceEmotion (should take precedence)
      voiceEmotion: {
        primary: 'sadness',
        confidence: 0.9,
        arousal: -0.4, // Maps to 0.3
      },
    };

    const context = bridgeToFerniContext(userData);

    // Should use voiceEmotion.primary, not currentEmotion
    expect(context.userEmotion?.[0]).toBe('sadness');
    expect(context.userEmotion?.[1]).toBe(0.9);
  });
});

describe('Services.UserProfile Extraction', () => {
  it('should extract timezone from services.userProfile', () => {
    const userData = {
      services: {
        sessionId: 'session-123',
        userProfile: {
          timezone: 'America/New_York',
        },
      },
    };

    const agentContext = extractVoiceAgentContext(userData);

    expect(agentContext.userTimezone).toBe('America/New_York');
  });

  it('should calculate relationship from services.userProfile.firstContact', () => {
    // Set firstContact to 100 days ago
    const firstContact = new Date();
    firstContact.setDate(firstContact.getDate() - 100);

    const userData = {
      services: {
        userProfile: {
          firstContact: firstContact.toISOString(),
          totalConversations: 50,
        },
      },
    };

    const agentContext = extractVoiceAgentContext(userData);

    // Should have relationship data
    expect(agentContext.relationship).toBeDefined();
    expect(agentContext.relationship?.daysSinceFirstInteraction).toBeCloseTo(100, 0);
    expect(agentContext.relationship?.totalInteractions).toBe(50);
  });

  it('should calculate local hour from timezone', () => {
    const userData = {
      services: {
        userProfile: {
          timezone: 'UTC',
        },
      },
    };

    const context = bridgeToFerniContext(userData);

    // Should have userLocalHour based on UTC
    expect(context.userLocalHour).toBeDefined();
    expect(context.userLocalHour).toBeGreaterThanOrEqual(0);
    expect(context.userLocalHour).toBeLessThan(24);
  });

  it('should prefer services.userProfile.timezone over legacy timezone field', () => {
    const userData = {
      // Legacy field
      timezone: 'America/Los_Angeles',
      // services.userProfile (should take precedence)
      services: {
        userProfile: {
          timezone: 'Europe/London',
        },
      },
    };

    const agentContext = extractVoiceAgentContext(userData);

    expect(agentContext.userTimezone).toBe('Europe/London');
  });

  it('should fall back to legacy timezone when services.userProfile not available', () => {
    const userData: VoiceSessionUserData = {
      timezone: 'America/Chicago',
    };

    const agentContext = extractVoiceAgentContext(userData);

    expect(agentContext.userTimezone).toBe('America/Chicago');
  });

  it('should handle full real-world userData structure', () => {
    // Simulate the actual userData structure from session-init-handler
    const userData = {
      userId: 'user-abc123',
      personaId: 'ferni',
      services: {
        sessionId: 'session-xyz789',
        userProfile: {
          name: 'John',
          timezone: 'America/Denver',
          firstContact: '2024-06-15T10:00:00Z',
          totalConversations: 75,
        },
      },
      turnCount: 12,
      voiceEmotion: {
        primary: 'contentment',
        confidence: 0.68,
        arousal: 0.2,
        stressLevel: 0.15,
        prosody: {
          speechRate: 0.95,
        },
      },
    };

    const context = bridgeToFerniContext(userData);

    // Verify all data is extracted correctly
    expect(context.turnNumber).toBe(12);
    expect(context.userEmotion).toEqual(['contentment', 0.68]);
    expect(context.userEnergy).toBeCloseTo(0.6, 1); // (0.2 + 1) / 2
    expect(context.userSpeakingRate).toBe(0.95);
    expect(context.userLocalHour).toBeDefined();
    expect(context.relationshipStage).toBeDefined();
    expect(context.relationshipStage).toBeGreaterThan(0);
  });
});

describe('Entity Type Normalization', () => {
  it('should normalize various entity type strings', () => {
    const testCases: Array<{ input: string; expected: string }> = [
      { input: 'person', expected: 'person' },
      { input: 'PERSON', expected: 'person' },
      { input: 'people', expected: 'person' },
      { input: 'human', expected: 'person' },
      { input: 'place', expected: 'place' },
      { input: 'location', expected: 'place' },
      { input: 'city', expected: 'place' },
      { input: 'project', expected: 'project' },
      { input: 'work', expected: 'project' },
      { input: 'pet', expected: 'pet' },
      { input: 'animal', expected: 'pet' },
      { input: 'unknown', expected: 'other' },
      { input: 'random', expected: 'other' },
    ];

    for (const { input, expected } of testCases) {
      const userData: VoiceSessionUserData = {
        activeMemoryEntities: [{ name: 'Test', type: input, familiarity: 0.5, sentiment: 0 }],
      };

      const context = bridgeToFerniContext(userData);
      expect(context.rememberedEntities?.[0]?.entityType).toBe(expected);
    }
  });
});
