#!/usr/bin/env tsx
/**
 * Manage feature cohorts and per-person overrides (src/services/platform/cohort-flags.ts,
 * docs/runbooks/cohort-rollout.md). A dry run by default: it prints the writes it
 * would make. It writes only with --apply and an explicit --project.
 *
 *   pnpm tsx scripts/cohorts.ts <command> [--project <id>] [--apply]
 *
 *   list                                      cohorts, member counts and flags
 *   show <cohort>                             one cohort, with member uids
 *   create <cohort> --description "<text>"    a new cohort, enabled, no flags
 *   add-member <cohort> --uid <uid> | --email <email>
 *   remove-member <cohort> --uid <uid> | --email <email>
 *   set-flag <cohort> FLAG on|off             FLAG from COHORT_FLAGS (TURN_LENGTH: learned|adaptive|off, TURN_TEXTURE: learned|off)
 *   unset-flag <cohort> FLAG
 *   enable|disable <cohort>                   a whole cohort on or off (off is the fast kill)
 *   percent <cohort> <0-100>                  also a stable sample of every caller (0: members only)
 *   override <uid|email> FLAG on|off          one person's own value, beats every cohort
 *   clear-override <uid|email> FLAG
 *   who <uid|email>                           the flags a call from this person gets
 *
 * Reads (list, show, who, --email) need --project too. It prints uids, never
 * emails other than the one given, and nothing from the environment.
 */
import { pathToFileURL } from 'node:url';
import { getFirestoreDatabase } from '../src/config/environment.js';
import {
  COHORT_FLAGS,
  cohortFlagValues,
  missingPrerequisites,
  resolveCallerFlags,
} from '../src/services/platform/cohort-flags.js';

const ALLOWED: ReadonlySet<string> = new Set(COHORT_FLAGS);
const COHORT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** The audience with no cohort: the agent's own defaults. Never a document. */
export const IMPLICIT_COHORT = 'everyone-else';

export interface CohortDoc {
  name?: string;
  description?: string;
  enabled?: boolean;
  members?: string[];
  flags?: Record<string, string>;
  percent?: number;
}

/** One document write: plain fields, plus member and field operations. */
export interface Write {
  collection: 'feature_cohorts' | 'feature_flag_overrides';
  doc: string;
  kind: 'create' | 'update' | 'merge';
  fields: Record<string, unknown>;
  addMembers?: string[];
  removeMembers?: string[];
  deleteFields?: string[];
}

export interface AdminStore {
  listCohorts: () => Promise<Array<CohortDoc & { id: string }>>;
  getCohort: (id: string) => Promise<CohortDoc | null>;
  cohortsWith: (uid: string) => Promise<Array<CohortDoc & { id: string }>>;
  overrides: (uid: string) => Promise<Record<string, string>>;
  uidForEmail: (email: string) => Promise<string | null>;
  apply: (write: Write) => Promise<void>;
}

export interface Args {
  cmd: string;
  positional: string[];
  apply: boolean;
  project?: string;
  description?: string;
  uid?: string;
  email?: string;
}

const COMMANDS = new Set([
  'list', 'show', 'create', 'add-member', 'remove-member', 'set-flag', 'unset-flag',
  'enable', 'disable', 'percent', 'override', 'clear-override', 'who',
]); // prettier-ignore
const READS = new Set(['list', 'show', 'who']);
const VALUE_OPTS = new Set(['--project', '--description', '--uid', '--email']);

export function parseArgs(argv: string[]): Args {
  const [cmd = '', ...rest] = argv;
  if (!COMMANDS.has(cmd)) throw new Error(`unknown command "${cmd}" (${[...COMMANDS].join(', ')})`);
  const args: Args = { cmd, positional: [], apply: false };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] ?? '';
    if (a === '--apply') args.apply = true;
    else if (VALUE_OPTS.has(a)) {
      const v = rest[++i];
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a value`);
      args[a.slice(2) as 'project' | 'description' | 'uid' | 'email'] = v;
    } else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else args.positional.push(a);
  }
  if (args.apply && !args.project)
    throw new Error('--apply needs --project <id>, named explicitly');
  if (READS.has(cmd) && !args.project)
    throw new Error(`${cmd} reads Firebase: give --project <id>`);
  return args;
}

export function cohortId(id: string | undefined): string {
  if (!id) throw new Error('missing <cohort>');
  if (!COHORT_ID.test(id) || id.length > 64)
    throw new Error(`${id}: a cohort id is kebab-case, like friends-and-family`);
  if (id === IMPLICIT_COHORT)
    throw new Error(`${id} is everyone in no cohort: the agent's defaults`);
  return id;
}

export function cohortFlag(flag: string | undefined): string {
  if (!flag || !ALLOWED.has(flag))
    throw new Error(`${flag ?? '(none)'}: not a cohort flag (${COHORT_FLAGS.join(', ')})`);
  return flag;
}

