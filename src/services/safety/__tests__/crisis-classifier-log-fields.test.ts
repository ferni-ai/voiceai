/**
 * #4211: the CRISIS_CLASSIFIER line says what each read was given (source, companion, earlier
 * count, risk words in each line, whether the companion's line was a crisis script), and it
 * carries no caller, companion or model text. Fake generate only; no model is called.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const info = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() };
  return { createLogger: () => logger, default: logger, logger };
});

import { hasRiskContent, riskWordsIn } from '../crisis-agreement.js';
import { classifierLogFields } from '../crisis-classifier-log-fields.js';
import {
  resetCrisisClassifierCache,
  startCrisisClassifier,
  type CrisisClassifierInput,
  type CrisisGenerateFn,
} from '../crisis-classifier.js';
import type { SecondReadPath } from '../crisis-second-read-turn.js';

const ENV = { CRISIS_CLASSIFIER_MODE: 'shadow' };
/** A reply with text of its own beside the verdict: none of it may reach the log. */
const REPLY = '{"risk":"crisis","subject":"self","why":"Riley Test mentioned the canoe trip"}';
const replying: CrisisGenerateFn = async () => REPLY;

const SCRIPT = "I'm right here with you. You can call or text 988 any time, day or night.";
const RISKY_COMPANION = 'Some days I feel hopeless too, honestly.';

/** The one CRISIS_CLASSIFIER record a fresh read logs. */
async function loggedRead(
  input: CrisisClassifierInput,
  path?: SecondReadPath
): Promise<Record<string, unknown>> {
  const secondRead = path ? { path, thirdParty: false } : undefined;
  const run = startCrisisClassifier(input, {
    pattern: 'none',
    env: ENV,
    generate: replying,
    ...(secondRead ? { secondRead } : {}),
  });
  await run?.verdict;
  const records = info.mock.calls.filter((c) => c[1] === 'CRISIS_CLASSIFIER').map((c) => c[0]);
  expect(records).toHaveLength(1);
  return records[0] as Record<string, unknown>;
}

beforeEach(() => {
  info.mockClear();
  resetCrisisClassifierCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CRISIS_CLASSIFIER log fields (#4211)', () => {
  it('a gate read after the crisis script: script companion, no risk words in the latest line', async () => {
    const record = await loggedRead(
      {
        latest: 'are you still there?',
        earlier: ['I just got back from the canoe trip.', 'Riley Test here, by the way.'],
        companion: SCRIPT,
      },
      'gate'
    );
    expect(record).toMatchObject({
      source: 'gate',
      hasCompanion: true,
      earlierCount: 2,
      latestRiskWords: false,
      companionRiskWords: false,
      companionIsScript: true,
    });
  });

  it('a pipeline read with risk words in the latest line and no companion line', async () => {
    const record = await loggedRead(
      { latest: 'I feel hopeless tonight', earlier: [], companion: undefined },
      'pipeline'
    );
    expect(record).toMatchObject({
      source: 'pipeline',
      hasCompanion: false,
      earlierCount: 0,
      latestRiskWords: true,
      companionRiskWords: false,
      companionIsScript: false,
    });
  });

  it('risk words only in the companion line, which names no crisis line', async () => {
    const record = await loggedRead(
      { latest: 'yeah', earlier: ['we talked about the week'], companion: RISKY_COMPANION },
      'pipeline'
    );
    expect(record).toMatchObject({
      latestRiskWords: false,
      companionRiskWords: true,
      companionIsScript: false,
    });
  });

  it('a spoken crisis line in the companion counts as the script', () => {
    const fields = classifierLogFields(
      { latest: 'ok', earlier: [], companion: 'You can call nine one one right now.' },
      'gate'
    );
    expect(fields.companionIsScript).toBe(true);
  });

  it('no path given: source is null', async () => {
    const record = await loggedRead({ latest: 'hi there', earlier: [], companion: 'Hey!' });
    expect(record.source).toBeNull();
    expect(record.hasCompanion).toBe(true);
  });

  it('counts the earlier lines the model sees, at most five', async () => {
    const earlier = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
    const record = await loggedRead({ latest: 'nine', earlier }, 'gate');
    expect(record.earlierCount).toBe(5);
  });
});

describe('the record is words-free (#4211)', () => {
  const ENUMS = new Set([
    'shadow',
    'live',
    'imminent',
    'crisis',
    'none',
    'self',
    'third_party',
    'block',
    'gate',
    'pipeline',
  ]);
  const input: CrisisClassifierInput = {
    latest: 'Riley Test packed the canoe',
    earlier: ['paddles by the shed', 'the lake trip is Saturday'],
    companion: SCRIPT,
  };

  it('carries only enums, booleans, counts and nulls', async () => {
    const record = await loggedRead(input, 'gate');
    for (const [key, value] of Object.entries(record)) {
      const ok =
        value === null ||
        typeof value === 'boolean' ||
        typeof value === 'number' ||
        (typeof value === 'string' && ENUMS.has(value));
      expect(ok, `${key}=${JSON.stringify(value)}`).toBe(true);
    }
  });

  it('holds no caller, companion or model text anywhere in what was logged', async () => {
    await loggedRead(input, 'gate');
    const logged = JSON.stringify(info.mock.calls);
    for (const said of [input.latest, ...input.earlier, input.companion ?? '']) {
      expect(logged).not.toContain(said);
    }
    for (const word of ['canoe', 'paddles', 'Riley', 'right here', 'mentioned']) {
      expect(logged).not.toContain(word);
    }
  });
});

describe('riskWordsIn (#4211)', () => {
  it('matches hasRiskContent on the list it uses today', () => {
    for (const text of ['I feel hopeless', 'the canoe trip', 'pills', 'see you Saturday', ':(']) {
      expect(riskWordsIn(text), text).toBe(hasRiskContent(text));
    }
  });

  it('adds no would-differ line to the whole-word measurement', () => {
    vi.stubEnv('SAFETY_WHOLE_WORD_SITES', 'shadow');
    const differs = (): number =>
      info.mock.calls.filter((c) => c[1] === 'safety phrase shadow: on would differ').length;
    // The plant: the same text through hasRiskContent does add one, so this row can go red.
    hasRiskContent('dying');
    expect(differs()).toBe(1);
    info.mockClear();
    riskWordsIn('dying');
    expect(differs()).toBe(0);
  });
});
