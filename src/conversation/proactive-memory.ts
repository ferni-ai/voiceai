/**
 * Proactive Memory Surfacing
 *
 * @deprecated Import from './proactive-memory/index.js' directly
 *
 * This file re-exports the proactive memory module for backward compatibility.
 * The implementation has been split into focused submodules:
 *
 * - types.ts - Type definitions
 * - extractors.ts - Time and content extraction
 * - pattern-detection.ts - Pattern detection logic
 * - surfacing.ts - Proactive surfacing suggestions
 * - index.ts - Main engine and exports
 *
 * @module conversation/proactive-memory
 */

export {
  ProactiveMemoryEngine,
  getProactiveMemoryEngine,
  resetProactiveMemoryEngine,
  clearProactiveMemoryEngine,
  hasProactiveMemoryEngine,
  getActiveProactiveMemoryCount,
  default,
} from './proactive-memory/index.js';

export type {
  CaptureContext,
  MemoryType,
  PatternDetection,
  ProactiveMemorySuggestion,
  StoredMemory,
  SuggestionContext,
} from './proactive-memory/index.js';
