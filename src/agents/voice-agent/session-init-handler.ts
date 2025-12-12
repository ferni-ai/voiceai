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
import {
  createFirestoreSuperhumanStore,
  loadSuperhumanData,
} from '../../services/superhuman-persistence.js';
import { getConversationState } from '../../services/conversation-state.js';
import { resetHandoffState, resetMetPersonas } from '../../tools/handoff/index.js';
import { resetCatchphraseTracking } from '../../speech/response-naturalness.js';
import { resetAllConversationState } from '../../conversation/index.js';
import { abTestingService } from '../../tools/ab-testing.js';
import { patternAnalyzer } from '../../tools/pattern-analyzer.js';
import { autoOptimizer } from '../../tools/auto-optimizer.js';

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
  /** Initialized user data object */
  userData: UserDataInit;
}

/** User data initialized by this handler - compatible with UserData from shared/types */
export interface UserDataInit {
  name?: string;
  userId?: string;
  isReturningUser: boolean;
  services: SessionServices;
  turnCount: number;
  preferredAccent?: EnglishAccent;
  bundleRuntimeState: {
    relationshipTurns: number;
    currentMode: 'listening' | 'active';
    storiesToldThisSession: string[];
  };
  conversationState: ReturnType<typeof getConversationState>;
  isTrialUser: boolean;
  isFirstConversation: boolean;
  trialStatus?: {
    inTrial: boolean;
    timeRemainingMs: number;
    approachingEnd: boolean;
    trialEnded: boolean;
  };
  hasSpokenTrialEndPrompt: boolean;
}

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
  if (room?.localParticipant) {
    try {
      await room.localParticipant.publishData(
        new TextEncoder().encode(
          JSON.stringify({
            type: 'state_reset',
            activePersona: 'ferni',
            timestamp: Date.now(),
          })
        ),
        { reliable: true }
      );
      logger.debug('Notified frontend of state reset');
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
    sessionPersona.personality.energy,
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
  // INITIALIZE USER DATA
  // ================================================================
  const conversationState = getConversationState(sessionId, userId || 'default', sessionPersona.id);

  if (userName || services.userProfile?.name) {
    conversationState.setUserName(userName || services.userProfile?.name || '');
  }

  const userData: UserDataInit = {
    name: userName || services.userProfile?.name,
    userId,
    isReturningUser,
    services,
    turnCount: 0,
    preferredAccent: userAccent as EnglishAccent,
    bundleRuntimeState: {
      relationshipTurns: services.userProfile?.totalConversations
        ? Math.min(services.userProfile.totalConversations * 5, 300)
        : 0,
      currentMode: 'listening',
      storiesToldThisSession: [],
    },
    conversationState,
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
  };

  diag.session('Conversation state initialized', {
    sessionId,
    userId: userId || 'default',
    agentId: sessionPersona.id,
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

  logger.info({ sessionId, userId, isReturningUser, isTrialUser }, 'Session initialized');

  return {
    services,
    isReturningUser,
    isTrialUser,
    isFirstConversation,
    trialStatus,
    userData,
  };
}

export default initializeSession;
