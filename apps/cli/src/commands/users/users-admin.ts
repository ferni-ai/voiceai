/**
 * `ferni users` and `ferni waitlist`: thin wrappers over scripts/*.ts that read
 * or change prod Firestore / Firebase Auth.
 *
 * Two rules, both tested in __tests__/users-admin.test.ts:
 *  - No shell. Every script runs as `npx tsx <script> <args...>` with an
 *    argument array, so an email like `a@b.com; touch /tmp/x` stays one argv
 *    element instead of becoming a second command.
 *  - Deletions are dry runs unless the caller passes --execute AND types the
 *    project id. The scripts check the same id again (scripts/destructive-gate.ts).
 */

import { spawnSync, type SpawnSyncReturns } from 'child_process';
import { join } from 'path';
import { handleWaitlistGuard, handleWaitlistWave } from './waitlist-wave.js';

export type RunFn = (
  cmd: string,
  args: readonly string[],
  opts: { stdio: 'inherit' }
) => Pick<SpawnSyncReturns<Buffer>, 'status'>;

export interface UsersAdminDeps {
  scriptsDir: string;
  /** Asks a question on the terminal and resolves with the answer. */
  ask: (question: string) => Promise<string>;
  run?: RunFn;
  projectId?: string;
}

const defaultRun: RunFn = (cmd, args, opts) => spawnSync(cmd, [...args], opts);

function flagValue(args: readonly string[], name: string, fallback: string): string {
  return args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
}

function runScript(deps: UsersAdminDeps, script: string, args: readonly string[]): void {
  (deps.run ?? defaultRun)('npx', ['tsx', join(deps.scriptsDir, script), ...args], {
    stdio: 'inherit',
  });
}

/**
 * Runs a deleting script: a dry run unless `--execute` is given and the user
 * types the project id. Returns false when the user did not confirm.
 */
async function runDestructive(
  deps: UsersAdminDeps,
  script: string,
  args: readonly string[]
): Promise<boolean> {
  const projectId = deps.projectId ?? 'johnb-2025';
  if (!args.includes('--execute')) {
    console.log(`Dry run. Re-run with --execute to delete (asks you to type the project id).\n`);
    runScript(deps, script, ['--dry-run']);
    return true;
  }
  const typed = (await deps.ask(`This DELETES data in ${projectId}. Type the project id: `)).trim();
  if (typed !== projectId) {
    console.log('\nProject id did not match. Nothing was deleted.');
    return false;
  }
  runScript(deps, script, ['--execute', `--confirm-project=${typed}`]);
  return true;
}

function requireArg(value: string | undefined, usage: string): value is string {
  if (!value) console.error(`Missing argument. Usage: ${usage}`);
  return !!value;
}

export async function handleUsers(args: string[], deps: UsersAdminDeps): Promise<void> {
  const [subcommand = 'status', target] = args;
  switch (subcommand) {
    case 'list':
      return runScript(deps, 'list-all-users.ts', [`--limit=${flagValue(args, 'limit', '50')}`]);
    case 'show':
      if (requireArg(target, 'ferni users show <email>')) {
        runScript(deps, 'check-my-data.ts', [`--email=${target}`]);
      }
      return;
    case 'dump':
      if (requireArg(target, 'ferni users dump <userId>')) {
        runScript(deps, 'full-user-dump.ts', [`--user=${target}`]);
      }
      return;
    case 'grant':
      if (requireArg(target, 'ferni users grant <email>')) {
        runScript(deps, 'grant-access.ts', [`--email=${target}`]);
      }
      return;
    case 'find-rich':
      return runScript(deps, 'find-rich-users.ts', []);
    case 'cleanup':
      await runDestructive(deps, 'cleanup-anonymous-users.ts', args);
      return;
    case 'delete-stale':
      await runDestructive(deps, 'delete-stale-profiles.ts', args);
      return;
    default:
      console.log(`User Management Commands:

  ferni users list [--limit=N]       List users
  ferni users show <email>           Show user details
  ferni users dump <userId>          Full user data dump
  ferni users grant <email>          Grant access to a user
  ferni users find-rich              Find users with rich data
  ferni users cleanup [--execute]    Delete anonymous Auth users (dry run by default)
  ferni users delete-stale [--execute]  Delete empty anonymous profiles (dry run by default)`);
  }
}

export async function handleWaitlist(args: string[], deps: UsersAdminDeps): Promise<void> {
  if (args[0] === 'wave') return void (await handleWaitlistWave(args.slice(1), deps)); // waitlist-wave.ts
  if (args[0] === 'guard') return handleWaitlistGuard(args.slice(1), deps);
  const [subcommand = 'status', target] = args;
  const script = 'waitlist-admin.ts';
  const project = ['--project', deps.projectId ?? 'johnb-2025'];
  switch (subcommand) {
    case 'list':
      return runScript(deps, script, ['list', ...project, `--limit=${flagValue(args, 'limit', '20')}`, `--status=${flagValue(args, 'status', 'pending')}`]); // prettier-ignore
    case 'approve':
      if (requireArg(target, 'ferni waitlist approve <email> [--apply]')) {
        runScript(deps, script, ['approve', target, ...project, ...(args.includes('--apply') ? ['--apply'] : [])]); // prettier-ignore
      }
      return;
    case 'stats':
    case 'status':
      return runScript(deps, script, ['stats', ...project]);
    case 'export':
      return runScript(deps, script, ['export', ...project, `--output=${flagValue(args, 'output', 'waitlist-export.csv')}`]); // prettier-ignore
    default:
      console.log(`Waitlist Commands (read prod Firestore; approve is a dry run without --apply):

  ferni waitlist list [--limit=N] [--status=S|all]  List entries, emails masked (default: pending)
  ferni waitlist approve <email> [--apply]          Approve; they get in on their next sign-in
  ferni waitlist stats                              Counts by status and source
  ferni waitlist export [--output=F]                Export the waitlist to CSV`);
  }
}
