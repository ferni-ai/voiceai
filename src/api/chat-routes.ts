/**
 * Chat API Routes
 *
 * Text-based chat interface that routes through the same tool system as voice.
 * Enables CLI and web chat interfaces to test the full platform.
 *
 * Endpoints:
 * - POST /api/chat/message - Send a message, get response with tool execution
 * - POST /api/chat/tool - Execute a specific tool directly
 * - GET /api/chat/tools - List available tools for a user
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseBody, sendError, sendJSON } from './helpers.js';
import { createLogger } from '../utils/safe-logger.js';
import { executeJsonFunction } from '../agents/shared/json-function-executor.js';
import { GEMINI_MODEL } from '../config/gemini-config.js';

const log = createLogger({ module: 'ChatAPI' });

// ============================================================================
// TYPES
// ============================================================================

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
  userId: string,
  personaId: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<{ response: string; toolCalls: Array<{ fn: string; args: Record<string, unknown> }> }> {
  // Get available tools for this user/persona
  const tools = await getToolDefinitionsForChat(userId, personaId);

  // Build system prompt
  const systemPrompt = buildSystemPrompt(personaId, tools);

  // Build messages
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  // Call LLM
  const response = await callLLMWithTools(messages, tools);

  return response;
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

  // Add tool instructions
  const toolInstructions = `
When you need to take an action or retrieve information, use the available tools by outputting a JSON object in this exact format:
{"fn": "toolName", "args": {"param1": "value1"}}

Available tools:
${tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')}

After using a tool, incorporate the result naturally into your response. Keep responses conversational and helpful.
If no tool is needed, just respond naturally to the user.
`;

  return `${basePrompt}\n\n${toolInstructions}`;
}

/**
 * Get tool definitions for chat (simplified subset)
 */
async function getToolDefinitionsForChat(
  _userId: string,
  _personaId: string
): Promise<Array<{ name: string; description: string; parameters?: Record<string, unknown> }>> {
  // Return a curated set of tools for chat
  // In production, this would use the UnifiedToolOrchestrator
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
      name: 'initiateCall',
      description: 'Call someone on behalf of the user',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          reason: { type: 'string' },
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
      description: 'Send a message via the best available channel (auto-selects WhatsApp, Telegram, etc.)',
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
  // Use Gemini for chat
  const { GoogleGenerativeAI } = await import('@google/generative-ai');

  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY required');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  // Convert messages to Gemini format
  const geminiMessages = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : m.role === 'system' ? 'user' : 'user',
    parts: [{ text: m.content }],
  }));

  // Generate response
  const result = await model.generateContent({
    contents: geminiMessages,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  });

  const responseText = result.response.text();

  // Parse tool calls from response
  const toolCalls = parseToolCallsFromResponse(responseText);

  // Clean response (remove tool JSON if present)
  let cleanResponse = responseText;
  for (const call of toolCalls) {
    cleanResponse = cleanResponse
      .replace(JSON.stringify({ fn: call.fn, args: call.args }), '')
      .trim();
  }

  return {
    response: cleanResponse || responseText,
    toolCalls,
  };
}

/**
 * Parse tool calls from LLM response
 */
function parseToolCallsFromResponse(
  response: string
): Array<{ fn: string; args: Record<string, unknown> }> {
  const toolCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

  // Match JSON objects with fn field
  const jsonPattern = /\{[^{}]*"fn"\s*:\s*"[^"]+"\s*,\s*"args"\s*:\s*\{[^{}]*\}[^{}]*\}/g;
  const matches = response.match(jsonPattern);

  if (matches) {
    for (const match of matches) {
      try {
        const parsed = JSON.parse(match);
        if (parsed.fn && typeof parsed.fn === 'string') {
          toolCalls.push({
            fn: parsed.fn,
            args: parsed.args || {},
          });
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  return toolCalls;
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
  // Only handle /api/chat/* routes
  if (!pathname.startsWith('/api/chat')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Rate limiting
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
    return true;
  }

  // Require authentication
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) return true;

  try {
    // POST /api/chat/message - Send a message
    if (pathname === '/api/chat/message' && req.method === 'POST') {
      const body = await parseBody<ChatMessageRequest>(req);

      if (!body.message) {
        sendError(res, 'Message is required', 400);
        return true;
      }

      const userId = body.userId || auth.userId;
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

      // Process message through LLM
      const llmResult = await processMessageWithLLM(
        body.message,
        userId,
        personaId,
        body.conversationHistory
      );

      // Execute any tool calls
      const executedTools: ChatResponse['toolCalls'] = [];

      for (const toolCall of llmResult.toolCalls) {
        const startTime = Date.now();
        try {
          const result = await executeJsonFunction(
            { fn: toolCall.fn, args: toolCall.args, raw: JSON.stringify(toolCall) },
            { userId, personaId, inputText: body.message }
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

      const response: ChatResponse = {
        success: true,
        response: llmResult.response,
        toolCalls: executedTools.length > 0 ? executedTools : undefined,
      };

      sendJSON(res, response);
      return true;
    }

    // POST /api/chat/tool - Execute a tool directly
    if (pathname === '/api/chat/tool' && req.method === 'POST') {
      const body = await parseBody<ToolExecuteRequest>(req);

      if (!body.fn) {
        sendError(res, 'Tool name (fn) is required', 400);
        return true;
      }

      const userId = body.userId || auth.userId;

      log.info({ userId, tool: body.fn }, 'Executing tool directly');

      const startTime = Date.now();
      const result = await executeJsonFunction(
        {
          fn: body.fn,
          args: body.args || {},
          raw: JSON.stringify({ fn: body.fn, args: body.args }),
        },
        { userId, inputText: `Direct tool call: ${body.fn}` }
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
      const { userId } = auth;
      const personaId = 'ferni'; // Could get from query params

      const tools = await getToolDefinitionsForChat(userId, personaId);

      sendJSON(res, {
        success: true,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          domain: 'general',
        })),
      });
      return true;
    }

    // Unknown route
    sendError(res, 'Not found', 404);
    return true;
  } catch (err) {
    log.error({ error: err }, 'Chat route error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}
