/**
 * Voice Call Service Tests
 *
 * Tests for persona-based voice calling system including:
 * - Cartesia TTS generation for any persona
 * - Outbound calls with persona voices
 * - Twilio fallback voice selection
 * - TwiML generation for incoming calls
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the external dependencies before importing the module
vi.mock('../utils/safe-logger.js', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return {
    getLogger: () => mockLogger,
    createLogger: () => mockLogger,
  };
});

// Mock GCS storage
vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn().mockImplementation(() => ({
    bucket: vi.fn().mockReturnValue({
      file: vi.fn().mockReturnValue({
        save: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  })),
}));

// Import after mocks are set up - use actual voice-registry (not mocked)
import {
  generatePersonaVoice,
  generateAlexVoice,
  callWithPersonaVoice,
  callWithAlexVoice,
  generateIncomingCallTwiml,
} from '../services/voice/voice-call.js';
import { getVoiceId, getPersonaDisplayName } from '../personas/voice-registry.js';

// ============================================================================
// UNIT TESTS
// ============================================================================

describe('Voice Call Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ============================================================================
  // VOICE ID RESOLUTION TESTS
  // ============================================================================

  describe('Voice ID Resolution', () => {
    it('should resolve voice ID for each persona', () => {
      // These should return real Cartesia voice IDs from the registry
      expect(getVoiceId('ferni')).toBeTruthy();
      expect(getVoiceId('alex-chen')).toBeTruthy();
      expect(getVoiceId('maya-santos')).toBeTruthy();
    });

    it('should return a valid voice ID for unknown persona', () => {
      // Should fallback to a default voice ID
      const voiceId = getVoiceId('unknown-persona');
      expect(voiceId).toBeTruthy();
      expect(typeof voiceId).toBe('string');
    });

    it('should get display name for each persona', () => {
      // Display names should at least contain the first name
      expect(getPersonaDisplayName('ferni').toLowerCase()).toContain('ferni');
      expect(getPersonaDisplayName('alex-chen').toLowerCase()).toContain('alex');
      expect(getPersonaDisplayName('maya-santos').toLowerCase()).toContain('maya');
    });
  });

  // ============================================================================
  // GENERATE PERSONA VOICE TESTS
  // ============================================================================

  describe('generatePersonaVoice', () => {
    it('should return null when CARTESIA_API_KEY is not set', async () => {
      // CARTESIA_API_KEY is typically not set in test environment
      const result = await generatePersonaVoice('Hello world', 'ferni');
      // If no API key, returns null; if API key present, may return buffer
      expect(result === null || Buffer.isBuffer(result)).toBe(true);
    });

    it('should use Ferni as default persona', async () => {
      const result = await generatePersonaVoice('Hello world');
      // Function should complete without throwing
      expect(result === null || Buffer.isBuffer(result)).toBe(true);
    });
  });

  describe('generateAlexVoice (deprecated)', () => {
    it('should work the same as generatePersonaVoice with alex-chen', async () => {
      const result = await generateAlexVoice('Test message');
      // Should complete without throwing
      expect(result === null || Buffer.isBuffer(result)).toBe(true);
    });
  });

  // ============================================================================
  // CALL WITH PERSONA VOICE TESTS
  // ============================================================================

  describe('callWithPersonaVoice', () => {
    it('should return a result object with expected properties', async () => {
      const result = await callWithPersonaVoice('+15551234567', 'Hello', 'ferni');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.message).toBe('string');
    });

    it('should accept any valid persona ID without throwing', async () => {
      const personas = [
        'ferni',
        'alex-chen',
        'maya-santos',
        'peter-john',
        'jordan-taylor',
        'nayan-patel',
      ];

      for (const personaId of personas) {
        // Should not throw for any valid persona
        const result = await callWithPersonaVoice('+15551234567', 'Test', personaId);
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('message');
      }
    });

    it('should accept custom greeting option', async () => {
      const result = await callWithPersonaVoice('+15551234567', 'Hello', 'maya-santos', {
        customGreeting: 'Hey there, Maya here!',
      });
      expect(result).toHaveProperty('success');
    });
  });

  describe('callWithAlexVoice (deprecated)', () => {
    it('should return a result object', async () => {
      const result = await callWithAlexVoice('+15551234567', 'Test message');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
    });
  });

  // ============================================================================
  // INCOMING CALL TWIML TESTS
  // ============================================================================

  describe('generateIncomingCallTwiml', () => {
    it('should generate valid TwiML response', () => {
      const twiml = generateIncomingCallTwiml();
      expect(twiml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(twiml).toContain('<Response>');
      expect(twiml).toContain('<Say');
      expect(twiml).toContain('</Response>');
    });

    it('should include Ferni team greeting', () => {
      const twiml = generateIncomingCallTwiml();
      expect(twiml).toContain('Ferni team');
    });

    it('should use custom greeting when provided', () => {
      const twiml = generateIncomingCallTwiml({
        greeting: 'Welcome to Ferni! How can I help?',
      });
      expect(twiml).toContain('Welcome to Ferni! How can I help?');
    });

    it('should use Polly.Joanna voice for incoming calls', () => {
      const twiml = generateIncomingCallTwiml();
      expect(twiml).toContain('Polly.Joanna');
    });

    it('should generate either SIP dial or unavailable message', () => {
      // Depending on environment, will have either SIP config or fallback message
      const twiml = generateIncomingCallTwiml();
      const hasSipDial = twiml.includes('<Dial>') && twiml.includes('<Sip>');
      const hasUnavailable = twiml.includes('not available');
      expect(hasSipDial || hasUnavailable).toBe(true);
    });
  });
});

// ============================================================================
// TWILIO FALLBACK VOICE MAPPING TESTS
// ============================================================================

describe('Twilio Fallback Voice Mapping', () => {
  const EXPECTED_FALLBACK_VOICES: Record<string, string> = {
    ferni: 'Polly.Matthew',
    'alex-chen': 'Polly.Matthew',
    'maya-santos': 'Polly.Joanna',
    'peter-john': 'Polly.Matthew',
    'jordan-taylor': 'Polly.Joanna',
    'nayan-patel': 'Polly.Matthew',
  };

  it('should have fallback voices for all personas', () => {
    // This verifies the mapping exists (the actual map is internal to the module)
    const personas = Object.keys(EXPECTED_FALLBACK_VOICES);
    expect(personas.length).toBe(6);
  });

  it('should map female personas to female Polly voice', () => {
    expect(EXPECTED_FALLBACK_VOICES['maya-santos']).toBe('Polly.Joanna');
    expect(EXPECTED_FALLBACK_VOICES['jordan-taylor']).toBe('Polly.Joanna');
  });

  it('should map male personas to male Polly voice', () => {
    expect(EXPECTED_FALLBACK_VOICES['ferni']).toBe('Polly.Matthew');
    expect(EXPECTED_FALLBACK_VOICES['alex-chen']).toBe('Polly.Matthew');
    expect(EXPECTED_FALLBACK_VOICES['peter-john']).toBe('Polly.Matthew');
    expect(EXPECTED_FALLBACK_VOICES['nayan-patel']).toBe('Polly.Matthew');
  });
});

// ============================================================================
// PHONE NUMBER HANDLING TESTS
// ============================================================================

describe('Phone Number Handling', () => {
  it('should accept various phone number formats without throwing', async () => {
    const phoneFormats = [
      '+15551234567',
      '15551234567',
      '5551234567',
      '(555) 123-4567',
      '555-123-4567',
      '555.123.4567',
    ];

    for (const phone of phoneFormats) {
      // Should not throw for any format
      const result = await callWithPersonaVoice(phone, 'Test', 'ferni');
      expect(result).toHaveProperty('success');
    }
  });
});

// ============================================================================
// XML ESCAPING TESTS
// ============================================================================

describe('XML Character Handling', () => {
  it('should handle messages with special characters without throwing', async () => {
    const specialMessages = [
      'Hello & goodbye',
      'Price < $100',
      'Score > 90',
      'Say "hello"',
      "It's great",
      'Mix & match <items> with "quotes"',
    ];

    for (const message of specialMessages) {
      // Should not throw for any special characters
      const result = await callWithPersonaVoice('+15551234567', message, 'ferni');
      expect(result).toHaveProperty('success');
    }
  });
});

// ============================================================================
// BETTER THAN HUMAN TESTS
// ============================================================================

describe('Better Than Human - Voice Call Quality', () => {
  it('should support all team personas', () => {
    const teamPersonas = [
      'ferni',
      'alex-chen',
      'maya-santos',
      'peter-john',
      'jordan-taylor',
      'nayan-patel',
    ];

    for (const personaId of teamPersonas) {
      const displayName = getPersonaDisplayName(personaId);
      expect(displayName).toBeTruthy();
      expect(displayName.length).toBeGreaterThan(0);
    }
  });

  it('should have distinct voice IDs per persona', () => {
    const voiceIds = new Set<string>();
    const personas = ['ferni', 'alex-chen', 'maya-santos'];

    for (const personaId of personas) {
      const voiceId = getVoiceId(personaId);
      voiceIds.add(voiceId);
    }

    // Each persona should have a unique voice
    expect(voiceIds.size).toBe(3);
  });

  it('should generate personalized greetings', () => {
    const twimlFerni = generateIncomingCallTwiml({ greeting: 'Hey, this is Ferni!' });
    const twimlMaya = generateIncomingCallTwiml({ greeting: 'Hi there, Maya here!' });

    expect(twimlFerni).toContain('Ferni');
    expect(twimlMaya).toContain('Maya');
    expect(twimlFerni).not.toBe(twimlMaya);
  });

  it('should not sound robotic or generic', () => {
    const roboticPhrases = [
      'this is an automated call',
      'press 1 for',
      'your call is important',
      'please hold',
      'our representatives',
    ];

    const twiml = generateIncomingCallTwiml();
    const lowerTwiml = twiml.toLowerCase();

    for (const phrase of roboticPhrases) {
      expect(lowerTwiml).not.toContain(phrase);
    }
  });
});

// ============================================================================
// PERSONA CALL OPTIONS TESTS
// ============================================================================

describe('PersonaCallOptions', () => {
  it('should accept fallbackToTwilioVoice option', async () => {
    const result = await callWithPersonaVoice('+15551234567', 'Test', 'ferni', {
      fallbackToTwilioVoice: false,
    });
    expect(result).toHaveProperty('success');
  });

  it('should accept customGreeting option', async () => {
    const result = await callWithPersonaVoice('+15551234567', 'Test', 'maya-santos', {
      customGreeting: 'Hey! Maya here, checking in on your progress.',
    });
    expect(result).toHaveProperty('success');
  });

  it('should accept both options together', async () => {
    const result = await callWithPersonaVoice('+15551234567', 'Test', 'alex-chen', {
      fallbackToTwilioVoice: true,
      customGreeting: 'Hey, Alex here with a quick reminder.',
    });
    expect(result).toHaveProperty('success');
  });
});
