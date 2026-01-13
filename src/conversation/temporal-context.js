/**
 * Temporal Context Engine
 *
 * ⚠️ This file has been refactored for clean architecture.
 * The implementation is now in the temporal-context/ directory.
 *
 * This file re-exports everything for backward compatibility.
 *
 * @see temporal-context/index.ts for the new module structure
 * @module @ferni/temporal-context
 */
// Re-export everything from the new module
export { 
// Content
CLOSINGS, DAY_CONTEXT_PHRASES, EVENT_FOLLOW_UPS, GREETINGS, TEMPORAL_MOODS, 
// Engine and registry
TemporalContextEngine, clearTemporalContextEngine, getActiveTemporalContextCount, getTemporalContextEngine, resetTemporalContextEngine, default, } from './temporal-context/index.js';
//# sourceMappingURL=temporal-context.js.map