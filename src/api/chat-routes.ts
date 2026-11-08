/**
 * Chat API Routes
 *
 * Text-based chat interface that routes through the same tool system as voice.
 * Enables CLI and web chat interfaces to test the full platform.
 *
 * Endpoints:
 * - POST /api/chat/message - Send a message, get response with tool execution (WEB_CHAT_MESSAGE, off)
 * - POST /api/chat/tool - Execute a specific tool directly (WEB_CHAT_MESSAGE, off)
 * - GET /api/chat/tools - List available tools for a user
 */

import type { IncomingMessage, ServerResponse } from 'http';

import { claimedUserFor } from './acting-user.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { type ChatCaller, offeredChatTools, refuseChatTool } from './chat-tool-access.js';
import { refuseUnadmittedCaller } from './admission.js';
import { chatHold, chatToolContext } from './chat-minor-care.js';
import { handleCorsPreflightIfNeeded, parseBody, sendError, sendJSON } from './helpers.js';
import { flagOn } from '../config/env-flag.js';
import { createLogger } from '../utils/safe-logger.js';
import { executeTool } from '../agents/shared/tool-dispatcher.js';
import { GEMINI_MODEL, getGeminiClient } from '../config/gemini-config.js';

const log = createLogger({ module: 'ChatAPI' });

/** The slice of the @google/genai client the chat route uses. */
interface ChatGeminiClient {
  models: {
    generateContent: (req: unknown) => Promise<{
      text?: string;
      functionCalls?: Array<{ name?: string; args?: Record<string, unknown> }>;
    }>;
  };
}

interface ChatMessageRequest {
  message: string;
  userId?: string;
  personaId?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  source?: string;
  /** Originating platform (whatsapp, telegram, discord, slack, web, voice) */
  platform?: string;
  verbose?: boolean;
}

interface ToolExecuteRequest {
  fn: string;
  args: Record<string, unknown>;
  userId?: string;
  source?: string;
  /** 'admin': an admin running a tool outside the offered list (logged). */
  grant?: string;
}

interface ChatResponse {
  success: boolean;
  response?: string;
  toolCalls?: Array<{
    fn: string;
    args: Record<string, unknown>;
    result: unknown;
    success: boolean;
    durationMs?: number;
  }>;
  error?: string;
}

// ============================================================================
// LLM INTEGRATION
// ============================================================================

/**
 * Process a message through the LLM with tool calling
 */
async function processMessageWithLLM(
  message: string,
  personaId: string,
  tools: ChatToolDefinition[],
  conversationHistory: Array<{ role: string; content: string }> = [],
  note = '' // MINOR_CARE_NOTE for a held caller (chat-minor-care.ts)
): Promise<{ response: string; toolCalls: Array<{ fn: string; args: Record<string, unknown> }> }> {
  // Build system prompt
  const systemPrompt = `${buildSystemPrompt(personaId, tools)}${note && `\n\n${note}`}`;

  // Build messages
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  return callLLMWithTools(messages, tools);
}

/**
 * Build system prompt for chat
 */
function buildSystemPrompt(
  personaId: string,
  tools: Array<{ name: string; description: string; parameters?: Record<string, unknown> }>
): string {
  const personaPrompts: Record<string, string> = {
    ferni: `You are Ferni, a warm and supportive AI companion. You help users with their daily life, memories, relationships, and personal growth. You're conversational, empathetic, and genuinely care about the user's wellbeing.`,
    maya: `You are Maya, a wellness and mindfulness coach. You specialize in habits, self-care, and emotional wellbeing. You're calm, encouraging, and focused on sustainable growth.`,
    alex: `You are Alex, a productivity and communication specialist. You help with calendar management, emails, and professional communications. You're efficient and action-oriented.`,
    jordan: `You are Jordan, a life planning and milestone coach. You help users celebrate achievements and plan for the future. You're enthusiastic and forward-looking.`,
    peter: `You are Peter, a research and knowledge specialist. You help users explore topics deeply and find reliable information. You're curious and thorough.`,
    nayan: `You are Nayan, a wisdom and meaning guide. You help users reflect on life's big questions and find purpose. You're thoughtful and philosophical.`,
  };

  const basePrompt = personaPrompts[personaId] || personaPrompts.ferni;

  const toolInstructions = `
When you need to take an action or retrieve information, call a function. Do not write JSON or function names in your reply.

Available tools:
${tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')}

After a function returns, incorporate the result naturally. If no tool is needed, just respond.
`;

  return `${basePrompt}\n\n${toolInstructions}`;
}

interface ChatToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

