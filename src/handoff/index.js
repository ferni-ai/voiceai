/**
 * Unified Handoff Module
 *
 * Single source of truth for all handoff-related state and operations.
 *
 * ## Architecture
 *
 * This module consolidates 4+ previously duplicate state systems:
 * - `agents/shared/handoff/session-state.ts` (queue, timeout, message seq)
 * - `tools/handoff/session-state.ts` (agent state, history, tool context)
 * - `tools/handoff/state.ts` (global state - deprecated)
 * - `tools/handoff/handoff-state-manager.ts` (event-driven manager)
 *
 * ## Migration Guide
 *
 * ```typescript
 * // Old imports (still work, re-exported for backward compatibility)
 * import { getHandoffSessionState } from '../agents/shared/handoff/session-state.js';
 * import { getCurrentAgent } from '../tools/handoff/state.js';
 *
 * // New imports (preferred)
 * import {
 *   getHandoffState,      // Unified state
 *   startHandoff,         // Action
 *   completeHandoff,      // Action
 *   getCurrentAgent,      // Query
 * } from '../handoff/index.js';
 * ```
 *
 * ## Key Principles
 *
 * 1. **Session-scoped** - No global state, each session isolated
 * 2. **Event-driven** - Observable state changes
 * 3. **Immutable snapshots** - Consistent reads
 * 4. **Auto-cleanup** - No memory leaks
 *
 * @module handoff
 */
export * from './unified-state.js';
export * from './constants.js';
export * from './actions.js';
export * from './voice-id.js';
// Re-export event bus from tools/handoff (not state, just event coordination)
export { handoffEvents, cameoUnlockEvents } from '../tools/handoff/state.js';
//# sourceMappingURL=index.js.map