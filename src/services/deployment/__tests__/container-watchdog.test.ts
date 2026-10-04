import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../slack-notifications.js', () => ({ SlackNotificationService: class {} }));
vi.mock('../../self-healing/ai-diagnostics.js', () => ({
  quickDiagnose: () => null,
  analyzeFailure: async () => null,
}));

const { removeStaleTempFiles } = await import('../container-watchdog.js');

describe('removeStaleTempFiles', () => {
  const now = Date.now();
  const hoursAgo = (hours: number): Date => new Date(now - hours * 60 * 60 * 1000);

  function makeDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'watchdog-test-'));
    const write = (name: string, age: Date): void => {
      writeFileSync(join(dir, name), 'x');
      utimesSync(join(dir, name), age, age);
    };
    write('ferni-sfx-old.mp3', hoursAgo(2));
    write('ferni-sfx-new.mp3', hoursAgo(0.1));
    write('someone-elses-file', hoursAgo(5));
    mkdirSync(join(dir, 'ferni-cache'));
    utimesSync(join(dir, 'ferni-cache'), hoursAgo(5), hoursAgo(5));
    return dir;
  }

  it('removes only old ferni-* files', () => {
    const dir = makeDir();
    expect(removeStaleTempFiles(dir, now)).toBe(1);
    expect(existsSync(join(dir, 'ferni-sfx-old.mp3'))).toBe(false);
    expect(existsSync(join(dir, 'ferni-sfx-new.mp3'))).toBe(true);
  });

  it("leaves other processes' files and cache directories alone", () => {
    const dir = makeDir();
    removeStaleTempFiles(dir, now);
    expect(existsSync(join(dir, 'someone-elses-file'))).toBe(true);
    expect(existsSync(join(dir, 'ferni-cache'))).toBe(true);
  });
});
