/**
 * Agents Service
 *
 * Fetches agent data from the backend API for dynamic UI rendering.
 * This replaces hardcoded persona configurations with bundle-discovered agents.
 *
 * USAGE:
 *   import { agentsService, fetchAgents, getAgentById } from './services/agents.service.js';
 *
 *   // Fetch all agents (caches result)
 *   const agents = await fetchAgents();
 *
 *   // Get a specific agent
 *   const jack = await getAgentById('jack-bogle');
 */

import type { PersonaId, PersonaConfig } from '../types/persona.js';
import { PERSONAS } from '../config/personas.js';
import { getPersonaColorConfig, PERSONA_COLORS } from '../config/persona-colors.js';
import { createLogger } from '../utils/logger.js';
import { apiGet } from '../utils/api-helpers.js';

const log = createLogger('Agents');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Agent data as returned from the API
 */
export interface ApiAgent {
  id: string;
  name: string;
  initials: string;
  subtitle: string;
  role: 'coach' | 'team' | 'standalone';
  roleId: string;
  isCoordinator: boolean;
  canHandoff: boolean;
  handoffToolName: string;
  entrancePhrase?: string;
  themeClass: string;
  voiceId: string;
  colors?: {
    primary?: string;
    secondary?: string;
    gradient?: string;
    glow?: string;
  } | null;
  aliases?: string[];
  handoffTriggers?: string[];
  /** True if this is a user-created custom agent */
  isCustomAgent?: boolean;
  /** Custom agent type (if isCustomAgent is true) */
  customAgentType?: 'legacy' | 'mentor' | 'twin' | 'fictional' | 'professional';
}

/**
 * Response from /api/agents endpoint
 */
export interface AgentsApiResponse {
  agents: ApiAgent[];
  count: number;
  timestamp: string;
}

/**
 * Error response from API
 */
export interface AgentsApiError {
  error: string;
  message?: string;
  fallback?: string[];
}

// ============================================================================
// CACHE
// ============================================================================

/** Cached agents */
let agentsCache: ApiAgent[] | null = null;

/** Cache timestamp */
let cacheTimestamp: number = 0;

/** Cache TTL in milliseconds (2 minutes) */
const CACHE_TTL_MS = 2 * 60 * 1000;

/** Whether a fetch is in progress */
let fetchInProgress: Promise<ApiAgent[]> | null = null;

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch all agents from the backend API
 * Results are cached for performance
 */
export async function fetchAgents(forceRefresh: boolean = false): Promise<ApiAgent[]> {
  const now = Date.now();

  // Return cached result if still valid
  if (!forceRefresh && agentsCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return agentsCache;
  }

  // If a fetch is already in progress, wait for it
  if (fetchInProgress) {
    return fetchInProgress;
  }

  // Start new fetch
  fetchInProgress = (async () => {
    try {
      const response = await apiGet('/api/agents');

      if (!response.ok) {
        const errorData = await response.json() as AgentsApiError;
        log.error('❌ Failed to fetch agents:', errorData);

        // Use fallback IDs if provided
        if (errorData.fallback) {
          log.warn('⚠️ Using fallback agent list');
          return fallbackToHardcodedAgents(errorData.fallback);
        }

        throw new Error(errorData.message || 'Failed to fetch agents');
      }

      const data = await response.json() as AgentsApiResponse;

      // Update cache
      agentsCache = data.agents;
      cacheTimestamp = now;

      log.info(`✅ Loaded ${data.agents.length} agents from API`);
      return data.agents;
    } catch (err) {
      log.error('❌ Network error fetching agents:', err);

      // Fall back to hardcoded PERSONAS if API fails
      return fallbackToHardcodedAgents();
    } finally {
      fetchInProgress = null;
    }
  })();

  return fetchInProgress;
}

/**
 * Get a single agent by ID or alias
 */
export async function getAgentById(idOrAlias: string): Promise<ApiAgent | null> {
  // First try from cache
  const agents = await fetchAgents();
  
  const normalized = idOrAlias.toLowerCase().trim();
  
  // Find by ID
  let agent = agents.find(a => a.id.toLowerCase() === normalized);
  if (agent) return agent;
  
  // Find by alias
  agent = agents.find(a => a.aliases?.some(alias => alias.toLowerCase() === normalized));
  if (agent) return agent;
  
  // Find by role ID
  agent = agents.find(a => a.roleId.toLowerCase() === normalized);
  if (agent) return agent;
  
  return null;
}

