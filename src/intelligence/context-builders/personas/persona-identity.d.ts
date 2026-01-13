/**
 * Persona Identity Reinforcement Context Builder
 *
 * CRITICAL FIX: Injects identity reminders EVERY TURN, not just on handoffs.
 *
 * Problem solved: Personas were "forgetting" who they are mid-conversation
 * because identity was only set during handoffs. After a few turns, the
 * generic base identity rules would dominate and personas would blend together.
 *
 * This builder ensures each turn includes:
 * 1. Who you are (name, role)
 * 2. What you do (domain, tools)
 * 3. What you DON'T do (boundaries, handoffs)
 * 4. How you speak (personality traits)
 */
import { type ContextBuilder } from '../index.js';
interface PersonaIdentity {
    name: string;
    role: string;
    domains: string[];
    notYourDomains: string[];
    handoffTriggers: Record<string, string>;
    speakingStyle: string[];
    distinctiveTraits: string[];
    neverSay: string[];
}
/**
 * Persona identity definitions - what makes each persona DISTINCT
 */
declare const PERSONA_IDENTITIES: Record<string, PersonaIdentity>;
/**
 * Build persona identity reinforcement context
 */
declare const personaIdentityBuilder: ContextBuilder;
export { personaIdentityBuilder, PERSONA_IDENTITIES, type PersonaIdentity };
//# sourceMappingURL=persona-identity.d.ts.map