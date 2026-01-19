/**
 * Tool Definition Interface
 *
 * Abstract interface for tool definitions.
 * Decouples tool consumers from implementation details.
 *
 * @module tools/interfaces/tool-definition.interface
 */

/**
 * Minimal tool metadata (for listings/search without loading full definition).
 */
export interface IToolMetadata {
  /** Unique tool identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Brief description */
  description: string;
  /** Domain this tool belongs to */
  domain: string;
  /** Tags for categorization */
  tags: string[];
  /** Whether the tool is enabled */
  enabled: boolean;
  /** Required external services */
  requiredServices?: string[];
}

/**
 * Full tool definition including schema and creation.
 */
export interface IToolDefinition extends IToolMetadata {
  /**
   * Parameter schema (Zod schema or JSON Schema).
   * Used for validation and documentation.
   */
  parameters?: Record<string, unknown>;

  /**
   * Create the executable tool instance.
   * Lazy creation allows for context injection.
   */
  create: (context: IToolContext) => unknown;

  /**
   * Optional aliases for this tool.
   */
  aliases?: string[];

  /**
   * Priority for routing (higher = preferred).
   */
  priority?: number;
}

/**
 * Context passed to tool creation.
 * Allows tools to access user info, services, etc.
 */
export interface IToolContext {
  /** User ID (if authenticated) */
  userId?: string;
  /** Session ID */
  sessionId?: string;
  /** Current persona ID */
  personaId?: string;
  /** Publisher ID for marketplace tools */
  publisherId?: string;
  /** User's timezone */
  timezone?: string;
  /** User's language preference */
  language?: string;
}

/**
 * Tool execution parameters (input to execute).
 */
export interface IToolExecuteParams {
  /** Tool ID being executed */
  toolId: string;
  /** Tool arguments from LLM */
  args: Record<string, unknown>;
  /** Execution context */
  context: IToolContext;
  /** Original user input that triggered this tool */
  inputText?: string;
}
