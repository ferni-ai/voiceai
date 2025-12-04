/**
 * Voice AI Agent Entry Point
 *
 * Multi-persona voice agent that loads personas dynamically.
 *
 * Usage:
 *   PERSONA_ID=jack-bogle tsx src/agent.ts dev    # Jack Bogle (original voice)
 *   PERSONA_ID=jack-b tsx src/agent.ts dev        # Jack B (younger voice)
 *
 * Default: jack-bogle
 *
 * See src/personas/ for available personas and how to add new ones.
 */

// Re-export everything from the voice agent
export * from './agents/voice-agent.js';

// Import to trigger side effects (CLI startup)
import './agents/voice-agent.js';
