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
import { resetHandoffState, resetMetPersonas, setCurrentAgent } from '../../tools/handoff/index.js';
import type { AgentId } from '../../services/agent-bus.js';
import { resetCatchphraseTracking } from '../../speech/response-naturalness.js';
import { resetAllConversationState } from '../../conversation/index.js';
import { abTestingService } from '../../tools/ab-testing.js';
import { patternAnalyzer } from '../../tools/pattern-analyzer.js';
import { autoOptimizer } from '../../tools/auto-optimizer.js';

// Capability learning - load patterns on startup
import { loadPatterns as loadCapabilityPatterns } from '../../intelligence/capability-learning.js';
// Safe fire-and-forget pattern for non-critical async operations
import { fireAndForget } from '../../utils/safe-fire-and-forget.js';

// Embedding cache precomputation for fast semantic search
import { precomputeUserMemoryEmbeddings } from '../../memory/embedding-cache.js';

// FinOps cost tracking
import { finops } from '../../services/observability/finops.js';

// Note: LLM content pre-warming now happens in token.ts (before session starts)

// Tool Orchestrator for dynamic tool refresh
import {
  isOrchestratorInitialized,
  refreshToolsForContext,
} from '../../tools/orchestrator/index.js';

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
  /**
   * Refreshed tools from Tool Orchestrator (if USE_TOOL_ORCHESTRATOR=true)
   * These should replace the initial placeholder tools now that we have real user context
   */
  refreshedTools?: Record<string, unknown>;
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
  const initStart = Date.now();

  // Import session metrics for phase tracking
  let recordPhase: ((sessionId: string, phase: string, durationMs: number) => void) | null = null;
  try {
    const metrics = await import('../shared/session-metrics.js');
    recordPhase = metrics.recordPhase;
  } catch {
    // Metrics module not available - continue without tracking
  }

  diag.session('Step 2: Creating session services');

  // ================================================================
  // RESET STATE FOR NEW SESSION
  // ================================================================
  resetHandoffState();
  resetMetPersonas(); // Reset "first meeting" tracking for natural greetings

  // BUG FIX: Set the current agent to the requested persona, not default 'ferni'
  // This ensures handoff state starts with the correct persona (e.g., Peter if user selected Peter)
  setCurrentAgent(sessionPersona.id as AgentId);

  // Notify frontend of state reset
  // Note: room may be a RoomAdapter (publishData at top level) or raw Room (publishData on localParticipant)
  if (room) {
    try {
      const data = new TextEncoder().encode(
        JSON.stringify({
          type: 'state_reset',
          // BUG FIX: Use actual session persona instead of hardcoded 'ferni'
          // This fixes the bug where selecting Peter would show Peter's voice but Ferni's UI
          activePersona: sessionPersona.id,
          timestamp: Date.now(),
        })
      );

      // Try adapter-style first (publishData on room), then raw Room style
      if (typeof (room as { publishData?: unknown }).publishData === 'function') {
        await (
          room as { publishData: (d: Uint8Array, o: { reliable: boolean }) => Promise<void> }
        ).publishData(data, { reliable: true });
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
  // START FINOPS TRACKING
  // ================================================================
  const subscriptionTier = 'free'; // Will be updated after profile load
  finops.startSession({
    sessionId,
    userId,
    tier: subscriptionTier,
  });

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
  // ⚡ OPTIMIZATION: BACKGROUND PROFILE LOADING (Non-blocking!)
  // These profiles enhance the experience but are NOT needed for the greeting.
  // Load them in background so user hears Ferni immediately.
  // ================================================================
  if (userId) {
    const profileLoadStart = Date.now();

    // Fire-and-forget: All profile loads run in background
    // They'll be ready by the time context building needs them (after first user turn)
    fireAndForget(async () => {
      await Promise.all([
        // Trust profiles
        loadTrustProfiles(userId)
          .then(() => diag.session('Trust profiles loaded for user', { userId }))
          .catch((trustErr) =>
            diag.warn('Failed to load trust profiles (non-fatal)', { error: String(trustErr) })
          ),

        // Deep understanding profiles (silence, rhythm, relational network, etc.)
        loadDeepUnderstandingProfiles(userId)
          .then(() => diag.session('Deep understanding profiles loaded for user', { userId }))
          .catch((deepErr) =>
            diag.warn('Failed to load deep understanding profiles (non-fatal)', {
              error: String(deepErr),
            })
          ),

        // Superhuman intelligence data
        (async () => {
          try {
            // Use firebase-admin directly (same pattern as humanization/persistence.ts)
            const admin = await import('firebase-admin');

            // Initialize Firebase Admin if not already done
            if (admin.apps.length === 0) {
              admin.initializeApp();
            }
            const db = admin.firestore();

            // Cast to the expected interface - firebase-admin Firestore is compatible
            type FirestoreInterface = {
              collection: (name: string) => {
                doc: (id: string) => {
                  get: () => Promise<{ exists: boolean; data: () => unknown }>;
                  set: (data: unknown, opts?: { merge?: boolean }) => Promise<void>;
                  delete: () => Promise<void>;
                };
              };
            };

            const superhumanStore = createFirestoreSuperhumanStore(
              async () => db as unknown as FirestoreInterface
            );
            await loadSuperhumanData(userId, sessionId, superhumanStore);
            diag.session('🧠 Superhuman intelligence loaded', { userId });
          } catch (superhumanErr) {
            diag.warn('Superhuman data load failed (non-fatal)', {
              error: String(superhumanErr),
            });
          }
        })(),

        // Predictive Intelligence - initialize pattern tracking for predictions
        (async () => {
          try {
            const { initializePredictiveIntelligence } =
              await import('../integrations/predictive-intelligence-integration.js');
            initializePredictiveIntelligence(sessionId, userId);
            diag.session('🔮 Predictive intelligence initialized', { userId });
          } catch (predictiveErr) {
            diag.warn('Predictive intelligence init failed (non-fatal)', {
              error: String(predictiveErr),
            });
          }
        })(),

        // Capability Learning - load community patterns for domain fluency optimization
        (async () => {
          try {
            await loadCapabilityPatterns();
            diag.session('📚 Capability patterns loaded', { userId });
          } catch (capErr) {
            diag.warn('Capability patterns load failed (non-fatal)', {
              error: String(capErr),
            });
          }
        })(),

        // Phase 5: Anticipatory Intelligence - load user's trigger profile
        (async () => {
          try {
            const { loadUserTriggerContext } =
              await import('../../intelligence/triggers/voice-agent-integration.js');
            const triggerContext = await loadUserTriggerContext(userId, sessionId);

            // Store in session state for access during transcript processing
            // This will be set on userData after session state manager is created
            (globalThis as Record<string, unknown>)[`_triggerContext_${sessionId}`] = {
              anticipatoryIntelligence: triggerContext.profile.anticipatoryIntelligence,
              triggerProfile: triggerContext.profile,
            };

            diag.session('🔮 Anticipatory intelligence loaded', {
              userId,
              learnedSignals: triggerContext.profile.anticipatoryIntelligence?.signals?.length ?? 0,
              recentEvents:
                triggerContext.profile.anticipatoryIntelligence?.recentEvents?.length ?? 0,
            });
          } catch (triggerErr) {
            diag.warn('Anticipatory intelligence load failed (non-fatal)', {
              error: String(triggerErr),
            });
          }
        })(),

        // Phase 6: Life Context Synthesis - aggregate cross-domain life context
        (async () => {
          try {
            const { aggregateLifeContext, populateSynthesisTriggers, summarizeLifeContext } =
              await import('../../intelligence/triggers/index.js');

            const lifeContext = await aggregateLifeContext(userId, {
              analysisWindowDays: 7,
              minConfidence: 0.3,
            });

            // Populate synthesis triggers
            const contextWithTriggers = populateSynthesisTriggers(lifeContext);

            // Store for access during context building
            (globalThis as Record<string, unknown>)[`_lifeContext_${sessionId}`] =
              contextWithTriggers;

            diag.session('🌍 Life context synthesized', {
              userId,
              loadScore: contextWithTriggers.overallLoadScore.toFixed(2),
              wellbeingScore: contextWithTriggers.wellbeingScore.toFixed(2),
              domainsWithData: contextWithTriggers.metadata.domainsWithData.length,
              patterns: contextWithTriggers.patterns.length,
              triggers: contextWithTriggers.synthesizedTriggers.length,
              summary: summarizeLifeContext(contextWithTriggers),
            });
          } catch (lifeContextErr) {
            diag.warn('Life context synthesis failed (non-fatal)', {
              error: String(lifeContextErr),
            });
          }
        })(),

        // Phase 7: Embedding Cache Precomputation - warm cache for fast semantic search
        (async () => {
          try {
            // Build memory content from user profile (already loaded)
            const memoryContent: Array<{ content: string }> = [];
            const priorityKeywords: string[] = [];

            const profile = services.userProfile;
            if (profile) {
              // User's name as priority keyword
              if (profile.name) {
                priorityKeywords.push(profile.name);
              }

              // Preferences as searchable content
              if (profile.preferences) {
                for (const [key, value] of Object.entries(profile.preferences)) {
                  const content = `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`;
                  if (content.length >= 10) {
                    memoryContent.push({ content });
                  }
                }
              }

              // Facts/memories if available on profile
              const profileAny = profile as unknown as Record<string, unknown>;
              const facts = profileAny.facts || profileAny.memories;
              if (facts && typeof facts === 'object') {
                for (const value of Object.values(facts as Record<string, unknown>)) {
                  if (typeof value === 'string' && value.length >= 10) {
                    memoryContent.push({ content: value });
                  }
                }
              }
            }

            if (memoryContent.length > 0 || priorityKeywords.length > 0) {
              precomputeUserMemoryEmbeddings(memoryContent, {
                limit: 50,
                priorityKeywords,
              });

              diag.session('🔥 Embedding cache precomputation started', {
                userId,
                memoryCount: memoryContent.length,
                priorityKeywords: priorityKeywords.length,
              });
            }
          } catch (embeddingErr) {
            diag.warn('Embedding precomputation failed (non-fatal)', {
              error: String(embeddingErr),
            });
          }
        })(),
      ]);

      const profileDuration = Date.now() - profileLoadStart;
      logger.info({ durationMs: profileDuration }, '⚡ Background profiles loaded');
      recordPhase?.(sessionId, 'profile_loading', profileDuration);
    }, 'session-init-profile-loading');

    // Don't wait - continue to greeting immediately!
    diag.session('🚀 Profile loading started in background (non-blocking)');
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
  // APPLY LOADED TRIGGER CONTEXT (Phase 5: Anticipatory Intelligence)
  // ================================================================
  const triggerContextKey = `_triggerContext_${sessionId}`;
  const loadedTriggerContext = (globalThis as Record<string, unknown>)[triggerContextKey] as
    | {
        anticipatoryIntelligence: typeof userData.anticipatoryIntelligence;
        triggerProfile: typeof userData.triggerProfile;
      }
    | undefined;

  if (loadedTriggerContext) {
    userData.anticipatoryIntelligence = loadedTriggerContext.anticipatoryIntelligence;
    userData.triggerProfile = loadedTriggerContext.triggerProfile;
    userData.anticipatoryFiringsThisSession = 0;
    userData.lastAnticipatoryFiringAt = 0;
    // Clean up global storage
    delete (globalThis as Record<string, unknown>)[triggerContextKey];

    diag.session('Applied anticipatory intelligence to userData', {
      sessionId,
      hasIntelligence: !!loadedTriggerContext.anticipatoryIntelligence,
      hasProfile: !!loadedTriggerContext.triggerProfile,
    });
  }

  // ================================================================
  // APPLY LOADED LIFE CONTEXT (Phase 6: Cross-Domain Synthesis)
  // ================================================================
  const lifeContextKey = `_lifeContext_${sessionId}`;
  const loadedLifeContext = (globalThis as Record<string, unknown>)[lifeContextKey] as
    | import('../../intelligence/triggers/index.js').LifeContextSnapshot
    | undefined;

  if (loadedLifeContext) {
    userData.lifeContextSnapshot = loadedLifeContext;
    // Clean up global storage
    delete (globalThis as Record<string, unknown>)[lifeContextKey];

    diag.session('Applied life context to userData', {
      sessionId,
      loadScore: loadedLifeContext.overallLoadScore.toFixed(2),
      wellbeingScore: loadedLifeContext.wellbeingScore.toFixed(2),
      dataQuality: loadedLifeContext.metadata.dataQuality,
    });
  }

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

  // ================================================================
  // TOOL REFRESH WITH REAL USER CONTEXT
  // Now that we have real userId, userProfile, and subscription info,
  // refresh tools to ensure correct filtering (handoffs, unlocks, etc.)
  // ================================================================
  let refreshedTools: Record<string, unknown> | undefined;

  if (isOrchestratorInitialized()) {
    const subscriptionTier = services.userProfile?.subscription?.tier || 'free';
    try {
      // Build context update with voice emotion if available
      // (usually undefined at session start, but wires the path for mid-session refreshes)
      const contextUpdate = userData?.voiceEmotion
        ? {
            voiceEmotion: {
              primary: userData.voiceEmotion.primary || 'neutral',
              valence: userData.voiceEmotion.valence ?? 0,
              arousal: userData.voiceEmotion.arousal ?? 0.5,
              stressLevel: userData.voiceEmotion.stressLevel ?? 0,
              anxietyMarkers: userData.voiceEmotion.anxietyMarkers ?? false,
            },
          }
        : undefined;

      const refreshResult = await refreshToolsForContext({
        personaId: sessionPersona.id,
        userId: userId || 'anonymous',
        userProfile: services.userProfile,
        subscriptionTier,
        newTranscript: '', // No transcript yet at session start
        contextUpdate, // Pass voice emotion for Better Than Human features
      });

      if (refreshResult.shouldRefresh && refreshResult.tools) {
        refreshedTools = refreshResult.tools;
        diag.session('🔄 Tool Orchestrator: Tools refreshed with real user context', {
          toolCount: Object.keys(refreshResult.tools).length,
          subscriptionTier,
          hasUserProfile: !!services.userProfile,
        });
      } else {
        diag.session('Tool Orchestrator: No tool refresh needed at session start');
      }
    } catch (refreshErr) {
      diag.warn('Tool refresh failed (non-fatal, using initial tools)', {
        error: String(refreshErr),
      });
    }
  }

  return {
    services,
    isReturningUser,
    isTrialUser,
    isFirstConversation,
    trialStatus,
    userData,
    sessionStateManager,
    stopPeriodicSync: stopSync,
    refreshedTools,
  };
}

export default initializeSession;
