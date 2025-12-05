/**
 * Agent Directory - Single Source of Truth for Agent Data
 *
 * This module provides a unified interface for all agent-related lookups.
 * It wraps AgentRegistry and adds UI/transition configuration.
 *
 * DESIGN PRINCIPLES:
 * 1. ALL agent data comes from manifests via AgentRegistry
 * 2. NO hardcoded agent IDs or names
 * 3. Transition styles, emojis, and sounds are derived from manifest data
 * 4. Single function for ID normalization
 *
 * USAGE:
 *   import { AgentDirectory, normalizeAgentId } from './agent-directory.js';
 *
 *   // Normalize any ID format
 *   const id = normalizeAgentId('jack'); // Returns 'ferni'
 *
 *   // Get agent with all display data
 *   const entry = await AgentDirectory.getEntry('peter-john');
 *   console.log(entry.emoji); // '📈'
 *   console.log(entry.transitionStyle); // 'dramatic'
 */

import { AgentRegistry, type Agent } from './registry/unified-registry.js';
import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Transition style for handoff animations
 * - 'standard': Default team transitions
 * - 'dramatic': Theatrical entrances (e.g., Peter John)
 * - 'subtle': Quiet transitions (e.g., Nayan)
 * - 'warm': Welcoming transitions (e.g., returning to coach)
 */
export type TransitionStyle = 'standard' | 'dramatic' | 'subtle' | 'warm';

/**
 * Extended agent entry with UI and transition data
 */
export interface AgentDirectoryEntry {
  /** Canonical agent ID */
  readonly id: string;

  /** Display name */
  readonly name: string;

  /** Short display name (first name only) */
  readonly displayName: string;

  /** Agent role */
  readonly role: 'coach' | 'team' | 'standalone';

  /** Whether this is the coordinator */
  readonly isCoordinator: boolean;

  /** All known aliases for this agent */
  readonly aliases: readonly string[];

  /** Emoji for this agent (derived from role/specialties) */
  readonly emoji: string;

  /** Short specialty description */
  readonly specialty: string;

  /** Transition style for handoff animations */
  readonly transitionStyle: TransitionStyle;

  /** Handoff sound file name (without path) */
  readonly handoffSound: string;

  /** Delay multiplier for transitions (1.0 = standard) */
  readonly delayMultiplier: number;

  /** Original Agent object from registry */
  readonly agent: Agent;
}

/**
 * Handoff direction based on agent roles
 */
export type HandoffDirection =
  | 'coach-to-team'
  | 'team-to-coach'
  | 'team-to-team'
  | 'dramatic-entrance'
  | 'subtle-transition';

// ============================================================================
// EMOJI DERIVATION (from role/domain, not hardcoded per agent)
// ============================================================================

/**
 * Derive emoji from agent's role and domains.
 * Checks manifest.handoff.emoji first, then derives from agent characteristics.
 */
function deriveEmoji(agent: Agent): string {
  // Check manifest for explicit emoji
  const manifest = agent.manifest as {
    handoff?: { emoji?: string };
    marketplace?: { icon?: string };
  };

  if (manifest.handoff?.emoji) {
    return manifest.handoff.emoji;
  }

  // Coach gets target/coordinator emoji
  if (agent.isCoordinator) {
    return '🎯';
  }

  // Check domains for best match
  const domains = agent.manifest.role?.domains || [];
  const domainLower = domains.map((d) => d.toLowerCase());

  if (
    domainLower.some((d) => d.includes('research') || d.includes('invest') || d.includes('stock'))
  ) {
    return '📈';
  }
  if (
    domainLower.some(
      (d) => d.includes('wisdom') || d.includes('philosophy') || d.includes('mindfulness')
    )
  ) {
    return '🧘';
  }
  if (
    domainLower.some(
      (d) => d.includes('communication') || d.includes('email') || d.includes('calendar')
    )
  ) {
    return '📧';
  }
  if (
    domainLower.some(
      (d) =>
        d.includes('budget') || d.includes('spend') || d.includes('save') || d.includes('habit')
    )
  ) {
    return '💰';
  }
  if (
    domainLower.some(
      (d) => d.includes('planning') || d.includes('milestone') || d.includes('event')
    )
  ) {
    return '🎉';
  }
  if (domainLower.some((d) => d.includes('entertainment') || d.includes('music'))) {
    return '🎵';
  }

  // Use marketplace icon if available
  if (manifest.marketplace?.icon) {
    return manifest.marketplace.icon;
  }

  // Default team member emoji
  return '✨';
}

