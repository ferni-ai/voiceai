/**
 * Team Manager Service
 *
 * Manages team packages, activation, and routing.
 * Enables purchasing and deploying persona teams together.
 */

import { getLogger } from '../utils/safe-logger.js';
import type {
  TeamPackageManifest,
  TeamInstance,
  TeamLicense,
  TeamInstanceConfig,
  TeamInstanceState,
  TeamHandoffContext,
  TeamSharedContext,
  TeamRouting,
  TeamRole,
} from '../personas/team/package-types.js';

// ============================================================================
// TEAM MANAGER
// ============================================================================

export class TeamManager {
  /** Registered team packages */
  private packages: Map<string, TeamPackageManifest> = new Map();

  /** Active team instances by user */
  private instances: Map<string, TeamInstance> = new Map();

  // ==========================================================================
  // PACKAGE MANAGEMENT
  // ==========================================================================

  /**
   * Register a team package
   */
  registerPackage(pkg: TeamPackageManifest): void {
    this.packages.set(pkg.id, pkg);
    getLogger().info({ packageId: pkg.id, name: pkg.name }, 'Team package registered');
  }

  /**
   * Get a registered package
   */
  getPackage(packageId: string): TeamPackageManifest | undefined {
    return this.packages.get(packageId);
  }

  /**
   * List all available packages
   */
  listPackages(): TeamPackageManifest[] {
    return Array.from(this.packages.values());
  }

  /**
   * Get packages by category
   */
  getPackagesByCategory(category: string): TeamPackageManifest[] {
    return this.listPackages().filter(pkg => pkg.metadata.category === category);
  }

  // ==========================================================================
  // TEAM ACTIVATION
  // ==========================================================================

  /**
   * Activate a team for a user
   */
  async activateTeam(
    packageId: string,
    userId: string,
    license: TeamLicense,
    configOverrides?: Partial<TeamInstanceConfig>
  ): Promise<TeamInstance> {
    const pkg = this.packages.get(packageId);
    if (!pkg) {
      throw new Error(`Package not found: ${packageId}`);
    }

    // Validate license
    if (!license.isActive) {
      throw new Error('License is not active');
    }
    if (license.validUntil && new Date() > license.validUntil) {
      throw new Error('License has expired');
    }

    // Check tier includes required members
    const tier = pkg.pricing.tiers.find(t => t.id === license.tierId);
    if (!tier) {
      throw new Error(`Invalid tier: ${license.tierId}`);
    }

    // Create instance
    const instanceId = `${userId}_${packageId}_${Date.now()}`;
    const instance: TeamInstance = {
      instanceId,
      packageId,
      userId,
      license,
      config: {
        ...configOverrides,
      },
      state: {
        activeMember: pkg.coordinator,
        sharedContext: {
          activeTopics: [],
          keyFacts: [],
          pendingFollowUps: [],
        },
        handoffHistory: [],
        memberActivity: {},
      },
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };

    this.instances.set(instanceId, instance);
    getLogger().info(
      { instanceId, packageId, userId, tier: license.tierId },
      'Team activated'
    );

    return instance;
  }

