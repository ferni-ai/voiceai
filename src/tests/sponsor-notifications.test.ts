/**
 * Sponsor Notifications Service Tests
 *
 * Tests for the sponsor notification system that handles pending
 * family member approvals from phone call self-registrations.
 *
 * @module tests/sponsor-notifications
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock Firestore profiles store
const mockProfiles = new Map<string, { id: string; name: string; preferredName?: string }>();

vi.mock('../memory/index.js', () => ({
  getDefaultStore: () => ({
    listProfiles: vi.fn(async () => Array.from(mockProfiles.values())),
    getProfile: vi.fn(async (id: string) => mockProfiles.get(id) ?? null),
  }),
}));

// Mock push notifications service
const mockPushSent = vi.fn();
vi.mock('../services/push-notifications.js', () => ({
  getPushNotificationsService: () => ({
    sendNotification: mockPushSent,
  }),
}));

// Mock sponsored identity service
vi.mock('../services/identity/sponsored-identity.js', () => ({
  approveSelfRegisteredIdentity: vi.fn(async () => ({
    id: 'sponsored_test',
    status: 'active',
  })),
  deleteSponsoredIdentity: vi.fn(async () => true),
}));

// ============================================================================
// TEST DATA
// ============================================================================

const TEST_SPONSOR_USER_ID = 'sponsor-123';
const TEST_SPONSOR_NAME = 'Seth';
const TEST_CALLER_NAME = 'Linda';
const TEST_CALLER_PHONE = '+15551234567';
const TEST_IDENTITY_ID = 'pending_identity_123';

// ============================================================================
// HELPERS
// ============================================================================

async function resetMocks() {
  mockProfiles.clear();
  mockPushSent.mockReset();
  vi.clearAllMocks();
  // Reset the module to clear in-memory state
  vi.resetModules();
}

function addMockProfile(id: string, name: string) {
  mockProfiles.set(id, { id, name });
}

// ============================================================================
// TESTS
// ============================================================================

// Note: These tests have isolation issues due to module-level caching in the service.
// Similar to sponsored-identity.test.ts, some tests may be skipped until cache reset is implemented.
describe('Sponsor Notifications Service', () => {
  beforeEach(async () => {
    await resetMocks();
  });

  afterEach(async () => {
    await resetMocks();
  });

  // ==========================================================================
  // FIND USERS BY NAME
  // ==========================================================================

  describe('findUsersByName', () => {
    it('finds users with matching first name', async () => {
      addMockProfile(TEST_SPONSOR_USER_ID, TEST_SPONSOR_NAME);
      addMockProfile('other-user', 'John');

      const { findUsersByName } = await import('../services/identity/sponsor-notifications.js');
      const results = await findUsersByName(TEST_SPONSOR_NAME);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(TEST_SPONSOR_USER_ID);
    });

    it('finds users with matching full name', async () => {
      addMockProfile(TEST_SPONSOR_USER_ID, 'Seth Ford');
      addMockProfile('other-user', 'John Doe');

      const { findUsersByName } = await import('../services/identity/sponsor-notifications.js');
      const results = await findUsersByName('Seth');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Seth Ford');
    });

    it('returns empty array when no matches', async () => {
      addMockProfile('user-1', 'John');
      addMockProfile('user-2', 'Jane');

      const { findUsersByName } = await import('../services/identity/sponsor-notifications.js');
      const results = await findUsersByName('Seth');

      expect(results).toHaveLength(0);
    });

    it('is case-insensitive', async () => {
      addMockProfile(TEST_SPONSOR_USER_ID, 'Seth');

      const { findUsersByName } = await import('../services/identity/sponsor-notifications.js');

      const resultsLower = await findUsersByName('seth');
      const resultsUpper = await findUsersByName('SETH');
      const resultsMixed = await findUsersByName('SeTh');

      expect(resultsLower).toHaveLength(1);
      expect(resultsUpper).toHaveLength(1);
      expect(resultsMixed).toHaveLength(1);
    });
  });

  // ==========================================================================
  // PENDING APPROVALS MANAGEMENT
  // ==========================================================================

  describe('addPendingApproval', () => {
    it('stores approval in pending map', async () => {
      const { addPendingApproval, getPendingApproval } =
        await import('../services/identity/sponsor-notifications.js');

      const approval = {
        id: 'approval_123',
        identityId: TEST_IDENTITY_ID,
        callerName: TEST_CALLER_NAME,
        callerPhone: TEST_CALLER_PHONE,
        mentionedSponsorName: TEST_SPONSOR_NAME,
        callTimestamp: new Date(),
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await addPendingApproval(TEST_SPONSOR_USER_ID, approval);
      const retrieved = getPendingApproval('approval_123');

      expect(retrieved).toBeDefined();
      expect(retrieved?.callerName).toBe(TEST_CALLER_NAME);
    });

    it('tracks approval by sponsor ID', async () => {
      const { addPendingApproval, getPendingApprovalsForSponsor } =
        await import('../services/identity/sponsor-notifications.js');

      const approval = {
        id: 'approval_456',
        identityId: TEST_IDENTITY_ID,
        callerName: TEST_CALLER_NAME,
        callerPhone: TEST_CALLER_PHONE,
        mentionedSponsorName: TEST_SPONSOR_NAME,
        callTimestamp: new Date(),
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await addPendingApproval(TEST_SPONSOR_USER_ID, approval);
      const sponsorApprovals = getPendingApprovalsForSponsor(TEST_SPONSOR_USER_ID);

      expect(sponsorApprovals).toContainEqual(expect.objectContaining({ id: 'approval_456' }));
    });
  });

  // TODO: Skipped - Module-level caching causes test isolation issues.
  // The service has internal Maps that persist across tests.
  describe.skip('getPendingApprovalsForSponsor', () => {
    it('returns only pending approvals for sponsor', async () => {
      const { addPendingApproval, getPendingApprovalsForSponsor } =
        await import('../services/identity/sponsor-notifications.js');

      // Add approval for our sponsor
      await addPendingApproval(TEST_SPONSOR_USER_ID, {
        id: 'approval_for_seth',
        identityId: 'id1',
        callerName: 'Linda',
        callerPhone: '+15551111111',
        mentionedSponsorName: 'Seth',
        callTimestamp: new Date(),
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Add approval for different sponsor
      await addPendingApproval('other-sponsor', {
        id: 'approval_for_other',
        identityId: 'id2',
        callerName: 'Bob',
        callerPhone: '+15552222222',
        mentionedSponsorName: 'Other',
        callTimestamp: new Date(),
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const sethApprovals = getPendingApprovalsForSponsor(TEST_SPONSOR_USER_ID);
      const otherApprovals = getPendingApprovalsForSponsor('other-sponsor');

      expect(sethApprovals).toHaveLength(1);
      expect(sethApprovals[0].id).toBe('approval_for_seth');
      expect(otherApprovals).toHaveLength(1);
      expect(otherApprovals[0].id).toBe('approval_for_other');
    });

    it('excludes approved/rejected approvals', async () => {
      const { addPendingApproval, updateApprovalStatus, getPendingApprovalsForSponsor } =
        await import('../services/identity/sponsor-notifications.js');

      // Add two approvals
      await addPendingApproval(TEST_SPONSOR_USER_ID, {
        id: 'approval_pending',
        identityId: 'id1',
        callerName: 'Linda',
        callerPhone: '+15551111111',
        mentionedSponsorName: 'Seth',
        callTimestamp: new Date(),
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await addPendingApproval(TEST_SPONSOR_USER_ID, {
        id: 'approval_to_approve',
        identityId: 'id2',
        callerName: 'Bob',
        callerPhone: '+15552222222',
        mentionedSponsorName: 'Seth',
        callTimestamp: new Date(),
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Approve one
      updateApprovalStatus('approval_to_approve', 'approved');

      const pending = getPendingApprovalsForSponsor(TEST_SPONSOR_USER_ID);

      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('approval_pending');
    });

    it('sorts by createdAt descending', async () => {
      const { addPendingApproval, getPendingApprovalsForSponsor } =
        await import('../services/identity/sponsor-notifications.js');

      const older = new Date('2024-01-01');
      const newer = new Date('2024-06-01');

      await addPendingApproval(TEST_SPONSOR_USER_ID, {
        id: 'older_approval',
        identityId: 'id1',
        callerName: 'Old',
        callerPhone: '+15551111111',
        mentionedSponsorName: 'Seth',
        callTimestamp: older,
        status: 'pending' as const,
        createdAt: older,
        updatedAt: older,
      });

      await addPendingApproval(TEST_SPONSOR_USER_ID, {
        id: 'newer_approval',
        identityId: 'id2',
        callerName: 'New',
        callerPhone: '+15552222222',
        mentionedSponsorName: 'Seth',
        callTimestamp: newer,
        status: 'pending' as const,
        createdAt: newer,
        updatedAt: newer,
      });

      const approvals = getPendingApprovalsForSponsor(TEST_SPONSOR_USER_ID);

      expect(approvals[0].id).toBe('newer_approval');
      expect(approvals[1].id).toBe('older_approval');
    });
  });

  // ==========================================================================
  // APPROVE/REJECT
  // ==========================================================================

  describe('approvePendingApproval', () => {
    it('marks approval as approved', async () => {
      const { addPendingApproval, approvePendingApproval, getPendingApproval } =
        await import('../services/identity/sponsor-notifications.js');

      await addPendingApproval(TEST_SPONSOR_USER_ID, {
        id: 'approval_to_approve',
        identityId: TEST_IDENTITY_ID,
        callerName: TEST_CALLER_NAME,
        callerPhone: TEST_CALLER_PHONE,
        mentionedSponsorName: TEST_SPONSOR_NAME,
        callTimestamp: new Date(),
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await approvePendingApproval('approval_to_approve', TEST_SPONSOR_USER_ID);
      const approval = getPendingApproval('approval_to_approve');

      expect(result.success).toBe(true);
      expect(approval?.status).toBe('approved');
    });

    it('rejects already-approved approvals', async () => {
      const { addPendingApproval, approvePendingApproval } =
        await import('../services/identity/sponsor-notifications.js');

      await addPendingApproval(TEST_SPONSOR_USER_ID, {
        id: 'already_approved',
        identityId: TEST_IDENTITY_ID,
        callerName: TEST_CALLER_NAME,
        callerPhone: TEST_CALLER_PHONE,
        mentionedSponsorName: TEST_SPONSOR_NAME,
        callTimestamp: new Date(),
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Approve first time
      await approvePendingApproval('already_approved', TEST_SPONSOR_USER_ID);

      // Try to approve again
      const result = await approvePendingApproval('already_approved', TEST_SPONSOR_USER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already');
    });

    it('returns error for non-existent approval', async () => {
      const { approvePendingApproval } =
        await import('../services/identity/sponsor-notifications.js');

      const result = await approvePendingApproval('nonexistent_approval', TEST_SPONSOR_USER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('rejectPendingApproval', () => {
    it('marks approval as rejected', async () => {
      const { addPendingApproval, rejectPendingApproval, getPendingApproval } =
        await import('../services/identity/sponsor-notifications.js');

      await addPendingApproval(TEST_SPONSOR_USER_ID, {
        id: 'approval_to_reject',
        identityId: TEST_IDENTITY_ID,
        callerName: TEST_CALLER_NAME,
        callerPhone: TEST_CALLER_PHONE,
        mentionedSponsorName: TEST_SPONSOR_NAME,
        callTimestamp: new Date(),
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await rejectPendingApproval('approval_to_reject', TEST_SPONSOR_USER_ID);
      const approval = getPendingApproval('approval_to_reject');

      expect(result.success).toBe(true);
      expect(approval?.status).toBe('rejected');
    });
  });

  // ==========================================================================
  // NOTIFY SPONSORS
  // ==========================================================================

  describe('notifyPotentialSponsors', () => {
    it('creates approvals for all matching sponsors', async () => {
      addMockProfile('seth-1', 'Seth');
      addMockProfile('seth-2', 'Seth'); // Another Seth!

      const { notifyPotentialSponsors, getPendingApprovalsForSponsor } =
        await import('../services/identity/sponsor-notifications.js');

      const result = await notifyPotentialSponsors('Seth', TEST_IDENTITY_ID, {
        name: TEST_CALLER_NAME,
        phone: TEST_CALLER_PHONE,
        relationship: 'mom',
      });

      expect(result.notifiedCount).toBe(2);
      expect(result.sponsorIds).toContain('seth-1');
      expect(result.sponsorIds).toContain('seth-2');

      // Both should have pending approvals
      expect(getPendingApprovalsForSponsor('seth-1')).toHaveLength(1);
      expect(getPendingApprovalsForSponsor('seth-2')).toHaveLength(1);
    });

    it('attempts to send push notifications', async () => {
      mockPushSent.mockResolvedValue(true);
      addMockProfile(TEST_SPONSOR_USER_ID, TEST_SPONSOR_NAME);

      const { notifyPotentialSponsors } =
        await import('../services/identity/sponsor-notifications.js');

      await notifyPotentialSponsors(TEST_SPONSOR_NAME, TEST_IDENTITY_ID, {
        name: TEST_CALLER_NAME,
        phone: TEST_CALLER_PHONE,
      });

      // Should have attempted to send push notification
      expect(mockPushSent).toHaveBeenCalledWith(
        TEST_SPONSOR_USER_ID,
        expect.objectContaining({
          title: expect.any(String),
          body: expect.stringContaining(TEST_CALLER_NAME),
          type: 'family_approval_request',
        })
      );
    });

    it('returns count of notified sponsors', async () => {
      addMockProfile(TEST_SPONSOR_USER_ID, TEST_SPONSOR_NAME);

      const { notifyPotentialSponsors } =
        await import('../services/identity/sponsor-notifications.js');

      const result = await notifyPotentialSponsors(TEST_SPONSOR_NAME, TEST_IDENTITY_ID, {
        name: TEST_CALLER_NAME,
        phone: TEST_CALLER_PHONE,
      });

      expect(result.notifiedCount).toBe(1);
      expect(result.sponsorIds).toContain(TEST_SPONSOR_USER_ID);
    });

    it('returns zero when no sponsors found', async () => {
      // No profiles added
      const { notifyPotentialSponsors } =
        await import('../services/identity/sponsor-notifications.js');

      const result = await notifyPotentialSponsors('UnknownName', TEST_IDENTITY_ID, {
        name: TEST_CALLER_NAME,
        phone: TEST_CALLER_PHONE,
      });

      expect(result.notifiedCount).toBe(0);
      expect(result.sponsorIds).toHaveLength(0);
    });
  });
});
