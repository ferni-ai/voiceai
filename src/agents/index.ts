/**
 * Voice AI Agents
 *
 * Multi-persona voice agent system with modular intelligence.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ src/agents/                                                     │
 * │   ├── shared/             - Utilities for ANY agent            │
 * │   │   ├── types.ts        - Session types (UserData)           │
 * │   │   ├── health-server.ts - HTTP health check                 │
 * │   │   └── external-apis.ts - Stock quotes, weather             │
 * │   │                                                             │
 * │   ├── handlers/           - Event and lifecycle handlers       │
 * │   │   ├── handoff-handler.ts - Persona handoff                 │
 * │   │   ├── silence-handler.ts - Silence detection               │
 * │   │   └── user-identification.ts - User identification         │
 * │   │                                                             │
 * │   └── voice-agent.ts      - ⭐ PRIMARY: Generic agent          │
 * │                                                                 │
 * │ src/intelligence/context-builders/  - Modular context system   │
 * │   ├── emotional.ts        - Distress, validation, mirroring    │
 * │   ├── crisis.ts           - Market panic, grief, life events   │
 * │   ├── celebration.ts      - Milestones, good news              │
 * │   ├── memory.ts           - Cross-session, callbacks           │
 * │   ├── engagement.ts       - Curiosity, depth, follow-ups       │
 * │   ├── pacing.ts           - Response length, fatigue           │
 * │   ├── humanizing.ts       - Self-corrections, humor, wit       │
 * │   └── ...                 - And more!                          │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   PERSONA_ID=jack-bogle node dist/agents/voice-agent.js start
 *   PERSONA_ID=jack-b node dist/agents/voice-agent.js start
 *   PERSONA_ID=peter-john node dist/agents/voice-agent.js start
 *
 * Available personas:
 *   - jack-bogle: The legendary Jack Bogle
 *   - jack-b: Younger Bogle-inspired advisor
 *   - peter-john: The ten-bagger hunter
 */

// ============================================================================
// SHARED UTILITIES (for any agent)
// ============================================================================

export * from './shared/index.js';

// ============================================================================
// PRIMARY AGENT
// ============================================================================

// Generic voice agent (supports all personas via PERSONA_ID env var)
export * from './voice-agent.js';

// ============================================================================
// VOICE IDS (for handoff and voice switching)
// Use voice-registry.ts as the single source of truth
// ============================================================================

export {
  getVoiceId,
  getCanonicalPersonaId,
  getPersonaDisplayName,
} from '../personas/voice-registry.js';

// All personas use:
// - src/agents/voice-agent.ts with PERSONA_ID env var
// - src/personas/bundles/ for persona configuration
