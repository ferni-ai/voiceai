/**
 * TOOLS_SAME_TURN (off by default): the tools a turn's words point to reach
 * that turn's request.
 *
 * Topic tools used to reach the agent only after its reply had started
 * (voice-agent/deferred-tool-update.ts), so the turn that asked never had them.
 * Dev release check 2026-10-18: "find me a YouTube video..." and "find me a
 * coffee shop near downtown St. Petersburg" loaded video and local-search
 * 33-97 ms after the transcript, the model called searchWeb at +0.6-1.8 s, and
 * searchYouTube / searchLocalBusinesses arrived at +1.0-2.0 s: searchWeb said
 * "No results" 6 of 6 times.
 *
 * With the flag on, the persona agent's llmNode adds the matched topics' tools
 * to the reply's own tool context (agents/personas/same-turn-tools.ts), built
 * synchronously from domains already in the registry.
 *
 * Every read happens once a call has its caller (after applyCallerFlags), so a
 * cohort can turn it on.
 *
 * @module config/same-turn-tools-config
 */
import { flagOn, type Env } from './env-flag.js';

export function sameTurnToolsEnabled(env: Env = process.env): boolean {
  return flagOn('TOOLS_SAME_TURN', env);
}

/** The most tools the same-turn lookup adds to one request. */
export const SAME_TURN_MAX_TOOLS = 8;
