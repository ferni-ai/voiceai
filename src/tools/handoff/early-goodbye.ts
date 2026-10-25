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
  if (!sessionId || !handoffEarlyGoodbye(env)) return false;
  const call = calls.get(sessionId);
  try {
    const agent = call?.activeAgent();
    if (!call || !agent || call.busy()) return false;
    const to = await voicedPersona(target);
    if (!to || to === plain(agent.personaId)) return false;
    // The persona lookup awaited: the call may have moved on meanwhile
    if (call.activeAgent() !== agent || call.busy()) return false;
    const text = call.line(agent, to);
    agent.say(text, { allowInterruptions: false });
    said.set(sessionId, { to, text, at: Date.now() });
    log.info({ sessionId, from: agent.personaId, to }, '🎭 [GOODBYE] Said early');
    return true;
  } catch (error) {
    log.warn({ sessionId, error: String(error) }, '🎭 [GOODBYE] Early goodbye skipped');
    return false;
  }
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
