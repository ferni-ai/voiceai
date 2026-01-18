/**
 * Voice Agent Entry Function (Fully Integrated)
 *
 * This is the main entry point for voice agent sessions in the lightweight child process.
 * It uses all the extracted handlers from voice-agent/ for full feature parity with voice-agent.ts.
 *
 * ARCHITECTURE:
 * - Phase modules in ./voice-agent/phases/ handle discrete initialization steps
 * - This file orchestrates the phases and manages the session lifecycle
 *
 * INTEGRATIONS:
 * - Session services (user profile, trial status, trust systems)
 * - User identification (voice ID, metadata)
 * - Music player & DJ booth
 * - Handoff system (team member switching)
 * - Data channel handler (frontend communication)
 * - Transcript handler (emotion detection, game detection, feedback)
 * - Session state handlers (silence detection, engagement)
 * - Tool tracking & orchestration
 * - Voice humanization (prosody, disfluencies, emotional arc)
 * - Frontend publisher (real-time UI updates)
 * - Cameo system (team member pop-ins)
 * - Bundle runtime (rich persona content)
 */

import type { JobContext } from '@livekit/agents';

// Event cleanup registry for proper memory management
import {
  createSessionCleanupTracker,
  runSessionCleanup,
} from './session/event-cleanup-registry.js';

// Phase modules (extracted for maintainability)
import {
  buildUserAwareness,
  connectToRoom,
  detectConnectionType,
  getCachedVoiceDeps,
  getPrewarmedResources,
  loadPersonaLocally,
  loadVoiceDeps as loadVoiceDepsPhase,
  runMultiAgentMode,
  runUntilDisconnect,
  setupNoiseCancellation,
  setupVoiceHumanization,
  type VoiceDeps,
} from './voice-agent/phases/index.js';

// Import the full PersonaConfig type for proper type compatibility
import type { PersonaConfig } from '../personas/types.js';

// Import VoiceAgentRef type for handoff support
import type { VoiceAgentRef } from './shared/handoff/types.js';

// Import BundleRuntimeEngine type for bundle state
import type { BundleRuntimeEngine } from '../personas/bundles/runtime.js';

// Centralized model configuration (toggle models via admin UI or model-config.json)
import { modelConfig } from '../services/model-config.js';

// FinOps cost tracking for session economics
import { finops } from '../services/observability/finops.js';

// Multi-agent system for natural persona handoffs
// Each persona gets its own Gemini session + TTS voice
import { initializeMultiAgentSession, handleHandoffFromDataChannel } from './multi-agent/index.js';
// Group conversations - Team Roundtables and Conference Calls
import {
  createGroupVoiceIntegration,
  type GroupVoiceIntegration,
} from './group-conversation/voice-integration.js';
// handoffEvents is imported dynamically at runtime from '../tools/handoff/index.js'
// FIX: Import retry counter cleanup for WeakMap session GC
import { clearRetryCounter } from './shared/sanitizer/index.js';
// Speech coordination for centralized speech management
import {
  coordinatedSay,
  initializeSpeechCoordination,
  cleanupSpeechCoordination,
} from '../speech/coordination/index.js';
// AGI-like action confirmation dispatcher
import { initActionDispatcher, clearActionDispatcher } from './realtime/action-event-dispatcher.js';
// Centralized generateReply gateway - handles session readiness
import { prewarmSessionAsync, generateReply } from './shared/generate-reply-gateway.js';
// Inject generateReply into semantic router (avoids architecture violation)
import { setGenerateReplyFunction } from '../tools/semantic-router/integration/transcript-integration.js';
// Location preference service - set active session for native tool location fallback
import {
  setCurrentActiveSession,
  clearCurrentActiveSession,
} from '../tools/domains/information/location-preference.js';

// Development telemetry for E2E observability
import { logPipelineStage, type StageType } from './shared/dev-telemetry.js';

// ============================================================================
// FEATURE FLAGS
// ============================================================================

/**
 * Multi-agent mode: Each persona runs as a separate agent with its own Gemini session.
 * This enables natural handoffs where both personas speak with their real voices.
 *
 * DEFAULT: true (multi-agent mode is now the standard for proper handoffs)
 * Set MULTI_AGENT_MODE=false in environment to disable (not recommended).
 *
 * NOTE: Multi-agent mode is implemented in ./multi-agent/. See CLAUDE.md there for details.
 * The full integration replaces the single-session approach with the orchestrator pattern.
 */
const MULTI_AGENT_MODE = process.env.MULTI_AGENT_MODE !== 'false';

// Model provider abstraction - centralizes all model-specific behavior
import { getModelProvider, isUsingOpenAI } from './model-provider/index.js';

// Get provider early for module-level logging
const modelProvider = getModelProvider();

// Log multi-agent status at module load
if (MULTI_AGENT_MODE) {
  process.stderr.write(
    `[voice-agent-entry] 🎭 MULTI_AGENT_MODE enabled - Using multi-agent orchestrator\n`
  );
} else {
  process.stderr.write(
    `[voice-agent-entry] ⚠️ MULTI_AGENT_MODE disabled - Handoffs will NOT update LLM persona!\n`
  );
}

// Inject generateReply into semantic router at module load
// This resolves the architecture violation: tools (Level 70) must not import from agents (Level 100)
setGenerateReplyFunction(generateReply);

// Inject model provider info into personas layer at module load
// This resolves the architecture violation: personas (Level 70) must not import from agents (Level 100)
import { configureModelProvider } from '../personas/bundles/model-provider-config.js';
configureModelProvider(() => {
  const provider = getModelProvider();
  return {
    id: provider.id,
    logPrefix: provider.getLogPrefix(),
    promptModules: provider.getPromptModules(),
  };
});

/**
 * Dev telemetry helper - logs pipeline stages in development mode
 */
const isDev = process.env.NODE_ENV === 'development' || process.env.DEV_TELEMETRY === 'true';
function devStage(stage: string, type: StageType = 'processing'): void {
  if (isDev) {
    logPipelineStage(stage, type);
  }
}

// Log LLM provider
process.stderr.write(
  `[voice-agent-entry] ${modelProvider.getLogPrefix()} Using ${modelProvider.displayName}\n`
);

// ============================================================================
// LIGHTWEIGHT VOICE AGENT REF (For Handoff Support)
// ============================================================================

/**
 * Creates a lightweight VoiceAgentRef wrapper for the agent.
 * This enables handoffs to update LLM instructions without the full VoiceAgent class.
 *
 * FIX: Previously getVoiceAgentRef returned null, breaking handoff identity switching.
 * Now we create a proper wrapper that implements the required interface.
 */
function createLightweightVoiceAgentRef(
  agent: { _instructions?: string },
  initialPersona: PersonaConfig
): VoiceAgentRef {
  // Mutable state for the wrapper
  let currentPersona: PersonaConfig = initialPersona;
  let bundleRuntime: BundleRuntimeEngine | undefined;

  return {
    /**
     * Set persona - supports two signatures:
     * 1. setPersona(personaConfig: PersonaConfig) - full persona config with systemPrompt
     * 2. setPersona(personaId: string, instructions: string) - direct ID + instructions
     */
    setPersona(personaOrId: unknown, instructions?: string): void {
      // Handle both signatures
      if (typeof personaOrId === 'string' && typeof instructions === 'string') {
        // Signature 2: setPersona(personaId, instructions)
        // CRITICAL: This is how coordinator-adapter calls us during handoff!
        agent._instructions = instructions;
        process.stderr.write(
          `[voice-agent-entry] 🎭 LLM instructions updated for ${personaOrId} (${instructions.length} chars)\n`
        );
        return;
      }

      // Signature 1: setPersona(personaConfig)
      const p = personaOrId as PersonaConfig;
      currentPersona = p;

      // CRITICAL: Update the agent's instructions for the new persona
      if (p.systemPrompt) {
        agent._instructions = p.systemPrompt;
        process.stderr.write(
          `[voice-agent-entry] 🎭 LLM instructions updated for ${p.name} (${p.systemPrompt.length} chars)\n`
        );
      } else {
        process.stderr.write(`[voice-agent-entry] ⚠️ Persona ${p.name} has no systemPrompt!\n`);
      }
    },

    getPersona(): { id: string } | undefined {
      return currentPersona ? { id: currentPersona.id } : undefined;
    },

    setBundleRuntime(runtime: unknown): void {
      bundleRuntime = runtime as BundleRuntimeEngine;
      process.stderr.write(
        `[voice-agent-entry] 📦 Bundle runtime updated for ${currentPersona?.name}\n`
      );
    },

    getBundleRuntime(): { getState: () => { personaId?: string } } | undefined {
      if (!bundleRuntime) return undefined;
      return {
        getState: () => {
          const state = bundleRuntime?.getState?.();
          return { personaId: state?.personaId };
        },
      };
    },

    // For validation checks
    get instructions(): string | undefined {
      return agent._instructions;
    },
  };
}

// ============================================================================
// MODULE-LEVEL STATE (Cached voice deps)
// ============================================================================

let cachedVoiceDeps: VoiceDeps | null = null;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Load core voice dependencies (uses phase module) */
async function loadVoiceDeps(): Promise<void> {
  if (cachedVoiceDeps) return;
  cachedVoiceDeps = await loadVoiceDepsPhase();
}

/** Get voice, google, silero, genai from cached deps */
function getVoiceDeps(): VoiceDeps {
  if (!cachedVoiceDeps) {
    cachedVoiceDeps = getCachedVoiceDeps();
    if (!cachedVoiceDeps) {
      throw new Error('Voice deps not loaded - call loadVoiceDeps first');
    }
  }
  return cachedVoiceDeps;
}

// ============================================================================
// MAIN ENTRY FUNCTION
// ============================================================================

