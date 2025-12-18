/**
 * Tool Utilities Index
 *
 * Re-exports all shared utilities for tools.
 *
 * USAGE:
 *   import { getUserId, generateId, formatCurrency } from './utils/index.js';
 *   // or
 *   import { getUserId } from './utils/tool-helpers.js';
 */

export * from './tool-helpers.js';

// Re-export default as named for convenience
export { default as toolHelpers } from './tool-helpers.js';

// Tool Wrapper utilities (validation, analytics, error handling)
export {
  createEnhancedTool,
  enhanceDomainTools,
  failure,
  // Result type helpers
  success,
  wrapToolDefinition,
  wrapToolDefinitions,
  // Wrapper functions
  wrapToolExecute,
  type EnhancedToolConfig,
  type ToolResult,
  type ToolResultMetadata,
  // Types
  type WrapperOptions,
} from './tool-wrapper.js';

// Function Calling Configuration (Vertex AI best practices)
export {
  buildToolConfig,
  CRITICAL_TOOLS,
  getFunctionCallingConfig,
  getThoughtSignatureProtocol,
  HIGH_STAKES_TOOLS,
  requiresConfirmation,
  requiresCriticalConfirmation,
  THOUGHT_SIGNATURE_PROTOCOL,
  type ConfigEnvironment,
  type FunctionCallingConfig,
  type FunctionCallingMode,
  type GeminiToolConfig,
} from './function-calling-config.js';

// Standardized Tool Response Types
export {
  failure as toolFailure,
  formatForLLM,
  fromLegacyResponse,
  isFailure,
  isSuccess,
  pending as toolPending,
  requiresConfirmation as responseRequiresConfirmation,
  success as toolSuccess,
  type ToolErrorCode,
  type ToolResponse,
  type ToolResponseBase,
  type ToolResponseFailure,
  type ToolResponsePending,
  type ToolResponseSuccess,
} from './tool-response.js';

// Tool Execution Wrapper (validation, confirmation, standardization)
export {
  clearPendingConfirmation,
  detectConfirmationIntent,
  getPendingConfirmation,
  hasPendingConfirmation,
  processConfirmation,
  storePendingConfirmation,
  wrapToolDefinition as wrapToolWithConfirmation,
  wrapToolExecution,
  type ExecutionWrapperOptions,
} from './tool-execution-wrapper.js';

// Tool Response Migration Utilities
export {
  getMigratedToolIds,
  getMigrationStats,
  isToolMigrated,
  markToolMigrated,
  migrateExecuteFunction,
  migrateToolDefinition,
  migrateToolDefinitions,
  migrateToolRecord,
  resetMigrationTracking,
  type MigrationOptions,
} from './migrate-tool-responses.js';
