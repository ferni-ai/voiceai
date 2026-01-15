/**
 * Review Queue Workflow for Marketplace Submissions
 *
 * Implements a comprehensive review workflow for agents and tools submitted to the marketplace.
 * Includes automated validation, human review assignment, and state management.
 *
 * State Flow:
 *   draft → pending_review → in_review → approved/rejected/changes_requested
 *
 * Features:
 * - Automated validation checks on submission
 * - Review assignment and tracking
 * - Review history audit trail
 * - Publisher notifications (stubs)
 * - Firestore persistence
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAgent, getTool } from '../marketplace/index.js';
import type { AgentManifest, ToolManifest } from '../marketplace/schema/types.js';
import { removeUndefined, cleanForFirestore } from '../utils/firestore-utils.js';
import { getLogger } from '../utils/safe-logger.js';
import {
  sendEmail,
  isEmailDeliveryAvailable,
} from '../services/outreach/delivery/email-delivery.js';
import { getPushNotificationsService } from '../services/push-notifications.js';

const log = getLogger().child({ module: 'review-queue' });

// ============================================================================
// TYPES
// ============================================================================

export type ReviewStatus =
  | 'draft' // Publisher is still editing
  | 'pending_review' // Submitted, awaiting assignment
  | 'in_review' // Assigned to reviewer, being evaluated
  | 'approved' // Approved and published
  | 'rejected' // Rejected, not published
  | 'changes_requested'; // Needs changes from publisher

export type ReviewDecision = 'approved' | 'rejected' | 'changes_requested';

export interface ReviewSubmission {
  /** Unique submission ID */
  id: string;

  /** Item being reviewed */
  itemId: string;
  itemType: 'agent' | 'tool';

  /** Publisher info */
  publisherId: string;
  publisherName: string;

  /** Review state */
  status: ReviewStatus;
  version: number; // Track resubmissions

  /** Timestamps */
  submittedAt: Date;
  assignedAt?: Date;
  reviewedAt?: Date;

  /** Review assignment */
  assignedTo?: string; // Reviewer ID
  reviewerName?: string;

  /** Review outcome */
  decision?: ReviewDecision;
  reviewerFeedback?: string;

  /** Automated checks */
  automatedChecks: {
    passedValidation: boolean;
    validationErrors: string[];
    manifestValid: boolean;
    permissionsValid: boolean;
    contentSafe: boolean;
    usesEnvVars: boolean; // Voice IDs use env vars
  };

  /** Review notes (internal) */
  internalNotes?: string;

  /** Previous versions (for resubmissions) */
  previousVersions?: Array<{
    version: number;
    decision: ReviewDecision;
    feedback: string;
    reviewedAt: Date;
  }>;
}

