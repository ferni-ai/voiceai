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
 * Another handoff can start while the goodbye is pending or playing: a tap, or a
 * second tool call. For a different teammate the goodbye is cancelled (its speech is
 * stopped, or stopped as soon as the SDK makes it) and forgotten, so the caller never
 * hears "here's Ferni" before the teammate they tapped. For the same teammate, a tool
 * whose own path then fails reports the teammate as on the call once they are.
 *
 * @module tools/handoff/early-goodbye
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { AgentId } from '../../services/agent-bus.js';
import type { HandoffResult } from './executor.js';
import {
  getSessionState,
  hasSessionState,
  setCurrentAgent as setSessionAgent,
} from './session-state.js';
import { setCurrentAgent } from './state.js';
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
  /** A handoff is running or holds the call's handoff lock (it may still bring the teammate). */
  running?(): boolean;
  /** The departure line, as the orchestrator picks it. */
  line(agent: OutgoingPersona, to: string): string;
}

/** The SDK's handle for a spoken line (its 'speech_created' event). */
interface SpeechHandleLike {
  interrupt(force?: boolean): unknown;
}

interface Said {
  from: string;
  to: string;
  text: string;
  at: number;
  /** The goodbye's speech, once the SDK has made it */
  handle?: SpeechHandleLike;
  /** Another handoff took over: the goodbye must not play */
  cancelled?: boolean;
  stopWatching?: () => void;
}

const calls = new Map<string, EarlyGoodbyeCall>();
const said = new Map<string, Said>();

/**
 * A tool handoff past its checks and not yet done. The caller's tap to someone else wins
 * outright: `chosen` is that teammate, and the tool's queued handoff never runs
 * (llm-handoff.ts toolHandoffSuperseded).
 */
interface ToolHandoff {
  to: string;
  chosen?: string;
}
const toolHandoffs = new Map<string, ToolHandoff>();

/** The teammate the caller chose instead, when the tool's queued handoff to `target` lost. */
export function toolHandoffSuperseded(sessionId: string, target: string): string | null {
  const tool = toolHandoffs.get(sessionId);
  return tool && tool.to === plain(target) && tool.chosen ? tool.chosen : null;
}

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
    const pending = said.get(sessionId);
    if (pending && pending.to === to && Date.now() - pending.at <= EARLY_GOODBYE_TTL_MS)
      return null;
    if (pending) cancelEarly(sessionId, pending, to); // a goodbye for someone else: not now
    const text = call.line(agent, to);
    const early: Said = { from: agent.personaId, to, text, at: Date.now() };
    watchSpeech(agent.session, early);
    agent.say(text, { allowInterruptions: false });
    said.set(sessionId, early);
    log.info({ sessionId, from: agent.personaId, to }, '🎭 [GOODBYE] Said early');
    return early;
  } catch (error) {
    log.warn({ sessionId, error: String(error) }, '🎭 [GOODBYE] Early goodbye skipped');
    return null;
  }
}

const SPEECH_CREATED = 'speech_created';

interface SpeechEvents {
  on?: (event: string, fn: (ev: unknown) => void) => unknown;
  off?: (event: string, fn: (ev: unknown) => void) => unknown;
}

/** Keep the goodbye's speech handle (the first say the session makes after it), to stop it. */
function watchSpeech(session: unknown, early: Said): void {
  const s = (session ?? {}) as SpeechEvents;
  if (typeof s.on !== 'function' || typeof s.off !== 'function') return;
  // stop is defined below; the timer only fires after this function returns.
  const timer = setTimeout(() => stop(), EARLY_GOODBYE_TTL_MS);
  timer.unref?.();
  const onCreated = (ev: unknown): void => {
    const { source, speechHandle } = (ev ?? {}) as {
      source?: string;
      speechHandle?: SpeechHandleLike;
    };
    if (source !== 'say' || !speechHandle) return;
    stop();
    early.handle = speechHandle;
    if (early.cancelled) silence(early); // cancelled while it waited in the queue
  };
  const stop = (): void => {
    clearTimeout(timer);
    s.off?.(SPEECH_CREATED, onCreated);
    early.stopWatching = undefined;
  };
  early.stopWatching = stop;
  s.on(SPEECH_CREATED, onCreated);
}

function silence(early: Said): void {
  try {
    early.handle?.interrupt(true); // said without interruptions: only a forced stop ends it
  } catch (error) {
    log.warn({ to: early.to, error: String(error) }, '🎭 [GOODBYE] Early goodbye not stopped');
  }
}

