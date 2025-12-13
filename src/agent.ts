/**
 * Voice AI Agent Entry Point
 *
 * Multi-persona voice agent that loads personas dynamically.
 *
 * Usage:
 *   PERSONA_ID=ferni tsx src/agent.ts dev         # Ferni (life coach, default)
 *   PERSONA_ID=peter-john tsx src/agent.ts dev    # Peter John (research)
 *
 * Default: ferni
 *
 * See src/personas/ for available personas and how to add new ones.
 *
 * ARCHITECTURE:
 * - This file imports voice-worker.ts (lightweight main process bootstrap)
 * - voice-worker.ts handles CLI, IPC, health server, resource warmup
 * - voice-worker.ts spawns child processes that run voice-agent-child.ts
 * - voice-agent-child.ts loads the full agent logic
 *
 * SINGLE-PROCESS MODE (experimental):
 *   USE_SINGLE_PROCESS=true tsx src/agent.ts dev
 *
 * This separation ensures fast startup and clean architecture.
 * See src/agents/LOADING-ARCHITECTURE.md for details.
 */

// Make this file a module for top-level await
export {};

// Check for single-process mode (experimental, for Cloud Run optimization)
const useSingleProcess = process.env.USE_SINGLE_PROCESS === 'true';

if (useSingleProcess) {
  // Single-process worker: All jobs run in main process (faster cold starts)
  // eslint-disable-next-line no-console
  console.log('[agent] Using SINGLE-PROCESS mode (experimental)');
  await import('./agents/voice-worker-single-process.js');
} else {
  // Multi-process worker: Jobs run in child processes (default, proven stable)
  await import('./agents/voice-worker.js');
}
