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

function runDriver(flags: Record<string, string>): Results {
  const env: NodeJS.ProcessEnv = { ...process.env, LOG_LEVEL: 'silent' };
  delete env.REQUIRE_FIX_OUTREACH;
  delete env.REQUIRE_FIX_OUTREACH_NAME;
  Object.assign(env, flags);
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
  const off = runDriver({});
  const nameOn = runDriver({ REQUIRE_FIX_OUTREACH_NAME: 'on' });
  const callsOn = runDriver({ REQUIRE_FIX_OUTREACH: 'on' });

  it('no site fails with "require is not defined"', () => {
    for (const results of [off, nameOn, callsOn]) {
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

  describe('REQUIRE_FIX_OUTREACH_NAME=on', () => {
    it('uses the name from the context aggregator', () => {
      expect(nameOn.userName).toEqual({ ok: true, value: 'Sam' });
    });

    it('does not turn on call or voice_message outreach', () => {
      expect(nameOn.call.ok).toBe(false);
      expect(nameOn.voiceMessage.ok).toBe(false);
    });
  });

  describe('REQUIRE_FIX_OUTREACH=on', () => {
    it('generates a call opening and a voicemail', () => {
      expect(callsOn.call.ok).toBe(true);
      if (callsOn.call.ok) {
        const value = callsOn.call.value as { message: string; voicemailMessage?: string };
        expect(value.message.length).toBeGreaterThan(0);
        expect(value.voicemailMessage?.length ?? 0).toBeGreaterThan(0);
      }
    });

    it('generates a voice message', () => {
      expect(callsOn.voiceMessage.ok).toBe(true);
      if (callsOn.voiceMessage.ok) {
        expect(String(callsOn.voiceMessage.value).length).toBeGreaterThan(0);
      }
    });

    it('does not change the greeting name', () => {
      expect(callsOn.userName).toEqual({ ok: true, value: 'there' });
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
