/**
 * scripts/waitlist-wave.ts: wave 0 is a dry run by default and writes nothing;
 * with --apply it marks signed-in people joined (tier untouched) and gives
 * pending people a seat, one entry per inbox.
 */
import { describe, expect, it } from 'vitest';
import { parseArgs, run, type RunDeps } from '../waitlist-wave.js';
import type { WaveZeroReader } from '../../src/services/waitlist/wave-zero.js';

const id = (e: string) => Buffer.from(e).toString('base64').replace(/[/+=]/g, '_');
const NOW = new Date('2026-10-20T16:00:00Z');
const ARGS = ['--project', 'test-project', '--wave', '0', '--include', 'signed-in,pending,friends-and-family']; // prettier-ignore

function world() {
  const waitlist = new Map<string, Record<string, unknown>>([
    [id('pending@example.com'), { email: 'pending@example.com', status: 'pending' }],
    [id('j.doe@gmail.com'), { email: 'j.doe@gmail.com', status: 'pending' }], // also signed in, as jdoe@
    [id('nostatus@example.com'), { email: 'nostatus@example.com' }],
    [id('old@example.com'), { email: 'old@example.com', status: 'approved' }],
  ]);
  const profiles = new Map<string, Record<string, unknown>>([
    [id('member@example.com'), { subscription: { tier: 'partner', status: 'active' } }],
  ]);
  const waves = new Map<string, Record<string, unknown>>();
  const writes: string[] = [];
  const reader: WaveZeroReader = {
    signedInEmails: async () => ['member@example.com', 'jdoe@gmail.com'],
    cohortEmails: async () => ['family@example.com'],
    waitlistDocs: async () => [...waitlist].map(([docId, data]) => ({ id: docId, data })),
    profileExists: async (docId) => profiles.has(docId),
  };
  const merge =
    (m: Map<string, Record<string, unknown>>, name: string) =>
    async (docId: string, data: Record<string, unknown>) => {
      // prettier-ignore
      writes.push(`${name}/${docId}`);
      m.set(docId, { ...m.get(docId), ...data });
    };
  const lines: string[] = [];
  const deps: RunDeps = {
    waveZero: async () => ({ reader, writer: { mergeWaitlist: merge(waitlist, 'waitlist'), mergeProfile: merge(profiles, 'user_profiles'), recordWave: merge(waves, 'waitlist_waves') } }), // prettier-ignore
    wave: async () => {
      throw new Error('not a regular wave');
    },
    out: (l) => void lines.push(l),
    now: () => NOW,
  };
  return { waitlist, profiles, waves, writes, lines, deps };
}

describe('waitlist-wave wave 0', () => {
  it('a dry run (the default) writes nothing and reports the counts', async () => {
    const w = world();
    expect(await run(ARGS, w.deps)).toBe(0);
    expect(w.writes).toEqual([]);
    expect(w.lines.join('\n')).toMatch(/DRY RUN wave 0[\s\S]*joined \(tier untouched\): 3 \(1 with a profile\)[\s\S]*7-day seat: 2/); // prettier-ignore
    expect(w.lines.join('\n')).not.toMatch(/@/); // counts only, never emails
  });

  it('--apply: signed-in people joined with tier untouched, pending get a seat, aliases folded', async () => {
    const w = world();
    await run([...ARGS, '--apply'], w.deps);
    expect(w.profiles.get(id('member@example.com'))).toEqual({
      subscription: { tier: 'partner', status: 'active' },
      foundingMember: true,
      foundingWave: 0,
    });
    expect(w.profiles.has(id('family@example.com'))).toBe(false); // no profile is created
    expect(w.waitlist.get(id('family@example.com'))).toMatchObject({ status: 'joined', foundingWave: 0 }); // prettier-ignore
    // jdoe@gmail.com signed in: their entry is keyed by that address; the j.doe@ alias is retired, no seat
    expect(w.waitlist.get(id('jdoe@gmail.com'))).toMatchObject({ status: 'joined', email: 'jdoe@gmail.com' }); // prettier-ignore
    expect(w.waitlist.get(id('j.doe@gmail.com'))).toMatchObject({ status: 'merged', mergedInto: id('jdoe@gmail.com') }); // prettier-ignore
    expect(w.waitlist.get(id('j.doe@gmail.com'))!.seatExpiresAt).toBeUndefined();
    const seat = w.waitlist.get(id('pending@example.com'))!;
    expect(seat).toMatchObject({ status: 'admitted', foundingMember: true, foundingWave: 0, waveId: 'wave-0' }); // prettier-ignore
    expect((seat.seatExpiresAt as Date).toISOString()).toBe('2026-10-27T16:00:00.000Z');
    expect(w.waitlist.get(id('nostatus@example.com'))).toMatchObject({ status: 'admitted' });
    expect(w.waitlist.get(id('old@example.com'))).toEqual({ email: 'old@example.com', status: 'approved' }); // prettier-ignore
    expect(w.waves.get('wave-0')).toMatchObject({ number: 0, status: 'done', joined: 3, admitted: 2 }); // prettier-ignore
  });

  it('refuses to run without a project, or wave 0 without sources', () => {
    expect(() => parseArgs(['--wave', '0', '--include', 'pending'])).toThrow(/--project/);
    expect(() => parseArgs(['--project', 'p', '--wave', '0'])).toThrow(/--include/);
    expect(() => parseArgs(['--project', 'p', '--wave', '3'])).toThrow(/0 only/);
    expect(() => parseArgs(['--project', 'p', '--wave', '0', '--include', 'everyone'])).toThrow(/unknown source/); // prettier-ignore
  });
});
