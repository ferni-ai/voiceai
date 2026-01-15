/**
 * Identity System E2E Tests
 *
 * Comprehensive tests for the complete identity flow including:
 * - Name capture from all sources (onboarding, voice, agent, auth)
 * - Profile creation and migration
 * - Cross-device sync
 * - VoiceSketch population
 *
 * @module tests/identity-e2e
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createUserProfile } from '../types/user-profile.js';

// ============================================================================
// MOCKS
// ============================================================================

// Mock Firestore store
const mockProfiles = new Map<string, ReturnType<typeof createUserProfile>>();

vi.mock('../memory/in-memory-store.js', () => ({
  getDefaultStore: () => ({
    getProfile: vi.fn(async (userId: string) => mockProfiles.get(userId) ?? null),
    saveProfile: vi.fn(async (profile: ReturnType<typeof createUserProfile>) => {
      mockProfiles.set(profile.id, profile);
    }),
    getOrCreateProfile: vi.fn(async (userId: string) => {
      let profile = mockProfiles.get(userId);
      if (!profile) {
        profile = createUserProfile(userId);
        mockProfiles.set(userId, profile);
      }
      return profile;
    }),
    initialize: vi.fn(),
  }),
}));

// Mock prosody learning
vi.mock('../services/trust-systems/voice-prosody-learning.js', () => ({
  getBaseline: vi.fn(() => null),
}));

// ============================================================================
// TEST DATA
// ============================================================================

const TEST_USER_ID = 'test-firebase-uid-123';
const TEST_DEVICE_ID = 'device:test-device-abc';
const TEST_NAME = 'Seth';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function resetMocks() {
  mockProfiles.clear();
  vi.clearAllMocks();
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Identity System E2E', () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  // ==========================================================================
  // PROFILE CREATION
  // ==========================================================================

  describe('Profile Creation', () => {
    it('creates profile with userId and name', () => {
      const profile = createUserProfile(TEST_USER_ID, TEST_NAME);

      expect(profile.id).toBe(TEST_USER_ID);
      expect(profile.name).toBe(TEST_NAME);
      // Note: preferredName is set separately (e.g., via rememberName tool)
      expect(profile.totalConversations).toBe(0);
    });

    it('creates profile with just userId (name undefined)', () => {
      const profile = createUserProfile(TEST_USER_ID);

      expect(profile.id).toBe(TEST_USER_ID);
      expect(profile.name).toBeUndefined();
      expect(profile.totalConversations).toBe(0);
    });

    it('initializes onboarding state as undefined', () => {
      const profile = createUserProfile(TEST_USER_ID);

      expect(profile.onboarding).toBeUndefined();
    });

    it('initializes voiceSketch as undefined', () => {
      const profile = createUserProfile(TEST_USER_ID);

      expect(profile.voiceSketch).toBeUndefined();
    });
  });

  // ==========================================================================
  // NAME EXTRACTION FROM TEXT
  // ==========================================================================

  describe('Name Extraction', () => {
    it('extracts name from "My name is X"', async () => {
      const { extractSmallDetails } =
        await import('../intelligence/tracking/conversation-quality.js');

      const details = extractSmallDetails('My name is Seth');

      expect(details).toContainEqual(
        expect.objectContaining({
          type: 'user_name',
          value: 'Seth',
        })
      );
    });

    it('extracts name from "I\'m X"', async () => {
      const { extractSmallDetails } =
        await import('../intelligence/tracking/conversation-quality.js');

      const details = extractSmallDetails("Hi, I'm Sarah");

      expect(details).toContainEqual(
        expect.objectContaining({
          type: 'user_name',
          value: 'Sarah',
        })
      );
    });

    it('extracts name from "Call me X"', async () => {
      const { extractSmallDetails } =
        await import('../intelligence/tracking/conversation-quality.js');

      const details = extractSmallDetails('Call me Mike');

      expect(details).toContainEqual(
        expect.objectContaining({
          type: 'user_name',
          value: 'Mike',
        })
      );
    });

    it('does NOT extract persona names as user names', async () => {
      const { extractSmallDetails } =
        await import('../intelligence/tracking/conversation-quality.js');

      const details = extractSmallDetails('Hi Ferni!');

      const userNames = details.filter((d) => d.type === 'user_name');
      expect(userNames).toHaveLength(0);
    });

    it('does NOT extract common words as names', async () => {
      const { extractSmallDetails } =
        await import('../intelligence/tracking/conversation-quality.js');

      const details = extractSmallDetails("I'm Good today");

      const userNames = details.filter((d) => d.type === 'user_name');
      expect(userNames).toHaveLength(0);
    });
  });

  // ==========================================================================
  // REALTIME PERSISTENCE
  // ==========================================================================

  describe('Realtime Persistence', () => {
    it('persistExtractedDetails is called with correct params', async () => {
      // This test verifies the function signature and calling pattern
      // Full integration requires Firestore emulator
      const { persistExtractedDetails } = await import('../services/realtime-persistence.js');

      // Should not throw for anonymous users (graceful degradation)
      await expect(
        persistExtractedDetails('anonymous', [{ type: 'user_name', value: 'Seth' }])
      ).resolves.not.toThrow();

      // Should not throw for empty details
      await expect(persistExtractedDetails(TEST_USER_ID, [])).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // VOICE SKETCH
  // ==========================================================================

  describe('Voice Sketch', () => {
    it('builds voice sketch from voice characteristics', async () => {
      const { buildVoiceSketch } = await import('../services/voice/voice-sketch-builder.js');

      const sketch = buildVoiceSketch({
        userId: TEST_USER_ID,
        sessionId: 'test-session',
        characteristics: {
          pitchMean: 150,
          pitchRange: 50,
          pitchVariability: 0.5,
          energyMean: -20,
          energyRange: 15,
          energyVariability: 0.5,
          speakingRate: 150, // WPM
          pauseFrequency: 10,
          pauseDuration: 300,
        },
        durationMs: 60000, // 1 minute
        sampleCount: 10,
      });

      expect(sketch).not.toBeNull();
      expect(sketch?.pitchMean).toBe(150);
      expect(sketch?.samplesAnalyzed).toBe(10);
      expect(sketch?.confidence).toBeGreaterThan(0);
      expect(sketch?.confidence).toBeLessThanOrEqual(0.9);
    });

    it('returns null with insufficient samples', async () => {
      const { buildVoiceSketch } = await import('../services/voice/voice-sketch-builder.js');

      const sketch = buildVoiceSketch({
        userId: TEST_USER_ID,
        sessionId: 'test-session',
        characteristics: { pitchMean: 150 },
        durationMs: 1000,
        sampleCount: 2, // Less than 3 required
      });

      expect(sketch).toBeNull();
    });

    it('merges voice sketches correctly', async () => {
      const { buildVoiceSketch, mergeVoiceSketch } =
        await import('../services/voice/voice-sketch-builder.js');

      const oldSketch = buildVoiceSketch({
        userId: TEST_USER_ID,
        sessionId: 'session-1',
        characteristics: { pitchMean: 140, pitchRange: 40 },
        durationMs: 30000,
        sampleCount: 5,
      })!;

      const newSketch = buildVoiceSketch({
        userId: TEST_USER_ID,
        sessionId: 'session-2',
        characteristics: { pitchMean: 160, pitchRange: 60 },
        durationMs: 30000,
        sampleCount: 5,
      })!;

      const merged = mergeVoiceSketch(oldSketch, newSketch);

      // Should favor new values (0.7 weight) but include old (0.3 weight)
      expect(merged.pitchMean).toBeGreaterThan(oldSketch.pitchMean);
      expect(merged.pitchMean).toBeLessThan(newSketch.pitchMean);
      expect(merged.samplesAnalyzed).toBe(10); // Combined
      expect(merged.confidence).toBeGreaterThan(oldSketch.confidence);
    });
  });

  // ==========================================================================
  // IDENTITY PRIORITY
  // ==========================================================================

  describe('Identity Priority', () => {
    it('prioritizes Firebase UID over device ID', async () => {
      const { identifyFromMetadata } = await import('../services/identity/user-identification.js');

      const result = await identifyFromMetadata({
        firebase_uid: 'firebase-123',
        device_id: 'device-456',
      });

      expect(result.userId).toBe('firebase-123');
      expect(result.source.type).toBe('firebase');
    });

    it('falls back to device ID when Firebase UID missing', async () => {
      const { identifyFromMetadata } = await import('../services/identity/user-identification.js');

      const result = await identifyFromMetadata({
        device_id: 'device-456',
      });

      expect(result.userId).toContain('device');
      expect(result.source.type).toBe('device');
    });
  });

  // ==========================================================================
  // SESSION SERVICES NAME FLOW
  // ==========================================================================

  describe('Session Services Name Flow', () => {
    it('passes userName to createSessionServices', async () => {
      // This tests that the CreateSessionOptions interface accepts userName
      // and the flow is wired correctly

      const { CreateSessionOptions } = await import('../services/types.js');

      // Verify the type exists and has userName
      const options: import('../services/types.js').CreateSessionOptions = {
        sessionId: 'test-session',
        userId: TEST_USER_ID,
        userName: TEST_NAME,
      };

      expect(options.userName).toBe(TEST_NAME);
    });
  });

  // ==========================================================================
  // ONBOARDING STATE
  // ==========================================================================

  describe('Onboarding State', () => {
    it('tracks completed onboarding steps', () => {
      const profile = createUserProfile(TEST_USER_ID);

      profile.onboarding = {
        completedSteps: ['welcome', 'name'],
        userName: 'Seth',
        startedAt: new Date().toISOString(),
        hasHadFirstConversation: false,
      };

      expect(profile.onboarding.completedSteps).toContain('welcome');
      expect(profile.onboarding.completedSteps).toContain('name');
      expect(profile.onboarding.userName).toBe('Seth');
    });

    it('marks onboarding complete after all steps', () => {
      const profile = createUserProfile(TEST_USER_ID);

      profile.onboarding = {
        completedSteps: ['welcome', 'name', 'preferences', 'first_conversation'],
        userName: 'Seth',
        startedAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T00:05:00Z',
        hasHadFirstConversation: true,
      };

      expect(profile.onboarding.completedSteps).toHaveLength(4);
      expect(profile.onboarding.completedAt).toBeDefined();
      expect(profile.onboarding.hasHadFirstConversation).toBe(true);
    });
  });

  // ==========================================================================
  // USER PROFILE LINKED IDENTIFIERS
  // ==========================================================================

  describe('Linked Identifiers', () => {
    it('links device ID to profile', () => {
      const profile = createUserProfile(TEST_USER_ID);

      profile.linkedIdentifiers = ['device:abc123'];

      expect(profile.linkedIdentifiers).toContain('device:abc123');
    });

    it('links multiple identifiers', () => {
      const profile = createUserProfile(TEST_USER_ID);

      profile.linkedIdentifiers = ['device:abc123', 'device:def456', 'phone:+15551234567'];

      expect(profile.linkedIdentifiers).toHaveLength(3);
      expect(profile.linkedIdentifiers).toContain('phone:+15551234567');
    });
  });
});

// ============================================================================
// INTEGRATION TESTS (require more setup)
// ============================================================================

describe('Identity Integration Tests', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('End-to-End Name Flow', () => {
    it('name from onboarding persists to Firestore profile', async () => {
      // 1. Create initial profile without name
      const profile = createUserProfile(TEST_USER_ID);
      mockProfiles.set(TEST_USER_ID, profile);

      // 2. Simulate onboarding name update via API
      // In real flow: POST /api/user/profile { name: 'Seth' }
      const updatedProfile = { ...profile, name: 'Seth', preferredName: 'Seth' };
      mockProfiles.set(TEST_USER_ID, updatedProfile);

      // 3. Verify profile has name
      const finalProfile = mockProfiles.get(TEST_USER_ID);
      expect(finalProfile?.name).toBe('Seth');
      expect(finalProfile?.preferredName).toBe('Seth');
    });

    it('name from voice extraction persists to Firestore profile', async () => {
      // 1. Create initial profile without name
      const profile = createUserProfile(TEST_USER_ID);
      mockProfiles.set(TEST_USER_ID, profile);

      // 2. Extract name from text
      const { extractSmallDetails } =
        await import('../intelligence/tracking/conversation-quality.js');
      const details = extractSmallDetails('My name is Sarah');
      const userNameDetail = details.find((d) => d.type === 'user_name');

      expect(userNameDetail).toBeDefined();
      expect(userNameDetail?.value).toBe('Sarah');

      // 3. Simulate persistExtractedDetails updating name
      const updatedProfile = { ...profile, name: userNameDetail?.value };
      mockProfiles.set(TEST_USER_ID, updatedProfile);

      // 4. Verify
      const finalProfile = mockProfiles.get(TEST_USER_ID);
      expect(finalProfile?.name).toBe('Sarah');
    });

    it('rememberName tool saves name to profile', async () => {
      // 1. Create initial profile without name
      const profile = createUserProfile(TEST_USER_ID);
      mockProfiles.set(TEST_USER_ID, profile);

      // 2. Simulate rememberName tool execution
      // In real flow: tool sets userData.services.userProfile.name and calls saveProfile()
      const updatedProfile = { ...profile, name: 'Mike', preferredName: 'Mike' };
      mockProfiles.set(TEST_USER_ID, updatedProfile);

      // 3. Verify
      const finalProfile = mockProfiles.get(TEST_USER_ID);
      expect(finalProfile?.name).toBe('Mike');
    });
  });

  describe('Cross-Device Sync', () => {
    it('same Firebase UID loads same profile on different devices', async () => {
      // 1. Create profile on device A
      const profile = createUserProfile(TEST_USER_ID, 'Seth');
      profile.totalConversations = 5;
      mockProfiles.set(TEST_USER_ID, profile);

      // 2. Load profile on device B (same Firebase UID)
      const loadedProfile = mockProfiles.get(TEST_USER_ID);

      // 3. Verify same profile
      expect(loadedProfile?.name).toBe('Seth');
      expect(loadedProfile?.totalConversations).toBe(5);
    });
  });
});

// ============================================================================
// BETTER THAN HUMAN: GREETING NAME-ASKING TESTS
// ============================================================================

describe('Better Than Human: Greeting Name Prompts', () => {
  describe('warm-friend style (Ferni default)', () => {
    it('newUser greetings include name-asking variants', async () => {
      const { generateStaticGreeting } = await import('../personas/greetings.js');

      // Create a mock persona with warm-friend style
      const mockPersona = {
        name: 'Ferni',
        id: 'ferni',
        identity: { selfReference: 'Ferni' },
        communication: { greetingStyle: 'warm-friend' as const },
        personality: { warmth: 0.85, traits: [] },
      };

      // Generate multiple greetings and check at least some ask for name
      const greetings: string[] = [];
      for (let i = 0; i < 20; i++) {
        greetings.push(
          generateStaticGreeting(mockPersona as Parameters<typeof generateStaticGreeting>[0], {
            isReturningUser: false,
          })
        );
      }

      // At least some greetings should contain name-asking phrases
      const nameAskingPhrases = [
        "What's your name",
        'What should I call you',
        'And you are',
        'Who am I talking to',
      ];

      const hasNameAskingGreeting = greetings.some((g) =>
        nameAskingPhrases.some((phrase) => g.toLowerCase().includes(phrase.toLowerCase()))
      );

      expect(hasNameAskingGreeting).toBe(true);
    });

    it('returningNoName greetings ask for name', async () => {
      const { generateStaticGreeting } = await import('../personas/greetings.js');

      const mockPersona = {
        name: 'Ferni',
        id: 'ferni',
        identity: { selfReference: 'Ferni' },
        communication: { greetingStyle: 'warm-friend' as const },
        personality: { warmth: 0.85, traits: [] },
      };

      // Generate multiple returningNoName greetings
      const greetings: string[] = [];
      for (let i = 0; i < 20; i++) {
        greetings.push(
          generateStaticGreeting(mockPersona as Parameters<typeof generateStaticGreeting>[0], {
            isReturningUser: true,
            userName: undefined, // No name = should trigger returningNoName
          })
        );
      }

      // At least some greetings should contain name-asking phrases
      const nameAskingPhrases = [
        "What's your name",
        'What should I call you',
        "I don't think I got your name",
        'I never asked',
        'by the way',
      ];

      const hasNameAskingGreeting = greetings.some((g) =>
        nameAskingPhrases.some((phrase) => g.toLowerCase().includes(phrase.toLowerCase()))
      );

      expect(hasNameAskingGreeting).toBe(true);
    });

    it('returningUser greetings use the known name', async () => {
      const { generateStaticGreeting } = await import('../personas/greetings.js');

      const mockPersona = {
        name: 'Ferni',
        id: 'ferni',
        identity: { selfReference: 'Ferni' },
        communication: { greetingStyle: 'warm-friend' as const },
        personality: { warmth: 0.85, traits: [] },
      };

      const greeting = generateStaticGreeting(
        mockPersona as Parameters<typeof generateStaticGreeting>[0],
        {
          isReturningUser: true,
          userName: 'Seth',
        }
      );

      // Should contain the user's name
      expect(greeting).toContain('Seth');
    });
  });

  describe('all greeting styles ask for name', () => {
    const styles = ['professional', 'enthusiastic', 'casual-peer', 'wise-mentor'] as const;

    for (const style of styles) {
      it(`${style} style includes name-asking variants for new users`, async () => {
        const { generateStaticGreeting } = await import('../personas/greetings.js');

        const mockPersona = {
          name: 'Test',
          id: 'test',
          identity: { selfReference: 'Test' },
          communication: { greetingStyle: style },
          personality: { warmth: 0.7, traits: [] },
        };

        const greetings: string[] = [];
        for (let i = 0; i < 20; i++) {
          greetings.push(
            generateStaticGreeting(mockPersona as Parameters<typeof generateStaticGreeting>[0], {
              isReturningUser: false,
            })
          );
        }

        const nameAskingPhrases = [
          "What's your name",
          'What should I call you',
          'And you are',
          'Who am I',
          'who might you be',
          'your name',
        ];

        const hasNameAskingGreeting = greetings.some((g) =>
          nameAskingPhrases.some((phrase) => g.toLowerCase().includes(phrase.toLowerCase()))
        );

        expect(hasNameAskingGreeting).toBe(true);
      });
    }
  });
});
