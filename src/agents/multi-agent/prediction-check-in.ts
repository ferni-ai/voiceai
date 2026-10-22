/**
 * Peter's weekly prediction, closed on a later call (WEEKLY_PREDICTION).
 *
 * The game saves a prediction and says "come back at the end of the week",
 * but nothing brought it back: the week-end prompt (buildEngagementContextPrompt)
 * had no caller, so a prediction was never resolved by voice. Once a
 * prediction is 7 days old, the call's recall note now carries one line
 * asking whoever is speaking to check in on the week and record the actuals
 * (weeklyPrediction, record-actuals). Asking also loads the game for the
 * caller's answer (prediction-topics.ts).
 *
 * Gentle by construction: once a day per caller, only on a final transcript,
 * never on a heavy call (hard news or venting, as happy-exits.ts reads it) or a crisis
 * turn, and never in a note that already has another follow-up.
 *
 * @module agents/multi-agent/prediction-check-in
 */
import { flagOn } from '../../config/env-flag.js';
import { isCrisisText } from '../../intelligence/world-model/crisis-filter.js';
import { predictionCheckInAsked } from '../../tools/dynamic-loader/prediction-topics.js';
import { createLogger } from '../../utils/safe-logger.js';
import { hardNews } from '../personas/turn-candor.js';
import { callerVenting } from '../personas/turn-extras.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';

const log = createLogger({ module: 'prediction-check-in' });

export interface PredictionCheckIn {
  ready: Promise<void>;
  /** Every caller transcript: a heavy or crisis one rules the line out for the call. */
  heard: (said: string) => void;
  /** The line for this caller turn, or null. No side effects. */
  note: (final?: boolean) => string | null;
  /** The line went out, or another follow-up took this call: no line now. */
  raised: (gaveLine: boolean) => void;
}

export interface PredictionCheckInDeps {
  userId: string;
  personaId: string;
  /** The week-end prompt for a prediction 7+ days old; '' when none is due. */
  load?: (userId: string, personaId: string) => Promise<string>;
  now?: () => Date;
}

/** Caller → the day they were last asked; process-wide, so a handoff doesn't ask again. */
const askedOn = new Map<string, string>();

/** For tests: forget who was asked. */
export function forgetPredictionCheckIns(): void {
  askedOn.clear();
}

/** Imported when used: the engagement services stay out of the recall hook's import graph. */
async function weekEndPrompt(userId: string, personaId: string): Promise<string> {
  const { buildEngagementContextPrompt } =
    await import('../../services/engagement/engagement-conversation-triggers.js');
  return buildEngagementContextPrompt(userId, personaId, ['prediction_result']);
}

export function createPredictionCheckIn(deps: PredictionCheckInDeps): PredictionCheckIn {
  const today = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
  let line = '';
  let done = false;
  let heavy = false;
  const ready = (deps.load ?? weekEndPrompt)(deps.userId, deps.personaId)
    .then((prompt) => {
      line = prompt.trim();
      if (line) log.info('Weekly prediction due');
    })
    .catch((error: unknown) => log.warn({ error: String(error) }, 'Predictions not loaded'));
  return {
    ready,
    heard(said) {
      if (hardNews(said) || callerVenting(said) || isCrisisText(said)) heavy = true;
    },
    note(final) {
      if (!line || done || heavy || final === false) return null;
      return askedOn.get(deps.userId) === today ? null : line;
    },
    raised(gaveLine) {
      if (done) return;
      done = true;
      if (!gaveLine) return;
      askedOn.set(deps.userId, today);
      predictionCheckInAsked(deps.userId);
    },
  };
}

const NONE: PredictionCheckIn = {
  ready: Promise.resolve(),
  heard: () => undefined,
  note: () => null,
  raised: () => undefined,
};

/** The call's prediction check-in with WEEKLY_PREDICTION=on; one with nothing when off. */
export function predictionCheckInFor(userId: string, personaId: string): PredictionCheckIn {
  if (!flagOn('WEEKLY_PREDICTION') || !isMemberIdentity(userId)) return NONE;
  return createPredictionCheckIn({ userId, personaId });
}
