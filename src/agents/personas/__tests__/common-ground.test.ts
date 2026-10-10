import { describe, expect, it, vi } from 'vitest';
import {
  commonGroundEnabled,
  EMPTY_GROUND,
  formatCommonGround,
  GROUND_NOTE_MAX_CHARS,
  guardReading,
  mergeGround,
  type CallTurn,
  type CommonGround,
} from '../common-ground.js';
import { updateCommonGroundAfterCall, type GroundStore } from '../common-ground-after-call.js';

/** Call 1: the caller's boss becomes "the spreadsheet goblin", and Ferni gives advice. */
const CALL_1: CallTurn[] = [
  { role: 'user', content: 'My boss reorganized every spreadsheet again. He is a spreadsheet goblin.' },
  { role: 'assistant', content: 'Ha, the spreadsheet goblin strikes. What did he do this time?' },
  { role: 'user', content: 'Renamed every tab. The spreadsheet goblin never sleeps.' },
  {
    role: 'assistant',
    content: "Honestly I'd keep a two-minute log of what changed each morning, so it never ambushes you.",
  },
];

const READING = JSON.stringify({
  told: [
    { kind: 'advice', text: 'Ferni suggested a two-minute morning log of what changed' },
    { kind: 'advice', text: 'Ferni recommended asking for a raise' }, // never said
    { kind: 'story', text: 'Ferni once worked in a bakery' }, // not this module's
  ],
  references: [
    { phrase: 'the spreadsheet goblin', meaning: 'their boss, who keeps reorganizing spreadsheets' },
    { phrase: 'tab apocalypse', meaning: 'the renaming' }, // nobody said it
    { phrase: 'renamed every tab', meaning: 'what the boss did' }, // only the caller said it
    { phrase: 'two-minute log', meaning: 'the advice' }, // only Ferni said it
  ],
});

function memoryStore(): GroundStore & { saved: CommonGround[] } {
  const saved: CommonGround[] = [];
  return {
    saved,
    async load() {
      return saved.at(-1) ?? EMPTY_GROUND;
    },
    async save(_u, g) {
      saved.push(g);
    },
  };
}

const ON = { COMMON_GROUND: 'on' };

describe('common ground across two calls, through the after-call writer', () => {
  it("keeps only what both of them shared, and puts it in call 2's note", async () => {
    const store = memoryStore();
    const known: CommonGround[] = [];
    const read = vi.fn(async (_t: string, k: CommonGround) => {
      known.push(k);
      return READING;
    });
    const at = new Date('2026-10-10T18:00:00Z');
    const saved = await updateCommonGroundAfterCall({ userId: 'u', turns: CALL_1, at }, { store, read, env: ON });
    expect(saved?.told.map((t) => t.text)).toEqual(['Ferni suggested a two-minute morning log of what changed']);
    expect(saved?.references.map((r) => r.phrase)).toEqual(['the spreadsheet goblin']);

    // Call 2 hands the reader what is already known, and a repeat only moves the date.
    const later = new Date('2026-10-12T18:00:00Z');
    const again = await updateCommonGroundAfterCall({ userId: 'u', turns: CALL_1, at: later }, { store, read, env: ON });
    expect(known[1].references[0].phrase).toBe('the spreadsheet goblin');
    expect(again?.references).toHaveLength(1);
    expect(again?.references[0]).toMatchObject({ firstAt: at.toISOString(), lastAt: later.toISOString() });

    const note = formatCommonGround(store.saved.at(-1) ?? EMPTY_GROUND, 'Sam');
    expect(note).toContain('"the spreadsheet goblin" = their boss');
    expect(note).toContain('advice: Ferni suggested a two-minute morning log');
    expect(note).toContain('never tell it as new');
  });

  it('does nothing with the flag off: no read, no write', async () => {
    const store = memoryStore();
    const read = vi.fn(async () => READING);
    expect(await updateCommonGroundAfterCall({ userId: 'u', turns: CALL_1 }, { store, read, env: {} })).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(store.saved).toEqual([]);
    expect(commonGroundEnabled({})).toBe(false);
  });

  it('skips a call where the caller barely spoke, and never throws', async () => {
    const store = memoryStore();
    const read = vi.fn(async () => READING);
    const short = CALL_1.slice(0, 2);
    expect(await updateCommonGroundAfterCall({ userId: 'u', turns: short }, { store, read, env: ON })).toBeNull();
    expect(read).not.toHaveBeenCalled();
    const broken = async () => {
      throw new Error('model down');
    };
    expect(await updateCommonGroundAfterCall({ userId: 'u', turns: CALL_1 }, { store, read: broken, env: ON })).toBeNull();
    expect(await updateCommonGroundAfterCall({ userId: 'u', turns: CALL_1 }, { store, read: async () => 'not json', env: ON })).toBeNull();
    expect(store.saved).toEqual([]);
  });
});

describe('guardReading', () => {
  it('needs both of them to have said a reference', () => {
    const r = guardReading(
      { told: [], references: [{ phrase: 'spreadsheet goblin', meaning: 'the boss' }] },
      CALL_1.filter((t) => t.role === 'user')
    );
    expect(r.references).toEqual([]);
  });
});

describe('mergeGround', () => {
  it("doesn't change the ground it was given", () => {
    const g: CommonGround = {
      told: [{ kind: 'advice', text: 'x y z', firstAt: '1', lastAt: '1' }],
      references: [],
    };
    mergeGround(g, { told: [{ kind: 'advice', text: 'x y z' }], references: [] }, '2');
    expect(g.told[0].lastAt).toBe('1');
  });
});

describe('formatCommonGround', () => {
  it('stays under its size cap however much there is, shorthand first', () => {
    const many: CommonGround = {
      references: Array.from({ length: 15 }, (_, i) => ({
        phrase: `the thing number ${i}`,
        meaning: 'something the two of them always say about work',
        firstAt: '1',
        lastAt: '1',
      })),
      told: Array.from({ length: 30 }, (_, i) => ({
        kind: 'opinion' as const,
        text: `Ferni thinks opinion number ${i} is right`,
        firstAt: '1',
        lastAt: '1',
      })),
    };
    const note = formatCommonGround(many, 'Sam') ?? '';
    expect(note.length).toBeLessThanOrEqual(GROUND_NOTE_MAX_CHARS);
    expect(note).toContain('the thing number 0');
    expect(formatCommonGround(EMPTY_GROUND)).toBeNull();
  });
});
