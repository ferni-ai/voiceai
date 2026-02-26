/**
 * Service Layer Adapter Interfaces
 *
 * These interfaces define the contracts that services use to interact with
 * higher layers (L70 domain layers like tools, personas, intelligence).
 * Instead of services importing directly from domain layers, they depend
 * on these adapter interfaces. The application layer (agents/api) injects
 * concrete implementations at startup.
 *
 * This follows the Dependency Inversion Principle:
 *   - Services depend on abstractions (these interfaces)
 *   - Domain layers implement these interfaces
 *   - Application layer wires them together
 *
 * @module services/core/adapters
 */

// ============================================================================
// PERSONA ADAPTER
// ============================================================================

/** Minimal persona information needed by services */
export interface PersonaInfo {
  readonly id: string;
  readonly name: string;
  readonly role?: string;
}

/** Adapter for accessing persona data from services */
export interface PersonaAdapter {
  getPersona(personaId: string): PersonaInfo | undefined;
  getActivePersona(sessionId: string): PersonaInfo | undefined;
  listPersonas(): PersonaInfo[];
}

// ============================================================================
// TOOL EXECUTION ADAPTER
// ============================================================================

/** Result of executing a tool */
export interface ToolExecutionResult {
  readonly success: boolean;
  readonly output?: unknown;
  readonly error?: string;
  readonly latencyMs?: number;
}

/** Adapter for executing tools from services */
export interface ToolExecutionAdapter {
  executeTool(
    toolId: string,
    args: Record<string, unknown>,
    context: { userId: string; sessionId: string }
  ): Promise<ToolExecutionResult>;
  isToolAvailable(toolId: string): boolean;
}

// ============================================================================
// INTELLIGENCE ADAPTER
// ============================================================================

/** A context injection from the intelligence layer */
export interface ContextInjection {
  readonly source: string;
  readonly content: string;
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  readonly timestamp: number;
}

/** Adapter for accessing intelligence/context builders from services */
export interface IntelligenceAdapter {
  getContextInjections(
    userId: string,
    sessionId: string
  ): Promise<ContextInjection[]>;
}

// ============================================================================
// CONVERSATION ADAPTER
// ============================================================================

/** Minimal conversation state needed by services */
export interface ConversationSnapshot {
  readonly sessionId: string;
  readonly userId: string;
  readonly turnCount: number;
  readonly activePersonaId?: string;
  readonly mood?: string;
}

/** Adapter for accessing conversation state from services */
export interface ConversationAdapter {
  getSnapshot(sessionId: string): ConversationSnapshot | undefined;
}

// ============================================================================
// SPEECH ADAPTER
// ============================================================================

/** Adapter for speech-related operations from services */
export interface SpeechAdapter {
  detectEmotion(text: string): Promise<{ emotion: string; confidence: number }>;
  generateSSML(text: string, options?: { emotion?: string; rate?: string }): string;
}

// ============================================================================
// ADAPTER REGISTRY
// ============================================================================

/** Central registry for all adapter implementations */
interface AdapterRegistry {
  persona?: PersonaAdapter;
  toolExecution?: ToolExecutionAdapter;
  intelligence?: IntelligenceAdapter;
  conversation?: ConversationAdapter;
  speech?: SpeechAdapter;
}

const registry: AdapterRegistry = {};

/** Register an adapter implementation (called at startup by application layer) */
export function registerAdapter<K extends keyof AdapterRegistry>(
  key: K,
  adapter: NonNullable<AdapterRegistry[K]>
): void {
  registry[key] = adapter;
}

/** Get a registered adapter (returns undefined if not registered) */
export function getAdapter<K extends keyof AdapterRegistry>(
  key: K
): AdapterRegistry[K] {
  return registry[key];
}

/** Get a registered adapter or throw (for required adapters) */
export function requireAdapter<K extends keyof AdapterRegistry>(
  key: K
): NonNullable<AdapterRegistry[K]> {
  const adapter = registry[key];
  if (!adapter) {
    throw new Error(`Required adapter '${key}' is not registered. Call registerAdapter() at startup.`);
  }
  return adapter as NonNullable<AdapterRegistry[K]>;
}

/** Reset all adapters (for testing) */
export function resetAdapters(): void {
  for (const key of Object.keys(registry) as Array<keyof AdapterRegistry>) {
    registry[key] = undefined;
  }
}
