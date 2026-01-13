/**
 * Memory Lane Context Builder
 *
 * Proactively surfaces relevant memories during conversation:
 *
 * 1. ON THIS DAY - Anniversary memories from the same date
 *    - "A year ago today, you shared something important..."
 *
 * 2. TOPIC MATCH - When user discusses a topic with stored memory
 *    - "That reminds me of when you..."
 *
 * 3. GROWTH CELEBRATION - Progress on commitments/dreams
 *    - "Remember when you said you'd never...? Look at you now!"
 *
 * 4. EMOTIONAL ECHO - Current emotion matches past breakthrough
 *    - "You've been here before, and you got through it..."
 *
 * @module intelligence/context-builders/superhuman/memory-lane-context
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
declare function clearMemoryLaneSessionInternal(sessionId: string): void;
declare function clearAllMemoryLaneSessionsInternal(): void;
declare function buildMemoryLaneContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildMemoryLaneContext, clearMemoryLaneSessionInternal as clearMemoryLaneSession, clearAllMemoryLaneSessionsInternal as clearAllMemoryLaneSessions, };
//# sourceMappingURL=memory-lane-context.d.ts.map