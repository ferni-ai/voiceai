/**
 * Every value in every full-path profile must be the mode its flag's own resolver returns.
 *
 * A value a resolver doesn't know falls back without a word: `all-on` set
 * CRISIS_MEANS_IN_HAND 'on', which resolveMeansInHandMode reads as shadow, and
 * THIRD_PARTY_SELF_HARM 'on', which resolveWhoMode reads as off. So "every brake on" ran two of
 * them in shadow or off. Each flag here is read by the production resolver (or, where that is
 * private, by the production code's own report of it), never by a copy of its parsing.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logInfo = vi.hoisted(() => vi.fn());
vi.mock('../../../src/utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/utils/safe-logger.js')>();
  const spyInfo = <T extends object>(logger: T): T =>
    new Proxy(logger, {
      get: (target, prop, receiver) => {
        const value = Reflect.get(target, prop, receiver);
        if (prop !== 'info' || typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          logInfo(...args);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  return {
    ...real,
    createLogger: (...args: Parameters<typeof real.createLogger>) =>
      spyInfo(real.createLogger(...args)),
  };
});

import { flagModeOf, flagOn } from '../../../src/config/env-flag.js';
import type { FlagName } from '../../../src/config/flag-manifest.js';
import { withHeldRead } from '../../../src/agents/personas/crisis-read-joined-turn.js';
import { resolveCrisisGuardMode } from '../../../src/agents/safety/crisis-shadow.js';
import {
  adjudicatorCheckinsMayChangeReplies,
  resolveCrisisAdjudicatorMode,
  resolveCrisisAdjudicatorTimeoutMs,
} from '../../../src/services/safety/crisis-adjudicator.js';
import { resolveCrisisAgreementGate } from '../../../src/services/safety/crisis-agreement.js';
import {
  resolveCrisisClassifierMode,
  resolveCrisisClassifierTimeoutMs,
} from '../../../src/services/safety/crisis-classifier.js';
import { resolveClassifierOnlyCheckin } from '../../../src/services/safety/crisis-classifier-only.js';
import {
  resolveEasingMode,
  resolveEasingTimeoutMs,
} from '../../../src/services/safety/crisis-classifier-only-live.js';
import {
  resolveCrisisSecondRead,
  resolveCrisisSecondReadGraceMs,
} from '../../../src/services/safety/crisis-classifier-v3.js';
import {
  afterCheckLoneRead,
  resetConfirmedCallRisk,
} from '../../../src/services/safety/crisis-confirmed-risk.js';
import { resolveCrisisEverydayRules } from '../../../src/services/safety/crisis-everyday.js';
import { resolveGradedResponseMode } from '../../../src/services/safety/crisis-graded-shadow.js';
import {
  DEFAULT_GROUNDED_RELEASE_TIMEOUT_MS,
  resolveGroundedReleaseMode,
} from '../../../src/services/safety/crisis-grounded-release.js';
import { agreementCacheScope } from '../../../src/services/safety/crisis-imminent-agreement.js';
import { resolveMeansInHandMode } from '../../../src/services/safety/crisis-means-in-hand.js';
import { resolveWhoMode } from '../../../src/services/safety/crisis-who.js';
import {
  resolveEarlyWarningSttForms,
  resolveEarlyWarningWordBoundary,
} from '../../../src/utils/phrase-match.js';
import { resolveSafetyWholeWordSites } from '../../../src/utils/safety-whole-word.js';
import { PROFILES, type FlagSet } from '../full-path-profiles.js';

type Resolve = (env: FlagSet) => string | Promise<string>;
const onOff = (on: boolean): string => (on ? 'on' : 'off');

/**
 * CRISIS_CONFIRMED_CALL_RISK's resolver is private; the after-check logs the mode it resolved.
 * A crisis read on a call without the agreement gate is ineligible ('needs_agreement_gate'),
 * logged with that mode; off returns before any log.
 */
async function confirmedCallRiskMode(env: FlagSet): Promise<string> {
  resetConfirmedCallRisk();
  logInfo.mockClear();
  await afterCheckLoneRead({
    call: 'profiles-test',
    input: { latest: 'a line', earlier: [] },
    verdict: { risk: 'crisis', subject: 'self' },
    detection: { isCrisis: false, severity: 0, indicators: [] },
    pattern: 'none',
    source: 'gate',
    env: { ...env, CRISIS_AGREEMENT_GATE: 'off', CRISIS_ADJUDICATOR: 'off' },
  });
  const logged = logInfo.mock.calls.find((c) => c[1] === 'CRISIS_CONFIRMED')?.[0] as
    { mode?: string; why?: string } | undefined;
  if (!logged) return 'off';
  expect(logged.why).toBe('needs_agreement_gate');
  return String(logged.mode);
}

/**
 * CRISIS_READ_JOINED_TURN's reader is private; withHeldRead asks the session how long to hold the
 * caller's line only when it is on (with the live classifier, which every profile runs).
 */
