/**
 * Persona Physical State Module
 *
 * Tracks and surfaces persona physical state based on time and
 * conversation context. Makes personas feel more human.
 *
 * @module conversation-quality/physical-state
 */
import type { PersonaPhysicalState } from './types.js';
/**
 * Get persona's physical state based on time and conversation length
 */
export declare function getPersonaPhysicalState(hour: number, conversationMinutes: number, turnCount: number, personaId?: string): PersonaPhysicalState;
/**
 * Get a physical state interjection for any persona
 */
export declare function getPhysicalStateInterjection(state: PersonaPhysicalState): string | null;
//# sourceMappingURL=physical-state.d.ts.map