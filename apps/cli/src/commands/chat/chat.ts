#!/usr/bin/env npx tsx
/**
 * Ferni Chat - Natural Language CLI Interface
 *
 * Interact with Ferni using natural language, routing through the same
 * tool system as voice. Great for testing the platform without voice.
 *
 * Usage:
 *   ferni chat "play some jazz music"
 *   ferni chat "call Jordan to check on the snowstorm"
 *   ferni chat "what's on my calendar today?"
 *   ferni chat --interactive    # Multi-turn conversation mode
 *
 * This routes through:
 *   - Tool selection (UnifiedToolOrchestrator)
 *   - LLM processing (same as voice agent)
 *   - Tool execution (JSON function executor)
 */

import { createInterface } from 'readline';
import {
  isAuthenticated,
  getCurrentUser,
  getAuthHeaders,
} from '../../services/cli-auth.service.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE_URL =
  process.env.FERNI_API_URL || 'https://john-bogle-ui-1031920444452.us-central1.run.app';

// ============================================================================
// COLORS
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  header: (msg: string) => console.log(`\n${colors.bold}${colors.cyan}━━━ ${msg} ━━━${colors.reset}\n`),
  ferni: (msg: string) => console.log(`${colors.green}${colors.bold}Ferni:${colors.reset} ${msg}`),
  tool: (name: string, result: string) => {
    console.log(`${colors.dim}[tool: ${name}]${colors.reset}`);
    if (result) console.log(`${colors.dim}${result}${colors.reset}`);
  },
  user: (msg: string) => console.log(`${colors.blue}${colors.bold}You:${colors.reset} ${msg}`),
};

// ============================================================================
// TYPES
// ============================================================================

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ToolCall {
  fn: string;
  args: Record<string, unknown>;
}