function readJoinedTurnMode(env: FlagSet): string {
  const holdMs = vi.fn(() => 0);
  const session = { on: () => undefined, off: () => undefined, unfinishedTurnHoldMs: holdMs };
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'user', content: 'a line' });
  void withHeldRead(session, ctx, { env }, vi.fn()).readAfter?.();
  return onOff(holdMs.mock.calls.length > 0);
}

/** Each profile flag's production reader. A flag missing here fails the test: audit it first. */
const RESOLVERS: Readonly<Record<string, Resolve>> = {
  CRISIS_GUARD_MODE: (env) => resolveCrisisGuardMode(env),
  CRISIS_CLASSIFIER_MODE: (env) => resolveCrisisClassifierMode(env),
  CRISIS_AGREEMENT_GATE: (env) => onOff(resolveCrisisAgreementGate(env)),
  CRISIS_CLASSIFIER_EVERYDAY_RULES: (env) => onOff(resolveCrisisEverydayRules(env)),
  // Private resolver; agreementCacheScope keys the cache by call only when it is on.
  CRISIS_IMMINENT_NEEDS_AGREEMENT: (env) => onOff(agreementCacheScope(env, 'c').length > 0),
  CRISIS_GROUNDED_RELEASE: (env) => resolveGroundedReleaseMode(env),
  CRISIS_CONFIRMED_CALL_RISK: confirmedCallRiskMode,
  CRISIS_ADJUDICATOR: (env) => resolveCrisisAdjudicatorMode(env),
  // Two readers: the shadow log (crisis-classifier-only.ts) and the live easing.
  CRISIS_CLASSIFIER_ONLY_CHECKIN: (env) =>
    resolveEasingMode(env) !== 'off' ? resolveEasingMode(env) : resolveClassifierOnlyCheckin(env),
  CRISIS_CLASSIFIER_SECOND_READ: (env) => resolveCrisisSecondRead(env),
  CRISIS_TRANSFER_EVERYDAY: (env) => onOff(flagOn('CRISIS_TRANSFER_EVERYDAY' as FlagName, env)),
  CRISIS_SAME_CALL_NOTE_FADES: (env) =>
    onOff(flagOn('CRISIS_SAME_CALL_NOTE_FADES' as FlagName, env)),
  CRISIS_SIGHT_NEEDS_CUE: (env) => onOff(flagOn('CRISIS_SIGHT_NEEDS_CUE' as FlagName, env)),
  CRISIS_MEANS_IN_HAND: (env) => resolveMeansInHandMode(env),
  SAFETY_WHOLE_WORD_SITES: (env) => resolveSafetyWholeWordSites(env),
  EARLY_WARNING_WORD_BOUNDARY: (env) => onOff(resolveEarlyWarningWordBoundary(env)),
  EARLY_WARNING_STT_FORMS: (env) => resolveEarlyWarningSttForms(env),
  THIRD_PARTY_SELF_HARM: (env) => resolveWhoMode(env),
  CRISIS_EVENT_RECORD: (env) => flagModeOf('CRISIS_EVENT_RECORD' as FlagName, env),
  SEXUAL_TOPIC_BOUNDARY: (env) => onOff(flagOn('SEXUAL_TOPIC_BOUNDARY' as FlagName, env)),
  MINOR_CARE: (env) => flagModeOf('MINOR_CARE' as FlagName, env),
  CRISIS_GRADED_RESPONSE: (env) => resolveGradedResponseMode(env),
  CRISIS_READ_JOINED_TURN: readJoinedTurnMode,
  MINOR_CRISIS_CARE: (env) => onOff(flagOn('MINOR_CRISIS_CARE' as FlagName, env)),
  CRISIS_CLASSIFIER_BLOCKED_SIGNAL: (env) =>
    onOff(flagOn('CRISIS_CLASSIFIER_BLOCKED_SIGNAL' as FlagName, env)),
  CRISIS_CLASSIFIER_TIMEOUT_MS: (env) => String(resolveCrisisClassifierTimeoutMs(env)),
  CRISIS_CLASSIFIER_ONLY_TIMEOUT_MS: (env) => String(resolveEasingTimeoutMs(env)),
  CRISIS_SECOND_READ_GRACE_MS: (env) => String(resolveCrisisSecondReadGraceMs(env)),
  // Private reader (timeoutFrom): this pins only that the value is the exported default, the one
  // value any profile gives it. A profile that sets another value needs an observer here first.
  CRISIS_GROUNDED_RELEASE_TIMEOUT_MS: () => String(DEFAULT_GROUNDED_RELEASE_TIMEOUT_MS),
  CRISIS_ADJUDICATOR_TIMEOUT_MS: (env) => String(resolveCrisisAdjudicatorTimeoutMs(env)),
};

