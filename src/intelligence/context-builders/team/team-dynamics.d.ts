/**
 * Team Dynamics Context Builder
 *
 * Injects awareness of how the current persona relates to other team members.
 * This creates natural, organic references to teammates in conversations.
 *
 * When to inject:
 * - User mentions another team member by name
 * - Conversation topic is relevant to another team member's expertise
 * - Natural opportunity to suggest a handoff
 * - Celebrating what the team brings together
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
interface TeamMemberPattern {
    id: string;
    aliases: string[];
    expertiseKeywords: string[];
    description: string;
}
declare const TEAM_MEMBERS: TeamMemberPattern[];
/**
 * Detect if user mentions a team member
 */
declare function detectTeamMemberMention(text: string): TeamMemberPattern | null;
/**
 * Detect if topic relates to a team member's expertise
 */
declare function detectExpertiseMatch(text: string, topics: string[]): TeamMemberPattern | null;
declare function buildTeamDynamicsContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildTeamDynamicsContext, detectExpertiseMatch, detectTeamMemberMention, TEAM_MEMBERS };
//# sourceMappingURL=team-dynamics.d.ts.map