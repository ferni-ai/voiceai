/**
 * Team Configuration
 *
 * ARCHITECTURE:
 * =============
 * SINGLE SOURCE OF TRUTH: Each persona's `persona.manifest.json` file.
 *
 * The PRIMARY method for getting team config is `getTeamConfig()` which calls
 * `generateTeamConfigFromBundles()` to dynamically build team configuration
 * from bundle manifests.
 *
 * The hardcoded DEFAULT_* constants below are FALLBACKS ONLY, used when:
 * - Bundle discovery fails
 * - Running in environments without filesystem access
 * - Testing scenarios that don't load full bundles
 *
 * To update team member info, edit the persona's manifest file at:
 *   src/personas/bundles/{persona-id}/persona.manifest.json
 *
 * Then run `npm run generate:personas` to update frontend config.
 */

import type { TeamConfig, TeamMember, HandoffTemplate, TeamCoordination } from './types.js';

/**
 * FALLBACK team members - used only when bundle loading fails.
 * PRIMARY SOURCE: persona.manifest.json files in each bundle.
 * @deprecated Prefer using getTeamConfig() which loads from bundles.
 */
export const DEFAULT_TEAM_MEMBERS: TeamMember[] = [
  {
    roleId: 'life-coach',
    characterId: 'ferni',
    displayName: 'Ferni',
    roleDescription:
      'Your main point of contact. Asks the questions that unlock insight, celebrates every win, and connects you to the right specialist when you need them.',
    active: true,
  },
  // NOTE: Jack Bogle (sage-mentor) moved to Agent Marketplace. Nayan Patel is now the lifetime-advisor.
  {
    roleId: 'researcher',
    characterId: 'peter-john',
    displayName: 'Peter',
    roleDescription:
      'The Quant. Spots patterns nobody else sees across your spending, habits, and calendar. Turns data into insights that actually change behavior.',
    active: true,
  },
  {
    roleId: 'communicator',
    characterId: 'alex-chen',
    displayName: 'Alex',
    roleDescription:
      'Your Chief of Staff and communication coach. Manages your calendar and email, and helps you navigate difficult conversations with confidence.',
    active: true,
  },
  {
    roleId: 'habits-coach',
    characterId: 'maya-santos',
    displayName: 'Maya',
    roleDescription:
      'Start embarrassingly small. Helps you build habits that stick through systems, not willpower. One habit at a time, one day at a time.',
    active: true,
  },
  {
    roleId: 'lifetime-planner',
    characterId: 'jordan-taylor',
    displayName: 'Jordan',
    roleDescription:
      'Your lifetime planner. Turns vague dreams into lived experiences. From vacations to life transitions, helps you design every chapter intentionally.',
    active: true,
  },
  {
    roleId: 'lifetime-advisor',
    characterId: 'nayan-patel',
    displayName: 'Nayan',
    roleDescription:
      'Your lifetime coach. Combines patience, simplicity, and wit to help you see that small, consistent actions over decades create extraordinary results.',
    active: true,
  },
];

/**
 * FALLBACK handoff templates - used only when bundle loading fails.
 * PRIMARY SOURCE: team.handoff_phrases in persona.manifest.json files.
 * @deprecated Prefer using getTeamConfig() which generates from bundles.
 */
