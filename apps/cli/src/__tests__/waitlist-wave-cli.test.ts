import { describe, expect, it, vi } from 'vitest';
import { handleWaitlist, type UsersAdminDeps } from '../commands/users/users-admin.js';

function deps(answer = '') {
  return {
    scriptsDir: '/repo/scripts',
    projectId: 'johnb-2025',
    run: vi.fn(() => ({ status: 0 })),
    ask: vi.fn(async () => answer),
  } satisfies UsersAdminDeps;
}
const WAVE0 = ['wave', '--wave', '0', '--include', 'signed-in,pending,friends-and-family'];
const SCRIPT = ['tsx', '/repo/scripts/waitlist-wave.ts', '--project', 'johnb-2025', '--wave', '0', '--include', 'signed-in,pending,friends-and-family']; // prettier-ignore

describe('ferni waitlist wave', () => {
  it('is a dry run by default: no --apply reaches the script, nothing is asked', async () => {
    const d = deps();
    await handleWaitlist(WAVE0, d);
    expect(d.ask).not.toHaveBeenCalled();
    expect(d.run).toHaveBeenCalledWith('npx', SCRIPT, { stdio: 'inherit' });
  });

  it('--apply writes only after the project id is typed back', async () => {
    const wrong = deps('prod');
    await handleWaitlist([...WAVE0, '--apply'], wrong);
    expect(wrong.run).not.toHaveBeenCalled();
    const right = deps('johnb-2025');
    await handleWaitlist([...WAVE0, '--apply'], right);
    expect(right.run).toHaveBeenCalledWith('npx', [...SCRIPT, '--apply', '--confirm-project=johnb-2025'], { stdio: 'inherit' }); // prettier-ignore
  });

  it('forwards only known flags, each as one argv element', async () => {
    const d = deps();
    await handleWaitlist(['wave', '--wave=0', '--include', 'pending; touch /tmp/x', '--project', 'other'], d); // prettier-ignore
    expect(d.run).toHaveBeenCalledWith('npx', ['tsx', '/repo/scripts/waitlist-wave.ts', '--project', 'johnb-2025', '--wave=0', '--include', 'pending; touch /tmp/x'], { stdio: 'inherit' }); // prettier-ignore
  });

  it('guard --check runs the read-only guard reading; without --check it runs nothing', async () => {
    const d = deps();
    await handleWaitlist(['guard', '--check'], d);
    expect(d.run).toHaveBeenCalledWith('npx', ['tsx', '/repo/scripts/waitlist-wave.ts', '--project', 'johnb-2025', '--guard-check'], { stdio: 'inherit' }); // prettier-ignore
    const none = deps();
    await handleWaitlist(['guard'], none);
    expect(none.run).not.toHaveBeenCalled();
    expect(none.ask).not.toHaveBeenCalled();
  });
});
