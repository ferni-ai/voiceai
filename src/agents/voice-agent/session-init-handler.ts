/**
 * Voice Agent Session Init Handler
 *
 * Handles session initialization:
 * - State resets (handoff, catchphrase, conversation)
 * - Session services creation
 * - Trust profiles loading
 * - Superhuman intelligence loading
 * - First taste trial status
 * - User data object creation
 * - A/B testing assignment
 * - Auto-optimizer session start
 *
 * Extracted from voice-agent.ts to reduce file size and improve maintainability.
 *
 * @module voice-agent/session-init-handler
 */

import { log } from '@livekit/agents';
import type { PersonaConfig } from '../../personas/types.js';
import type { SessionServices } from '../../services/index.js';
import type { EnglishAccent } from '../../config/voice-accents.js';
import { createSessionServices } from '../../services/index.js';
import { diag } from '../../services/diagnostic-logger.js';
import {
  checkTrialStatus,
  isEligibleForTrial,
  startTrial,
  type TrialCheckResult,
} from '../../services/first-taste-trial.js';
import { onSessionStart as loadTrustProfiles } from '../../services/trust-systems/index.js';
import { onDeepUnderstandingSessionStart as loadDeepUnderstandingProfiles } from '../../intelligence/index.js';
import {
  createFirestoreSuperhumanStore,
  loadSuperhumanData,
} from '../../services/superhuman-persistence.js';
import { startPeriodicSync } from './periodic-sync-handler.js';
import { getConversationState } from '../../services/conversation-state.js';
import { resetHandoffState, resetMetPersonas } from '../../tools/handoff/index.js';
import { resetCatchphraseTracking } from '../../speech/response-naturalness.js';
import { resetAllConversationState } from '../../conversation/index.js';
import { abTestingService } from '../../tools/ab-testing.js';
import { patternAnalyzer } from '../../tools/pattern-analyzer.js';
import { autoOptimizer } from '../../tools/auto-optimizer.js';

// Session State Management (Single Source of Truth)
import { createSessionStateManager, type SessionStateManager } from '../session/session-state.js';
import { createUserDataProxy } from '../session/user-data-proxy.js';
import type { UserData } from '../shared/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SessionInitContext {
  /** Session ID */
  sessionId: string;
  /** User ID (optional) */
  userId?: string;
  /** User name (optional) */
  userName?: string;
  /** User accent preference */
  userAccent: string;
  /** Persona configuration */
  sessionPersona: PersonaConfig;
  /** Room for frontend notifications */
  room?: {
    localParticipant?: {
      publishData: (data: Uint8Array, opts: { reliable: boolean }) => Promise<void>;
    };
  };
}

export interface SessionInitResult {
  /** Created session services */
  services: SessionServices;
  /** Whether user is returning */
  isReturningUser: boolean;
  /** Trial user status */
  isTrialUser: boolean;
  /** First conversation flag */
  isFirstConversation: boolean;
  /** Full trial status */
  trialStatus: TrialCheckResult | null;
  /** Initialized user data (Proxy to SessionStateManager - single source of truth) */
  userData: UserData;
  /** Session state manager (direct access for new code patterns) */
  sessionStateManager: SessionStateManager;
  /** Cleanup function for periodic sync (call on session end) */
  stopPeriodicSync: (() => void) | null;
}

/**
 * @deprecated Use `UserData` from `shared/types.js` instead.
 * This alias is kept for backward compatibility only.
 */
export type UserDataInit = UserData;

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Initialize session: create services, load user data, check trial status.
 * This is STEP 2-3 of the entry() function.
 */