export const DEFAULT_HANDOFF_TEMPLATES: HandoffTemplate[] = [
  // From Life Coach to others
  // NOTE: sage-mentor (Jack Bogle) moved to Agent Marketplace. Use lifetime-advisor (Nayan) instead.
  {
    fromRole: 'life-coach',
    toRole: 'researcher',
    phrases: [
      'Peter lives for this kind of research - let me bring him in.',
      "Connecting you with Peter - he'll dig into this with you.",
      "Peter's going to love researching this one.",
    ],
    triggers: ['stock research', 'company analysis', 'investment research'],
  },
  {
    fromRole: 'life-coach',
    toRole: 'communicator',
    phrases: [
      'Alex handles this stuff like a pro - let me connect you.',
      "I'll bring Alex in - communications are their superpower.",
      'Alex will get this sorted for you.',
    ],
    triggers: ['email', 'calendar', 'schedule', 'reminder', 'text', 'call'],
  },
  {
    fromRole: 'life-coach',
    toRole: 'habits-coach',
    phrases: [
      "Maya's amazing at this - let me bring her in.",
      "Connecting you with Maya - she'll help you build a system that works.",
      'Maya will help you figure this out without any judgment.',
    ],
    triggers: ['budget', 'spending', 'saving', 'habits', 'routines'],
  },
  {
    fromRole: 'life-coach',
    toRole: 'lifetime-planner',
    phrases: [
      'Jordan gets SO excited about this stuff - let me bring them in.',
      "Connecting you with Jordan - they'll help you see the bigger picture.",
      'Jordan will help you plan this out.',
      "This is Jordan's wheelhouse - lifetime planning is their thing.",
    ],
    triggers: [
      'vacation',
      'trip',
      'purchase',
      'car',
      'milestone',
      'celebration',
      'wedding',
      'baby',
      'retirement',
      'life plan',
      'bucket list',
      'goals',
      'transition',
      'next chapter',
      'future',
      'five year',
      'ten year',
      'empty nest',
      'career change',
    ],
  },

  // From Life Coach to Lifetime Advisor (Nayan)
  {
    fromRole: 'life-coach',
    toRole: 'lifetime-advisor',
    phrases: [
      'This one needs deep wisdom - let me bring in Nayan.',
      "Nayan's perfect for the big picture stuff. Hold on...",
      'You need the sage perspective. Let me get Nayan.',
      "Bogle, Gandhi, Buffett wisdom? That's Nayan's domain. One sec.",
    ],
    triggers: [
      'meaning of life',
      'deep wisdom',
      'long-term perspective',
      'patience',
      'compounding',
      'simple living',
      'what matters',
      'big picture',
      'spiritual',
      'meditation',
      'inner peace',
      'enlightenment',
      'sage advice',
      'bogle wisdom',
      'gandhi',
      'buffett',
      'lifetime advice',
    ],
  },

  // From specialists back to Life Coach
  {
    fromRole: 'researcher',
    toRole: 'life-coach',
    phrases: [
      'Let me pass you back to Ferni!',
      "I'll connect you back with Ferni for anything else.",
    ],
  },
  {
    fromRole: 'communicator',
    toRole: 'life-coach',
    phrases: [
      'All set! Let me hand you back to Ferni.',
      'Done and done - passing you back to Ferni.',
    ],
  },
  {
    fromRole: 'habits-coach',
    toRole: 'life-coach',
    phrases: [
      "You're all set! Let me pass you back to Ferni.",
      "I'll hand you back to Ferni for anything else.",
    ],
  },
  {
    fromRole: 'lifetime-planner',
    toRole: 'life-coach',
    phrases: [
      "Plan's looking amazing! Let me hand you back to Ferni.",
      "Passing you back to Ferni - we're making this happen!",
      'Your vision is coming together! Ferni will take it from here.',
    ],
  },
  {
    fromRole: 'lifetime-advisor',
    toRole: 'life-coach',
    phrases: [
      'Ferni will help with the practical next steps. Namaskaram.',
      "The wisdom lands when you're ready. Ferni will take it from here.",
      "Stay the course. Ferni's got the daily roadmap.",
    ],
  },
];

/**
 * FALLBACK team coordination rules - used only when bundle loading fails.
 * PRIMARY SOURCE: role.domains and team.handoff_triggers in persona.manifest.json files.
 * @deprecated Prefer using getTeamConfig() which generates from bundles.
 */
