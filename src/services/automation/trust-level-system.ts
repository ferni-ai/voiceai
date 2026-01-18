/**
 * Trust Level System - Autonomous Action Permission Management
 *
 * This system determines when Ferni can take actions autonomously vs when to ask.
 * Core to the AGI-like experience: actions happen automatically once user trusts them.
 *
 * Trust Levels:
 * - NEW (0): Always ask for approval - user hasn't done this action type before
 * - ROUTINE (1): Ask once per session - user has approved similar actions before
 * - TRUSTED (2): Just do it - user has consistently approved this action type
 *
 * Trust is earned per-action-type and per-user, tracked in Firestore.
 *
 * Events:
 * - action_created: Fired when a pending action is created
 * - action_resolved: Fired when a pending action is approved/rejected
 * - action_executed: Fired when an action is marked as executed
 *
 * @module services/automation/trust-level-system
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'TrustLevelSystem' });

// ============================================================================
// Event Emitter
// ============================================================================

/**
 * Event emitter for action lifecycle events
 *
 * Events:
 * - action_created: { action: PendingAction }
 * - action_resolved: { action: PendingAction, approved: boolean }
 * - action_executed: { userId: string, actionId: string }
 */
export const actionEvents = new EventEmitter();

export interface ActionCreatedEvent {
  action: PendingAction;
}

export interface ActionResolvedEvent {
  action: PendingAction;
  approved: boolean;
}

export interface ActionExecutedEvent {
  userId: string;
  actionId: string;
}

// ============================================================================
// Types
// ============================================================================

export type TrustLevel = 'new' | 'routine' | 'trusted';

export type ActionCategory =
  | 'messaging' // Send SMS, email on behalf
  | 'calendar' // Create/modify calendar events
  | 'booking' // Restaurant, ride, etc. reservations
  | 'ordering' // Grocery, food delivery
  | 'payment' // Financial transactions
  | 'notification' // Send push notifications
  | 'smart_home' // Control lights, thermostat, etc.
  | 'music' // Play music, create playlists
  | 'reminder' // Set reminders
  | 'task' // Create tasks/todos;

export interface ActionType {
  category: ActionCategory;
  subtype: string; // e.g., "send_sms", "book_restaurant", "order_groceries"
  description: string;
  requiresConfirmation: boolean; // Some actions ALWAYS require confirmation (payments)
  maxTrustLevel: TrustLevel; // Maximum trust level allowed for this action type
}

export interface ActionTrustProfile {
  userId: string;
  actionType: string;
  category: ActionCategory;
  trustLevel: TrustLevel;
  approvalCount: number; // Number of times user approved
  rejectionCount: number; // Number of times user rejected
  lastApprovedAt?: string;
  lastRejectedAt?: string;
  sessionApproved: boolean; // Approved in current session
  createdAt: string;
  updatedAt: string;
}

export interface PendingAction {
  id: string;
  userId: string;
  actionType: string;
  category: ActionCategory;
  description: string;
  preview: ActionPreview;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'executed';
  createdAt: string;
  expiresAt: string;
  metadata: Record<string, unknown>;
}

export interface ActionPreview {
  title: string;
  summary: string;
  details: string[];
  canUndo: boolean;
  estimatedCost?: number;
  affectedParties?: string[];
}

export interface ActionResult {
  success: boolean;
  actionId: string;
  executed: boolean;
  requiresApproval: boolean;
  pendingActionId?: string;
  preview?: ActionPreview;
  error?: string;
}

// ============================================================================
// Action Type Definitions
// ============================================================================

