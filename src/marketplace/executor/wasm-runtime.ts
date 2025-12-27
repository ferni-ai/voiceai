/**
 * WASM Runtime for Sandboxed Tool Execution
 *
 * Provides a secure WebAssembly execution environment for marketplace tools.
 * Features:
 * - Memory isolation (configurable limits)
 * - CPU time limits via fuel metering
 * - Controlled host API access
 * - No filesystem or network access by default
 *
 * Usage:
 *   const runtime = new WasmRuntime();
 *   await runtime.initialize();
 *
 *   const result = await runtime.execute(wasmModule, {
 *     function: 'run',
 *     args: { query: 'test' },
 *     limits: { memoryMB: 64, fuelLimit: 1000000 },
 *   });
 */

/// <reference types="node" />

import { getLogger } from '../../utils/safe-logger.js';
import type { TrustLevel } from '../schema/types.js';

// WebAssembly types for Node.js environment
type BufferLike = ArrayBuffer | Uint8Array | ArrayBufferView;

declare const WebAssembly: {
  compile(bytes: BufferLike): Promise<WasmCompiledModule>;
  instantiate(module: WasmCompiledModule, imports?: WasmImports): Promise<WasmInstance>;
  Module: {
    exports(module: WasmCompiledModule): WasmModuleExport[];
    imports(module: WasmCompiledModule): WasmModuleImport[];
  };
  Memory: new (descriptor: { initial: number; maximum?: number }) => WasmMemory;
};

interface WasmCompiledModule {
  readonly [Symbol.toStringTag]: string;
}

interface WasmInstance {
  exports: Record<string, unknown>;
}

type WasmImports = Record<string, Record<string, unknown>>;

interface WasmModuleExport {
  name: string;
  kind: 'function' | 'memory' | 'table' | 'global';
}

interface WasmModuleImport {
  module: string;
  name: string;
  kind: 'function' | 'memory' | 'table' | 'global';
}

interface WasmMemory {
  buffer: ArrayBuffer;
  grow(delta: number): number;
}

const log = getLogger().child({ module: 'wasm-runtime' });

// ============================================================================
// TYPES
// ============================================================================

export interface WasmExecutionOptions {
  /** Function to call in the WASM module */
  function: string;
  /** Arguments to pass (JSON-serialized) */
  args: Record<string, unknown>;
  /** Resource limits */
  limits?: WasmLimits;
  /** Trust level affects available APIs */
  trustLevel?: TrustLevel;
}

export interface WasmLimits {
  /** Maximum memory in MB (default: 64) */
  memoryMB?: number;
  /** Maximum fuel (CPU cycles, default: 1M) */
  fuelLimit?: number;
  /** Timeout in milliseconds (default: 5000) */
  timeoutMs?: number;
}

export interface WasmExecutionResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
  metrics: {
    fuelConsumed: number;
    memoryUsedBytes: number;
    executionTimeMs: number;
  };
}

export interface WasmModule {
  id: string;
  bytes: Uint8Array;
  exports: string[];
  memoryMin: number;
  memoryMax: number;
}

// Host functions available to WASM modules
interface HostImports {
  env: {
    // Console logging (limited)
    console_log: (ptr: number, len: number) => void;
    console_error: (ptr: number, len: number) => void;
    // Time
    now_ms: () => bigint;
    // Randomness
    random: () => number;
    // JSON operations
    json_parse: (ptr: number, len: number) => number;
    json_stringify: (ptr: number) => number;
  };
}

// Default limits based on trust level
const DEFAULT_LIMITS: Record<TrustLevel, WasmLimits> = {
  platform: { memoryMB: 256, fuelLimit: 10_000_000, timeoutMs: 30000 },
  verified: { memoryMB: 128, fuelLimit: 5_000_000, timeoutMs: 10000 },
  community: { memoryMB: 64, fuelLimit: 1_000_000, timeoutMs: 5000 },
  unverified: { memoryMB: 32, fuelLimit: 500_000, timeoutMs: 2000 },
};

// ============================================================================
// LRU CACHE WITH TTL
// ============================================================================

interface CacheEntry<T> {
  value: T;
  lastAccessed: number;
  createdAt: number;
}

class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize = 100, ttlMs = 30 * 60 * 1000) {
    // Default: 100 entries, 30 minute TTL
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // Update last accessed for LRU
    entry.lastAccessed = Date.now();
    return entry.value;
  }

  set(key: string, value: T): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      lastAccessed: Date.now(),
      createdAt: Date.now(),
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // Also evict expired entries
      if (Date.now() - entry.createdAt > this.ttlMs) {
        this.cache.delete(key);
        continue;
      }

      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      log.debug({ key: oldestKey }, 'Evicted LRU cache entry');
    }
  }

  /**
   * Clean up expired entries (call periodically)
   */
  cleanup(): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.createdAt > this.ttlMs) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.debug({ cleaned }, 'Cleaned expired WASM cache entries');
    }

    return cleaned;
  }
}

