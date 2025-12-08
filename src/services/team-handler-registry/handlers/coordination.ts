/**
 * Team Coordination Handlers (Ferni)
 *
 * Handlers for team status, context sharing, and escalation.
 * Ferni is the Life Coach and coordinates the entire team.
 *
 * USAGE:
 *   import { registerCoordinationHandlers } from './handlers/coordination.js';
 *   registerCoordinationHandlers('ferni');
 *
 * PERSISTENCE: Team status persists to Firestore for cross-session awareness.
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolExecutionRequest, ToolExecutionResult, AgentId } from '../../agent-bus.js';
import { getAgentBus } from '../../agent-bus.js';
import { registerTeamHandler, teamHandlerRegistry } from '../index.js';
import type { TeamHandlerDefinition } from '../types.js';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

let db: FirestoreType | null = null;
const TEAM_STATUS_COLLECTION = 'team_member_status';

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    getLogger().info('Team coordination Firestore initialized');
    return db;
  } catch (error) {
    getLogger().warn(
      { error },
      'Firestore not available for team coordination, using in-memory only'
    );
    return null;
  }
}

// ============================================================================
// TEAM STATUS TRACKING (In-memory cache with Firestore persistence)
// ============================================================================

interface TeamMemberStatus {
  lastActivity?: Date;
  currentTask?: string;
  pendingItems?: number;
  lastContext?: Record<string, unknown>;
}

const teamStatus = new Map<AgentId, TeamMemberStatus>();
let statusLoaded = false;

/**
 * Load team status from Firestore
 */
async function loadTeamStatus(): Promise<void> {
  if (statusLoaded) return;

  const firestore = await getFirestore();
  if (firestore) {
    try {
      const snapshot = await firestore.collection(TEAM_STATUS_COLLECTION).get();
      for (const doc of snapshot.docs) {
        const data = doc.data();
        teamStatus.set(
          doc.id as AgentId,
          {
            ...data,
            lastActivity:
              data.lastActivity?.toDate?.() ||
              (data.lastActivity ? new Date(data.lastActivity) : undefined),
          } as TeamMemberStatus
        );
      }
      getLogger().debug({ count: snapshot.size }, 'Loaded team status from Firestore');
    } catch (err) {
      getLogger().warn({ err }, 'Failed to load team status from Firestore');
    }
  }
  statusLoaded = true;
}

/**
 * Save team member status to Firestore
 */
async function saveTeamMemberStatus(agentId: AgentId, status: TeamMemberStatus): Promise<void> {
  const firestore = await getFirestore();
  if (firestore) {
    try {
      await firestore
        .collection(TEAM_STATUS_COLLECTION)
        .doc(agentId)
        .set(
          {
            ...status,
            updatedAt: new Date(),
          },
          { merge: true }
        );
    } catch (err) {
      getLogger().warn({ err, agentId }, 'Failed to save team member status');
    }
  }
}

// ============================================================================
// STATUS HANDLERS
// ============================================================================

/**
 * Handler: Get team status
 * Capability: team-status
 */
const getTeamStatusHandler: TeamHandlerDefinition = {
  id: 'getTeamStatus',
  name: 'Get Team Status',
  description: 'Get status overview of all team members',
  capability: 'team-status',
  tags: ['team', 'status', 'overview'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const userId = request.userId || 'default';

    // Ensure team status is loaded from Firestore
    await loadTeamStatus();

    const teamMembers: Array<{ id: AgentId; name: string; role: string }> = [
      { id: 'jordan', name: 'Jordan', role: 'Life Planning' },
      { id: 'maya', name: 'Maya', role: 'Financial Habits' },
      { id: 'alex', name: 'Alex', role: 'Communication' },
      { id: 'nayan-patel', name: 'Nayan', role: 'Lifetime Advisor & Wisdom' },
      { id: 'peter-john', name: 'Peter', role: 'Research & Insights' },
    ];

    let result = `👥 **Team Status Summary**\n\n`;

    for (const member of teamMembers) {
      const status = teamStatus.get(member.id);
      const config = teamHandlerRegistry.getAgentConfig(member.id);
      const isActive = config?.active !== false;

      result += `**${member.name}** (${member.role})\n`;
      result += `- Status: ${isActive ? '🟢 Active' : '🔴 Inactive'}\n`;

      if (status?.lastActivity) {
        const minutesAgo = Math.round((Date.now() - status.lastActivity.getTime()) / 60000);
        result += `- Last active: ${minutesAgo < 60 ? `${minutesAgo}m ago` : 'Idle'}\n`;
      }

      if (status?.currentTask) {
        result += `- Working on: ${status.currentTask}\n`;
      }

      if (status?.pendingItems) {
        result += `- Pending items: ${status.pendingItems}\n`;
      }

      result += '\n';
    }

    // Add handler stats
    const stats = teamHandlerRegistry.getStats();
    result += `---\n**Registry Stats:** ${stats.totalHandlers} handlers, ${stats.activeAgents} active agents`;

    return { success: true, result, executedBy: 'ferni' };
  },
};