export interface ReviewQueueOptions {
  status?: ReviewStatus | ReviewStatus[];
  assignedTo?: string;
  publisherId?: string;
  itemType?: 'agent' | 'tool';
  limit?: number;
  sortBy?: 'submittedAt' | 'assignedAt';
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// FIRESTORE HELPERS
// ============================================================================

const COLLECTION = 'marketplace_review_submissions';

function getDb(): Firestore {
  return getFirestore();
}

/**
 * Convert Firestore document to ReviewSubmission
 */
function docToSubmission(doc: FirebaseFirestore.DocumentSnapshot): ReviewSubmission | null {
  if (!doc.exists) return null;

  const data = doc.data();
  if (!data) return null;

  return {
    id: doc.id,
    itemId: data.itemId as string,
    itemType: data.itemType as 'agent' | 'tool',
    publisherId: data.publisherId as string,
    publisherName: data.publisherName as string,
    status: data.status as ReviewStatus,
    version: data.version as number,
    submittedAt: (data.submittedAt as FirebaseFirestore.Timestamp).toDate(),
    assignedAt: data.assignedAt
      ? (data.assignedAt as FirebaseFirestore.Timestamp).toDate()
      : undefined,
    reviewedAt: data.reviewedAt
      ? (data.reviewedAt as FirebaseFirestore.Timestamp).toDate()
      : undefined,
    assignedTo: data.assignedTo as string | undefined,
    reviewerName: data.reviewerName as string | undefined,
    decision: data.decision as ReviewDecision | undefined,
    reviewerFeedback: data.reviewerFeedback as string | undefined,
    automatedChecks: data.automatedChecks as AutomatedCheckResult,
    internalNotes: data.internalNotes as string | undefined,
    previousVersions: data.previousVersions?.map((v: unknown) => {
      const version = v as Record<string, unknown>;
      return {
        version: version.version as number,
        decision: version.decision as ReviewDecision,
        feedback: version.feedback as string,
        reviewedAt: (version.reviewedAt as FirebaseFirestore.Timestamp).toDate(),
      };
    }),
  };
}

// ============================================================================
// AUTOMATED VALIDATION
// ============================================================================

interface AutomatedCheckResult {
  passedValidation: boolean;
  validationErrors: string[];
  manifestValid: boolean;
  permissionsValid: boolean;
  contentSafe: boolean;
  usesEnvVars: boolean;
}

/**
 * Run automated validation checks on a manifest
 */
function runAutomatedChecks(
  manifest: ToolManifest | AgentManifest,
  itemType: 'agent' | 'tool'
): AutomatedCheckResult {
  const errors: string[] = [];
  let manifestValid = true;
  let permissionsValid = true;
  let contentSafe = true;
  let usesEnvVars = true;

  // 1. Validate required fields
  if (!manifest.id || !manifest.name || !manifest.version) {
    errors.push('Missing required fields: id, name, or version');
    manifestValid = false;
  }

  // 2. Validate version format (semver)
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    errors.push(`Invalid version format: ${manifest.version}. Must be semver (e.g., 1.0.0)`);
    manifestValid = false;
  }

  // 3. Validate publisher info
  if (!manifest.publisher?.id || !manifest.publisher?.name) {
    errors.push('Publisher ID and name are required');
    manifestValid = false;
  }

  // 4. Check permissions
  const requiredPerms = manifest.permissions.required;
  const optionalPerms = manifest.permissions.optional;

  // Check for dangerous permission combinations
  const hasDangerousCombo = [...requiredPerms, ...optionalPerms].some((perm) => {
    const { scope } = perm;
    return (
      scope === 'user:finance:write' ||
      scope === 'user:memory:delete' ||
      scope === 'communication:email:send'
    );
  });

  if (hasDangerousCombo && manifest.verification.trustLevel === 'unverified') {
    errors.push(
      'Dangerous permissions (finance:write, memory:delete, email:send) require trust level >= community'
    );
    permissionsValid = false;
  }

  // 5. Check for prohibited content patterns
  const descText = `${manifest.description.short} ${manifest.description.long}`.toLowerCase();
  const prohibitedPatterns = [
    /\bcrypto\s*scam\b/,
    /\bpyramid\s*scheme\b/,
    /\bget\s*rich\s*quick\b/,
    /\bhack\b/,
    /\bmalware\b/,
    /\bexploit\b/,
  ];

  for (const pattern of prohibitedPatterns) {
    if (pattern.test(descText)) {
      errors.push(`Prohibited content pattern detected: ${pattern.source}`);
      contentSafe = false;
    }
  }

  // 6. Validate voice IDs use environment variables (agents only)
  if (itemType === 'agent') {
    const agentManifest = manifest as AgentManifest;
    const { voiceId } = agentManifest.persona.voice;

    // Voice ID should be an env var reference (e.g., ${VOICE_ID_FERNI})
    if (!voiceId.startsWith('${') || !voiceId.endsWith('}')) {
      errors.push(
        `Voice ID must use environment variable (e.g., \${VOICE_ID_NAME}), got: ${voiceId}`
      );
      usesEnvVars = false;
    }

    // Check for hardcoded API keys in env vars
    if (agentManifest.mcpServers) {
      for (const server of agentManifest.mcpServers) {
        if (server.env) {
          for (const [key, value] of Object.entries(server.env)) {
            if (value && !value.startsWith('${') && /[A-Za-z0-9]{20,}/.test(value)) {
              errors.push(
                `MCP server env var "${key}" appears to contain hardcoded secret. Use \${ENV_VAR_NAME}`
              );
              usesEnvVars = false;
            }
          }
        }
      }
    }
  }

