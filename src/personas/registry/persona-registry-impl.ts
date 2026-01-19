/**
 * Persona Registry Implementation - OCP Compliant
 *
 * This implementation wraps the existing AgentRegistry and adds:
 * - Runtime persona registration
 * - Plugin persona registration
 * - Unified interface for all persona sources
 *
 * The registry combines three persona sources:
 * 1. Bundle Discovery: Auto-discovered from bundles/ directory
 * 2. Runtime Registration: Programmatically registered at runtime
 * 3. Plugin Registration: Registered by plugins/extensions
 *
 * @module personas/registry/persona-registry-impl
 */

import { AgentRegistry, type Agent } from './unified-registry.js';
import { getLogger } from '../../utils/safe-logger.js';
import type {
  IPersonaRegistry,
  PersonaDefinition,
  RegisteredPersona,
  RegistrationOptions,
  RegistrationResult,
  PersonaQueryOptions,
} from './persona-registry-interface.js';
import { generateHandoffToolName, generateInitials } from './persona-registry-interface.js';

const log = getLogger().child({ module: 'PersonaRegistry' });

// ============================================================================
// INTERNAL STATE
// ============================================================================

/** Runtime-registered personas */
const runtimePersonas = new Map<string, RegisteredPersona>();

/** Alias lookup for runtime personas */
const runtimeAliasMap = new Map<string, string>();

/** Last registration time */
let lastRegistrationTime = Date.now();

// ============================================================================
// CONVERSION HELPERS
// ============================================================================

/**
 * Convert Agent (from AgentRegistry) to RegisteredPersona
 */
function agentToRegisteredPersona(agent: Agent): RegisteredPersona {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    voice: {
      voiceId: agent.voiceId,
      provider: agent.voiceProvider,
    },
    role: agent.role,
    isCoordinator: agent.isCoordinator,
    canHandoff: agent.canHandoff,
    handoffTargets: agent.handoffTargets,
    handoffTriggers: agent.handoffTriggers,
    aliases: agent.aliases,
    ui: agent.ui,
    domains: agent.manifest.role?.domains,

    // Computed fields
    enabled: agent.enabled,
    allAliases: agent.aliases,
    handoffToolName: agent.handoffToolName,
    source: 'bundle',
    registeredAt: new Date(0), // Bundle personas don't have registration time
  };
}

/**
 * Convert PersonaDefinition to RegisteredPersona
 */
function definitionToRegisteredPersona(
  definition: PersonaDefinition,
  source: 'runtime' | 'plugin'
): RegisteredPersona {
  const id = definition.id.toLowerCase();

  // Build all aliases
  const allAliases = new Set<string>([
    id,
    definition.name.toLowerCase(),
    ...(definition.aliases || []).map((a) => a.toLowerCase()),
  ]);

  return {
    ...definition,
    id,
    enabled: true, // Runtime personas are enabled by default
    allAliases: Array.from(allAliases),
    handoffToolName: generateHandoffToolName(id),
    source,
    registeredAt: new Date(),
    ui: definition.ui ?? {
      initials: generateInitials(definition.name),
      subtitle: definition.description,
      themeClass: `persona-${id}`,
    },
  };
}

/**
 * Validate a persona definition
 */
function validateDefinition(definition: PersonaDefinition): string[] {
  const errors: string[] = [];

  if (!definition.id || typeof definition.id !== 'string') {
    errors.push('Persona ID is required and must be a string');
  } else if (!/^[a-z][a-z0-9-]*$/.test(definition.id.toLowerCase())) {
    errors.push('Persona ID must start with a letter and contain only lowercase letters, numbers, and hyphens');
  }

  if (!definition.name || typeof definition.name !== 'string') {
    errors.push('Persona name is required');
  }

  if (!definition.description || typeof definition.description !== 'string') {
    errors.push('Persona description is required');
  }

  if (!definition.voice?.voiceId) {
    errors.push('Voice ID is required');
  }

  if (!['coach', 'team', 'standalone'].includes(definition.role)) {
    errors.push('Role must be one of: coach, team, standalone');
  }

  return errors;
}

// ============================================================================
// PERSONA REGISTRY IMPLEMENTATION
// ============================================================================

/**
 * OCP-compliant Persona Registry implementation.
 *
 * Combines bundle discovery with runtime registration for maximum flexibility.
 */
class PersonaRegistryImpl implements IPersonaRegistry {
  // ===== REGISTRATION =====

