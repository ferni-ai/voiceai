/**
 * Team Coordination Core Functions
 *
 * Core operations for team coordination:
 * - Creating shared goals
 * - Creating team handoffs
 * - Linking milestones
 */
import { type SharedGoal, type SharedMilestone, type TeamHandoff, type TeamMember } from '../../../services/stores/life-data-store.js';
/**
 * Create a shared goal that can be tracked by multiple team members
 */
export declare function createSharedGoal(userId: string, title: string, category: string, financialTarget?: number, timeline?: string): Promise<SharedGoal>;
/**
 * Create a handoff from one team member to another
 */
export declare function createTeamHandoff(userId: string, fromMember: TeamMember, toMember: TeamMember, reason: string, handoffContext: Record<string, unknown>): Promise<TeamHandoff>;
/**
 * Link a milestone to team coordination
 */
export declare function linkMilestoneToTeam(userId: string, jordanMilestoneId: string, name: string, targetDate?: Date, mayaBudgetId?: string): Promise<SharedMilestone>;
//# sourceMappingURL=core.d.ts.map