export const DEFAULT_TEAM_COORDINATION: TeamCoordination = {
  teammateReferences: [
    { roleId: 'life-coach', informalReference: 'Ferni', formalReference: 'your life coach' },
    // NOTE: sage-mentor (Jack Bogle) moved to Agent Marketplace
    { roleId: 'researcher', informalReference: 'Peter', formalReference: 'our research expert' },
    {
      roleId: 'communicator',
      informalReference: 'Alex',
      formalReference: 'our communications specialist',
    },
    { roleId: 'habits-coach', informalReference: 'Maya', formalReference: 'our habits coach' },
    {
      roleId: 'lifetime-planner',
      informalReference: 'Jordan',
      formalReference: 'our lifetime planner',
    },
    {
      roleId: 'lifetime-advisor',
      informalReference: 'Nayan',
      formalReference: 'our lifetime coach and sage',
    },
  ],
  taskRouting: [
    // NOTE: Jack Bogle (sage-mentor) moved to Agent Marketplace.
    // These tasks now route to Nayan (lifetime-advisor) for deep wisdom.
    { taskType: 'investing philosophy', targetRole: 'lifetime-advisor' },
    { taskType: 'life wisdom', targetRole: 'lifetime-advisor' },
    { taskType: 'life advice', targetRole: 'lifetime-advisor' },
    { taskType: 'hard decision', targetRole: 'lifetime-advisor' },
    { taskType: 'career guidance', targetRole: 'lifetime-advisor' },
    { taskType: 'relationship advice', targetRole: 'lifetime-advisor' },
    { taskType: 'ethics', targetRole: 'lifetime-advisor' },
    { taskType: 'moral dilemma', targetRole: 'lifetime-advisor' },
    { taskType: 'calm presence', targetRole: 'lifetime-advisor' },
    { taskType: 'perspective', targetRole: 'lifetime-advisor' },
    // Peter John - Research
    { taskType: 'stock research', targetRole: 'researcher' },
    // Alex - Communications
    { taskType: 'email', targetRole: 'communicator' },
    { taskType: 'calendar', targetRole: 'communicator' },
    // Maya - Habits
    { taskType: 'budget', targetRole: 'habits-coach' },
    { taskType: 'spending', targetRole: 'habits-coach' },
    // Jordan - Lifetime Planning
    { taskType: 'vacation', targetRole: 'lifetime-planner' },
    { taskType: 'milestone', targetRole: 'lifetime-planner' },
    { taskType: 'life planning', targetRole: 'lifetime-planner' },
    { taskType: 'retirement planning', targetRole: 'lifetime-planner' },
    { taskType: 'goals', targetRole: 'lifetime-planner' },
    { taskType: 'life transition', targetRole: 'lifetime-planner' },
    { taskType: 'celebration', targetRole: 'lifetime-planner' },
    // Nayan - Lifetime Advisor (deep wisdom)
    { taskType: 'meaning of life', targetRole: 'lifetime-advisor' },
    { taskType: 'deep wisdom', targetRole: 'lifetime-advisor' },
    { taskType: 'long-term perspective', targetRole: 'lifetime-advisor' },
    { taskType: 'patience', targetRole: 'lifetime-advisor' },
    { taskType: 'compounding wisdom', targetRole: 'lifetime-advisor' },
    { taskType: 'simple living', targetRole: 'lifetime-advisor' },
    { taskType: 'spiritual guidance', targetRole: 'lifetime-advisor' },
    { taskType: 'meditation help', targetRole: 'lifetime-advisor' },
    { taskType: 'inner peace', targetRole: 'lifetime-advisor' },
    { taskType: 'what matters', targetRole: 'lifetime-advisor' },
  ],
};

/**
 * FALLBACK team configuration - used only when bundle loading fails.
 * Use getTeamConfig() as the primary method to get team configuration.
 * @deprecated Prefer using getTeamConfig() which generates from bundles.
 */
export const DEFAULT_TEAM_CONFIG: TeamConfig = {
  id: 'ferni-team',
  name: "Ferni's Team",
  description: "A coordinated team of specialists helping you navigate life's big questions",
  members: DEFAULT_TEAM_MEMBERS,
  coordinatorId: 'ferni',
  handoffTemplates: DEFAULT_HANDOFF_TEMPLATES,
  coordination: DEFAULT_TEAM_COORDINATION,
  enabled: true,
};

/**
 * Get a team member by role ID
 */
export function getTeamMemberByRole(
  roleId: string,
  team: TeamConfig = DEFAULT_TEAM_CONFIG
): TeamMember | undefined {
  return team.members.find((m) => m.roleId === roleId);
}

/**
 * Get a team member by character ID
 */
export function getTeamMemberByCharacter(
  characterId: string,
  team: TeamConfig = DEFAULT_TEAM_CONFIG
): TeamMember | undefined {
  return team.members.find((m) => m.characterId === characterId);
}

/**
 * Get handoff templates from one role to another
 */