  // 7. Tool-specific checks
  if (itemType === 'tool') {
    const toolManifest = manifest as ToolManifest;

    // Check execution limits are reasonable
    if (toolManifest.execution.limits.timeoutMs > 60000) {
      errors.push('Tool timeout exceeds maximum of 60 seconds');
      manifestValid = false;
    }

    if (toolManifest.execution.limits.memoryMb && toolManifest.execution.limits.memoryMb > 512) {
      errors.push('Tool memory limit exceeds maximum of 512MB');
      manifestValid = false;
    }

    // Validate HTTP tools have endpoints
    if (
      toolManifest.execution.runtime.type === 'http' &&
      !toolManifest.execution.runtime.endpoint
    ) {
      errors.push('HTTP tools must specify an endpoint URL');
      manifestValid = false;
    }
  }

  return {
    passedValidation: errors.length === 0,
    validationErrors: errors,
    manifestValid,
    permissionsValid,
    contentSafe,
    usesEnvVars,
  };
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Submit an item for review
 *
 * @param publisherId - Publisher submitting the item
 * @param itemId - ID of the agent or tool
 * @param itemType - 'agent' or 'tool'
 * @returns Submission record
 */
export async function submitForReview(
  publisherId: string,
  itemId: string,
  itemType: 'agent' | 'tool'
): Promise<ReviewSubmission> {
  // Get the manifest
  const manifest = itemType === 'tool' ? getTool(itemId) : getAgent(itemId);
  if (!manifest) {
    throw new Error(`${itemType} not found: ${itemId}`);
  }

  // Verify publisher owns the item
  if (manifest.publisher.id !== publisherId) {
    throw new Error('Publisher ID mismatch');
  }

  // Check if there's already a submission for this item
  const db = getDb();
  const existingQuery = await db
    .collection(COLLECTION)
    .where('itemId', '==', itemId)
    .where('publisherId', '==', publisherId)
    .get();

  let version = 1;
  let previousVersions: ReviewSubmission['previousVersions'] = [];

  if (!existingQuery.empty) {
    const existing = docToSubmission(existingQuery.docs[0])!;

    // If already approved, this is a new version
    if (existing.status === 'approved') {
      version = existing.version + 1;
    } else if (existing.status === 'in_review' || existing.status === 'pending_review') {
      throw new Error('Item is already under review');
    }

    // Archive previous version
    if (existing.decision) {
      previousVersions = [
        ...(existing.previousVersions || []),
        {
          version: existing.version,
          decision: existing.decision,
          feedback: existing.reviewerFeedback || '',
          reviewedAt: existing.reviewedAt || new Date(),
        },
      ];
    }
  }

  // Run automated checks
  const automatedChecks = runAutomatedChecks(manifest, itemType);

  // Create submission
  const submission: Omit<ReviewSubmission, 'id'> = {
    itemId,
    itemType,
    publisherId,
    publisherName: manifest.publisher.name,
    status: 'pending_review',
    version,
    submittedAt: new Date(),
    automatedChecks,
    previousVersions,
  };

  // Save to Firestore
  const docRef = await db.collection(COLLECTION).add(
    removeUndefined({
      ...submission,
      submittedAt: new Date(), // Firestore timestamp
    })
  );

  const result: ReviewSubmission = {
    id: docRef.id,
    ...submission,
  };

  log.info(
    {
      submissionId: result.id,
      itemId,
      itemType,
      publisherId,
      passedValidation: automatedChecks.passedValidation,
    },
    'Item submitted for review'
  );

  // Send notification (stub)
  await notifyPublisherSubmissionReceived(publisherId, itemId);

  return result;
}

/**
 * Get the review queue (admin only)
 *
 * @param options - Filter and sort options
 * @returns List of submissions
 */
export async function getReviewQueue(
  options: ReviewQueueOptions = {}
): Promise<ReviewSubmission[]> {
  const db = getDb();
  let query = db.collection(COLLECTION) as FirebaseFirestore.Query;

  // Filter by status
  if (options.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    query = query.where('status', 'in', statuses);
  }

  // Filter by assignee
  if (options.assignedTo) {
    query = query.where('assignedTo', '==', options.assignedTo);
  }

  // Filter by publisher
  if (options.publisherId) {
    query = query.where('publisherId', '==', options.publisherId);
  }

  // Filter by item type
  if (options.itemType) {
    query = query.where('itemType', '==', options.itemType);
  }

  // Sort
  const sortField = options.sortBy || 'submittedAt';
  const sortOrder = options.sortOrder || 'asc';
  query = query.orderBy(sortField, sortOrder);

  // Limit
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const snapshot = await query.get();

  const submissions: ReviewSubmission[] = [];
  for (const doc of snapshot.docs) {
    const submission = docToSubmission(doc);
    if (submission) {
      submissions.push(submission);
    }
  }

  return submissions;
}

/**
 * Assign a reviewer to a submission
 *
 * @param itemId - Item being reviewed
 * @param reviewerId - ID of the reviewer
 * @param reviewerName - Name of the reviewer
 */
export async function assignReviewer(
  itemId: string,
  reviewerId: string,
  reviewerName: string
): Promise<ReviewSubmission> {
  const db = getDb();

  // Find submission
  const querySnapshot = await db.collection(COLLECTION).where('itemId', '==', itemId).get();

  if (querySnapshot.empty) {
    throw new Error(`No submission found for item: ${itemId}`);
  }

  const doc = querySnapshot.docs[0];
  const submission = docToSubmission(doc)!;

  // Update status and assignment
  await doc.ref.update(
    cleanForFirestore({
      status: 'in_review',
      assignedTo: reviewerId,
      reviewerName,
      assignedAt: new Date(),
    })
  );

  const updated: ReviewSubmission = {
    ...submission,
    status: 'in_review',
    assignedTo: reviewerId,
    reviewerName,
    assignedAt: new Date(),
  };

  log.info({ submissionId: doc.id, itemId, reviewerId }, 'Reviewer assigned to submission');

  // Send notification (stub)
  await notifyReviewerNewAssignment(reviewerId, itemId);

  return updated;
}

/**
 * Submit a review decision
 *
 * @param itemId - Item being reviewed
 * @param reviewerId - ID of the reviewer
 * @param decision - Review decision
 * @param feedback - Feedback for the publisher
 */
export async function submitReview(
  itemId: string,
  reviewerId: string,
  decision: ReviewDecision,
  feedback: string
): Promise<ReviewSubmission> {
  const db = getDb();

  // Find submission
  const querySnapshot = await db.collection(COLLECTION).where('itemId', '==', itemId).get();

  if (querySnapshot.empty) {
    throw new Error(`No submission found for item: ${itemId}`);
  }

  const doc = querySnapshot.docs[0];
  const submission = docToSubmission(doc)!;

  // Verify reviewer is assigned
  if (submission.assignedTo !== reviewerId) {
    throw new Error('Reviewer not assigned to this submission');
  }

  // Update submission
  const newStatus: ReviewStatus = decision;
  await doc.ref.update(
    cleanForFirestore({
      status: newStatus,
      decision,
      reviewerFeedback: feedback,
      reviewedAt: new Date(),
    })
  );

  const updated: ReviewSubmission = {
    ...submission,
    status: newStatus,
    decision,
    reviewerFeedback: feedback,
    reviewedAt: new Date(),
  };

  log.info({ submissionId: doc.id, itemId, reviewerId, decision }, 'Review decision submitted');

  // Send notification (stub)
  await notifyPublisherReviewComplete(submission.publisherId, itemId, decision);

  return updated;
}

/**
 * Request changes from the publisher
 *
 * @param itemId - Item being reviewed
 * @param reviewerId - ID of the reviewer
 * @param feedback - What needs to be changed
 */
export async function requestChanges(
  itemId: string,
  reviewerId: string,
  feedback: string
): Promise<ReviewSubmission> {
  return submitReview(itemId, reviewerId, 'changes_requested', feedback);
}

/**
 * Get review history for an item
 *
 * @param itemId - Item ID
 * @returns All review submissions for this item
 */
export async function getReviewHistory(itemId: string): Promise<ReviewSubmission[]> {
  const db = getDb();

  const querySnapshot = await db
    .collection(COLLECTION)
    .where('itemId', '==', itemId)
    .orderBy('version', 'desc')
    .get();

  const history: ReviewSubmission[] = [];
  for (const doc of querySnapshot.docs) {
    const submission = docToSubmission(doc);
    if (submission) {
      history.push(submission);
    }
  }

  return history;
}

/**
 * Get a single submission by ID
 */
export async function getSubmission(submissionId: string): Promise<ReviewSubmission | null> {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(submissionId).get();
  return docToSubmission(doc);
}

// ============================================================================
// NOTIFICATION HELPERS
// ============================================================================

const NOTIFICATIONS_COLLECTION = 'marketplace_notifications';

interface MarketplaceNotification {
  id?: string;
  userId: string;
  type: 'submission_received' | 'review_complete' | 'reviewer_assigned' | 'changes_requested';
  itemId: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Store in-app notification in Firestore
 */
async function storeInAppNotification(
  notification: Omit<MarketplaceNotification, 'id'>
): Promise<void> {
  try {
    const db = getDb();
    await db.collection(NOTIFICATIONS_COLLECTION).add(
      cleanForFirestore({
        ...notification,
        createdAt: new Date(),
      })
    );
    log.debug(
      { userId: notification.userId, type: notification.type },
      'In-app notification stored'
    );
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to store in-app notification');
  }
}

/**
 * Send push notification to user
 */
async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    const pushService = getPushNotificationsService();
    await pushService.sendNotification(userId, {
      title,
      body,
      type: 'general',
      data,
    });
    log.debug({ userId, title }, 'Push notification sent');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to send push notification');
  }
}

