/**
 * RECALL_BRIDGE: open threads from earlier calls wait for a turn they fit and
 * come with a bridge; Ferni's own life waits until it connects.
 *
 * The case is the dev call of 2026-10-11: greeting "Hey Seth, still feeling
 * that quiet Sunday vibe?", caller "Still on there.", and Ferni answered with
 * the caller's mail pile and then his own.
 */
import { describe, expect, it } from 'vitest';
import { createMemoryRecall } from '../memory-recall-hook.js';
import {
  formatRecall,
  onlySmallTalk,
  recallBridgeEnabled,
  THREAD_BRIDGE,
  threadsForTurn,
} from '../../../memory/recall/session-recall.js';
import { formatLedger, type LedgerFact, type LedgerStore } from '../../personas/life-ledger.js';

const MAIL = "the pile of mail he's been avoiding";
const SISTER = "his sister's visit next weekend";
const store = {
  facts: async () => [],
  summaries: async () => [{ callerProvenance: 1, followUpItems: [MAIL, SISTER] }],
};
const OWN_MAIL: LedgerFact = {
  personaId: 'ferni',
  fact: "Ferni's own mail pile has been sitting on the counter",
  saidAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
};
const ledgerStore: LedgerStore = {
  async save() {},
  async recent(_u, personaId) {
    return personaId === 'ferni' ? [OWN_MAIL] : [];
  },
};

async function recall(bridge: boolean) {
  const r = createMemoryRecall({ userId: 'u1', userName: 'Seth', store, ledgerStore, bridge });
  await r.ready;
  return r;
}

describe('RECALL_BRIDGE flag', () => {
  it('is off by default and on with RECALL_BRIDGE=on', () => {
    expect(recallBridgeEnabled({})).toBe(false);
    expect(recallBridgeEnabled({ RECALL_BRIDGE: 'on' })).toBe(true);
  });
});

describe('createMemoryRecall with RECALL_BRIDGE off (unchanged)', () => {
  it('puts the open threads and his life in the first note, whatever the caller said', async () => {
    const r = await recall(false);
    const first = r.noteFor('Still on there.');
    expect(first).toContain(`- ${MAIL}`);
    expect(first).toContain('Open threads from last time:');
    expect(first).not.toContain(THREAD_BRIDGE);
    expect(first).toContain('pick a thread back up');
    r.newTurn();
    expect(
      r.noteFor('Yeah, just trying to get through some chores I have been putting off.')
    ).toBeNull();
  });
});

describe('createMemoryRecall with RECALL_BRIDGE on', () => {
  it('brings neither the threads nor his life on a short first turn', async () => {
    const r = await recall(true);
    // Read as "his mail is still on the counter" when his life came with it.
    expect(r.noteFor('Still on there.')).toBeNull();
    expect(r.noteFor('Still on there')).toBeNull();
  });

  it('offers threads (with the bridge) and his life on the next substantive turn, each once', async () => {
    const r = await recall(true);
    expect(r.noteFor('Still on there.')).toBeNull();
    r.newTurn();
    const second = r.noteFor(
      'Yeah, just trying to get through some chores I have been putting off.'
    );
    expect(second).toContain(`- ${MAIL}`);
    expect(second).toContain(`- ${SISTER}`);
    expect(second).toContain('Open threads from earlier calls:');
    expect(second).toContain(THREAD_BRIDGE);
    expect(second).toContain(OWN_MAIL.fact);
    expect(second).toContain("Don't volunteer any of them");
    expect(second).not.toContain('pick a thread back up');
    r.newTurn();
    expect(r.noteFor('Anyway, what is new with you these days?')).toBeNull();
  });

  it('brings his life at once when they ask about him, and never twice', async () => {
    const r = await recall(true);
    const first = r.noteFor('Hey, how are you?');
    expect(first).toContain(OWN_MAIL.fact);
    expect(first).not.toContain(MAIL);
    r.newTurn();
    const second = r.noteFor(
      'Yeah, just trying to get through some chores I have been putting off.'
    );
    expect(second).toContain(`- ${MAIL}`);
    expect(second).not.toContain(OWN_MAIL.fact);
  });

  it('surfaces a thread the short first turn is about straight away, and the rest later', async () => {
    const r = await recall(true);
    const first = r.noteFor('Ugh, the mail.');
    expect(first).toContain(`- ${MAIL}`);
    expect(first).not.toContain(SISTER);
    expect(first).toContain(THREAD_BRIDGE);
    r.newTurn();
    const second = r.noteFor('Honestly it has been a long weekend over here.');
    expect(second).toContain(`- ${SISTER}`);
    expect(second).not.toContain(MAIL);
  });

  it('lets the threads in on the third caller turn at the latest', async () => {
    const r = await recall(true);
    expect(r.noteFor('Still on there.')).toBeNull();
    r.newTurn();
    expect(r.noteFor('Yeah.')).toBeNull();
    r.newTurn();
    expect(r.noteFor('Mhm.')).toContain(`- ${MAIL}`);
  });

  it('lets them in when the caller asks an open question', async () => {
    const r = await recall(true);
    expect(r.noteFor('Hey hey.')).toBeNull();
    r.newTurn();
    expect(r.noteFor("What's new?")).toContain(`- ${MAIL}`);
  });
});

describe('threadsForTurn', () => {
  it('holds every thread for a greeting or a short check-in with nothing in common', () => {
    expect(threadsForTurn([MAIL, SISTER], 'Still on there.', 1)).toEqual([]);
    expect(threadsForTurn([MAIL, SISTER], 'Hey Ferni, how are you doing today?', 1)).toEqual([]);
  });

  it('lets them all through for a substantive turn, an open question, or turn 3', () => {
    expect(
      threadsForTurn([MAIL, SISTER], 'I finally sorted out the garage this morning', 1)
    ).toEqual([MAIL, SISTER]);
    expect(threadsForTurn([MAIL, SISTER], 'So what is new?', 2)).toEqual([MAIL, SISTER]);
    expect(threadsForTurn([MAIL, SISTER], 'Yeah.', 3)).toEqual([MAIL, SISTER]);
  });

  it('lets only the matching thread through a short turn about it', () => {
    expect(threadsForTurn([MAIL, SISTER], 'My sister, man.', 1)).toEqual([SISTER]);
  });

  it('treats four words or fewer, or only greeting words, as small talk', () => {
    expect(onlySmallTalk('Still on there.')).toBe(true);
    expect(onlySmallTalk("Hey Ferni, how's it going today?")).toBe(true);
    expect(onlySmallTalk('Just trying to get through some chores')).toBe(false);
  });
});

describe('formatRecall and formatLedger wording', () => {
  it('says how to bring a thread up only with the bridge', () => {
    const off = formatRecall([], [MAIL], 'Seth');
    const on = formatRecall([], [MAIL], 'Seth', Date.now(), { bridge: true });
    expect(off).not.toContain(THREAD_BRIDGE);
    expect(on).toContain(THREAD_BRIDGE);
    expect(on).toMatch(/Answer what they just said first/);
    expect(on).toMatch(/clearly from last time/);
    expect(on).toMatch(/never in the same breath as something about your own life/);
  });

  it('changes the ledger footer only with the bridge', () => {
    const off = formatLedger([OWN_MAIL], 'Seth');
    const on = formatLedger([OWN_MAIL], 'Seth', Date.now(), { bridge: true });
    expect(off).toContain('pick a thread back up');
    expect(on).not.toContain('pick a thread back up');
    expect(on).toContain('mention one only when they ask about you');
    expect(on).toContain(OWN_MAIL.fact);
  });
});
