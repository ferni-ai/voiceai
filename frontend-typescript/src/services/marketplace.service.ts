/**
 * Marketplace Service
 *
 * Fetches and manages external agent bundles from the VoiceAI Agents marketplace.
 * Similar to Claude MCP's marketplace pattern - agents are discovered from a
 * central registry (GitHub) and installed into the local agent roster.
 *
 * MARKETPLACE SOURCES:
 * - 'proxy': Backend proxy at /api/marketplace/* (recommended for private repos)
 * - 'local': Local files at /voiceai-agents/* (for development)
 * - 'github': Direct GitHub URLs (public repos only)
 *
 * CONFIGURATION:
 * Set MARKETPLACE_SOURCE constant to switch between sources.
 * For 'proxy' mode, set GITHUB_MARKETPLACE_TOKEN in your .env file.
 *
 * USAGE:
 *   import { marketplaceService } from './services/marketplace.service.js';
 *
 *   // Browse available agents
 *   const agents = await marketplaceService.fetchRegistry();
 *
 *   // Install an agent
 *   await marketplaceService.installAgent('joel-dickson');
 *
 *   // Get installed agents
 *   const installed = marketplaceService.getInstalledAgents();
 */

import type { PersonaConfig, PersonaId } from '../types/persona.js';
import { ALL_PERSONA_IDS } from '../types/persona.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Marketplace');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Raw registry entry from GitHub (matches actual repo format)
 */
interface RawRegistryAgent {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license: 'free' | 'premium' | 'enterprise';
  category: string;
  tags: string[];
  path: string;
  requirements?: {
    voice_id_env?: string;
    min_platform_version?: string;
  };
  marketplace?: {
    icon?: string;
    featured?: boolean;
    downloads?: number;
    rating?: number;
  };
}

/**
 * Raw registry response from GitHub
 */
interface RawRegistry {
  version: string;
  name: string;
  description: string;
  repository: string;
  agents: RawRegistryAgent[];
  categories: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  updated_at: string;
}

/**
 * Registry entry for a marketplace agent (normalized for UI)
 */
export interface MarketplaceAgent {
  id: string;
  name: string;
  display_name: string;
  description: string;
  short_description: string;
  category: string;
  tags: string[];
  icon: string;
  version: string;
  author: string;
  license: 'free' | 'premium' | 'enterprise';
  colors: {
    primary: string;
    secondary: string;
    gradient?: string;
    glow?: string;
  };
  path: string;
  featured?: boolean;
  downloads?: number;
  rating?: number;
}

/**
 * Marketplace registry response (normalized for UI)
 */
export interface MarketplaceRegistry {
  version: string;
  updated_at: string;
  agents: MarketplaceAgent[];
  categories: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}

/**
 * Installed agent metadata stored in localStorage
 */
export interface InstalledAgent {
  id: string;
  installed_at: string;
  version: string;
  manifest: PersonaManifest | null;
}

/**
 * Persona manifest (subset of full manifest for frontend use)
 */