export const ACTION_TYPES: Record<string, ActionType> = {
  // Messaging
  send_sms: {
    category: 'messaging',
    subtype: 'send_sms',
    description: 'Send a text message on your behalf',
    requiresConfirmation: false,
    maxTrustLevel: 'trusted',
  },
  send_email: {
    category: 'messaging',
    subtype: 'send_email',
    description: 'Send an email on your behalf',
    requiresConfirmation: false,
    maxTrustLevel: 'trusted',
  },

  // Calendar
  create_event: {
    category: 'calendar',
    subtype: 'create_event',
    description: 'Create a calendar event',
    requiresConfirmation: false,
    maxTrustLevel: 'trusted',
  },
  modify_event: {
    category: 'calendar',
    subtype: 'modify_event',
    description: 'Modify an existing calendar event',
    requiresConfirmation: false,
    maxTrustLevel: 'routine', // Can't fully auto-modify events
  },

  // Booking
  book_restaurant: {
    category: 'booking',
    subtype: 'book_restaurant',
    description: 'Book a restaurant reservation',
    requiresConfirmation: false,
    maxTrustLevel: 'trusted',
  },
  book_ride: {
    category: 'booking',
    subtype: 'book_ride',
    description: 'Book a ride (Uber/Lyft)',
    requiresConfirmation: false,
    maxTrustLevel: 'routine', // Always confirm ride bookings
  },

  // Ordering
  order_groceries: {
    category: 'ordering',
    subtype: 'order_groceries',
    description: 'Order groceries for delivery',
    requiresConfirmation: true, // Always requires confirmation
    maxTrustLevel: 'routine',
  },
  order_food: {
    category: 'ordering',
    subtype: 'order_food',
    description: 'Order food delivery',
    requiresConfirmation: true, // Always requires confirmation
    maxTrustLevel: 'routine',
  },

  // Payment - ALWAYS requires confirmation
  send_payment: {
    category: 'payment',
    subtype: 'send_payment',
    description: 'Send a payment',
    requiresConfirmation: true, // ALWAYS
    maxTrustLevel: 'new', // Never auto-execute payments
  },

  // Smart Home
  control_lights: {
    category: 'smart_home',
    subtype: 'control_lights',
    description: 'Control lights',
    requiresConfirmation: false,
    maxTrustLevel: 'trusted',
  },
  control_thermostat: {
    category: 'smart_home',
    subtype: 'control_thermostat',
    description: 'Adjust thermostat',
    requiresConfirmation: false,
    maxTrustLevel: 'trusted',
  },

  // Music
  play_music: {
    category: 'music',
    subtype: 'play_music',
    description: 'Play music',
    requiresConfirmation: false,
    maxTrustLevel: 'trusted',
  },
  create_playlist: {
    category: 'music',
    subtype: 'create_playlist',
    description: 'Create a playlist',
    requiresConfirmation: false,
    maxTrustLevel: 'trusted',
  },

  // Reminders & Tasks
  set_reminder: {
    category: 'reminder',
    subtype: 'set_reminder',
    description: 'Set a reminder',
    requiresConfirmation: false,
    maxTrustLevel: 'trusted',
  },
  create_task: {
    category: 'task',
    subtype: 'create_task',
    description: 'Create a task/todo',
    requiresConfirmation: false,
    maxTrustLevel: 'trusted',
  },
};

// ============================================================================
// Trust Level Logic
// ============================================================================

/**
 * Calculate trust level based on approval history
 */
function calculateTrustLevel(approvalCount: number, rejectionCount: number): TrustLevel {
  // Need at least 3 approvals with < 20% rejection rate for routine
  if (approvalCount >= 3 && rejectionCount / Math.max(approvalCount, 1) < 0.2) {
    // Need at least 10 approvals with < 10% rejection rate for trusted
    if (approvalCount >= 10 && rejectionCount / approvalCount < 0.1) {
      return 'trusted';
    }
    return 'routine';
  }
  return 'new';
}

/**
 * Get effective trust level considering action type limits
 */
function getEffectiveTrustLevel(
  userTrustLevel: TrustLevel,
  actionType: ActionType
): TrustLevel {
  const trustOrder: TrustLevel[] = ['new', 'routine', 'trusted'];
  const userIndex = trustOrder.indexOf(userTrustLevel);
  const maxIndex = trustOrder.indexOf(actionType.maxTrustLevel);
  return trustOrder[Math.min(userIndex, maxIndex)];
}

// ============================================================================
// Trust Profile Management
// ============================================================================

/**
 * Get user's trust profile for an action type
 */
export async function getTrustProfile(
  userId: string,
  actionType: string
): Promise<ActionTrustProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('action_trust')
      .doc(actionType)
      .get();

    if (!doc.exists) return null;
    return doc.data() as ActionTrustProfile;
  } catch (error) {
    log.error({ error: String(error), userId, actionType }, 'Failed to get trust profile');
    return null;
  }
}

