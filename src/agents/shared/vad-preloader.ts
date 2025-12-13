/**
 * VAD Model Preloader
 *
 * Utility to preload the VAD model using a worker thread.
 * This warms up the ONNX runtime and caches model files without blocking
 * the main thread.
 *
 * Usage:
 *   import { preloadVADInWorker, isVADPreloaded } from './vad-preloader.js';
 *
 *   // Start preloading (non-blocking)
 *   preloadVADInWorker();
 *
 *   // Later, check if ready
 *   if (isVADPreloaded()) {
 *     // VAD cache is warm, loading in main thread will be faster
 *   }
 *
 * @module vad-preloader
 */

import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ============================================================================
// STATE
// ============================================================================

let _worker: Worker | null = null;
let _isPreloaded = false;
let _loadTimeMs: number | null = null;
let _preloadPromise: Promise<void> | null = null;

// ============================================================================
// LOGGING
// ============================================================================

const _log = (level: string, msg: string, data?: Record<string, unknown>) => {
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  process.stderr.write(`[vad-preloader] [${level}] ${msg}${dataStr}\n`);
};

// ============================================================================
// PRELOADER
// ============================================================================

/**
 * Start preloading VAD model in a worker thread.
 * Returns immediately - use isVADPreloaded() or waitForVADPreload() to check status.
 */
export function preloadVADInWorker(): void {
  if (_worker || _isPreloaded) {
    _log('debug', 'VAD preload already started or complete');
    return;
  }

  _log('info', 'Starting VAD preload in worker thread...');

  try {
    // Get path to worker script
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const workerPath = join(__dirname, 'vad-worker.js');

    _worker = new Worker(workerPath);

    _preloadPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        _log('warn', 'VAD preload timed out after 30s');
        _worker?.terminate();
        _worker = null;
        resolve(); // Don't fail, just continue without preload
      }, 30000);

      _worker!.on('message', (msg) => {
        if (msg.type === 'ready') {
          _isPreloaded = true;
          _loadTimeMs = msg.loadTimeMs;
          _log('info', 'VAD preload complete', { loadTimeMs: msg.loadTimeMs });
        } else if (msg.type === 'complete') {
          clearTimeout(timeout);
          _worker?.terminate();
          _worker = null;
          resolve();
        } else if (msg.type === 'error') {
          _log('warn', `VAD preload failed: ${msg.error}`);
          clearTimeout(timeout);
          _worker?.terminate();
          _worker = null;
          resolve(); // Don't fail, just continue without preload
        }
      });

      _worker!.on('error', (error) => {
        _log('warn', `VAD worker error: ${error.message}`);
        clearTimeout(timeout);
        _worker = null;
        resolve(); // Don't fail
      });

      _worker!.on('exit', (code) => {
        if (code !== 0) {
          _log('warn', `VAD worker exited with code ${code}`);
        }
        clearTimeout(timeout);
        _worker = null;
        resolve();
      });
    });
  } catch (error) {
    _log('warn', `Failed to start VAD worker: ${error}`);
    // Non-fatal - VAD will load in main thread instead
  }
}

/**
 * Check if VAD model has been preloaded.
 */
export function isVADPreloaded(): boolean {
  return _isPreloaded;
}

/**
 * Get the preload time in milliseconds (null if not preloaded).
 */
export function getVADPreloadTime(): number | null {
  return _loadTimeMs;
}

/**
 * Wait for VAD preload to complete.
 * Returns immediately if not started or already complete.
 */
export async function waitForVADPreload(): Promise<void> {
  if (_preloadPromise) {
    await _preloadPromise;
  }
}

/**
 * Terminate the worker if still running.
 */
export function terminateVADWorker(): void {
  if (_worker) {
    _worker.terminate();
    _worker = null;
  }
}