export interface PersonaManifest {
  version: string;
  identity: {
    id: string;
    name: string;
    display_name?: string;
    description?: string;
    aliases?: string[];
  };
  personality?: {
    warmth?: number;
    humor_level?: number;
    directness?: number;
    energy?: number;
    traits?: string[];
  };
  marketplace?: {
    display_name?: string;
    short_description?: string;
    category?: string;
    tags?: string[];
    icon?: string;
    colors?: {
      primary?: string;
      secondary?: string;
      gradient?: string;
      glow?: string;
    };
  };
  role?: {
    id?: string;
    domains?: string[];
  };
  team?: {
    handoff_phrases?: {
      receive?: string[];
    };
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Marketplace source configuration
 * 
 * Options:
 * - 'proxy': Use backend proxy at /api/marketplace/* (recommended for private repos)
 * - 'local': Use local files at /voiceai-agents/* (for development)
 * - 'github': Direct GitHub raw URLs (only works for public repos)
 * 
 * PRODUCTION BEHAVIOR:
 * - Development: Uses 'local' files for fast iteration
 * - Production: Uses 'proxy' for secure API access
 */
type MarketplaceSource = 'proxy' | 'local' | 'github';

/**
 * Get the appropriate marketplace source based on environment.
 * Development uses local files, production uses the proxy.
 */
function getMarketplaceSource(): MarketplaceSource {
  // Always use proxy - local voiceai-agents files have been removed
  // to consolidate the codebase. The proxy backend handles all marketplace requests.
  return 'proxy';
}

const MARKETPLACE_SOURCE: MarketplaceSource = getMarketplaceSource();

// URL configurations for each source type
const MARKETPLACE_URLS = {
  proxy: {
    registry: '/api/marketplace/registry',
    manifest: (agentId: string) => `/api/marketplace/agents/${agentId}/manifest`,
  },
  local: {
    registry: '/voiceai-agents/registry.json',
    manifest: (agentId: string) => `/voiceai-agents/agents/${agentId}/persona.manifest.json`,
  },
  github: {
    registry: 'https://raw.githubusercontent.com/sethdford/voiceai-agents/main/registry.json',
    manifest: (agentId: string) => `https://raw.githubusercontent.com/sethdford/voiceai-agents/main/agents/${agentId}/persona.manifest.json`,
  },
} as const;

// Current URLs based on selected source
const REGISTRY_URL = MARKETPLACE_URLS[MARKETPLACE_SOURCE].registry;
const getManifestUrl = MARKETPLACE_URLS[MARKETPLACE_SOURCE].manifest;

// Log the selected source on initialization
log.debug(`Marketplace source: ${MARKETPLACE_SOURCE} (registry: ${REGISTRY_URL})`);

const STORAGE_KEY = 'voiceai-marketplace-installed';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// STATE
// ============================================================================

let registryCache: MarketplaceRegistry | null = null;
let registryCacheTime = 0;
let installedAgentsCache: Map<string, InstalledAgent> | null = null;

// ============================================================================
// REGISTRY FUNCTIONS
// ============================================================================

/**
 * Default colors for agents that don't specify their own
 */
const DEFAULT_AGENT_COLORS: Record<string, { primary: string; secondary: string }> = {
  'jack-bogle': { primary: '#9a7b5a', secondary: '#7d6348' },
};

const FALLBACK_COLORS = { primary: '#4a6741', secondary: '#3d5a35' };

/**
 * Normalize a raw registry agent to our UI format
 */
function normalizeAgent(raw: RawRegistryAgent): MarketplaceAgent {
  const colors = DEFAULT_AGENT_COLORS[raw.id] || FALLBACK_COLORS;
  const primaryColor = colors.primary;
  const secondaryColor = colors.secondary;
  
  return {
    id: raw.id,
    name: raw.name,
    display_name: raw.name,
    description: raw.description,
    short_description: raw.description.split('.')[0] + '.',
    category: raw.category,
    tags: raw.tags,
    icon: raw.marketplace?.icon || '🤖',
    version: raw.version,
    author: raw.author,
    license: raw.license,
    colors: {
      primary: primaryColor,
      secondary: secondaryColor,
      gradient: `linear-gradient(135deg, ${secondaryColor}, ${primaryColor})`,
      glow: `rgba(${hexToRgb(primaryColor)}, 0.3)`,
    },
    path: raw.path,
    featured: raw.marketplace?.featured,
    downloads: raw.marketplace?.downloads,
    rating: raw.marketplace?.rating,
  };
}

/**
 * Fetch the marketplace registry
 */
export async function fetchRegistry(forceRefresh = false): Promise<MarketplaceRegistry> {
  const now = Date.now();

  // Return cache if valid
  if (!forceRefresh && registryCache && now - registryCacheTime < CACHE_TTL_MS) {
    return registryCache;
  }

  try {
    const response = await fetch(REGISTRY_URL, {
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch registry: ${response.status}`);
    }

    const rawRegistry = await response.json() as RawRegistry;
    
    // Normalize the registry format for our UI
    registryCache = {
      version: rawRegistry.version,
      updated_at: rawRegistry.updated_at,
      agents: rawRegistry.agents.map(normalizeAgent),
      categories: rawRegistry.categories || [],
    };
    registryCacheTime = now;

    log.info(`Loaded ${registryCache.agents.length} agents from registry`);
    return registryCache;
  } catch (err) {
    log.error('Failed to fetch registry:', err);

    // Return empty registry on error
    return {
      version: '0.0.0',
      updated_at: new Date().toISOString(),
      agents: [],
      categories: [],
    };
  }
}

/**
 * Fetch a specific agent's manifest from the marketplace
 */
export async function fetchAgentManifest(agentId: string): Promise<PersonaManifest | null> {
  const manifestUrl = getManifestUrl(agentId);

  try {
    const response = await fetch(manifestUrl, {
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.status}`);
    }

    const manifest = await response.json() as PersonaManifest;
    log.debug(`Loaded manifest for ${agentId}`);
    return manifest;
  } catch (err) {
    log.error(`Failed to fetch manifest for ${agentId}:`, err);
    return null;
  }
}

/**
 * Get IDs of agents that are part of the core team (built-in personas)
 */
function getCoreTeamAgentIds(): Set<string> {
  return new Set(ALL_PERSONA_IDS as readonly string[]);
}

/**
 * Get available agents (not in core team and not yet installed)
 * Filters out agents that are already part of the built-in personas
 */
export async function getAvailableAgents(): Promise<MarketplaceAgent[]> {
  const registry = await fetchRegistry();
  const installed = getInstalledAgentIds();
  const coreTeam = getCoreTeamAgentIds();

  return registry.agents.filter(agent => 
    !installed.has(agent.id) && !coreTeam.has(agent.id)
  );
}

/**
 * Search marketplace agents (excludes core team agents)
 */
export async function searchAgents(query: string): Promise<MarketplaceAgent[]> {
  const registry = await fetchRegistry();
  const coreTeam = getCoreTeamAgentIds();
  const normalizedQuery = query.toLowerCase().trim();

  // First filter out core team agents
  const availableAgents = registry.agents.filter(agent => !coreTeam.has(agent.id));

  if (!normalizedQuery) {
    return availableAgents;
  }

  return availableAgents.filter(agent =>
    agent.name.toLowerCase().includes(normalizedQuery) ||
    agent.display_name.toLowerCase().includes(normalizedQuery) ||
    agent.description.toLowerCase().includes(normalizedQuery) ||
    agent.tags.some(tag => tag.toLowerCase().includes(normalizedQuery))
  );
}

/**
 * Get agents by category (excludes core team agents)
 */
export async function getAgentsByCategory(category: string): Promise<MarketplaceAgent[]> {
  const registry = await fetchRegistry();
  const coreTeam = getCoreTeamAgentIds();
  
  return registry.agents.filter(agent => 
    agent.category === category && !coreTeam.has(agent.id)
  );
}

// ============================================================================
// INSTALLATION FUNCTIONS
// ============================================================================

/**
 * Install an agent from the marketplace
 */
export async function installAgent(agentId: string): Promise<boolean> {
  const registry = await fetchRegistry();
  const marketplaceAgent = registry.agents.find(a => a.id === agentId);

  if (!marketplaceAgent) {
    log.error(`Agent ${agentId} not found in registry`);
    return false;
  }

  // Fetch the full manifest
  const manifest = await fetchAgentManifest(agentId);

  // Create installed agent record
  const installedAgent: InstalledAgent = {
    id: agentId,
    installed_at: new Date().toISOString(),
    version: marketplaceAgent.version,
    manifest,
  };

  // Save to storage
  const installed = loadInstalledAgents();
  installed.set(agentId, installedAgent);
  saveInstalledAgents(installed);

  log.info(`Installed agent ${agentId}`);
  return true;
}

/**
 * Uninstall an agent
 */
export function uninstallAgent(agentId: string): boolean {
  const installed = loadInstalledAgents();

  if (!installed.has(agentId)) {
    log.warn(`Agent ${agentId} is not installed`);
    return false;
  }

  installed.delete(agentId);
  saveInstalledAgents(installed);

  log.info(`Uninstalled agent ${agentId}`);
  return true;
}

/**
 * Check if an agent is installed
 */
export function isAgentInstalled(agentId: string): boolean {
  const installed = loadInstalledAgents();
  return installed.has(agentId);
}

/**
 * Get all installed agents
 */
export function getInstalledAgents(): InstalledAgent[] {
  const installed = loadInstalledAgents();
  return Array.from(installed.values());
}

/**
 * Get installed agent IDs as a Set
 */
export function getInstalledAgentIds(): Set<string> {
  const installed = loadInstalledAgents();
  return new Set(installed.keys());
}

/**
 * Get an installed agent by ID
 */
export function getInstalledAgent(agentId: string): InstalledAgent | null {
  const installed = loadInstalledAgents();
  return installed.get(agentId) || null;
}

// ============================================================================
// CONVERSION FUNCTIONS
// ============================================================================

/**
 * Convert a marketplace agent + manifest to a PersonaConfig
 */
export function marketplaceAgentToPersonaConfig(
  agent: MarketplaceAgent,
  manifest: PersonaManifest | null
): PersonaConfig {
  const colors = manifest?.marketplace?.colors || agent.colors;
  const entrancePhrase = manifest?.team?.handoff_phrases?.receive?.[0]
    || `${agent.name} here. How can I help?`;

  return {
    id: agent.id as PersonaId,
    name: agent.name,
    initials: agent.name.slice(0, 2).toUpperCase(),
    subtitle: manifest?.role?.id?.replace(/-/g, ' ') || agent.category,
    role: 'standalone', // Marketplace agents are standalone by default
    quotes: [], // Would need to fetch from knowledge files
    helperText: agent.short_description,
    themeClass: `persona-${agent.id}`,
    colors: {
      primary: colors.primary || '#666666',
      secondary: colors.secondary || '#444444',
      glow: colors.glow || `rgba(${hexToRgb(colors.primary || '#666666')}, 0.3)`,
      gradient: colors.gradient || `linear-gradient(135deg, ${colors.secondary || '#444444'}, ${colors.primary || '#666666'})`,
    },
    skills: (manifest?.role?.domains || agent.tags).slice(0, 4).map(d => ({
      icon: '',
      name: d.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    })),
    entrancePhrase,
    handoffSound: 'connect', // Marketplace agents use generic connect sound
  };
}

/**
 * Get all installed agents as PersonaConfigs
 */
export async function getInstalledAgentsAsPersonaConfigs(): Promise<PersonaConfig[]> {
  const installed = getInstalledAgents();
  const registry = await fetchRegistry();

  return installed.map(installedAgent => {
    const marketplaceAgent = registry.agents.find(a => a.id === installedAgent.id);
    if (!marketplaceAgent) {
      log.warn(`Agent ${installedAgent.id} not found in registry`);
      // Return a basic config
      return {
        id: installedAgent.id as PersonaId,
        name: installedAgent.id,
        initials: installedAgent.id.slice(0, 2).toUpperCase(),
        subtitle: 'Marketplace Agent',
        role: 'standalone' as const,
        quotes: [],
        helperText: '',
        themeClass: `persona-${installedAgent.id}`,
        colors: {
          primary: '#666666',
          secondary: '#444444',
          glow: 'rgba(102, 102, 102, 0.3)',
          gradient: 'linear-gradient(135deg, #444444, #666666)',
        },
        skills: [],
        entrancePhrase: `${installedAgent.id} here.`,
        handoffSound: 'connect',
      };
    }

    return marketplaceAgentToPersonaConfig(marketplaceAgent, installedAgent.manifest);
  });
}

// ============================================================================
// STORAGE FUNCTIONS
// ============================================================================

function loadInstalledAgents(): Map<string, InstalledAgent> {
  if (installedAgentsCache) {
    return installedAgentsCache;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, InstalledAgent>;
      installedAgentsCache = new Map(Object.entries(parsed));
    } else {
      installedAgentsCache = new Map();
    }
  } catch (err) {
    log.warn('Failed to load installed agents from storage:', err);
    installedAgentsCache = new Map();
  }

  return installedAgentsCache;
}

function saveInstalledAgents(agents: Map<string, InstalledAgent>): void {
  installedAgentsCache = agents;

  try {
    const serialized = JSON.stringify(Object.fromEntries(agents));
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (err) {
    log.error('Failed to save installed agents:', err);
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '128, 128, 128';

  return `${parseInt(result[1] ?? '80', 16)}, ${parseInt(result[2] ?? '80', 16)}, ${parseInt(result[3] ?? '80', 16)}`;
}

// ============================================================================
// SERVICE SINGLETON
// ============================================================================

export const marketplaceService = {
  // Registry
  fetchRegistry,
  fetchAgentManifest,
  getAvailableAgents,
  searchAgents,
  getAgentsByCategory,

  // Installation
  installAgent,
  uninstallAgent,
  isAgentInstalled,
  getInstalledAgents,
  getInstalledAgentIds,
  getInstalledAgent,

  // Conversion
  marketplaceAgentToPersonaConfig,
  getInstalledAgentsAsPersonaConfigs,
};

export default marketplaceService;

