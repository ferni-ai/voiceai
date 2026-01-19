/**
 * Persona Registry Interface - OCP Compliant
 *
 * This interface defines the contract for persona registration and lookup.
 * It enables the Open-Closed Principle by allowing:
 *
 * 1. OPEN for extension: Register new personas via `register()` or bundle discovery
 * 2. CLOSED for modification: No code changes needed to add personas
 *
 * REGISTRATION METHODS:
 * 1. Bundle Discovery (default): Add bundle to bundles/ directory
 * 2. Runtime Registration: Call `register()` programmatically
 * 3. DI Container: Register via dependency injection
 *
 * USAGE:
 *   // Via DI container
 *   const registry = container.resolve<IPersonaRegistry>(Tokens.PersonaRegistry);
 *
 *   // Register a runtime persona
 *   registry.register({
 *     id: 'custom-agent',
 *     name: 'Custom Agent',
 *     // ... other config
 *   });
 *
 *   // Get persona
 *   const persona = await registry.get('custom-agent');
 *
 * @module personas/registry/persona-registry-interface
 */

// ============================================================================
// PERSONA DEFINITION
// ============================================================================

/**
 * Minimal persona definition for registration.
 * This is the data needed to register a persona programmatically.
 */
export interface PersonaDefinition {
  /** Unique persona ID */
  readonly id: string;

  /** Display name */
  readonly name: string;

  /** Short description */
  readonly description: string;

  /** Voice configuration */
  readonly voice: {
    readonly voiceId: string;
    readonly provider: 'cartesia' | 'elevenlabs' | 'openai';
  };

  /** Role in team */
  readonly role: 'coach' | 'team' | 'standalone';

  /** Is this the coordinator/coach? */
  readonly isCoordinator?: boolean;

  /** Can this persona hand off to others? */
  readonly canHandoff?: boolean;

  /** Target personas for handoff */
  readonly handoffTargets?: readonly string[];

  /** Keywords that trigger handoff TO this persona */
  readonly handoffTriggers?: readonly string[];

  /** Alternative names/aliases for this persona */
  readonly aliases?: readonly string[];

  /** UI configuration */
  readonly ui?: {
    readonly initials?: string;
    readonly subtitle?: string;
    readonly themeClass?: string;
    readonly entrancePhrase?: string;
  };

  /** System prompt for LLM */
  readonly systemPrompt?: string;

  /** Domains this persona handles */
  readonly domains?: readonly string[];

  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Full persona data returned from the registry.
 * Extends PersonaDefinition with computed/derived fields.
 */
export interface RegisteredPersona extends PersonaDefinition {
  /** Whether this persona is currently enabled */
  readonly enabled: boolean;

  /** All known aliases (includes derived aliases) */
  readonly allAliases: readonly string[];

  /** Handoff tool name (e.g., 'handoffToMaya') */
  readonly handoffToolName: string;

  /** Registration source */
  readonly source: 'bundle' | 'runtime' | 'plugin';

  /** When this persona was registered */
  readonly registeredAt: Date;
}

// ============================================================================
// REGISTRATION OPTIONS
// ============================================================================

/**
 * Options for persona registration
 */
export interface RegistrationOptions {
  /** Replace if persona with same ID exists */
  overwrite?: boolean;

  /** Registration source for tracking */
  source?: 'bundle' | 'runtime' | 'plugin';

  /** Skip validation (use with caution) */
  skipValidation?: boolean;
}

/**
 * Result of persona registration
 */
export interface RegistrationResult {
  success: boolean;
  personaId: string;
  message?: string;
  replaced?: boolean;
}

// ============================================================================
// QUERY OPTIONS
// ============================================================================

/**
 * Options for persona queries
 */
export interface PersonaQueryOptions {
  /** Include disabled personas */
  includeDisabled?: boolean;

  /** Filter by role */
  role?: 'coach' | 'team' | 'standalone';

  /** Filter by domain */
  domain?: string;

  /** Filter by registration source */
  source?: 'bundle' | 'runtime' | 'plugin';
}

// ============================================================================
// PERSONA REGISTRY INTERFACE
// ============================================================================

/**
 * OCP-compliant Persona Registry interface.
 *
 * This interface is the single point of access for persona management.
 * Implementations should support both bundle discovery and runtime registration.
 */
export interface IPersonaRegistry {
  // ===== REGISTRATION =====

  /**
   * Register a persona programmatically.
   * This enables runtime extension without modifying code.
   */
  register(
    persona: PersonaDefinition,
    options?: RegistrationOptions
  ): Promise<RegistrationResult>;

  /**
   * Register multiple personas at once.
   */
  registerBatch(
    personas: PersonaDefinition[],
    options?: RegistrationOptions
  ): Promise<RegistrationResult[]>;

