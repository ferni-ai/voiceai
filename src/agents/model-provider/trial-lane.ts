/**
 * CASCADE_TRIAL_MODEL (#4467): a dev-only, per-call trial of a newer Gemini model against today's.
 *
 * Off by default. Set to one of TRIAL_MODELS (below), each call draws an arm from its session
 * id, the same for the whole call: about half are `trial`, the rest `control`. On a trial call a
 * request goes to the trial model only when it is clear of crisis handling. The crisis gate puts
 * a clearance on each request it sends (lane-request.ts, built in
 * agents/safety/crisis-trial-clearance.ts), and the lane asks it when the request reaches the
 * model. A request without one, or marked for today's model, never goes to the trial. Every
 * other request, every request of a control call, and every request with the trial off goes to
 * today's model, hedged as before. Any other value is off.
 *
 * Dev only: nothing is drawn unless this process is on dev's Firestore database by its exact
 * name (isKnownDevDatabase). Set on prod, or with a misspelt database name, the flag does nothing.
 *
 * @module agents/model-provider/trial-lane
 */
import { createHash } from 'node:crypto';
import { llm } from '@livekit/agents';
import { isKnownDevDatabase } from '../../config/firestore-database.js';
import { createLogger } from '../../utils/safe-logger.js';
import { LaneStream } from './fast-lane.js';
import { forwardPrewarm } from './forward-prewarm.js';
import { mainLaneRequired, trialClearanceOf } from './lane-request.js';

const log = createLogger({ module: 'TrialLane' });

type ChatOptions = Parameters<llm.LLM['chat']>[0];
type Env = Record<string, string | undefined>;

type TrialArm = 'trial' | 'control';

/**
 * The trial models, by exact ID. Each was listed by our Vertex endpoint and answered a probe on
 * 2026-11-26 (#4467), and each rejects MINIMAL with a 400, so the cascade gives each LOW
 * (rejectsMinimalThinking, config/thinking-defaults.ts). gemini-3.8-flash at LOW took ~2.2s to
 * first text vs ~0.9s for gemini-3.5-flash at MINIMAL (2026-09-27, 64 tools, full prompt).
 * Anything else in CASCADE_TRIAL_MODEL leaves the trial off.
 */
const TRIAL_MODELS: readonly string[] = Object.freeze([
  'gemini-3.8-flash',
  'gemini-4-argon',
  'gemini-4-carbon',
  'gemini-4-hydrogen',
  'gemini-4-neon',
]);

/** The trial model this process may use: a listed ID on dev's database, else null (off). */
function trialModel(env: Env = process.env): string | null {
  const id = env.CASCADE_TRIAL_MODEL?.trim();
  if (!id || !TRIAL_MODELS.includes(id)) return null;
  return isKnownDevDatabase(env) ? id : null;
}

/** The call's arm, the same for every request of the call. */
function trialArm(callId: string): TrialArm {
  const h = createHash('sha256').update(`trial-arm:${callId}`).digest();
  return h.readUInt32BE(0) < 2 ** 31 ? 'trial' : 'control';
}

/**
 * Whether this request may go to the trial model, asked when it reaches the model. Only a request
 * the gate sent with a clearance, on a trial-arm call, not marked for today's model, and clear of
 * crisis handling now. A clearance that throws sends the request to today's model.
 */
function toTrial(request: object, env: Env): boolean {
  const gate = trialClearanceOf(request);
  if (!gate || mainLaneRequired(request)) return false;
  let callId: string | undefined;
  try {
    callId = gate.callId();
  } catch {
    return false;
  }
  if (callId === undefined || trialArm(callId) !== 'trial') return false;
  if (!gate.clear(env)) return false;
  // A held reply: it goes out only once its read is clean (crisis-gate.ts, heldTrialReplyCleared).
  gate.noteTrialWrote();
  return true;
}

/** Today's model; a trial call's requests clear of crisis handling go to `trial`. */
class TrialLaneLLM extends llm.LLM {
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
    const target = toTrial(opts.chatCtx, this.env) ? this.trial : this.main;
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