export async function initializeSession(ctx: SessionInitContext): Promise<SessionInitResult> {
  const { sessionId, userId, userName, userAccent, sessionPersona, room } = ctx;
  const logger = log();

  diag.session('Step 2: Creating session services');

  // ================================================================
  // RESET STATE FOR NEW SESSION
  // ================================================================
  resetHandoffState();
  resetMetPersonas(); // Reset "first meeting" tracking for natural greetings

  // Notify frontend of state reset
  // Note: room may be a RoomAdapter (publishData at top level) or raw Room (publishData on localParticipant)
  if (room) {
    try {
      const data = new TextEncoder().encode(
          JSON.stringify({
            type: 'state_reset',
            activePersona: 'ferni',
            timestamp: Date.now(),
          })
      );
      
      // Try adapter-style first (publishData on room), then raw Room style
      if (typeof (room as { publishData?: unknown }).publishData === 'function') {
        await (room as { publishData: (d: Uint8Array, o: { reliable: boolean }) => Promise<void> }).publishData(data, { reliable: true });
        logger.debug('Notified frontend of state reset (adapter)');
      } else if (room.localParticipant && typeof room.localParticipant.publishData === 'function') {
        await room.localParticipant.publishData(data, { reliable: true });
        logger.debug('Notified frontend of state reset (raw room)');
      }
    } catch (notifyErr) {
      logger.warn({ error: String(notifyErr) }, 'Failed to notify frontend of state reset');
    }
  }

  resetCatchphraseTracking();
  resetAllConversationState();

  // ================================================================
  // CREATE SESSION SERVICES
  // ================================================================
  const services = await createSessionServices(
    sessionId,
    userId,
    undefined, // isReturningUser determined from profile
    sessionPersona.speechCharacteristics,
    sessionPersona.personality?.energy ?? 0.6, // Default energy if personality not loaded
    sessionPersona.id
  );

  // ================================================================
  // LOAD TRUST AND SUPERHUMAN DATA
  // ================================================================
  if (userId) {
    try {
      await loadTrustProfiles(userId);
      diag.session('Trust profiles loaded for user', { userId });
    } catch (trustErr) {
      diag.warn('Failed to load trust profiles (non-fatal)', { error: String(trustErr) });
    }

    // Load deep understanding profiles (silence, rhythm, relational network, etc.)
    try {
      await loadDeepUnderstandingProfiles(userId);
      diag.session('Deep understanding profiles loaded for user', { userId });
    } catch (deepErr) {
      diag.warn('Failed to load deep understanding profiles (non-fatal)', { error: String(deepErr) });
    }

    try {
      const { getFirestoreStore } = await import('../../memory/firestore-store.js');
      const superhumanStore = createFirestoreSuperhumanStore(async () => {
        const store = getFirestoreStore();
        if (!store) throw new Error('Firestore not initialized');
        return store as unknown as {
          collection: (name: string) => {
            doc: (id: string) => {
              get: () => Promise<{ exists: boolean; data: () => unknown }>;
              set: (data: unknown, opts?: { merge?: boolean }) => Promise<void>;
              delete: () => Promise<void>;
            };
          };
        };
      });
      await loadSuperhumanData(userId, sessionId, superhumanStore);
      diag.session('🧠 Superhuman intelligence loaded', { userId });
    } catch (superhumanErr) {
      diag.warn('Superhuman data load failed (non-fatal)', { error: String(superhumanErr) });
    }
  }

  const isReturningUser =
    services.userProfile !== null && (services.userProfile.totalConversations || 0) > 0;

  // ================================================================
  // CHECK TRIAL STATUS
  // ================================================================
  let isTrialUser = false;
  let isFirstConversation = false;
  let trialStatus: TrialCheckResult | null = null;

  if (userId && !isReturningUser) {
    try {
      const eligible = await isEligibleForTrial(userId);
      if (eligible) {
        await startTrial(userId);
        isTrialUser = true;
        isFirstConversation = true;
        trialStatus = await checkTrialStatus(userId, 0);
        diag.session('Started first taste trial for new user', { userId });
      }
    } catch (trialErr) {
      diag.warn('Trial check failed (non-fatal)', { error: String(trialErr) });
    }
  } else if (userId) {
    try {
      trialStatus = await checkTrialStatus(userId, 0);
      if (trialStatus.inTrial) {
        isTrialUser = true;
        diag.session('User is in active trial', {
          userId,
          timeRemainingMs: trialStatus.timeRemainingMs,
        });
      }
    } catch (trialErr) {
      diag.warn('Trial status check failed (non-fatal)', { error: String(trialErr) });
    }
  }

  // ================================================================
  // INITIALIZE CONVERSATION STATE
  // ================================================================
  const conversationState = getConversationState(sessionId, userId || 'default', sessionPersona.id);

  if (userName || services.userProfile?.name) {
    conversationState.setUserName(userName || services.userProfile?.name || '');
  }

  // ================================================================
  // INITIALIZE SESSION STATE MANAGER (Single Source of Truth)
  // All state is managed here; UserData is a proxy to this manager
  // ================================================================
  const relationshipTurns = services.userProfile?.totalConversations
    ? Math.min(services.userProfile.totalConversations * 5, 300)
    : 0;

  const sessionStateManager = createSessionStateManager(sessionId, sessionPersona.id, {
    userId,
    userName: userName || services.userProfile?.name,
    isReturningUser,
    identificationSource: userId ? 'metadata' : 'anonymous',
    services,
    conversationState,
  });

  // Initialize bundle state with relationship turns
  sessionStateManager.updateBundleState({
    relationshipTurns,
    currentMode: 'listening',
    storiesToldThisSession: [],
  });

  diag.session('Session state manager initialized', {
    sessionId,
    personaId: sessionPersona.id,
    hasUserId: !!userId,
    isReturning: isReturningUser,
  });

  // ================================================================
  // CREATE USER DATA PROXY (Single Source of Truth)
  // userData now delegates to sessionStateManager for all reads/writes
  // Direct fields (services, conversationState, trial) stored on proxy
  // ================================================================
  const userData = createUserDataProxy(sessionStateManager, {
    // Service references (stored directly, not in state manager)
    services,
    conversationState,

    // Voice preferences
    preferredAccent: userAccent as EnglishAccent,

    // Trial state (stored directly for rapid access)
    isTrialUser,
    isFirstConversation,
    trialStatus: trialStatus
      ? {
          inTrial: trialStatus.inTrial,
          timeRemainingMs: trialStatus.timeRemainingMs ?? 0,
          approachingEnd: trialStatus.approachingEnd,
          trialEnded: trialStatus.trialEnded,
        }
      : undefined,
    hasSpokenTrialEndPrompt: false,
  });

  diag.session('UserData proxy created (single source of truth)', {
    sessionId,
    userId: userId || 'default',
    agentId: sessionPersona.id,
    proxyEnabled: true,
  });

  // ================================================================
  // A/B TESTING + AUTO-OPTIMIZATION
  // ================================================================
  const activeExperiments = abTestingService.getActiveExperiments();
  for (const experiment of activeExperiments) {
    const assignment = abTestingService.assignUser(userId || sessionId, experiment.id);
    if (assignment) {
      diag.entry('User assigned to experiment', {
        experimentId: experiment.id,
        variantId: assignment.variantId,
        userId: userId || sessionId,
      });
    }
  }

  patternAnalyzer.startSession(sessionId, userId || 'anonymous', sessionPersona.id);
  autoOptimizer.startSession(sessionId, userId || 'anonymous', sessionPersona.id);
  diag.entry('Optimization session started', { sessionId, personaId: sessionPersona.id });

  // ================================================================
  // START PERIODIC SYNC FOR DEEP UNDERSTANDING
  // Ensures insights are saved during long sessions (every 5 minutes)
  // ================================================================
  let stopSync: (() => void) | null = null;
  if (userId) {
    stopSync = startPeriodicSync(sessionId, userId);
    diag.session('🔄 Periodic deep understanding sync started', { sessionId, userId });
  }

  logger.info({ sessionId, userId, isReturningUser, isTrialUser }, 'Session initialized');

  return {
    services,
    isReturningUser,
    isTrialUser,
    isFirstConversation,
    trialStatus,
    userData,
    sessionStateManager,
    stopPeriodicSync: stopSync,
  };
}

export default initializeSession;
