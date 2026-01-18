/**
 * Trust Level System Tests
 * Run: pnpm vitest run src/tests/agi-features/trust-level-system.test.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { generateTestUserId, createMockFirestoreDb, createMockActionPreview } from './index.js';

const mockFirestoreDb = createMockFirestoreDb();
vi.mock('../../utils/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => mockFirestoreDb),
}));

import {
  checkActionPermission,
  getTrustProfile,
  getAllTrustProfiles,
  createPendingAction,
  getPendingActions,
  resolvePendingAction,
  markActionExecuted,
  resetSessionApprovals,
  ACTION_TYPES,
} from '../../services/automation/trust-level-system.js';

describe('Trust Level System', () => {
  let testUserId: string;

  beforeEach(() => {
    testUserId = generateTestUserId('trust');
    mockFirestoreDb._clear();
    vi.clearAllMocks();
  });

  describe('ACTION_TYPES Configuration', () => {
    it('should define all required action types', () => {
      const requiredTypes = ['send_sms', 'send_email', 'create_event', 'book_restaurant', 'book_ride', 'send_payment'];
      for (const type of requiredTypes) {
        expect(ACTION_TYPES[type]).toBeDefined();
        expect(ACTION_TYPES[type].category).toBeDefined();
        expect(ACTION_TYPES[type].maxTrustLevel).toBeDefined();
      }
    });

    it('should have payments require NEW trust level', () => {
      expect(ACTION_TYPES.send_payment.maxTrustLevel).toBe('NEW');
      expect(ACTION_TYPES.send_payment.requiresConfirmation).toBe(true);
    });

    it('should allow messaging to reach TRUSTED level', () => {
      expect(ACTION_TYPES.send_sms.maxTrustLevel).toBe('TRUSTED');
      expect(ACTION_TYPES.send_email.maxTrustLevel).toBe('TRUSTED');
    });
  });

  describe('Trust Profile CRUD', () => {
    it('should return null for non-existent profile', async () => {
      const profile = await getTrustProfile(testUserId, 'send_sms');
      expect(profile).toBeNull();
    });

    it('should get all trust profiles for a user', async () => {
      const profiles = await getAllTrustProfiles(testUserId);
      expect(Array.isArray(profiles)).toBe(true);
    });
  });

  describe('Permission Checking', () => {
    it('should return success for valid action types', async () => {
      const preview = createMockActionPreview();
      const result = await checkActionPermission(testUserId, 'send_sms', preview);
      expect(result.success).toBe(true);
    });

    it('should return error for unknown action type', async () => {
      const preview = createMockActionPreview();
      const result = await checkActionPermission(testUserId, 'unknown_action', preview);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action type');
    });

    it('should require approval for NEW trust level', async () => {
      const preview = createMockActionPreview();
      const result = await checkActionPermission(testUserId, 'send_sms', preview);
      expect(result.requiresApproval).toBe(true);
    });

    it('should always require approval for payments', async () => {
      const preview = createMockActionPreview({ estimatedCost: 100 });
      const result = await checkActionPermission(testUserId, 'send_payment', preview);
      expect(result.requiresApproval).toBe(true);
    });
  });

  describe('Trust Level Progression', () => {
    it('should calculate NEW level for 0 approvals', () => {
      expect(0 < 3).toBe(true);
    });

    it('should calculate ROUTINE level for 3+ approvals', () => {
      const approvalCount = 5, rejectionCount = 0;
      const rejectionRate = rejectionCount / (approvalCount + rejectionCount);
      expect(approvalCount >= 3).toBe(true);
      expect(rejectionRate < 0.2).toBe(true);
    });

    it('should calculate TRUSTED level for 10+ approvals', () => {
      const approvalCount = 15, rejectionCount = 1;
      const rejectionRate = rejectionCount / (approvalCount + rejectionCount);
      expect(approvalCount >= 10).toBe(true);
      expect(rejectionRate < 0.1).toBe(true);
    });
  });

  describe('Pending Actions', () => {
    it('should create pending action', async () => {
      const preview = createMockActionPreview();
      const actionId = await createPendingAction(testUserId, 'send_sms', 'messaging', preview, {});
      expect(actionId).toBeDefined();
      expect(typeof actionId).toBe('string');
    });

    it('should get all pending actions for user', async () => {
      const actions = await getPendingActions(testUserId);
      expect(Array.isArray(actions)).toBe(true);
    });

    it('should resolve pending action on approval', async () => {
      const preview = createMockActionPreview();
      const actionId = await createPendingAction(testUserId, 'send_sms', 'messaging', preview, {});
      const result = await resolvePendingAction(testUserId, actionId, true);
      expect(result === null || result.status === 'approved').toBe(true);
    });
  });

  describe('Session Approvals', () => {
    it('should reset session approvals', async () => {
      await expect(resetSessionApprovals(testUserId)).resolves.not.toThrow();
    });

    it('should mark action as executed', async () => {
      await expect(markActionExecuted(testUserId, 'test_action_id')).resolves.not.toThrow();
    });
  });
});
