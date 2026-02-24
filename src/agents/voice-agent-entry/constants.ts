/**
 * Feature flags and default configurations for voice agent entry.
 *
 * @module agents/voice-agent-entry/constants
 */

import type { StageType } from '../shared/dev-telemetry.js';

// ============================================================================
// FEATURE FLAGS
// ============================================================================

/**
 * Use the new Tool Gateway for tool loading (2026 architecture).
 * DEFAULT: true (Tool Gateway is now the standard approach)
 * Set USE_TOOL_GATEWAY=false in environment to disable and use legacy orchestrator.
 */
export const USE_TOOL_GATEWAY = process.env.USE_TOOL_GATEWAY !== 'false';

/**
 * Multi-agent mode: Each persona runs as a separate agent with its own Gemini session.
 * DEFAULT: true (multi-agent mode is now the standard for proper handoffs)
 * Set MULTI_AGENT_MODE=false in environment to disable (not recommended).
 */
export const MULTI_AGENT_MODE = process.env.MULTI_AGENT_MODE !== 'false';

/** Whether dev telemetry logging is enabled */
export const IS_DEV =
  process.env.NODE_ENV === 'development' || process.env.DEV_TELEMETRY === 'true';

// ============================================================================
// DEV TELEMETRY
// ============================================================================

/** Dev telemetry helper - logs pipeline stages in development mode */
export function devStage(stage: string, type: StageType = 'processing'): void {
  if (IS_DEV) {
    // Dynamic import to avoid circular dependency
    void import('../shared/dev-telemetry.js').then(({ logPipelineStage }) => {
      logPipelineStage(stage, type);
    });
  }
}

// ============================================================================
// DEFAULT PERSONA CONFIGS
// ============================================================================

/** Default communication config for greeting generation */
export const DEFAULT_COMMUNICATION = {
  greetingStyle: 'warm-friend' as const,
  returningUserStyle: 'warm-friend' as const,
  formalityLevel: 0.3,
  thinkingPhrases: ['Let me think about that...', 'Hmm...'],
  listeningCues: ['I hear you', 'Go on...'],
  backchannels: { neutral: ['mm-hmm'], engaged: ['right'], empathetic: ['I understand'] },
  silenceFillers: {
    early: ['Take your time'],
    mid: ["I'm here"],
    late: ["Whenever you're ready"],
  },
  selfCorrections: ['Actually, let me rephrase that...'],
  trailingOffs: ['You know...'],
  interruptionRecoveries: ['Sorry, go ahead'],
  humilityPhrases: ['I could be wrong, but...'],
  emotionalExpressions: {
    laughter: ['haha'],
    surprise: ['Oh!'],
    concern: ['Oh no...'],
    joy: ["That's wonderful!"],
    empathy: ['I understand...'],
  },
};

/** Default identity config for greeting generation */
export function buildDefaultIdentity(personaName: string) {
  return {
    selfReference: personaName,
    coreValues: ['empathy', 'growth', 'authenticity'],
    role: 'life coach',
    priorities: ['user wellbeing', 'genuine connection'],
    desiredUserExperience: 'feeling heard and supported',
  };
}

/** Build persona name from ID */
export function buildPersonaName(personaId: string): string {
  return personaId
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Tool health check interval in milliseconds */
export const TOOL_HEALTH_CHECK_INTERVAL = 30_000;
