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
export { default as toolHelpers } from './tool-helpers.js';
export { createEnhancedTool, enhanceDomainTools, failure, success, wrapToolDefinition, wrapToolDefinitions, wrapToolExecute, type EnhancedToolConfig, type ToolResult, type ToolResultMetadata, type WrapperOptions, } from './tool-wrapper.js';
export { buildToolConfig, CRITICAL_TOOLS, getFunctionCallingConfig, getThoughtSignatureProtocol, HIGH_STAKES_TOOLS, requiresConfirmation, requiresCriticalConfirmation, THOUGHT_SIGNATURE_PROTOCOL, type ConfigEnvironment, type FunctionCallingConfig, type FunctionCallingMode, type GeminiToolConfig, } from './function-calling-config.js';
export { failure as toolFailure, formatForLLM, fromLegacyResponse, isFailure, isSuccess, pending as toolPending, requiresConfirmation as responseRequiresConfirmation, success as toolSuccess, type ToolErrorCode, type ToolResponse, type ToolResponseBase, type ToolResponseFailure, type ToolResponsePending, type ToolResponseSuccess, } from './tool-response.js';
export { clearPendingConfirmation, detectConfirmationIntent, getPendingConfirmation, hasPendingConfirmation, processConfirmation, storePendingConfirmation, wrapToolDefinition as wrapToolWithConfirmation, wrapToolExecution, type ExecutionWrapperOptions, } from './tool-execution-wrapper.js';
export { getMigratedToolIds, getMigrationStats, isToolMigrated, markToolMigrated, migrateExecuteFunction, migrateToolDefinition, migrateToolDefinitions, migrateToolRecord, resetMigrationTracking, type MigrationOptions, } from './migrate-tool-responses.js';
//# sourceMappingURL=index.d.ts.map