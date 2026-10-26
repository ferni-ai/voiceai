/**
 * HANDOFF_EARLY_GOODBYE=on: the outgoing persona says its departure line as
 * soon as the handoff tool's checks pass, instead of after executeHandoff's
 * setup.
 *
 * Today the goodbye waits behind the greeting, the insight briefing (Firestore)
 * and the handoff event, then the voiceSwitch handler's lock and app messages:
 * ENTRY to GOODBYE p50 197 ms, p90 501 ms in prod logs (tool-turn latency audit
 * 2026-10-25, lever L2). The orchestrator then skips the line already said and
 * waits only for what is left of it (orchestrator.ts agentSaysGoodbye).
 *
 * Said only after the consent hold (handoff-consent.ts), the same-persona, rate
 * and unlock checks and the registry lookup (executor.ts) have passed, and only
 * when the target's persona has a voice (createHandoffEvent would refuse it).
 * Never while a crisis verdict holds the reply or another handoff runs (the
 * call's `busy`, early-goodbye-call.ts), for an unknown id, or with
 * HANDOFF_TALK_THROUGH, which says the goodbye its own way.
 *
 * @module tools/handoff/early-goodbye
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { AgentId } from '../../services/agent-bus.js';
import type { HandoffResult } from './executor.js';
import { getSessionState, hasSessionState } from './session-state.js';
import { handoffNotConfirmed } from './unconfirmed-handoff.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

/** A goodbye said early is the handoff's for this long; after that it is stale. */
export const EARLY_GOODBYE_TTL_MS = 10_000;

export interface OutgoingPersona {
  personaId: string;
  session: unknown;
  say(text: string, options: { allowInterruptions: boolean }): unknown;
}

/** What a call lends the handoff tool (early-goodbye-call.ts, registered per call). */
export interface EarlyGoodbyeCall {
  activeAgent(): OutgoingPersona | null;
  /** A handoff is already running, or a crisis verdict holds the reply: no goodbye now. */
  busy(): boolean;
  /** The departure line, as the orchestrator picks it. */
  line(agent: OutgoingPersona, to: string): string;
}

interface Said {
  from: string;
  to: string;
  text: string;
  at: number;
}

const calls = new Map<string, EarlyGoodbyeCall>();
const said = new Map<string, Said>();

export function handoffEarlyGoodbye(env: Env = process.env): boolean {
  return flagOn('HANDOFF_EARLY_GOODBYE', env) && !flagOn('HANDOFF_TALK_THROUGH', env);
}

/** Lend `call` to this session's handoff tools; returns the undo. */
export function registerEarlyGoodbye(sessionId: string, call: EarlyGoodbyeCall): () => void {
  calls.set(sessionId, call);
  return () => {
    if (calls.get(sessionId) === call) calls.delete(sessionId);
    said.delete(sessionId);
  };
}

const plain = (id: string): string => id.toLowerCase().trim();

/** The target's canonical id when it is a persona with a voice (createHandoffEvent needs one). */
async function voicedPersona(target: string): Promise<string | null> {
  const personas = await import('../../personas/index.js');
  const to = personas.getCanonicalPersonaId(target); // an unknown id reads as ferni: never that
  if (!personas.isKnownPersona(target) && to !== plain(target)) return null;
  return (await personas.getPersonaAsync(to))?.voice?.voiceId ? to : null;
}

/** Say the goodbye now; true when it was said. Never throws. */
export async function sayGoodbyeEarly(
  sessionId: string | undefined,
  target: string,
  env: Env = process.env
): Promise<boolean> {
  return (await sayEarly(sessionId, target, env)) !== null;
}

async function sayEarly(
  sessionId: string | undefined,
  target: string,
  env: Env = process.env
): Promise<Said | null> {
  if (!sessionId || !handoffEarlyGoodbye(env)) return null;
  const call = calls.get(sessionId);
  try {
    const agent = call?.activeAgent();
    if (!call || !agent || call.busy()) return null;
    const to = await voicedPersona(target);
    if (!to || to === plain(agent.personaId)) return null;
    // The persona lookup awaited: the call may have moved on meanwhile
    if (call.activeAgent() !== agent || call.busy()) return null;
    const text = call.line(agent, to);
    agent.say(text, { allowInterruptions: false });
    const early = { from: agent.personaId, to, text, at: Date.now() };
    said.set(sessionId, early);
    log.info({ sessionId, from: agent.personaId, to }, '🎭 [GOODBYE] Said early');
    return early;
  } catch (error) {
    log.warn({ sessionId, error: String(error) }, '🎭 [GOODBYE] Early goodbye skipped');
    return null;
  }
}

