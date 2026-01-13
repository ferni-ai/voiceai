/**
 * Persona Memory Context Builder
 *
 * THE MISSING LINK: Injects persona-specific memories into LLM prompts.
 *
 * Each persona remembers things their own way:
 * - Ferni: preferences, wins, topics, inside jokes
 * - Bogle: funds, investing philosophy, allocations
 * - Peter: watchlist, companies they know, ten-baggers
 * - Maya: merchants, bills, savings goals, spending triggers
 * - Jordan: important dates, venues, dream destinations
 * - Alex: communication preferences, contact notes
 *
 * This makes conversations feel like talking to a friend who ACTUALLY remembers you.
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
import { type FerniMemory, type BogleMemory, type PeterMemory, type MayaMemory, type JordanMemory, type Memory } from '../../../services/memory/persona-memories.js';
type NormalizedPersonaId = 'ferni' | 'bogle' | 'peter' | 'maya' | 'jordan' | 'alex';
declare function normalizePersonaId(id: string | undefined): NormalizedPersonaId | null;
declare function formatFerniMemories(memories: FerniMemory[], userName?: string): string;
declare function formatBogleMemories(memories: BogleMemory[], userName?: string): string;
declare function formatPeterMemories(memories: PeterMemory[], userName?: string): string;
declare function formatMayaMemories(memories: MayaMemory[], userName?: string): string;
declare function formatJordanMemories(memories: JordanMemory[], userName?: string): string;
interface PersonaMemoryResult {
    personaId: NormalizedPersonaId;
    memories: Memory[];
    formatted: string;
    count: number;
}
/**
 * Filter memories based on relationship stage
 * Deeper stages get access to more intimate/detailed memories
 */
declare function filterMemoriesByRelationshipStage(memories: Memory[], relationshipStage?: string): Memory[];
declare function getPersonaMemories(userId: string, personaId: NormalizedPersonaId, userName?: string, relationshipStage?: string): Promise<PersonaMemoryResult | null>;
/**
 * Get proactive memory callback with persona-specific logic
 * This creates the "pixel-level character devotion" - each persona remembers differently
 */
declare function getProactiveMemoryCallback(result: PersonaMemoryResult, turnCount: number, userName?: string): string | null;
/**
 * Get a random acknowledgment phrase for when referencing a memory
 */
export declare function getRandomAcknowledgmentPhrase(personaId: NormalizedPersonaId): string;
declare function buildPersonaMemoryContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildPersonaMemoryContext, getPersonaMemories, normalizePersonaId, formatFerniMemories, formatBogleMemories, formatPeterMemories, formatMayaMemories, formatJordanMemories, filterMemoriesByRelationshipStage, getProactiveMemoryCallback, type PersonaMemoryResult, type NormalizedPersonaId, };
//# sourceMappingURL=persona-memory.d.ts.map