import { afterEach, describe, expect, it, vi } from 'vitest';
const logged = vi.hoisted(() => [] as string[]);
vi.mock('../../../utils/safe-logger.js', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn((_ctx: unknown, msg: string) => logged.push(msg)),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => logger),
  };
  return { createLogger: () => logger };
});

import { createMemoryRecall } from '../../multi-agent/memory-recall-hook.js';
import { formatLedger, type LedgerFact, type LedgerStore } from '../life-ledger.js';
import {
  formatLifeUpdates,
  lifeMovesOnEnabled,
  loadLifeUpdates,
  safeUpdates,
  type LifeUpdate,
  type LifeUpdateStore,
} from '../life-updates.js';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const ON = { LIFE_MOVES_ON: 'on' };

const basil: LedgerFact = {
  personaId: 'ferni',
  fact: 'Ferni spent the weekend trying to revive his dying basil plant',
  saidAt: ago(4),
};
const coffee: LedgerFact = {
  personaId: 'ferni',
  fact: 'Ferni had a second cup of coffee',
  saidAt: ago(4),
};

function updateStore(initial: LifeUpdate[] = []): LifeUpdateStore & { saved: LifeUpdate[] } {
  const saved = [...initial];
  return {
    saved,
    async save(_u, updates) {
      saved.push(...updates);
    },
    async recent(_u, personaId, limit) {
      return saved.filter((u) => u.personaId === personaId).slice(0, limit);
    },
  };
}

const writes = (lines: string[]) => vi.fn(async () => lines);

