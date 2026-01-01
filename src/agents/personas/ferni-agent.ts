/**
 * Ferni Agent - Clean LiveKit 1.0 Implementation
 *
 * This follows the LiveKit Agents 1.0 pattern:
 * - Tools defined inline or imported directly from domains
 * - Handoffs are just tools that return llm.handoff()
 * - No registry/manifest indirection - direct domain imports
 * - System prompt is personality only, no tool documentation
 *
 * @see https://docs.livekit.io/agents/build/tools
 * @see https://docs.livekit.io/agents/build/agents-handoffs
 */

import { llm, voice } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { z } from 'zod';

import type { ToolContext } from '../../tools/registry/types.js';
import type { UserProfile } from '../../types/user-profile.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  clearInterruptFlags,
  extractTtsSessionContext,
  wrappedTtsNode,
} from '../shared/tts-wrapper.js';
// Centralized generateReply gateway - NEVER use session.generateReply directly!
import { generateReply } from '../shared/generate-reply-gateway.js';
// Safe fire-and-forget for non-critical async operations
import { fireAndForget } from '../../utils/safe-fire-and-forget.js';

const log = createLogger({ module: 'FerniAgent' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Session data for PersonaVoiceAgent instances.
 * @alias FerniSessionData - Backwards compatibility alias
 */
interface PersonaSessionData {
  userId?: string;
  userName?: string;
  userProfile?: UserProfile | null;
  personaId?: string;
  isReturningUser?: boolean;
  isFirstConversation?: boolean;
  [key: string]: unknown;
}

// Tool context type from LiveKit - properly typed for function tools
type ToolSet = llm.ToolContext<PersonaSessionData>;

// Backwards compatibility type aliases
type FerniSessionData = PersonaSessionData;

/**
 * Options for creating a PersonaVoiceAgent (or FerniAgent for backwards compat).
 */
export interface PersonaVoiceAgentOptions {
  /** Chat context from previous agent (for handoffs) */
  chatCtx?: llm.ChatContext;
  /** Whether to skip default greeting (handled externally) */
  skipGreeting?: boolean;
  /** Session data passed from voice-agent-entry */
  userData?: FerniSessionData;
  /** Pre-selected tools from orchestrator (if provided, skips internal tool building) */
  tools?: ToolSet;
}

// ============================================================================
// DOMAIN TOOL IMPORTS
// ============================================================================

// Memory tools - persistence and recall
import {
  forgetMemoryDef,
  getRelationshipSummaryDef,
  recallFromMemoryDef,
  recallPreviousConversationDef,
  rememberAboutUserDef,
  rememberImportantFactDef,
  updateMemoryDef,
} from '../../tools/domains/memory/tools.js';

// Entertainment tools - music playback (from domains)
import { createMusicTools } from '../../tools/domains/entertainment/music.js';

// Conversation tools - wrap up, end conversation, graceful exit (from domains)
import { createConversationTools } from '../../tools/domains/conversation/index.js';

// Information tools - weather, news, sports, search
import { definitions as informationToolDefs } from '../../tools/domains/information/index.js';

// ============================================================================
// BETTER-THAN-HUMAN DOMAIN IMPORTS (Phase 2)
// These give Ferni the ability to ACT, not just talk
// ============================================================================

// Presence tools - grounding, breathing, mindfulness
import { definitions as presenceToolDefs } from '../../tools/domains/presence/index.js';

// Proactive tools - reminders, follow-ups, intentions
import { definitions as proactiveToolDefs } from '../../tools/domains/proactive/index.js';

// Crisis tools - emergency support
import { definitions as crisisToolDefs } from '../../tools/domains/crisis/index.js';

// Human transfer tools - professional referral, warm handoff
import { definitions as humanTransferToolDefs } from '../../tools/domains/human-transfer/index.js';

// Habits tools - goal setting, tracking
import { definitions as habitsToolDefs } from '../../tools/domains/habits/index.js';

// Wellness tools - self-care, health
import { definitions as wellnessToolDefs } from '../../tools/domains/wellness/index.js';

// Connection tools - relationship building
import { definitions as connectionToolDefs } from '../../tools/domains/connection/index.js';

import { getToolDescription } from '../../tools/utils/tool-descriptions.js';
// ============================================================================
// TOOL BUILDING HELPERS
// ============================================================================

/**
 * Build memory tools from definitions.
 * These are agent-agnostic memory tools that work with any persona.
 */
function buildMemoryTools(agentId: string): ToolSet {
  // Create a minimal service registry for tool context
  // Services will be available via session context at runtime
  const minimalServiceRegistry = {
    has: () => false,
    get: () => {
      throw new Error('Services not available in this context');
    },
    getOptional: () => undefined,
  };

  const ctx: ToolContext = {
    agentId,
    agentDisplayName: 'Ferni',
    userId: 'default', // Will be overridden by session context
    services: minimalServiceRegistry as ToolContext['services'],
  };

  return {
    rememberAboutUser: rememberAboutUserDef.create(ctx),
    recallFromMemory: recallFromMemoryDef.create(ctx),
    recallPreviousConversation: recallPreviousConversationDef.create(ctx),
    rememberImportantFact: rememberImportantFactDef.create(ctx),
    getRelationshipSummary: getRelationshipSummaryDef.create(ctx),
    updateMemory: updateMemoryDef.create(ctx),
    forgetMemory: forgetMemoryDef.create(ctx),
  } as ToolSet;
}

/**
 * Build entertainment/music tools.
 * These work for everyone - free 30-second previews via iTunes.
 */
function buildEntertainmentTools(): ToolSet {
  const musicTools = createMusicTools();
  return {
    playMusic: musicTools.playMusic,
    searchMusic: musicTools.searchMusic,
    suggestMusic: musicTools.suggestMusic,
    pauseMusic: musicTools.pauseMusic,
    resumeMusic: musicTools.resumeMusic,
    stopMusic: musicTools.stopMusic,
    setMusicVolume: musicTools.setMusicVolume,
    whatsPlaying: musicTools.whatsPlaying,
    useSpotify: musicTools.useSpotify,
    useFreePreviews: musicTools.useFreePreviews,
    discoverMusic: musicTools.discoverMusic,
    keepVibeGoing: musicTools.keepVibeGoing,
  } as ToolSet;
}

/**
 * Build information tools from the information domain.
 * Includes: weather, news, sports, web search.
 */
function buildInformationTools(agentId: string): ToolSet {
  const minimalServiceRegistry = {
    has: () => false,
    get: () => {
      throw new Error('Services not available in this context');
    },
    getOptional: () => undefined,
  };

  const ctx: ToolContext = {
    agentId,
    agentDisplayName: 'Ferni',
    userId: 'default',
    services: minimalServiceRegistry as ToolContext['services'],
  };

  const tools: Record<string, unknown> = {};
  for (const def of informationToolDefs) {
    tools[def.id] = def.create(ctx);
  }

  return tools as ToolSet;
}

/**
 * Create a standard tool context for domain tools.
 */
function createToolContext(agentId: string): ToolContext {
  const minimalServiceRegistry = {
    has: () => false,
    get: () => {
      throw new Error('Services not available in this context');
    },
    getOptional: () => undefined,
  };

  return {
    agentId,
    agentDisplayName: 'Ferni',
    userId: 'default',
    services: minimalServiceRegistry as ToolContext['services'],
  };
}

/**
 * Build presence & grounding tools.
 * Enables: breatheWithMe, groundingExercise, noticeThisMoment, protectPresence
 */
function buildPresenceTools(agentId: string): ToolSet {
  const ctx = createToolContext(agentId);
  const tools: Record<string, unknown> = {};

  for (const def of presenceToolDefs) {
    tools[def.id] = def.create(ctx);
  }

  return tools as ToolSet;
}

/**
 * Build proactive tools.
 * Enables: scheduleReminder, createFollowUp, setIntention
 */
function buildProactiveTools(agentId: string): ToolSet {
  const ctx = createToolContext(agentId);
  const tools: Record<string, unknown> = {};

  for (const def of proactiveToolDefs) {
    tools[def.id] = def.create(ctx);
  }

  return tools as ToolSet;
}

/**
 * Build crisis support tools.
 * Enables: crisis assessment and support
 */
function buildCrisisTools(agentId: string): ToolSet {
  const ctx = createToolContext(agentId);
  const tools: Record<string, unknown> = {};

  // Crisis support tools (grounding, resources, safety planning)
  for (const def of crisisToolDefs) {
    tools[def.id] = def.create(ctx);
  }

  // Human transfer tools (professional referral, warm handoff)
  for (const def of humanTransferToolDefs) {
    tools[def.id] = def.create(ctx);
  }

  return tools as ToolSet;
}

/**
 * Build habits & coaching tools.
 * Enables: setGoal, trackProgress, reviewHabits
 */
function buildHabitsTools(agentId: string): ToolSet {
  const ctx = createToolContext(agentId);
  const tools: Record<string, unknown> = {};

  for (const def of habitsToolDefs) {
    tools[def.id] = def.create(ctx);
  }

  return tools as ToolSet;
}

/**
 * Build wellness tools.
 * Enables: self-care tracking, health check-ins
 */
function buildWellnessTools(agentId: string): ToolSet {
  const ctx = createToolContext(agentId);
  const tools: Record<string, unknown> = {};

  for (const def of wellnessToolDefs) {
    tools[def.id] = def.create(ctx);
  }

  return tools as ToolSet;
}

/**
 * Build connection tools.
 * Enables: gratitude, relationship repair, check-ins
 */
function buildConnectionTools(agentId: string): ToolSet {
  const ctx = createToolContext(agentId);
  const tools: Record<string, unknown> = {};

  for (const def of connectionToolDefs) {
    tools[def.id] = def.create(ctx);
  }

  return tools as ToolSet;
}

/**
 * Build handoff tools for team member switching.
 * These follow the clean LiveKit 1.0 pattern with async prompt loading.
 *
 * IMPORTANT: Tool descriptions use imperative language to force Gemini to CALL
 * the function instead of talking about it. The key phrases are:
 * - "SILENT HANDOFF" - No speech before executing
 * - "Execute without speaking" - Don't announce the transfer
 * - "This function handles the transition" - Don't provide your own message
 */
function buildHandoffTools(): ToolSet {
  return {
    handoffToMaya: llm.tool({
      description: getToolDescription('handoffToMaya'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { MayaAgent } = await import('./maya-agent.js');
        return llm.handoff({
          agent: await MayaAgent.create(ctx.session.chatCtx),
          returns: 'Connecting you with Maya - she is incredible with habits and budgeting.',
        });
      },
    }),

    handoffToAlex: llm.tool({
      description: getToolDescription('handoffToAlex'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { AlexAgent } = await import('./alex-agent.js');
        return llm.handoff({
          agent: await AlexAgent.create(ctx.session.chatCtx),
          returns:
            'Connecting you with Alex - they handle calendar and communications like nobody else.',
        });
      },
    }),

    handoffToPeter: llm.tool({
      description: getToolDescription('handoffToPeter'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { PeterAgent } = await import('./peter-agent.js');
        return llm.handoff({
          agent: await PeterAgent.create(ctx.session.chatCtx),
          returns: 'Connecting you with Peter - he sees patterns nobody else sees.',
        });
      },
    }),

    handoffToJordan: llm.tool({
      description: getToolDescription('handoffToJordan'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { JordanAgent } = await import('./jordan-agent.js');
        return llm.handoff({
          agent: await JordanAgent.create(ctx.session.chatCtx),
          returns: 'Connecting you with Jordan - they make every milestone feel special.',
        });
      },
    }),

    handoffToNayan: llm.tool({
      description: getToolDescription('handoffToNayan'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { NayanAgent } = await import('./nayan-agent.js');
        return llm.handoff({
          agent: await NayanAgent.create(ctx.session.chatCtx),
          returns: 'Connecting you with Nayan - he thinks in decades.',
        });
      },
    }),
  } as ToolSet;
}

// ============================================================================
// FERNI AGENT
// ============================================================================

/**
 * PersonaVoiceAgent - The main voice agent for all personas.
 *
 * This agent class is used for ALL personas (Ferni, Maya, Alex, etc.).
 * The persona identity comes from the system prompt, not the class name.
 *
 * Pure LiveKit 1.0 implementation with:
 * - Direct domain imports (no registry/manifest indirection)
 * - Memory tools for cross-session recall
 * - Entertainment tools for music playback
 * - Inline handoff tools for team switching
 * - Clean lifecycle hooks (onEnter/onExit)
 *
 * @alias FerniAgent - Backwards compatibility alias
 */
export class PersonaVoiceAgent extends voice.Agent<PersonaSessionData> {
  private skipGreeting: boolean;

  constructor(systemPrompt: string, options: PersonaVoiceAgentOptions = {}) {
    // Use orchestrator-selected tools if provided, otherwise build all tools
    let allTools: ToolSet;
    let toolSource: 'orchestrator' | 'internal';

    if (options.tools) {
      // Orchestrator provided pre-selected tools - use those
      allTools = options.tools;
      toolSource = 'orchestrator';
    } else {
      // Build all tools from domain imports (legacy mode)
      const memoryTools = buildMemoryTools('ferni');
      const entertainmentTools = buildEntertainmentTools();
      const informationTools = buildInformationTools('ferni');
      const handoffTools = buildHandoffTools();

      // BETTER-THAN-HUMAN: Action-enabling tools (Phase 2)
      const presenceTools = buildPresenceTools('ferni');
      const proactiveTools = buildProactiveTools('ferni');
      const crisisTools = buildCrisisTools('ferni');
      const habitsTools = buildHabitsTools('ferni');
      const wellnessTools = buildWellnessTools('ferni');
      const connectionTools = buildConnectionTools('ferni');

      // Conversation flow tools - wrap up, end conversation, graceful exit
      const conversationTools = createConversationTools();

      // Merge all tools
      allTools = {
        ...memoryTools,
        ...entertainmentTools,
        ...informationTools,
        ...handoffTools,
        // BETTER-THAN-HUMAN tools
        ...presenceTools,
        ...proactiveTools,
        ...crisisTools,
        ...habitsTools,
        ...wellnessTools,
        ...connectionTools,
        // Conversation flow tools (goodbye handling)
        ...conversationTools,
      } as ToolSet;
      toolSource = 'internal';

      log.info(
        {
          totalTools: Object.keys(allTools).length,
          memoryTools: Object.keys(memoryTools).length,
          entertainmentTools: Object.keys(entertainmentTools).length,
          informationTools: Object.keys(informationTools).length,
          handoffTools: Object.keys(handoffTools).length,
          presenceTools: Object.keys(presenceTools).length,
          proactiveTools: Object.keys(proactiveTools).length,
          crisisTools: Object.keys(crisisTools).length,
          habitsTools: Object.keys(habitsTools).length,
          wellnessTools: Object.keys(wellnessTools).length,
          connectionTools: Object.keys(connectionTools).length,
          conversationTools: Object.keys(conversationTools).length,
          skipGreeting: options.skipGreeting ?? false,
        },
        'Agent initialized with INTERNAL tools (legacy mode - no orchestrator)'
      );
    }

    super({
      instructions: systemPrompt,
      chatCtx: options.chatCtx,
      tools: allTools,
    });

    this.skipGreeting = options.skipGreeting ?? false;

    if (toolSource === 'orchestrator') {
      const toolNamesList = Object.keys(allTools);
      const hasWeather = toolNamesList.includes('getWeather');
      const hasMusic = toolNamesList.includes('playMusic');
      log.info(
        {
          totalTools: toolNamesList.length,
          toolNames: toolNamesList.slice(0, 20),
          hasWeather,
          hasMusic,
          weatherTools: toolNamesList.filter((t) => t.toLowerCase().includes('weather')),
          skipGreeting: this.skipGreeting,
        },
        '🎯 Agent initialized with ORCHESTRATOR-selected tools'
      );
    }
  }

  /**
   * Called when Ferni becomes the active agent.
   * Generates a contextual greeting unless skipGreeting is set.
   */
  async onEnter(): Promise<void> {
    if (this.skipGreeting) {
      // Greeting handled externally (by generateAndSpeakGreeting)
      return;
    }

    // Generate a contextual greeting using session data
    const { userData } = this.session;
    const isReturning = userData?.isReturningUser ?? false;
    const userName = userData?.userName;

    // Build context-aware greeting instructions using speak pseudo-tool
    // This prevents echoing of meta-instructions - LLM outputs JSON, caught by sanitizer
    let contextHint = '';
    if (isReturning && userName) {
      contextHint = `This is ${userName}, a returning user you remember.`;
    } else if (isReturning) {
      contextHint = 'This is a returning user you remember.';
    } else {
      contextHint = 'This is a new user.';
    }

    // Generate a sessionId from available data (this agent class doesn't have sessionId directly)
    const derivedSessionId = userData?.userId ? `agent-${userData.userId}` : `agent-${Date.now()}`;

    // Use gateway for proper error handling and session readiness
    fireAndForget(async () => {
      await generateReply(this.session, derivedSessionId, {
        instructions: `You are Ferni. ${contextHint}

Generate a warm, brief greeting (1-2 sentences max).

Respond with ONLY your greeting as plain text. No JSON. No quotes. Just speak naturally.`,
        context: 'ferni-greeting',
        fallbackMessage: 'Hey! Nice to meet you.',
        priority: 'high', // Greetings are important
      });
    }, 'ferni-agent-greeting');
  }

  /**
   * Called when switching away from Ferni.
   * Good for farewell messages or state cleanup.
   */
  async onExit(): Promise<void> {
    log.debug('Transitioning to another agent (handoff)');
  }

  /**
   * Override ttsNode to filter out JSON function calls BEFORE they reach TTS.
   *
   * WORKAROUND (Dec 2024): Gemini Live API has a known bug where it "narrates"
   * tool calls instead of executing them. We instruct Gemini to output JSON like
   * {"fn":"playMusic","args":{"query":"jazz"}} and intercept it here before TTS.
   *
   * The key insight: transcriptionNode filters a DIFFERENT stream than TTS reads from!
   * The LiveKit SDK does baseStream.tee() and sends one to transcription, one to TTS.
   * So we MUST filter in ttsNode to prevent TTS from speaking the JSON.
   *
   * This uses the shared wrappedTtsNode which handles:
   * - JSON function call sanitization
   * - Interrupt-aware SSML softening
   * - FinOps cost tracking
   *
   * @see ../shared/tts-wrapper.ts
   */
  async ttsNode(
    text: NodeReadableStream<string>,
    modelSettings: voice.ModelSettings
  ): Promise<NodeReadableStream<AudioFrame> | null> {
    // Get persona ID and turn count from session
    const userData = this.session.userData as Record<string, unknown> | undefined;
    const personaId = (userData?.personaId as string) || 'ferni';
    const turnCount = (userData?.turnCount as number) || 0;

    // Use the shared TTS wrapper with explicit agent reference
    // Pass session so tool results can be spoken via safeGenerateReply
    // isFirstTurn enables more aggressive streaming optimization for faster first-audio
    return wrappedTtsNode(this, text, modelSettings, {
      tools: this._tools as Record<string, unknown> | undefined,
      sessionContext: extractTtsSessionContext(this, personaId),
      onInterruptRecoveryApplied: () => clearInterruptFlags(this),
      session: this.session,
      isFirstTurn: turnCount <= 1, // First turn gets aggressive streaming optimization
    });
  }
}

// ============================================================================
// FACTORY FUNCTION (for compatibility with existing code)
// ============================================================================

/**
 * Create a PersonaVoiceAgent with the given system prompt.
 * @alias createFerniAgent - Backwards compatibility
 */
export function createPersonaVoiceAgent(
  systemPrompt: string,
  options?: PersonaVoiceAgentOptions
): PersonaVoiceAgent {
  return new PersonaVoiceAgent(systemPrompt, options);
}

// ============================================================================
// BACKWARDS COMPATIBILITY ALIASES
// ============================================================================
// These aliases maintain compatibility with existing code that uses the old names.
// New code should use PersonaVoiceAgent, PersonaVoiceAgentOptions, createPersonaVoiceAgent.

/** @deprecated Use PersonaVoiceAgent instead */
export const FerniAgent = PersonaVoiceAgent;

/** @deprecated Use PersonaVoiceAgentOptions instead */
export type FerniAgentOptions = PersonaVoiceAgentOptions;

/** @deprecated Use createPersonaVoiceAgent instead */
export const createFerniAgent = createPersonaVoiceAgent;

/**
 * Build all Ferni tools externally (for filtering before passing to constructor).
 * This is called by voice-agent-entry when orchestrator is disabled but tool
 * filtering is still needed.
 */
export function buildAllFerniTools(agentId = 'ferni'): ToolSet {
  const memoryTools = buildMemoryTools(agentId);
  const entertainmentTools = buildEntertainmentTools();
  const informationTools = buildInformationTools(agentId);
  const handoffTools = buildHandoffTools();

  // BETTER-THAN-HUMAN: Action-enabling tools
  const presenceTools = buildPresenceTools(agentId);
  const proactiveTools = buildProactiveTools(agentId);
  const crisisTools = buildCrisisTools(agentId);
  const habitsTools = buildHabitsTools(agentId);
  const wellnessTools = buildWellnessTools(agentId);
  const connectionTools = buildConnectionTools(agentId);

  // Conversation flow tools
  const conversationTools = createConversationTools();

  log.info(
    {
      totalTools:
        Object.keys(memoryTools).length +
        Object.keys(entertainmentTools).length +
        Object.keys(informationTools).length +
        Object.keys(handoffTools).length +
        Object.keys(presenceTools).length +
        Object.keys(proactiveTools).length +
        Object.keys(crisisTools).length +
        Object.keys(habitsTools).length +
        Object.keys(wellnessTools).length +
        Object.keys(connectionTools).length +
        Object.keys(conversationTools).length,
    },
    'Building all Ferni tools for external filtering'
  );

  return {
    ...memoryTools,
    ...entertainmentTools,
    ...informationTools,
    ...handoffTools,
    ...presenceTools,
    ...proactiveTools,
    ...crisisTools,
    ...habitsTools,
    ...wellnessTools,
    ...connectionTools,
    ...conversationTools,
  } as ToolSet;
}