function flagValue(flag: string, v: string | undefined): string {
  const values = cohortFlagValues(flag);
  if (!v || !values.includes(v))
    throw new Error(`${flag} must be ${values.join(' or ')}, not ${v ?? '(none)'}`);
  return v;
}

/** The writes a command makes; validates everything first. `uid` is the member or person. */
export function planWrites(a: Args, uid: string | undefined, now: string): Write[] {
  const [first, second, third] = a.positional;
  const cohort = (fields: Record<string, unknown>, more: Partial<Write> = {}): Write[] => [
    { collection: 'feature_cohorts', doc: cohortId(first), kind: 'update', fields: { ...fields, updatedAt: now }, ...more }, // prettier-ignore
  ];
  const needUid = (): string => {
    if (!uid) throw new Error('give --uid <uid> or --email <email>');
    return uid;
  };
  switch (a.cmd) {
    case 'create': {
      if (!a.description) throw new Error('create needs --description "<who this audience is>"');
      const doc = { name: cohortId(first), description: a.description, enabled: true, members: [], flags: {} }; // prettier-ignore
      return [{ collection: 'feature_cohorts', doc: doc.name, kind: 'create', fields: { ...doc, updatedAt: now } }]; // prettier-ignore
    }
    case 'add-member':
      return cohort({}, { addMembers: [needUid()] });
    case 'remove-member':
      return cohort({}, { removeMembers: [needUid()] });
    case 'set-flag':
      return cohort({ [`flags.${cohortFlag(second)}`]: flagValue(cohortFlag(second), third) });
    case 'unset-flag':
      return cohort({}, { deleteFields: [`flags.${cohortFlag(second)}`] });
    case 'enable':
    case 'disable':
      return cohort({ enabled: a.cmd === 'enable' });
    case 'percent': {
      const p = Number(second);
      if (!second || !Number.isInteger(p) || p < 0 || p > 100)
        throw new Error(`percent: a whole number 0-100, not ${second ?? '(none)'}`);
      return p === 0 ? cohort({}, { deleteFields: ['percent'] }) : cohort({ percent: p });
    }
    case 'override':
      return [{ collection: 'feature_flag_overrides', doc: needUid(), kind: 'merge', fields: { flags: { [cohortFlag(first)]: flagValue(cohortFlag(first), second) }, updatedAt: now } }]; // prettier-ignore
    case 'clear-override':
      return [{ collection: 'feature_flag_overrides', doc: needUid(), kind: 'update', fields: { updatedAt: now }, deleteFields: [`flags.${cohortFlag(first)}`] }]; // prettier-ignore
    default:
      return [];
  }
}

export function describeWrite(w: Write): string {
  const parts = [`${w.kind} ${w.collection}/${w.doc}`, JSON.stringify(w.fields)];
  if (w.addMembers) parts.push(`members += [${w.addMembers.join(', ')}]`);
  if (w.removeMembers) parts.push(`members -= [${w.removeMembers.join(', ')}]`);
  if (w.deleteFields) parts.push(`delete ${w.deleteFields.join(', ')}`);
  return parts.join(' ');
}

function showCohort(id: string, c: CohortDoc, out: (l: string) => void, members: boolean): void {
  out(`${id} ${c.enabled === false ? 'DISABLED' : 'enabled'}: ${c.description ?? c.name ?? ''}`);
  out(`  flags:   ${JSON.stringify(c.flags ?? {})}`);
  if (typeof c.percent === 'number') out(`  sample:  ${c.percent}% of callers`);
  for (const m of missingPrerequisites(c.flags ?? {})) out(`  warning: ${m}`);
  const m = c.members ?? [];
  out(members ? `  members: ${m.join(', ') || '(none)'}` : `  members: ${m.length}`);
}

export interface RunDeps {
  store: (project: string) => Promise<AdminStore>;
  out: (line: string) => void;
  now?: () => string;
}

