/**
 * The world model in live recall (WORLD_MODEL_SNAPSHOT=on), kept out of
 * memory-recall-hook.ts so that file only calls it.
 *
 * Who is in the caller's life, what they are working toward and what not to
 * bring up come once a call, in one note (world-model/recall-note.ts). It is
 * then the single source for those:
 * - per-turn facts that only restate it, or touch a topic to avoid, are left out;
 * - open threads and inside jokes about a topic to avoid are left out;
 * - RECALL_PEOPLE's who-is-who note is not shown (two overlapping people notes),
 *   so this module decides which who-is-who note a call gets.
 * Off, recall is exactly what it was, RECALL_PEOPLE's note included.
 *
 * @module agents/multi-agent/world-recall
 */
import {
  formatWorldNote,
  isWorldModelSnapshotOn,
  touchesAvoided,
  withoutWorldDuplicates,
} from '../../intelligence/world-model/recall-note.js';
import { buildWorldModelSnapshot } from '../../intelligence/world-model/snapshot.js';
import type { WorldModelSnapshot } from '../../intelligence/world-model/types.js';
import { formatPeople, peopleOf, recallPeopleEnabled } from '../../memory/recall/people.js';
import { formatPets, petsOf } from '../../memory/recall/pets.js';
import type { RecallFact, RecallSnapshot } from '../../memory/recall/session-recall.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'MemoryRecall' });

export type LoadWorldModel = (userId: string) => Promise<WorldModelSnapshot>;

/** For createMemoryRecall's `world` dep; both default to the real snapshot and process.env. */
export interface WorldRecallDeps {
  load?: LoadWorldModel;
  env?: Record<string, string | undefined>;
}

export interface WorldRecall {
  /** WORLD_MODEL_SNAPSHOT is on: the world model owns who-is-who, so RECALL_PEOPLE stays quiet. */
  readonly on: boolean;
  /** Settles once the snapshot is loaded (or failed, or the flag is off). Never rejects. */
  ready: Promise<void>;
  /** The facts per-turn recall may pick from: the snapshot without what the note already says. */
  pool(snapshot: RecallSnapshot): RecallSnapshot;
  /** False for a thread or inside joke about a topic they asked not to bring up. */
  keep(text: string): boolean;
  /** The world note with the call's first note, then null. */
  note(firstNote: boolean): string | null;
  /**
   * RECALL_PEOPLE's who-is-who note (people.ts, pets.ts), or null: with the
   * world model on, its note is the single source for who is who.
   */
  whoIsWho(facts: readonly RecallFact[], enabled?: boolean): string | null;
}

export function createWorldRecall(userId: string, deps: WorldRecallDeps = {}): WorldRecall {
  const { load = (id: string) => buildWorldModelSnapshot({ userId: id }), env = process.env } =
    deps;
  const on = isWorldModelSnapshotOn(env);
  let world: { snapshot: WorldModelSnapshot; note: string; counts: object } | null = null;
  let offered = false;
  let pooled: { from: RecallSnapshot; to: RecallSnapshot } | undefined;
  const ready = on
    ? load(userId)
        .then((snap) => {
          const formatted = formatWorldNote(snap);
          if (formatted) world = { snapshot: snap, ...formatted };
          else log.info({ userId }, 'WORLD_MODEL_EMPTY');
        })
        .catch((error: unknown) => log.warn({ error: String(error) }, 'World model not loaded'))
    : Promise.resolve();
  return {
    on,
    ready,
    pool(snapshot) {
      if (!world) return snapshot;
      if (pooled?.from !== snapshot) {
        const facts = withoutWorldDuplicates(snapshot.facts, world.snapshot);
        pooled = { from: snapshot, to: { ...snapshot, facts } };
      }
      return pooled.to;
    },
    keep: (text) => !world || !touchesAvoided(text, world.snapshot),
    note(firstNote) {
      if (!world || offered || !firstNote) return null;
      offered = true;
      log.info({ ...world.counts, chars: world.note.length }, 'WORLD_MODEL_INJECTED');
      return world.note;
    },
    whoIsWho(facts, enabled) {
      if (on || !(enabled ?? recallPeopleEnabled())) return null;
      return formatPeople(peopleOf([...facts]), formatPets(petsOf([...facts])));
    },
  };
}
