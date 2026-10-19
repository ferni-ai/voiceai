/**
 * `ferni waitlist` end to end, minus Firestore: the CLI wrapper builds the
 * argv, and that exact argv goes through the script's own parser and run()
 * against a fake store. #1714 shipped a wrapper and a script that disagreed
 * about flags, so every subcommand is driven through both halves here.
 */
import { describe, expect, it } from 'vitest';
import { handleWaitlist } from '../../apps/cli/src/commands/users/users-admin.js';
import { parseArgs, run, toCsv, waitlistDocId } from '../waitlist-admin.js';
import type { WaitlistEntry, WaitlistStore } from '../waitlist-admin.js';

const NOW = new Date('2026-10-18T12:00:00.000Z');
const day = (d: number) => new Date(Date.UTC(2026, 9, d));

function fakeStore(entries: WaitlistEntry[] = []) {
  const docs = new Map(entries.map((e) => [e.id, e]));
  const writes: Array<{ id: string; fields: Record<string, unknown> }> = [];
  const store: WaitlistStore = {
    list: async () => [...docs.values()],
    get: async (id) => docs.get(id) ?? null,
    write: async (id, fields) => void writes.push({ id, fields }),
  };
  return { store, writes };
}

const SEED: WaitlistEntry[] = [
  { id: waitlistDocId('pat@example.test'), email: 'pat@example.test', status: 'pending', source: 'landing', joinedAt: day(1), phone: '+15550000001' }, // prettier-ignore
  { id: waitlistDocId('sam@example.test'), email: 'sam@example.test', status: 'pending', source: 'newsletter', joinedAt: day(5) }, // prettier-ignore
  { id: waitlistDocId('lee@example.test'), email: 'lee@example.test', status: 'approved', source: 'app_signin', joinedAt: day(3) }, // prettier-ignore
  { id: waitlistDocId('kim@example.test'), email: '=HYPERLINK("x")@example.test', joinedAt: null },
];

/** Runs `ferni waitlist <args>`: the wrapper's argv, fed to the script. */
async function ferniWaitlist(args: string[], entries = SEED) {
  const spawned: string[][] = [];
  await handleWaitlist(args, {
    scriptsDir: '/repo/scripts',
    projectId: 'johnb-2025',
    ask: async () => '',
    run: (_cmd, argv) => (spawned.push([...argv]), { status: 0 }),
  });
  expect(spawned).toHaveLength(1);
  const [tsx, script, ...scriptArgs] = spawned[0] ?? [];
  expect([tsx, script]).toEqual(['tsx', '/repo/scripts/waitlist-admin.ts']);
  const { store, writes } = fakeStore(entries);
  const lines: string[] = [];
  const files: Record<string, string> = {};
  const projects: string[] = [];
  const code = await run(scriptArgs, {
    store: async (p) => (projects.push(p), store),
    out: (l) => lines.push(l),
    writeFile: (p, d) => void (files[p] = d),
    now: () => NOW,
  });
  return { code, lines, writes, files, projects, scriptArgs };
}

describe('ferni waitlist, every subcommand through the real parser', () => {
  it('list: pending only by default, newest first, emails masked, against prod', async () => {
    const { code, lines, projects } = await ferniWaitlist(['list']);
    expect(code).toBe(0);
    expect(projects).toEqual(['johnb-2025']);
    expect(lines[0]).toBe('2 pending entries');
    expect(lines[1]).toContain('sa***@example.test');
    expect(lines[2]).toContain('pa***@example.test');
    expect(lines.join('\n')).not.toMatch(/sam@|pat@|lee@/);
  });

  it('list --limit and --status=all', async () => {
    const { lines } = await ferniWaitlist(['list', '--limit=1', '--status=all']);
    expect(lines[0]).toBe('4 entries, newest 1');
    expect(lines).toHaveLength(2);
  });

  it('stats (and the bare default): counts by status and source', async () => {
    for (const args of [['stats'], []]) {
      const { code, lines } = await ferniWaitlist(args);
      expect(code).toBe(0);
      expect(lines).toEqual([
        'total:     4',
        'by status: pending 2, approved 1, (none) 1',
        'by source: landing 1, newsletter 1, app_signin 1, (none) 1',
        'phone:     1',
      ]);
    }
  });

  it('export: CSV to the named file, full emails, formulas neutralised', async () => {
    const { files, lines } = await ferniWaitlist(['export', '--output=/tmp/w.csv']);
    const csv = files['/tmp/w.csv'] ?? '';
    expect(csv.split('\n')[0]).toBe('email,status,source,phone,joinedAt');
    expect(csv).toContain('"sam@example.test","pending","newsletter","","2026-10-05T00:00:00.000Z"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")@example.test"`);
    expect(lines[0]).toMatch(/^wrote 4 entries to \/tmp\/w.csv/);
  });

  it('approve without --apply: a dry run, nothing written, no phone needed', async () => {
    const { code, writes, lines } = await ferniWaitlist(['approve', 'Pat@Example.test']);
    expect(code).toBe(0);
    expect(writes).toEqual([]);
    expect(lines[0]).toMatch(/^DRY RUN.*pa\*\*\*@example.test: pending -> approved/);
  });

  it('approve --apply: marks the existing entry approved', async () => {
    const { writes } = await ferniWaitlist(['approve', 'pat@example.test', '--apply']);
    expect(writes).toEqual([
      {
        id: waitlistDocId('pat@example.test'),
        fields: { status: 'approved', approvedAt: NOW, approvedBy: 'cli', updatedAt: NOW },
      },
    ]);
  });

  it('approve --apply for someone not on the list: adds them approved', async () => {
    const { writes } = await ferniWaitlist(['approve', 'new@example.test', '--apply']);
    expect(writes[0]?.fields).toMatchObject({ email: 'new@example.test', status: 'approved', source: 'manual' }); // prettier-ignore
  });

  it('approve someone already approved: writes nothing', async () => {
    const { writes, lines } = await ferniWaitlist(['approve', 'lee@example.test', '--apply']);
    expect(writes).toEqual([]);
    expect(lines[0]).toMatch(/already approved/);
  });
});

describe('the script refuses what it cannot do safely', () => {
  it('every command needs an explicit --project', () => {
    for (const cmd of ['list', 'stats', 'export']) expect(() => parseArgs([cmd])).toThrow(/--project/);
    expect(() => parseArgs(['approve', 'a@b.test'])).toThrow(/--project/);
  });

  it('rejects unknown commands, unknown options, bad limits and a missing email', () => {
    expect(() => parseArgs(['nuke', '--project', 'p'])).toThrow(/unknown command/);
    expect(() => parseArgs(['list', '--project', 'p', '--force'])).toThrow(/unknown option/);
    expect(() => parseArgs(['list', '--project', 'p', '--limit=0'])).toThrow(/whole number/);
    expect(() => parseArgs(['approve', '--project', 'p'])).toThrow(/needs an email/);
  });

  it('csv quotes every cell', () => {
    expect(toCsv([{ id: 'x', email: 'a,b@c.test' }])).toBe('email,status,source,phone,joinedAt\n"a,b@c.test","","","",""\n'); // prettier-ignore
  });
});
