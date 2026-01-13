/**
 * Data fetching functions for Alex's communication insights.
 *
 * @module intelligence/context-builders/personas/alex-communication-insights/data-fetchers
 */
import type { UserStateSnapshot, UpcomingPriority, MemoryContext } from './types.js';
export declare function getUserStateSnapshot(userId: string): Promise<UserStateSnapshot>;
export declare function getTimeOfDayContext(): string;
export declare function getUpcomingPriorities(userId: string): UpcomingPriority[];
export declare function getMemoryContext(userId: string): MemoryContext;
//# sourceMappingURL=data-fetchers.d.ts.map