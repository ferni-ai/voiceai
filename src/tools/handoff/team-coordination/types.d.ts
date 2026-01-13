/**
 * Team Coordination Types and Capabilities
 *
 * Defines team member capabilities and constants for
 * Jordan, Maya, and Alex partnership coordination.
 */
import type { TeamMember, TeamContext, SharedGoal, SharedMilestone, SharedBudget, TeamHandoff, TeamProject } from '../../../services/stores/life-data-store.js';
export type { TeamMember, TeamContext, TeamProject, SharedGoal, SharedMilestone, SharedBudget, TeamHandoff, };
export interface TeamMemberInfo {
    name: string;
    expertise: string[];
    canHelpWith: string[];
}
export declare const TEAM_CAPABILITIES: Record<TeamMember, TeamMemberInfo>;
export declare const MAX_NAME_LENGTH = 200;
export declare const MAX_NOTES_LENGTH = 5000;
export declare const MAX_AMOUNT = 10000000;
//# sourceMappingURL=types.d.ts.map