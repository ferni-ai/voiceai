/**
 * Bare require() in ESM: outreach + personality sites.
 *
 * The app runs as plain Node ESM, where a bare `require(...)` throws
 * ReferenceError and the surrounding code silently falls back. These tests
 * run the real modules in a child Node process with no `require` (see the
 * driver), because vitest itself provides `require` and hides the bug.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const driver = fileURLToPath(new URL('./fixtures/require-fix-outreach-driver.ts', import.meta.url));

type Outcome = { ok: true; value: unknown } | { ok: false; error: string };
type Results = Record<
  'userName' | 'call' | 'voiceMessage' | 'sms' | 'domainServices' | 'sharePersonalMoment',
  Outcome
>;

function runDriver(flag: string | undefined): Results {
  const env: NodeJS.ProcessEnv = { ...process.env, LOG_LEVEL: 'silent' };
  delete env.REQUIRE_FIX_OUTREACH;
  if (flag !== undefined) env.REQUIRE_FIX_OUTREACH = flag;
  const stdout = execFileSync(process.execPath, ['--import', 'tsx', driver], {
    env,
    encoding: 'utf8',
    timeout: 60_000,
  });
  const line = stdout.split('\n').find((l) => l.startsWith('RESULT:'));
  if (!line) throw new Error(`driver printed no RESULT line:\n${stdout}`);
  return JSON.parse(line.slice('RESULT:'.length)) as Results;
}

describe('former bare-require sites under plain Node ESM', () => {
  const off = runDriver(undefined);
  const on = runDriver('on');

  it('no site fails with "require is not defined"', () => {
    for (const results of [off, on]) {
      for (const outcome of Object.values(results)) {
        if (!outcome.ok) expect(outcome.error).not.toMatch(/require is not defined/);
      }
    }
  });

  describe('flag off (prod default): outreach behaviour is unchanged', () => {
    it('greets with the default "there" even when the name is known', () => {
      expect(off.userName).toEqual({ ok: true, value: 'there' });
    });

    it('call and voice_message generation still fail, so nothing new is sent', () => {
      expect(off.call.ok).toBe(false);
      expect(off.voiceMessage.ok).toBe(false);
      if (!off.call.ok) expect(off.call.error).toMatch(/REQUIRE_FIX_OUTREACH/);
    });

    it('sms generation is untouched', () => {
      expect(off.sms.ok).toBe(true);
    });
  });

  describe('REQUIRE_FIX_OUTREACH=on', () => {
    it('uses the name from the context aggregator', () => {
      expect(on.userName).toEqual({ ok: true, value: 'Sam' });
    });

    it('generates a call opening and a voicemail', () => {
      expect(on.call.ok).toBe(true);
      if (on.call.ok) {
        const value = on.call.value as { message: string; voicemailMessage?: string };
        expect(value.message.length).toBeGreaterThan(0);
        expect(value.voicemailMessage?.length ?? 0).toBeGreaterThan(0);
      }
    });

    it('generates a voice message', () => {
      expect(on.voiceMessage.ok).toBe(true);
      if (on.voiceMessage.ok) expect(String(on.voiceMessage.value).length).toBeGreaterThan(0);
    });
  });

  describe('personality sites (no live caller, unflagged)', () => {
    it('createDomainServices builds all three services', () => {
      expect(off.domainServices).toEqual({
        ok: true,
        value: ['anticipation', 'timing', 'vulnerability'],
      });
    });

    it('legacy shouldSharePersonalMoment returns a decision', () => {
      expect(off.sharePersonalMoment.ok).toBe(true);
      if (off.sharePersonalMoment.ok) {
        const value = off.sharePersonalMoment.value as { should: unknown; reason: unknown };
        expect(typeof value.should).toBe('boolean');
        expect(typeof value.reason).toBe('string');
      }
    });
  });
});
