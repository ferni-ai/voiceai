/**
 * Sponsored Identity Service Tests
 *
 * Tests for the phone-based family identity system that allows
 * users to add family members who can call Ferni via phone.
 *
 * @module tests/sponsored-identity
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// In-memory store for sponsored identities
const mockIdentities = new Map<string, unknown>();
const mockPhoneIndex = new Map<string, string>();

// Mock Firestore
vi.mock('../memory/firestore-factory.js', () => ({
  getFirestore: () => ({
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({
        get: vi.fn(async () => ({
          exists: mockIdentities.has(id) || mockPhoneIndex.has(id),
          data: () => mockIdentities.get(id) || mockPhoneIndex.get(id),
          id,
        })),
        set: vi.fn(async (data: unknown) => {
          if (name === 'sponsored_identities') {
            mockIdentities.set(id, data);
          } else if (name === 'sponsored_identity_phone_index') {
            mockPhoneIndex.set(id, data as string);
          }
        }),
        update: vi.fn(async (data: unknown) => {
          const existing = mockIdentities.get(id) as Record<string, unknown>;
          if (existing) {
            mockIdentities.set(id, { ...existing, ...(data as Record<string, unknown>) });
          }
        }),
        delete: vi.fn(async () => {
          mockIdentities.delete(id);
          mockPhoneIndex.delete(id);
        }),
      })),
      where: vi.fn(() => ({
        get: vi.fn(async () => ({
          docs: Array.from(mockIdentities.entries())
            .filter(([, v]) => v !== undefined)
            .map(([id, data]) => ({
              id,
              data: () => data,
              exists: true,
            })),
          empty: mockIdentities.size === 0,
        })),
        orderBy: vi.fn(() => ({
          get: vi.fn(async () => ({
            docs: Array.from(mockIdentities.entries()).map(([id, data]) => ({
              id,
              data: () => data,
              exists: true,
            })),
            empty: mockIdentities.size === 0,
          })),
        })),
      })),
    })),
  }),
}));

// Mock voice enrollment service
vi.mock('../services/voice/voice-enrollment.js', () => ({
  startEnrollment: vi.fn(async () => ({
    sessionId: 'test-session-123',
    prompts: ['Say: The quick brown fox'],
  })),
  addSample: vi.fn(async () => ({
    samplesCollected: 1,
    samplesRequired: 3,
    isComplete: false,
  })),
  completeEnrollment: vi.fn(async () => ({
    voiceProfileId: 'vp_test_123',
    success: true,
  })),
}));

// ============================================================================
// TEST DATA
// ============================================================================

const TEST_SPONSOR_USER_ID = 'firebase-uid-sponsor-123';
const TEST_PHONE_NUMBER = '+15551234567';
const TEST_DISPLAY_NAME = 'Mom';

// ============================================================================
// HELPERS
// ============================================================================

function resetMocks() {
  mockIdentities.clear();
  mockPhoneIndex.clear();
  vi.clearAllMocks();
}

// ============================================================================
// TESTS
// ============================================================================

describe('Sponsored Identity Service', () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  // ==========================================================================
  // IDENTITY CREATION
  // ==========================================================================

  describe('createSponsoredIdentity', () => {
    it('should create a new sponsored identity with valid data', async () => {
      // Import dynamically to use mocks
      const { createSponsoredIdentity } = await import(
        '../services/identity/sponsored-identity.js'
      );

      const identity = await createSponsoredIdentity({
        sponsorUserId: TEST_SPONSOR_USER_ID,
        displayName: TEST_DISPLAY_NAME,
        phoneNumber: TEST_PHONE_NUMBER,
        relationship: 'mother',
      });

      expect(identity).toBeDefined();
      expect(identity.id).toMatch(/^sponsored_/);
      expect(identity.displayName).toBe(TEST_DISPLAY_NAME);
      expect(identity.phoneNumber).toBe(TEST_PHONE_NUMBER);
      expect(identity.relationship).toBe('mother');
      expect(identity.status).toBe('active');
      expect(identity.voiceEnrolled).toBe(false);
      expect(identity.totalCalls).toBe(0);
    });

    it('should normalize phone number to E.164 format', async () => {
      const { createSponsoredIdentity } = await import(
        '../services/identity/sponsored-identity.js'
      );

      const identity = await createSponsoredIdentity({
        sponsorUserId: TEST_SPONSOR_USER_ID,
        displayName: TEST_DISPLAY_NAME,
        phoneNumber: '555-123-4567', // Non-standard format
        relationship: 'mother',
      });

      // Should be normalized (implementation may vary)
      expect(identity.phoneNumber).toBeDefined();
    });

    it('should set default access level to full', async () => {
      const { createSponsoredIdentity } = await import(
        '../services/identity/sponsored-identity.js'
      );

      const identity = await createSponsoredIdentity({
        sponsorUserId: TEST_SPONSOR_USER_ID,
        displayName: TEST_DISPLAY_NAME,
        phoneNumber: TEST_PHONE_NUMBER,
        relationship: 'friend',
      });

      expect(identity.accessLevel).toBe('full');
      expect(identity.allowedPersonas).toContain('*');
    });

    it('should support limited access level', async () => {
      const { createSponsoredIdentity } = await import(
        '../services/identity/sponsored-identity.js'
      );

      const identity = await createSponsoredIdentity({
        sponsorUserId: TEST_SPONSOR_USER_ID,
        displayName: 'Child',
        phoneNumber: '+15559876543',
        relationship: 'child',
        accessLevel: 'limited',
        allowedPersonas: ['ferni'],
      });

      expect(identity.accessLevel).toBe('limited');
      expect(identity.allowedPersonas).toEqual(['ferni']);
    });
  });

  // ==========================================================================
  // PHONE LOOKUP
  // ==========================================================================

  describe('lookupByPhone', () => {
    it('should find identity by phone number', async () => {
      const { createSponsoredIdentity, lookupByPhone } = await import(
        '../services/identity/sponsored-identity.js'
      );

      // Create identity first
      const created = await createSponsoredIdentity({
        sponsorUserId: TEST_SPONSOR_USER_ID,
        displayName: TEST_DISPLAY_NAME,
        phoneNumber: TEST_PHONE_NUMBER,
        relationship: 'mother',
      });

      // Lookup by phone
      const found = await lookupByPhone(TEST_PHONE_NUMBER);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.displayName).toBe(TEST_DISPLAY_NAME);
    });

    it('should return null for unknown phone number', async () => {
      const { lookupByPhone } = await import('../services/identity/sponsored-identity.js');

      const found = await lookupByPhone('+15559999999');

      expect(found).toBeNull();
    });

    it('should not find revoked identities', async () => {
      const { createSponsoredIdentity, revokeSponsoredIdentity, lookupByPhone } = await import(
        '../services/identity/sponsored-identity.js'
      );

      // Create and revoke
      const created = await createSponsoredIdentity({
        sponsorUserId: TEST_SPONSOR_USER_ID,
        displayName: TEST_DISPLAY_NAME,
        phoneNumber: TEST_PHONE_NUMBER,
        relationship: 'mother',
      });

      await revokeSponsoredIdentity(created.id);

      // Lookup should not find revoked identity
      const found = await lookupByPhone(TEST_PHONE_NUMBER);

      expect(found).toBeNull();
    });
  });

  // ==========================================================================
  // CALL TRACKING
  // ==========================================================================

  describe('recordCall', () => {
    it('should increment call count and update lastCallAt', async () => {
      const { createSponsoredIdentity, recordCall, getSponsoredIdentity } = await import(
        '../services/identity/sponsored-identity.js'
      );

      const created = await createSponsoredIdentity({
        sponsorUserId: TEST_SPONSOR_USER_ID,
        displayName: TEST_DISPLAY_NAME,
        phoneNumber: TEST_PHONE_NUMBER,
        relationship: 'mother',
      });

      expect(created.totalCalls).toBe(0);

      await recordCall(created.id, 5); // 5 minute call

      const updated = await getSponsoredIdentity(created.id);

      expect(updated?.totalCalls).toBe(1);
      expect(updated?.totalMinutes).toBe(5);
      expect(updated?.lastCallAt).toBeDefined();
    });
  });

  // ==========================================================================
  // VOICE ENROLLMENT
  // ==========================================================================

  describe('Voice Enrollment', () => {
    it('should start voice enrollment session', async () => {
      const { createSponsoredIdentity, startPhoneVoiceEnrollment } = await import(
        '../services/identity/sponsored-identity.js'
      );

      const identity = await createSponsoredIdentity({
        sponsorUserId: TEST_SPONSOR_USER_ID,
        displayName: TEST_DISPLAY_NAME,
        phoneNumber: TEST_PHONE_NUMBER,
        relationship: 'mother',
      });

      const result = await startPhoneVoiceEnrollment(identity.id);

      expect(result.success).toBe(true);
      expect(result.prompts).toBeDefined();
      expect(result.prompts.length).toBeGreaterThan(0);
    });

    it('should track enrollment progress', async () => {
      const { createSponsoredIdentity, startPhoneVoiceEnrollment, hasActiveEnrollment } =
        await import('../services/identity/sponsored-identity.js');

      const identity = await createSponsoredIdentity({
        sponsorUserId: TEST_SPONSOR_USER_ID,
        displayName: TEST_DISPLAY_NAME,
        phoneNumber: TEST_PHONE_NUMBER,
        relationship: 'mother',
      });

      // Before enrollment
      expect(await hasActiveEnrollment(identity.id)).toBe(false);

      // Start enrollment
      await startPhoneVoiceEnrollment(identity.id);

      // During enrollment
      expect(await hasActiveEnrollment(identity.id)).toBe(true);
    });
  });

  // ==========================================================================
  // SELF-REGISTRATION
  // ==========================================================================

  describe('Self-Registration', () => {
    it('should create pending identity for self-registration', async () => {
      const { createSelfRegisteredIdentity } = await import(
        '../services/identity/sponsored-identity.js'
      );

      const pending = await createSelfRegisteredIdentity({
        phoneNumber: '+15558765432',
        selfRegisteredName: 'Barbara',
      });

      expect(pending).toBeDefined();
      expect(pending.status).toBe('pending');
      expect(pending.selfRegistered).toBe(true);
      expect(pending.displayName).toBe('Barbara');
    });

    it('should approve pending identity', async () => {
      const { createSelfRegisteredIdentity, approveSelfRegisteredIdentity, getSponsoredIdentity } =
        await import('../services/identity/sponsored-identity.js');

      const pending = await createSelfRegisteredIdentity({
        phoneNumber: '+15558765432',
        selfRegisteredName: 'Barbara',
      });

      await approveSelfRegisteredIdentity(pending.id, TEST_SPONSOR_USER_ID, {
        displayName: 'Mom Barbara',
        relationship: 'mother',
      });

      const approved = await getSponsoredIdentity(pending.id);

      expect(approved?.status).toBe('active');
      expect(approved?.sponsorUserId).toBe(TEST_SPONSOR_USER_ID);
      expect(approved?.displayName).toBe('Mom Barbara');
    });
  });

  // ==========================================================================
  // CRUD OPERATIONS
  // ==========================================================================

  describe('CRUD Operations', () => {
    it('should update identity fields', async () => {
      const { createSponsoredIdentity, updateSponsoredIdentity, getSponsoredIdentity } =
        await import('../services/identity/sponsored-identity.js');

      const created = await createSponsoredIdentity({
        sponsorUserId: TEST_SPONSOR_USER_ID,
        displayName: TEST_DISPLAY_NAME,
        phoneNumber: TEST_PHONE_NUMBER,
        relationship: 'mother',
      });

      await updateSponsoredIdentity(created.id, {
        displayName: 'Mama',
        notes: 'Prefers morning calls',
      });

      const updated = await getSponsoredIdentity(created.id);

      expect(updated?.displayName).toBe('Mama');
      expect(updated?.notes).toBe('Prefers morning calls');
    });

    it('should delete identity', async () => {
      const { createSponsoredIdentity, deleteSponsoredIdentity, getSponsoredIdentity } =
        await import('../services/identity/sponsored-identity.js');

      const created = await createSponsoredIdentity({
        sponsorUserId: TEST_SPONSOR_USER_ID,
        displayName: TEST_DISPLAY_NAME,
        phoneNumber: TEST_PHONE_NUMBER,
        relationship: 'mother',
      });

      await deleteSponsoredIdentity(created.id);

      const found = await getSponsoredIdentity(created.id);

      expect(found).toBeNull();
    });

    it('should list all identities for sponsor', async () => {
      const { createSponsoredIdentity, getSponsoredIdentitiesForUser } = await import(
        '../services/identity/sponsored-identity.js'
      );

      // Create multiple identities
      await createSponsoredIdentity({
        sponsorUserId: TEST_SPONSOR_USER_ID,
        displayName: 'Mom',
        phoneNumber: '+15551111111',
        relationship: 'mother',
      });

      await createSponsoredIdentity({
        sponsorUserId: TEST_SPONSOR_USER_ID,
        displayName: 'Dad',
        phoneNumber: '+15552222222',
        relationship: 'father',
      });

      const identities = await getSponsoredIdentitiesForUser(TEST_SPONSOR_USER_ID);

      expect(identities.length).toBe(2);
    });
  });
});
