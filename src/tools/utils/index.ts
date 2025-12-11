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