/**
 * Get all trust profiles for a user
 */
export async function getAllTrustProfiles(userId: string): Promise<ActionTrustProfile[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('action_trust')
      .get();

    return snapshot.docs.map((doc) => doc.data() as ActionTrustProfile);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get trust profiles');
    return [];
  }
}

/**
 * Update trust profile after user approval/rejection
 */
export async function updateTrustProfile(
  userId: string,
  actionType: string,
  approved: boolean
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  const actionDef = ACTION_TYPES[actionType];
  if (!actionDef) {
    log.warn({ actionType }, 'Unknown action type');
    return;
  }

  try {
    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('action_trust')
      .doc(actionType);

    const doc = await docRef.get();
    const now = new Date().toISOString();

    if (doc.exists) {
      const profile = doc.data() as ActionTrustProfile;
      const newApprovalCount = profile.approvalCount + (approved ? 1 : 0);
      const newRejectionCount = profile.rejectionCount + (approved ? 0 : 1);
      const newTrustLevel = calculateTrustLevel(newApprovalCount, newRejectionCount);

      await docRef.update({
        approvalCount: newApprovalCount,
        rejectionCount: newRejectionCount,
        trustLevel: newTrustLevel,
        lastApprovedAt: approved ? now : profile.lastApprovedAt,
        lastRejectedAt: approved ? profile.lastRejectedAt : now,
        sessionApproved: approved,
        updatedAt: now,
      });

      log.info(
        { userId, actionType, approved, newTrustLevel },
        'Updated trust profile'
      );
    } else {
      // Create new profile
      const newProfile: ActionTrustProfile = {
        userId,
        actionType,
        category: actionDef.category,
        trustLevel: approved ? 'new' : 'new', // Start at new
        approvalCount: approved ? 1 : 0,
        rejectionCount: approved ? 0 : 1,
        lastApprovedAt: approved ? now : undefined,
        lastRejectedAt: approved ? undefined : now,
        sessionApproved: approved,
        createdAt: now,
        updatedAt: now,
      };

      await docRef.set(newProfile);
      log.info({ userId, actionType }, 'Created trust profile');
    }
  } catch (error) {
    log.error({ error: String(error), userId, actionType }, 'Failed to update trust profile');
  }
}

// ============================================================================
// Pending Actions Management
// ============================================================================

const PENDING_ACTION_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Create a pending action for user approval
 */
