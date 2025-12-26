/**
 * @deprecated MOVED TO: ./domains/memory/persona-tools.ts
 *
 * This file has been moved to the memory domain. Update your imports:
 * ```
 * // OLD (deprecated)
 * import { createFerniMemoryTools } from '../persona-memory-tools.js';
 *
 * // NEW
 * import { createFerniMemoryTools } from '../domains/memory/persona-tools.js';
 * ```
 *
 * This file re-exports from the new location for backward compatibility.
 */

// Re-export everything from the new location for backward compatibility
export * from './domains/memory/persona-tools.js';

// Re-export default for backward compatibility
import PersonaMemoryTools from './domains/memory/persona-tools.js';
export default PersonaMemoryTools;
