/**
 * Async Singleton Utility
 *
 * Creates thread-safe async singleton getters that prevent race conditions
 * when multiple callers request initialization concurrently.
 *
 * PROBLEM THIS SOLVES:
 * When you have code like:
 *   let client = null;
 *   async function getClient() {
 *     if (client) return client;
 *     client = await init();
 *     return client;
 *   }
 *
 * And multiple callers invoke getClient() at the same time, they ALL pass
 * the `if (client)` check before any initialization completes, causing
 * N parallel initializations instead of 1.
 *
 * SOLUTION:
 * Store the initialization promise so concurrent callers wait for the same result.
 *
 * @module utils/async-singleton
 */

import { createLogger } from './safe-logger.js';

const log = createLogger({ module: 'AsyncSingleton' });

/**
 * Options for async singleton creation
 */
export interface AsyncSingletonOptions<T> {
  /** Name for logging/debugging */
  name?: string;
  /** Called when initialization fails */
  onError?: (error: unknown) => void;
  /** If true, failed initializations can be retried */
  retryOnError?: boolean;
  /** Called when initialization succeeds */
  onSuccess?: (instance: T) => void;
}

/**
 * Creates a thread-safe async singleton getter
 *
 * @example
 * ```typescript
 * const getVertexClient = createAsyncSingleton(
 *   async () => {
 *     const { VertexAI } = await import('@google-cloud/vertexai');
 *     return new VertexAI({ project: 'my-project' });
 *   },
 *   { name: 'VertexAI' }
 * );
 *
 * // All these calls will share the same initialization:
 * const [client1, client2, client3] = await Promise.all([
 *   getVertexClient(),
 *   getVertexClient(),
 *   getVertexClient(),
 * ]);
 * // client1 === client2 === client3
 * ```
 */
export function createAsyncSingleton<T>(
  initializer: () => Promise<T>,
  options: AsyncSingletonOptions<T> = {}
): () => Promise<T> {
  const { name = 'unnamed', onError, onSuccess, retryOnError = true } = options;

  let instance: T | null = null;
  let initPromise: Promise<T> | null = null;

  return async (): Promise<T> => {
    // Fast path: already initialized
    if (instance !== null) {
      return instance;
    }

    // If initialization is in progress, wait for it
    if (initPromise !== null) {
      log.debug({ name }, 'Waiting for in-progress initialization');
      return initPromise;
    }

    // Start initialization
    log.debug({ name }, 'Starting initialization');

    initPromise = initializer()
      .then((result) => {
        instance = result;
        log.debug({ name }, 'Initialization complete');
        onSuccess?.(result);
        return result;
      })
      .catch((error) => {
        log.error({ name, error: String(error) }, 'Initialization failed');

        if (retryOnError) {
          // Clear promise so next call can retry
          initPromise = null;
        }

        onError?.(error);
        throw error;
      });

    return initPromise;
  };
}

/**
 * Creates a nullable async singleton (returns null on failure instead of throwing)
 *
 * @example
 * ```typescript
 * const getOptionalClient = createNullableAsyncSingleton(
 *   async () => {
 *     const apiKey = process.env.API_KEY;
 *     if (!apiKey) return null;
 *     return new Client({ apiKey });
 *   },
 *   { name: 'OptionalClient' }
 * );
 *
 * const client = await getOptionalClient(); // May be null
 * if (client) {
 *   // Use client
 * }
 * ```
 */
export function createNullableAsyncSingleton<T>(
  initializer: () => Promise<T | null>,
  options: Omit<AsyncSingletonOptions<T>, 'retryOnError'> = {}
): () => Promise<T | null> {
  const { name = 'unnamed', onError, onSuccess } = options;

  let instance: T | null = null;
  let initialized = false;
  let initPromise: Promise<T | null> | null = null;

  return async (): Promise<T | null> => {
    // Fast path: already initialized (even if null)
    if (initialized) {
      return instance;
    }

    // If initialization is in progress, wait for it
    if (initPromise !== null) {
      log.debug({ name }, 'Waiting for in-progress initialization');
      return initPromise;
    }

    // Start initialization
    log.debug({ name }, 'Starting initialization');

    initPromise = initializer()
      .then((result) => {
        instance = result;
        initialized = true;
        log.debug({ name, hasResult: result !== null }, 'Initialization complete');
        if (result !== null) {
          onSuccess?.(result);
        }
        return result;
      })
      .catch((error) => {
        log.error({ name, error: String(error) }, 'Initialization failed');
        initialized = true; // Mark as initialized (with null result)
        instance = null;
        onError?.(error);
        return null;
      });

    return initPromise;
  };
}

/**
 * Resets a singleton for testing purposes
 * NOT recommended for production use
 */
export function createResettableAsyncSingleton<T>(
  initializer: () => Promise<T>,
  options: AsyncSingletonOptions<T> = {}
): { get: () => Promise<T>; reset: () => void } {
  let getSingleton = createAsyncSingleton(initializer, options);

  return {
    get: async () => getSingleton(),
    reset: () => {
      getSingleton = createAsyncSingleton(initializer, options);
      log.debug({ name: options.name }, 'Singleton reset');
    },
  };
}
