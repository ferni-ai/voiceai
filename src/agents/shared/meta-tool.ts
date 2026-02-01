/**
 * Meta-Tool Pattern Implementation
 *
 * Instead of registering 100+ tools with Gemini, register ONE meta-tool:
 * `executeTool(toolName, args)`
 *
 * The LLM only makes ONE decision: "Should I use a tool?" Then specifies which.
 *
 * ## Benefits
 *
 * 1. **Simpler LLM Decision**: Binary "use tool or not" vs "which of 100+ tools"
 * 2. **No Context Bloat**: 1 function declaration vs 100+
 * 3. **No Tool Limits Needed**: Semantic router filters, LLM just picks from catalog
 * 4. **Existing Execution**: All routeToTool logic stays the same
 * 5. **Easy Debugging**: Clear path from LLM → executeTool → actual tool
 *
 * ## Usage
 *
 * When USE_META_TOOL=true:
 * - Only `executeTool` is registered with the LLM
 * - Tool catalog is included in system prompt (via META_TOOL_CATALOG_IN_PROMPT)
 * - LLM outputs: `{"fn":"executeTool","args":{"toolName":"playMusic","args":{"query":"jazz"}}}`
 * - json-function-executor unwraps and routes to actual tool
 *
 * @module agents/shared/meta-tool
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'MetaTool' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Gemini function declaration format
 */
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<
      string,
      {
        type: string;
        description: string;
        enum?: string[];
      }
    >;
    required: string[];
  };
}

/**
 * Tool catalog entry for prompt injection
 */
export interface ToolCatalogEntry {
  name: string;
  description: string;
  domain?: string;
  parameters?: Record<string, string>;
}

// ============================================================================
// META-TOOL DECLARATION
// ============================================================================

/**
 * Build the meta-tool function declaration for Gemini.
 *
 * This is the ONLY tool registered with the LLM when USE_META_TOOL=true.
 *
 * @param toolCatalog - Array of available tool names
 * @returns Gemini-compatible function declaration
 */
export function getMetaToolDeclaration(toolCatalog: string[]): GeminiFunctionDeclaration {
  // Build description with available tools
  const toolList = toolCatalog.slice(0, 100).join(', '); // Cap for context size
  const moreCount = toolCatalog.length > 100 ? ` (and ${toolCatalog.length - 100} more)` : '';

  return {
    name: 'executeTool',
    description: `Execute any available tool by name.

AVAILABLE TOOLS: ${toolList}${moreCount}

Invoke this when user requests an action that requires a tool.
Do NOT invoke for pure conversation - just respond naturally.
Pass the exact tool name and appropriate arguments.`,
    parameters: {
      type: 'object',
      properties: {
        toolName: {
          type: 'string',
          description: 'The tool to execute (must be from AVAILABLE TOOLS list)',
          enum: toolCatalog.length <= 100 ? toolCatalog : undefined, // Only include enum if small enough
        },
        args: {
          type: 'string',
          description:
            'Arguments for the tool as a JSON string. Each tool has different required args. Pass empty {} if no args needed.',
        },
      },
      required: ['toolName', 'args'],
    },
  };
}

// ============================================================================
// TOOL CATALOG GENERATION
// ============================================================================

/**
 * Generate a tool catalog for system prompt injection.
 *
 * This is used when META_TOOL_CATALOG_IN_PROMPT=true to give the LLM
 * visibility into available tools and their purposes.
 *
 * @param tools - Map of tool name to tool definition
 * @returns Markdown-formatted tool catalog
 */
export function generateToolCatalog(
  tools: Record<
    string,
    {
      description?: string;
      parameters?: { properties?: Record<string, { description?: string }> };
    }
  >
): string {
  const entries = Object.entries(tools);
  if (entries.length === 0) {
    return '## Available Tools\n\nNo tools currently available.';
  }

  // Group tools by inferred domain
  const grouped = groupToolsByDomain(entries);

  let catalog = '## Available Tools\n\n';
  catalog += 'Use `executeTool` to call any of these:\n\n';

  for (const [domain, domainTools] of Object.entries(grouped)) {
    catalog += `### ${formatDomainName(domain)}\n\n`;
    for (const [name, tool] of domainTools) {
      const desc = tool.description?.split('\n')[0] || 'No description';
      const shortDesc = desc.length > 80 ? desc.slice(0, 77) + '...' : desc;

      // Extract key parameters
      const params = tool.parameters?.properties;
      const paramHint = params ? ` (args: ${Object.keys(params).slice(0, 3).join(', ')})` : '';

      catalog += `- \`${name}\` - ${shortDesc}${paramHint}\n`;
    }
    catalog += '\n';
  }

  return catalog;
}

/**
 * Group tools by inferred domain based on tool name patterns.
 */