  /**
   * Deactivate a team instance
   */
  deactivateTeam(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      this.instances.delete(instanceId);
      getLogger().info({ instanceId }, 'Team deactivated');
    }
  }

  /**
   * Get active instance for a user
   */
  getUserInstance(userId: string): TeamInstance | undefined {
    for (const instance of this.instances.values()) {
      if (instance.userId === userId) {
        return instance;
      }
    }
    return undefined;
  }

  /**
   * Get instance by ID
   */
  getInstance(instanceId: string): TeamInstance | undefined {
    return this.instances.get(instanceId);
  }

  // ==========================================================================
  // REQUEST ROUTING
  // ==========================================================================

  /**
   * Route a user request to the appropriate team member
   */
  routeRequest(
    instanceId: string,
    userInput: string,
    context: {
      emotion?: string;
      emotionIntensity?: number;
      intent?: string;
      topics?: string[];
    }
  ): { targetMember: string; confidence: number; reason: string } {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { targetMember: 'default', confidence: 0, reason: 'No active instance' };
    }

    const pkg = this.packages.get(instance.packageId);
    if (!pkg) {
      return { targetMember: instance.state.activeMember, confidence: 0.5, reason: 'Package not found' };
    }

    // Merge routing overrides with package defaults
    // Use package routing as base, only override fields that are explicitly set
    const overrides = instance.config.routingOverrides || {};
    const routing: TeamRouting = {
      topicRouting: overrides.topicRouting ?? pkg.routing.topicRouting,
      intentRouting: overrides.intentRouting ?? pkg.routing.intentRouting,
      emotionRouting: overrides.emotionRouting ?? pkg.routing.emotionRouting,
      defaultMember: overrides.defaultMember ?? pkg.routing.defaultMember,
      autoHandoff: overrides.autoHandoff ?? pkg.routing.autoHandoff,
    };

    // Check emotion routing first (highest priority for distressed users)
    if (context.emotion && context.emotionIntensity) {
      const emotionRoute = this.matchEmotionRoute(
        routing,
        context.emotion,
        context.emotionIntensity
      );
      if (emotionRoute) {
        return {
          targetMember: this.resolveRoleToMember(pkg, emotionRoute),
          confidence: 0.9,
          reason: `Emotion-based: ${context.emotion} at ${(context.emotionIntensity * 100).toFixed(0)}%`,
        };
      }
    }

    // Check intent routing
    if (context.intent) {
      const intentRoute = this.matchIntentRoute(routing, context.intent);
      if (intentRoute) {
        return {
          targetMember: this.resolveRoleToMember(pkg, intentRoute),
          confidence: 0.85,
          reason: `Intent-based: ${context.intent}`,
        };
      }
    }

    // Check topic routing
    if (context.topics && context.topics.length > 0) {
      const topicRoute = this.matchTopicRoute(routing, context.topics);
      if (topicRoute) {
        return {
          targetMember: this.resolveRoleToMember(pkg, topicRoute.targetRole),
          confidence: 0.8,
          reason: `Topic-based: ${context.topics.join(', ')}`,
        };
      }
    }

    // Fall back to current active member
    return {
      targetMember: instance.state.activeMember,
      confidence: 0.5,
      reason: 'Default (no routing match)',
    };
  }

  private matchEmotionRoute(
    routing: TeamRouting,
    emotion: string,
    intensity: number
  ): TeamRole | string | null {
    for (const route of routing.emotionRouting) {
      if (route.emotions.includes(emotion) && intensity >= route.minIntensity) {
        return route.targetRole;
      }
    }
    return null;
  }

  private matchIntentRoute(routing: TeamRouting, intent: string): TeamRole | string | null {
    for (const route of routing.intentRouting.sort((a, b) => b.priority - a.priority)) {
      if (route.intents.includes(intent)) {
        return route.targetRole;
      }
    }
    return null;
  }

  private matchTopicRoute(
    routing: TeamRouting,
    topics: string[]
  ): { targetRole: TeamRole | string; priority: number } | null {
    let bestMatch: { targetRole: TeamRole | string; priority: number } | null = null;

    for (const route of routing.topicRouting) {
      for (const topic of topics) {
        if (route.topics.some(t => topic.toLowerCase().includes(t.toLowerCase()))) {
          if (!bestMatch || route.priority > bestMatch.priority) {
            bestMatch = { targetRole: route.targetRole, priority: route.priority };
          }
        }
      }
    }

    return bestMatch;
  }

  private resolveRoleToMember(pkg: TeamPackageManifest, role: TeamRole | string): string {
    // If it's already a member ID, return it
    const memberById = pkg.members.find(m => m.personaId === role);
    if (memberById) return role;

    // Find member by role
    const memberByRole = pkg.members.find(m => m.roleId === role);
    if (memberByRole) return memberByRole.personaId;

    // Fall back to coordinator
    return pkg.coordinator;
  }

  // ==========================================================================
  // HANDOFF MANAGEMENT
  // ==========================================================================

  /**
   * Handle a handoff between team members
   */
  async handleHandoff(
    instanceId: string,
    context: TeamHandoffContext
  ): Promise<{ success: boolean; newMember: string }> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { success: false, newMember: '' };
    }

    const pkg = this.packages.get(instance.packageId);
    if (!pkg) {
      return { success: false, newMember: '' };
    }

    // Route to find the best member
    const routing = this.routeRequest(instanceId, context.userMessage, {
      emotion: context.analysis.emotion,
      intent: context.analysis.intent,
      topics: context.analysis.topics,
    });

    const previousMember = instance.state.activeMember;

    // Only handoff if different member
    if (routing.targetMember !== previousMember && routing.confidence > 0.7) {
      // Record handoff
      instance.state.handoffHistory.push({
        timestamp: new Date(),
        from: previousMember,
        to: routing.targetMember,
        reason: routing.reason,
        context: { userMessage: context.userMessage },
      });

      // Update active member
      instance.state.activeMember = routing.targetMember;

      // Update shared context
      instance.state.sharedContext = {
        ...instance.state.sharedContext,
        ...context.sharedContext,
      };

      // Update activity
      instance.lastActivityAt = new Date();

      getLogger().info(
        {
          instanceId,
          from: previousMember,
          to: routing.targetMember,
          reason: routing.reason,
        },
        'Team handoff executed'
      );

      return { success: true, newMember: routing.targetMember };
    }

    return { success: false, newMember: previousMember };
  }

  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================

  /**
   * Update shared context for a team instance
   */
  updateSharedContext(
    instanceId: string,
    updates: Partial<TeamSharedContext>
  ): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    instance.state.sharedContext = {
      ...instance.state.sharedContext,
      ...updates,
    };
    instance.lastActivityAt = new Date();
  }

  /**
   * Add a key fact to shared context
   */
  addKeyFact(instanceId: string, fact: string, learnedBy: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    instance.state.sharedContext.keyFacts.push({
      fact,
      learnedBy,
      timestamp: new Date(),
    });
  }

  /**
   * Get team status for display
   */
  getTeamStatus(instanceId: string): {
    activeMember: string;
    recentHandoffs: number;
    topicsDiscussed: string[];
    memberActivity: Record<string, { interactions: number; lastActive?: Date }>;
  } | null {
    const instance = this.instances.get(instanceId);
    if (!instance) return null;

    return {
      activeMember: instance.state.activeMember,
      recentHandoffs: instance.state.handoffHistory.filter(
        h => Date.now() - h.timestamp.getTime() < 3600000 // Last hour
      ).length,
      topicsDiscussed: instance.state.sharedContext.activeTopics,
      memberActivity: Object.fromEntries(
        Object.entries(instance.state.memberActivity).map(([id, activity]) => [
          id,
          { interactions: activity.totalInteractions, lastActive: activity.lastActive },
        ])
      ),
    };
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get manager statistics
   */
  getStats(): {
    packagesRegistered: number;
    activeInstances: number;
    totalHandoffs: number;
  } {
    let totalHandoffs = 0;
    for (const instance of this.instances.values()) {
      totalHandoffs += instance.state.handoffHistory.length;
    }

    return {
      packagesRegistered: this.packages.size,
      activeInstances: this.instances.size,
      totalHandoffs,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let teamManager: TeamManager | null = null;

/**
 * Get singleton team manager
 */
export function getTeamManager(): TeamManager {
  if (!teamManager) {
    teamManager = new TeamManager();
  }
  return teamManager;
}

/**
 * Initialize team manager with default packages
 */
export async function initializeTeamManager(): Promise<TeamManager> {
  const manager = getTeamManager();

  // Register default packages
  try {
    const { FINANCIAL_WELLNESS_TEAM } = await import('../personas/team/package-types.js');
    manager.registerPackage(FINANCIAL_WELLNESS_TEAM);
  } catch (error) {
    getLogger().warn({ error }, 'Failed to load default team packages');
  }

  getLogger().info({ stats: manager.getStats() }, 'Team manager initialized');
  return manager;
}

/**
 * Reset team manager (for testing)
 */
export function resetTeamManager(): void {
  teamManager = null;
}

export default TeamManager;

