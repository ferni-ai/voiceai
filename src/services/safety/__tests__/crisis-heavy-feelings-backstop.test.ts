/**
 * CRISIS_CLASSIFIER_HEAVY_FEELINGS: the backstop covers every risk shape the
 * heavy-feelings rules keep as crisis. With the flag on, a turn whose latest
 * words say one of them ("I want it all to stop", "nothing matters anymore")
 * is also read without the easing rules, and the more severe read wins. With
 * the flag off, the backstop is the everyday one, unchanged.
 * Fake generate functions only; nothing touches the network.
 */

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasRiskContent } from '../crisis-agreement.js';
import {
  resetCrisisClassifierCache,
  startCrisisClassifier,
  type CrisisGenerateFn,
} from '../crisis-classifier.js';
import { needsPlainRead } from '../crisis-easing-rules.js';
import {
  CRISIS_HEAVY_FEELINGS_RULES,
  HEAVY_RISK_SHAPES,
  hasHeavyRiskShape,
} from '../crisis-heavy-feelings.js';

const HEAVY = { CRISIS_CLASSIFIER_HEAVY_FEELINGS: 'on' };
const BOTH = { ...HEAVY, CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on' };
const FLAG_OFF_ENVS = [
  {},
  { CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on' },
  { CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on', CRISIS_CLASSIFIER_HEAVY_FEELINGS: 'off' },
  { CRISIS_AGREEMENT_GATE: 'on', CRISIS_CLASSIFIER_HEAVY_FEELINGS: 'off' },
];

/** Shapes the rules keep as crisis that main's risk-word list does not see. */
const SHAPE_LINES = [
  'I want it all to stop.',
  'I want everything to stop.',
  'I just want everything to end for good.',
  'I want it to end.',
  'I wish I could make it all stop.',
  'Nothing matters anymore.',
  'Nothing in my life matters.',
  'My life is meaningless.',
];

/** One line per shape, in the order of HEAVY_RISK_SHAPES. */
const EXAMPLE_PER_SHAPE = [
  'I don’t want to be here anymore.',
  'Everyone would be better off without me.',
  'I want it all to stop.',
  'There is no way out of this.',
  'I keep thinking about hurting myself.',
  'My life is meaningless.',
];

const heavyCases = JSON.parse(
  readFileSync(
    new URL('../../../../scripts/crisis-eval/heavy-feelings-2026-11-26.json', import.meta.url),
    'utf8'
  )
) as Array<{ text: string; label: string }>;
const mustCatch = heavyCases.filter((c) => c.label === 'crisis' || c.label === 'block');
const nightlyNone = heavyCases.filter((c) => c.label === 'none');

describe('HEAVY_RISK_SHAPES is the one list behind the rule text and the backstop', () => {
  it('names each shape in the rule text, and the rule text names no other', () => {
    expect(HEAVY_RISK_SHAPES.map((s) => s.names)).toEqual([
      "they don't want to live or be here",
      'others would be better off without them',
      'they want everything to stop or end for good',
      'there is no way out',
      'they think of hurting themselves',
      'their life itself (not a job or a task) has no point',
    ]);
    for (const { names, quoted } of HEAVY_RISK_SHAPES) {
      expect(CRISIS_HEAVY_FEELINGS_RULES).toContain(`that ${names}`);
      for (const q of quoted ?? []) expect(CRISIS_HEAVY_FEELINGS_RULES).toContain(`"${q}"`);
    }
  });

  it('asks for a plain read, flag on, on an example of every shape and every quoted line', () => {
    expect(EXAMPLE_PER_SHAPE).toHaveLength(HEAVY_RISK_SHAPES.length);
    HEAVY_RISK_SHAPES.forEach((shape, i) => {
      const lines = [EXAMPLE_PER_SHAPE[i] as string, ...(shape.quoted ?? [])];
      for (const line of lines) {
        expect(shape.pattern.test(line.toLowerCase().replace(/’/g, "'")), line).toBe(true);
        expect(needsPlainRead(line, HEAVY), line).toBe(true);
        expect(needsPlainRead(line, BOTH), line).toBe(true);
      }
    });
  });

  it('reads curly apostrophes and punctuation between words', () => {
    expect(hasHeavyRiskShape('I don’t want to be here anymore')).toBe(true);
    expect(hasHeavyRiskShape('Nothing, in my life, matters.')).toBe(true);
    expect(hasHeavyRiskShape('I want it... all... to stop')).toBe(true);
  });

  it('counts anything it cannot read as a shape', () => {
    expect(hasHeavyRiskShape(undefined)).toBe(true);
    expect(hasHeavyRiskShape(null)).toBe(true);
  });
});

describe('needsPlainRead with the heavy-feelings flag on', () => {
  it('asks for a plain read on each shape the risk words miss', () => {
    for (const line of SHAPE_LINES) {
      expect(hasRiskContent(line), line).toBe(false);
      expect(needsPlainRead(line, HEAVY), line).toBe(true);
      expect(needsPlainRead(line, BOTH), line).toBe(true);
    }
  });

  it('asks for a plain read on every must-catch line in the heavy-feelings eval file', () => {
    expect(mustCatch.length).toBeGreaterThanOrEqual(6);
    for (const { text } of mustCatch) {
      expect(needsPlainRead(text, HEAVY), text).toBe(true);
      expect(needsPlainRead(text, BOTH), text).toBe(true);
    }
  });

  it('adds no plain read on the nightly none lines beyond the risk words', () => {
    expect(nightlyNone.length).toBeGreaterThanOrEqual(10);
    for (const { text } of nightlyNone) {
      expect(hasHeavyRiskShape(text), text).toBe(false);
      expect(needsPlainRead(text, HEAVY), text).toBe(hasRiskContent(text));
    }
  });

  it('gives the lawyer line and everyday heavy lines a single read', () => {
    const lawyer = nightlyNone.find((c) => /none of it means anything/i.test(c.text))?.text;
    expect(lawyer).toBeDefined();
    for (const line of [
      lawyer as string,
      "I've been a lawyer for ten years and none of it means anything.",
      "I'm so tired this week",
      "I'm grieving my dad",
      'Can you stop the music?',
      'What are you doing for the weekend?',
    ]) {
      expect(hasHeavyRiskShape(line), line).toBe(false);
      expect(needsPlainRead(line, HEAVY), line).toBe(false);
      expect(needsPlainRead(line, BOTH), line).toBe(false);
    }
  });

  it('keeps the plain read a job that feels pointless gets from the risk word pointless', () => {
    // The rules ease a job that feels pointless in the eased read; the backstop's
    // risk words, shared with the live everyday rules, still ask for a plain read.
    const line = 'work feels pointless lately';
    expect(hasHeavyRiskShape(line)).toBe(false);
    expect(hasRiskContent(line)).toBe(true);
    expect(needsPlainRead(line, HEAVY)).toBe(true);
  });
});

describe('needsPlainRead with the heavy-feelings flag off is the everyday backstop', () => {
  const lines = [...SHAPE_LINES, ...mustCatch.map((c) => c.text), 'Rough week, honestly.'];

  it('matches main for every line with the heavy flag off', () => {
    for (const env of FLAG_OFF_ENVS) {
      const everyday = env.CRISIS_CLASSIFIER_EVERYDAY_RULES === 'on';
      for (const line of lines) {
        expect(needsPlainRead(line, env), `${JSON.stringify(env)} ${line}`).toBe(
          everyday && hasRiskContent(line)
        );
      }
    }
  });

  it('leaves the shapes main misses without a plain read with the heavy flag off', () => {
    for (const env of FLAG_OFF_ENVS) {
      for (const line of SHAPE_LINES) expect(needsPlainRead(line, env), line).toBe(false);
    }
  });
});

describe('a heavy risk shape ends crisis through the classifier', () => {
  beforeEach(() => resetCrisisClassifierCache());
  const env = { CRISIS_CLASSIFIER_MODE: 'live', CRISIS_AGREEMENT_GATE: 'on', ...BOTH };
  const model = () =>
    vi.fn<CrisisGenerateFn>(async (prompt) =>
      prompt.includes(CRISIS_HEAVY_FEELINGS_RULES)
        ? '{"risk":"none","subject":"self"}'
        : '{"risk":"crisis","subject":"self"}'
    );
  const turn = (latest: string) => ({
    latest,
    earlier: ['Rough week.'],
    companion: 'How are you?',
  });
  const classify = async (latest: string) => {
    resetCrisisClassifierCache();
    const generate = model();
    const verdict = await startCrisisClassifier(turn(latest), { pattern: 'none', generate, env })
      ?.verdict;
    return { verdict, generate };
  };

  it('restores crisis after two reads when the eased read says none on a heavy risk shape', async () => {
    const lifeNoPoint = mustCatch.find((c) => /nothing in my life matters/i.test(c.text))?.text;
    expect(lifeNoPoint).toBeDefined();
    for (const latest of [
      'I want it all to stop.',
      'My life is meaningless.',
      lifeNoPoint as string,
    ]) {
      const { verdict, generate } = await classify(latest);
      expect(verdict, latest).toEqual({ risk: 'crisis', subject: 'self' });
      expect(generate, latest).toHaveBeenCalledTimes(2);
      expect(generate.mock.calls.some(([p]) => !p.includes(CRISIS_HEAVY_FEELINGS_RULES))).toBe(
        true
      );
    }
  });

  it('reads the lawyer, grief and bone-tired lines once, and the eased none stands', async () => {
    const lines = nightlyNone
      .map((c) => c.text)
      .filter((t) => /none of it means anything|what to do with myself|bone tired/i.test(t));
    expect(lines).toHaveLength(3);
    for (const latest of [...lines, "I'm grieving my dad"]) {
      const { verdict, generate } = await classify(latest);
      expect(verdict, latest).toEqual({ risk: 'none', subject: 'self' });
      expect(generate, latest).toHaveBeenCalledTimes(1);
    }
  });
});
