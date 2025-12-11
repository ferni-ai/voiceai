/**
 * Agent Commands Types
 *
 * Types for agent-specific slash commands that users can invoke.
 * Similar to Claude Code's slash command system, agents can define
 * custom commands in their bundle.
 *
 * Commands are stored as markdown files in the agent's commands/ directory:
 *   commands/
 *     daily-check-in.md
 *     weekly-review.md
 *     brainstorm.md
 *
 * Each file becomes a slash command: /daily-check-in, /weekly-review, etc.
 */

// ============================================================================
// COMMAND TYPES
// ============================================================================

/**
 * Parsed command from a markdown file
 */
export interface BundleCommand {
  /** Command ID (filename without .md extension) */
  id: string;

  /** Display name for the command */
  name: string;

  /** Short description shown in command list */
  description: string;

  /** The prompt content from the markdown file */
  prompt: string;

  /** Optional category for grouping commands */
  category?: 'check-in' | 'review' | 'planning' | 'reflection' | 'action' | 'custom';

  /** Optional icon/emoji for the command */
  icon?: string;

  /** Optional keyboard shortcut hint */
  shortcut?: string;

  /** Whether this command requires user confirmation before running */
  requiresConfirmation?: boolean;

  /** Optional arguments the command accepts */
  arguments?: BundleCommandArgument[];

  /** File path where this command was loaded from */
  filePath: string;
}

/**
 * Command argument definition
 */
export interface BundleCommandArgument {
  /** Argument name */
  name: string;

  /** Argument description */
  description: string;

  /** Whether this argument is required */
  required: boolean;

  /** Default value if not provided */
  default?: string;

  /** Placeholder text */
  placeholder?: string;
}

/**
 * Command index stored in commands/_index.json
 */
export interface BundleCommandIndex {
  /** Schema version for the index */
  version: 1;

  /** List of command metadata */
  commands: BundleCommandRef[];
}

/**
 * Reference to a command file
 */
export interface BundleCommandRef {
  /** Command ID (matches filename without .md) */
  id: string;

  /** File name */
  file: string;

  /** Display name */
  name: string;

  /** Short description */
  description: string;

  /** Optional category */
  category?: BundleCommand['category'];

  /** Optional icon */
  icon?: string;

  /** Enabled by default */
  enabled?: boolean;
}

/**
 * Frontmatter parsed from command markdown files
 */
export interface BundleCommandFrontmatter {
  name?: string;
  description?: string;
  category?: BundleCommand['category'];
  icon?: string;
  shortcut?: string;
  requiresConfirmation?: boolean;
  arguments?: BundleCommandArgument[];
}

// ============================================================================
// COMMAND EXECUTION TYPES
// ============================================================================

/**
 * Command execution context
 */
export interface CommandExecutionContext {
  /** The command being executed */
  command: BundleCommand;

  /** Arguments passed to the command */
  args: Record<string, string>;

  /** User ID executing the command */
  userId: string;

  /** Session ID */
  sessionId: string;

  /** Current persona ID */
  personaId: string;
}

/**
 * Result of executing a command
 */
export interface CommandExecutionResult {
  /** Whether execution was successful */
  success: boolean;

  /** The rendered prompt with arguments substituted */
  renderedPrompt?: string;

  /** Error message if execution failed */
  error?: string;
}

// ============================================================================
// HOOKS TYPES (Used in Phase 4, defined here for completeness)
// ============================================================================

/**
 * Agent hooks configuration
 */
export interface BundleAgentHooks {
  /** Called when a session starts */
  session_start?: BundleHook;

  /** Called before generating a response */
  before_response?: BundleHook;

  /** Called after generating a response */
  after_response?: BundleHook;

  /** Called before executing a tool */
  before_tool_call?: BundleHook;

  /** Called after executing a tool */
  after_tool_call?: BundleHook;

  /** Called when a handoff occurs */
  on_handoff?: BundleHook;

  /** Called when conversation ends */
  session_end?: BundleHook;

  /** Called when a command is invoked */
  on_command?: BundleHook;
}

/**
 * Individual hook definition
 */
export interface BundleHook {
  /** Hook handler type */
  type: 'prompt' | 'script' | 'webhook' | 'shell';

  /** Prompt to inject (if type is 'prompt') */
  prompt?: string;

  /** Script path to execute (if type is 'script') */
  script?: string;

  /** Webhook URL to call (if type is 'webhook') */
  webhook?: string;

  /** Shell command to execute (if type is 'shell') - Claude Code style */
  command?: string;

  /** Timeout for shell/webhook execution in ms */
  timeout?: number;

  /** Whether the hook is enabled */
  enabled?: boolean;

  /** Optional condition for when to run this hook */
  condition?: string;
}

/**
 * Hook event types
 */
export type HookEventType = keyof BundleAgentHooks;