/** prod-2026-11-11's flags prod had no value for: each must be its code default. */
const PROD_NO_VALUE_2026_11_11 = [
  'CRISIS_GRADED_RESPONSE',
  'CRISIS_READ_JOINED_TURN',
  'MINOR_CRISIS_CARE',
  'CRISIS_CLASSIFIER_BLOCKED_SIGNAL',
  'CRISIS_CLASSIFIER_TIMEOUT_MS',
  'CRISIS_CLASSIFIER_ONLY_TIMEOUT_MS',
  'CRISIS_SECOND_READ_GRACE_MS',
  'CRISIS_GROUNDED_RELEASE_TIMEOUT_MS',
  'CRISIS_ADJUDICATOR_TIMEOUT_MS',
] as const;

/**
 * Modes the code itself holds back, deliberately and with a log, not a misspelt value: live
 * check-ins wait on the adjudicator's hold, and CRISIS_GRADED_RESPONSE live is shadow until PR-2.
 */
const HELD: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  CRISIS_ADJUDICATOR: adjudicatorCheckinsMayChangeReplies() ? {} : { live: 'shadow' },
  CRISIS_CLASSIFIER_ONLY_CHECKIN: adjudicatorCheckinsMayChangeReplies() ? {} : { live: 'held' },
  CRISIS_GRADED_RESPONSE: { live: 'shadow' },
};

/** A named entry, or a test failure naming what is missing. */
function entry<T>(table: Readonly<Record<string, T>>, name: string): T {
  const value = table[name];
  if (value === undefined) throw new Error(`no entry for ${name}`);
  return value;
}

const rows = Object.entries(PROFILES).flatMap(([profile, flags]) =>
  Object.entries(flags).map(([flag, value]) => ({ profile, flag, value, flags }))
);

beforeEach(() => resetConfirmedCallRisk());

describe('full-path profiles: every value is a mode its resolver returns', () => {
  it('has a production reader for every flag a profile sets', () => {
    const missing = [...new Set(rows.map((r) => r.flag))].filter((f) => !RESOLVERS[f]);
    expect(missing).toEqual([]);
  });

  it.each(rows.map((r) => [r.profile, r.flag, r.value, r] as const))(
    '%s %s=%s resolves to itself',
    async (_profile, flag, value, row) => {
      const resolved = await entry(RESOLVERS, flag)(row.flags);
      expect(resolved).toBe(HELD[flag]?.[value] ?? value);
    }
  );

  it('prod-2026-11-11 is prod-2026-11-01 with means in hand live, plus code defaults', () => {
    const { CRISIS_MEANS_IN_HAND: was, ...rest11 } = entry(PROFILES, 'prod-2026-11-01');
    const { CRISIS_MEANS_IN_HAND: now, ...rest } = entry(PROFILES, 'prod-2026-11-11');
    expect([was, now]).toEqual(['shadow', 'live']);
    const carried = Object.fromEntries(
      Object.entries(rest).filter(
        ([flag]) => !(PROD_NO_VALUE_2026_11_11 as readonly string[]).includes(flag)
      )
    );
    expect(carried).toEqual(rest11);
    expect(Object.keys(rest).filter((flag) => !(flag in rest11))).toEqual([
      ...PROD_NO_VALUE_2026_11_11,
    ]);
  });

  it.each(PROD_NO_VALUE_2026_11_11)(
    'prod-2026-11-11 %s is its code default (dropping it changes nothing)',
    async (flag) => {
      const profile = entry(PROFILES, 'prod-2026-11-11');
      const { [flag]: _value, ...unset } = profile;
      expect(await entry(RESOLVERS, flag)(unset)).toBe(await entry(RESOLVERS, flag)(profile));
    }
  );

  it('the reader can tell a fallback from the mode asked for', async () => {
    // Guards the guard: a misspelt value must not resolve to itself.
    expect(resolveMeansInHandMode({ CRISIS_MEANS_IN_HAND: 'on' })).toBe('shadow');
    expect(resolveWhoMode({ THIRD_PARTY_SELF_HARM: 'on' })).toBe('off');
    expect(await confirmedCallRiskMode({ CRISIS_CONFIRMED_CALL_RISK: 'live' })).toBe('off');
    expect(await confirmedCallRiskMode({ CRISIS_CONFIRMED_CALL_RISK: 'shadow' })).toBe('shadow');
    expect(await confirmedCallRiskMode({ CRISIS_CONFIRMED_CALL_RISK: 'on' })).toBe('on');
    expect(agreementCacheScope({ CRISIS_IMMINENT_NEEDS_AGREEMENT: 'live' }, 'c')).toEqual([]);
    const live = { CRISIS_CLASSIFIER_MODE: 'live' };
    expect(readJoinedTurnMode({ ...live, CRISIS_READ_JOINED_TURN: 'on' })).toBe('on');
    expect(readJoinedTurnMode({ ...live, CRISIS_READ_JOINED_TURN: 'live' })).toBe('off');
    expect(resolveCrisisClassifierTimeoutMs({ CRISIS_CLASSIFIER_TIMEOUT_MS: '1s' })).toBe(1000);
  });
});
