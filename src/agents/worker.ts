/**
 * Worker Entry Point - Backwards Compatibility Re-export
 *
 * @deprecated Import from './gce-voice-worker.js' instead.
 * This file exists for backwards compatibility with existing deployment scripts.
 *
 * The canonical file is now gce-voice-worker.ts which makes the deployment
 * target (GCE) explicit in the filename.
 */

// Re-export everything from the canonical file
export * from './gce-voice-worker.js';

// If this file is run directly, run the main worker
// This maintains backwards compatibility with `node dist/agents/worker.js start`
import './gce-voice-worker.js';