/**
 * Send email notification
 */
async function sendEmailNotification(
  toEmail: string,
  toName: string,
  userId: string,
  subject: string,
  body: string,
  itemId: string
): Promise<void> {
  if (!isEmailDeliveryAvailable()) {
    log.debug('Email delivery not available, skipping email notification');
    return;
  }

  try {
    await sendEmail({
      to: toEmail,
      toName,
      subject,
      body,
      personaId: 'ferni', // Use Ferni styling for marketplace emails
      userId,
      outreachId: `marketplace_${itemId}_${Date.now()}`,
      tags: ['marketplace', 'review-queue'],
    });
    log.debug({ toEmail, subject }, 'Email notification sent');
  } catch (error) {
    log.warn({ error: String(error), toEmail }, 'Failed to send email notification');
  }
}

/**
 * Get user contact info from Firestore
 */
async function getUserContactInfo(userId: string): Promise<{ email?: string; name?: string }> {
  try {
    const db = getDb();
    const userDoc = await db.collection('bogle_users').doc(userId).get();
    if (!userDoc.exists) return {};

    const data = userDoc.data();
    return {
      email: data?.email as string | undefined,
      name: (data?.name || data?.displayName) as string | undefined,
    };
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get user contact info');
    return {};
  }
}

// ============================================================================
// NOTIFICATION IMPLEMENTATIONS
// ============================================================================