/**
 * Derive transition style from agent characteristics.
 * Checks manifest.handoff.transition_style first, then derives from agent personality.
 */
function deriveTransitionStyle(agent: Agent): TransitionStyle {
  // Check manifest for explicit transition config (from BundleHandoffTransition)
  const manifest = agent.manifest as {
    handoff?: {
      transition_style?: TransitionStyle;
      emoji?: string;
      sound?: string;
      delay_multiplier?: number;
    };
    personality?: { energy?: number };
  };

  // Explicit config takes priority
  if (manifest.handoff?.transition_style) {
    return manifest.handoff.transition_style;
  }

  // Coach returns are warm
  if (agent.isCoordinator) {
    return 'warm';
  }

  // High-energy agents get dramatic entrances
  const energy = manifest.personality?.energy || 0.5;
  if (energy >= 0.8) {
    return 'dramatic';
  }

  // Low-energy/wisdom agents get subtle transitions
  const domains = agent.manifest.role?.domains || [];
  if (
    domains.some(
      (d) => d.toLowerCase().includes('wisdom') || d.toLowerCase().includes('mindfulness')
    )
  ) {
    return 'subtle';
  }

  return 'standard';
}

/**
 * Derive delay multiplier from agent configuration.
 * Checks manifest.handoff.delay_multiplier first, then derives from transition style.
 */
function deriveDelayMultiplier(agent: Agent, style: TransitionStyle): number {
  // Check manifest for explicit multiplier
  const manifest = agent.manifest as {
    handoff?: { delay_multiplier?: number };
  };

  if (manifest.handoff?.delay_multiplier !== undefined) {
    return manifest.handoff.delay_multiplier;
  }

  // Derive from transition style
  switch (style) {
    case 'dramatic':
      return 1.3; // 30% longer for theatrical effect
    case 'subtle':
      return 0.8; // 20% shorter for calm transitions
    case 'warm':
      return 1.0; // Standard timing for coach
    default:
      return 1.0;
  }
}

/**
 * Derive handoff sound from agent configuration.
 * Checks manifest.handoff.sound first, then derives from transition style.
 */
function deriveHandoffSound(agent: Agent, style: TransitionStyle): string {
  // Check manifest for explicit sound
  const manifest = agent.manifest as {
    handoff?: { sound?: string };
  };

  if (manifest.handoff?.sound) {
    return manifest.handoff.sound;
  }

  // Coach uses connect sound (welcoming back)
  if (agent.isCoordinator) {
    return 'connect';
  }

  // Dramatic entrances use dramatic sound
  if (style === 'dramatic') {
    return 'dramatic-entrance';
  }

  // Default: persona-specific sound (e.g., 'handoff-to-peter')
  const firstName = agent.id.split('-')[0];
  return `handoff-to-${firstName}`;
}

// ============================================================================
// CONVERSION
// ============================================================================

/**
 * Convert an Agent to an AgentDirectoryEntry
 */
function agentToEntry(agent: Agent): AgentDirectoryEntry {
  const transitionStyle = deriveTransitionStyle(agent);

  // Handle aliases safely (may be undefined in test mocks)
  const aliases = Array.isArray(agent.aliases) ? agent.aliases : [];

  return {
    id: agent.id,
    name: agent.name,
    displayName: agent.name.split(' ')[0], // First name only
    role: agent.role,
    isCoordinator: agent.isCoordinator,
    aliases: Object.freeze([...aliases]),
    emoji: deriveEmoji(agent),
    specialty: agent.roleDescription,
    transitionStyle,
    handoffSound: deriveHandoffSound(agent, transitionStyle),
    delayMultiplier: deriveDelayMultiplier(agent, transitionStyle),
    agent,
  };
}