/**
 * Get the coordinator agent
 */
export async function getCoordinatorAgent(): Promise<ApiAgent | null> {
  const agents = await fetchAgents();
  return agents.find(a => a.isCoordinator) || null;
}

/**
 * Get all team member agents (excluding coordinator)
 */
export async function getTeamMemberAgents(): Promise<ApiAgent[]> {
  const agents = await fetchAgents();
  return agents.filter(a => a.role === 'team');
}

/**
 * Convert API agent to PersonaConfig for backwards compatibility
 */
export function agentToPersonaConfig(agent: ApiAgent): PersonaConfig {
  // Get colors from API or fall back to hardcoded colors
  const colors = agent.colors || getPersonaColorConfig(agent.id);
  
  return {
    id: agent.id as PersonaId,
    name: agent.name,
    initials: agent.initials,
    subtitle: agent.subtitle,
    role: agent.role,
    quotes: [], // Not available from API, would need separate endpoint
    helperText: agent.subtitle,
    themeClass: agent.themeClass,
    colors: {
      primary: colors.primary || '#4a6741',
      secondary: colors.secondary || '#3d5a35',
      glow: colors.glow || 'rgba(74, 103, 65, 0.28)',
      gradient: colors.gradient || 'linear-gradient(135deg, #3d5a35, #4a6741)',
    },
    skills: [], // Not available from API
    entrancePhrase: agent.entrancePhrase || `${agent.name} here.`,
    handoffSound: agent.isCoordinator ? 'connect' : `handoff-${agent.id}`,
  };
}

/**
 * Get all agents as PersonaConfig objects (for backwards compatibility)
 */
export async function getAgentsAsPersonaConfigs(): Promise<PersonaConfig[]> {
  const agents = await fetchAgents();
  return agents.map(agentToPersonaConfig);
}

// ============================================================================
// FALLBACK FUNCTIONS
// ============================================================================

/**
 * Fall back to hardcoded PERSONAS when API is unavailable
 */
function fallbackToHardcodedAgents(agentIds?: string[]): ApiAgent[] {
  log.warn('⚠️ Using hardcoded personas as fallback');
  
  // Use canonical order instead of Object.keys() which may be unpredictable
  const CANONICAL_ORDER = ['ferni', 'peter-john', 'maya-santos', 'jordan-taylor', 'alex-chen', 'nayan-patel'];
  const ids = agentIds || CANONICAL_ORDER.filter(id => id in PERSONAS);
  const agents: ApiAgent[] = [];
  
  for (const id of ids) {
    const persona = PERSONAS[id as PersonaId];
    if (!persona) continue;
    
    const colors = PERSONA_COLORS[id] || getPersonaColorConfig(id);
    
    agents.push({
      id: persona.id,
      name: persona.name,
      initials: persona.initials,
      subtitle: persona.subtitle,
      role: persona.role,
      roleId: persona.id,
      isCoordinator: persona.role === 'coach',
      canHandoff: true,
      handoffToolName: `handoffTo${persona.name.charAt(0).toUpperCase()}${persona.name.slice(1)}`,
      entrancePhrase: persona.entrancePhrase,
      themeClass: persona.themeClass || `persona-${persona.id}`,
      voiceId: '', // Not available in frontend config
      colors: colors ? {
        primary: colors.primary,
        secondary: colors.secondary,
        gradient: colors.gradient,
        glow: colors.glow,
      } : null,
    });
  }
  
  return agents;
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear the agents cache
 */
export function clearAgentsCache(): void {
  agentsCache = null;
  cacheTimestamp = 0;
  fetchInProgress = null;
}

/**
 * Check if agents are cached
 */
export function hasCachedAgents(): boolean {
  return agentsCache !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

// ============================================================================
// SERVICE OBJECT
// ============================================================================

/**
 * Agents service singleton
 */
export const agentsService = {
  fetchAgents,
  getAgentById,
  getCoordinatorAgent,
  getTeamMemberAgents,
  agentToPersonaConfig,
  getAgentsAsPersonaConfigs,
  clearCache: clearAgentsCache,
  hasCachedAgents,
};

export default agentsService;

