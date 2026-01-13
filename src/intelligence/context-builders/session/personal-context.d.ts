import { type ContextBuilderInput, type ContextInjection } from '../index.js';
import type { UserProfile } from '../../../types/user-profile.js';
/**
 * Get personal detail callback based on user profile
 */
declare function getPersonalDetailCallback(profile: UserProfile): string | null;
/**
 * Build personal connection context injections
 */
declare function buildPersonalContext(input: ContextBuilderInput): ContextInjection[];
export { buildPersonalContext, getPersonalDetailCallback };
//# sourceMappingURL=personal-context.d.ts.map