/**
 * Notify publisher that their submission was received
 */
async function notifyPublisherSubmissionReceived(
  publisherId: string,
  itemId: string
): Promise<void> {
  log.info({ publisherId, itemId }, 'Sending submission received notification');

  // Store in-app notification
  await storeInAppNotification({
    userId: publisherId,
    type: 'submission_received',
    itemId,
    title: 'Submission Received',
    message: `Your submission for "${itemId}" has been received and is now pending review.`,
    read: false,
    createdAt: new Date(),
  });

  // Send push notification
  await sendPushNotification(
    publisherId,
    'Submission Received',
    `Your marketplace submission is now pending review.`,
    { itemId, type: 'submission_received' }
  );

  // Send email if available
  const userInfo = await getUserContactInfo(publisherId);
  if (userInfo.email) {
    await sendEmailNotification(
      userInfo.email,
      userInfo.name || 'Publisher',
      publisherId,
      'Marketplace Submission Received',
      `Hi ${userInfo.name || 'there'},\n\nYour submission for "${itemId}" has been received and is now pending review. Our team will review it shortly.\n\nYou'll receive another notification once the review is complete.\n\nThanks for contributing to the Ferni marketplace!`,
      itemId
    );
  }
}

/**
 * Notify publisher that review is complete
 */
