/**
 * Marketplace Executor
 *
 * Sandboxed execution for marketplace tools.
 *
 * Execution modes:
 * - HTTP: Tools with external endpoints (default)
 * - WASM: WebAssembly modules for in-process isolation
 * - Docker: Container-based isolation for maximum security
 */

// Main sandbox executor
export {
  executeMarketplaceTool,
  executeBatch,
  type ExecutionContext,
  type ExecutionOptions,
  type ExecutionResult,
} from './sandbox.js';

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
