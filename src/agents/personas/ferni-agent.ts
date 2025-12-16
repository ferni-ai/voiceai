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
import { z } from 'zod';

import { createLogger } from '../../utils/safe-logger.js';
import type { UserProfile } from '../../types/user-profile.js';
import type { ToolContext } from '../../tools/registry/types.js';

const log = createLogger({ module: 'FerniAgent' });

// ============================================================================
// TYPES
// ============================================================================

interface FerniSessionData {
  userId?: string;
  userName?: string;
  userProfile?: UserProfile | null;
  personaId?: string;
  isReturningUser?: boolean;
  isFirstConversation?: boolean;
  [key: string]: unknown;
}

// Tool context type from LiveKit - properly typed for function tools
type ToolSet = llm.ToolContext<FerniSessionData>;

export interface FerniAgentOptions {
  /** Chat context from previous agent (for handoffs) */
  chatCtx?: llm.ChatContext;
  /** Whether to skip default greeting (handled externally) */
  skipGreeting?: boolean;
  /** Session data passed from voice-agent-entry */
  userData?: FerniSessionData;
}

// ============================================================================
// DOMAIN TOOL IMPORTS
// ============================================================================

// Memory tools - persistence and recall
import {
  rememberAboutUserDef,
  recallFromMemoryDef,
  recallPreviousConversationDef,
  rememberImportantFactDef,
  getRelationshipSummaryDef,
  updateMemoryDef,
  forgetMemoryDef,
} from '../../tools/domains/memory/tools.js';

// Entertainment tools - music playback (lazy loaded)
import { createMusicTools } from '../../tools/music.js';

// Information tools - weather, news, sports, search
import { definitions as informationToolDefs } from '../../tools/domains/information/index.js';

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
 * Build handoff tools for team member switching.
 * These follow the clean LiveKit 1.0 pattern.
 */
function buildHandoffTools(): ToolSet {
  return {
    handoffToMaya: llm.tool({
      description:
        'Transfer to Maya for habits, budgeting, spending tracking, financial wellness, and building sustainable routines. Maya is warm and practical.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { MayaAgent } = await import('./maya-agent.js');
        return llm.handoff({
          agent: new MayaAgent(ctx.session.chatCtx),
          returns: 'Connecting you with Maya - she is incredible with habits and budgeting.',
        });
      },
    }),

    handoffToAlex: llm.tool({
      description:
        'Transfer to Alex for calendar management, email drafting, scheduling, and communication coaching. Alex is efficient and organized.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { AlexAgent } = await import('./alex-agent.js');
        return llm.handoff({
          agent: new AlexAgent(ctx.session.chatCtx),
          returns:
            'Connecting you with Alex - they handle calendar and communications like nobody else.',
        });
      },
    }),

    handoffToPeter: llm.tool({
      description:
        'Transfer to Peter for investment analysis, stock research, market patterns, and financial insights. Peter is analytical and excited about data.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { PeterAgent } = await import('./peter-agent.js');
        return llm.handoff({
          agent: new PeterAgent(ctx.session.chatCtx),
          returns: 'Connecting you with Peter - he sees patterns nobody else sees.',
        });
      },
    }),

    handoffToJordan: llm.tool({
      description:
        'Transfer to Jordan for life planning, milestone celebrations, event planning, and navigating life transitions. Jordan is enthusiastic and celebratory.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { JordanAgent } = await import('./jordan-agent.js');
        return llm.handoff({
          agent: new JordanAgent(ctx.session.chatCtx),
          returns: 'Connecting you with Jordan - they make every milestone feel special.',
        });
      },
    }),

    handoffToNayan: llm.tool({
      description:
        'Transfer to Nayan for wisdom, philosophy, meaning of life questions, and long-term perspective. Nayan is contemplative and wise.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { NayanAgent } = await import('./nayan-agent.js');
        return llm.handoff({
          agent: new NayanAgent(ctx.session.chatCtx),
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
 * Ferni - The main life coach and orchestrator.
 *
 * Pure LiveKit 1.0 implementation with:
 * - Direct domain imports (no registry/manifest indirection)
 * - Memory tools for cross-session recall
 * - Entertainment tools for music playback
 * - Inline handoff tools for team switching
 * - Clean lifecycle hooks (onEnter/onExit)
 */
export class FerniAgent extends voice.Agent<FerniSessionData> {
  private skipGreeting: boolean;

  constructor(systemPrompt: string, options: FerniAgentOptions = {}) {
    // Build all tools from domain imports
    const memoryTools = buildMemoryTools('ferni');
    const entertainmentTools = buildEntertainmentTools();
    const informationTools = buildInformationTools('ferni');
    const handoffTools = buildHandoffTools();

    // Merge all tools
    const allTools = {
      ...memoryTools,
      ...entertainmentTools,
      ...informationTools,
      ...handoffTools,
    } as ToolSet;

    super({
      instructions: systemPrompt,
      chatCtx: options.chatCtx,
      tools: allTools,
    });

    this.skipGreeting = options.skipGreeting ?? false;

    log.info(
      {
        totalTools: Object.keys(allTools).length,
        memoryTools: Object.keys(memoryTools).length,
        entertainmentTools: Object.keys(entertainmentTools).length,
        informationTools: Object.keys(informationTools).length,
        handoffTools: Object.keys(handoffTools).length,
        skipGreeting: this.skipGreeting,
      },
      'Agent initialized with tools'
    );
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
    const userData = this.session.userData;
    const isReturning = userData?.isReturningUser ?? false;
    const userName = userData?.userName;

    let greetingInstructions = 'Greet the user warmly. Keep it natural and brief.';
    if (isReturning && userName) {
      greetingInstructions = `Welcome back ${userName} warmly. Reference that you remember them. Keep it natural.`;
    } else if (isReturning) {
      greetingInstructions =
        'Welcome them back warmly - acknowledge that you remember them. Keep it natural.';
    }

    this.session.generateReply({
      instructions: greetingInstructions,
    });
  }

  /**
   * Called when switching away from Ferni.
   * Good for farewell messages or state cleanup.
   */
  async onExit(): Promise<void> {
    log.debug('Transitioning to another agent (handoff)');
  }
}

// ============================================================================
// FACTORY FUNCTION (for compatibility with existing code)
// ============================================================================

/**
 * Create a Ferni agent with the given system prompt.
 */
export function createFerniAgent(systemPrompt: string, options?: FerniAgentOptions): FerniAgent {
  return new FerniAgent(systemPrompt, options);
}
