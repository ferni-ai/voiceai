/**
 * The reply gate's side of CRISIS_CLASSIFIER_ONLY_CHECKIN=live
 * (services/safety/crisis-classifier-only-live.ts), kept out of crisis-gate.ts.
 *
 * withEasing: the crisis guidance a classifier read brought may become the
 * soft check when the turn's easing read eases it; with the flag off the gate
 * turn is returned as it came. The gate's own crisis read starts the shared
 * easing read at once.
 *
 * untilLate: an eased turn stays watched. If a read of the same turn lands
 * imminent afterwards (the pipeline's read can start after the gate decided),
 * the crisis script wins: while the eased reply is still streaming, the rest
 * of it is dropped and the script streams in its place; once it has all been
 * handed to speech, the speech is interrupted and the script is said.
 *
 * @module CrisisGateEasing
 */

import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

import { SOFT_CRISIS_CHECK } from '../../services/safety/crisis-agreement.js';
import type { AdjudicatorLine } from '../../services/safety/crisis-adjudicator.js';
import { crisisTurnOf, onCrisisRiskNoted } from '../../services/safety/crisis-call-risk.js';
import {
  turnVerdicts,
  type CrisisGenerateFn,
  type CrisisVerdict,
} from '../../services/safety/crisis-classifier.js';
import {
  easingCheckin,
  prestartEasing,
  resolveEasingMode,
  type EasingTurn,
} from '../../services/safety/crisis-classifier-only-live.js';
import { createLogger } from '../../utils/safe-logger.js';
import { signalCrisisDecision } from '../safety/crisis-gate-signal.js';
import { applyClassifierVerdict, guardFromDetection } from '../safety/crisis-guard.js';

const log = createLogger({ module: 'CrisisGate' });

type Chunk = llm.ChatChunk | string | object;
type Decision =
  | { action: 'pass' }
  | { action: 'guide'; guidance: string }
  | { action: 'replace'; script: string };
interface GateTurn {
  decision: Decision;
  escalation: Promise<Decision | null> | null;
}

/** buildCrisisGuidance's first line (crisis-guard.ts): only that guidance is ever eased. */
const CRISIS_GUIDANCE_HEADER = '[CRITICAL - USER SAFETY]';
/** Longer than any classifier read of the turn can take (each is bounded by its timeout). */
const LATE_WINDOW_MS = 30_000;

/** An eased turn's watch: the crisis script once a read of the turn lands imminent, else null. */
interface Late {
  script: Promise<string | null>;
}
const lateWatches = new WeakMap<object, Late>();

function watchLate(turn: EasingTurn): Late & { start(): void; stop(): void } {
  let resolve: (script: string | null) => void = () => undefined;
  const script = new Promise<string | null>((r) => {
    resolve = r;
  });
  let off = (): void => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = (s: string | null): void => {
    off();
    clearTimeout(timer);
    resolve(s);
  };
  const input = { latest: turn.latest, earlier: turn.earlier ?? [], companion: turn.companion };
  const check = async (): Promise<void> => {
    if (!turn.scope) return;
    const verdicts = await turnVerdicts(turn.scope, input).catch(() => []);
    const imminent = verdicts.find((v) => v?.risk === 'imminent');
    if (!imminent) return;
    const merged = applyClassifierVerdict(turn.detection, imminent);
    finish(guardFromDetection(merged).shouldBlock ? (merged.suggestedResponse ?? null) : null);
  };
  const own = crisisTurnOf(turn.latest);
  const start = (): void => {
    off = onCrisisRiskNoted((id, noted) => {
      if (id !== turn.call) return;
      if (noted === undefined || noted.includes(own) || own.includes(noted)) void check();
    });
    timer = setTimeout(() => finish(null), LATE_WINDOW_MS);
    void check(); // a read may have landed between the decision and now
  };
  return { script, start, stop: () => finish(null) };
}

/**
 * The gate turn with easing applied: the very same object when the flag is
 * off. Otherwise a crisis guide from the classifier may become
 * SOFT_CRISIS_CHECK, and an eased turn is watched (untilLate).
 */
export function withEasing<T extends GateTurn>(
  gate: T,
  run: { verdict: Promise<CrisisVerdict | null> } | null,
  turn: EasingTurn & { chatCtx: llm.ChatContext },
  callTranscript: (chatCtx: llm.ChatContext) => AdjudicatorLine[],
  options: { env?: Record<string, string | undefined>; adjudicate?: CrisisGenerateFn }
): T {
  const env = options.env ?? process.env;
  if (resolveEasingMode(env) === 'off' || !gate.escalation || !run) return gate;
  const { chatCtx, ...facts } = turn;
  const easing = {
    transcript: () => callTranscript(chatCtx),
    generate: options.adjudicate,
    env,
    source: 'gate' as const,
  };
  run.verdict.then((verdict) => prestartEasing(facts, verdict, easing)).catch(() => undefined);
  const late = watchLate(facts);
  const escalation = gate.escalation
    .catch((error: unknown) => {
      late.stop();
      throw error;
    })
    .then(async (decision): Promise<Decision | null> => {
      const crisisGuide =
        decision?.action === 'guide' && decision.guidance.startsWith(CRISIS_GUIDANCE_HEADER);
      if (!crisisGuide || !(await easingCheckin(facts, easing))) {
        late.stop();
        return decision;
      }
      log.info({ action: 'guide', source: 'classifier_only' }, 'CRISIS_GATE');
      late.start();
      return { action: 'guide', guidance: SOFT_CRISIS_CHECK };
    });
  lateWatches.set(escalation, late);
  return { ...gate, escalation };
}

/** The live session's controls, when the gate has them. */
interface Speaker {
  interrupt?: () => unknown;
  say?: (text: string, options?: { allowInterruptions?: boolean }) => unknown;
}

/**
 * The reply, with an eased turn's late script applied (see the module doc).
 * Any other reply is returned as it came. Never throws.
 */
export function untilLate(
  reply: ReadableStream<Chunk> | null,
  gate: { escalation?: Promise<unknown> | null } | null,
  session: object
): ReadableStream<Chunk> | null {
  const late = gate?.escalation ? lateWatches.get(gate.escalation) : undefined;
  if (!late || !reply) return reply;
  const reader = reply.getReader();
  let open = true;
  return new ReadableStream<Chunk>({
    start(controller) {
      late.script
        .then(async (script) => {
          if (!script) return;
          signalCrisisDecision(session, 'replace');
          log.info({ action: 'replace', source: 'late_imminent', streaming: open }, 'CRISIS_GATE');
          if (open) {
            open = false;
            await reader.cancel().catch(() => undefined);
            controller.enqueue(script);
            controller.close();
            return;
          }
          const speaker = session as Speaker;
          try {
            speaker.interrupt?.();
          } catch {
            // nothing speaking
          }
          speaker.say?.(script, { allowInterruptions: false });
        })
        .catch(() => undefined);
      void (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (!open) return;
            if (done) break;
            controller.enqueue(value);
          }
          open = false;
          controller.close();
        } catch (error) {
          if (open) {
            open = false;
            controller.error(error);
          }
        }
      })();
    },
    async cancel(reason) {
      open = false;
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}