/**
 * Handler: Get agent summary
 * Capability: team-status
 */
const getAgentSummaryHandler: TeamHandlerDefinition = {
  id: 'getAgentSummary',
  name: 'Get Agent Summary',
  description: 'Get detailed summary for a specific agent',
  capability: 'team-status',
  tags: ['agent', 'summary', 'details'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const { agentId } = request.params as { agentId: AgentId };

    if (!agentId) {
      return { success: false, error: 'Agent ID is required', executedBy: 'ferni' };
    }

    const config = teamHandlerRegistry.getAgentConfig(agentId);
    const handlers = teamHandlerRegistry.getAgentHandlers(agentId);
    const status = teamStatus.get(agentId);

    if (!config && handlers.length === 0) {
      return {
        success: false,
        error: `Agent "${agentId}" not found in registry`,
        executedBy: 'ferni',
      };
    }

    let result = `📋 **Agent Summary: ${config?.displayName || agentId}**\n\n`;

    if (config) {
      result += `**Configuration:**\n`;
      result += `- Active: ${config.active ? 'Yes' : 'No'}\n`;
      result += `- Capabilities: ${config.capabilities.join(', ') || 'None'}\n`;
    }

    if (handlers.length > 0) {
      result += `\n**Handlers (${handlers.length}):**\n`;
      for (const h of handlers.slice(0, 5)) {
        result += `- ${h.name}: ${h.description}\n`;
      }
      if (handlers.length > 5) {
        result += `- ... and ${handlers.length - 5} more\n`;
      }
    }

    if (status) {
      result += `\n**Status:**\n`;
      if (status.lastActivity) {
        result += `- Last activity: ${status.lastActivity.toLocaleString()}\n`;
      }
      if (status.currentTask) {
        result += `- Current task: ${status.currentTask}\n`;
      }
    }

    return { success: true, result, executedBy: 'ferni' };
  },
};

// ============================================================================
// CONTEXT SHARING HANDLERS
// ============================================================================

/**
 * Handler: Share context
 * Capability: context-sharing
 */
const shareContextHandler: TeamHandlerDefinition = {
  id: 'shareContext',
  name: 'Share Context',
  description: 'Share context from one agent to another',
  capability: 'context-sharing',
  tags: ['context', 'sharing', 'coordination'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const { toAgent, context, summary } = request.params as {
      toAgent: AgentId;
      context: Record<string, unknown>;
      summary?: string;
    };
    const fromAgent = (request.context?.fromAgent as AgentId) || 'ferni';
    const userId = request.userId || 'default';

    if (!toAgent) {
      return { success: false, error: 'Target agent is required', executedBy: 'ferni' };
    }

    if (!context || Object.keys(context).length === 0) {
      return { success: false, error: 'Context data is required', executedBy: 'ferni' };
    }

    try {
      // Share via Agent Bus
      const bus = getAgentBus();
      bus.shareContext(fromAgent, toAgent, context, userId);

      // Update local status and persist
      const newStatus = {
        ...teamStatus.get(toAgent),
        lastContext: context,
        lastActivity: new Date(),
      };
      teamStatus.set(toAgent, newStatus);
      void saveTeamMemberStatus(toAgent, newStatus);

      getLogger().info(
        { fromAgent, toAgent, contextKeys: Object.keys(context) },
        'Context shared between agents'
      );

      return {
        success: true,
        result: `📤 Context shared with ${toAgent}${summary ? `: ${summary}` : ''}`,
        executedBy: 'ferni',
      };
    } catch (error) {
      getLogger().error({ error }, 'Failed to share context');
      return { success: false, error: 'Failed to share context', executedBy: 'ferni' };
    }
  },
};

/**
 * Handler: Coordinate team
 * Capability: context-sharing
 */
const coordinateTeamHandler: TeamHandlerDefinition = {
  id: 'coordinateTeam',
  name: 'Coordinate Team',
  description: 'Coordinate a task across multiple team members',
  capability: 'context-sharing',
  additionalCapabilities: ['team-status'],
  tags: ['coordination', 'team', 'orchestration'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const {
      task,
      agents,
      priority = 'normal',
    } = request.params as {
      task: string;
      agents: AgentId[];
      priority?: 'low' | 'normal' | 'high';
    };
    const userId = request.userId || 'default';

    if (!task) {
      return { success: false, error: 'Task description is required', executedBy: 'ferni' };
    }

    if (!agents || agents.length === 0) {
      return { success: false, error: 'At least one agent must be specified', executedBy: 'ferni' };
    }

    try {
      const bus = getAgentBus();
      const coordinationId = `coord_${Date.now()}`;

      // Notify each agent
      for (const agentId of agents) {
        bus.shareContext(
          'ferni',
          agentId,
          {
            coordinationId,
            task,
            priority,
            participants: agents,
            initiatedBy: 'ferni',
            timestamp: new Date().toISOString(),
          },
          userId
        );

        // Update status and persist
        const newStatus = {
          ...teamStatus.get(agentId),
          currentTask: task,
          lastActivity: new Date(),
        };
        teamStatus.set(agentId, newStatus);
        void saveTeamMemberStatus(agentId, newStatus);
      }

      getLogger().info({ coordinationId, task, agents, priority }, 'Team coordination initiated');

      return {
        success: true,
        result: `🤝 Team coordination initiated for "${task}" with ${agents.join(', ')}. Coordination ID: ${coordinationId}`,
        executedBy: 'ferni',
      };
    } catch (error) {
      getLogger().error({ error }, 'Failed to coordinate team');
      return { success: false, error: 'Failed to coordinate team', executedBy: 'ferni' };
    }
  },
};

