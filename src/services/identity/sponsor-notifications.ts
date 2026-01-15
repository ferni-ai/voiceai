/**
 * Sponsor Notifications Service
 *
 * Handles notifications to sponsors when family members self-register
 * during phone calls. This enables a natural flow where:
 *
 * 1. Unknown caller mentions knowing a Ferni user ("Seth told me to call")
 * 2. Ferni creates a pending identity for the caller
 * 3. Sponsor (Seth) receives a notification in the app
 * 4. Sponsor approves/rejects the pending identity
 * 5. If approved, caller is recognized on next call
 *
 * @module services/identity/sponsor-notifications
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getDefaultStore } from '../../memory/index.js';
import type { UserProfile } from '../../types/user-profile.js';

const log = createLogger({ module: 'SponsorNotifications' });

// ============================================================================
// TYPES
// ============================================================================

export interface PendingApproval {
  /** Unique ID for this pending approval */
  id: string;

  /** The pending sponsored identity ID */
  identityId: string;

  /** Name provided by the caller */
  callerName: string;

  /** Phone number they called from */
  callerPhone: string;

  /** Name of the sponsor they mentioned */
  mentionedSponsorName: string;

  /** Relationship they mentioned (if any) */
  relationship?: string;

  /** Notes from the call */
  notes?: string;

  /** When the call happened */
  callTimestamp: Date;

  /** Status of the approval */
  status: 'pending' | 'approved' | 'rejected';

  /** When it was created */
  createdAt: Date;

  /** When it was last updated */
  updatedAt: Date;
}

export interface SponsorNotification {
  /** User ID of the potential sponsor */
  sponsorUserId: string;

  /** Title for the notification */
  title: string;

  /** Body text */
  body: string;

  /** Data payload */
  data: {
    type: 'pending_family_approval';
    identityId: string;
    callerName: string;
    relationship?: string;
  };
}

// ============================================================================
// PENDING APPROVALS STORAGE
// ============================================================================

// In-memory storage for pending approvals (would be Firestore in production)
const pendingApprovals = new Map<string, PendingApproval>();

// Map of sponsorUserId -> Set of pending approval IDs
const sponsorPendingApprovals = new Map<string, Set<string>>();

/**
 * Add a pending approval for a sponsor.
 */
export async function addPendingApproval(
  sponsorUserId: string,
  approval: PendingApproval
): Promise<void> {
  // Store the approval
  pendingApprovals.set(approval.id, approval);

  // Track by sponsor
  let sponsorSet = sponsorPendingApprovals.get(sponsorUserId);
  if (!sponsorSet) {
    sponsorSet = new Set();
    sponsorPendingApprovals.set(sponsorUserId, sponsorSet);
  }
  sponsorSet.add(approval.id);

  log.info(
    {
      sponsorUserId,
      approvalId: approval.id,
      callerName: approval.callerName,
    },
    '📬 Added pending approval for sponsor'
  );
}

/**
 * Get all pending approvals for a sponsor.
 */
