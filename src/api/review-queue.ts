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
import { getLogger } from '../utils/safe-logger.js';

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
  const docRef = await db.collection(COLLECTION).add({
    ...submission,
    submittedAt: new Date(), // Firestore timestamp
  });

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
  await doc.ref.update({
    status: 'in_review',
    assignedTo: reviewerId,
    reviewerName,
    assignedAt: new Date(),
  });

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
  await doc.ref.update({
    status: newStatus,
    decision,
    reviewerFeedback: feedback,
    reviewedAt: new Date(),
  });

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
// NOTIFICATION STUBS
// ============================================================================

/**
 * Notify publisher that their submission was received
 */
async function notifyPublisherSubmissionReceived(
  publisherId: string,
  itemId: string
): Promise<void> {
  // TODO: Implement email/in-app notification
  log.info({ publisherId, itemId }, '[NOTIFICATION] Publisher submission received');
}

/**
 * Notify publisher that review is complete
 */
async function notifyPublisherReviewComplete(
  publisherId: string,
  itemId: string,
  decision: ReviewDecision
): Promise<void> {
  // TODO: Implement email/in-app notification
  log.info({ publisherId, itemId, decision }, '[NOTIFICATION] Publisher review complete');
}

/**
 * Notify reviewer of new assignment
 */
async function notifyReviewerNewAssignment(reviewerId: string, itemId: string): Promise<void> {
  // TODO: Implement email/in-app notification
  log.info({ reviewerId, itemId }, '[NOTIFICATION] Reviewer new assignment');
}

// ============================================================================
// EXPORTS
// ============================================================================

// Types are already exported inline above