/** Runs one command; returns the exit code. */
export async function run(argv: string[], deps: RunDeps): Promise<number> {
  const a = parseArgs(argv);
  const store = a.project ? await deps.store(a.project) : null;
  const person = a.cmd === 'override' || a.cmd === 'clear-override' || a.cmd === 'who';
  // The person comes first (`override <uid|email> FLAG on|off`) unless --uid / --email named
  // them; either way the flag and its value are then positional[0] and [1].
  const lookup = person && !a.uid && !a.email ? a.positional.shift() : undefined;
  const email = a.email ?? (lookup?.includes('@') ? lookup : undefined);
  let uid = a.uid ?? (lookup && !lookup.includes('@') ? lookup : undefined);
  if (email) {
    if (!store) throw new Error(`looking up ${email} reads Firebase Auth: give --project <id>`);
    uid = (await store.uidForEmail(email)) ?? undefined;
    if (!uid) throw new Error(`no account with ${email}`);
    deps.out(`${email} -> uid ${uid}`);
  }
  if (a.cmd === 'list' && store) {
    const all = await store.listCohorts();
    if (all.length === 0) deps.out('no cohorts');
    for (const c of all) showCohort(c.id, c, deps.out, false);
    return 0;
  }
  if (a.cmd === 'show' && store) {
    const id = cohortId(a.positional[0]);
    const c = await store.getCohort(id);
    if (!c) throw new Error(`no cohort ${id}`);
    showCohort(id, c, deps.out, true);
    return 0;
  }
  if (a.cmd === 'who' && store) {
    if (!uid) throw new Error('who needs <uid|email>');
    const [found, own, all] = await Promise.all([store.cohortsWith(uid), store.overrides(uid), store.listCohorts()]); // prettier-ignore
    const mine = [...found].sort((x, y) => x.id.localeCompare(y.id));
    const asCohort = (c: CohortDoc & { id: string }) => ({ id: c.id, enabled: c.enabled !== false, flags: c.flags ?? {}, percent: c.percent }); // prettier-ignore
    const flags = await resolveCallerFlags(uid, {
      cohortsFor: async () => mine.map(asCohort),
      overridesFor: async () => own,
      sampledCohorts: async () => all.filter((c) => typeof c.percent === 'number').map(asCohort),
    });
    deps.out(`cohorts:   ${mine.map((c) => (c.enabled === false ? `${c.id} (disabled)` : c.id)).join(', ') || '(none)'}`); // prettier-ignore
    deps.out(`overrides: ${JSON.stringify(own)}`);
    deps.out(`flags:     ${JSON.stringify(flags)} (with COHORT_FLAGS=on; else agent defaults)`);
    return 0;
  }
  const writes = planWrites(a, uid, (deps.now ?? (() => new Date().toISOString()))());
  if (a.cmd === 'set-flag' && store && a.positional[2] === 'on') {
    const c = await store.getCohort(cohortId(a.positional[0]));
    const after = { ...(c?.flags ?? {}), [a.positional[1] ?? '']: 'on' };
    for (const m of missingPrerequisites(after))
      deps.out(`warning: ${m} (in this cohort or on the agent)`);
  }
  for (const w of writes) {
    if (a.apply && store) {
      await store.apply(w);
      deps.out(`wrote: ${describeWrite(w)}`);
    } else deps.out(`DRY RUN, would ${describeWrite(w)}`);
  }
  if (!a.apply) deps.out('Nothing written. Add --apply --project <id> to write.');
  else deps.out('Applies from each member’s next call.');
  return 0;
}

/** The real store: Firestore and Firebase Auth in exactly `project`, with your gcloud credentials. */
async function firebaseStore(project: string): Promise<AdminStore> {
  const { applicationDefault, initializeApp } = await import('firebase-admin/app');
  const { FieldValue, getFirestore } = await import('firebase-admin/firestore');
  const { getAuth } = await import('firebase-admin/auth');
  const app = initializeApp({ projectId: project, credential: applicationDefault() }, `cohorts-${project}`); // prettier-ignore
  const db = getFirestore(app, getFirestoreDatabase());
  const cohorts = db.collection('feature_cohorts');
  const withId = (d: { id: string; data: () => unknown }) => ({ id: d.id, ...(d.data() as CohortDoc) }); // prettier-ignore
  return {
    listCohorts: async () => (await cohorts.get()).docs.map(withId),
    getCohort: async (id) => ((await cohorts.doc(id).get()).data() as CohortDoc | undefined) ?? null, // prettier-ignore
    cohortsWith: async (uid) => (await cohorts.where('members', 'array-contains', uid).get()).docs.map(withId), // prettier-ignore
    overrides: async (uid) => {
      const d = await db.collection('feature_flag_overrides').doc(uid).get();
      return (d.data()?.flags as Record<string, string> | undefined) ?? {};
    },
    uidForEmail: async (email) =>
      getAuth(app)
        .getUserByEmail(email)
        .then(
          (u) => u.uid,
          (e: { code?: string }) => {
            if (e.code === 'auth/user-not-found') return null;
            throw e;
          }
        ),
    apply: async (w) => {
      const fields: Record<string, unknown> = { ...w.fields };
      if (w.addMembers) fields.members = FieldValue.arrayUnion(...w.addMembers);
      if (w.removeMembers) fields.members = FieldValue.arrayRemove(...w.removeMembers);
      for (const f of w.deleteFields ?? []) fields[f] = FieldValue.delete();
      const ref = db.collection(w.collection).doc(w.doc);
      if (w.kind === 'create') await ref.create(fields);
      else if (w.kind === 'update') await ref.update(fields);
      else await ref.set(fields, { merge: true });
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2), { store: firebaseStore, out: (l) => console.log(l) })
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