  /**
   * Unregister a persona by ID.
   * Only works for runtime-registered personas.
   */
  unregister(personaId: string): Promise<boolean>;

  // ===== LOOKUP =====

  /**
   * Get a persona by ID or alias.
   * Returns null if not found.
   */
  get(idOrAlias: string): Promise<RegisteredPersona | null>;

  /**
   * Get a persona by ID or alias.
   * Falls back to coordinator if not found.
   */
  getOrDefault(idOrAlias: string): Promise<RegisteredPersona>;

  /**
   * Check if a persona exists.
   */
  has(idOrAlias: string): Promise<boolean>;

  /**
   * Resolve any ID/alias to a canonical persona ID.
   */
  resolveId(idOrAlias: string): Promise<string | null>;

  /**
   * Check if two IDs/aliases refer to the same persona.
   */
  isSamePersona(id1: string, id2: string): Promise<boolean>;

  // ===== QUERIES =====

  /**
   * Get all registered personas.
   */
  getAll(options?: PersonaQueryOptions): Promise<RegisteredPersona[]>;

  /**
   * Get all enabled personas.
   */
  getEnabled(options?: PersonaQueryOptions): Promise<RegisteredPersona[]>;

  /**
   * Get the coordinator/coach persona.
   */
  getCoordinator(): Promise<RegisteredPersona>;

  /**
   * Get all team members (excluding coordinator).
   */
  getTeamMembers(): Promise<RegisteredPersona[]>;

  /**
   * Get personas by domain.
   */
  getByDomain(domain: string): Promise<RegisteredPersona[]>;

  // ===== VOICE =====

  /**
   * Get voice ID for a persona.
   */
  getVoiceId(idOrAlias: string): Promise<string>;

  /**
   * Get voice provider for a persona.
   */
  getVoiceProvider(idOrAlias: string): Promise<'cartesia' | 'elevenlabs' | 'openai'>;

  // ===== LIFECYCLE =====

  /**
   * Refresh the registry (re-discover bundles).
   */
  refresh(): Promise<void>;

  /**
   * Clear all runtime-registered personas.
   */
  clearRuntime(): Promise<number>;

  /**
   * Get registry statistics.
   */
  getStats(): Promise<{
    total: number;
    enabled: number;
    fromBundles: number;
    fromRuntime: number;
    fromPlugins: number;
  }>;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for PersonaDefinition
 */
export function isPersonaDefinition(obj: unknown): obj is PersonaDefinition {
  if (!obj || typeof obj !== 'object') return false;
  const persona = obj as Record<string, unknown>;
  return (
    typeof persona.id === 'string' &&
    typeof persona.name === 'string' &&
    typeof persona.description === 'string' &&
    typeof persona.role === 'string' &&
    persona.voice !== undefined &&
    typeof (persona.voice as Record<string, unknown>).voiceId === 'string'
  );
}

/**
 * Type guard for RegisteredPersona
 */
export function isRegisteredPersona(obj: unknown): obj is RegisteredPersona {
  if (!isPersonaDefinition(obj)) return false;
  // Cast through unknown to satisfy TypeScript's strict type checking
  const persona = obj as unknown as Record<string, unknown>;
  return (
    typeof persona.enabled === 'boolean' &&
    Array.isArray(persona.allAliases) &&
    typeof persona.handoffToolName === 'string' &&
    typeof persona.source === 'string' &&
    persona.registeredAt instanceof Date
  );
}

// ============================================================================
// FACTORY HELPERS
// ============================================================================

/**
 * Create a minimal persona definition.
 * Use this for quick registration of simple personas.
 */
export function createPersonaDefinition(
  id: string,
  name: string,
  description: string,
  voiceId: string,
  options?: {
    provider?: 'cartesia' | 'elevenlabs' | 'openai';
    role?: 'coach' | 'team' | 'standalone';
    aliases?: string[];
    domains?: string[];
  }
): PersonaDefinition {
  return {
    id,
    name,
    description,
    voice: {
      voiceId,
      provider: options?.provider ?? 'cartesia',
    },
    role: options?.role ?? 'team',
    aliases: options?.aliases,
    domains: options?.domains,
  };
}

/**
 * Generate handoff tool name from persona ID.
 * @example 'maya' -> 'handoffToMaya', 'peter-john' -> 'handoffToPeter'
 */
export function generateHandoffToolName(personaId: string): string {
  const parts = personaId.split('-');
  const firstName = parts[0];
  return `handoffTo${firstName.charAt(0).toUpperCase()}${firstName.slice(1)}`;
}

/**
 * Generate initials from name.
 */
export function generateInitials(name: string): string {
  const parts = name.split(/\s+/);
  if (parts.length === 1) {
    return name.substring(0, 2).toUpperCase();
  }
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}