function groupToolsByDomain<T>(tools: Array<[string, T]>): Record<string, Array<[string, T]>> {
  const groups: Record<string, Array<[string, T]>> = {};

  for (const [name, tool] of tools) {
    const domain = inferDomainFromToolName(name);
    if (!groups[domain]) {
      groups[domain] = [];
    }
    groups[domain].push([name, tool]);
  }

  // Sort domains for consistent output
  const sorted: Record<string, Array<[string, T]>> = {};
  for (const key of Object.keys(groups).sort()) {
    sorted[key] = groups[key];
  }

  return sorted;
}

/**
 * Infer domain from tool name using common patterns.
 */
function inferDomainFromToolName(name: string): string {
  const lower = name.toLowerCase();

  // Music
  if (lower.includes('music') || lower.includes('play') || lower.includes('song')) {
    return 'music';
  }
  // Weather
  if (lower.includes('weather')) {
    return 'weather';
  }
  // Memory
  if (lower.includes('memory') || lower.includes('remember') || lower.includes('recall')) {
    return 'memory';
  }
  // Calendar
  if (lower.includes('calendar') || lower.includes('event') || lower.includes('schedule')) {
    return 'calendar';
  }
  // Tasks
  if (lower.includes('task') || lower.includes('reminder') || lower.includes('todo')) {
    return 'tasks';
  }
  // Habits
  if (lower.includes('habit')) {
    return 'habits';
  }
  // Communication
  if (
    lower.includes('message') ||
    lower.includes('call') ||
    lower.includes('email') ||
    lower.includes('text')
  ) {
    return 'communication';
  }
  // Smart home
  if (lower.includes('smart') || lower.includes('home') || lower.includes('light')) {
    return 'smart-home';
  }
  // Handoff
  if (lower.includes('handoff') || lower.startsWith('handoffto')) {
    return 'handoffs';
  }
  // Quick actions
  if (lower.startsWith('quick')) {
    return 'quick-actions';
  }
  // Information
  if (lower.includes('news') || lower.includes('search') || lower.includes('info')) {
    return 'information';
  }
  // Fun
  if (lower.includes('joke') || lower.includes('fun') || lower.includes('game')) {
    return 'fun';
  }

  return 'other';
}

/**
 * Format domain name for display.
 */
function formatDomainName(domain: string): string {
  return domain
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================================================
// META-TOOL EXECUTION HELPERS
// ============================================================================

/**
 * Check if a function call is the meta-tool.
 */
export function isMetaToolCall(fn: string): boolean {
  return fn === 'executeTool';
}

/**
 * Unwrap a meta-tool call to get the actual tool name and args.
 *
 * @param args - The args object from the meta-tool call
 * @returns Unwrapped tool name and args, or null if invalid
 */
export function unwrapMetaToolCall(
  args: Record<string, unknown>
): { toolName: string; toolArgs: Record<string, unknown> } | null {
  const { toolName, args: rawArgs } = args;

  if (typeof toolName !== 'string' || !toolName) {
    log.warn({ args }, 'Meta-tool call missing toolName');
    return null;
  }

  // Parse args if it's a string (JSON)
  let toolArgs: Record<string, unknown> = {};
  if (typeof rawArgs === 'string') {
    try {
      toolArgs = JSON.parse(rawArgs) as Record<string, unknown>;
    } catch (e) {
      log.warn({ rawArgs, error: String(e) }, 'Failed to parse meta-tool args JSON');
      // Try to use as-is if it looks like a simple value
      toolArgs = {};
    }
  } else if (typeof rawArgs === 'object' && rawArgs !== null) {
    toolArgs = rawArgs as Record<string, unknown>;
  }

  log.debug(
    { originalFn: 'executeTool', actualFn: toolName, argsType: typeof rawArgs },
    'Unwrapped meta-tool call'
  );

  return { toolName, toolArgs };
}

// ============================================================================
// SYSTEM PROMPT HELPERS
// ============================================================================

/**
 * Generate the meta-tool instructions for the system prompt.
 *
 * This replaces the detailed JSON function calling format with simpler
 * instructions for using the executeTool wrapper.
 */
export function getMetaToolPromptInstructions(): string {
  return `## Tool Execution

When user requests an action that requires a tool, use \`executeTool\`:

\`\`\`json
{"fn":"executeTool","args":{"toolName":"playMusic","args":"{\\"query\\":\\"jazz\\"}"}}
\`\`\`

**Rules:**
- Only use tools when the user asks for an ACTION (play music, set reminder, etc.)
- For conversation (sharing feelings, chatting, questions), respond naturally without tools
- The \`args\` field is a JSON string with tool-specific parameters
- Check the Available Tools section for tool names and what they do

**Examples:**
- "Play some jazz" → \`{"fn":"executeTool","args":{"toolName":"playMusic","args":"{\\"query\\":\\"jazz\\"}"}}\`
- "What's the weather?" → \`{"fn":"executeTool","args":{"toolName":"getWeather","args":"{}"}}\`
- "I'm feeling sad today" → (no tool needed, respond with empathy)
`;
}
