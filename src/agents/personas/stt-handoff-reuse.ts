/**
 * STT_HANDOFF_REUSE: the next persona keeps the call's STT stream.
 *
 * @livekit/agents 1.9 hands its running STT pipeline (and the Cartesia socket under it) to
 * the next agent on a handoff, but only when both agents report `_usesDefaultSttNode()`
 * (agent_activity.ts `_detachReusableResources`). PersonaVoiceAgent overrides sttNode, so
 * every handoff closed the stream and the next persona opened a new one: connection setup on
 * the caller's first turn after the swap, and words said meanwhile could be lost.
 *
 * The SDK holds custom nodes back because one "may access the old session/activity inside the
 * yield loop after detach". Ours does not: PersonaVoiceAgent.sttNode reads the agent only when
 * it is called, and what it wraps is per session (the audio processor's claim, the turn-1
 * gate's once-per-session set, the name fix reading userData.personaId per event). Every
 * persona runs that same function, so the stream the first persona opened is the stream the
 * next one would have opened. The SDK's own agent_v2 overrides `_usesDefaultSttNode` the
 * same way for its always-present node.
 *
 * Off unless STT_HANDOFF_REUSE=on; off, the answer is the SDK's own.
 *
 * @module agents/personas/stt-handoff-reuse
 */
import { flagOn } from '../../config/env-flag.js';

type Env = Record<string, string | undefined>;

/**
 * Whether `agent`'s STT pipeline may be handed across a handoff. With the flag on, an agent
 * whose sttNode is `sharedNode` (the persona node) counts as reusable; a subclass that
 * overrides sttNode again does not.
 */
export function sttReusableAcrossHandoff(
  agent: object,
  sharedNode: unknown,
  sdkDefault: () => boolean,
  env: Env = process.env
): boolean {
  if (!flagOn('STT_HANDOFF_REUSE', env)) return sdkDefault();
  const node = (Object.getPrototypeOf(agent) as { sttNode?: unknown }).sttNode;
  return node === sharedNode || sdkDefault();
}
