/**
 * Ferni Runtime
 *
 * Unified runtime for local development and cloud production.
 *
 * @example Local development (default)
 * ```typescript
 * import { getRuntime } from './runtime';
 *
 * const runtime = await getRuntime();
 * // All services run in-process, no network calls
 * const result = await runtime.tools.execute('habitCoaching.createHabit', params, ctx);
 * ```
 *
 * @example Production (auto-detected in Cloud Run)
 * ```typescript
 * import { getRuntime } from './runtime';
 *
 * const runtime = await getRuntime();
 * // Automatically uses remote gRPC services
 * const result = await runtime.tools.execute('habitCoaching.createHabit', params, ctx);
 * ```
 *
 * @example Hybrid mode (some local, some remote)
 * ```typescript
 * import { getRuntime } from './runtime';
 *
 * const runtime = await getRuntime({
 *   mode: 'hybrid',
 *   localOverrides: { tools: true },  // Tools run locally
 *   services: {
 *     memoryService: 'https://memory-service.run.app',  // Memory is remote
 *   },
 * });
 * ```
 *
 * @example Explicit configuration
 * ```typescript
 * import { createRuntime } from './runtime';
 *
 * const runtime = await createRuntime({
 *   mode: 'remote',
 *   services: {
 *     toolService: 'http://localhost:50051',
 *     personaService: 'http://localhost:50052',
 *     memoryService: 'http://localhost:50053',
 *   },
 * });
 * ```
 */

export {
  // Core factory functions
  createRuntime,
  getRuntime,
  resetRuntime,
  detectServiceMode,

  // Types
  type ServiceMode,
  type RuntimeConfig,
  type IRuntime,
  type IToolService,
  type IPersonaService,
  type IMemoryService,
  type ToolExecutionContext,
  type ToolExecutionResult,
} from './service-mode.js';

// Re-export for convenience
export { createRuntime as default } from './service-mode.js';

// Voice agent integration
export {
  createRuntimeToolProxy,
  createToolCallHandler,
  shouldUseRuntime,
  type RuntimeToolProxy,
  type LLMToolDefinition,
} from './voice-agent-integration.js';