/**
 * Context passed to hook execution
 */
export interface HookExecutionContext {
  /** The event that triggered this hook */
  event: HookEventType;

  /** Current persona ID */
  personaId: string;

  /** User ID */
  userId?: string;

  /** Session ID */
  sessionId?: string;

  /** Timestamp of the event */
  timestamp: number;

  /** Tool name (for tool hooks) */
  toolName?: string;

  /** Tool parameters (for before_tool_call) */
  toolParams?: Record<string, unknown>;

  /** Tool result (for after_tool_call) */
  toolResult?: unknown;

  /** Command ID (for on_command) */
  commandId?: string;

  /** Command arguments (for on_command) */
  commandArgs?: Record<string, string>;
}

/**
 * Result of hook execution
 */
export interface HookExecutionResult {
  /** Whether execution was successful */
  success: boolean;

  /** Prompt to inject (for prompt-type hooks) */
  prompt?: string;

  /** Error message if execution failed */
  error?: string;

  /** Additional data from the hook */
  data?: Record<string, unknown>;
}

// ============================================================================
// LOCAL TOOLS TYPES (Used in Phase 2, defined here for completeness)
// ============================================================================

/**
 * Agent-local tool definition
 */
export interface BundleLocalTool {
  /** Tool ID */
  id: string;

  /** Tool name (used in LLM function calling) */
  name: string;

  /** Tool description */
  description: string;

  /** JSON Schema for tool parameters */
  parameters: Record<string, unknown>;

  /** Tool implementation type */
  type: 'prompt' | 'script' | 'webhook' | 'mcp';

  /** Prompt to inject (if type is 'prompt') */
  prompt?: string;

  /** Script path (if type is 'script') */
  script?: string;

  /** Webhook URL (if type is 'webhook') */
  webhook?: string;

  /** MCP tool reference (if type is 'mcp') */
  mcp?: {
    server: string;
    tool: string;
  };

  /** Whether this tool requires confirmation */
  requiresConfirmation?: boolean;

  /** File path where tool was loaded from */
  filePath?: string;
}

/**
 * Local tools index
 */
export interface BundleLocalToolsIndex {
  version: 1;
  tools: BundleLocalToolRef[];
}

export interface BundleLocalToolRef {
  id: string;
  file: string;
  name: string;
  description: string;
  enabled?: boolean;
}

// ============================================================================
// THEME TYPES (Used in Phase 3, defined here for completeness)
// ============================================================================

/**
 * Agent theme configuration
 */
export interface BundleTheme {
  /** Theme ID */
  id: string;

  /** Theme display name */
  name: string;

  /** Color palette */
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background?: string;
    text?: string;
    muted?: string;
  };

  /** Avatar customization */
  avatar?: {
    /** Base avatar image */
    image?: string;
    /** Avatar animation style */
    animationStyle?: 'default' | 'gentle' | 'energetic' | 'calm';
    /** Custom expressions mapping */
    expressions?: Record<string, string>;
  };

  /** Typography preferences */
  typography?: {
    fontFamily?: string;
    fontSize?: 'small' | 'medium' | 'large';
  };
}

/**
 * Agent sound configuration
 */
export interface BundleSounds {
  /** Sound for receiving messages */
  messageReceived?: string;

  /** Sound for sending messages */
  messageSent?: string;

  /** Sound for notifications */
  notification?: string;

  /** Sound for errors */
  error?: string;

  /** Sound for celebrations/achievements */
  celebration?: string;

  /** Sound for handoff transitions */
  handoff?: string;

  /** Sound for command execution */
  command?: string;

  /** Custom sounds by ID */
  custom?: Record<string, string>;
}

/**
 * Agent assets configuration
 */
export interface BundleAssets {
  /** Theme configuration */
  theme?: BundleTheme;

  /** Sound configuration */
  sounds?: BundleSounds;

  /** Custom icons */
  icons?: Record<string, string>;

  /** Custom images */
  images?: Record<string, string>;
}

// ============================================================================
// MCP TYPES (Used in Phase 5, defined here for completeness)
// ============================================================================

/**
 * MCP server configuration for an agent
 */
export interface BundleMCPConfig {
  /** List of MCP servers to connect */
  servers: BundleMCPServer[];
}

/**
 * Individual MCP server definition
 */
export interface BundleMCPServer {
  /** Server ID */
  id: string;

  /** Server display name */
  name: string;

  /** Transport type */
  transport: 'stdio' | 'http' | 'websocket';

  /** Command to run (for stdio) */
  command?: string;

  /** Command arguments (for stdio) */
  args?: string[];

  /** URL (for http/websocket) */
  url?: string;

  /** Environment variables to pass */
  env?: Record<string, string>;

  /** Whether to auto-connect on session start */
  autoConnect?: boolean;

  /** Timeout for tool calls in ms */
  timeout?: number;
}
