/**
 * The EFFECTIVE_SETTINGS line must never carry a secret value. Each test plants a
 * recognisable fake secret under one name shape and checks it never reaches the line.
 */
import { describe, expect, it } from 'vitest';
import { ENV_READ_NAMES } from '../env-read-names.generated.js';
import { FLAG_MANIFEST } from '../flag-manifest.js';
import {
  PART_MAX_CHARS,
  SET,
  effectiveSettings,
  effectiveSettingsLines,
} from '../effective-settings.js';

const MARK = 'LEAKMARK';

/** Everything the agent logs at boot, as one text, for leak checks. */
const bootText = (env: Record<string, string | undefined>) =>
  effectiveSettingsLines(env).join('\n');

/** Names that print their value by design; the leak test must not plant a fake under them. */
const PRINTABLE_NAMES = [
  'AGENT_NAME',
  'BUILD_SHA',
  'GEMINI_MODEL',
  'GOOGLE_CLOUD_PROJECT',
  'NODE_ENV',
  'PERSONA_ID',
  'PORT',
];

/** Name shapes a secret can hide under, including ones the classifier must catch by substring. */
const SECRET_SHAPES = [
  'MY_API_KEY',
  'api_key',
  'ADMIN_KEYS',
  'WORKER_SECRET',
  'x_token',
  'DB_PASSWORD',
  'SMTP_PASS',
  'PASSPHRASE',
  'GOOGLE_CREDENTIALS_JSON',
  'SERVICE_PRIVATE_NOTES',
  'SENTRY_DSN',
  'OAUTH_AUTH_HEADER',
  'TLS_CERT_PEM',
  'SIGNING_MATERIAL',
  'SLACK_WEBHOOK',
  'SOME_SERVICE_URL',
  'mystery_setting',
  'VENDOR_ID',
];

function fake(name: string): string {
  return `${MARK}-${name}-7f3a9c`;
}

describe('effectiveSettings: no secret value leaks', () => {
  it.each(SECRET_SHAPES)('hides a fake secret set under %s', (name) => {
    const line = bootText({ [name]: fake(name) });
    expect(line).not.toContain(MARK);
  });

  // Routes a secret could take even under a printable name, or a secret-shaped flag name.
  it.each([
    ['BUILD_SHA', `https://fakeuser:${MARK}@host`],
    ['BUILD_SHA', `${MARK}-SHA-1`],
    ['GOOGLE_CLOUD_PROJECT', `https://u:${MARK}/PW@h`],
    ['GOOGLE_CLOUD_PROJECT', `https://u:${MARK} PW@h`],
    ['GOOGLE_CLOUD_PROJECT', `u:${MARK}@h`],
    ['GEMINI_MODEL', `sk-${MARK}_TOKEN`],
    ['PERSONA_ID', `${MARK}`],
    ['PORT', `${MARK}`],
    ['APPROVALS_PASSKEYS', MARK],
    ['SCHEDULED_JOBS_AUTH', `${MARK}secretword`],
    ['ACTION_CLAIM_GUARD', `${MARK}password`],
  ])('hides %s set to a value shaped like a secret (%s)', (name, value) => {
    const line = bootText({ [name]: value });
    expect(line).not.toContain(MARK);
  });

  it('shows a flag that is set to a manifest word, even under a secret-shaped name', () => {
    expect(effectiveSettings({ SCHEDULED_JOBS_AUTH: 'off' }).flags.SCHEDULED_JOBS_AUTH).toBe('off');
  });

  it('hides every planted value when all non-printable names are set to fakes', () => {
    const env: Record<string, string> = {};
    for (const name of ENV_READ_NAMES) if (!PRINTABLE_NAMES.includes(name)) env[name] = fake(name);
    for (const name of Object.keys(FLAG_MANIFEST)) env[name] = fake(name);
    const line = bootText(env);
    expect(line).not.toContain(MARK);
  });

  it('keeps a printable name with an ordinary value', () => {
    const settings = effectiveSettings({ GEMINI_MODEL: 'gemini-3.5-flash' });
    expect(settings.env.GEMINI_MODEL).toBe('gemini-3.5-flash');
  });

  it('never prints a name that matches the secret classifier', () => {
    // A printable name that looked secret would leak its value.
    for (const name of ['NODE_ENV', 'PERSONA_ID', 'PORT', 'AGENT_NAME', 'BUILD_SHA']) {
      expect(name, name).not.toMatch(
        /KEY|SECRET|TOKEN|PASS|CREDENTIAL|PRIVATE|DSN|AUTH|CERT|SIGNING|WEBHOOK|URL/
      );
    }
  });
});

