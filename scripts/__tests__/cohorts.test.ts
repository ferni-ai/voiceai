/**
 * The cohort CLI's pure parts (argument checks, the flag allowlist, dry-run
 * output) against a fake store: no Firebase, nothing written anywhere.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
const { parseArgs, planWrites, run } = await import('../cohorts.js');
import type { AdminStore, CohortDoc, Write } from '../cohorts.js';

const NOW = '2026-10-17T12:00:00.000Z';
const SETH_EMAIL = 'seth@example.test';

function fakeStore(cohorts: Record<string, CohortDoc> = {}): AdminStore & { writes: Write[] } {
  const writes: Write[] = [];
  const list = () => Object.entries(cohorts).map(([id, c]) => ({ id, ...c }));
  return {
    writes,
    listCohorts: async () => list(),
    getCohort: async (id) => cohorts[id] ?? null,
    cohortsWith: async (uid) => list().filter((c) => c.members?.includes(uid)),
    overrides: async (uid): Promise<Record<string, string>> =>
      uid === 'uid-seth' ? { CANDOR: 'off' } : {},
    uidForEmail: async (email) => (email === SETH_EMAIL ? 'uid-seth' : null),
    apply: async (w) => void writes.push(w),
  };
}

async function cli(argv: string[], store = fakeStore()) {
  const lines: string[] = [];
  const stores: string[] = [];
  const code = await run(argv, {
    store: async (project) => (stores.push(project), store),
    out: (l) => lines.push(l),
    now: () => NOW,
  });
  return { code, lines, stores, writes: store.writes };
}

describe('argument checks', () => {
  it('rejects unknown commands and options, and options without values', () => {
    expect(() => parseArgs(['nuke'])).toThrow(/unknown command/);
    expect(() => parseArgs(['enable', 'seth', '--force'])).toThrow(/unknown option/);
    expect(() => parseArgs(['add-member', 'seth', '--uid'])).toThrow(/needs a value/);
  });

  it('writes only with --apply AND an explicit --project; reads need --project', () => {
    expect(() => parseArgs(['enable', 'seth', '--apply'])).toThrow(/--apply needs --project/);
    expect(parseArgs(['enable', 'seth']).apply).toBe(false);
    expect(() => parseArgs(['list'])).toThrow(/give --project/);
    expect(parseArgs(['list', '--project', 'p1']).project).toBe('p1');
  });

  it('cohort ids are kebab-case audiences; everyone-else is implicit, never a cohort', () => {
    const plan = (id: string) => planWrites(parseArgs(['create', id, '--description', 'x']), undefined, NOW); // prettier-ignore
    expect(plan('beta-waitlist-2026-10')[0]?.doc).toBe('beta-waitlist-2026-10');
    expect(() => plan('Friends_And_Family')).toThrow(/kebab-case/);
    expect(() => plan('everyone-else')).toThrow(/agent's defaults/);
    expect(() => planWrites(parseArgs(['create', 'seth']), undefined, NOW)).toThrow(
      /--description/
    );
  });

  it('flags must be in COHORT_FLAGS with an on/off value', () => {
    const plan = (...a: string[]) =>
      planWrites(parseArgs(['set-flag', 'seth', ...a]), undefined, NOW);
    expect(plan('CANDOR', 'on')[0]?.fields).toEqual({ 'flags.CANDOR': 'on', updatedAt: NOW });
    expect(() => plan('OPENAI_API_KEY', 'on')).toThrow(/not a cohort flag/);
    expect(() => plan('COHORT_FLAGS', 'off')).toThrow(/not a cohort flag/);
    expect(() => plan('CANDOR', 'yes')).toThrow(/on or off/);
    expect(() => planWrites(parseArgs(['override', 'CANDOR', 'on']), undefined, NOW)).toThrow(/--uid/); // prettier-ignore
  });

  it('TURN_LENGTH and TURN_TEXTURE take learned or off; the switches never take learned', () => {
    const plan = (...a: string[]) =>
      planWrites(parseArgs(['set-flag', 'seth', ...a]), undefined, NOW);
    expect(plan('TURN_LENGTH', 'learned')[0]?.fields).toEqual({ 'flags.TURN_LENGTH': 'learned', updatedAt: NOW }); // prettier-ignore
    expect(plan('TURN_TEXTURE', 'off')[0]?.fields).toEqual({ 'flags.TURN_TEXTURE': 'off', updatedAt: NOW }); // prettier-ignore
    expect(() => plan('TURN_LENGTH', 'on')).toThrow(/TURN_LENGTH must be learned or off/);
    expect(() => plan('PERSONA_VOICE', 'learned')).toThrow(/PERSONA_VOICE must be on or off/);
    const o = planWrites(parseArgs(['override', 'TURN_TEXTURE', 'learned']), 'voice-eval-x', NOW); // prettier-ignore
    expect(o[0]?.fields).toEqual({ flags: { TURN_TEXTURE: 'learned' }, updatedAt: NOW });
  });
});

describe('override names the person, then the flag and its value', () => {
  // 2026-10-17: run() took the uid off positional[] and planWrites then read the flag from
  // positional[1] (the value), so `override <uid> FLAG on` always failed "on: not a cohort flag".
  it('override <uid> FLAG on', async () => {
    const r = await cli(['override', 'uid-1', 'PROACTIVE_CHANNELS', 'on', '--project', 'p1']);
    expect(r.code).toBe(0);
    expect(r.lines.join('\n')).toContain('feature_flag_overrides/uid-1 {"flags":{"PROACTIVE_CHANNELS":"on"}');
  });

  it('override FLAG on --uid <uid>', async () => {
    const r = await cli(['override', 'PROACTIVE_CHANNELS', 'off', '--uid', 'uid-1', '--project', 'p1']);
    expect(r.code).toBe(0);
    expect(r.lines.join('\n')).toContain('feature_flag_overrides/uid-1 {"flags":{"PROACTIVE_CHANNELS":"off"}');
  });

  it('clear-override <uid> FLAG', async () => {
    const r = await cli(['clear-override', 'uid-1', 'PROACTIVE_CHANNELS', '--project', 'p1']);
    expect(r.code).toBe(0);
    expect(r.lines.join('\n')).toContain('feature_flag_overrides/uid-1');
    expect(r.lines.join('\n')).toContain('PROACTIVE_CHANNELS');
  });
});

describe('dry run (the default)', () => {
  it('prints the intended writes and writes nothing, even with --project', async () => {
    const r = await cli(['set-flag', 'seth', 'CANDOR', 'on', '--project', 'p1']);
    expect(r.writes).toEqual([]);
    expect(r.lines).toEqual([
      `DRY RUN, would update feature_cohorts/seth {"flags.CANDOR":"on","updatedAt":"${NOW}"}`,
      'Nothing written. Add --apply --project <id> to write.',
    ]);
  });

  it('needs no project at all for a write it only prints', async () => {
    const r = await cli(['create', 'seth', '--description', 'Seth only, first look']);
    expect(r.stores).toEqual([]);
    expect(r.lines[0]).toContain('would create feature_cohorts/seth');
    expect(r.lines[0]).toContain('"members":[]');
  });

  it('resolves --email to a uid and prints only that email and the uid', async () => {
    const r = await cli(['add-member', 'seth', '--email', SETH_EMAIL, '--project', 'p1']);
    expect(r.lines).toEqual([
      `${SETH_EMAIL} -> uid uid-seth`,
      `DRY RUN, would update feature_cohorts/seth {"updatedAt":"${NOW}"} members += [uid-seth]`,
      'Nothing written. Add --apply --project <id> to write.',
    ]);
    await expect(cli(['add-member', 'seth', '--email', 'nobody@example.test', '--project', 'p1'])).rejects.toThrow(/no account/); // prettier-ignore
    await expect(cli(['add-member', 'seth', '--email', SETH_EMAIL])).rejects.toThrow(/--project/);
  });
});

describe('--apply', () => {
  it('writes to the project named, and only then', async () => {
    const r = await cli(['disable', 'friends-and-family', '--project', 'p1', '--apply']);
    expect(r.stores).toEqual(['p1']);
    expect(r.writes).toEqual([
      { collection: 'feature_cohorts', doc: 'friends-and-family', kind: 'update', fields: { enabled: false, updatedAt: NOW } }, // prettier-ignore
    ]);
    expect(r.lines[0]).toMatch(/^wrote: update feature_cohorts\/friends-and-family/);
  });
});

describe('reads', () => {
  const cohorts = {
    seth: {
      description: 'Seth only',
      enabled: true,
      members: ['uid-seth'],
      flags: { CANDOR: 'on' },
    },
    'friends-and-family': { enabled: false, members: ['uid-seth', 'uid-mom'], flags: { RECALL_PEOPLE: 'on' } }, // prettier-ignore
  };

  it('list shows member counts, not members; show lists uids', async () => {
    const list = await cli(['list', '--project', 'p1'], fakeStore(cohorts));
    expect(list.lines.join('\n')).toContain('members: 2');
    expect(list.lines.join('\n')).not.toContain('uid-mom');
    const show = await cli(['show', 'friends-and-family', '--project', 'p1'], fakeStore(cohorts));
    expect(show.lines).toContain('  members: uid-seth, uid-mom');
  });

  it("who: the person's cohorts, overrides, and the flags their call gets", async () => {
    const r = await cli(['who', SETH_EMAIL, '--project', 'p1'], fakeStore(cohorts));
    expect(r.lines).toEqual([
      `${SETH_EMAIL} -> uid uid-seth`,
      'cohorts:   friends-and-family (disabled), seth',
      'overrides: {"CANDOR":"off"}',
      'flags:     {"CANDOR":"off"} (with COHORT_FLAGS=on; else agent defaults)',
    ]);
    expect(r.writes).toEqual([]);
  });
});

describe('sampled cohorts and prerequisites', () => {
  it('percent sets a whole-number sample, and 0 goes back to members only', () => {
    const plan = (n: string) => planWrites(parseArgs(['percent', 'memory-recall', n]), undefined, NOW); // prettier-ignore
    expect(plan('5')[0]?.fields).toEqual({ percent: 5, updatedAt: NOW });
    expect(plan('0')[0]?.deleteFields).toEqual(['percent']);
    for (const bad of ['101', '-1', '2.5', 'x']) expect(() => plan(bad)).toThrow(/0-100/);
  });

  it('warns when a memory switch goes on without what it builds on', async () => {
    const store = fakeStore({ 'memory-recall': { enabled: true, members: [], flags: {} } });
    const r = await cli(['set-flag', 'memory-recall', 'RECALL_EPISODES', 'on', '--project', 'p1'], store); // prettier-ignore
    expect(r.lines).toContain('warning: RECALL_EPISODES needs SEMANTIC_RECALL (in this cohort or on the agent)'); // prettier-ignore
  });

  it("who counts a cohort's sample: at 100% everyone is in", async () => {
    const store = fakeStore({ everyone: { enabled: true, members: [], percent: 100, flags: { SEMANTIC_RECALL: 'on' } } }); // prettier-ignore
    const r = await cli(['who', 'uid-mom', '--project', 'p1'], store);
    expect(r.lines).toContain('flags:     {"SEMANTIC_RECALL":"on"} (with COHORT_FLAGS=on; else agent defaults)'); // prettier-ignore
  });
});
