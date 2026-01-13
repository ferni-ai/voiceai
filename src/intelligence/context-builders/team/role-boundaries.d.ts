/**
 * Role Boundary Enforcement Context Builder
 *
 * CRITICAL FIX: Actively detects when user asks about another persona's domain
 * and STRONGLY suggests handoff instead of answering.
 *
 * Problem solved: Ferni would answer finance questions, Maya would give life
 * advice, etc. because there was no enforcement of "stay in your lane."
 *
 * This builder:
 * 1. Detects domain violations in user's message
 * 2. Identifies the correct persona for the topic
 * 3. Injects STRONG guidance to hand off, not answer
 */
import { type ContextBuilder } from '../index.js';
interface DomainMatch {
    domain: string;
    owner: string;
    confidence: number;
    handoffTool: string;
    patterns: RegExp[];
}
/**
 * Domain ownership map - WHO owns WHAT
 */
declare const DOMAIN_OWNERSHIP: DomainMatch[];
interface BoundaryViolation {
    domain: string;
    correctOwner: string;
    currentPersona: string;
    handoffTool: string;
    confidence: number;
}
/**
 * Detect if user message is asking about another persona's domain
 */
declare function detectBoundaryViolation(userText: string, currentPersonaId: string): BoundaryViolation | null;
/**
 * Role Boundary Enforcement Context Builder
 */
declare const roleBoundaryBuilder: ContextBuilder;
export { detectBoundaryViolation, DOMAIN_OWNERSHIP, roleBoundaryBuilder, type BoundaryViolation };
//# sourceMappingURL=role-boundaries.d.ts.map