  async register(
    persona: PersonaDefinition,
    options: RegistrationOptions = {}
  ): Promise<RegistrationResult> {
    const { overwrite = false, source = 'runtime', skipValidation = false } = options;
    const personaId = persona.id.toLowerCase();

    // Validate unless skipped
    if (!skipValidation) {
      const errors = validateDefinition(persona);
      if (errors.length > 0) {
        return {
          success: false,
          personaId,
          message: `Validation failed: ${errors.join('; ')}`,
        };
      }
    }

    // Check for existing persona
    const existingRuntime = runtimePersonas.has(personaId);
    const existingBundle = await AgentRegistry.hasAgent(personaId);

    if (existingBundle && source !== 'plugin') {
      // Bundle personas cannot be overwritten by runtime registration
      return {
        success: false,
        personaId,
        message: `Persona '${personaId}' exists as a bundle persona and cannot be overwritten`,
      };
    }

    if (existingRuntime && !overwrite) {
      return {
        success: false,
        personaId,
        message: `Persona '${personaId}' already registered. Use overwrite option to replace.`,
      };
    }

    // Convert and store - source is always 'runtime' or 'plugin' at this point
    // (bundle personas come from auto-discovery, not registration)
    const registrationSource = source === 'bundle' ? 'runtime' : source;
    const registered = definitionToRegisteredPersona(persona, registrationSource);
    runtimePersonas.set(personaId, registered);

    // Update alias map
    for (const alias of registered.allAliases) {
      runtimeAliasMap.set(alias, personaId);
    }
    runtimeAliasMap.set(registered.handoffToolName.toLowerCase(), personaId);

    lastRegistrationTime = Date.now();

    log.info({ personaId, source, replaced: existingRuntime && overwrite }, 'Persona registered');

    return {
      success: true,
      personaId,
      replaced: existingRuntime && overwrite,
      message: existingRuntime && overwrite
        ? `Persona '${personaId}' replaced`
        : `Persona '${personaId}' registered`,
    };
  }

  async registerBatch(
    personas: PersonaDefinition[],
    options: RegistrationOptions = {}
  ): Promise<RegistrationResult[]> {
    const results: RegistrationResult[] = [];

    for (const persona of personas) {
      const result = await this.register(persona, options);
      results.push(result);
    }

    return results;
  }

  async unregister(personaId: string): Promise<boolean> {
    const id = personaId.toLowerCase();
    const persona = runtimePersonas.get(id);

    if (!persona) {
      log.warn({ personaId }, 'Cannot unregister: persona not found in runtime registry');
      return false;
    }

    // Remove from maps
    runtimePersonas.delete(id);

    // Remove aliases
    for (const alias of persona.allAliases) {
      if (runtimeAliasMap.get(alias) === id) {
        runtimeAliasMap.delete(alias);
      }
    }
    runtimeAliasMap.delete(persona.handoffToolName.toLowerCase());

    log.info({ personaId }, 'Persona unregistered');
    return true;
  }

  // ===== LOOKUP =====

  async get(idOrAlias: string): Promise<RegisteredPersona | null> {
    const normalized = idOrAlias.toLowerCase().trim();

    // Check runtime personas first (they can override)
    const runtimeId = runtimeAliasMap.get(normalized);
    if (runtimeId) {
      const persona = runtimePersonas.get(runtimeId);
      if (persona) {
        return persona;
      }
    }

    // Check runtime by direct ID
    if (runtimePersonas.has(normalized)) {
      return runtimePersonas.get(normalized)!;
    }

    // Fall back to AgentRegistry
    const agent = await AgentRegistry.getAgentOrNull(idOrAlias);
    if (agent) {
      return agentToRegisteredPersona(agent);
    }

    return null;
  }

  async getOrDefault(idOrAlias: string): Promise<RegisteredPersona> {
    const persona = await this.get(idOrAlias);
    if (persona) {
      return persona;
    }

    // Fall back to coordinator
    log.warn({ idOrAlias }, 'Unknown persona, falling back to coordinator');
    return this.getCoordinator();
  }

  async has(idOrAlias: string): Promise<boolean> {
    const persona = await this.get(idOrAlias);
    return persona !== null;
  }

  async resolveId(idOrAlias: string): Promise<string | null> {
    const normalized = idOrAlias.toLowerCase().trim();

    // Check runtime first
    const runtimeId = runtimeAliasMap.get(normalized);
    if (runtimeId) {
      return runtimeId;
    }

    // Fall back to AgentRegistry
    return AgentRegistry.resolveAgentId(idOrAlias);
  }

  async isSamePersona(id1: string, id2: string): Promise<boolean> {
    const resolved1 = await this.resolveId(id1);
    const resolved2 = await this.resolveId(id2);
    return resolved1 !== null && resolved1 === resolved2;
  }

  // ===== QUERIES =====