export async function runFullVoiceAgentEntry(ctx: JobContext): Promise<void> {
  const startTime = Date.now();
  const jobId = ctx.job.id;
  const roomName = ctx.job.room?.name || 'unknown';
  const sessionId = `session-${jobId}-${Date.now()}`;

  // In the new GCE architecture, dependencies are loaded directly by worker.ts
  // Import modules on demand
  const e2eDiagnostics = await import('./shared/e2e-diagnostics.js');
  const { e2e } = e2eDiagnostics;

  const lightweightResilience = await import('./shared/lightweight-resilience.js');
  const { withResilience, humanizeError } = lightweightResilience;

  // Import crash analytics for session tracking
  const crashAnalyticsModule = await import('./shared/crash-analytics.js');
  const {
    registerSession,
    updateSessionState,
    unregisterSession,
    recordCrash,
    recordConnectionDrop: _recordConnectionDrop,
    markOperationPending: _markOperationPending,
  } = crashAnalyticsModule;

  // Register session immediately for crash tracking
  registerSession(sessionId, {
    sessionId,
    roomName,
    userId: undefined, // Will be updated when metadata is parsed
    personaId: undefined, // Will be updated when persona is loaded
  });

  let currentPhase:
    | 'deps'
    | 'persona'
    | 'connect'
    | 'session'
    | 'services'
    | 'handlers'
    | 'greeting'
    | 'running' = 'deps';
  e2e.childEntry(jobId);
  process.stderr.write(`[voice-agent-entry] Starting session pid=${process.pid}\n`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let session: any = null;

  const cleanupHandlers: Array<() => void | Promise<void>> = [];

  // Create session-scoped cleanup tracker for automatic event handler cleanup
  const cleanupTracker = createSessionCleanupTracker(sessionId);

  try {
    // =========================================================================
    // STEP 1: LOAD VOICE DEPENDENCIES
    // =========================================================================
    devStage('voice_deps_loading');
    e2e.resourceLoading('voice-dependencies');
    const depsStart = Date.now();
    await withResilience(async () => loadVoiceDeps(), {
      maxRetries: 2,
      baseDelay: 1000,
      operationName: 'load-voice-deps',
    });
    e2e.resourceLoaded('voice-dependencies', Date.now() - depsStart);

    // =========================================================================
    // STEP 2: GET PERSONA
    // =========================================================================
    devStage('persona_loading');
    currentPhase = 'persona';

    // Parse metadata for persona ID
    let metadata: Record<string, unknown> = {};

    // DEBUG: Log raw job metadata to trace persona_id flow
    process.stderr.write(
      `[voice-agent-entry] 🔍 DEBUG: Raw job.metadata = ${ctx.job.metadata || '(empty)'}\n`
    );
    process.stderr.write(
      `[voice-agent-entry] 🔍 DEBUG: Raw room.metadata = ${ctx.job.room?.metadata || '(empty)'}\n`
    );

    if (ctx.job.metadata) {
      try {
        metadata = JSON.parse(ctx.job.metadata);
        process.stderr.write(
          `[voice-agent-entry] 🔍 DEBUG: Parsed job metadata keys: ${Object.keys(metadata).join(', ')}\n`
        );
      } catch (e) {
        process.stderr.write(`[voice-agent-entry] Failed to parse job.metadata: ${e}\n`);
      }
    }
    if (!metadata.persona_id && ctx.job.room?.metadata) {
      try {
        const roomMeta = JSON.parse(ctx.job.room.metadata);
        if (roomMeta.persona_id) {
          metadata = { ...metadata, ...roomMeta };
        }
      } catch (e) {
        process.stderr.write(`[voice-agent-entry] Failed to parse room.metadata: ${e}\n`);
      }
    }

    // =========================================================================
    // CALL TYPE DETECTION (INBOUND OR ON-BEHALF)
    // =========================================================================
    const callType = metadata.type as string | undefined;

    // =========================================================================
    // INBOUND CALL DETECTION
    // =========================================================================
    // If this is an inbound call (someone calling Ferni via phone),
    // set up the inbound call context with caller identity.
    // The inbound-call-context builder will inject caller info, recognition status, etc.
    if (callType === 'inbound_call') {
      process.stderr.write(
        `[voice-agent-entry] 📞 INBOUND CALL DETECTED - setting up caller context\n`
      );
      process.stderr.write(
        `[voice-agent-entry] 📞 Caller context: ${JSON.stringify({
          callSid: metadata.callSid,
          callerPhone: metadata.callerPhone
            ? `${String(metadata.callerPhone).slice(0, 4)}****`
            : 'unknown',
          callerName: metadata.callerName,
          isKnownCaller: metadata.isKnownCaller,
          isSponsored: !!metadata.sponsoredIdentityId,
        })}\n`
      );

      // Set up inbound call context for the context builder to pick up
      try {
        const { setInboundCallContext } =
          await import('../intelligence/context-builders/external/inbound-call-context.js');

        const inboundContext = {
          callSid: (metadata.callSid as string) || '',
          callerPhone: (metadata.callerPhone as string) || '',
          callerName: metadata.callerName as string | undefined,
          userId: metadata.userId as string | undefined,
          sponsoredIdentityId: metadata.sponsoredIdentityId as string | undefined,
          sponsorUserId: metadata.sponsorUserId as string | undefined,
          isKnownCaller: (metadata.isKnownCaller as boolean) || false,
          isVoiceEnrolled: (metadata.isVoiceEnrolled as boolean) || false,
          relationship: metadata.relationship as string | undefined,
          notes: metadata.notes as string | undefined,
          accessLevel: metadata.accessLevel as 'full' | 'limited' | 'supervised' | undefined,
          allowedPersonas: metadata.allowedPersonas as string[] | undefined,
        };

        // Store with sessionId for context builder lookup
        setInboundCallContext(sessionId, inboundContext);

        // Also store with room name for fallback
        const roomName = ctx.job.room?.name;
        if (roomName) {
          setInboundCallContext(roomName, inboundContext);
        }

        process.stderr.write(
          `[voice-agent-entry] 📞 Inbound call context set for sessionId: ${sessionId}\n`
        );

        // For sponsored identities, use their familyUserId for memory storage
        // This gives them their own conversation history and relationship with Ferni
        if (metadata.sponsoredIdentityId) {
          // Use familyUserId from metadata (passed from inbound routes)
          if (metadata.familyUserId) {
            metadata.user_id = metadata.familyUserId as string;
            process.stderr.write(
              `[voice-agent-entry] 📞 Using familyUserId for memory: ${metadata.familyUserId}\n`
            );
          } else {
            // Fallback to generated familyUserId (backward compatibility)
            metadata.user_id = `family_${metadata.sponsoredIdentityId}`;
            process.stderr.write(
              `[voice-agent-entry] 📞 Using generated familyUserId: family_${metadata.sponsoredIdentityId}\n`
            );
          }
        } else if (metadata.userId) {
          // Non-sponsored caller - use their phone-based userId
          metadata.user_id = metadata.userId;
        }
      } catch (error) {
        process.stderr.write(`[voice-agent-entry] ⚠️ Failed to set inbound context: ${error}\n`);
        // Continue anyway - the agent will still work, just without specialized context
      }
      // Continue with standard voice agent flow - don't return early
    }

    // =========================================================================
    // ON-BEHALF CALL DETECTION
    // =========================================================================
    // If this is an on-behalf call (calling someone on behalf of user),
    // set up the outbound call context and let the standard voice agent handle it.
    // The outbound-call-context builder will inject call purpose, script, etc.
    if (callType === 'on_behalf_call') {
      process.stderr.write(
        `[voice-agent-entry] 📞 ON-BEHALF CALL DETECTED - using standard agent with outbound context\n`
      );
      process.stderr.write(
        `[voice-agent-entry] 📞 Call context: ${JSON.stringify({
          callId: metadata.callId,
          contactName: (metadata.contact as Record<string, unknown>)?.name,
          purpose: metadata.purpose,
          callType: metadata.callType,
        })}\n`
      );

      // Set up outbound call context for the context builder to pick up
      // The outbound-call-context builder will inject call purpose, script, compliance, etc.
      // CRITICAL: Store with BOTH roomName and sessionId since context builder uses sessionId
      try {
        const { setOutboundCallContext } =
          await import('../intelligence/context-builders/external/outbound-call-context.js');
        const roomNameForContext = ctx.job.room?.name || `call-${metadata.callId}`;
        const outboundContext = {
          callId: metadata.callId as string,
          recipientName:
            ((metadata.contact as Record<string, unknown>)?.name as string) || 'Unknown',
          recipientPhone: ((metadata.contact as Record<string, unknown>)?.phone as string) || '',
          purpose: (metadata.purpose as string) || 'General call',
          callType:
            (metadata.callType as 'healthcare' | 'restaurant' | 'business' | 'personal') ||
            'business',
          objective: (metadata.objective as string) || (metadata.purpose as string) || '',
          script: (metadata.script as string) || '',
          complianceScript: (metadata.complianceScript as string) || '',
          mustConfirm: (metadata.mustConfirm as string[]) || [],
          mustNotDo: (metadata.mustNotDo as string[]) || [],
          informationToGather: (metadata.informationToGather as string[]) || [],
          userName: (metadata.userName as string) || 'the user',
          originalSessionId: (metadata.originalSessionId as string) || '',
        };
        // Store with roomName (for legacy lookups)
        setOutboundCallContext(roomNameForContext, outboundContext);
        // Also store with sessionId (for context builder lookups)
        setOutboundCallContext(sessionId, outboundContext);
        process.stderr.write(
          `[voice-agent-entry] 📞 Outbound call context set for room: ${roomNameForContext}, sessionId: ${sessionId}\n`
        );
      } catch (error) {
        process.stderr.write(`[voice-agent-entry] ⚠️ Failed to set outbound context: ${error}\n`);
        // Continue anyway - the agent will still work, just without specialized context
      }
      // Continue with standard voice agent flow - don't return early
    }

    // =========================================================================
    // PROACTIVE OUTREACH CALL DETECTION
    // =========================================================================
    // If this is a proactive outreach call (Ferni reaching out to check in),
    // set up the proactive session context so the agent knows WHY it's calling.
    if (callType === 'proactive_outreach') {
      process.stderr.write(
        `[voice-agent-entry] 📞 PROACTIVE OUTREACH DETECTED - setting up check-in context\n`
      );
      process.stderr.write(
        `[voice-agent-entry] 📞 Outreach context: ${JSON.stringify({
          triggerType: metadata.triggerType,
          triggerReason: metadata.triggerReason,
          daysSinceLastSession: metadata.daysSinceLastSession,
        })}\n`
      );

      // Set up proactive session context for the context builder to pick up
      try {
        const { setProactiveSessionContext } =
          await import('../intelligence/context-builders/external/proactive-session-context.js');

        const proactiveContext = {
          // Cast to the expected type from proactive-session-context
          triggerType: ((metadata.triggerType as string) ||
            'silence') as import('../intelligence/context-builders/external/proactive-session-context.js').ProactiveTriggerType,
          triggerReason: (metadata.triggerReason as string) || 'Proactive check-in',
          daysSinceLastSession: metadata.daysSinceLastSession as number | undefined,
          lastMood: metadata.lastMood as string | undefined,
          lastSessionSummary: metadata.lastSessionSummary as string | undefined,
          relatedDate: metadata.relatedDate as
            | { type: string; date: Date; description: string }
            | undefined,
          relatedCommitment: metadata.relatedCommitment as
            | { summary: string; madeOn: Date; dueDate?: Date }
            | undefined,
          openerStyle:
            (metadata.openerStyle as
              | 'warm'
              | 'celebratory'
              | 'gentle'
              | 'supportive'
              | 'curious') || 'warm',
          suggestedOpener: metadata.suggestedOpener as string | undefined,
          avoidances: metadata.avoidances as string[] | undefined,
          initiatingPersona: (metadata.persona_id as string) || 'ferni',
        };

        // Store with sessionId for context builder lookup
        setProactiveSessionContext(sessionId, proactiveContext);

        // Also store with room name for fallback
        const roomName = ctx.job.room?.name;
        if (roomName) {
          setProactiveSessionContext(roomName, proactiveContext);
        }

        process.stderr.write(
          `[voice-agent-entry] 📞 Proactive session context set for sessionId: ${sessionId}\n`
        );
      } catch (error) {
        process.stderr.write(`[voice-agent-entry] ⚠️ Failed to set proactive context: ${error}\n`);
        // Continue anyway - the agent will still work, just without specialized context
      }
      // Continue with standard voice agent flow - don't return early
    }

    const personaId = (metadata.persona_id as string) || process.env.PERSONA_ID || 'ferni';
    // 🔗 Developer Platform: Extract publisher ID for marketplace/custom personas
    const publisherId = (metadata.publisher_id as string) || undefined;
    process.stderr.write(`[voice-agent-entry] Resolved personaId: ${personaId}\n`);
    if (publisherId) {
      process.stderr.write(`[voice-agent-entry] 🔗 Publisher ID: ${publisherId}\n`);
    }

    e2e.resourceLoading(`persona:${personaId}`);
    const personaStart = Date.now();
    const {
      usePrewarmed,
      persona: cachedPersona,
      systemPrompt: cachedPrompt,
    } = await getPrewarmedResources(personaId);

    let persona = cachedPersona;
    if (!usePrewarmed) {
      const startup = await import('../startup.js');
      await startup.startup();
      persona = await loadPersonaLocally(personaId);
    }
    e2e.resourceLoaded(`persona:${personaId}`, Date.now() - personaStart);

    // Create a full persona config with defaults
    // Use 'as unknown as PersonaConfig' for fallback since we don't have all required fields
    // Import voice config for correct fallback voice ID
    const { getDefaultVoiceConfig } = await import('../config/cartesia-config.js');
    const defaultVoice = getDefaultVoiceConfig();

    // Build persona name from ID if needed
    const personaName = personaId
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    // Default communication config for greeting generation
    const defaultCommunication = {
      greetingStyle: 'warm-friend' as const,
      returningUserStyle: 'warm-friend' as const,
      formalityLevel: 0.3,
      thinkingPhrases: ['Let me think about that...', 'Hmm...'],
      listeningCues: ['I hear you', 'Go on...'],
      backchannels: { neutral: ['mm-hmm'], engaged: ['right'], empathetic: ['I understand'] },
      silenceFillers: {
        early: ['Take your time'],
        mid: ["I'm here"],
        late: ["Whenever you're ready"],
      },
      selfCorrections: ['Actually, let me rephrase that...'],
      trailingOffs: ['You know...'],
      interruptionRecoveries: ['Sorry, go ahead'],
      humilityPhrases: ['I could be wrong, but...'],
      emotionalExpressions: {
        laughter: ['haha'],
        surprise: ['Oh!'],
        concern: ['Oh no...'],
        joy: ["That's wonderful!"],
        empathy: ['I understand...'],
      },
    };

    // Default identity config for greeting generation
    const defaultIdentity = {
      selfReference: personaName,
      coreValues: ['empathy', 'growth', 'authenticity'],
      role: 'life coach',
      priorities: ['user wellbeing', 'genuine connection'],
      desiredUserExperience: 'feeling heard and supported',
    };

    // Build fallback persona with all required fields
    // NOTE: This is only used when the persona bundle fails to load
    // In normal operation, personas come from the registry with full configs
    const fallbackPersona: PersonaConfig = {
      id: personaId,
      name: personaName,
      description: `${personaName} is a warm and supportive life coach.`,
      voice: { voiceId: defaultVoice.voiceId, provider: 'cartesia' as const },
      systemPrompt: cachedPrompt || `You are ${personaId}, a warm and supportive life coach.`,
      personality: {
        warmth: 0.7,
        humorLevel: 0.4,
        humorStyle: ['observational', 'self-deprecating'],
        directness: 0.6,
        energy: 0.6,
        tangentFrequency: 0.3,
        traits: ['empathetic', 'supportive', 'curious'],
        boundaries: ['Never give medical/legal/financial advice'],
      },
      speechCharacteristics: {
        baseSpeedMultiplier: 1.0,
        pauseMultiplier: 1.0,
        speedVariation: 0.15,
        thinkingSoundFrequency: 0.4,
        emphasisStyle: 'moderate',
        sentenceEndingStyle: 'natural',
        minimumEnergy: 0.8,
        maximumEnergy: 1.1,
      },
      communication: defaultCommunication,
      identity: defaultIdentity,
      knowledge: {
        domains: ['life-coaching', 'personal-growth'],
        qualifiedTopics: [
          'goal-setting',
          'habits',
          'motivation',
          'relationships',
          'work-life-balance',
        ],
        outOfScopeTopics: ['medical-diagnosis', 'legal-advice', 'financial-advice'],
        outOfScopeResponse:
          "That's outside my expertise. I'd recommend speaking with a qualified professional for that.",
      },
    };

    // Use provided persona or fallback, ensuring required fields are present
    const sessionPersona: PersonaConfig = persona
      ? {
          ...fallbackPersona, // Defaults
          ...persona, // Override with actual persona
          // Ensure critical nested objects exist
          communication: persona.communication ?? defaultCommunication,
          identity: persona.identity ?? defaultIdentity,
          knowledge: persona.knowledge ?? fallbackPersona.knowledge,
        }
      : fallbackPersona;

    // ✅ FULL RICH PROMPT - Load persona-specific system prompt from bundles
    // Uses loadSystemPrompt() which handles all personas (ferni, maya-santos, alex-chen, etc.)
    const { loadSystemPrompt, loadModelBaseInstructions } =
      await import('./personas/prompt-loader.js');

    // Load TWO levels of instructions:
    // 1. Model-level: Foundational rules (tool format, honesty, platform context)
    // 2. Agent-level: Full persona prompt (identity, detailed tools, personality)
    const [baseInstructions, systemPrompt] = await Promise.all([
      loadModelBaseInstructions(),
      loadSystemPrompt(sessionPersona.id),
    ]);

    // =========================================================================
    // DATE/TIME AWARENESS - Critical for grounding agent in reality
    // This is injected into model-level instructions so the agent knows
    // the date/time from the VERY FIRST MOMENT (including greeting)
    // =========================================================================
    const sessionStartTime = new Date();
    const dateTimeContext = `
---

## Current Date & Time

Today is ${sessionStartTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
The current time is ${sessionStartTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}.

Use this awareness naturally - don't announce it unless asked, just BE present in the moment.
If someone asks what day it is, what time it is, or what the date is, you know the answer.
`;

    // Start with date/time context (user awareness added after session init)
    let modelBaseInstructions = baseInstructions + dateTimeContext;

    process.stderr.write(
      `[voice-agent-entry] Loaded prompts - Model base: ${modelBaseInstructions.length} chars (includes date/time), Full persona: ${systemPrompt.length} chars\n`
    );

    process.stderr.write(`[voice-agent-entry] Using persona: ${sessionPersona.name}\n`);

    // =========================================================================
    // STEP 3: CONNECT TO ROOM
    // =========================================================================
    devStage('room_connecting');
    currentPhase = 'connect';
    e2e.sessionConnecting(roomName, ctx.job.participant?.identity || 'unknown');
    const connectStart = Date.now();
    await withResilience(async () => connectToRoom(ctx), {
      maxRetries: 3,
      baseDelay: 500,
      maxDelay: 5000,
      operationName: 'room-connect',
      onBeforeRetry: async () => {
        await ctx.room.disconnect();
      },
    });
    e2e.sessionConnected(
      jobId,
      roomName,
      ctx.room.localParticipant?.identity || 'agent',
      Date.now() - connectStart
    );

    // =========================================================================
    // STEP 4: INITIALIZE SESSION SERVICES
    // =========================================================================
    devStage('session_services', 'context');
    currentPhase = 'services';
    process.stderr.write(`[voice-agent-entry] 📦 Initializing session services...\n`);

    // Import handlers dynamically to keep startup fast
    const [
      { identifyUser },
      { initializeSession },
      { initializeHandoffContext, handoffEvents },
      { getConversationManager },
    ] = await Promise.all([
      import('./voice-agent/user-identification-handler.js'),
      import('./voice-agent/session-init-handler.js'),
      import('../tools/handoff/index.js'),
      import('../services/conversation-manager.js'),
    ]);

    // Identify user from metadata
    const { userId, userName, userAccent } = await identifyUser({
      jobMetadata: ctx.job.metadata,
      room: ctx.room,
      sessionId,
    });

    // Update crash analytics with user context
    updateSessionState(sessionId, {
      state: 'active',
    });
    // Store userId/personaId for crash context (these are simple values, not SessionSnapshot fields)
    registerSession(sessionId, {
      sessionId,
      roomName,
      userId: userId || undefined,
      personaId: sessionPersona.id,
    });

    // Initialize session services (trust profiles, trial status, etc.)
    const {
      services,
      isReturningUser,
      isTrialUser: _isTrialUser,
      isFirstConversation: _isFirstConversation,
      trialStatus: _trialStatus,
      userData,
      sessionStateManager: _sessionStateManager,
      stopPeriodicSync,
    } = await initializeSession({
      sessionId,
      userId,
      userName,
      userAccent,
      sessionPersona,
      room: ctx.room,
      // 🔗 Developer Platform: Pass publisher ID for MCP loading and webhook dispatch
      publisherId,
    });

    if (stopPeriodicSync) {
      cleanupHandlers.push(stopPeriodicSync);
    }

    // Initialize handoff context
    const customData = services.userProfile?.customData as Record<string, unknown> | undefined;
    initializeHandoffContext({
      meetingCounts:
        services.userProfile?.humanizingState?.perPersonaMeetingCounts ||
        (customData?.meetingCounts as Record<string, number> | undefined),
      lastTopics:
        services.userProfile?.humanizingState?.perPersonaLastTopic ||
        (customData?.lastTopicsPerPersona as Record<string, string> | undefined),
    });

    // =========================================================================
    // DIAGNOSTIC: Comprehensive identity diagnostics at session start
    // This helps debug why Ferni might not "remember" the user
    // =========================================================================
    try {
      const { logDiagnostics, generateDiagnostics } =
        await import('../services/identity/identity-error-handler.js');
      logDiagnostics(userId ?? undefined, services.userProfile ?? null, sessionId);

      // Also log detailed diagnostics to stderr for debugging
      const diagnostics = generateDiagnostics(userId ?? undefined, services.userProfile ?? null);
      process.stderr.write(
        `[voice-agent-entry] 📦 Services initialized (userId: ${userId || 'anonymous'}, returning: ${isReturningUser})\n`
      );
      process.stderr.write(
        `[voice-agent-entry] 🔍 IDENTITY DIAGNOSTICS:\n` +
          `  - userId: ${userId || 'MISSING!'}\n` +
          `  - userIdFormat: ${diagnostics.userIdFormat}\n` +
          `  - hasProfile: ${diagnostics.hasProfile ? 'YES' : 'NO!'}\n` +
          `  - hasName: ${diagnostics.hasName ? `YES (${services.userProfile?.name || services.userProfile?.preferredName || userName})` : 'NO!'}\n` +
          `  - hasVoiceSketch: ${diagnostics.hasVoiceSketch ? 'YES (cross-device ready)' : 'NO'}\n` +
          `  - isReturningUser: ${diagnostics.isReturningUser}\n` +
          `  - totalConversations: ${diagnostics.totalConversations}\n` +
          `  - onboardingComplete: ${diagnostics.onboardingComplete}\n` +
          `  - lastConversationSummary: ${services.userProfile?.lastConversationSummary ? `YES (${services.userProfile.lastConversationSummary.slice(0, 40)}...)` : 'NO!'}\n` +
          `  - lastContact: ${services.userProfile?.lastContact || 'NEVER'}\n` +
          `  - issues: ${diagnostics.issues.length > 0 ? diagnostics.issues.join(', ') : 'NONE ✅'}\n`
      );
    } catch (diagError) {
      // Non-fatal - just log basic info if diagnostics fail
      process.stderr.write(
        `[voice-agent-entry] 📦 Services initialized (userId: ${userId || 'anonymous'}, returning: ${isReturningUser})\n`
      );
    }

    // =========================================================================
    // USER AWARENESS - "Better Than Human" context about the user
    // Uses the modular user-awareness phase for cleaner code organization
    // See: voice-agent/phases/user-awareness.ts for the full implementation
    // =========================================================================
    const userAwarenessResult = buildUserAwareness({
      userProfile: services.userProfile,
      isReturningUser,
      userName,
      sessionStartTime,
    });

    if (userAwarenessResult.facts.length > 0) {
      modelBaseInstructions += userAwarenessResult.instructionsBlock;
      process.stderr.write(
        `[voice-agent-entry] 👤 BETTER THAN HUMAN - User awareness injected (${userAwarenessResult.facts.length} facts):\n`
      );
      userAwarenessResult.facts.forEach((fact, i) => {
        process.stderr.write(`[voice-agent-entry]   ${i + 1}. ${fact}\n`);
      });
    } else {
      process.stderr.write(
        `[voice-agent-entry] 👤 No user awareness facts available (new user or empty profile)\n`
      );
    }

    // Calendar Awareness runs only when we have a user profile
    if (services.userProfile) {
      // =========================================================================
      // BETTER THAN HUMAN #5: Calendar Awareness (Non-blocking)
      // A human friend doesn't know your schedule. Ferni does.
      // This runs in background - if calendar loads fast enough, it enhances greeting.
      // =========================================================================
      if (userId) {
        // Fire-and-forget calendar fetch (don't block session start)
        void (async () => {
          try {
            const { getAmbientCalendarContext } =
              await import('../services/calendar/ambient-calendar-awareness.js');
            const calendarContext = await getAmbientCalendarContext(userId);

            if (calendarContext.isCalendarConnected) {
              const calendarAwareness: string[] = [];

              // Next meeting awareness
              if (
                calendarContext.nextMeeting.event &&
                calendarContext.nextMeeting.minutesUntil !== null
              ) {
                const minutes = calendarContext.nextMeeting.minutesUntil;
                const meetingTitle = calendarContext.nextMeeting.event.title;

                if (minutes <= 15) {
                  calendarAwareness.push(
                    `⏰ They have "${meetingTitle}" in ${minutes} minutes - be mindful of time.`
                  );
                } else if (minutes <= 60) {
                  calendarAwareness.push(
                    `📅 They have "${meetingTitle}" in about ${Math.round(minutes / 15) * 15} minutes.`
                  );
                }
              }

              // Just ended meeting (great for follow-up)
              if (
                calendarContext.justEndedMeeting.event &&
                calendarContext.justEndedMeeting.minutesSince !== null
              ) {
                const minutes = calendarContext.justEndedMeeting.minutesSince;
                const meetingTitle = calendarContext.justEndedMeeting.event.title;

                if (minutes <= 15) {
                  calendarAwareness.push(
                    `💬 They just finished "${meetingTitle}" - could be a natural topic.`
                  );
                }
              }

              // Busy day awareness
              if (calendarContext.remainingMeetingsToday >= 4) {
                calendarAwareness.push(
                  `📊 They have ${calendarContext.remainingMeetingsToday} more meetings today - busy day.`
                );
              }

              if (calendarAwareness.length > 0) {
                // Store in userData for use in turn-handler injection (turn 0-1)
                userData.calendarAwareness = calendarAwareness.join(' ');
                // DETAILED LOGGING: Show calendar awareness being stored
                process.stderr.write(
                  `[voice-agent-entry] 📅 BETTER THAN HUMAN - Calendar awareness loaded (${calendarAwareness.length} insights):\n`
                );
                calendarAwareness.forEach((insight, i) => {
                  process.stderr.write(`[voice-agent-entry]   ${i + 1}. ${insight}\n`);
                });
              } else {
                process.stderr.write(
                  `[voice-agent-entry] 📅 Calendar connected but no relevant insights (no upcoming/recent meetings)\n`
                );
              }
            } else {
              process.stderr.write(
                `[voice-agent-entry] 📅 Calendar not connected for user ${userId}\n`
              );
            }
          } catch (calErr) {
            // Calendar not connected or fetch failed - log but don't block
            process.stderr.write(
              `[voice-agent-entry] 📅 Calendar fetch failed (non-critical): ${String(calErr)}\n`
            );
          }
        })();
      }
    } else {
      // NO USER PROFILE - This is why Ferni doesn't "remember" the user!
      process.stderr.write(
        `[voice-agent-entry] ⚠️ NO USER PROFILE! Ferni cannot remember this user.\n` +
          `  - userId was: ${userId || 'NONE PROVIDED'}\n` +
          `  - This means: No name, no conversation history, no memory.\n` +
          `  - Check: Is userId being passed from the frontend? Is it valid format?\n`
      );
    }

    // =========================================================================
    // VOICE VERIFICATION FOR INBOUND CALLS (Borrowed Phone Detection)
    // When someone calls from a known phone but sounds different, gracefully verify.
    // This enables "Hey, I was expecting John - is this someone else?"
    // =========================================================================
    if (
      callType === 'inbound_call' &&
      metadata.isKnownCaller &&
      services.userProfile?.voiceSketch
    ) {
      try {
        const { registerForVoiceVerification, shouldSetupVoiceVerification } =
          await import('../services/voice/inbound-voice-verification.js');

        const verificationCheck = shouldSetupVoiceVerification(
          services.userProfile,
          true, // isInboundCall
          metadata.isKnownCaller as boolean
        );

        if (verificationCheck.shouldSetup && verificationCheck.voiceSketch) {
          registerForVoiceVerification(
            sessionId,
            userId || '',
            verificationCheck.userName || (metadata.callerName as string) || 'the caller',
            verificationCheck.voiceSketch
          );

          // Add cleanup handler
          const { cleanupVoiceVerification } =
            await import('../services/voice/inbound-voice-verification.js');
          cleanupHandlers.push(() => cleanupVoiceVerification(sessionId));

          process.stderr.write(
            `[voice-agent-entry] 🎤 Voice verification registered for inbound call ` +
              `(expected: ${verificationCheck.userName || 'known caller'}, ` +
              `sketch confidence: ${verificationCheck.voiceSketch.confidence.toFixed(2)})\n`
          );
        }
      } catch (voiceVerifyErr) {
        // Non-fatal - just skip voice verification
        process.stderr.write(
          `[voice-agent-entry] ⚠️ Voice verification setup failed (non-fatal): ${String(voiceVerifyErr)}\n`
        );
      }
    }

    // =========================================================================
    // BETTER THAN HUMAN #6: Cross-Channel Thread Continuity
    // When user responds to our outreach (SMS, push, email) via voice call,
    // we pick up exactly where we left off - across channels.
    // ⚡ PERF FIX: Made non-blocking - thread context loads in background
    // If it loads fast enough, it's available on first turn. Otherwise, second turn.
    // =========================================================================
    if (userId) {
      // ⚡ NON-BLOCKING: Thread context and recording init run in background
      void (async () => {
        try {
          const { buildThreadContext } =
            await import('../intelligence/context-builders/session/thread-context.js');
          const threadContext = await buildThreadContext(
            userId,
            personaId as import('../personas/types.js').PersonaId,
            {
              sessionId,
              fromNotification: metadata.fromNotification === true,
            }
          );

          if (threadContext) {
            // Store thread context for injection on first turn
            userData.threadContext = threadContext.content;
            userData.threadId = threadContext.threadId;
            userData.isOutreachResponse = threadContext.isOutreachResponse;

            process.stderr.write(
              `[voice-agent-entry] 🧵 THREAD CONTEXT - Cross-channel continuity enabled:\n` +
                `  - threadId: ${threadContext.threadId || 'new'}\n` +
                `  - isOutreachResponse: ${threadContext.isOutreachResponse}\n` +
                `  - priority: ${threadContext.priority}\n`
            );

            // Note: modelBaseInstructions already compiled, thread context will be injected on first turn via userData
            if (threadContext.isOutreachResponse) {
              process.stderr.write(
                `[voice-agent-entry] 🧵 Thread context ready for first turn injection (outreach response)\n`
              );
            }
          } else {
            process.stderr.write(`[voice-agent-entry] 🧵 No active thread context for user\n`);
          }

          // Initialize thread recording for this session (after context loads)
          try {
            const { initializeThreadRecording, cleanupThreadRecording } =
              await import('../services/conversation-thread/thread-recorder.js');
            const threadInit = await initializeThreadRecording(
              userId,
              sessionId,
              personaId as import('../personas/types.js').PersonaId,
              {
                existingThreadId: userData.threadId,
                isOutreachResponse: userData.isOutreachResponse,
              }
            );

            // Store thread ID in userData for use in transcript/response recording
            userData.threadId = threadInit.threadId;

            // Add cleanup handler
            cleanupHandlers.push(() => {
              cleanupThreadRecording(sessionId);
            });

            process.stderr.write(
              `[voice-agent-entry] 🧵 Thread recording initialized (threadId: ${threadInit.threadId}, isNew: ${threadInit.isNew})\n`
            );
          } catch (threadRecordErr) {
            process.stderr.write(
              `[voice-agent-entry] 🧵 Thread recording init failed (non-critical): ${String(threadRecordErr)}\n`
            );
          }
        } catch (threadErr) {
          process.stderr.write(
            `[voice-agent-entry] 🧵 Thread context fetch failed (non-critical): ${String(threadErr)}\n`
          );
        }
      })();
    }

    // Start FinOps cost tracking for this session
    // Determine tier from user profile subscription
    const userSubTier = services.userProfile?.subscription?.tier || 'free';
    const finopsTier =
      userSubTier === 'partner' ? 'partner' : userSubTier === 'friend' ? 'friend' : 'free';
    finops.startSession({
      sessionId,
      userId,
      tier: finopsTier,
    });
    process.stderr.write(`[voice-agent-entry] FinOps tracking started (tier: ${finopsTier})\n`);

    // Register session with SessionDataManager for proper cache cleanup
    // This is CRITICAL for preventing memory leaks - when session ends,
    // all user data caches will be automatically cleared
    if (userId) {
      try {
        const { getSessionDataManager } = await import('../services/session-data-manager.js');
        getSessionDataManager().sessionStarted(userId);
      } catch {
        // SessionDataManager may not be initialized - non-fatal
      }
    }

    // =========================================================================
    // PERFORMANCE OPTIMIZATIONS: Initialize scaling systems for this session
    // Enables: Pub/Sub offloading, batched LLM analysis, parallel memory search,
    // context caching, speculative TTS, and turn profiling
    // =========================================================================
    const enablePubSub = process.env.PUBSUB_ENABLED === 'true';
    try {
      const perfModule = await import('./shared/performance/index.js');
      await perfModule.initializePerformanceOptimizations({
        userId: userId || 'anonymous',
        personaId,
        sessionId,
        enablePubSub,
        enableSpeculativeTTS: true,
        // 🚨 DISABLED: batchedAnalysis makes redundant LLM calls per turn
        // The turn processor already does emotion/intent detection
        // This was doubling API costs! Re-enable only if you need it for specific analytics.
        enableBatchedAnalysis: false,
        enableParallelMemory: true,
        enableContextCache: true,
        enableProfiling: true,
      });
      process.stderr.write(
        `[voice-agent-entry] 🚀 Performance optimizations initialized (pubsub: ${enablePubSub})\n`
      );

      // Add cleanup handler for performance system
      cleanupHandlers.push(async () => {
        try {
          // Log performance summary before reset
          const summary = await perfModule.getPerformanceSummary();
          if (summary) {
            process.stderr.write(
              `[voice-agent-entry] 📊 Performance summary: ${JSON.stringify(summary.turnProfiling || {})}\n`
            );
          }
          perfModule.resetPerformanceOptimizations();
        } catch {
          /* ignore cleanup errors */
        }
      });
    } catch (perfErr) {
      process.stderr.write(
        `[voice-agent-entry] ⚠️ Performance optimizations failed (non-fatal): ${perfErr}\n`
      );
    }

    // =========================================================================
    // STEP 5: CREATE SESSION
    // =========================================================================
    devStage('session_creation');
    currentPhase = 'session';
    e2e.resourceLoading('agent-session');
    const sessionStart = Date.now();

    // ⚡ OPTIMIZATION: Skip Silero VAD by default - Gemini/OpenAI have built-in turn detection
    // The VAD was adding 200-400ms to session start for no real benefit.
    // Gemini's 'realtime_llm' and OpenAI's 'server_vad' handle user speaking detection.
    // DJ Booth ducking is triggered by UserStateChanged events from the LLM, not VAD.
    //
    // FALLBACK: Set USE_LOCAL_VAD=true to load Silero VAD as redundancy/fallback
    // This adds latency but provides backup if LLM turn detection has issues.
    const USE_LOCAL_VAD = process.env.USE_LOCAL_VAD === 'true';
    let vad:
      | Awaited<ReturnType<typeof import('@livekit/agents-plugin-silero').VAD.load>>
      | undefined;

    if (USE_LOCAL_VAD) {
      try {
        const vadLoadStart = Date.now();
        const { silero } = getVoiceDeps();
        vad = await silero.VAD.load();
        process.stderr.write(
          `[voice-agent-entry] 🎙️ Silero VAD loaded as fallback in ${Date.now() - vadLoadStart}ms\n`
        );
      } catch (vadErr) {
        process.stderr.write(
          `[voice-agent-entry] ⚠️ VAD fallback load failed (non-fatal): ${vadErr}\n`
        );
        // Continue without VAD - LLM turn detection will still work
      }
    }

    // =========================================================================
    // VOICE LOCALIZATION (International Accent Support)
    // =========================================================================
    const voiceConfig = sessionPersona.voice || defaultVoice;

    let effectiveVoiceId = voiceConfig.voiceId;
    let isLocalizedVoice = false;

    // 🌍 For non-American accents, get a localized voice
    if (userAccent && userAccent !== 'american') {
      try {
        const { getLocalizedVoiceId } =
          await import('../services/voice/cartesia-voice-localization.js');
        const localizationResult = await getLocalizedVoiceId(sessionPersona.id, userAccent);
        effectiveVoiceId = localizationResult.voiceId;
        isLocalizedVoice = localizationResult.isLocalized;
        process.stderr.write(
          `[voice-agent-entry] 🌍 Voice localized: ${userAccent} (cached: ${localizationResult.cached})\n`
        );
      } catch (locErr) {
        process.stderr.write(
          `[voice-agent-entry] Voice localization failed (non-fatal): ${locErr}\n`
        );
      }
    }

    // ⚡ OPTIMIZATION: Parallelize independent module loads
    // These imports don't depend on each other, so run them concurrently
    process.stderr.write(`[voice-agent-entry] ⚡ Starting parallel module loads...\n`);
    const parallelLoadStart = Date.now();

    const subscriptionTier =
      (services.userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free';

    const [voiceManager, toolOrchestratorModule, ferniAgentModule, functionCallingModule] =
      await Promise.all([
        import('../speech/voice-manager.js'),
        import('../tools/orchestrator/voice-agent-integration.js'),
        import('./personas/ferni-agent.js'),
        import('../tools/utils/function-calling-config.js'),
      ]);

    process.stderr.write(
      `[voice-agent-entry] ⚡ Parallel module loads complete in ${Date.now() - parallelLoadStart}ms\n`
    );

    // Create TTS with localized voice using PersonaAwareTTS (with voice switching support)
    const tts = voiceManager.createPersonaAwareTTS(sessionPersona.name, {
      ...voiceConfig,
      voiceId: effectiveVoiceId,
      accent: userAccent || 'american',
      isLocalizedVoice,
    });

    // Initialize voice manager and register TTS for mid-session accent changes
    const sessionVoiceManager = voiceManager.getSessionVoiceManager(sessionId);
    sessionVoiceManager.initialize();

    // Fire-and-forget TTS registration (non-blocking)
    void (async () => {
      try {
        const { registerSessionTTS } = await import('../api/session-accent-routes.js');
        registerSessionTTS(sessionId, tts, sessionPersona.id, userAccent || 'american');
      } catch {
        // Non-critical - accent changes just won't work mid-session
      }
    })();

    // Get voice deps for session creation
    const { voice, google, genai } = getVoiceDeps();

    // Initialize orchestrator if not already done (should be warm from prewarm)
    const { getToolsForAgent, initializeToolOrchestrator, isOrchestratorInitialized } =
      toolOrchestratorModule;

    if (!isOrchestratorInitialized()) {
      try {
        await initializeToolOrchestrator();
      } catch (orchErr) {
        process.stderr.write(
          `[voice-agent-entry] Orchestrator init failed (will use legacy): ${orchErr}\n`
        );
      }
    }

    // Extract IP-detected location from metadata (TikTok-style personalization)
    const userLocation =
      metadata.city || metadata.regionCode || metadata.countryCode
        ? {
            city: metadata.city as string | undefined,
            regionCode: metadata.regionCode as string | undefined,
            countryCode: metadata.countryCode as string | undefined,
          }
        : undefined;

    // DEBUG: Log received geo data (always log for debugging)
    process.stderr.write(
      `[voice-agent-entry] 📍 Geo metadata received: city=${metadata.city || 'none'}, region=${metadata.regionCode || 'none'}, country=${metadata.countryCode || 'none'}\n`
    );

    if (userLocation?.city) {
      process.stderr.write(
        `[voice-agent-entry] 📍 User location: ${userLocation.city}, ${userLocation.regionCode || userLocation.countryCode}\n`
      );
    } else {
      process.stderr.write(`[voice-agent-entry] 📍 No city in metadata (location unavailable)\n`);
    }

    // Store userLocation in userData so it flows through to TTS context
    // This enables weather tool to use IP-detected location as fallback
    userData.userLocation = userLocation;

    // Set current active session for native tool location fallback
    // Native llm.tool() functions don't receive userId/userLocation context,
    // so they can use getCurrentSessionLocation() to access the current session's location.
    const formattedLocation = userLocation?.city
      ? userLocation.regionCode
        ? `${userLocation.city}, ${userLocation.regionCode}`
        : userLocation.city
      : undefined;
    setCurrentActiveSession(userId || 'anonymous', formattedLocation, sessionId);

    // Get tools from orchestrator
    // ⚡ FAST PATH: Skip semantic router on session start - we have no user input yet!
    // This reduces tool loading from ~5-7s to <500ms. Full semantic routing happens
    // on first turn when we actually have user context to match against.
    const { tools: orchestratorTools, meta: toolsMeta } = await getToolsForAgent({
      persona: { id: sessionPersona.id, displayName: sessionPersona.name },
      userId: userId || 'anonymous',
      userProfile: services.userProfile,
      subscriptionTier,
      initialTranscript: '', // Session start - no transcript yet
      // Pass services for dev mode bypass (synced from frontend dev panel via data channel)
      services: services as { devMode?: { enabled: boolean; bypassUnlocks: boolean } },
      // IP-detected location for weather, local content
      userLocation,
      // ⚡ PERF FIX: Use fast path to skip semantic router (5-7s → <500ms)
      fastPath: true,
      sessionId,
    });

    process.stderr.write(
      `[voice-agent-entry] Got ${toolsMeta.toolCount} tools from ${toolsMeta.mode} (${toolsMeta.selectionTimeMs}ms)\n`
    );

    // Create agent with persona-specific system prompt and orchestrator-selected tools
    // NOTE: FerniAgent is the main agent class used for ALL personas. The persona identity
    // comes from the system prompt (loaded above via loadSystemPrompt), not the class name.
    const { FerniAgent } = ferniAgentModule;

    // DEBUG: Log tools being passed to agent
    const toolNames = Object.keys(orchestratorTools || {});
    process.stderr.write(
      `[voice-agent-entry] Creating agent for ${sessionPersona.id} with ${toolsMeta.toolCount} orchestrator tools\n`
    );
    process.stderr.write(
      `[voice-agent-entry] 🔧 Tool names (ALL ${toolNames.length}): ${toolNames.join(', ')}\n`
    );

    const agent = new FerniAgent(systemPrompt, {
      skipGreeting: true, // Greeting handled by generateAndSpeakGreeting below
      tools: orchestratorTools, // Use orchestrator-selected tools
    });

    // FIX: Create lightweight VoiceAgentRef for handoff support
    // This enables LLM instruction updates during persona handoffs
    // NOTE: Cast needed to access internal _instructions property (not in public API)
    // The LiveKit SDK doesn't expose a setInstructions() method, so we access it directly
    const voiceAgentRef = createLightweightVoiceAgentRef(
      agent as unknown as { _instructions?: string },
      sessionPersona
    );
    process.stderr.write(`[voice-agent-entry] 🎭 VoiceAgentRef created for handoff support\n`);

    // Agent owns instructions and tools - don't duplicate instructions on RealtimeModel
    const { buildToolConfig } = functionCallingModule;

    // Build tool config based on context (crisis mode, new user, etc.)
    const _isNewUser = !services.userProfile || (services.userProfile.totalConversations ?? 0) < 3;
    const isCrisis = userData.lastEmotionAnalysis?.distressLevel
      ? userData.lastEmotionAnalysis.distressLevel > 0.7
      : false;

    const toolConfig = buildToolConfig({
      environment: 'production',
      // TEMPORARILY DISABLED: isNewUser restrictions were limiting tools too aggressively
      // isNewUser,
      isCrisis,
    });

    const allowedTools = toolConfig.functionCallingConfig.allowedFunctionNames;
    process.stderr.write(
      `[voice-agent-entry] 🔧 Function calling config: mode=${toolConfig.functionCallingConfig.mode}, isCrisis=${isCrisis}\n`
    );
    process.stderr.write(
      `[voice-agent-entry] 🔧 Allowed tools: ${allowedTools ? allowedTools.join(', ') : 'ALL (no restrictions)'}\n`
    );

    // Get centralized model config (toggle via admin UI or model-config.json)
    const geminiConfig = modelConfig.getDefault();

    // =========================================================================
    // LLM SELECTION: Use ModelProvider abstraction
    // =========================================================================
    // The ModelProvider handles all model-specific configuration, eliminating
    // scattered environment variable checks. See src/agents/model-provider/
    process.stderr.write(
      `[voice-agent-entry] ${modelProvider.getLogPrefix()} Creating LLM model via ${modelProvider.displayName}...\n`
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const llm: any = await modelProvider.createLLMModel({
      model: geminiConfig.model,
      instructions: modelBaseInstructions,
      temperature: geminiConfig.temperature,
    });

    process.stderr.write(
      `[voice-agent-entry] ${modelProvider.getLogPrefix()} LLM model created (text → Cartesia TTS)\n`
    );
    process.stderr.write(
      `[voice-agent-entry] 🎭 Instructions: Model=${modelBaseInstructions.length} chars, Agent=${systemPrompt.length} chars\n`
    );

    session = new voice.AgentSession({
      // ⚡ OPTIMIZATION: Use provider's turn detection setting
      // Different providers have different built-in turn detection mechanisms
      turnDetection: modelProvider.getSessionTurnDetection(),
      // vad is now undefined - not needed with realtime turn detection
      vad,
      llm,
      tts,
      userData,
      voiceOptions: {
        allowInterruptions: true,
        // UPDATED Jan 2026: Ultra-tight delays for natural conversation
        // Human turn-taking gaps are 200-400ms - we should match that
        minEndpointingDelay: 150, // Was 250ms - be snappier
        maxEndpointingDelay: 450, // Was 800ms - don't wait too long
        minInterruptionWords: 1,
        minInterruptionDuration: 150, // Was 200ms - faster interrupt detection
        preemptiveGeneration: true,
      },
    });

    e2e.resourceLoaded('agent-session', Date.now() - sessionStart);
    process.stderr.write(`[voice-agent-entry] Session created in ${Date.now() - sessionStart}ms\n`);

    // FIX: Add cleanup handler for retry counter WeakMap
    // While WeakMap will GC when session is collected, explicit cleanup ensures
    // immediate memory release and is better practice for session-scoped state
    if (session) {
      cleanupHandlers.push(() => {
        try {
          clearRetryCounter(session);
        } catch {
          /* ignore - session may already be cleaned up */
        }
      });
    }

    // =========================================================================
    // STEP 5b: INITIALIZE ACTION DISPATCHER (AGI-like autonomous actions)
    // Enables UI and voice confirmation for actions Ferni takes on user's behalf
    // =========================================================================
    if (userId && session) {
      try {
        initActionDispatcher({
          session,
          sessionId,
          userId,
        });
        process.stderr.write(`[voice-agent-entry] 🎯 Action dispatcher initialized\n`);

        // Add cleanup handler
        cleanupHandlers.push(() => {
          try {
            clearActionDispatcher(sessionId);
          } catch {
            /* ignore - dispatcher may already be cleaned up */
          }
        });
      } catch (dispatcherErr) {
        process.stderr.write(
          `[voice-agent-entry] ⚠️ Action dispatcher initialization failed (non-fatal): ${dispatcherErr}\n`
        );
      }
    }

    // =========================================================================
    // STEP 6: SET UP ALL HANDLERS
    // =========================================================================
    devStage('handlers_setup');
    currentPhase = 'handlers';
    process.stderr.write(`[voice-agent-entry] 🔌 Setting up handlers...\n`);

    // Import all handlers
    const [
      { setupMusicHandler },
      { setupDataChannelHandler },
      { createTranscriptHandler },
      { setupSessionStateHandlers },
      { setupToolTrackingHandler },
      { createEventHandler }, // NEW: Uses coordinator-based handoff system
      { registerCameoHandlers },
      { generateAndSpeakGreeting },
      { handleSessionCleanup },
    ] = await Promise.all([
      import('./voice-agent/music-handler.js'),
      import('./voice-agent/data-channel-handler.js'),
      import('./voice-agent/transcript-handler.js'),
      import('./voice-agent/session-state-handler.js'),
      import('./voice-agent/tool-tracking-handler.js'),
      import('./shared/handoff/event-handler.js'), // NEW: Coordinator-based
      import('./shared/cameo-handler.js'),
      import('./voice-agent/greeting-handler.js'),
      import('./voice-agent/cleanup-handler.js'),
    ]);

    const conversationManager = getConversationManager();
    conversationManager.setPersonaId(sessionPersona.id);

    // Wire conversation manager to capture insights for learning
    conversationManager.setInsightCallback((type, key, value, confidence) => {
      services.captureInsight(type, key, value, confidence);
    });

    // =========================================================================
    // VOICE HUMANIZATION INTEGRATION (via phase module)
    // Makes agent feel more human through prosody, micro-interruptions, etc.
    // =========================================================================
    const voiceHumanizationResult = await setupVoiceHumanization({
      sessionId,
      personaId: sessionPersona.id,
      session,
    });
    const voiceHumanization = voiceHumanizationResult.cleanup
      ? { cleanup: voiceHumanizationResult.cleanup }
      : null;

    // =========================================================================
    // EXTENSIBILITY SESSION HOOK - Marketplace agent custom behavior
    // =========================================================================
    let extensibilitySessionPrompt: string | null = null;
    try {
      const { onSessionStart } = await import('../personas/bundles/extensibility-integration.js');
      extensibilitySessionPrompt = await onSessionStart({
        personaId: sessionPersona.id,
        userId,
        sessionId,
      });
      if (extensibilitySessionPrompt) {
        process.stderr.write(`[voice-agent-entry] 🔌 Extensibility hook executed\n`);
        // Store in userData for use in context injection
        // FIX AUDIT ISSUE: Property now typed in UserData interface
        userData.extensibilitySessionPrompt = extensibilitySessionPrompt;
      }
    } catch {
      // Non-critical - extensibility is optional
    }

    // =========================================================================
    // PRE-SESSION BRIEFING - Make Ferni aware of time, date, context
    // ⚡ OPTIMIZATION: Non-blocking! Set fallback immediately, upgrade in background.
    // GUARANTEE: Agent ALWAYS gets datetime awareness, even if full briefing fails
    // =========================================================================
    // Set fallback datetime awareness IMMEDIATELY (non-blocking)
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    userData.preSessionBriefing = `[YOUR AWARENESS - ${dateStr}]\nIt's ${timeStr}.\nUse this awareness naturally - don't announce it, just BE present in the moment.`;

    // Generate full briefing in background (upgrades the fallback)
    void (async () => {
      try {
        const { generatePreSessionBriefing } = await import('../services/pre-session-briefing.js');
        const briefing = await generatePreSessionBriefing(userId, {
          name: userData.userName || userData.name,
          lastConversation: userData.lastConversationDate
            ? new Date(userData.lastConversationDate)
            : undefined,
        });
        // Upgrade to full briefing (will be used in subsequent turns)
        userData.preSessionBriefing = briefing.formatted;
        process.stderr.write(
          `[voice-agent-entry] 📋 Pre-session briefing generated (${briefing.temporal.timeOfDay}, ${briefing.cultural.season})\n`
        );
      } catch (briefingErr) {
        // Fallback already set, just log
        process.stderr.write(
          `[voice-agent-entry] Pre-session briefing failed, using fallback datetime: ${String(briefingErr)}\n`
        );
      }
    })();

    // Wait for participant before starting session
    // Multi-agent mode REQUIRES participant, so wait longer when enabled
    const participantTimeout = MULTI_AGENT_MODE ? 10000 : 2000;
    process.stderr.write(
      `[voice-agent-entry] 👤 Waiting for participant (${participantTimeout}ms timeout, MULTI_AGENT_MODE=${MULTI_AGENT_MODE})...\n`
    );
    const participant = await Promise.race([
      ctx.waitForParticipant(),
      new Promise<null>((resolve) => {
        setTimeout(() => {
          process.stderr.write(
            `[voice-agent-entry] 👤 Participant wait timed out after ${participantTimeout}ms\n`
          );
          resolve(null);
        }, participantTimeout);
      }),
    ]);

    if (participant) {
      process.stderr.write(`[voice-agent-entry] 👤 Participant joined: ${participant.identity}\n`);
    }

    // =========================================================================
    // MULTI-AGENT MODE (via phase module)
    // When enabled, each persona runs as a separate agent with its own LLM session.
    // This provides natural handoffs with real voices and no prompt leakage.
    // =========================================================================
    if (MULTI_AGENT_MODE && participant) {
      const multiAgentModeResult = await runMultiAgentMode({
        ctx,
        room: ctx.room!,
        participant,
        sessionPersona,
        services,
        userData,
        sessionId,
        userId,
        unregisterSession,
      });

      if (multiAgentModeResult.activated) {
        // Multi-agent mode handled the session, exit early
        return;
      }

      if (multiAgentModeResult.error) {
        process.stderr.write(
          `[voice-agent-entry] 🎭 Multi-agent mode failed, continuing with single-agent: ${multiAgentModeResult.error}\n`
        );
        // Fall through to single-agent mode (already notified frontend in phase module)
      }
    }

    // MUSIC HANDLER - Initialize music player
    const musicResult = await setupMusicHandler({
      room: ctx.room,
      services,
      sessionPersona: sessionPersona,
      conversationManager,
      sessionId,
      userId: userData.userId,
    });
    cleanupHandlers.push(musicResult.cleanup);
    process.stderr.write(`[voice-agent-entry] 🎵 Music handler initialized\n`);

    // =========================================================================
    // CONNECTION TYPE DETECTION & KRISP NOISE CANCELLATION
    // Uses phase modules for cleaner code organization
    // =========================================================================
    const { isPhoneCall, isWebConnection } = detectConnectionType(ctx, participant);
    const { inputOptions } = await setupNoiseCancellation({ isPhoneCall });

    await session.start({ agent, room: ctx.room, inputOptions });
    e2e.sessionStarted(jobId, personaId);
    process.stderr.write(
      `[voice-agent-entry] Session started! (isPhone: ${isPhoneCall}, isWeb: ${isWebConnection})\n`
    );

    // =========================================================================
    // PREWARM: Use gateway for proper session readiness tracking (provider-dependent)
    // =========================================================================
    // The gateway tracks session readiness state. Other generateReply calls
    // will wait or skip based on whether the session is warmed up.
    // This is fire-and-forget - the session can accept calls immediately, but
    // they'll be queued/skipped until prewarm completes.
    // =========================================================================
    if (modelProvider.needsPrewarm()) {
      process.stderr.write(
        `[voice-agent-entry] 🔥 Starting prewarm via gateway (${modelProvider.id})...\n`
      );
      prewarmSessionAsync(session, sessionId);
    }

    // =========================================================================
    // STEP 5b: INITIALIZE SPEECH COORDINATION
    // This enables centralized speech management to prevent overlap
    // =========================================================================
    try {
      initializeSpeechCoordination({
        session,
        sessionId,
        personaId,
        userId: userId || undefined,
      });
      process.stderr.write(`[voice-agent-entry] 🎤 Speech coordination initialized\n`);
      cleanupHandlers.push(() => {
        cleanupSpeechCoordination(sessionId);
      });
    } catch (coordErr) {
      process.stderr.write(
        `[voice-agent-entry] ⚠️ Speech coordination init failed (non-critical): ${coordErr}\n`
      );
    }

    // DEBUG: Verify tools are registered with the agent
    // NOTE: Cast needed to access internal _tools property (not in public API)
    // This is only for debug logging - production code doesn't depend on it
    const agentTools = (agent as unknown as { _tools?: Record<string, unknown> })?._tools;
    const registeredToolCount = agentTools ? Object.keys(agentTools).length : 0;
    process.stderr.write(
      `[voice-agent-entry] ✅ Agent registered with ${registeredToolCount} tools\n`
    );

    // =========================================================================
    // DEBUG LOGGING (disabled in production for performance)
    // Set DEBUG_VOICE_AGENT=true to enable verbose logging
    // =========================================================================
    const debugEnabled = process.env.DEBUG_VOICE_AGENT === 'true';

    // 🔍 ALWAYS log native function call attempts (helps diagnose tool issues)
    // This logs when Gemini tries to use native function calling API
    const nativeFnCallsHandler = (event: unknown) => {
      const eventData = event as { calls?: Array<{ name: string; arguments?: unknown }> };
      const calls = eventData?.calls || [];
      const callNames = calls.map((c) => c.name).join(', ') || 'unknown';
      process.stderr.write(`\n🔧 [NATIVE TOOL CALL] Gemini attempting: ${callNames}\n`);
      process.stderr.write(
        `🔧 [NATIVE TOOL CALL] Full event: ${JSON.stringify(event, null, 2)}\n\n`
      );
    };
    session.on(
      'function_calls_collected' as Parameters<typeof session.on>[0],
      nativeFnCallsHandler
    );
    cleanupTracker.register('event', 'native_function_calls handler', () => {
      session.off?.('function_calls_collected', nativeFnCallsHandler);
    });

    if (debugEnabled) {
      process.stderr.write(`[voice-agent-entry] 🔍 Debug logging ENABLED\n`);
    }

    // TOOL TRACKING HANDLER
    // Create sendDataMessage helper for behavior signal emission
    const sendDataMessage = async (
      type: string,
      payload: Record<string, unknown>
    ): Promise<void> => {
      try {
        const message = JSON.stringify({ type, ...payload });
        const data = new TextEncoder().encode(message);
        await ctx.room.localParticipant?.publishData(data, { reliable: true });
      } catch {
        // Non-critical - silently ignore errors
      }
    };

    setupToolTrackingHandler({
      session,
      userData,
      services,
      sessionPersona: sessionPersona,
      sessionId,
      debugEnabled: true,
      // 🔄 BEHAVIOR SIGNAL INTEGRATION: Pass sendDataMessage for frontend signaling
      sendDataMessage,
    });

    // SESSION STATE HANDLERS (silence detection, engagement, idle timeout)
    const { silenceContext } = setupSessionStateHandlers({
      session,
      sessionPersona: sessionPersona,
      conversationManager,
      userData,
      sessionId,
      // Idle timeout callback - disconnect after extended silence
      onIdleTimeout: () => {
        void (async () => {
          process.stderr.write(
            `[voice-agent-entry] ⏰ Idle timeout - disconnecting session ${sessionId}\n`
          );
          try {
            // Signal frontend that we're disconnecting due to idle
            const { sendFrontendSignal } = await import('../services/frontend-signal.js');
            await sendFrontendSignal('conversation_end', {
              reason: 'idle_timeout',
              disconnectDelay: 0, // Disconnect immediately after TTS finishes
              timestamp: Date.now(),
            });
          } catch {
            // Non-critical - still disconnect
          }
          try {
            // Disconnect the room
            if (ctx.room.isConnected) {
              await ctx.room.disconnect();
            }
          } catch (disconnectErr) {
            process.stderr.write(`[voice-agent-entry] ⚠️ Error disconnecting: ${disconnectErr}\n`);
          }
        })();
      },
    });

    // TRANSCRIPT HANDLER
    const { autoOptimizer } = await import('../tools/optimization/auto-optimizer.js');
    const { patternAnalyzer } = await import('../tools/optimization/pattern-analyzer.js');
    const { feedbackCollector } = await import('../tools/optimization/feedback-collector.js');
    const { dynamicToolLoader } = await import('../tools/dynamic-loader.js');

    // Initialize dynamic loader with essential domains (telephony, communication, etc.)
    // This MUST happen before first user message to prevent race conditions
    // NOTE: Pass undefined for services to use EnvironmentServiceRegistry (checks env vars)
    // SessionServices is NOT a ServiceRegistry and doesn't have .has() method
    await dynamicToolLoader.initialize({
      userId: userId || 'anonymous',
      agentId: sessionPersona.id,
      agentDisplayName: sessionPersona.displayName || sessionPersona.id,
      sessionId,
      services: undefined, // Uses EnvironmentServiceRegistry which checks env vars
    });

    // 🔧 CRITICAL: Update agent with essential tools loaded by dynamic loader
    // The dynamic loader loads entertainment (music), information (weather), etc.
    // These need to be registered with the agent/OpenAI immediately!
    try {
      const { updateAgentTools, supportsToolUpdates } = await import('./shared/tool-updater.js');
      if (supportsToolUpdates()) {
        const essentialTools = dynamicToolLoader.getCurrentTools();
        const essentialDomains = dynamicToolLoader.getLoadedDomains();
        if (Object.keys(essentialTools).length > 0) {
          const updated = await updateAgentTools(agent, essentialTools, {
            domains: essentialDomains,
          });
          if (updated) {
            process.stderr.write(
              `\n🔧 Essential tools registered with agent (${Object.keys(essentialTools).length} tools)\n`
            );
          }
        }
      }
    } catch (toolUpdateError) {
      process.stderr.write(
        `\n⚠️ Failed to update agent with essential tools: ${toolUpdateError}\n`
      );
    }

    const transcriptHandler = createTranscriptHandler({
      room: ctx.room,
      session,
      services,
      sessionPersona: sessionPersona,
      conversationManager,
      voiceHumanization: null, // Will be set up if needed
      userData,
      userId,
      sessionId,
      silenceContext,
      dynamicToolLoader,
      autoOptimizer,
      agent,
    });
    // Store handler reference for cleanup (prevents memory leak)
    const userInputTranscribedHandler = (event: unknown) => {
      const evt = event as { transcript?: string; isFinal?: boolean };
      if (evt.isFinal) {
        process.stderr.write(`\n[STT] FINAL: "${evt.transcript}"\n`);

        // FinOps: Estimate STT duration from word count (~150 WPM average)
        // This is an approximation; actual duration would require audio timestamps
        if (evt.transcript) {
          const wordCount = evt.transcript.split(/\s+/).filter((w) => w.length > 0).length;
          const estimatedDurationSeconds = (wordCount / 150) * 60; // 150 WPM = 2.5 words/sec
          finops.recordSTTCost({
            durationSeconds: Math.max(1, estimatedDurationSeconds), // Minimum 1 second
            userId,
            sessionId,
          });
        }
      } else if (evt.transcript && evt.transcript.length > 5) {
        process.stderr.write(`[STT] partial: "${evt.transcript}"\n`);
      }
      transcriptHandler.handler(
        event as import('./voice-agent/transcript-handler.js').TranscriptEvent
      );
    };
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, userInputTranscribedHandler);

    // Register cleanup for UserInputTranscribed handler
    cleanupHandlers.push(() => {
      try {
        session.off(voice.AgentSessionEventTypes.UserInputTranscribed, userInputTranscribedHandler);
      } catch {
        // Session may already be disposed
      }
    });

    // HANDOFF HANDLER
    // NEW: Coordinator-based handoff handler with intelligent banter
    const eventHandlerResult = createEventHandler({
      ctx,
      session,
      tts: session.tts as { switchVoice?: (name: string, id: string) => void },
      services,
      userData,
      getVoiceAgentRef: () =>
        voiceAgentRef as { setPersona: (personaId: string, instructions: string) => void } | null,
      sessionId, // CRITICAL: Must match data-channel-handler's sessionId
      initialAgent: sessionPersona.id, // CRITICAL: State manager needs to know starting persona!
    });
    cleanupTracker.register('event', 'handoffEvents.voiceSwitch', eventHandlerResult.cleanup);

    // CAMEO HANDLERS
    // FIX: Now using voiceAgentRef to enable LLM instruction updates during cameos
    try {
      const cleanupCameoHandlers = await registerCameoHandlers({
        ctx,
        session,
        tts: session.tts as { switchVoice?: (name: string, id: string) => void },
        hostPersonaId: sessionPersona.id,
        hostVoiceId: sessionPersona.voice.voiceId,
        getVoiceAgentRef: () =>
          voiceAgentRef as unknown as import('./shared/cameo-handler.js').CameoVoiceAgentRef,
        hostPersona: sessionPersona,
      });
      if (cleanupCameoHandlers) {
        cleanupHandlers.push(cleanupCameoHandlers);
      }
      process.stderr.write(`[voice-agent-entry] 🎬 Cameo handlers registered\n`);
    } catch (cameoErr) {
      process.stderr.write(`[voice-agent-entry] Cameo handlers failed (non-fatal): ${cameoErr}\n`);
    }

    // DATA CHANNEL HANDLER (frontend communication)
    // FIX BUG: Pass voiceAgentRef so UI-initiated handoffs can update LLM instructions
    // Without this, clicking a persona in the UI changes the voice but keeps the LLM identity!
    // CRITICAL: Pass tts so the actual Cartesia voice can be changed during handoff!
    const dataChannelResult = setupDataChannelHandler({
      room: ctx.room,
      ctx, // Pass JobContext for coordinator adapter fallback creation
      session,
      services,
      sessionPersona,
      userId,
      sessionId,
      voiceAgentRef,
      tts: session.tts as {
        switchVoice?: (name: string, voiceId: string, accent?: string) => void;
      },
    });
    cleanupHandlers.push(dataChannelResult.cleanup);
    process.stderr.write(`[voice-agent-entry] 📡 Data channel handler set up\n`);

    // FRONTEND PUBLISHER
    let _frontendPublisherReady = false;
    try {
      const { initializeFrontendPublisher, getFrontendPublisher } =
        await import('./realtime/index.js');
      initializeFrontendPublisher(ctx.room);

      const { initFrontendSignal } = await import('../services/frontend-signal.js');
      initFrontendSignal(async (type, data) => {
        const publisher = getFrontendPublisher();
        if (publisher.isConnected()) {
          await publisher.sendData(type, data ?? {});
        }
      });
      _frontendPublisherReady = true;
      process.stderr.write(`[voice-agent-entry] 📤 Frontend publisher initialized\n`);

      // =========================================================================
      // HUMANIZATION SIGNAL EMITTER - Bridge backend humanization to frontend EQ
      // Enables avatar to respond BEFORE words arrive
      // =========================================================================
      try {
        const { initHumanizationSignalEmitter } =
          await import('../services/humanization/humanization-signal-emitter.js');
        initHumanizationSignalEmitter(async (type, payload) => {
          const publisher = getFrontendPublisher();
          if (publisher.isConnected()) {
            await publisher.sendData(type, payload);
          }
        });
        process.stderr.write(`[voice-agent-entry] 🌉 Humanization signal emitter initialized\n`);
      } catch {
        // Non-critical
      }

      // =========================================================================
      // TRUST SIGNAL EMITTER - Shows "Ferni noticed..." cards for growth, wins
      // =========================================================================
      try {
        const { setSignalEmitter } =
          await import('../services/trust-systems/trust-signal-emitter.js');
        setSignalEmitter((signal) => {
          const publisher = getFrontendPublisher();
          if (publisher.isConnected()) {
            void publisher.sendData('trust_signal', {
              signalType: signal.type,
              title: signal.title,
              message: signal.message,
              personaId: signal.personaId || sessionPersona.id,
              timing: signal.timing,
              metadata: signal.metadata,
            });
          }
        });
        process.stderr.write(`[voice-agent-entry] 💚 Trust signal emitter initialized\n`);
      } catch {
        // Non-critical
      }
    } catch (pubErr) {
      process.stderr.write(
        `[voice-agent-entry] Frontend publisher failed (non-fatal): ${pubErr}\n`
      );
    }

    // =========================================================================
    // ASYNC EVENTS - Trigger background processing
    // =========================================================================
    try {
      const { emitConversationStart } = await import('../services/async-events/index.js');
      emitConversationStart({
        sessionId,
        userId: userId || 'anonymous',
        personaId: sessionPersona.id,
        isReturning: isReturningUser,
      });
      process.stderr.write(`[voice-agent-entry] 📤 conversation:start emitted\n`);
    } catch {
      // Non-critical
    }

    // =========================================================================
    // PROSODY BRIDGE - Voice analysis connection
    // =========================================================================
    try {
      const { initProsodyBridge } = await import('../conversation/humanization/index.js');
      initProsodyBridge(sessionId, userId || 'anonymous');
      process.stderr.write(`[voice-agent-entry] 🌉 Prosody bridge initialized\n`);
    } catch {
      // Non-critical
    }

    // =========================================================================
    // BUNDLE RUNTIME - Rich persona content (stories, rituals, etc.)
    // =========================================================================
    let bundleRuntime: import('../personas/bundles/index.js').BundleRuntimeEngine | undefined;
    try {
      const { createBundleRuntime } = await import('../personas/bundles/index.js');
      const { loadBundleById } = await import('../personas/bundles/loader.js');
      const bundle = await loadBundleById(sessionPersona.id);
      if (bundle) {
        bundleRuntime = await createBundleRuntime(bundle);

        // Sync relationship state from user profile
        if (userData.bundleRuntimeState) {
          bundleRuntime.updateState({
            relationshipTurns: userData.bundleRuntimeState.relationshipTurns,
            sessionCount: services.userProfile?.totalConversations || 0,
            userName: userData.name,
          });
        }
        process.stderr.write(
          `[voice-agent-entry] 📦 Bundle runtime initialized (stage: ${bundleRuntime.getRelationshipStageName()})\n`
        );
      }
    } catch (bundleErr) {
      process.stderr.write(`[voice-agent-entry] Bundle runtime (non-fatal): ${bundleErr}\n`);
    }

    // =========================================================================
    // UNIFIED CONVERSATION HUMANIZATION - Voice print, memory, breathing sync
    // =========================================================================
    try {
      const { initConversationSession } =
        await import('./integrations/conversation-session-integration.js');
      const conversationSession = await initConversationSession({
        sessionId,
        userId: userId || 'anonymous',
        personaId: sessionPersona.id,
        sessionCount: services.userProfile?.totalConversations,
        relationshipStage: services.userProfile?.relationshipStage as
          | 'stranger'
          | 'acquaintance'
          | 'friend'
          | 'trusted_advisor'
          | undefined,
        // Pass userProfile for superhuman memory callbacks (birthdays, growth celebrations, etc.)
        userProfile: services.userProfile
          ? { humanMemory: services.userProfile.humanMemory }
          : undefined,
      });

      if (conversationSession) {
        process.stderr.write(`[voice-agent-entry] 🎭 Unified conversation session initialized\n`);
      }

      // Load persisted humanization data
      const { initializeFromPersistence } =
        await import('../conversation/humanization/persistence.js');
      await initializeFromPersistence(userId || 'anonymous', sessionId);
    } catch (humanizationErr) {
      process.stderr.write(
        `[voice-agent-entry] Humanization init (non-fatal): ${humanizationErr}\n`
      );
    }

    // =========================================================================
    // VOICE HUMANIZATION INIT - Feature flags, metrics, response anticipation
    // =========================================================================
    try {
      const { setupVoiceHumanizationInit } =
        await import('./voice-agent/voice-humanization-init-handler.js');
      setupVoiceHumanizationInit({
        sessionId,
        sessionPersona,
        userId,
        userProfile: services.userProfile,
      });
      process.stderr.write(`[voice-agent-entry] 🎤 Voice humanization init complete\n`);
    } catch {
      // Non-critical
    }

    // =========================================================================
    // PARALLEL NON-CRITICAL SERVICES
    // =========================================================================
    await Promise.allSettled([
      // Engagement data sender
      (async () => {
        try {
          const mod = await import('../services/engagement-data-sender.js');
          const engagementDataSender = mod.getEngagementDataSender();
          // FIX AUDIT ISSUE: Use structural typing - ctx.room has localParticipant with publishData
          // which matches LiveKitRoomLike interface. Cast to that interface type.
          engagementDataSender.setRoom(
            ctx.room as Parameters<typeof engagementDataSender.setRoom>[0]
          );
          if (userId) {
            await engagementDataSender.sendEngagementData(userId);
          }
        } catch {
          // Non-critical
        }
      })(),
      // Cognitive session start
      (async () => {
        try {
          const { onCognitiveSessionStart } =
            await import('../services/cognitive-session-hooks.js');
          await onCognitiveSessionStart({
            userId: userId || 'anonymous',
            personaId: sessionPersona.id,
            userProfile: services.userProfile,
            sessionId,
          });
        } catch {
          // Non-critical
        }
      })(),
      // Game engine initialization
      (async () => {
        try {
          const { getSessionGameEngine } = await import('../services/games/index.js');
          const engine = getSessionGameEngine(sessionId, sessionPersona.id);
          if (userId) {
            await engine.initializeForUser(userId);
          }
        } catch {
          // Non-critical
        }
      })(),
    ]);

    // =========================================================================
    // STEP 7: GREETING
    // =========================================================================
    devStage('greeting', 'tts');
    currentPhase = 'greeting';
    process.stderr.write(`[voice-agent-entry] 🎤 Speaking greeting...\n`);

    // Use the full greeting handler for best experience
    try {
      const greetingResult = await generateAndSpeakGreeting({
        sessionPersona: sessionPersona,
        services,
        userData,
        sessionId,
        userId,
        userName,
        isReturningUser,
        bundleRuntime, // Now using actual bundle runtime
        utilitiesProactiveOpener: undefined,
        session,
        tagGreeting: (text) => text, // Simple passthrough - full SSML tagging not needed for lightweight
      });

      // Store greeting text so LLM knows what it said (prevents confusion/duplicate greetings)
      if (greetingResult.greeting) {
        userData.greetingText = greetingResult.greeting;
        userData.greetingInjected = false; // Will be injected on first turn
      }
    } catch (greetingErr) {
      // Fallback to simple greeting via coordinated speech
      process.stderr.write(
        `[voice-agent-entry] Greeting handler failed, using fallback: ${greetingErr}\n`
      );
      const fallbackGreeting = `Hey there! I'm ${sessionPersona.name}. How can I help you today?`;
      // FIX: Disable interruptions for greeting - iOS background noise was cutting it off
      coordinatedSay(sessionId, fallbackGreeting, { allowInterruptions: false });
      // Store fallback greeting too
      userData.greetingText = fallbackGreeting;
      userData.greetingInjected = false;
      // OPTIMIZATION: Removed 2s blocking delay - greeting plays asynchronously
      // The session continues initializing while greeting plays (non-blocking)
    }

    process.stderr.write(
      `[voice-agent-entry] ✅ Session fully initialized in ${Date.now() - startTime}ms!\n`
    );

    // =========================================================================
    // STEP 8: RUN UNTIL DISCONNECT
    // =========================================================================
    devStage('session_running');
    currentPhase = 'running';

    // Monitor connection state with cleanup tracking
    const connectionStateHandler = (state: unknown) => {
      process.stderr.write(`[voice-agent-entry] 🔌 Connection state: ${state}\n`);
    };
    ctx.room.on('connectionStateChanged', connectionStateHandler);
    cleanupTracker.register('event', 'room.connectionStateChanged', () => {
      ctx.room.off('connectionStateChanged', connectionStateHandler);
    });

    const reconnectingHandler = () => {
      process.stderr.write(`[voice-agent-entry] 🔌 Reconnecting...\n`);
    };
    ctx.room.on('reconnecting', reconnectingHandler);
    cleanupTracker.register('event', 'room.reconnecting', () => {
      ctx.room.off('reconnecting', reconnectingHandler);
    });

    const reconnectedHandler = () => {
      process.stderr.write(`[voice-agent-entry] 🔌 Reconnected!\n`);
    };
    ctx.room.on('reconnected', reconnectedHandler);
    cleanupTracker.register('event', 'room.reconnected', () => {
      ctx.room.off('reconnected', reconnectedHandler);
    });

    // Wait for disconnect - capture the reason with full diagnostics
    await new Promise<void>((resolve) => {
      ctx.room.on('disconnected', (reason?: unknown) => {
        const disconnectReason = String(reason || 'unknown');
        const sessionDurationMs = Date.now() - startTime;

        // 🚨 ENHANCED DISCONNECT DIAGNOSTICS
        void (async () => {
          try {
            // Import diagnostics module for rich context
            const { logDisconnect, analyzeDisconnect } =
              await import('./shared/disconnect-diagnostics.js');
            const { recordConnectionDrop } = await import('./shared/crash-analytics.js');

            // Get participant count if available
            const participantCount = ctx.room.remoteParticipants?.size ?? 0;

            // Log with full diagnostic context
            logDisconnect({
              sessionId,
              roomName,
              reason: disconnectReason,
              durationMs: sessionDurationMs,
              turnCount: session?.turnCount,
              participantCount: participantCount + 1, // +1 for agent
              wasActive: sessionDurationMs > 30000, // Consider active if > 30s
              userId,
              personaId: persona?.id,
            });

            // Also record in crash analytics
            const analysis = analyzeDisconnect({
              sessionId,
              roomName,
              reason: disconnectReason,
              durationMs: sessionDurationMs,
            });
            recordConnectionDrop(sessionId, disconnectReason, analysis.wasGraceful);
          } catch (e) {
            // Fallback to basic logging if diagnostics fail
            process.stderr.write(
              `[voice-agent-entry] 🔌 Disconnected (reason: ${disconnectReason}, duration: ${sessionDurationMs}ms)\n`
            );
            process.stderr.write(
              `[voice-agent-entry] Failed to capture disconnect diagnostics: ${e}\n`
            );
          }
        })();

        resolve();
      });
    });

    e2e.sessionEnded(jobId, 'disconnected', Date.now() - startTime);

    // End FinOps cost tracking and record final costs
    const sessionDurationMs = Date.now() - startTime;
    const sessionDurationMinutes = sessionDurationMs / 60000;
    finops.recordLiveKitCost({
      durationMinutes: sessionDurationMinutes,
      userId,
      sessionId,
      tier: finopsTier,
    });
    const finopsSession = finops.endSession(sessionId);
    if (finopsSession) {
      process.stderr.write(
        `[voice-agent-entry] 💰 FinOps: Session cost $${finopsSession.totalCost.toFixed(4)} (${sessionDurationMinutes.toFixed(1)} min, tier: ${finopsSession.tier})\n`
      );
    }

    // Run event cleanup registry (cleans up all registered event handlers)
    process.stderr.write(`[voice-agent-entry] 🧹 Running event cleanup registry...\n`);
    const registryResult = await runSessionCleanup(sessionId);
    process.stderr.write(
      `[voice-agent-entry] 🧹 Registry cleanup: ${registryResult.cleaned} cleaned, ${registryResult.errors} errors, ${registryResult.totalDurationMs}ms\n`
    );

    // Clear current active session (used by native tools for location fallback)
    clearCurrentActiveSession();

    // Run cleanup
    process.stderr.write(`[voice-agent-entry] 🧹 Running cleanup handlers...\n`);
    await handleSessionCleanup({
      sessionId,
      userId,
      services,
      sessionPersona,
      voiceHumanization, // Now using actual voice humanization
      utilitiesCleanup: undefined,
      patternAnalyzer,
      autoOptimizer,
      feedbackCollector,
      dataChannelCleanup: dataChannelResult.cleanup,
      handoffHandler: eventHandlerResult.handler,
      cameoCleanup: undefined,
      musicCleanup: musicResult.cleanup,
      userData,
      stopPeriodicSync,
    });

    // Run additional cleanup handlers
    for (const cleanup of cleanupHandlers) {
      try {
        await cleanup();
      } catch {
        /* ignore cleanup errors */
      }
    }

    process.stderr.write(`[voice-agent-entry] Session ended cleanly.\n`);

    // Unregister session from crash analytics (clean exit)
    unregisterSession(sessionId, 'clean_exit');
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    e2e.captureError('SESSION', errObj, { jobId, roomName, phase: currentPhase });
    process.stderr.write(`[voice-agent-entry] ERROR in phase ${currentPhase}: ${error}\n`);

    // Record crash in crash analytics
    recordCrash('uncaught_exception', errObj, sessionId, {
      roomName,
      connectionState: currentPhase,
    });

    // Try AI diagnosis
    try {
      const selfHealing = await import('../services/self-healing/index.js');
      const diagnosis = await selfHealing.analyzeFailure([errObj.message, errObj.stack || ''], {
        jobId,
        stage: currentPhase === 'deps' || currentPhase === 'persona' ? 'entry' : 'session',
        timing: { totalMs: Date.now() - startTime },
        errorType: errObj.name,
        errorMessage: errObj.message,
      });

      e2e.custom('DIAGNOSIS', `AI analysis for session ${jobId}`, {
        phase: currentPhase,
        rootCause: diagnosis.rootCause,
        confidence: diagnosis.confidence,
        autoFixable: diagnosis.autoFixable,
      });

      if (session && ctx.room.isConnected && diagnosis.humanExplanation) {
        const humanized = humanizeError(errObj);
        if (humanized.shouldNotifyUser) {
          try {
            // Use coordinated speech for error messages
            coordinatedSay(sessionId, humanized.userMessage, { allowInterruptions: true });
          } catch {
            /* can't speak */
          }
        }
      }
    } catch {
      /* diagnosis is best-effort */
    }

    // Run event cleanup registry even on error
    try {
      const registryResult = await runSessionCleanup(sessionId);
      process.stderr.write(
        `[voice-agent-entry] 🧹 Registry cleanup on error: ${registryResult.cleaned} cleaned\n`
      );
    } catch {
      /* ignore registry cleanup errors */
    }

    // Run cleanup handlers even on error
    for (const cleanup of cleanupHandlers) {
      try {
        await cleanup();
      } catch {
        /* ignore */
      }
    }

    // Keep room connected if possible
    try {
      if (!ctx.room.isConnected) await ctx.connect();
      await new Promise<void>((resolve) => {
        ctx.room.on('disconnected', () => resolve());
      });
    } catch {
      /* ignore */
    }

    // Unregister session from crash analytics (crash exit)
    unregisterSession(sessionId, `crash_in_${currentPhase}`);
  }
}
