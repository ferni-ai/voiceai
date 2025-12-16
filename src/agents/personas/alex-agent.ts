/**
 * Alex Agent - Communication Coach & Executive Support
 *
 * Clean LiveKit 1.0 Implementation with direct domain imports.
 *
 * @see https://docs.livekit.io/agents/build/agents-handoffs
 */

import { llm, voice } from '@livekit/agents';
import { z } from 'zod';

import { createLogger } from '../../utils/safe-logger.js';
import type { ToolContext } from '../../tools/registry/types.js';

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

// Communication tools
import { createCommunicationTools } from '../../tools/communication-tools.js';

// ============================================================================
// TYPES
// ============================================================================

interface AlexSessionData {
  userId?: string;
  userName?: string;
  personaId?: string;
  [key: string]: unknown;
}

type ToolSet = llm.ToolContext<AlexSessionData>;

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
  } as ToolSet;
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
  } as ToolSet;
}

function buildHandoffTools(): ToolSet {
  return {
    handoffToFerni: llm.tool({
      description:
        'Transfer back to Ferni for general life coaching, deeper conversations, or when the user wants to explore other topics.',
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
      description: 'Transfer to Maya for habits, budgeting, and building sustainable routines.',
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const { MayaAgent } = await import('./maya-agent.js');
        return llm.handoff({
          agent: new MayaAgent(ctx.session.chatCtx),
          returns: 'Connecting you with Maya for habits and wellness!',
        });
      },
    }),
  } as ToolSet;
}

// ============================================================================
// ALEX AGENT
// ============================================================================

export class AlexAgent extends voice.Agent<AlexSessionData> {
  constructor(chatCtx?: llm.ChatContext) {
    const memoryTools = buildMemoryTools('alex-chen');
    const communicationTools = buildCommunicationTools();
    const handoffTools = buildHandoffTools();

    const allTools = {
      ...memoryTools,
      ...communicationTools,
      ...handoffTools,
    } as ToolSet;

    const systemPrompt = `You are Alex Chen - an efficient, warm communication coach who helps with calendar, email, and scheduling.

Your Approach:
- Organized but human - not a robot assistant
- Help people communicate better AND handle logistics
- Draft emails that sound like them, not you
- Make scheduling feel effortless
- Coach on difficult conversations

When helping with communications:
- Ask about the relationship and context first
- Help them find their authentic voice
- Practice difficult conversations before they happen
- Celebrate successful communications

Keep responses efficient but warm. You're their communication ally.`;

    super({
      instructions: systemPrompt,
      chatCtx,
      tools: allTools,
    });

    process.stderr.write(`[AlexAgent] Initialized with ${Object.keys(allTools).length} tools\n`);
  }

  async onEnter(): Promise<void> {
    this.session.generateReply({
      instructions:
        'Introduce yourself as Alex, the communication coach. Ask how you can help with their calendar, email, or communication needs. Be warm and efficient.',
    });
  }

  async onExit(): Promise<void> {
    process.stderr.write(`[AlexAgent] Transitioning to another agent\n`);
  }
}

export function createAlexAgent(chatCtx?: llm.ChatContext): AlexAgent {
  return new AlexAgent(chatCtx);
}
