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
 * This separation ensures fast startup and clean architecture.
 * See src/agents/LOADING-ARCHITECTURE.md for details.
 */

// Import to trigger side effects (CLI startup)
// Using voice-worker.ts for lightweight main process bootstrap
import './agents/voice-worker.js';
