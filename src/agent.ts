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
 * Two modes available:
 *
 * 1. SINGLE-PROCESS MODE (production default):
 *    - All jobs run in main process
 *    - No child process forking
 *    - Instant job startup after initial load
 *    - Set USE_SINGLE_PROCESS=true or default in production
 *
 * 2. MULTI-PROCESS MODE (development):
 *    - Jobs run in forked child processes
 *    - Process isolation
 *    - Slower cold starts on Cloud Run
 *    - Set USE_SINGLE_PROCESS=false
 *
 * See src/agents/LOADING-ARCHITECTURE.md for details.
 */

// Make this file a module (required for top-level await)
export {};

// Choose worker mode based on environment
const useSingleProcess = process.env.USE_SINGLE_PROCESS !== 'false';

if (useSingleProcess) {
  // SINGLE-PROCESS MODE: All jobs run in main process
  // This eliminates child process overhead (30-120s → <100ms per job)
  await import('./agents/voice-worker-single-process.js');
} else {
  // MULTI-PROCESS MODE: Jobs run in forked child processes
  // Better isolation but slower cold starts
  await import('./agents/voice-worker.js');
}
