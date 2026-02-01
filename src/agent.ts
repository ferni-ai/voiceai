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
 * ARCHITECTURE (GCE Optimized):
 * - Uses gce-voice-worker.ts with clean orchestrator pattern
 * - Single-process mode optimized for GCE (pre-warmed resources)
 * - SessionOrchestrator coordinates session lifecycle
 * - Pipeline pattern for modular, testable setup steps
 *
 * See docs/architecture/GCE-CLEAN-ARCHITECTURE.md for details.
 */

// Make this file a module for top-level await
export {};

// GCE-optimized worker with clean architecture
await import('./agents/gce-voice-worker.js');