  async getAll(options: PersonaQueryOptions = {}): Promise<RegisteredPersona[]> {
    const result: RegisteredPersona[] = [];

    // Get bundle personas
    const bundleAgents = await AgentRegistry.getAllAgents();
    for (const agent of bundleAgents) {
      const persona = agentToRegisteredPersona(agent);

      // Apply filters
      if (!options.includeDisabled && !persona.enabled) continue;
      if (options.role && persona.role !== options.role) continue;
      if (options.source && persona.source !== options.source) continue;
      if (options.domain && !persona.domains?.includes(options.domain)) continue;

      result.push(persona);
    }

    // Get runtime personas
    for (const persona of runtimePersonas.values()) {
      // Apply filters
      if (!options.includeDisabled && !persona.enabled) continue;
      if (options.role && persona.role !== options.role) continue;
      if (options.source && persona.source !== options.source) continue;
      if (options.domain && !persona.domains?.includes(options.domain)) continue;

      // Runtime personas can override bundle personas
      const existingIndex = result.findIndex((p) => p.id === persona.id);
      if (existingIndex >= 0) {
        result[existingIndex] = persona;
      } else {
        result.push(persona);
      }
    }

    return result;
  }

  async getEnabled(options: PersonaQueryOptions = {}): Promise<RegisteredPersona[]> {
    return this.getAll({ ...options, includeDisabled: false });
  }

  async getCoordinator(): Promise<RegisteredPersona> {
    // Check runtime first for coordinator override
    for (const persona of runtimePersonas.values()) {
      if (persona.isCoordinator) {
        return persona;
      }
    }

    // Fall back to AgentRegistry
    const agent = await AgentRegistry.getCoordinator();
    return agentToRegisteredPersona(agent);
  }

  async getTeamMembers(): Promise<RegisteredPersona[]> {
    return this.getAll({ role: 'team', includeDisabled: false });
  }

  async getByDomain(domain: string): Promise<RegisteredPersona[]> {
    return this.getAll({ domain, includeDisabled: false });
  }

  // ===== VOICE =====

  async getVoiceId(idOrAlias: string): Promise<string> {
    const persona = await this.getOrDefault(idOrAlias);
    return persona.voice.voiceId;
  }

  async getVoiceProvider(idOrAlias: string): Promise<'cartesia' | 'elevenlabs' | 'openai'> {
    const persona = await this.getOrDefault(idOrAlias);
    return persona.voice.provider;
  }

  // ===== LIFECYCLE =====

  async refresh(): Promise<void> {
    // Refresh underlying AgentRegistry
    // This re-discovers bundles
    await AgentRegistry.getAllAgents(); // Forces re-discovery

    log.info({
      bundleCount: (await AgentRegistry.getAllAgents()).length,
      runtimeCount: runtimePersonas.size,
    }, 'Persona registry refreshed');
  }

  async clearRuntime(): Promise<number> {
    const count = runtimePersonas.size;
    runtimePersonas.clear();
    runtimeAliasMap.clear();

    log.info({ count }, 'Runtime personas cleared');
    return count;
  }

  async getStats(): Promise<{
    total: number;
    enabled: number;
    fromBundles: number;
    fromRuntime: number;
    fromPlugins: number;
  }> {
    const all = await this.getAll({ includeDisabled: true });
    const enabled = all.filter((p) => p.enabled);
    const fromBundles = all.filter((p) => p.source === 'bundle');
    const fromRuntime = all.filter((p) => p.source === 'runtime');
    const fromPlugins = all.filter((p) => p.source === 'plugin');

    return {
      total: all.length,
      enabled: enabled.length,
      fromBundles: fromBundles.length,
      fromRuntime: fromRuntime.length,
      fromPlugins: fromPlugins.length,
    };
  }
}

// ============================================================================
// SINGLETON & EXPORTS
// ============================================================================

/** Global PersonaRegistry instance */
let personaRegistryInstance: PersonaRegistryImpl | null = null;

/**
 * Get the global PersonaRegistry instance.
 * Creates it on first access.
 */
export function getPersonaRegistry(): IPersonaRegistry {
  if (!personaRegistryInstance) {
    personaRegistryInstance = new PersonaRegistryImpl();
  }
  return personaRegistryInstance;
}

/**
 * Reset the PersonaRegistry (for testing).
 * Clears runtime personas but keeps bundle discovery.
 */
export async function resetPersonaRegistry(): Promise<void> {
  if (personaRegistryInstance) {
    await personaRegistryInstance.clearRuntime();
  }
  personaRegistryInstance = null;
}

/**
 * Export the implementation class for DI container registration.
 */
export { PersonaRegistryImpl };