export function getHandoffTemplates(
  fromRole: string,
  toRole: string,
  team: TeamConfig = DEFAULT_TEAM_CONFIG
): string[] {
  const template = team.handoffTemplates?.find(
    (t) => t.fromRole === fromRole && t.toRole === toRole
  );
  return template?.phrases || [];
}

/**
 * Get a random handoff phrase
 */
export function getRandomHandoffPhrase(
  fromRole: string,
  toRole: string,
  team: TeamConfig = DEFAULT_TEAM_CONFIG
): string | undefined {
  const phrases = getHandoffTemplates(fromRole, toRole, team);
  if (phrases.length === 0) return undefined;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get the coordinator's character ID
 */
export function getCoordinatorId(team: TeamConfig = DEFAULT_TEAM_CONFIG): string {
  return team.coordinatorId;
}

/**
 * Check if team mode is enabled
 */
export function isTeamEnabled(team: TeamConfig = DEFAULT_TEAM_CONFIG): boolean {
  return team.enabled;
}

// ============================================================================
// DYNAMIC TEAM CONFIG FROM BUNDLES (PRIMARY METHOD)
// ============================================================================

import { discoverAndLoadBundles, type LoadedPersonaBundle } from '../bundles/index.js';
import { getLogger } from '../../utils/safe-logger.js';

/** Cached dynamic team config */
let cachedTeamConfig: TeamConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

/**
 * Generate team configuration from loaded bundles.
 * This is now the PRIMARY method for getting team config.
 * Creates team config dynamically based on bundle manifest data.
 *
 * @param forceRefresh - Force reload from bundles even if cached
 */
export async function generateTeamConfigFromBundles(forceRefresh = false): Promise<TeamConfig> {
  const now = Date.now();

  // Return cached if valid
  if (!forceRefresh && cachedTeamConfig && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedTeamConfig;
  }

  const result = await discoverAndLoadBundles();

  const members: TeamMember[] = [];
  let coordinatorId = 'ferni';

  for (const bundle of result.bundles) {
    const { manifest } = bundle;
    const { team } = manifest;

    if (!team) continue;

    const member: TeamMember = {
      roleId: team.role_id || manifest.role?.id || manifest.identity.id,
      characterId: manifest.identity.id,
      displayName: manifest.identity.display_name || manifest.identity.name,
      roleDescription: team.role_description || manifest.identity.description,
      active: true,
    };

    members.push(member);

    if (team.coordinator) {
      coordinatorId = manifest.identity.id;
    }
  }

  // Sort to put coordinator first
  members.sort((a, b) => {
    if (a.characterId === coordinatorId) return -1;
    if (b.characterId === coordinatorId) return 1;
    return 0;
  });

  // Generate handoff templates from bundles
  const handoffTemplates = await generateHandoffTemplatesFromBundles(result.bundles, coordinatorId);

  // Generate task routing from bundles
  const taskRouting = generateTaskRoutingFromBundles(result.bundles);

  const config: TeamConfig = {
    id: 'ferni-team',
    name: "Ferni's Team",
    description: "A coordinated team of specialists helping you navigate life's big questions",
    members,
    coordinatorId,
    handoffTemplates,
    coordination: {
      ...DEFAULT_TEAM_COORDINATION,
      taskRouting: [...(DEFAULT_TEAM_COORDINATION.taskRouting || []), ...(taskRouting || [])],
      teammateReferences: members.map((m) => ({
        roleId: m.roleId,
        informalReference: m.displayName,
        formalReference: `our ${m.roleDescription.toLowerCase().split(' - ')[0]}`,
      })),
    },
    enabled: true,
  };

  // Cache the result
  cachedTeamConfig = config;
  cacheTimestamp = now;

  return config;
}

/**
 * Generate handoff templates from bundle manifests
 */
async function generateHandoffTemplatesFromBundles(
  bundles: LoadedPersonaBundle[],
  coordinatorId: string
): Promise<HandoffTemplate[]> {
  const templates: HandoffTemplate[] = [];

  // Find coordinator bundle
  const coordinatorBundle = bundles.find((b) => b.manifest.identity.id === coordinatorId);
  const coordinatorRoleId = coordinatorBundle?.manifest.team?.role_id || 'life-coach';

  for (const bundle of bundles) {
    const { manifest } = bundle;
    const { team } = manifest;

    if (!team) continue;

    const roleId = team.role_id || manifest.role?.id || manifest.identity.id;
    const isCoordinator = manifest.identity.id === coordinatorId;

    // From coordinator TO this agent
    if (!isCoordinator && team.handoff_triggers?.length) {
      templates.push({
        fromRole: coordinatorRoleId,
        toRole: roleId,
        phrases: team.handoff_phrases?.receive || [
          `Let me bring in ${manifest.identity.name} for this.`,
          `${manifest.identity.name} can help with that. One sec.`,
        ],
        triggers: team.handoff_triggers,
      });
    }

    // From this agent back TO coordinator
    if (!isCoordinator) {
      templates.push({
        fromRole: roleId,
        toRole: coordinatorRoleId,
        phrases: team.handoff_phrases?.to_coordinator || [
          `Let me hand you back to ${coordinatorBundle?.manifest.identity.name || 'Ferni'}.`,
          `${coordinatorBundle?.manifest.identity.name || 'Ferni'} will take it from here.`,
        ],
      });
    }
  }

  // Merge with defaults (defaults take precedence for existing routes)
  const existingRoutes = new Set(templates.map((t) => `${t.fromRole}:${t.toRole}`));

  for (const defaultTemplate of DEFAULT_HANDOFF_TEMPLATES) {
    const route = `${defaultTemplate.fromRole}:${defaultTemplate.toRole}`;
    if (!existingRoutes.has(route)) {
      templates.push(defaultTemplate);
    }
  }

  return templates;
}

/**
 * Generate task routing from bundle domains
 */
function generateTaskRoutingFromBundles(
  bundles: LoadedPersonaBundle[]
): Array<{ taskType: string; targetRole: string }> {
  const routing: Array<{ taskType: string; targetRole: string }> = [];

  for (const bundle of bundles) {
    const { manifest } = bundle;
    const roleId = manifest.team?.role_id || manifest.role?.id || manifest.identity.id;
    const domains = manifest.role?.domains || [];

    for (const domain of domains) {
      routing.push({ taskType: domain, targetRole: roleId });
    }

    // Also add handoff triggers as task types
    const triggers = manifest.team?.handoff_triggers || [];
    for (const trigger of triggers) {
      routing.push({ taskType: trigger, targetRole: roleId });
    }
  }

  return routing;
}

/**
 * Clear the team config cache.
 * Call this when bundles are added/removed.
 */
export function clearTeamConfigCache(): void {
  cachedTeamConfig = null;
  cacheTimestamp = 0;
}

/**
 * Get the team config - uses bundle-based generation as primary.
 * Falls back to hardcoded DEFAULT_TEAM_CONFIG if bundles fail.
 */
export async function getTeamConfig(): Promise<TeamConfig> {
  try {
    return await generateTeamConfigFromBundles();
  } catch (err) {
    getLogger().warn({ error: err }, 'Failed to generate team config from bundles, using defaults');
    return DEFAULT_TEAM_CONFIG;
  }
}

/**
 * Get handoff triggers for a persona from their bundle.
 * Returns empty array if no triggers defined.
 */
export async function getHandoffTriggersForPersona(personaId: string): Promise<string[]> {
  const result = await discoverAndLoadBundles();

  for (const bundle of result.bundles) {
    const { manifest } = bundle;
    if (manifest.identity.id === personaId || manifest.identity.aliases?.includes(personaId)) {
      return manifest.team?.handoff_triggers || [];
    }
  }

  return [];
}

/**
 * Get all handoff triggers mapped to persona IDs.
 * Useful for the handoff detection system.
 */
export async function getAllHandoffTriggers(): Promise<Map<string, string[]>> {
  const result = await discoverAndLoadBundles();
  const triggerMap = new Map<string, string[]>();

  for (const bundle of result.bundles) {
    const { manifest } = bundle;
    const triggers = manifest.team?.handoff_triggers;

    if (triggers && triggers.length > 0) {
      triggerMap.set(manifest.identity.id, triggers);
    }
  }

  return triggerMap;
}