/** The tools this caller is offered: the only ones either route runs (chat-tool-access.ts). */
async function offeredFor(caller: ChatCaller): Promise<ChatToolDefinition[]> {
  return offeredChatTools(await getToolDefinitionsForChat(caller.userId), caller.isAdmin);
}

/** The chat catalog: the same for every user and persona today. */
async function getToolDefinitionsForChat(_userId: string): Promise<ChatToolDefinition[]> {
  return [
    {
      name: 'playMusic',
      description: 'Play music by query, genre, mood, or artist',
      parameters: { type: 'object', properties: { query: { type: 'string' } } },
    },
    {
      name: 'stopMusic',
      description: 'Stop currently playing music',
    },
    {
      name: 'getCalendarEvents',
      description: 'Get upcoming calendar events',
      parameters: { type: 'object', properties: { days: { type: 'number', default: 7 } } },
    },
    {
      name: 'createCalendarEvent',
      description: 'Create a new calendar event',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          date: { type: 'string' },
          time: { type: 'string' },
          attendees: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    {
      name: 'rememberAboutUser',
      description: 'Remember a fact about the user',
      parameters: {
        type: 'object',
        properties: {
          fact: { type: 'string' },
          category: { type: 'string' },
        },
      },
    },
    {
      name: 'recallFromMemory',
      description: 'Search memories about the user or their contacts',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          about: { type: 'string', description: 'Person or topic to search for' },
        },
      },
    },
    {
      name: 'searchContacts',
      description: 'Search user contacts by name',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
      },
    },
    {
      name: 'getWeather',
      description: 'Get current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string' },
        },
      },
    },
    {
      name: 'setReminder',
      description: 'Set a reminder for the user',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          time: { type: 'string' },
        },
      },
    },
    {
      name: 'trackHabit',
      description: 'Log a habit completion',
      parameters: {
        type: 'object',
        properties: {
          habitName: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
    {
      name: 'getHabitStreak',
      description: 'Get streak information for a habit',
      parameters: {
        type: 'object',
        properties: {
          habitName: { type: 'string' },
        },
      },
    },
    {
      name: 'sendEmail',
      description: 'Send an email on behalf of the user',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' },
        },
      },
    },
    {
      name: 'getUnreadEmails',
      description: 'Get summary of unread emails',
    },
    {
      name: 'scheduleCall',
      description: 'Schedule a call for a future time',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          scheduledTime: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
    // OpenClaw messaging tools
    {
      name: 'sendWhatsApp',
      description: 'Send a WhatsApp message to a contact',
      parameters: {
        type: 'object',
        properties: {
          recipient: { type: 'string', description: 'Contact name or phone number' },
          message: { type: 'string', description: 'Message text to send' },
        },
      },
    },
    {
      name: 'sendTelegram',
      description: 'Send a Telegram message to a contact',
      parameters: {
        type: 'object',
        properties: {
          recipient: { type: 'string', description: 'Contact name or username' },
          message: { type: 'string', description: 'Message text to send' },
        },
      },
    },
    {
      name: 'sendDiscord',
      description: 'Send a Discord message to a user or channel',
      parameters: {
        type: 'object',
        properties: {
          recipient: { type: 'string', description: 'User or channel name' },
          message: { type: 'string', description: 'Message text to send' },
        },
      },
    },
    {
      name: 'sendSlack',
      description: 'Send a Slack message to a user or channel',
      parameters: {
        type: 'object',
        properties: {
          recipient: { type: 'string', description: 'User or channel name' },
          message: { type: 'string', description: 'Message text to send' },
        },
      },
    },
    {
      name: 'sendMessageChannel',
      description:
        'Send a message via the best available channel (auto-selects WhatsApp, Telegram, etc.)',
      parameters: {
        type: 'object',
        properties: {
          recipient: { type: 'string', description: 'Contact name or identifier' },
          message: { type: 'string', description: 'Message text to send' },
        },
      },
    },
  ];
}

/**
 * Call LLM with tool support
 */
async function callLLMWithTools(
  messages: Array<{ role: string; content: string }>,
  _tools: Array<{ name: string; description: string; parameters?: Record<string, unknown> }>
): Promise<{ response: string; toolCalls: Array<{ fn: string; args: Record<string, unknown> }> }> {
  // The shared client: Vertex on the configured location, never the API-key Developer API.
  const client = (await getGeminiClient()) as ChatGeminiClient | null;
  if (!client) throw new Error('Gemini client not configured');
  const functionDeclarations = _tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters ?? { type: 'object', properties: {} },
  }));

  // Convert messages to Gemini format
  const geminiMessages = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const result = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: geminiMessages,
    config: {
      temperature: 0.7,
      maxOutputTokens: 1024,
      tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
    },
  });

  const responseText = result.text ?? '';
  const toolCalls = (result.functionCalls ?? [])
    .filter((call) => typeof call.name === 'string' && call.name.length > 0)
    .map((call) => ({ fn: call.name as string, args: call.args ?? {} }));

  return {
    response: responseText,
    toolCalls,
  };
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * Handle chat routes
 */