describe('effectiveSettings: contents and hash', () => {
  it('lists every manifest flag with its default when unset', () => {
    const settings = effectiveSettings({});
    expect(Object.keys(settings.flags).sort()).toEqual(Object.keys(FLAG_MANIFEST).sort());
    expect(settings.flags.TURN_KEEPER).toBe(FLAG_MANIFEST.TURN_KEEPER.default);
    expect(settings.flags.ATTUNE).toBe('off');
  });

  it('shows a flag set to a word as that word, lower-cased', () => {
    expect(effectiveSettings({ ATTUNE: ' ON ' }).flags.ATTUNE).toBe('on');
  });

  it('hides a flag value that is not a plain word', () => {
    expect(effectiveSettings({ ATTUNE: `${MARK}9` }).flags.ATTUNE).toBe(SET);
  });

  it('prints a flag whose name contains a secret-looking part', () => {
    // BYPASS_TEAM_UNLOCKS contains PASS but is a behaviour flag, not a secret.
    expect(effectiveSettings({ BYPASS_TEAM_UNLOCKS: 'on' }).flags.BYPASS_TEAM_UNLOCKS).toBe('on');
  });

  it('reports the commit from BUILD_SHA, or unknown', () => {
    expect(effectiveSettings({ BUILD_SHA: 'abc1234' }).commit).toBe('abc1234');
    expect(effectiveSettings({}).commit).toBe('unknown');
  });

  it('hides a BUILD_SHA that is not a commit hash', () => {
    expect(effectiveSettings({ BUILD_SHA: `${MARK}-SHA` }).commit).toBe(SET);
  });

  it('does not change the hash when a secret is first set', () => {
    expect(effectiveSettings({ MY_API_KEY: 'one' }).hash).toBe(effectiveSettings({}).hash);
  });

  it('gives the same hash for the same non-secret settings', () => {
    const env = { ATTUNE: 'on', GEMINI_MODEL: 'gemini-3.5-flash' };
    expect(effectiveSettings(env).hash).toBe(effectiveSettings({ ...env }).hash);
  });

  it('changes the hash when a printed setting changes', () => {
    const a = effectiveSettings({ ATTUNE: 'on' }).hash;
    const b = effectiveSettings({ ATTUNE: 'off' }).hash;
    expect(a).not.toBe(b);
  });

  it('does not change the hash when only a secret changes', () => {
    const a = effectiveSettings({ ATTUNE: 'on', MY_API_KEY: 'one' }).hash;
    const b = effectiveSettings({ ATTUNE: 'on', MY_API_KEY: 'two' }).hash;
    const c = effectiveSettings({ ATTUNE: 'on' }).hash;
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  /** Joins the parts back into one settings object, as the snapshot script will. */
  const reassemble = (lines: string[]) => {
    const flags: Record<string, string> = {};
    const env: Record<string, string> = {};
    lines.forEach((line, i) => {
      const body = JSON.parse(line.slice('EFFECTIVE_SETTINGS '.length));
      expect(body.part).toBe(i + 1);
      expect(body.parts).toBe(lines.length);
      Object.assign(flags, body.flags);
      Object.assign(env, body.env);
    });
    return { flags, env };
  };

  it('splits into numbered parts under the limit that reassemble to the full settings', () => {
    const env: Record<string, string> = {};
    for (const name of ENV_READ_NAMES) {
      if (!PRINTABLE_NAMES.includes(name) && !(name in FLAG_MANIFEST)) env[name] = fake(name);
    }
    for (const name of Object.keys(FLAG_MANIFEST)) env[name] = 'learned';
    const lines = effectiveSettingsLines(env);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.startsWith('EFFECTIVE_SETTINGS {'), line.slice(0, 40)).toBe(true);
      expect(line.includes('\n')).toBe(false);
      expect(line.length).toBeLessThanOrEqual(PART_MAX_CHARS);
    }
    const settings = effectiveSettings(env);
    const joined = reassemble(lines);
    expect(joined.flags).toEqual(settings.flags);
    expect(joined.env).toEqual(settings.env);
    const first = JSON.parse(lines[0].slice('EFFECTIVE_SETTINGS '.length));
    expect(first.hash).toBe(settings.hash);
    expect(first.commit).toBe(settings.commit);
  });

  it('keeps the commit and hash in every part', () => {
    const lines = effectiveSettingsLines({ ATTUNE: 'on', BUILD_SHA: 'abc1234' });
    for (const line of lines) {
      const body = JSON.parse(line.slice('EFFECTIVE_SETTINGS '.length));
      expect(body.commit).toBe('abc1234');
      expect(body.hash).toBe(effectiveSettings({ ATTUNE: 'on', BUILD_SHA: 'abc1234' }).hash);
    }
    expect(reassemble(lines).flags.ATTUNE).toBe('on');
  });
});