export async function createPendingAction(
  userId: string,
  actionType: string,
  preview: ActionPreview,
  metadata: Record<string, unknown> = {}
): Promise<PendingAction> {
  const db = getFirestoreDb();
  const actionDef = ACTION_TYPES[actionType];

  const pendingAction: PendingAction = {
    id: `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    userId,
    actionType,
    category: actionDef?.category || 'task',
    description: actionDef?.description || 'Unknown action',
    preview,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + PENDING_ACTION_EXPIRY_MS).toISOString(),
    metadata,
  };

  if (db) {
    try {
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('pending_actions')
        .doc(pendingAction.id)
        .set(pendingAction);
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to store pending action');
    }
  }

  log.info({ pendingActionId: pendingAction.id, userId, actionType }, 'Created pending action');
  
  // Emit event for action dispatcher to pick up
  actionEvents.emit('action_created', { action: pendingAction } as ActionCreatedEvent);
  
  return pendingAction;
}

/**
 * Get pending actions for a user
 */
export async function getPendingActions(userId: string): Promise<PendingAction[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const now = new Date().toISOString();
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('pending_actions')
      .where('status', '==', 'pending')
      .where('expiresAt', '>', now)
      .orderBy('expiresAt', 'asc')
      .limit(10)
      .get();

    return snapshot.docs.map((doc) => doc.data() as PendingAction);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get pending actions');
    return [];
  }
}

/**
 * Approve or reject a pending action
 */
export async function resolvePendingAction(
  userId: string,
  pendingActionId: string,
  approved: boolean
): Promise<PendingAction | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('pending_actions')
      .doc(pendingActionId);

    const doc = await docRef.get();
    if (!doc.exists) return null;

    const pendingAction = doc.data() as PendingAction;

    // Update status
    await docRef.update({
      status: approved ? 'approved' : 'rejected',
    });

    // Update trust profile
    await updateTrustProfile(userId, pendingAction.actionType, approved);

    log.info({ pendingActionId, userId, approved }, 'Resolved pending action');

    const resolvedAction = { ...pendingAction, status: approved ? 'approved' : 'rejected' } as PendingAction;
    
    // Emit event for action dispatcher to pick up
    actionEvents.emit('action_resolved', { action: resolvedAction, approved } as ActionResolvedEvent);
    
    return resolvedAction;
  } catch (error) {
    log.error({ error: String(error), pendingActionId }, 'Failed to resolve pending action');
    return null;
  }
}

// ============================================================================
// Core Decision Logic
// ============================================================================

/**
 * Check if an action can be executed autonomously
 * Returns whether to proceed, require approval, or show preview
 */
export async function checkActionPermission(
  userId: string,
  actionType: string,
  preview: ActionPreview
): Promise<ActionResult> {
  const actionDef = ACTION_TYPES[actionType];
  if (!actionDef) {
    return {
      success: false,
      actionId: '',
      executed: false,
      requiresApproval: true,
      error: `Unknown action type: ${actionType}`,
    };
  }

  // Actions that ALWAYS require confirmation
  if (actionDef.requiresConfirmation) {
    const pendingAction = await createPendingAction(userId, actionType, preview);
    return {
      success: true,
      actionId: pendingAction.id,
      executed: false,
      requiresApproval: true,
      pendingActionId: pendingAction.id,
      preview,
    };
  }

  // Get user's trust profile for this action type
  const trustProfile = await getTrustProfile(userId, actionType);
  const userTrustLevel = trustProfile?.trustLevel || 'new';
  const effectiveTrustLevel = getEffectiveTrustLevel(userTrustLevel, actionDef);

  // Determine if we can proceed
  switch (effectiveTrustLevel) {
    case 'trusted':
      // Just do it - user has given us trust for this action
      return {
        success: true,
        actionId: `auto_${Date.now()}`,
        executed: false, // Caller will execute
        requiresApproval: false,
      };

    case 'routine':
      // Check if already approved in this session
      if (trustProfile?.sessionApproved) {
        return {
          success: true,
          actionId: `session_${Date.now()}`,
          executed: false,
          requiresApproval: false,
        };
      }
      // Fall through to require approval
      break;

    case 'new':
    default:
      // Always require approval for new actions
      break;
  }

  // Require approval
  const pendingAction = await createPendingAction(userId, actionType, preview);
  return {
    success: true,
    actionId: pendingAction.id,
    executed: false,
    requiresApproval: true,
    pendingActionId: pendingAction.id,
    preview,
  };
}

/**
 * Mark a pending action as executed
 */
export async function markActionExecuted(
  userId: string,
  pendingActionId: string
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('pending_actions')
      .doc(pendingActionId)
      .update({
        status: 'executed',
      });
    
    // Emit event
    actionEvents.emit('action_executed', { userId, actionId: pendingActionId } as ActionExecutedEvent);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to mark action executed');
  }
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Reset session approvals (call at session end)
 */
export async function resetSessionApprovals(userId: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('action_trust')
      .where('sessionApproved', '==', true)
      .get();

    const batch = db.batch();
    for (const doc of snapshot.docs) {
      batch.update(doc.ref, { sessionApproved: false });
    }

    await batch.commit();
    log.debug({ userId, count: snapshot.docs.length }, 'Reset session approvals');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to reset session approvals');
  }
}

// ============================================================================
// Exports
// ============================================================================

export const trustLevelSystem = {
  checkActionPermission,
  getTrustProfile,
  getAllTrustProfiles,
  updateTrustProfile,
  getPendingActions,
  resolvePendingAction,
  markActionExecuted,
  resetSessionApprovals,
  createPendingAction,
  ACTION_TYPES,
  // Event emitter for action lifecycle events
  events: actionEvents,
};

export default trustLevelSystem;
