import { describe, expect, it, vi } from 'vitest';
import { handleUsers, handleWaitlist, type UsersAdminDeps } from '../commands/users/users-admin.js';

function deps(answer = ''): UsersAdminDeps & {
  run: ReturnType<typeof vi.fn>;
  ask: ReturnType<typeof vi.fn>;
} {
  return {
    scriptsDir: '/repo/scripts',
    projectId: 'johnb-2025',
    run: vi.fn(() => ({ status: 0 })),
    ask: vi.fn(async () => answer),
  };
}

const evil = 'a@b.com; touch /tmp/pwned';

describe('no shell: user input stays one argv element', () => {
  it.each([
    ['users show', () => handleUsers, ['show', evil], 'check-my-data.ts', `--email=${evil}`],
    ['users grant', () => handleUsers, ['grant', evil], 'grant-access.ts', `--email=${evil}`],
    ['users dump', () => handleUsers, ['dump', evil], 'full-user-dump.ts', `--user=${evil}`],
  ])('%s', async (_name, handler, args, script, flag) => {
    const d = deps();
    await handler()(args, d);
    expect(d.run).toHaveBeenCalledTimes(1);
    expect(d.run).toHaveBeenCalledWith('npx', ['tsx', `/repo/scripts/${script}`, flag], {
      stdio: 'inherit',
    });
  });

  it('waitlist approve: the email is one argv element, and no --apply unless asked', async () => {
    const d = deps();
    await handleWaitlist(['approve', evil], d);
    expect(d.run).toHaveBeenCalledWith(
      'npx',
      ['tsx', '/repo/scripts/waitlist-admin.ts', 'approve', evil, '--project', 'johnb-2025'],
      { stdio: 'inherit' }
    );
  });

  it('never invokes a shell for any subcommand', async () => {
    const d = deps('johnb-2025');
    for (const sub of ['list', 'show', 'dump', 'grant', 'find-rich', 'cleanup', 'delete-stale']) {
      await handleUsers([sub, evil, '--execute'], d);
    }
    for (const sub of ['list', 'approve', 'stats', 'export']) {
      await handleWaitlist([sub, evil], d);
    }
    for (const [cmd] of d.run.mock.calls) expect(cmd).toBe('npx');
  });
});

describe.each([
  ['cleanup', 'cleanup-anonymous-users.ts'],
  ['delete-stale', 'delete-stale-profiles.ts'],
])('users %s', (sub, script) => {
  it('is a dry run without --execute and asks nothing', async () => {
    const d = deps();
    await handleUsers([sub], d);
    expect(d.ask).not.toHaveBeenCalled();
    expect(d.run).toHaveBeenCalledWith('npx', ['tsx', `/repo/scripts/${script}`, '--dry-run'], {
      stdio: 'inherit',
    });
  });

  it('runs nothing when the typed project id is wrong', async () => {
    const d = deps('johnb-2024');
    await handleUsers([sub, '--execute'], d);
    expect(d.ask).toHaveBeenCalledTimes(1);
    expect(d.run).not.toHaveBeenCalled();
  });

  it('passes --execute and the typed project id through to the script', async () => {
    const d = deps('johnb-2025');
    await handleUsers([sub, '--execute'], d);
    expect(d.run).toHaveBeenCalledWith(
      'npx',
      ['tsx', `/repo/scripts/${script}`, '--execute', '--confirm-project=johnb-2025'],
      { stdio: 'inherit' }
    );
  });
});

describe('users undo-dnc', () => {
  it('is a dry run by default, the user id one argv element', async () => {
    const d = deps();
    await handleUsers(['undo-dnc', evil], d);
    expect(d.ask).not.toHaveBeenCalled();
    expect(d.run).toHaveBeenCalledWith(
      'npx',
      ['tsx', '/repo/scripts/undo-own-dnc.ts', `--user=${evil}`, '--dry-run'],
      { stdio: 'inherit' }
    );
  });

  it('--execute asks for the project id and runs only when it matches', async () => {
    const wrong = deps('nope');
    await handleUsers(['undo-dnc', 'u1', '--execute'], wrong);
    expect(wrong.run).not.toHaveBeenCalled();
    const right = deps('johnb-2025');
    await handleUsers(['undo-dnc', 'u1', '--execute'], right);
    expect(right.run).toHaveBeenCalledWith(
      'npx',
      [
        'tsx',
        '/repo/scripts/undo-own-dnc.ts',
        '--user=u1',
        '--execute',
        '--confirm-project=johnb-2025',
      ],
      { stdio: 'inherit' }
    );
  });
});
