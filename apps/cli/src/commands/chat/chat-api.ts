/**
 * Ferni Chat - HTTP API client (types + calls to the chat endpoints).
 * Extracted from chat.ts.
 */

import { getCurrentUser, getAuthHeaders } from '../../services/cli-auth.service.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE_URL =
  process.env.FERNI_API_URL || 'https://john-bogle-ui-1031920444452.us-central1.run.app';

// ============================================================================
// TYPES
// ============================================================================

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ToolCall {
  fn: string;
  args: Record<string, unknown>;
}

export interface ChatResponse {
  success: boolean;
  response?: string;
  toolCalls?: Array<{
    fn: string;
    args: Record<string, unknown>;
    result: unknown;
    success: boolean;
  }>;
  error?: string;
}

// ============================================================================
// CHAT API
// ============================================================================

/**
 * Send a message to Ferni and get a response with tool execution
 */
export async function sendMessage(
  message: string,
  conversationHistory: ChatMessage[] = [],
  options: { persona?: string; verbose?: boolean } = {}
): Promise<ChatResponse> {
  try {
    const headers = await getAuthHeaders();
    const user = getCurrentUser();

    // Call the chat API endpoint
    const response = await fetch(`${API_BASE_URL}/api/chat/message`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        userId: user?.userId,
        personaId: options.persona || 'ferni',
        conversationHistory,
        source: 'cli',
        verbose: options.verbose,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
    }

    const data = await response.json();
    return {
      success: true,
      response: data.response,
      toolCalls: data.toolCalls,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Execute a specific tool directly (bypass LLM)
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const user = getCurrentUser();

    const response = await fetch(`${API_BASE_URL}/api/chat/tool`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fn: toolName,
        args,
        userId: user?.userId,
        source: 'cli',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
    }

    const data = await response.json();
    return {
      success: data.success,
      result: data.result,
      error: data.error,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * List available tools
 */
export async function listTools(
  query?: string
): Promise<{ success: boolean; tools?: Array<{ name: string; description: string; domain: string }>; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const user = getCurrentUser();

    // GET /api/chat/tools has no search param; filter client-side.
    const url = `${API_BASE_URL}/api/chat/tools?userId=${user?.userId}`;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      return { success: false, error: `API error: ${response.status}` };
    }

    const data = (await response.json()) as {
      tools?: Array<{ name: string; description: string; domain: string }>;
    };
    const q = query?.toLowerCase();
    const tools = (data.tools || []).filter(
      (t) => !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    );
    return {
      success: true,
      tools,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
