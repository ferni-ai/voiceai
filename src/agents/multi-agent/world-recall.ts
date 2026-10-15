/**
 * The world model in live recall (WORLD_MODEL_SNAPSHOT=on), kept out of
 * memory-recall-hook.ts so that file only calls it.
 *
 * Who is in the caller's life, what they are working toward and what not to
 * bring up come once a call, in one note (world-model/recall-note.ts). Once
 * it is loaded:
 * - per-turn facts that only restate it are left out (pool);
 * - no line of any recall note touches a topic they asked not to bring up,
 *   whichever part of recall wrote it: facts, threads, common ground, call
 *   summaries, episodes, his own stories (screen);
 * - its note is the single source for who is who, so RECALL_PEOPLE's note is
 *   not shown beside it (the pets line still is). If the world model is empty
 *   or fails to load, RECALL_PEOPLE's note is shown as before.
 * Until it has loaded (flag on), recall adds nothing (`loading`): a note then
 * could hold a topic to avoid, and the world note joins the first note after
 * it loads. Past WORLD_WAIT_MS it stops waiting: recall goes on as with the
 * flag off (RECALL_PEOPLE's note included), and a late snapshot is ignored.
 * Off, recall is exactly what it was.
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

/** How long recall waits for the world model before going on without it. */
export const WORLD_WAIT_MS = 3000;

export type LoadWorldModel = (userId: string) => Promise<WorldModelSnapshot>;

/** For createMemoryRecall's `world` dep; both default to the real snapshot and process.env. */
export interface WorldRecallDeps {
  load?: LoadWorldModel;
  env?: Record<string, string | undefined>;
}

export interface WorldRecall {
  /** Settles once the snapshot is loaded (or failed, timed out, or the flag is off). Never rejects. */
  ready: Promise<void>;
  /** Flag on and still loading: recall adds nothing yet (and uses nothing up). */
  readonly loading: boolean;
  /** The facts per-turn recall may pick from: the snapshot without what the note already says. */
  pool(snapshot: RecallSnapshot): RecallSnapshot;
  /** False for a thread or inside joke about a topic they asked not to bring up. */
  keep(text: string): boolean;
  /** The world note, once a call, with the first note after it loads; else null. */
  note(): string | null;
  /** Who is who, once a call: RECALL_PEOPLE's note, or only its pets line beside a world note. */
  whoIsWho(facts: readonly RecallFact[], enabled?: boolean): string | null;
  /**
   * The assembled note without any listed item ("- ...") about a topic to
   * avoid. Guidance and headings stay; a heading or block left with no items goes.
   */
  screen(note: string): string | null;
}

export function createWorldRecall(userId: string, deps: WorldRecallDeps = {}): WorldRecall {
  const { load = (id: string) => buildWorldModelSnapshot({ userId: id }), env = process.env } =
    deps;
  const on = isWorldModelSnapshotOn(env);
  let pending = on;
  let world: { snapshot: WorldModelSnapshot; note: string; counts: object } | null = null;
  let noteGiven = false;
  let peopleGiven = false;
  let pooled: { from: RecallSnapshot; to: RecallSnapshot } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<void>((resolve) => {
    if (!on) return;
    timer = setTimeout(() => {
      log.warn({ userId }, 'WORLD_MODEL_LATE');
      resolve();
    }, WORLD_WAIT_MS);
  });
  const loaded = on
    ? load(userId)
        .then((snap) => {
          if (!pending) return; // came after recall stopped waiting
          const formatted = formatWorldNote(snap);
          if (formatted) world = { snapshot: snap, ...formatted };
          else log.info({ userId }, 'WORLD_MODEL_EMPTY');
        })
        .catch((error: unknown) => log.warn({ error: String(error) }, 'World model not loaded'))
    : Promise.resolve();
  const ready = (on ? Promise.race([loaded, late]) : loaded).finally(() => {
    pending = false;
    clearTimeout(timer);
  });
  const avoided = (text: string) => world !== null && touchesAvoided(text, world.snapshot);
  return {
    ready,
    get loading() {
      return pending;
    },
    pool(snapshot) {
      if (!world) return snapshot;
      if (pooled?.from !== snapshot) {
        const facts = withoutWorldDuplicates(snapshot.facts, world.snapshot);
        pooled = { from: snapshot, to: { ...snapshot, facts } };
      }
      return pooled.to;
    },
    keep: (text) => !avoided(text),
    note() {
      if (!world || noteGiven) return null;
      noteGiven = true;
      log.info({ ...world.counts, chars: world.note.length }, 'WORLD_MODEL_INJECTED');
      return world.note;
    },
    whoIsWho(facts, enabled) {
      if (peopleGiven || pending || !(enabled ?? recallPeopleEnabled())) return null;
      peopleGiven = true;
      const pets = formatPets(petsOf([...facts]));
      return world ? pets : formatPeople(peopleOf([...facts]), pets);
    },
    screen(note) {
      if (pending) return null;
      if (!world) return note || null;
      const blocks = note.split('\n\n').flatMap((block) => {
        if (block === world?.note) return [block];
        const lines = block.split('\n');
        const item = (line: string) => line.startsWith('- ');
        const kept = lines.filter((line, i) => {
          if (item(line)) return !avoided(line);
          // A heading whose items all went goes with them.
          const own = lines.slice(i + 1).findIndex((l) => !item(l));
          const items = lines.slice(i + 1, own < 0 ? undefined : i + 1 + own);
          return items.length === 0 || items.some((l) => !avoided(l));
        });
        const hadItems = lines.some(item);
        return hadItems && !kept.some(item) ? [] : [kept.join('\n')];
      });
      return blocks.join('\n\n') || null;
    },
  };
}
