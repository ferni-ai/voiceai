/**
 * Alex Agent - Communication Coach & Executive Support
 *
 * Extends PersonaVoiceAgent for shared TTS processing (sanitization, FinOps, interrupt handling).
 * Clean LiveKit 1.0 Implementation with direct domain imports.
 *
 * @see https://docs.livekit.io/agents/build/agents-handoffs
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';

import { createLogger } from '../../utils/safe-logger.js';
import type { ToolContext } from '../../tools/registry/types.js';
import { loadSystemPrompt } from './prompt-loader.js';
import { PersonaVoiceAgent, type PersonaVoiceAgentOptions } from './ferni-agent.js';

const log = createLogger({ module: 'AlexAgent' });

// Memory tools - shared across all agents
import {
  rememberAboutUserDef,
  recallFromMemoryDef,
  recallPreviousConversationDef,
  rememberImportantFactDef,
  getRelationshipSummaryDef,
  updateMemoryDef,
  forgetMemoryDef,
} from '../../tools/domains/memory/tools.js';

// Communication tools (from domains)
import { createCommunicationSpecialistTools as createCommunicationTools } from '../../tools/domains/communication/index.js';

// Conversation tools - wrap up, end conversation, graceful exit (from domains)
import { createConversationTools } from '../../tools/domains/conversation/index.js';

import { getToolDescription } from '../../tools/utils/tool-descriptions.js';
// ============================================================================
// TYPES
// ============================================================================

// AlexAgent uses PersonaVoiceAgent's session data type
type ToolSet = llm.ToolContext<Record<string, unknown>>;

// ============================================================================
// TOOL BUILDING HELPERS
// ============================================================================

const minimalServices = {
  has: () => false,
  get: () => {
    throw new Error('Service not available');
  },
  getOptional: () => undefined,
};

function buildMemoryTools(agentId: string): ToolSet {
  const ctx: ToolContext = {
    agentId,
    agentDisplayName: 'Alex',
    userId: 'default',
    services: minimalServices,
  };

  return {
    rememberAboutUser: rememberAboutUserDef.create(ctx),
    recallFromMemory: recallFromMemoryDef.create(ctx),
    recallPreviousConversation: recallPreviousConversationDef.create(ctx),
    rememberImportantFact: rememberImportantFactDef.create(ctx),
    getRelationshipSummary: getRelationshipSummaryDef.create(ctx),
    updateMemory: updateMemoryDef.create(ctx),
    forgetMemory: forgetMemoryDef.create(ctx),
  } as unknown as ToolSet;
}

function buildCommunicationTools(): ToolSet {
  const commTools = createCommunicationTools();
  return {
    // Email workflow
    draftEmail: commTools.draftEmail,
    sendApprovedEmail: commTools.sendApprovedEmail,
    // Text/voice
    sendTextMessage: commTools.sendTextMessage,
    makePhoneCall: commTools.makePhoneCall,
    sendVoiceMessage: commTools.sendVoiceMessage,
    // Scheduling
    checkAvailability: commTools.checkAvailability,
    scheduleCall: commTools.scheduleCall,
    // Reminders
    setReminder: commTools.setReminder,
    listReminders: commTools.listReminders,
    cancelReminder: commTools.cancelReminder,
    // Contacts
    saveContactInfo: commTools.saveContactInfo,
    getCommunicationSummary: commTools.getCommunicationSummary,
  } as unknown as ToolSet;
}

function buildHandoffTools(): ToolSet {
  return {
    handoffToFerni: llm.tool({
      description: getToolDescription('handoffToFerni'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { FerniAgent } = await import('./ferni-agent.js');
        const fs = await import('fs/promises');
        const { fileURLToPath } = await import('url');
        const { dirname, join } = await import('path');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);

        let systemPrompt = 'You are Ferni, a warm life coach.';
        try {
          systemPrompt = await fs.readFile(
            join(__dirname, '../../personas/bundles/ferni/identity/system-prompt.md'),
            'utf-8'
          );
        } catch {
          // Fallback
        }

        return llm.handoff({
          agent: new FerniAgent(systemPrompt, { chatCtx: ctx.session.chatCtx }),
          returns: 'Connecting you back to Ferni!',
        });
      },
    }),

    handoffToMaya: llm.tool({
      description: getToolDescription('handoffToMaya'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { MayaAgent } = await import('./maya-agent.js');
        return llm.handoff({
          agent: await MayaAgent.create(ctx.session.chatCtx),
          returns: 'Connecting you with Maya for habits and wellness!',
        });
      },
    }),
  } as unknown as ToolSet;
}

// ============================================================================
// ALEX AGENT
// ============================================================================

/**
 * Alex Chen - Communication Coach & Executive Support
 *
 * Extends PersonaVoiceAgent for shared TTS processing.
 * Rich system prompt loaded from bundles/alex-chen/identity/system-prompt.md
 */
// @ts-ignore TS2417 - static create() has different signature than base Agent.create()
export class AlexAgent extends PersonaVoiceAgent {
  private static systemPromptCache: string | null = null;

  constructor(systemPrompt: string, options?: PersonaVoiceAgentOptions) {
    const memoryTools = buildMemoryTools('alex-chen');
    const communicationTools = buildCommunicationTools();
    const handoffTools = buildHandoffTools();

    const conversationTools = createConversationTools();
    const allTools = {
      ...memoryTools,
      ...communicationTools,
      ...handoffTools,
      ...conversationTools,
    } as unknown as ToolSet;

    // Pass tools to PersonaVoiceAgent (which passes to voice.Agent)
    super(systemPrompt, {
      ...options,
      tools: allTools,
      skipGreeting: true, // Greeting handled by handoff-handler.ts
    });

    log.info({ totalTools: Object.keys(allTools).length }, 'AlexAgent initialized');
  }

  static async create(chatCtx?: llm.ChatContext): Promise<AlexAgent> {
    if (!AlexAgent.systemPromptCache) {
      AlexAgent.systemPromptCache = await loadSystemPrompt('alex-chen');
    }
    return new AlexAgent(AlexAgent.systemPromptCache, { chatCtx });
  }

  /**
   * Called when Alex becomes the active agent.
   * NOTE: Greeting handled by handoff-handler.ts to avoid competing systems.
   */
  async onEnter(): Promise<void> {
    log.debug('Alex onEnter - greeting will be handled by handoff handler');
  }

  async onExit(): Promise<void> {
    log.debug('Transitioning to another agent');
  }
}

export async function createAlexAgent(chatCtx?: llm.ChatContext): Promise<AlexAgent> {
  return AlexAgent.create(chatCtx);
}