/** A goodbye said early that no handoff has taken yet (llm-handoff.ts: never leave it hanging). */
export const earlyGoodbyePending = (sessionId: string): boolean => said.has(sessionId);

const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

/** What the caller hears when a handoff they were told about doesn't happen. */
export const brokenPromiseLine = (teammate: string): string =>
  `Hmm, I couldn't bring ${firstName(teammate)} in just now. I'm still here.`;

/**
 * Run a handoff with the early goodbye: `run` passes `onCleared` to executeHandoff. When the
 * goodbye was said and the handoff then fails, times out or throws, the saved goodbye is
 * cleared, the persona still on the call says one honest line, and the result tells the
 * model the caller was already told the teammate was coming. It never claims the handoff.
 */
export async function withEarlyGoodbye(
  sessionId: string | undefined,
  teammate: string,
  run: (onCleared: (to: string) => Promise<unknown>) => Promise<HandoffResult>
): Promise<HandoffResult> {
  const early: { said?: Said | null } = {};
  const onCleared = async (to: string): Promise<void> => {
    early.said = await sayEarly(sessionId, to);
  };
  let result: HandoffResult;
  try {
    result = await run(onCleared);
  } catch (error) {
    if (!early.said || !sessionId) throw error;
    log.warn({ sessionId, error: String(error) }, '🎭 [GOODBYE] Handoff threw after the goodbye');
    result = notConfirmed(sessionId, early.said, teammate);
  }
  if (result.success || !early.said || !sessionId) return result;
  return toldTheTruth(sessionId, early.said, teammate, result);
}

function notConfirmed(sessionId: string, early: Said, teammate: string): HandoffResult {
  return handoffNotConfirmed({
    sessionState: hasSessionState(sessionId) ? getSessionState(sessionId) : null,
    previousAgent: early.from as AgentId,
    targetAgent: early.to,
    targetAgentName: teammate,
  });
}

/** The goodbye was said, the handoff didn't happen: clear it, say so once, tell the model. */
function toldTheTruth(
  sessionId: string,
  early: Said,
  teammate: string,
  result: HandoffResult
): HandoffResult {
  if (said.get(sessionId) === early) said.delete(sessionId);
  const line = brokenPromiseLine(teammate);
  const agent = calls.get(sessionId)?.activeAgent();
  let spoken = false;
  try {
    // Only the persona who said the goodbye, still on the call, says it was off
    if (agent && plain(agent.personaId) === plain(early.from)) {
      agent.say(line, { allowInterruptions: false });
      spoken = true;
    }
  } catch (error) {
    log.warn({ sessionId, error: String(error) }, '🎭 [GOODBYE] Honest line not said');
  }
  log.info({ sessionId, to: early.to, spoken }, '🎭 [GOODBYE] Handoff failed after the goodbye');
  const name = firstName(teammate);
  const heard = spoken ? ` They then heard you say: "${line}"` : '';
  return {
    ...result,
    success: false,
    error:
      `You already told them ${name} was coming, but ${name} couldn't join, so you're still ` +
      `the one talking with them.${heard} Don't say ${name} joined, and don't try again ` +
      `unless they ask.`,
  };
}

/** The goodbye this handoff already said, taken once; null when none or stale. */
export function takeEarlyGoodbye(sessionId: string, target: string, now = Date.now()): Said | null {
  const early = said.get(sessionId);
  said.delete(sessionId);
  if (!early || early.to !== plain(target)) return null;
  return now - early.at <= EARLY_GOODBYE_TTL_MS ? early : null;
}

/** How long is left of a goodbye of `durationMs` (all of it when none was said early). */
export function goodbyeLeft(early: Said | null, durationMs: number, now = Date.now()): number {
  return early ? Math.max(0, durationMs - (now - early.at)) : durationMs;
}