async function notifyPublisherReviewComplete(
  publisherId: string,
  itemId: string,
  decision: ReviewDecision
): Promise<void> {
  log.info({ publisherId, itemId, decision }, 'Sending review complete notification');

  const decisionMessages: Record<
    ReviewDecision,
    { title: string; message: string; emoji: string }
  > = {
    approved: {
      title: 'Submission Approved!',
      message: `Great news! Your submission for "${itemId}" has been approved and is now live on the marketplace.`,
      emoji: '🎉',
    },
    rejected: {
      title: 'Submission Not Approved',
      message: `Unfortunately, your submission for "${itemId}" was not approved. Please review the feedback and consider resubmitting.`,
      emoji: '❌',
    },
    changes_requested: {
      title: 'Changes Requested',
      message: `Your submission for "${itemId}" needs some changes before it can be approved. Please review the feedback and resubmit.`,
      emoji: '📝',
    },
  };

  const { title, message, emoji } = decisionMessages[decision];

  // Store in-app notification
  await storeInAppNotification({
    userId: publisherId,
    type: decision === 'changes_requested' ? 'changes_requested' : 'review_complete',
    itemId,
    title: `${emoji} ${title}`,
    message,
    read: false,
    createdAt: new Date(),
    metadata: { decision },
  });

  // Send push notification
  await sendPushNotification(publisherId, title, message, {
    itemId,
    type: 'review_complete',
    decision,
  });

  // Send email if available
  const userInfo = await getUserContactInfo(publisherId);
  if (userInfo.email) {
    const emailBody =
      decision === 'approved'
        ? `Hi ${userInfo.name || 'there'},\n\n${emoji} Great news! Your submission for "${itemId}" has been approved and is now live on the Ferni marketplace.\n\nCongratulations on your contribution!\n\nBest,\nThe Ferni Team`
        : decision === 'changes_requested'
          ? `Hi ${userInfo.name || 'there'},\n\n${emoji} Your submission for "${itemId}" needs a few changes before it can be approved.\n\nPlease log in to view the reviewer feedback and make the necessary updates. Once you've addressed the changes, you can resubmit for review.\n\nBest,\nThe Ferni Team`
          : `Hi ${userInfo.name || 'there'},\n\n${emoji} Unfortunately, your submission for "${itemId}" was not approved at this time.\n\nPlease log in to view the reviewer feedback for more details. You're welcome to address any concerns and resubmit.\n\nBest,\nThe Ferni Team`;

    await sendEmailNotification(
      userInfo.email,
      userInfo.name || 'Publisher',
      publisherId,
      `Marketplace Review: ${title}`,
      emailBody,
      itemId
    );
  }
}

/**
 * Notify reviewer of new assignment
 */
async function notifyReviewerNewAssignment(reviewerId: string, itemId: string): Promise<void> {
  log.info({ reviewerId, itemId }, 'Sending reviewer assignment notification');

  // Store in-app notification
  await storeInAppNotification({
    userId: reviewerId,
    type: 'reviewer_assigned',
    itemId,
    title: 'New Review Assignment',
    message: `You have been assigned to review "${itemId}". Please complete your review at your earliest convenience.`,
    read: false,
    createdAt: new Date(),
  });

  // Send push notification
  await sendPushNotification(
    reviewerId,
    'New Review Assignment',
    `You've been assigned a new marketplace item to review.`,
    { itemId, type: 'reviewer_assigned' }
  );

  // Send email if available
  const userInfo = await getUserContactInfo(reviewerId);
  if (userInfo.email) {
    await sendEmailNotification(
      userInfo.email,
      userInfo.name || 'Reviewer',
      reviewerId,
      'New Marketplace Review Assignment',
      `Hi ${userInfo.name || 'there'},\n\nYou have been assigned to review the marketplace submission "${itemId}".\n\nPlease log in to the admin panel to complete your review.\n\nBest,\nThe Ferni Team`,
      itemId
    );
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Types are already exported inline above
