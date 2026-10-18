import { describe, expect, it } from 'vitest';
import { argv, captureArgv } from '../utils/argv.js';

const evil = 'a@b.com; touch /tmp/pwned $(id) `id` "q" \'s\'';

describe('argv: user values never split or reach a shell', () => {
  it('splits only the literal text', () => {
    expect(argv`gcloud logging read --limit=50`).toEqual([
      'gcloud',
      'logging',
      'read',
      '--limit=50',
    ]);
  });

  it('keeps an interpolated value in one argument, whatever it contains', () => {
    expect(argv`npx tsx /s/invite.ts --email=${evil}`).toEqual([
      'npx',
      'tsx',
      '/s/invite.ts',
      `--email=${evil}`,
    ]);
    expect(argv`gcloud logging read ${evil} --project=p`).toEqual([
      'gcloud',
      'logging',
      'read',
      evil,
      '--project=p',
    ]);
  });

  it('joins a value to the literal text around it (paths with spaces stay whole)', () => {
    const dir = '/Users/x/My Repo/scripts';
    expect(argv`npx tsx ${dir}/a.ts trigger ${'job 1'}`).toEqual([
      'npx',
      'tsx',
      '/Users/x/My Repo/scripts/a.ts',
      'trigger',
      'job 1',
    ]);
  });

  it('runs the value as data, not as a command', () => {
    // printf echoes its argument back; through a shell the `;` would end the command.
    expect(captureArgv(argv`printf %s ${'a; echo INJECTED'}`)).toBe('a; echo INJECTED');
  });
});
