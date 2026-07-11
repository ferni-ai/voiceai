/**
 * Policy for overlapping TTS greeting with LLM prewarm.
 *
 * Greeting uses Cartesia TTS (agent.say) and does not need Gemini ready.
 * Prewarm opens the LLM WebSocket (~6s). Overlapping cuts time-to-first-audio
 * while keeping tool registration + session readiness gated on prewarm.
 *
 * Env: OVERLAP_GREETING_WITH_PREWARM !== 'false' → overlap on (default).
 *
 * @module agents/multi-agent/prewarm-greeting-overlap
 */

export interface PrewarmGreetingPolicy {
  /** When true, factory returns before prewarm completes so greeting can start. */
  overlap: boolean;
}

export interface FactoryPrewarmPlan {
  /** Orchestrator may greet before prewarm finishes. */
  greetBeforePrewarmDone: boolean;
  /** Factory awaits prewarm (+ tools) before returning the agent. */
  blockFactoryOnPrewarm: boolean;
}

export function getPrewarmGreetingPolicy(
  env: NodeJS.ProcessEnv = process.env
): PrewarmGreetingPolicy {
  return {
    overlap: env.OVERLAP_GREETING_WITH_PREWARM !== 'false',
  };
}

export function planFactoryPrewarm(policy: PrewarmGreetingPolicy): FactoryPrewarmPlan {
  if (policy.overlap) {
    return {
      greetBeforePrewarmDone: true,
      blockFactoryOnPrewarm: false,
    };
  }
  return {
    greetBeforePrewarmDone: false,
    blockFactoryOnPrewarm: true,
  };
}
