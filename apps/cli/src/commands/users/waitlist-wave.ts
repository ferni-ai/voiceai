/**
 * `ferni waitlist wave`: runs scripts/waitlist-wave.ts against the configured
 * project. A dry run unless --apply is given AND the project id is typed back
 * (as for deletions in users-admin.ts); never through a shell.
 *
 *   ferni waitlist wave --wave 0 --include signed-in,pending,friends-and-family [--apply]
 *   ferni waitlist wave [--apply]          a manual wave now (guard and settings apply)
 *   ferni waitlist guard --check           the capacity guard's two readings, read-only
 */
import { spawnSync } from 'child_process';
import { join } from 'path';
import type { UsersAdminDeps } from './users-admin.js';

const PASS_THROUGH = new Set(['--wave', '--include']);

export async function handleWaitlistWave(args: string[], deps: UsersAdminDeps): Promise<boolean> {
  const projectId = deps.projectId ?? 'johnb-2025';
  const forwarded: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const [flag = ''] = (args[i] ?? '').split('=');
    if (!PASS_THROUGH.has(flag)) continue;
    forwarded.push(args[i] ?? '');
    if (!args[i]?.includes('=') && args[i + 1] !== undefined) forwarded.push(args[++i] ?? '');
  }
  const apply = args.includes('--apply');
  if (apply) {
    const typed = (await deps.ask(`This WRITES waitlist admissions in ${projectId} (no email is sent). Type the project id: `)).trim(); // prettier-ignore
    if (typed !== projectId) {
      console.log('\nProject id did not match. Nothing was written.');
      return false;
    }
  }
  const script = join(deps.scriptsDir, 'waitlist-wave.ts');
  const confirmed = apply ? ['--apply', `--confirm-project=${projectId}`] : []; // typed above
  const argv = ['tsx', script, '--project', projectId, ...forwarded, ...confirmed];
  (deps.run ?? ((cmd, a, o) => spawnSync(cmd, [...a], o)))('npx', argv, { stdio: 'inherit' });
  return true;
}

/** `ferni waitlist guard --check`: read-only; needs BILLING_EXPORT_TABLE in your shell for the cost. */
export function handleWaitlistGuard(args: string[], deps: UsersAdminDeps): void {
  if (!args.includes('--check')) return void console.log('Usage: ferni waitlist guard --check');
  const script = join(deps.scriptsDir, 'waitlist-wave.ts');
  const argv = ['tsx', script, '--project', deps.projectId ?? 'johnb-2025', '--guard-check'];
  (deps.run ?? ((cmd, a, o) => spawnSync(cmd, [...a], o)))('npx', argv, { stdio: 'inherit' });
}
