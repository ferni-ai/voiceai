#!/usr/bin/env tsx
/**
 * Run a waitlist wave from the terminal (`ferni waitlist wave ...`). A dry run
 * by default: it writes only with --apply, always to an explicit --project.
 * Sends nothing (no email, no call); the "you're in" note is a separate step.
 *
 *   pnpm tsx scripts/waitlist-wave.ts --project <id> --wave 0 --include signed-in,pending,friends-and-family [--apply]
 *   pnpm tsx scripts/waitlist-wave.ts --project <id> [--apply]     a manual wave now (id manual-<time>)
 *   pnpm tsx scripts/waitlist-wave.ts --project <id> --guard-check  print the capacity guard's two readings
 *
 * --apply asks you to type the project id (the CLI passes --confirm-project after
 * asking you itself). A manual wave never uses the scheduled wave's id, so it can't
 * stand in for, or block, the 17:00 run. Wave 0 refuses to run twice.
 *
 * Wave 0 marks people already signed in as joined (their tier untouched) and
 * gives everyone pending a 7-day seat; see services/waitlist/wave-zero.ts.
 * A regular wave runs the capacity guard and settings like the job does.
 */
import { pathToFileURL } from 'node:url';
import type { Firestore } from '@google-cloud/firestore';
import {
  applyWaveZero,
  planWaveZero,
  WAVE_ZERO_SOURCES,
  type WaveZeroReader,
  type WaveZeroSource,
  type WaveZeroWriter,
} from '../src/services/waitlist/wave-zero.js';
import type { WaveDeps } from '../src/services/waitlist/wave.js';
import type { GuardReading } from '../src/services/waitlist/capacity-guard.js';

export interface Args {
  project: string;
  apply: boolean;
  guardCheck: boolean;
  confirmProject?: string;
  wave?: number;
  include: Set<WaveZeroSource>;
}

export function parseArgs(argv: string[]): Args {
  const value = (flag: string): string | undefined => {
    const i = argv.findIndex((a) => a === flag || a.startsWith(`${flag}=`));
    if (i < 0) return undefined;
    return argv[i]!.includes('=') ? argv[i]!.slice(flag.length + 1) : argv[i + 1];
  };
  const project = value('--project');
  if (!project) throw new Error('give --project <id> (the wave reads and writes Firestore there)');
  const waveRaw = value('--wave');
  if (waveRaw !== undefined && waveRaw !== '0') throw new Error('--wave takes 0 only; later waves are numbered by the runner'); // prettier-ignore
  const include = new Set((value('--include') ?? '').split(',').filter(Boolean)) as Set<WaveZeroSource>; // prettier-ignore
  for (const s of include) if (!WAVE_ZERO_SOURCES.includes(s)) throw new Error(`--include: unknown source "${s}" (${WAVE_ZERO_SOURCES.join(', ')})`); // prettier-ignore
  if (waveRaw === '0' && include.size === 0) throw new Error(`--wave 0 needs --include (${WAVE_ZERO_SOURCES.join(',')})`); // prettier-ignore
  return { project, apply: argv.includes('--apply'), guardCheck: argv.includes('--guard-check'), confirmProject: value('--confirm-project'), wave: waveRaw === undefined ? undefined : 0, include }; // prettier-ignore
}

export interface RunDeps {
  waveZero: (project: string) => Promise<{ reader: WaveZeroReader; writer: WaveZeroWriter }>;
  wave: (project: string, now: Date, dryRun: boolean) => Promise<WaveDeps>;
  guard: (project: string) => Promise<GuardReading>;
  out: (line: string) => void;
  /** Asks on the terminal (only for --apply without --confirm-project). */
  ask: (question: string) => Promise<string>;
  now?: () => Date;
}

/** A manual wave's id: never the scheduled one (a UTC date), so the 17:00 run still happens. */
export const manualWaveId = (now: Date): string => `manual-${now.toISOString().slice(0, 16)}`;

