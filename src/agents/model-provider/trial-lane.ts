/**
 * CASCADE_TRIAL_MODEL (#4467): a dev-only, per-call trial of a newer Gemini model against today's.
 *
 * Off by default. Set to one of TRIAL_MODELS (below), each call draws an arm from its
 * session id, the same for the whole call: about half are `trial`, the rest `control`. On a
 * trial call a request goes to the trial model only when it is clear of crisis handling
 * (agents/safety/crisis-trial-clearance.ts). Every other request, every request of a control
 * call, and every request with the trial off goes to today's model, hedged as before. Any other
 * value is off.
 *
 * Dev only: nothing is drawn unless this process is on dev's Firestore database by its exact
 * name (isKnownDevDatabase). Set on prod, or with a misspelt database name, the flag does nothing.
 *
 * With the trial on, each TURN_RECEIPT says the call's arm, whether a trial call's request was
 * held to today's model, the model that answered and whether it was a hedge backup (trialField).
 * The bake-off report leaves backup answers out of the trial arm.
 *
 * @module agents/model-provider/trial-lane
 */
import { createHash } from 'node:crypto';
import { ThinkingLevel } from '@google/genai';
import { llm } from '@livekit/agents';
import { isKnownDevDatabase } from '../../config/firestore-database.js';
import { createLogger } from '../../utils/safe-logger.js';
import { sessionScope } from '../personas/crisis-gate-words.js';
import { clearOfCrisis, noteTrialHeld } from '../safety/crisis-trial-clearance.js';
import { LaneStream } from './fast-lane.js';
import { forwardPrewarm } from './forward-prewarm.js';
import { HedgedLLM, hedgedAnswerOf } from './hedged-llm.js';
import { mainLaneRequired, sentBy } from './lane-request.js';

const log = createLogger({ module: 'TrialLane' });

type ChatOptions = Parameters<llm.LLM['chat']>[0];
type Env = Record<string, string | undefined>;

export type TrialArm = 'trial' | 'control';

/**
 * The trial models, by exact ID, each with the lowest thinking level it accepts. Each was listed
 * by our Vertex endpoint and answered a probe on 2026-11-26 (#4467), and each rejected MINIMAL
 * with a 400, so each takes LOW. gemini-3.8-flash at LOW took ~2.2s to first text vs ~0.9s for
 * gemini-3.5-flash at MINIMAL (2026-09-27, 64 tools, full prompt).
 */
const LOWEST_THINKING: Readonly<Record<string, ThinkingLevel>> = Object.freeze({
  'gemini-3.8-flash': ThinkingLevel.LOW,
  'gemini-4-argon': ThinkingLevel.LOW,
  'gemini-4-carbon': ThinkingLevel.LOW,
  'gemini-4-hydrogen': ThinkingLevel.LOW,
  'gemini-4-neon': ThinkingLevel.LOW,
});

/** The IDs CASCADE_TRIAL_MODEL accepts; anything else leaves the trial off. */
export const TRIAL_MODELS: readonly string[] = Object.freeze(Object.keys(LOWEST_THINKING));

/** The lowest thinking level `model` accepts: its listed level, else MINIMAL (gemini-3.5-*). */
export function lowestThinking(model: string): ThinkingLevel {
  return Object.hasOwn(LOWEST_THINKING, model) ? LOWEST_THINKING[model] : ThinkingLevel.MINIMAL;
}

/** The trial model this process may use: a listed ID on dev's database, else null (off). */
export function trialModel(env: Env = process.env): string | null {
  const id = env.CASCADE_TRIAL_MODEL?.trim();
  if (!id || !TRIAL_MODELS.includes(id)) return null;
  return isKnownDevDatabase(env) ? id : null;
}

/** The call's arm, the same for every request of the call. */
export function trialArm(callId: string): TrialArm {
  const h = createHash('sha256').update(`trial-arm:${callId}`).digest();
  return h.readUInt32BE(0) < 2 ** 31 ? 'trial' : 'control';
}

