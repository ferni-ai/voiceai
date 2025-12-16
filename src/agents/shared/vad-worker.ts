/**
 * VAD Model Worker Thread
 *
 * Loads the Silero VAD model in a worker thread to avoid blocking the main thread.
 * This allows the main thread to continue processing while the heavy VAD model loads.
 *
 * Usage from main thread:
 *   const worker = new Worker('./vad-worker.js');
 *   worker.on('message', (msg) => {
 *     if (msg.type === 'ready') {
 *       // VAD is ready, but model itself stays in worker
 *     }
 *   });
 *
 * Note: The actual VAD model cannot be transferred between threads (it contains
 * native handles). This worker is mainly useful for pre-loading the ONNX runtime
 * and model weights into memory, which speeds up subsequent loads in the main thread.
 *
 * @module vad-worker
 */

import { parentPort, workerData } from 'worker_threads';

// ============================================================================
// LOGGING
// ============================================================================

const _log = (level: string, msg: string, data?: Record<string, unknown>) => {
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  const timestamp = new Date().toISOString();
  process.stderr.write(`[${timestamp}] [vad-worker] [${level}] ${msg}${dataStr}\n`);
};

// ============================================================================
// WORKER LOGIC
// ============================================================================

async function loadVADModel(): Promise<void> {
  const startTime = Date.now();
  _log('info', 'Starting VAD model load in worker thread...');

  try {
    // Import silero plugin
    const silero = await import('@livekit/agents-plugin-silero');
    _log('info', 'Silero plugin imported', { elapsed: Date.now() - startTime });

    // Load the VAD model
    // This downloads/loads the ONNX model and initializes the runtime
    const vad = await silero.VAD.load();
    const loadTime = Date.now() - startTime;

    _log('info', 'VAD model loaded successfully', { loadTimeMs: loadTime });

    // Notify parent that VAD is ready
    // Note: We can't transfer the VAD instance itself (contains native handles)
    // But pre-loading warms up the ONNX runtime and caches the model file
    parentPort?.postMessage({
      type: 'ready',
      loadTimeMs: loadTime,
      message: 'VAD model loaded and cached',
    });

    // Keep worker alive briefly to ensure caching completes
    // The OS will cache the model files in memory
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Signal completion
    parentPort?.postMessage({ type: 'complete' });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    _log('error', `VAD model load failed: ${errorMsg}`);

    parentPort?.postMessage({
      type: 'error',
      error: errorMsg,
    });
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

// Start loading immediately when worker is spawned
loadVADModel().catch((error) => {
  _log('error', `Worker crashed: ${error}`);
  parentPort?.postMessage({
    type: 'error',
    error: String(error),
  });
  process.exit(1);
});

// Handle messages from parent
parentPort?.on('message', (msg) => {
  if (msg.type === 'ping') {
    parentPort?.postMessage({ type: 'pong' });
  }
});