export function getPendingApprovalsForSponsor(sponsorUserId: string): PendingApproval[] {
  const approvalIds = sponsorPendingApprovals.get(sponsorUserId);
  if (!approvalIds) return [];

  const approvals: PendingApproval[] = [];
  for (const id of approvalIds) {
    const approval = pendingApprovals.get(id);
    if (approval && approval.status === 'pending') {
      approvals.push(approval);
    }
  }

  return approvals.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Get a specific pending approval.
 */
export function getPendingApproval(approvalId: string): PendingApproval | undefined {
  return pendingApprovals.get(approvalId);
}

/**
 * Update a pending approval's status.
 */
export function updateApprovalStatus(
  approvalId: string,
  status: 'approved' | 'rejected'
): boolean {
  const approval = pendingApprovals.get(approvalId);
  if (!approval) return false;

  approval.status = status;
  approval.updatedAt = new Date();

  log.info(
    { approvalId, status, callerName: approval.callerName },
    `📝 Pending approval ${status}`
  );

  return true;
}

// ============================================================================
// SPONSOR SEARCH
// ============================================================================

/**
 * Find users who might be the sponsor based on name.
 * Returns users whose name matches the mentioned sponsor name.
 */
export async function findUsersByName(sponsorName: string): Promise<UserProfile[]> {
  const store = getDefaultStore();
  const results: UserProfile[] = [];
  const nameLower = sponsorName.toLowerCase();

  try {
    const profiles = await store.listProfiles({ limit: 500 });

    for (const profile of profiles) {
      // Check name match (case-insensitive)
      const profileName = (profile.name || profile.preferredName || '').toLowerCase();

      // Check for first name match or full name match
      if (profileName === nameLower || profileName.startsWith(nameLower + ' ')) {
        results.push(profile);
      }
      // Also check first name only
      else if (profileName.split(' ')[0] === nameLower) {
        results.push(profile);
      }
    }

    log.debug(
      { sponsorName, matchCount: results.length },
      'Found potential sponsors by name'
    );
  } catch (error) {
    log.warn({ error: String(error), sponsorName }, 'Error searching for sponsors by name');
  }

  return results;
}

// ============================================================================
// NOTIFICATION HANDLING
// ============================================================================

/**
 * Notify potential sponsors about a pending family member.
 * This searches for users matching the sponsor name and creates
 * pending approvals for each potential match.
 */
export async function notifyPotentialSponsors(
  sponsorName: string,
  pendingIdentityId: string,
  callerInfo: {
    name: string;
    phone: string;
    relationship?: string;
    notes?: string;
  }
): Promise<{ notifiedCount: number; sponsorIds: string[] }> {
  // Find users with matching name
  const potentialSponsors = await findUsersByName(sponsorName);

  if (potentialSponsors.length === 0) {
    log.info(
      { sponsorName, callerName: callerInfo.name },
      'No potential sponsors found for caller'
    );
    return { notifiedCount: 0, sponsorIds: [] };
  }

  const sponsorIds: string[] = [];
  const now = new Date();

  for (const sponsor of potentialSponsors) {
    // Create a pending approval for this sponsor
    const approvalId = `approval_${pendingIdentityId}_${sponsor.id}`;
    const approval: PendingApproval = {
      id: approvalId,
      identityId: pendingIdentityId,
      callerName: callerInfo.name,
      callerPhone: callerInfo.phone,
      mentionedSponsorName: sponsorName,
      relationship: callerInfo.relationship,
      notes: callerInfo.notes,
      callTimestamp: now,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    await addPendingApproval(sponsor.id, approval);
    sponsorIds.push(sponsor.id);

    log.info(
      {
        sponsorUserId: sponsor.id,
        sponsorName: sponsor.name,
        callerName: callerInfo.name,
        relationship: callerInfo.relationship,
      },
      '🔔 Sending notification to potential sponsor'
    );

    // Build notification payload
    const notification: SponsorNotification = {
      sponsorUserId: sponsor.id,
      title: 'Someone called looking for you!',
      body: `${callerInfo.name} called and mentioned your name. Tap to add them.`,
      data: {
        type: 'pending_family_approval',
        identityId: pendingIdentityId,
        callerName: callerInfo.name,
        relationship: callerInfo.relationship,
      },
    };

    // Send push notification via the push notifications service
    try {
      const { getPushNotificationsService } = await import('../push-notifications.js');
      const pushService = getPushNotificationsService();

      const sent = await pushService.sendNotification(sponsor.id, {
        title: notification.title,
        body: notification.body,
        type: 'family_approval_request',
        data: notification.data,
      });

      if (sent) {
        log.info({ sponsorUserId: sponsor.id }, '✅ Push notification sent successfully');
      } else {
        log.debug(
          { sponsorUserId: sponsor.id },
          'No push subscription for sponsor (notification queued in-app only)'
        );
      }
    } catch (error) {
      // Non-fatal - the pending approval is still created
      log.warn(
        { error: String(error), sponsorUserId: sponsor.id },
        'Failed to send push notification (approval still created)'
      );
    }
  }

  log.info(
    {
      sponsorName,
      callerName: callerInfo.name,
      notifiedCount: sponsorIds.length,
    },
    `📣 Notified ${sponsorIds.length} potential sponsor(s)`
  );

  return {
    notifiedCount: sponsorIds.length,
    sponsorIds,
  };
}

// ============================================================================
// APPROVAL HANDLING
// ============================================================================

/**
 * Approve a pending family member registration.
 * This activates the sponsored identity and links it to the sponsor.
 */
export async function approvePendingApproval(
  approvalId: string,
  sponsorUserId: string,
  updates?: {
    displayName?: string;
    relationship?: string;
    accessLevel?: 'full' | 'limited' | 'supervised';
    notes?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const approval = pendingApprovals.get(approvalId);

  if (!approval) {
    return { success: false, error: 'Approval not found' };
  }

  if (approval.status !== 'pending') {
    return { success: false, error: `Approval already ${approval.status}` };
  }

  try {
    // Import the function to approve the self-registered identity
    const { approveSelfRegisteredIdentity } = await import('./sponsored-identity.js');

    await approveSelfRegisteredIdentity(approval.identityId, sponsorUserId, {
      displayName: updates?.displayName || approval.callerName,
      relationship: (updates?.relationship || approval.relationship) as import('./sponsored-identity.js').RelationshipType | undefined,
      accessLevel: updates?.accessLevel || 'full',
      notes: updates?.notes || approval.notes,
    });

    // Mark approval as complete
    updateApprovalStatus(approvalId, 'approved');

    log.info(
      {
        approvalId,
        sponsorUserId,
        callerName: approval.callerName,
      },
      '✅ Pending approval approved - family member activated'
    );

    return { success: true };
  } catch (error) {
    log.error({ error: String(error), approvalId }, 'Error approving pending approval');
    return { success: false, error: String(error) };
  }
}

/**
 * Reject a pending family member registration.
 */
export async function rejectPendingApproval(
  approvalId: string,
  sponsorUserId: string
): Promise<{ success: boolean; error?: string }> {
  const approval = pendingApprovals.get(approvalId);

  if (!approval) {
    return { success: false, error: 'Approval not found' };
  }

  if (approval.status !== 'pending') {
    return { success: false, error: `Approval already ${approval.status}` };
  }

  // Mark approval as rejected
  updateApprovalStatus(approvalId, 'rejected');

  // Optionally delete the pending identity
  try {
    const { deleteSponsoredIdentity } = await import('./sponsored-identity.js');
    await deleteSponsoredIdentity(approval.identityId, sponsorUserId);
    log.info(
      { approvalId, identityId: approval.identityId },
      'Deleted rejected pending identity'
    );
  } catch (error) {
    // Non-fatal - identity might not exist
    log.debug({ error: String(error) }, 'Could not delete rejected identity (may not exist)');
  }

  log.info(
    {
      approvalId,
      sponsorUserId,
      callerName: approval.callerName,
    },
    '❌ Pending approval rejected'
  );

  return { success: true };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  addPendingApproval,
  getPendingApprovalsForSponsor,
  getPendingApproval,
  updateApprovalStatus,
  findUsersByName,
  notifyPotentialSponsors,
  approvePendingApproval,
  rejectPendingApproval,
};