// ============================================================================
// ESCALATION HANDLERS
// ============================================================================

/**
 * Handler: Handle escalation
 * Capability: escalation
 */
const handleEscalationHandler: TeamHandlerDefinition = {
  id: 'handleEscalation',
  name: 'Handle Escalation',
  description: 'Handle an escalation from another agent',
  capability: 'escalation',
  tags: ['escalation', 'support', 'help'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const {
      fromAgent,
      issue,
      severity = 'medium',
      context,
    } = request.params as {
      fromAgent: AgentId;
      issue: string;
      severity?: 'low' | 'medium' | 'high' | 'critical';
      context?: Record<string, unknown>;
    };
    const userId = request.userId || 'default';

    if (!issue) {
      return { success: false, error: 'Issue description is required', executedBy: 'ferni' };
    }

    const escalationId = `esc_${Date.now()}`;

    getLogger().info({ escalationId, fromAgent, issue, severity }, 'Escalation received');

    // In a full implementation, this might:
    // - Store the escalation
    // - Notify the user
    // - Route to appropriate specialist
    // - Create a support ticket

    let response = `🚨 **Escalation Received**\n\n`;
    response += `- ID: ${escalationId}\n`;
    response += `- From: ${fromAgent || 'Unknown'}\n`;
    response += `- Severity: ${severity}\n`;
    response += `- Issue: ${issue}\n`;

    if (severity === 'critical' || severity === 'high') {
      response += `\n⚡ **Priority handling enabled** - This will be addressed immediately.`;
    }

    return { success: true, result: response, executedBy: 'ferni' };
  },
};

/**
 * Handler: Request specialist
 * Capability: escalation
 */
const requestSpecialistHandler: TeamHandlerDefinition = {
  id: 'requestSpecialist',
  name: 'Request Specialist',
  description: 'Request a specific specialist for a task',
  capability: 'escalation',
  additionalCapabilities: ['team-status'],
  tags: ['specialist', 'handoff', 'routing'],

  execute: async (request: ToolExecutionRequest): Promise<ToolExecutionResult> => {
    const { capability, reason, context } = request.params as {
      capability: string;
      reason: string;
      context?: Record<string, unknown>;
    };
    const userId = request.userId || 'default';

    if (!capability) {
      return { success: false, error: 'Required capability is required', executedBy: 'ferni' };
    }

    // Find agents with the requested capability
    const activeAgents = teamHandlerRegistry.getActiveAgents();
    const capableAgents: AgentId[] = [];

    for (const agentId of activeAgents) {
      const config = teamHandlerRegistry.getAgentConfig(agentId);
      if (config?.capabilities.includes(capability as any)) {
        capableAgents.push(agentId);
      }
    }

    if (capableAgents.length === 0) {
      // Check handlers by capability
      const handlers = teamHandlerRegistry.getByCapability(capability as any);
      if (handlers.length === 0) {
        return {
          success: false,
          error: `No specialist available for capability: ${capability}`,
          executedBy: 'ferni',
        };
      }
    }

    const selectedAgent = capableAgents[0] || 'ferni';

    getLogger().info({ capability, selectedAgent, reason }, 'Specialist requested');

    return {
      success: true,
      result: `🎯 Specialist identified: **${selectedAgent}** can handle "${capability}".\nReason: ${reason || 'Not specified'}`,
      executedBy: 'ferni',
    };
  },
};

// ============================================================================
// REGISTRATION
// ============================================================================

/**
 * All coordination handlers
 */
export const coordinationHandlers: TeamHandlerDefinition[] = [
  getTeamStatusHandler,
  getAgentSummaryHandler,
  shareContextHandler,
  coordinateTeamHandler,
  handleEscalationHandler,
  requestSpecialistHandler,
];

/**
 * Register all coordination handlers for an agent
 */
export function registerCoordinationHandlers(agentId: AgentId = 'ferni'): void {
  for (const handler of coordinationHandlers) {
    registerTeamHandler(handler, agentId);
  }

  getLogger().info(
    { agentId, handlerCount: coordinationHandlers.length },
    'Coordination handlers registered'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  getTeamStatusHandler,
  getAgentSummaryHandler,
  shareContextHandler,
  coordinateTeamHandler,
  handleEscalationHandler,
  requestSpecialistHandler,
  teamStatus,
};

export default registerCoordinationHandlers;