// ============================================================================
// CACHE
// ============================================================================

let entryCache: Map<string, AgentDirectoryEntry> | null = null;
let aliasCache: Map<string, string> | null = null;

async function ensureCache(): Promise<Map<string, AgentDirectoryEntry>> {
  if (entryCache) return entryCache;

  const agents = await AgentRegistry.getAllAgents();
  entryCache = new Map();
  aliasCache = new Map();

  for (const agent of agents) {
    const entry = agentToEntry(agent);
    entryCache.set(entry.id, entry);

    // Build alias map
    for (const alias of entry.aliases) {
      aliasCache.set(alias.toLowerCase(), entry.id);
    }
  }

  return entryCache;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Normalize any agent ID to canonical form.
 *
 * This is THE SINGLE function for ID normalization.
 * Do not create other normalization functions elsewhere!
 *
 * @param input - Any agent ID, alias, or name
 * @returns Canonical agent ID, or 'ferni' if not found
 */
export async function normalizeAgentId(input: string): Promise<string> {
  await ensureCache();

  if (!aliasCache) return 'ferni';

  const normalized = input.toLowerCase().trim();
  return aliasCache.get(normalized) || 'ferni';
}

/**
 * Synchronous ID normalization (uses cached data)
 * Call ensureCache() first if needed, or use async version
 */
export function normalizeAgentIdSync(input: string): string {
  if (!aliasCache) {
    getLogger().warn('normalizeAgentIdSync called before cache initialized');
    return 'ferni';
  }

  const normalized = input.toLowerCase().trim();
  return aliasCache.get(normalized) || 'ferni';
}

/**
 * Agent Directory - unified access to agent data
 */
export const AgentDirectory = {
  /**
   * Get an agent entry by ID or alias
   */
  async getEntry(idOrAlias: string): Promise<AgentDirectoryEntry | null> {
    const cache = await ensureCache();
    const canonicalId = await normalizeAgentId(idOrAlias);
    return cache.get(canonicalId) || null;
  },

  /**
   * Get an agent entry, falling back to coordinator if not found
   */
  async getEntryOrCoordinator(idOrAlias: string): Promise<AgentDirectoryEntry> {
    const entry = await this.getEntry(idOrAlias);
    if (entry) return entry;

    const coordinator = await this.getCoordinator();
    return coordinator;
  },

  /**
   * Get all agent entries
   */
  async getAllEntries(): Promise<AgentDirectoryEntry[]> {
    const cache = await ensureCache();
    return Array.from(cache.values());
  },

  /**
   * Get the coordinator entry
   */
  async getCoordinator(): Promise<AgentDirectoryEntry> {
    const cache = await ensureCache();
    for (const entry of cache.values()) {
      if (entry.isCoordinator) return entry;
    }
    throw new Error('No coordinator found');
  },

  /**
   * Get all team members (excluding coordinator)
   */
  async getTeamMembers(): Promise<AgentDirectoryEntry[]> {
    const cache = await ensureCache();
    return Array.from(cache.values()).filter((e) => e.role === 'team');
  },

  /**
   * Check if two IDs refer to the same agent
   */
  async isSameAgent(id1: string, id2: string): Promise<boolean> {
    const canonical1 = await normalizeAgentId(id1);
    const canonical2 = await normalizeAgentId(id2);
    return canonical1 === canonical2;
  },

  /**
   * Determine handoff direction based on agent roles
   */
  async getHandoffDirection(fromId: string, toId: string): Promise<HandoffDirection> {
    const fromEntry = await this.getEntryOrCoordinator(fromId);
    const toEntry = await this.getEntryOrCoordinator(toId);

    // Use transition style for dramatic entrances
    if (toEntry.transitionStyle === 'dramatic') {
      return 'dramatic-entrance';
    }
    if (toEntry.transitionStyle === 'subtle') {
      return 'subtle-transition';
    }

    // Role-based direction
    if (fromEntry.isCoordinator && !toEntry.isCoordinator) {
      return 'coach-to-team';
    }
    if (!fromEntry.isCoordinator && toEntry.isCoordinator) {
      return 'team-to-coach';
    }

    return 'team-to-team';
  },

  /**
   * Get display name for an agent
   */
  async getDisplayName(idOrAlias: string): Promise<string> {
    const entry = await this.getEntry(idOrAlias);
    return entry?.displayName || idOrAlias;
  },

  /**
   * Get emoji for an agent
   */
  async getEmoji(idOrAlias: string): Promise<string> {
    const entry = await this.getEntry(idOrAlias);
    return entry?.emoji || '✨';
  },

  /**
   * Get handoff sound for an agent
   */
  async getHandoffSound(idOrAlias: string): Promise<string> {
    const entry = await this.getEntry(idOrAlias);
    return entry?.handoffSound || 'connect';
  },

  /**
   * Get team members for handoff display
   */
  async getTeamForHandoff(): Promise<
    Array<{ id: string; name: string; specialty: string; emoji: string }>
  > {
    const team = await this.getTeamMembers();
    return team.map((e) => ({
      id: e.id,
      name: e.displayName,
      specialty: e.specialty,
      emoji: e.emoji,
    }));
  },

  /**
   * Initialize the cache (call at startup)
   */
  async initialize(): Promise<void> {
    await ensureCache();
    getLogger().info({ entryCount: entryCache?.size }, 'AgentDirectory initialized');
  },

  /**
   * Clear the cache (call when agents change)
   */
  clearCache(): void {
    entryCache = null;
    aliasCache = null;
    AgentRegistry.clearCache();
  },

  /**
   * Get LLM context instructions for an agent (for handoff identity reminders)
   * Reads from manifest.llm_context
   */
  async getLLMContext(idOrAlias: string): Promise<string> {
    const entry = await this.getEntry(idOrAlias);
    if (!entry) return '';

    const manifest = entry.agent.manifest as {
      llm_context?: {
        identity_reminder?: string;
        role_summary?: string;
        tool_guidance?: {
          specialized?: string[];
          stock_research?: string[];
          memory?: string[];
          handoffs?: string[] | Record<string, string>;
        };
      };
    };

    if (!manifest.llm_context) {
      return '';
    }

    const ctx = manifest.llm_context;
    const lines: string[] = [];

    // Identity reminder
    if (ctx.identity_reminder) {
      lines.push(ctx.identity_reminder);
    }

    // Role summary
    if (ctx.role_summary) {
      lines.push(`- ${ctx.role_summary}`);
    }

    // Tool guidance
    if (ctx.tool_guidance) {
      const tg = ctx.tool_guidance;

      // Specialized tools
      if (tg.specialized?.length) {
        lines.push(`- YOUR SPECIALIZED TOOLS: ${tg.specialized.join(', ')}`);
      }

      // Stock research tools (for Peter)
      if (tg.stock_research?.length) {
        lines.push(`- YOUR STOCK RESEARCH TOOLS: ${tg.stock_research.join(', ')}`);
      }

      // Memory tools
      if (tg.memory?.length) {
        lines.push(`- YOUR MEMORY TOOLS: ${tg.memory.join(', ')}`);
      }

      // Handoffs
      if (tg.handoffs) {
        if (Array.isArray(tg.handoffs)) {
          lines.push(`- HANDOFF TOOLS: ${tg.handoffs.join(', ')}`);
        } else {
          // Object format with descriptions
          const handoffLines = Object.entries(tg.handoffs).map(
            ([key, value]) => `For ${key.replace(/_/g, ' ')} → ${value}`
          );
          lines.push(`- ${handoffLines.join('\n- ')}`);
        }
      }
    }

    return lines.join('\n');
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export default AgentDirectory;