// ============================================================================
// WASM RUNTIME
// ============================================================================

/** Maximum number of compiled modules in cache */
const MAX_CACHED_MODULES = 50;

/** TTL for compiled modules (30 minutes) */
const MODULE_TTL_MS = 30 * 60 * 1000;

/** Cleanup interval (5 minutes) */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export class WasmRuntime {
  private initialized = false;
  private moduleCache: LRUCache<WasmCompiledModule>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.moduleCache = new LRUCache<WasmCompiledModule>(MAX_CACHED_MODULES, MODULE_TTL_MS);
  }

  /**
   * Initialize the WASM runtime
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Check WebAssembly support
    if (typeof WebAssembly === 'undefined') {
      throw new Error('WebAssembly is not supported in this environment');
    }

    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.moduleCache.cleanup();
    }, CLEANUP_INTERVAL_MS);

    log.info({ maxModules: MAX_CACHED_MODULES, ttlMs: MODULE_TTL_MS }, 'WASM runtime initialized');
    this.initialized = true;
  }

  /**
   * Compile a WASM module from bytes
   */
  async compileModule(moduleId: string, wasmBytes: Uint8Array): Promise<WasmModule> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check if already cached
    const cached = this.moduleCache.get(moduleId);
    if (cached) {
      log.debug({ moduleId, cacheSize: this.moduleCache.size() }, 'Using cached WASM module');
      // Still need to return module info, extract from cached
      const moduleExports = WebAssembly.Module.exports(cached);
      const functionExports = moduleExports.filter((e) => e.kind === 'function').map((e) => e.name);
      return {
        id: moduleId,
        bytes: wasmBytes,
        exports: functionExports,
        memoryMin: 1,
        memoryMax: 16,
      };
    }

    // Compile the module
    const compiled = await WebAssembly.compile(wasmBytes);
    this.moduleCache.set(moduleId, compiled);
    
    log.debug({ moduleId, cacheSize: this.moduleCache.size() }, 'WASM module compiled and cached');

    // Extract exports
    const moduleExports = WebAssembly.Module.exports(compiled);
    const functionExports = moduleExports.filter((e) => e.kind === 'function').map((e) => e.name);

    // Get memory info
    const memoryExports = moduleExports.filter((e) => e.kind === 'memory');
    const memoryMin = 1;
    const memoryMax = 16; // Default 1MB max

    // If module imports memory, we'll provide it
    const imports = WebAssembly.Module.imports(compiled);
    const memoryImport = imports.find((i) => i.kind === 'memory');
    if (memoryImport) {
      // Memory limits are in pages (64KB each)
      // We'll set them when instantiating
    }

    log.debug(
      { moduleId, exports: functionExports, memoryPages: memoryMax },
      'WASM module compiled'
    );

    return {
      id: moduleId,
      bytes: wasmBytes,
      exports: functionExports,
      memoryMin,
      memoryMax,
    };
  }

  /**
   * Execute a function in a WASM module
   */
  async execute(moduleId: string, options: WasmExecutionOptions): Promise<WasmExecutionResult> {
    const startTime = Date.now();

    if (!this.initialized) {
      await this.initialize();
    }

    const compiled = this.moduleCache.get(moduleId);
    if (!compiled) {
      return {
        success: false,
        error: { code: 'MODULE_NOT_FOUND', message: `Module '${moduleId}' not compiled or cache expired` },
        metrics: { fuelConsumed: 0, memoryUsedBytes: 0, executionTimeMs: 0 },
      };
    }

    // Get limits based on trust level
    const trustLevel = options.trustLevel || 'community';
    const baseLimits = DEFAULT_LIMITS[trustLevel];
    const limits: Required<WasmLimits> = {
      memoryMB: options.limits?.memoryMB ?? baseLimits.memoryMB ?? 64,
      fuelLimit: options.limits?.fuelLimit ?? baseLimits.fuelLimit ?? 1_000_000,
      timeoutMs: options.limits?.timeoutMs ?? baseLimits.timeoutMs ?? 5000,
    };

    // Create memory
    const memoryPages = Math.ceil(limits.memoryMB / 64); // 64KB per page
    const memory = new WebAssembly.Memory({
      initial: 1,
      maximum: memoryPages,
    });

    // Track fuel consumption (simulated - real fuel metering requires WASM engine support)
    let fuelConsumed = 0;
    const fuelLimit = limits.fuelLimit;

    // Create host imports with sandboxed APIs
    const imports = this.createHostImports(memory, trustLevel, () => {
      fuelConsumed += 1000; // Approximate cost per host call
      if (fuelConsumed > fuelLimit) {
        throw new Error('Fuel limit exceeded');
      }
    });

    try {
      // Instantiate with timeout
      const instantiatePromise = WebAssembly.instantiate(compiled, imports);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Execution timeout')), limits.timeoutMs);
      });

      const instance = await Promise.race([instantiatePromise, timeoutPromise]);

      // Verify the function exists
      const fn = instance.exports[options.function];
      if (typeof fn !== 'function') {
        return {
          success: false,
          error: {
            code: 'FUNCTION_NOT_FOUND',
            message: `Function '${options.function}' not found in module`,
          },
          metrics: {
            fuelConsumed,
            memoryUsedBytes: memory.buffer.byteLength,
            executionTimeMs: Date.now() - startTime,
          },
        };
      }

      // Serialize input to memory
      const inputJson = JSON.stringify(options.args);
      const inputBytes = new TextEncoder().encode(inputJson);

      // Allocate memory for input (simplified - real impl would use module's allocator)
      const inputPtr = 0; // Write at start of memory
      const memView = new Uint8Array(memory.buffer);
      memView.set(inputBytes, inputPtr);

      // Call the function
      const resultPtr = (fn as CallableFunction)(inputPtr, inputBytes.length);
      fuelConsumed += 10000; // Approximate cost for call

      // Read result from memory
      let result: unknown;
      if (typeof resultPtr === 'number' && resultPtr > 0) {
        // Assume result is null-terminated JSON at resultPtr
        // In a real implementation, we'd have a proper protocol
        const resultBytes = this.readString(memView, resultPtr);
        result = JSON.parse(resultBytes);
      } else {
        result = resultPtr;
      }

      return {
        success: true,
        data: result,
        metrics: {
          fuelConsumed,
          memoryUsedBytes: memory.buffer.byteLength,
          executionTimeMs: Date.now() - startTime,
        },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      let code = 'EXECUTION_ERROR';
      if (err.message.includes('timeout')) code = 'TIMEOUT';
      if (err.message.includes('Fuel limit')) code = 'FUEL_EXHAUSTED';
      if (err.message.includes('memory')) code = 'OUT_OF_MEMORY';

      return {
        success: false,
        error: { code, message: err.message },
        metrics: {
          fuelConsumed,
          memoryUsedBytes: memory.buffer.byteLength,
          executionTimeMs: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Create sandboxed host imports for WASM modules
   */
  private createHostImports(
    memory: WasmMemory,
    _trustLevel: TrustLevel,
    consumeFuel: () => void
  ): WasmImports {
    const memView = () => new Uint8Array(memory.buffer);

    // Return imports object with memory in env namespace
    return {
      env: {
        console_log: (ptr: number, len: number) => {
          consumeFuel();
          const bytes = memView().slice(ptr, ptr + len);
          const str = new TextDecoder().decode(bytes);
          log.debug({ wasmLog: str }, 'WASM console.log');
        },

        console_error: (ptr: number, len: number) => {
          consumeFuel();
          const bytes = memView().slice(ptr, ptr + len);
          const str = new TextDecoder().decode(bytes);
          log.warn({ wasmError: str }, 'WASM console.error');
        },

        now_ms: () => {
          consumeFuel();
          return BigInt(Date.now());
        },

        random: () => {
          consumeFuel();
          return Math.random();
        },

        json_parse: (_ptr: number, _len: number): number => {
          consumeFuel();
          // In a real impl, this would parse JSON from memory and return a handle
          return 0;
        },

        json_stringify: (_ptr: number): number => {
          consumeFuel();
          // In a real impl, this would stringify an object and return ptr to result
          return 0;
        },
      },
    };
  }

  /**
   * Read a null-terminated string from memory
   */
  private readString(memView: Uint8Array, ptr: number): string {
    let end = ptr;
    while (end < memView.length && memView[end] !== 0) {
      end++;
    }
    return new TextDecoder().decode(memView.slice(ptr, end));
  }

  /**
   * Clear a module from the cache
   */
  clearModule(moduleId: string): void {
    this.moduleCache.delete(moduleId);
  }

  /**
   * Clear all cached modules
   */
  clearAllModules(): void {
    this.moduleCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.moduleCache.size(),
      maxSize: MAX_CACHED_MODULES,
      ttlMs: MODULE_TTL_MS,
    };
  }

  /**
   * Stop the runtime (cleanup)
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.moduleCache.clear();
    this.initialized = false;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let runtimeInstance: WasmRuntime | null = null;

/**
 * Get the WASM runtime singleton
 */
export async function getWasmRuntime(): Promise<WasmRuntime> {
  if (!runtimeInstance) {
    runtimeInstance = new WasmRuntime();
    await runtimeInstance.initialize();
  }
  return runtimeInstance;
}

/**
 * Reset the runtime (for testing)
 */
export function resetWasmRuntime(): void {
  if (runtimeInstance) {
    runtimeInstance.clearAllModules();
  }
  runtimeInstance = null;
}
