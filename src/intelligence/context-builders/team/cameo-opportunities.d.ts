/**
 * Cameo Opportunities Context Builder
 *
 * Suggests natural opportunities for Ferni to use the inviteCameo tool - having a
 * teammate pop in briefly with a quick insight before handing back to Ferni.
 *
 * This is useful when:
 * - The user is asking for guidance in a specialist area
 * - A quick perspective from a teammate would add value
 * - A full handoff isn't needed, but their voice would help
 *
 * IMPORTANT:
 * - This builder suggests the inviteCameo tool, not just verbal references
 * - The cameo tool handles voice switching and LLM instruction updates
 * - This is a hint, not a command - Ferni chooses whether to use it
 */
import { type TeamMemberId } from '../../../services/team-unlocks.js';
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
interface CameoCandidate {
    memberId: TeamMemberId;
    reason: string;
}
declare function getCameoCandidate(input: ContextBuilderInput): CameoCandidate | null;
declare function buildCameoOpportunitiesContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildCameoOpportunitiesContext, getCameoCandidate };
//# sourceMappingURL=cameo-opportunities.d.ts.map