export async function handleChatRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!pathname.startsWith('/api/chat')) {
    return false;
  }

  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // WEB_CHAT_MESSAGE (off): no crisis read runs on the text either route takes, so both are
  // off until one does. 404 before auth: nothing is read, called or written.
  if (
    (pathname === '/api/chat/message' || pathname === '/api/chat/tool') &&
    !flagOn('WEB_CHAT_MESSAGE')
  ) {
    sendError(res, 'Not found', 404);
    return true;
  }

  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
    return true;
  }

  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth || (await refuseUnadmittedCaller(auth, res))) return true; // WAITLIST_GATE: chat is Ferni too

  try {
    // POST /api/chat/message - Send a message
    if (pathname === '/api/chat/message' && req.method === 'POST') {
      const body = await parseBody<ChatMessageRequest>(req);

      if (!body.message) {
        sendError(res, 'Message is required', 400);
        return true;
      }

      // Tools run as this user (memories, calendar, email): only the caller may be named.
      const userId = claimedUserFor(auth, body.userId, res);
      if (!userId) return true;
      const personaId = body.personaId || 'ferni';

      log.info(
        {
          userId,
          personaId,
          messageLength: body.message.length,
          source: body.source,
          platform: body.platform,
        },
        'Processing chat message'
      );

      // Process message through LLM; a held caller's reply promises no memory (chat-minor-care.ts)
      const [offered, hold] = await Promise.all([offeredFor(auth), chatHold(userId)]);
      const llmResult = await processMessageWithLLM(
        body.message,
        personaId,
        offered,
        body.conversationHistory,
        hold.note
      );

      // Execute any tool calls
      const executedTools: ChatResponse['toolCalls'] = [];

      for (const toolCall of llmResult.toolCalls) {
        // The model's pick is steered by the client's message and history
        if (refuseChatTool(toolCall.fn, { ...auth, actingUserId: userId }, offered)) {
          executedTools.push({ ...toolCall, result: 'Not available in text chat', success: false });
          continue;
        }
        const startTime = Date.now();
        try {
          const result = await executeTool(
            { name: toolCall.fn, args: toolCall.args },
            chatToolContext(userId, hold, body.message, personaId)
          );

          executedTools.push({
            fn: toolCall.fn,
            args: toolCall.args,
            result: result.result,
            success: result.success,
            durationMs: Date.now() - startTime,
          });
        } catch (err) {
          executedTools.push({
            fn: toolCall.fn,
            args: toolCall.args,
            result: String(err),
            success: false,
            durationMs: Date.now() - startTime,
          });
        }
      }

      sendJSON(res, {
        success: true,
        response: llmResult.response,
        toolCalls: executedTools.length > 0 ? executedTools : undefined,
      } satisfies ChatResponse);
      return true;
    }

    // POST /api/chat/tool - Execute a tool directly
    if (pathname === '/api/chat/tool' && req.method === 'POST') {
      const body = await parseBody<ToolExecuteRequest>(req);

      if (!body.fn) {
        sendError(res, 'Tool name (fn) is required', 400);
        return true;
      }
      const userId = claimedUserFor(auth, body.userId, res);
      if (!userId) return true;
      const caller = { ...auth, actingUserId: userId };
      if (refuseChatTool(body.fn, caller, await offeredFor(auth), body.grant)) {
        sendError(res, 'Not authorized to run this tool', 403);
        return true;
      }
      log.info({ userId, tool: body.fn }, 'Executing tool directly');
      const startTime = Date.now();
      const result = await executeTool(
        { name: body.fn, args: body.args || {} },
        chatToolContext(userId, await chatHold(userId), `Direct tool call: ${body.fn}`)
      );

      sendJSON(res, {
        success: result.success,
        result: result.result,
        error: result.error,
        durationMs: Date.now() - startTime,
      });
      return true;
    }

    // GET /api/chat/tools - List available tools
    if (pathname === '/api/chat/tools' && req.method === 'GET') {
      const tools = await offeredFor(auth);

      sendJSON(res, {
        success: true,
        tools: tools.map((t) => ({ name: t.name, description: t.description, domain: 'general' })),
      });
      return true;
    }

    sendError(res, 'Not found', 404);
    return true;
  } catch (err) {
    log.error({ error: err }, 'Chat route error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}