interface ChatResponse {
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
async function sendMessage(
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
async function executeTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const user = getCurrentUser();

    const response = await fetch(`${API_BASE_URL}/api/tools/execute`, {
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
async function listTools(
  query?: string
): Promise<{ success: boolean; tools?: Array<{ name: string; description: string; domain: string }>; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const user = getCurrentUser();

    const url = query
      ? `${API_BASE_URL}/api/tools/list?q=${encodeURIComponent(query)}&userId=${user?.userId}`
      : `${API_BASE_URL}/api/tools/list?userId=${user?.userId}`;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      return { success: false, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    return {
      success: true,
      tools: data.tools,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ============================================================================
// INTERACTIVE MODE
// ============================================================================

async function runInteractiveMode(options: { persona?: string; verbose?: boolean }): Promise<void> {
  const conversationHistory: ChatMessage[] = [];

  log.header(`💬 Ferni Chat (Interactive)`);
  log.info(`Persona: ${colors.cyan}${options.persona || 'ferni'}${colors.reset}`);
  log.info(`Type ${colors.cyan}/help${colors.reset} for commands, ${colors.cyan}/quit${colors.reset} to exit\n`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question(`${colors.blue}You:${colors.reset} `, async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      // Handle commands
      if (trimmed.startsWith('/')) {
        const [cmd, ...args] = trimmed.slice(1).split(' ');

        switch (cmd) {
          case 'quit':
          case 'exit':
          case 'q':
            console.log(`\n${colors.dim}Goodbye!${colors.reset}`);
            rl.close();
            process.exit(0);
            break;

          case 'help':
            console.log(`
${colors.bold}Commands:${colors.reset}
  ${colors.cyan}/help${colors.reset}              Show this help
  ${colors.cyan}/quit${colors.reset}              Exit interactive mode
  ${colors.cyan}/clear${colors.reset}             Clear conversation history
  ${colors.cyan}/tools [query]${colors.reset}     List available tools
  ${colors.cyan}/exec <tool> <json>${colors.reset} Execute a tool directly
  ${colors.cyan}/persona <name>${colors.reset}    Switch persona (ferni, maya, alex, jordan, peter, nayan)
  ${colors.cyan}/verbose${colors.reset}           Toggle verbose mode (show tool details)
  ${colors.cyan}/history${colors.reset}           Show conversation history
`);
            break;

          case 'clear':
            conversationHistory.length = 0;
            log.success('Conversation history cleared');
            break;

          case 'tools': {
            const query = args.join(' ');
            const result = await listTools(query || undefined);
            if (result.success && result.tools) {
              console.log(`\n${colors.bold}Available Tools${query ? ` (matching "${query}")` : ''}:${colors.reset}`);
              for (const tool of result.tools.slice(0, 20)) {
                console.log(`  ${colors.cyan}${tool.name}${colors.reset} - ${colors.dim}${tool.description}${colors.reset}`);
              }
              if (result.tools.length > 20) {
                console.log(`  ${colors.dim}... and ${result.tools.length - 20} more${colors.reset}`);
              }
            } else {
              log.error(result.error || 'Failed to list tools');
            }
            break;
          }

          case 'exec': {
            const toolName = args[0];
            const jsonStr = args.slice(1).join(' ');
            if (!toolName) {
              log.error('Usage: /exec <toolName> <jsonArgs>');
              break;
            }
            try {
              const toolArgs = jsonStr ? JSON.parse(jsonStr) : {};
              log.info(`Executing ${toolName}...`);
              const result = await executeTool(toolName, toolArgs);
              if (result.success) {
                log.success('Tool executed');
                console.log(JSON.stringify(result.result, null, 2));
              } else {
                log.error(result.error || 'Tool execution failed');
              }
            } catch (e) {
              log.error(`Invalid JSON: ${e}`);
            }
            break;
          }

          case 'persona':
            if (args[0]) {
              options.persona = args[0];
              log.success(`Switched to ${colors.cyan}${args[0]}${colors.reset}`);
            } else {
              log.info(`Current persona: ${colors.cyan}${options.persona || 'ferni'}${colors.reset}`);
            }
            break;

          case 'verbose':
            options.verbose = !options.verbose;
            log.info(`Verbose mode: ${options.verbose ? 'on' : 'off'}`);
            break;

          case 'history':
            if (conversationHistory.length === 0) {
              log.info('No conversation history');
            } else {
              console.log(`\n${colors.bold}Conversation History:${colors.reset}`);
              for (const msg of conversationHistory) {
                const prefix = msg.role === 'user' ? colors.blue + 'You' : colors.green + 'Ferni';
                console.log(`  ${prefix}:${colors.reset} ${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
              }
            }
            break;

          default:
            log.warn(`Unknown command: /${cmd}. Type /help for available commands.`);
        }

        prompt();
        return;
      }

      // Send message to Ferni
      conversationHistory.push({ role: 'user', content: trimmed });

      const result = await sendMessage(trimmed, conversationHistory, options);

      if (result.success) {
        // Show tool calls if verbose
        if (options.verbose && result.toolCalls && result.toolCalls.length > 0) {
          for (const tc of result.toolCalls) {
            log.tool(tc.fn, tc.success ? JSON.stringify(tc.result).slice(0, 100) : `Error: ${tc.result}`);
          }
        }

        // Show response
        if (result.response) {
          log.ferni(result.response);
          conversationHistory.push({ role: 'assistant', content: result.response });
        }
      } else {
        log.error(result.error || 'Failed to get response');
      }

      console.log(''); // Blank line for readability
      prompt();
    });
  };

  prompt();
}

// ============================================================================
// SINGLE MESSAGE MODE
// ============================================================================

async function runSingleMessage(
  message: string,
  options: { persona?: string; verbose?: boolean }
): Promise<void> {
  if (options.verbose) {
    log.header(`💬 Ferni Chat`);
    log.user(message);
    console.log('');
  }

  const result = await sendMessage(message, [], options);

  if (result.success) {
    // Show tool calls if verbose
    if (options.verbose && result.toolCalls && result.toolCalls.length > 0) {
      for (const tc of result.toolCalls) {
        log.tool(tc.fn, tc.success ? JSON.stringify(tc.result).slice(0, 100) : `Error: ${tc.result}`);
      }
      console.log('');
    }

    // Show response
    if (result.response) {
      if (options.verbose) {
        log.ferni(result.response);
      } else {
        console.log(result.response);
      }
    }
  } else {
    log.error(result.error || 'Failed to get response');
    process.exit(1);
  }
}

// ============================================================================
// HELP
// ============================================================================

function printHelp(): void {
  console.log(`
${colors.bold}Ferni Chat - Natural Language CLI${colors.reset}

Interact with Ferni using natural language. Routes through the same
tool system as voice, letting you test the full platform.

${colors.cyan}Usage:${colors.reset}
  ferni chat "<message>"                    Send a message to Ferni
  ferni chat --interactive                  Start interactive conversation
  ferni chat --tools [query]                List available tools
  ferni chat --exec <tool> [json-args]      Execute a tool directly

${colors.cyan}Options:${colors.reset}
  -i, --interactive     Interactive multi-turn conversation mode
  -p, --persona <name>  Use a specific persona (default: ferni)
  -v, --verbose         Show tool execution details
  --tools [query]       List available tools (optionally filter by query)
  --exec <tool> [args]  Execute a specific tool with JSON args

${colors.cyan}Examples:${colors.reset}
  ferni chat "play some jazz music"
  ferni chat "call Jordan to check on the snowstorm"
  ferni chat "what's on my calendar today?"
  ferni chat -i --persona maya              # Interactive with Maya
  ferni chat --tools music                  # List music-related tools
  ferni chat --exec playMusic '{"query":"jazz"}'

${colors.cyan}Interactive Commands:${colors.reset}
  /help              Show help
  /quit              Exit
  /clear             Clear conversation history
  /tools [query]     List tools
  /exec <tool> <json> Execute tool directly
  /persona <name>    Switch persona
  /verbose           Toggle verbose mode
`);
}

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

function parseArgs(args: string[]): {
  message: string;
  options: {
    interactive: boolean;
    persona?: string;
    verbose: boolean;
    listTools?: string;
    execTool?: { name: string; args: string };
    help: boolean;
  };
} {
  const options = {
    interactive: false,
    persona: undefined as string | undefined,
    verbose: false,
    listTools: undefined as string | undefined,
    execTool: undefined as { name: string; args: string } | undefined,
    help: false,
  };
  const messageParts: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--interactive' || arg === '-i') {
      options.interactive = true;
    } else if (arg === '--persona' || arg === '-p') {
      options.persona = args[++i];
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--tools') {
      options.listTools = args[++i] || '';
    } else if (arg === '--exec') {
      const toolName = args[++i];
      const toolArgs = args[++i] || '{}';
      options.execTool = { name: toolName, args: toolArgs };
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (!arg.startsWith('-')) {
      messageParts.push(arg);
    }
    i++;
  }

  return {
    message: messageParts.join(' '),
    options,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { message, options } = parseArgs(args);

  // Show help
  if (options.help) {
    printHelp();
    return;
  }

  // Check authentication
  if (!isAuthenticated()) {
    log.error(`Not authenticated. Run ${colors.cyan}ferni auth login${colors.reset} first.`);
    process.exit(1);
  }

  // List tools
  if (options.listTools !== undefined) {
    const result = await listTools(options.listTools || undefined);
    if (result.success && result.tools) {
      console.log(`\n${colors.bold}Available Tools${options.listTools ? ` (matching "${options.listTools}")` : ''}:${colors.reset}\n`);
      for (const tool of result.tools) {
        console.log(`  ${colors.cyan}${tool.name}${colors.reset}`);
        console.log(`    ${colors.dim}${tool.description}${colors.reset}`);
        console.log(`    ${colors.dim}Domain: ${tool.domain}${colors.reset}\n`);
      }
    } else {
      log.error(result.error || 'Failed to list tools');
      process.exit(1);
    }
    return;
  }

  // Execute tool directly
  if (options.execTool) {
    try {
      const toolArgs = JSON.parse(options.execTool.args);
      log.info(`Executing ${colors.cyan}${options.execTool.name}${colors.reset}...`);
      const result = await executeTool(options.execTool.name, toolArgs);
      if (result.success) {
        log.success('Tool executed successfully');
        console.log(JSON.stringify(result.result, null, 2));
      } else {
        log.error(result.error || 'Tool execution failed');
        process.exit(1);
      }
    } catch (e) {
      log.error(`Invalid JSON arguments: ${e}`);
      process.exit(1);
    }
    return;
  }

  // Interactive mode
  if (options.interactive) {
    await runInteractiveMode(options);
    return;
  }

  // Single message mode
  if (message) {
    await runSingleMessage(message, options);
    return;
  }

  // No message provided - show help
  printHelp();
}

main().catch((error) => {
  log.error(`Error: ${error.message}`);
  process.exit(1);
});
