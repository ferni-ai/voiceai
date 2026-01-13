/**
 * Superhuman Signal Router
 *
 * Routes extracted signals from LLMSignalExtractor to Superhuman Services.
 * This is the critical bridge that enables "Better than Human" capabilities.
 *
 * Extracted signals → Superhuman services:
 * - Dreams → Dream Keeper
 * - Values → Values Alignment
 * - People → Relationship Network
 * - Commitments → Commitment Keeper (via content analysis)
 * - Fears/Challenges → Capacity Guardian (via stress triggers)
 *
 * @module memory/superhuman-signal-router
 */
import type { ExtractedSignals } from './interfaces/index.js';
interface RouterConfig {
    /** Whether to record dreams (default: true) */
    recordDreams: boolean;
    /** Whether to record values (default: true) */
    recordValues: boolean;
    /** Whether to record relationships (default: true) */
    recordRelationships: boolean;
    /** Whether to record stress triggers to capacity (default: true) */
    recordCapacity: boolean;
}
/**
 * Route extracted signals to superhuman services.
 *
 * This function is fire-and-forget - it runs in the background
 * and doesn't block the main conversation flow.
 */
export declare function routeSignalsToSuperhuman(userId: string, signals: ExtractedSignals, config?: Partial<RouterConfig>): Promise<void>;
export {};
//# sourceMappingURL=superhuman-signal-router.d.ts.map