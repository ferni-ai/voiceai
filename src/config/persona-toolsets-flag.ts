/**
 * PERSONA_TOOLSETS (off by default): each persona's agent gets one fixed set of
 * 40 tools or fewer, built when the agent is created and changed only by a
 * handoff, which builds the next persona's agent
 * (agents/multi-agent/persona-toolsets.ts). Mid-call tool offers (topic
 * keywords, the post-greeting update, TOOLS_FOLLOW_AGENT, live retrieval) add
 * nothing while it is on (agents/shared/tool-updater.ts).
 *
 * A cohort flag: read on each agent build and each offer, never at module load.
 *
 * @module config/persona-toolsets-flag
 */
import { flagOn, type Env } from './env-flag.js';

export function personaToolsetsEnabled(env: Env = process.env): boolean {
  return flagOn('PERSONA_TOOLSETS', env);
}
