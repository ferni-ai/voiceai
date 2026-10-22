#!/usr/bin/env tsx
/**
 * The waitlist from the terminal (`ferni waitlist ...`). A dry run by default:
 * it writes only with --apply and an explicit --project, like scripts/cohorts.ts.
 *
 *   pnpm tsx scripts/waitlist-admin.ts <command> --project <id> [--apply]
 *
 *   list [--limit N] [--status S]   newest first, emails masked (default: pending, 20)
 *   stats                           counts by status and source, how many left a phone
 *   export [--output FILE]          every entry as CSV, full emails, to a local file (0600)
 *   approve <email>                 marks the entry approved (creates it if missing).
 *                                   They get in on their next sign-in (/api/waitlist/check).
 *                                   Sends nothing: no email, no call.
 *
 * Replaces the flags #1714 passed to approve-waitlist-user.ts, which never read
 * them: list/stats/export died with "Missing email." and approve with "Missing phone.".
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export interface WaitlistEntry {
  id: string;
  email?: string;
  status?: string;
  source?: string;
  phone?: string;
  joinedAt?: Date | null;
}

export interface WaitlistStore {
  list: () => Promise<WaitlistEntry[]>;
  get: (docId: string) => Promise<WaitlistEntry | null>;
  /** Merge-writes `fields` onto waitlist/{docId}. */
  write: (docId: string, fields: Record<string, unknown>) => Promise<void>;
}

export interface Args {
  cmd: string;
  positional: string[];
  apply: boolean;
  project?: string;
  limit: number;
  status: string;
  output: string;
}

const COMMANDS = new Set(['list', 'stats', 'export', 'approve']);
const VALUE_OPTS = new Set(['--project', '--limit', '--status', '--output']);

export function parseArgs(argv: string[]): Args {
  const [cmd = '', ...rest] = argv;
  if (!COMMANDS.has(cmd)) throw new Error(`unknown command "${cmd}" (${[...COMMANDS].join(', ')})`);
  const a: Args = { cmd, positional: [], apply: false, limit: 20, status: 'pending', output: 'waitlist-export.csv' }; // prettier-ignore
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] ?? '';
    const [flag, inline] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined]; // prettier-ignore
    if (flag === '--apply') a.apply = true;
    else if (VALUE_OPTS.has(flag)) {
      const v = inline ?? rest[++i];
      if (!v || v.startsWith('--')) throw new Error(`${flag} needs a value`);
      if (flag === '--limit') {
        a.limit = Number(v);
        if (!Number.isInteger(a.limit) || a.limit < 1) throw new Error(`--limit: a whole number, not ${v}`); // prettier-ignore
      } else a[flag.slice(2) as 'project' | 'status' | 'output'] = v;
    } else if (flag.startsWith('--')) throw new Error(`unknown option ${flag}`);
    else a.positional.push(arg);
  }
  if (!a.project) throw new Error(`${cmd} reads Firestore: give --project <id>`);
  if (cmd === 'approve' && !a.positional[0]?.includes('@'))
    throw new Error('approve needs an email: approve <email>');
  return a;
}

/** The waitlist doc id for an email (same derivation as waitlist-routes.ts). */
export const waitlistDocId = (email: string): string =>
  Buffer.from(email.toLowerCase().trim()).toString('base64').replace(/[/+=]/g, '_');

/** `jo***@example.com`: enough to recognise, not enough to copy into a terminal log. */
export function maskEmail(email: string | undefined): string {
  if (!email?.includes('@')) return '(no email)';
  const [user = '', domain] = email.split('@');
  return `${user.slice(0, 2)}***@${domain}`;
}

const csvCell = (v: unknown): string => {
  const s = v instanceof Date ? v.toISOString() : String(v ?? '');
  // Quote everything; neutralise spreadsheet formulas (=, +, -, @ at the start).
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export function toCsv(entries: WaitlistEntry[]): string {
  const cols = ['email', 'status', 'source', 'phone', 'joinedAt'] as const;
  return [cols.join(','), ...entries.map((e) => cols.map((c) => csvCell(e[c])).join(','))].join('\n') + '\n'; // prettier-ignore
}

const byNewest = (x: WaitlistEntry, y: WaitlistEntry) =>
  (y.joinedAt?.getTime() ?? 0) - (x.joinedAt?.getTime() ?? 0);

function countBy(entries: WaitlistEntry[], key: 'status' | 'source'): string {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e[key] ?? '(none)', (counts.get(e[key] ?? '(none)') ?? 0) + 1); // prettier-ignore
  return [...counts].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(', ') || '(none)'; // prettier-ignore
}

