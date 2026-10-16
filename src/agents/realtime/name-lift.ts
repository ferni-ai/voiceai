/**
 * The name lift: when the caller names someone Ferni remembers, the avatar
 * reacts to what Ferni knows about them the instant the name is heard.
 *
 * Good news brightens, something pending gets a soft attentive look, and
 * grief or conflict only ever gets comfort (memory/recall/person-valence.ts).
 * Someone unknown, or with nothing felt about them, gets nothing.
 *
 * Runs on every transcript, interim ones included, so the reaction lands
 * while the name is still being said. At most once per person and three
 * times per call. The web reads it in apps/web/src/ui/avatar-motion/name-lift.ts.
 *
 * Privacy: the message carries only the effect kind. Never the name, never
 * what is remembered.
 *
 * Off by default; NAME_LIFT=on turns it on.
 *
 * @module agents/realtime/name-lift
 */
import {
  rememberedPeople,
  saysName,
  type NameLiftEffect,
  type RememberedPerson,
} from '../../memory/recall/person-valence.js';
import type { RecallSnapshot } from '../../memory/recall/session-recall.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'NameLift' });

export const MAX_LIFTS_PER_CALL = 3;

export function nameLiftEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NAME_LIFT === 'on';
}

export type NameLiftSend = (type: string, payload: Record<string, unknown>) => Promise<void>;

/** The data message: a humanization signal with the effect kind and nothing else. */
export function nameLiftMessage(effect: NameLiftEffect): Record<string, unknown> {
  return { signalType: 'name_lift', effect, timestamp: Date.now() };
}

export interface NameLift {
  /** The effect sent for this transcript, or null. */
  observe: (transcript: string) => NameLiftEffect | null;
}

export function createNameLift(people: readonly RememberedPerson[], send: NameLiftSend): NameLift {
  const lifted = new Set<RememberedPerson>();
  return {
    observe(transcript) {
      if (lifted.size >= MAX_LIFTS_PER_CALL || !transcript.trim()) return null;
      const person = people.find(
        (p) => !lifted.has(p) && p.names.some((n) => saysName(transcript, n))
      );
      if (!person) return null;
      lifted.add(person);
      send('humanization_signal', nameLiftMessage(person.effect)).catch((error: unknown) =>
        log.warn({ error: String(error) }, 'Name lift not sent')
      );
      log.info({ effect: person.effect, lifts: lifted.size }, 'Name lift');
      return person.effect;
    },
  };
}

/**
 * Wire the lift to a call's memory recall. Returns the transcript observer,
 * or undefined with the flag off. People are read from the recall snapshot
 * on the first transcript after it has loaded; until then nothing lifts.
 */
export function startNameLift(
  recall: { snapshot: () => RecallSnapshot | undefined },
  send: NameLiftSend,
  env: Record<string, string | undefined> = process.env
): ((transcript: string) => void) | undefined {
  if (!nameLiftEnabled(env)) return undefined;
  let lift: NameLift | undefined;
  return (transcript) => {
    if (!lift) {
      const snapshot = recall.snapshot();
      if (!snapshot) return;
      lift = createNameLift(rememberedPeople(snapshot), send);
    }
    lift.observe(transcript);
  };
}