/** Where one request went, kept for its receipt. */
interface Route {
  arm: TrialArm | null;
  target: llm.LLM;
  trial: boolean;
}

const routes = new WeakMap<object, Route>();

/**
 * The call's arm (null: no call, or its session can't be read), and whether this request may go
 * to the trial model. A session that throws on read sends the request to today's model.
 */
function decide(request: object, env: Env): { arm: TrialArm | null; trial: boolean } {
  const gate = sentBy(request);
  let callId: string | undefined;
  try {
    callId = sessionScope((gate?.session as { userData?: unknown } | undefined)?.userData);
  } catch {
    return { arm: null, trial: false };
  }
  const arm = callId === undefined ? null : trialArm(callId);
  const trial = arm === 'trial' && clearOfCrisis(gate, mainLaneRequired(request), env);
  // A held reply: it goes out only once its read is clean (crisis-gate.ts, heldTrialReplyCleared).
  if (trial && gate?.held) noteTrialHeld(gate.held);
  return { arm, trial };
}

/** Today's model; a trial call's requests clear of crisis handling go to `trial`. */
export class TrialLaneLLM extends llm.LLM {
  private readonly prewarmWarned = new WeakSet<object>();

  constructor(
    readonly trial: llm.LLM,
    readonly main: llm.LLM,
    private readonly env: Env = process.env
  ) {
    super();
    // As in FastLaneLLM: an unheard 'error' event would crash the process.
    for (const model of [trial, main]) {
      model.on('error', (ev: { error?: unknown }) =>
        log.warn({ model: model.label(), error: String(ev?.error) }, 'model error')
      );
    }
  }

  get model(): string {
    return this.main.model;
  }

  label(): string {
    return `trial-lane(${this.trial.label()} | ${this.main.label()})`;
  }

  prewarm(): void {
    forwardPrewarm('TrialLaneLLM', [this.trial, this.main], this.prewarmWarned);
  }

  chat(opts: ChatOptions): llm.LLMStream {
    const { arm, trial } = decide(opts.chatCtx, this.env);
    const target = trial ? this.trial : this.main;
    routes.set(opts.chatCtx, { arm, target, trial });
    return new LaneStream(this, opts, target);
  }
}

/** `main` as is with the trial off; else a TrialLaneLLM over `make(model)` and `main`. */
export function withTrialLane(
  main: llm.LLM,
  make: (model: string) => llm.LLM,
  env: Env = process.env
): llm.LLM {
  const model = trialModel(env);
  if (!model) return main;
  log.info({ model }, 'Cascade trial model on (dev only)');
  return new TrialLaneLLM(make(model), main, env);
}

/** A request whose receipt carries the trial field: only while the trial is on. */
export interface TrialSlot {
  request: object;
}

/** The slot for this request's receipt, or null with the trial off (the receipt is unchanged). */
export function trialSlot(request: object, env: Env = process.env): TrialSlot | null {
  return trialModel(env) ? { request } : null;
}

/** What a TURN_RECEIPT says of one request with the trial on: never words. */
export interface TrialField {
  /** The call's arm; null when the request had no call. */
  arm: TrialArm | null;
  /** A trial call's request sent to today's model (not clear of crisis handling, or no call). */
  held: boolean;
  /** The model that answered; null before any model said something, or never routed. */
  model: string | null;
  /** The answer came from a hedge backup: the report leaves it out of the trial arm. */
  backup: boolean;
}

/** The receipt's trial field for this slot's request. */
export function trialField(slot: TrialSlot): TrialField {
  const route = routes.get(slot.request);
  if (!route) return { arm: null, held: false, model: null, backup: false };
  const { arm, target, trial } = route;
  const held = arm === 'trial' && !trial;
  if (!(target instanceof HedgedLLM)) return { arm, held, model: target.model, backup: false };
  const answer = hedgedAnswerOf(slot.request);
  if (answer === undefined) return { arm, held, model: null, backup: false };
  const backup = answer === 'backup';
  return { arm, held, model: (backup ? target.backup : target.primary).model, backup };
}
