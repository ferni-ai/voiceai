/**
 * Cross-Persona Banter
 *
 * Characters referencing each other and warm introductions
 * during persona transitions.
 *
 * @module team-engagement/banter
 */
export declare const CROSS_PERSONA_REFERENCES: Record<string, Record<string, string[]>>;
export declare const HANDOFF_BANTER: Record<string, Record<string, string[]>>;
/**
 * Get handoff banter when one persona introduces another (SOFT OPEN - spoken BEFORE voice switch)
 * This is the departing persona's warm sendoff
 */
export declare function getHandoffBanter(fromPersonaId: string, toPersonaId: string): string | null;
export declare const getSoftOpenBanter: typeof getHandoffBanter;
export declare const ARRIVING_BANTER: Record<string, Record<string, string[]>>;
/**
 * Get arriving banter when a persona takes over (WARM WELCOME - spoken AFTER voice switch)
 * This is the arriving persona's warm greeting acknowledging the handoff
 */
export declare function getArrivingBanter(toPersonaId: string, fromPersonaId: string): string | null;
//# sourceMappingURL=banter.d.ts.map