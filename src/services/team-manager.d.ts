/**
 * Team Manager Service
 *
 * Manages team packages, activation, and routing.
 * Enables purchasing and deploying persona teams together.
 */
import type { TeamPackageManifest, TeamInstance, TeamLicense, TeamInstanceConfig, TeamHandoffContext, TeamSharedContext } from '../personas/team/package-types.js';
export declare class TeamManager {
    /** Registered team packages */
    private packages;
    /** Active team instances by user */
    private instances;
    /**
     * Register a team package
     */
    registerPackage(pkg: TeamPackageManifest): void;
    /**
     * Get a registered package
     */
    getPackage(packageId: string): TeamPackageManifest | undefined;
    /**
     * List all available packages
     */
    listPackages(): TeamPackageManifest[];
    /**
     * Get packages by category
     */
    getPackagesByCategory(category: string): TeamPackageManifest[];
    /**
     * Activate a team for a user
     */
    activateTeam(packageId: string, userId: string, license: TeamLicense, configOverrides?: Partial<TeamInstanceConfig>): Promise<TeamInstance>;
    /**
     * Deactivate a team instance
     */
    deactivateTeam(instanceId: string): void;
    /**
     * Get active instance for a user
     */
    getUserInstance(userId: string): TeamInstance | undefined;
    /**
     * Get instance by ID
     */
    getInstance(instanceId: string): TeamInstance | undefined;
    /**
     * Route a user request to the appropriate team member
     */
    routeRequest(instanceId: string, userInput: string, context: {
        emotion?: string;
        emotionIntensity?: number;
        intent?: string;
        topics?: string[];
    }): {
        targetMember: string;
        confidence: number;
        reason: string;
    };
    private matchEmotionRoute;
    private matchIntentRoute;
    private matchTopicRoute;
    private resolveRoleToMember;
    /**
     * Handle a handoff between team members
     */
    handleHandoff(instanceId: string, context: TeamHandoffContext): Promise<{
        success: boolean;
        newMember: string;
    }>;
    /**
     * Update shared context for a team instance
     */
    updateSharedContext(instanceId: string, updates: Partial<TeamSharedContext>): void;
    /**
     * Add a key fact to shared context
     */
    addKeyFact(instanceId: string, fact: string, learnedBy: string): void;
    /**
     * Get team status for display
     */
    getTeamStatus(instanceId: string): {
        activeMember: string;
        recentHandoffs: number;
        topicsDiscussed: string[];
        memberActivity: Record<string, {
            interactions: number;
            lastActive?: Date;
        }>;
    } | null;
    /**
     * Get manager statistics
     */
    getStats(): {
        packagesRegistered: number;
        activeInstances: number;
        totalHandoffs: number;
    };
}
/**
 * Get singleton team manager
 */
export declare function getTeamManager(): TeamManager;
/**
 * Initialize team manager with default packages
 */
export declare function initializeTeamManager(): Promise<TeamManager>;
/**
 * Reset team manager (for testing)
 */
export declare function resetTeamManager(): void;
export default TeamManager;
//# sourceMappingURL=team-manager.d.ts.map