export interface RunDeps {
  store: (project: string) => Promise<WaitlistStore>;
  out: (line: string) => void;
  writeFile?: (path: string, data: string) => void;
  now?: () => Date;
}

/** Runs one command; returns the exit code. */
export async function run(argv: string[], deps: RunDeps): Promise<number> {
  const a = parseArgs(argv);
  const store = await deps.store(a.project ?? '');
  if (a.cmd === 'list') {
    const all = (await store.list()).filter((e) => a.status === 'all' || (e.status ?? '(none)') === a.status); // prettier-ignore
    const shown = all.sort(byNewest).slice(0, a.limit);
    deps.out(`${all.length} ${a.status === 'all' ? '' : `${a.status} `}entries${all.length > shown.length ? `, newest ${shown.length}` : ''}`); // prettier-ignore
    for (const e of shown)
      deps.out(`  ${maskEmail(e.email)}  ${e.status ?? '(none)'}  ${e.source ?? '-'}  ${e.joinedAt?.toISOString().slice(0, 10) ?? '-'}${e.phone ? '  phone' : ''}`); // prettier-ignore
    return 0;
  }
  if (a.cmd === 'stats') {
    const all = await store.list();
    deps.out(`total:     ${all.length}`);
    deps.out(`by status: ${countBy(all, 'status')}`);
    deps.out(`by source: ${countBy(all, 'source')}`);
    deps.out(`phone:     ${all.filter((e) => e.phone).length}`);
    return 0;
  }
  if (a.cmd === 'export') {
    const all = (await store.list()).sort(byNewest);
    (deps.writeFile ?? ((p, d) => writeFileSync(p, d, { mode: 0o600 })))(a.output, toCsv(all));
    deps.out(`wrote ${all.length} entries to ${a.output} (full emails: keep it off shared drives)`);
    return 0;
  }
  // approve
  const email = (a.positional[0] ?? '').toLowerCase().trim();
  const id = waitlistDocId(email);
  const existing = await store.get(id);
  const now = (deps.now ?? (() => new Date()))();
  const fields: Record<string, unknown> = existing
    ? { status: 'approved', approvedAt: now, approvedBy: 'cli', updatedAt: now }
    : { email, status: 'approved', source: 'manual', timestamp: now, approvedAt: now, approvedBy: 'cli', updatedAt: now }; // prettier-ignore
  const what = `${maskEmail(email)}: ${existing ? `${existing.status ?? '(none)'} -> approved` : 'not on the list; add as approved'}`; // prettier-ignore
  if (existing?.status === 'approved') {
    deps.out(`${maskEmail(email)} is already approved. Nothing to do.`);
    return 0;
  }
  if (!a.apply) {
    deps.out(`DRY RUN, would set waitlist/${id}: ${what}`);
    deps.out('Nothing written. Add --apply to write.');
    return 0;
  }
  await store.write(id, fields);
  deps.out(`wrote waitlist/${id}: ${what}`);
  deps.out('They get in on their next sign-in. Nothing was sent to them.');
  return 0;
}

/** The real store: Firestore in exactly `project`, with your gcloud credentials. */
async function firestoreStore(project: string): Promise<WaitlistStore> {
  const { applicationDefault, initializeApp } = await import('firebase-admin/app');
  const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
  const app = initializeApp({ projectId: project, credential: applicationDefault() }, `waitlist-${project}`); // prettier-ignore
  const col = getFirestore(app).collection('waitlist');
  const toEntry = (id: string, d: Record<string, unknown> | undefined): WaitlistEntry => {
    const t = d?.timestamp ?? d?.createdAt;
    return {
      id,
      email: d?.email as string | undefined,
      status: d?.status as string | undefined,
      source: d?.source as string | undefined,
      phone: d?.phone as string | undefined,
      joinedAt: t instanceof Timestamp ? t.toDate() : t instanceof Date ? t : null,
    };
  };
  return {
    list: async () => (await col.get()).docs.map((d) => toEntry(d.id, d.data())),
    get: async (id) => {
      const d = await col.doc(id).get();
      return d.exists ? toEntry(id, d.data()) : null;
    },
    write: async (id, fields) => void (await col.doc(id).set(fields, { merge: true })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2), { store: firestoreStore, out: (l) => console.log(l) })
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