describe('life moves on', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is off unless LIFE_MOVES_ON=on', () => {
    expect(lifeMovesOnEnabled({})).toBe(false);
    expect(lifeMovesOnEnabled({ LIFE_MOVES_ON: 'off' })).toBe(false);
    expect(lifeMovesOnEnabled(ON)).toBe(true);
  });

  it('writes a development for an ongoing thread told days ago, and keeps it as pending', async () => {
    const store = updateStore();
    const write = writes(["The basil didn't make it; you've started a rosemary instead."]);
    const updates = await loadLifeUpdates('u1', [basil], 'ferni', {
      store,
      write,
      env: ON,
      now: () => NOW,
    });
    expect(updates.map((u) => u.update)).toEqual([
      "The basil didn't make it; you've started a rosemary instead.",
    ]);
    expect(store.saved).toEqual([
      {
        personaId: 'ferni',
        update: "The basil didn't make it; you've started a rosemary instead.",
        createdAt: new Date(NOW).toISOString(),
      },
    ]);
    expect(write).toHaveBeenCalledWith('Ferni', [`- ${basil.fact} (4 days ago)`]);
  });

  it('writes nothing when the flag is off', async () => {
    const store = updateStore();
    const write = writes(['The basil came back.']);
    expect(
      await loadLifeUpdates('u1', [basil], 'ferni', { store, write, now: () => NOW, env: {} })
    ).toEqual([]);
    expect(write).not.toHaveBeenCalled();
    expect(store.saved).toEqual([]);
  });

  it('writes nothing when the ongoing thread was told less than a day ago', async () => {
    const write = writes(['The basil came back.']);
    const fresh = { ...basil, saidAt: ago(0.5) };
    expect(
      await loadLifeUpdates('u1', [fresh], 'ferni', {
        store: updateStore(),
        write,
        env: ON,
        now: () => NOW,
      })
    ).toEqual([]);
    expect(write).not.toHaveBeenCalled();
  });

  it('writes nothing when nothing he told is ongoing', async () => {
    const write = writes(['You had a third cup.']);
    expect(
      await loadLifeUpdates('u1', [coffee], 'ferni', {
        store: updateStore(),
        write,
        env: ON,
        now: () => NOW,
      })
    ).toEqual([]);
    expect(write).not.toHaveBeenCalled();
  });

  it('reuses an unspoken stored update instead of writing a new one', async () => {
    const pending = {
      personaId: 'ferni',
      update: "The basil didn't make it; you've started a rosemary instead.",
      createdAt: ago(2),
    };
    const store = updateStore([pending]);
    const write = writes(['The basil is thriving now.']);
    const updates = await loadLifeUpdates('u1', [basil], 'ferni', {
      store,
      write,
      env: ON,
      now: () => NOW,
    });
    expect(updates).toEqual([pending]);
    expect(write).not.toHaveBeenCalled();
    expect(store.saved).toHaveLength(1);
  });

  it('moves on once he has said the stored update on a later call', async () => {
    const said = {
      personaId: 'ferni',
      update: "The basil didn't make it; you've started a rosemary instead.",
      createdAt: ago(3),
    };
    const told: LedgerFact = {
      personaId: 'ferni',
      fact: "Ferni's basil didn't make it, so he started a rosemary instead",
      saidAt: ago(2),
    };
    const write = writes(['The rosemary has its first new shoots.']);
    const updates = await loadLifeUpdates('u1', [told, basil], 'ferni', {
      store: updateStore([said]),
      write,
      env: ON,
      now: () => NOW,
    });
    expect(updates.map((u) => u.update)).toEqual(['The rosemary has its first new shoots.']);
  });

  it('knows he said it when the ledger paraphrased it (live wording)', async () => {
    const said = {
      personaId: 'ferni',
      update: "The basil didn't make it; you've started a rosemary instead.",
      createdAt: ago(3),
    };
    const paraphrased = (fact: string): LedgerFact => ({
      personaId: 'ferni',
      fact,
      saidAt: ago(2),
    });
    const load = (told: LedgerFact[]) =>
      loadLifeUpdates('u1', [...told, basil], 'ferni', {
        store: updateStore([said]),
        write: writes(['The rosemary has its first new shoots.']),
        env: ON,
        now: () => NOW,
      });
    // Live: these two came back and the basil update still repeated every call.
    expect(
      (
        await load([
          paraphrased("Ferni's basil plant did not survive."),
          paraphrased('Ferni now has a rosemary plant in its place, hoping it is sturdier.'),
        ])
      ).map((u) => u.update)
    ).toEqual(['The rosemary has its first new shoots.']);
    // One shared word is not saying it.
    expect(
      (await load([paraphrased('Ferni bought some fresh basil at the market.')])).map(
        (u) => u.update
      )
    ).toEqual([said.update]);
  });

  it('gives nothing when the model fails', async () => {
    const write = vi.fn(async () => Promise.reject(new Error('quota')));
    expect(
      await loadLifeUpdates('u1', [basil], 'ferni', {
        store: updateStore(),
        write,
        env: ON,
        now: () => NOW,
      })
    ).toEqual([]);
    expect(write).toHaveBeenCalled();
  });

  it('gives nothing when the model is too slow', async () => {
    const store = updateStore();
    const write = vi.fn(
      () =>
        new Promise<string[]>(() => {
          // never settles
        })
    );
    expect(
      await loadLifeUpdates('u1', [basil], 'ferni', {
        store,
        write,
        env: ON,
        now: () => NOW,
        timeoutMs: 20,
      })
    ).toEqual([]);
    expect(store.saved).toEqual([]);
  });

  it('drops heavy or rambling developments and keeps at most two', () => {
    expect(
      safeUpdates([
        '- Your dog died last week.',
        'You ended up in the hospital for a day.',
        'You booked the Hokkaido flights after all.',
        "You're halfway through the book.",
        'The basil came back.',
        'NONE',
      ])
    ).toEqual(['You booked the Hokkaido flights after all.', "You're halfway through the book."]);
  });

  it('logs why nothing was written, so a quiet call is not a mystery', async () => {
    logged.length = 0;
    const write = writes(["The basil didn't make it."]);
    await loadLifeUpdates('u1', [coffee], 'ferni', {
      store: updateStore(),
      write,
      now: () => NOW,
      env: ON,
    });
    expect(logged).toContain('LIFE_UPDATES_SKIPPED');
    expect(logged).not.toContain('LIFE_UPDATES_WRITTEN');
  });

  it('formats a separate line to mention only if it comes up', () => {
    expect(formatLifeUpdates([])).toBeNull();
    const note = formatLifeUpdates([
      { personaId: 'ferni', update: 'You booked the Hokkaido flights.', createdAt: ago(0) },
    ]);
    expect(note).toBe(
      "[SINCE YOU LAST TALKED]\n- You booked the Hokkaido flights.\nOnly if they ask how you've been, and one at a time. When they're telling you about their own day, stay with them; don't bring these up."
    );
  });

  describe('in the first recall note', () => {
    const ledgerStore: LedgerStore = {
      save: async () => undefined,
      recent: async () => [{ ...basil, saidAt: new Date(Date.now() - 4 * DAY).toISOString() }],
    };
    const recallFor = (store: LifeUpdateStore, write: ReturnType<typeof writes>) =>
      createMemoryRecall({
        userId: 'u1',
        userName: 'Sam',
        store: { facts: async () => [], summaries: async () => [] },
        ledgerStore,
        lifeUpdates: { store, write },
      });

    it('leaves the ledger note exactly as it was with the flag off', async () => {
      vi.stubEnv('LIFE_MOVES_ON', 'off');
      const write = writes(['You booked the Hokkaido flights.']);
      const recall = recallFor(updateStore(), write);
      await recall.ready;
      expect(recall.noteFor('hey, how are you')).toBe(
        formatLedger(await ledgerStore.recent('u1', 'ferni', 10), 'Sam')
      );
      expect(write).not.toHaveBeenCalled();
    });

    it('adds what has happened since with the flag on, once', async () => {
      vi.stubEnv('LIFE_MOVES_ON', 'on');
      const recall = recallFor(
        updateStore(),
        writes(["The basil didn't make it; you've started a rosemary."])
      );
      await recall.ready;
      const note = recall.noteFor('hey, how are you');
      expect(note).toContain("WHAT YOU'VE TOLD SAM ABOUT YOUR OWN LIFE");
      expect(note).toContain(
        "[SINCE YOU LAST TALKED]\n- The basil didn't make it; you've started a rosemary."
      );
      recall.newTurn();
      expect(recall.noteFor('what are you up to')).toBeNull();
    });
  });
});
