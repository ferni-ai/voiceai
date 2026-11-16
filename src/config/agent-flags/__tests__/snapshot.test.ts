/**
 * The flag snapshot the dev agent writes on boot (docs/plans/2026-11-16-dev-flag-switchboard.md,
 * "1. Agent reports what it sees"): one entry per per-file flag, raw as the env has it and
 * resolved by the same rule the page uses (resolvedValue), and nothing else from the env.
 */
import { describe, expect, it } from 'vitest';
import { buildFlagSnapshot } from '../domain/snapshot.js';
import { agentFlags } from '../domain/switchable.js';

const NOW = new Date('2026-11-16T12:00:00.000Z');

describe('buildFlagSnapshot', () => {
  it('has exactly one entry per agent flag, and no other env key', () => {
    const env = { ABUSE_DISCLOSURE_PATTERNS: 'ON', LIVEKIT_API_SECRET: 'x', GEMINI_API_KEY: 'y' };
    const snap = buildFlagSnapshot(env, NOW, 'abc1234');
    expect(Object.keys(snap.flags)).toEqual(agentFlags().map((f) => f.name));
    expect(Object.keys(snap.flags)).not.toContain('LIVEKIT_API_SECRET');
    // Not under any key, nor as any value anywhere in the document.
    const json = JSON.stringify(snap);
    expect(json).not.toContain('LIVEKIT_API_SECRET');
    expect(json).not.toContain('GEMINI_API_KEY');
  });

  it('records the raw env string and the value the reader resolves it to', () => {
    const snap = buildFlagSnapshot({ ABUSE_DISCLOSURE_PATTERNS: 'ON' }, NOW, null);
    expect(snap.flags.ABUSE_DISCLOSURE_PATTERNS).toEqual({ raw: 'ON', resolved: 'on' });
  });

  it('gives an unset flag raw null and its default (a kill switch stays on)', () => {
    const snap = buildFlagSnapshot({}, NOW, null);
    expect(snap.flags.APP_HANGUP_SIGNAL).toEqual({ raw: null, resolved: 'on' });
    expect(snap.flags.ABUSE_DISCLOSURE_PATTERNS).toEqual({ raw: null, resolved: 'off' });
  });

  it('gives a numeric config flag its raw value, or its default when unset', () => {
    expect(
      buildFlagSnapshot({ WORKER_RECYCLE_MAX_CALLS: '25' }, NOW, null).flags
        .WORKER_RECYCLE_MAX_CALLS
    ).toEqual({
      raw: '25',
      resolved: '25',
    });
    expect(buildFlagSnapshot({}, NOW, null).flags.WORKER_RECYCLE_MAX_CALLS).toEqual({
      raw: null,
      resolved: '0',
    });
  });

  it("resolves a flag with its own reader's words, not as plain on/off", () => {
    // CRISIS_MEANS_IN_HAND reads shadow | live; 'on' is not one of its words, so it stays shadow.
    const means = buildFlagSnapshot({ CRISIS_MEANS_IN_HAND: 'on' }, NOW, null);
    expect(means.flags.CRISIS_MEANS_IN_HAND).toEqual({ raw: 'on', resolved: 'shadow' });
    // SESSION_OWN_VOICE is compared === 'on', so 'ON' leaves it off.
    const strict = buildFlagSnapshot({ SESSION_OWN_VOICE: 'ON' }, NOW, null);
    expect(strict.flags.SESSION_OWN_VOICE).toEqual({ raw: 'ON', resolved: 'off' });
    // A flagModeOf flag can be in shadow.
    const shadow = buildFlagSnapshot({ SOUND_CONDUCTOR: 'shadow' }, NOW, null);
    expect(shadow.flags.SOUND_CONDUCTOR).toEqual({ raw: 'shadow', resolved: 'shadow' });
  });

  it('stamps the boot time and build sha', () => {
    const snap = buildFlagSnapshot({}, NOW, 'abc1234');
    expect(snap.startedAt).toBe('2026-11-16T12:00:00.000Z');
    expect(snap.buildSha).toBe('abc1234');
    expect(buildFlagSnapshot({}, NOW, null).buildSha).toBeNull();
  });
});
