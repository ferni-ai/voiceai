/**
 * Team Coordination Helpers
 *
 * Validation and utility functions for team coordination.
 */
import { type TeamContext } from '../../../services/stores/life-data-store.js';
import { type TeamMember } from './types.js';
export declare function validateProjectName(name: unknown): {
    valid: boolean;
    sanitized?: string;
    error?: string;
};
export declare function validateAmountField(amount: unknown, fieldName?: string): {
    valid: boolean;
    sanitized?: number;
    error?: string;
};
export declare function validateNotes(notes: unknown): {
    valid: boolean;
    sanitized?: string;
    error?: string;
};
/**
 * Get or create team context for a user
 */
export declare function getOrCreateTeamContext(userId: string): Promise<TeamContext>;
/**
 * Find the best team member based on the user's need
 */
export declare function findBestTeamMember(need: string): TeamMember;
/**
 * Get team member info
 */
export declare function getTeamMemberInfo(member: TeamMember): import("./types.js").TeamMemberInfo;
//# sourceMappingURL=helpers.d.ts.map