/** Another handoff took over: the goodbye stops (or never starts) and is forgotten. */
function cancelEarly(sessionId: string, early: Said, by: string): void {
  early.cancelled = true;
  if (said.get(sessionId) === early) said.delete(sessionId);
  if (early.handle) {
    early.stopWatching?.();
    silence(early);
  }
  log.info(
    { sessionId, to: early.to, by },
    '🎭 [GOODBYE] Early goodbye cancelled: another handoff'
  );
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
  const early: { said?: Said | null; cleared?: boolean; tool?: ToolHandoff } = {};
  const onCleared = async (to: string): Promise<void> => {
    early.cleared = true; // past the same-persona, rate and unlock checks
    if (sessionId && handoffEarlyGoodbye()) {
      early.tool = { to: plain(to) };
      toolHandoffs.set(sessionId, early.tool);
    }
    early.said = await sayEarly(sessionId, to);
  };
  let result: HandoffResult;
  try {
    result = await run(onCleared);
  } catch (error) {
    if (!early.said || !sessionId) throw error;
    log.warn({ sessionId, error: String(error) }, '🎭 [GOODBYE] Handoff threw after the goodbye');
    result = notConfirmed(sessionId, early.said, teammate);
  } finally {
    if (sessionId && early.tool && toolHandoffs.get(sessionId) === early.tool) {
      toolHandoffs.delete(sessionId);
    }
  }
  if (result.success || !sessionId || !handoffEarlyGoodbye()) return result;
  const call = calls.get(sessionId);
  if (early.cleared && call && (await joinedAnyway(call, result.targetAgent))) {
    return joined(sessionId, early.said ?? null, result);
  }
  if (early.tool?.chosen) return choseOther(early.tool.chosen, teammate, result);
  if (!early.said) return result;
  if (early.said.cancelled) return dropped(early.said, teammate, result);
  return toldTheTruth(sessionId, early.said, teammate, result);
}

/** The longest a failed tool waits for a handoff still running (a tap) before it reports. */
const JOINED_SETTLE_MS = 8_000;
const SETTLE_POLL_MS = 50;

/** After the handoff that is running settles: is `target` the persona on the call? */
async function joinedAnyway(call: EarlyGoodbyeCall, target: string): Promise<boolean> {
  const until = Date.now() + JOINED_SETTLE_MS;
  while (call.running?.() && Date.now() < until) {
    // eslint-disable-next-line no-await-in-loop -- polling until the other handoff settles
    await new Promise<void>((resolve) => {
      setTimeout(resolve, SETTLE_POLL_MS);
    });
  }
  const agent = call.activeAgent();
  return Boolean(agent && target && plain(agent.personaId) === plain(target));
}

/** The teammate came on by another path (a tap): the tool says so, never that it failed. */
function joined(sessionId: string, early: Said | null, result: HandoffResult): HandoffResult {
  if (early && said.get(sessionId) === early) said.delete(sessionId);
  // The executor put the previous persona back as current (unconfirmed-handoff.ts)
  const target = result.targetAgent as AgentId;
  if (hasSessionState(sessionId)) setSessionAgent(getSessionState(sessionId), target);
  setCurrentAgent(target);
  log.info({ sessionId, to: target }, '🎭 [GOODBYE] Teammate joined by another path');
  return {
    ...result,
    success: true,
    error: undefined,
    greetingSpoken: true,
    instructionsUpdated: true,
  };
}

/** The caller turned to someone else first: no honest line (that handoff speaks), no claim. */
/** The caller tapped someone else during the setup: that handoff won, this one never ran. */
async function choseOther(
  chosen: string,
  teammate: string,
  result: HandoffResult
): Promise<HandoffResult> {
  const name = firstName(teammate);
  let other = chosen;
  try {
    other = firstName((await import('../../personas/index.js')).getPersonaDisplayName(chosen));
  } catch {
    // the id is still a name the model can read
  }
  log.info({ to: result.targetAgent, chosen }, '🎭 [GOODBYE] The caller chose another teammate');
  return {
    ...result,
    success: false,
    error:
      `They chose ${other} instead, so ${name} isn't joining and ${other} is on the call ` +
      `now. Don't say ${name} joined, and don't hand off to ${name} unless they ask again.`,
  };
}

function dropped(early: Said, teammate: string, result: HandoffResult): HandoffResult {
  const name = firstName(teammate);
  log.info({ to: early.to }, '🎭 [GOODBYE] Handoff dropped: the caller turned to someone else');
  return {
    ...result,
    success: false,
    error: `They asked for someone else before ${name} joined, so ${name} isn't on the call. Don't say ${name} joined.`,
  };
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
  // A tap to someone else while the tool's handoff waits: the tap wins (toolHandoffSuperseded)
  const tool = toolHandoffs.get(sessionId);
  if (tool && tool.to !== plain(target)) tool.chosen = plain(target);
  if (!early) return null;
  // A handoff to someone else: that goodbye must not play before this one
  if (early.to !== plain(target)) {
    cancelEarly(sessionId, early, plain(target));
    return null;
  }
  return now - early.at <= EARLY_GOODBYE_TTL_MS ? early : null;
}

/** How long is left of a goodbye of `durationMs` (all of it when none was said early). */
export function goodbyeLeft(early: Said | null, durationMs: number, now = Date.now()): number {
  return early ? Math.max(0, durationMs - (now - early.at)) : durationMs;
}