/** Runs one wave; returns the exit code. Prints counts only, never emails. */
export async function run(argv: string[], deps: RunDeps): Promise<number> {
  const a = parseArgs(argv);
  const now = (deps.now ?? (() => new Date()))();
  if (a.guardCheck) {
    const g = await deps.guard(a.project);
    deps.out(`capacity guard in ${a.project}: ${g.state}`);
    deps.out(`  cost: ${g.costUsd === null ? 'unmeasured (BILLING_EXPORT_TABLE set? bigquery access?)' : `$${g.costUsd} on ${g.costDay}`}`); // prettier-ignore
    deps.out(`  call errors (24 h): ${g.errorRate === null ? 'unmeasured (needs call_events rows)' : `${(g.errorRate * 100).toFixed(1)}%`}`); // prettier-ignore
    if (g.reasons.length) deps.out(`  reasons: ${g.reasons.join(', ')}`);
    return 0;
  }
  if (a.apply && a.confirmProject !== a.project) {
    const typed = (await deps.ask(`This WRITES waitlist admissions in ${a.project} (no email is sent). Type the project id: `)).trim(); // prettier-ignore
    if (typed !== a.project) {
      deps.out('Project id did not match. Nothing was written.');
      return 1;
    }
  }
  const mode = a.apply ? 'APPLY' : 'DRY RUN';
  if (a.wave === 0) {
    const { reader, writer } = await deps.waveZero(a.project);
    const plan = await planWaveZero(reader, a.include);
    if (plan.alreadyRan) {
      deps.out(`Wave 0 already ran in ${a.project} (waitlist_waves/wave-0 exists). Nothing to do.`);
      return 1;
    }
    deps.out(`${mode} wave 0 in ${a.project} (${[...a.include].join(', ')}):`);
    deps.out(`  signed in already, marked joined (tier untouched): ${plan.joined.length} (${plan.joined.filter((j) => j.profile).length} with a profile)`); // prettier-ignore
    deps.out(`  pending, given a 7-day seat: ${plan.seats.length} (left out: ${plan.skipped} newsletter-only, throwaway or repeated)`); // prettier-ignore
    deps.out(`  gmail aliases of someone signed in, retired: ${plan.retired.length}`);
    if (!a.apply) {
      deps.out('Nothing written. Add --apply to write. Nothing is ever sent from here.');
      return 0;
    }
    if (!(await applyWaveZero(plan, writer, now))) {
      deps.out('Wave 0 was claimed by another run just now. Nothing written.');
      return 1;
    }
    deps.out('Written. Nobody was emailed; send the "doors open" note as its own step.');
    return 0;
  }
  const { runWave } = await import('../src/services/waitlist/wave.js');
  const report = await runWave(await deps.wave(a.project, now, !a.apply), manualWaveId(now));
  deps.out(`${mode} wave ${report.waveId}: ${JSON.stringify({ ...report, guard: report.guard?.state })}`); // prettier-ignore
  return 0;
}

async function firestoreFor(
  project: string
): Promise<{ db: Firestore; app: import('firebase-admin/app').App }> {
  // prettier-ignore
  const { applicationDefault, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = initializeApp({ projectId: project, credential: applicationDefault() }, `waitlist-wave-${project}`); // prettier-ignore
  return { db: getFirestore(app) as unknown as Firestore, app };
}

async function realWaveZero(
  project: string
): Promise<{ reader: WaveZeroReader; writer: WaveZeroWriter }> {
  // prettier-ignore
  const { db, app } = await firestoreFor(project);
  const { getAuth } = await import('firebase-admin/auth');
  const auth = getAuth(app);
  const waves = db.collection('waitlist_waves');
  // Verified and enabled only: a disabled account is not let in by wave 0
  const verifiedEmail = (u: {
    email?: string;
    emailVerified: boolean;
    disabled: boolean;
  }): string[] => (u.email && u.emailVerified && !u.disabled ? [u.email.toLowerCase()] : []);
  const reader: WaveZeroReader = {
    async signedInEmails() {
      const emails: string[] = [];
      let token: string | undefined;
      do {
        const page = await auth.listUsers(1000, token); // eslint-disable-line no-await-in-loop
        emails.push(...page.users.flatMap(verifiedEmail));
        token = page.pageToken;
      } while (token);
      return emails;
    },
    async cohortEmails() {
      const members = ((await db.collection('feature_cohorts').doc('friends-and-family').get()).data()?.members ?? []) as string[]; // prettier-ignore
      if (members.length === 0) return [];
      const found = await auth.getUsers(members.map((uid) => ({ uid })));
      return found.users.flatMap(verifiedEmail);
    },
    waitlistDocs: async () => (await db.collection('waitlist').get()).docs.map((d) => ({ id: d.id, data: d.data() })), // prettier-ignore
    profileExists: async (id) => (await db.collection('user_profiles').doc(id).get()).exists,
    waveZeroExists: async () => (await waves.doc('wave-0').get()).exists,
  };
  const writer: WaveZeroWriter = {
    claimWaveZero: async (data) =>
      waves
        .doc('wave-0')
        .create(data)
        .then(
          () => true,
          (err: { code?: number }) => (err.code === 6 ? false : Promise.reject(err))
        ),
    finishWaveZero: async (data) => void (await waves.doc('wave-0').update(data)),
    mergeWaitlist: async (id, data) => void (await db.collection('waitlist').doc(id).set(data, { merge: true })), // prettier-ignore
    mergeProfile: async (id, data) => void (await db.collection('user_profiles').doc(id).set(data, { merge: true })), // prettier-ignore
  };
  return { reader, writer };
}

async function realWave(project: string, now: Date, dryRun: boolean): Promise<WaveDeps> {
  const { db } = await firestoreFor(project);
  const { firestoreWaveStore } = await import('../src/services/waitlist/wave-store.js');
  const { bigQuerySignals, readGuard } = await import('../src/services/waitlist/capacity-guard.js');
  const signals = bigQuerySignals();
  return { store: firestoreWaveStore(db), guard: (s) => readGuard(signals, s), now, dryRun };
}

/** The guard as the job would read it: the live settings doc's ceilings, read-only. */
async function realGuard(project: string): Promise<GuardReading> {
  const { db } = await firestoreFor(project);
  const { firestoreWaveStore } = await import('../src/services/waitlist/wave-store.js');
  const { bigQuerySignals, readGuard } = await import('../src/services/waitlist/capacity-guard.js');
  return readGuard(bigQuerySignals(), await firestoreWaveStore(db).settings());
}

async function askTerminal(question: string): Promise<string> {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2), { waveZero: realWaveZero, wave: realWave, guard: realGuard, out: (l) => console.log(l), ask: askTerminal }) // prettier-ignore
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
