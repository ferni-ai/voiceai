/**
 * What a POST /apply body to the dev switchboard may ask for
 * (docs/plans/2026-11-16-dev-flag-switchboard.md, "2. Server"): switchable per-file
 * flags only, each to one of its modes, or reset.
 */
import { describe, expect, it } from 'vitest';
import { validateApply } from '../domain/apply-request.js';

describe('validateApply', () => {
  const refuses = (body: unknown) => {
    const result = validateApply(body);
    expect(result.ok).toBe(false);
    return result.ok ? [] : result.errors;
  };

  it('refuses a real agent secret that is not a flag file', () => {
    expect(refuses({ set: { CARTESIA_MODEL: 'on' }, reset: [] })).toEqual([
      'CARTESIA_MODEL is not a switchable agent flag',
    ]);
  });

  it('refuses ALLOW_PRODUCTION_DATA, in set and in reset', () => {
    expect(refuses({ set: { ALLOW_PRODUCTION_DATA: 'on' }, reset: [] })[0]).toContain(
      'ALLOW_PRODUCTION_DATA'
    );
    expect(refuses({ set: {}, reset: ['ALLOW_PRODUCTION_DATA'] })[0]).toContain(
      'ALLOW_PRODUCTION_DATA'
    );
  });

  it('refuses a numeric config flag, whatever the value', () => {
    expect(refuses({ set: { LATENCY_ARM_PERCENT: 'off' }, reset: [] })[0]).toContain(
      'LATENCY_ARM_PERCENT'
    );
    expect(refuses({ set: { LATENCY_ARM_PERCENT: 'on' }, reset: [] })[0]).toContain(
      'LATENCY_ARM_PERCENT'
    );
    expect(refuses({ set: {}, reset: ['WORKER_RECYCLE_RSS_MB'] })[0]).toContain(
      'WORKER_RECYCLE_RSS_MB'
    );
  });

  it('refuses shadow on a flag that has no shadow mode', () => {
    expect(refuses({ set: { ABUSE_DISCLOSURE_PATTERNS: 'shadow' }, reset: [] })[0]).toContain(
      'ABUSE_DISCLOSURE_PATTERNS'
    );
  });

  it('refuses a value the reader of a directly read flag ignores', () => {
    expect(refuses({ set: { CRISIS_MEANS_IN_HAND: 'on' }, reset: [] })[0]).toContain(
      'allowed: off, shadow, live'
    );
    refuses({ set: { SELF_VOICE_GATE: 'on' }, reset: [] });
    refuses({ set: { ATTUNE_LEDGER: 'shadow' }, reset: [] });
  });

  it('accepts live where the reader acts on it', () => {
    expect(validateApply({ set: { CRISIS_MEANS_IN_HAND: 'live' }, reset: [] })).toEqual({
      ok: true,
      request: { set: { CRISIS_MEANS_IN_HAND: 'live' }, reset: [] },
    });
  });

  it('refuses a value that is not one of the modes', () => {
    refuses({ set: { ABUSE_DISCLOSURE_PATTERNS: 'true' }, reset: [] });
    refuses({ set: { ABUSE_DISCLOSURE_PATTERNS: 'ON' }, reset: [] });
    refuses({ set: { ABUSE_DISCLOSURE_PATTERNS: 1 }, reset: [] });
  });

  it('refuses a name in both set and reset', () => {
    expect(
      refuses({ set: { SOUND_CONDUCTOR: 'on' }, reset: ['SOUND_CONDUCTOR'] }).join(' ')
    ).toContain('SOUND_CONDUCTOR');
  });

  it('refuses an empty request', () => {
    refuses({ set: {}, reset: [] });
    refuses({});
  });

  it('refuses a body that is not an object of the right shape', () => {
    for (const body of [null, undefined, 'SOUND_CONDUCTOR=on', 42, [], ['SOUND_CONDUCTOR']]) {
      refuses(body);
    }
    refuses({ set: [], reset: [] });
    refuses({ set: {}, reset: 'SOUND_CONDUCTOR' });
    refuses({ set: {}, reset: [42] });
    refuses({ set: {}, reset: ['SOUND_CONDUCTOR', 'SOUND_CONDUCTOR'] });
    refuses({ set: { SOUND_CONDUCTOR: 'on' }, reset: [], extra: true });
  });

  it('refuses inherited and prototype names', () => {
    refuses({ set: {}, reset: ['__proto__'] });
    refuses({ set: {}, reset: ['toString'] });
    refuses(JSON.parse('{"set":{"__proto__":"on"},"reset":[]}'));
  });

  it('accepts shadow on a shadow-capable flag plus a reset', () => {
    expect(
      validateApply({ set: { SOUND_CONDUCTOR: 'shadow' }, reset: ['ABUSE_DISCLOSURE_PATTERNS'] })
    ).toEqual({
      ok: true,
      request: { set: { SOUND_CONDUCTOR: 'shadow' }, reset: ['ABUSE_DISCLOSURE_PATTERNS'] },
    });
  });
});
