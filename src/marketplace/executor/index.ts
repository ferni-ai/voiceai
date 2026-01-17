/**
 * Marketplace Executor
 *
 * Sandboxed execution for marketplace tools.
 *
 * Execution modes:
 * - HTTP: Tools with external endpoints (default)
 * - WASM: WebAssembly modules for in-process isolation
 * - Docker: Container-based isolation for maximum security
 *
 * Module Structure:
 * - sandbox.ts: Main executor with routing logic
 * - http-executor.ts: HTTP tool execution
 * - wasm-runtime.ts: WebAssembly isolation
 * - docker-runtime.ts: Container isolation
 */

// Main sandbox executor
export {
  executeBatch,
  executeMarketplaceTool,
  type ExecutionContext,
  type ExecutionOptions,
  type ExecutionResult,
} from './sandbox.js';

// HTTP executor (for direct use if needed)
export { executeHttpTool } from './http-executor.js';

// WASM runtime for in-process isolation
export {
  WasmRuntime,
  getWasmRuntime,
  resetWasmRuntime,
  type WasmExecutionOptions,
  type WasmExecutionResult,
  type WasmLimits,
  type WasmModule,
} from './wasm-runtime.js';

// Docker runtime for container isolation
export {
  DockerRuntime,
  getDockerRuntime,
  resetDockerRuntime,
  type DockerExecutionOptions,
  type DockerExecutionResult,
  type DockerLimits,
} from './docker-runtime.js';
