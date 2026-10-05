/**
 * Resolving a weekly prediction in the web app: the modal asks for each
 * predicted metric by name, and the comparison it shows afterwards is built
 * from the server's score, in a tone that matches the real numbers.
 *
 * Before: one unlabeled "What was the actual result?" box, posted as
 * `{ result: n }`, and a "Result recorded!" toast whatever the score was.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../src/i18n/index.js';
import {
  comparisonLine,
  metricQuestion,
  metricUnit,
  overallLine,
} from '../../src/ui/prediction-resolution-copy.js';
import { openResolutionModal } from '../../src/ui/prediction-resolution-modal.js';
import type { PredictionData, ResolutionScore } from '../../src/services/prediction-data.js';

const DEEP_WORK = 'Deep work hours';
const MOOD = 'Mood average (1-10)';

beforeAll(async () => {
  await setLocale('en-US', { reload: false });
});

function scored(predicted: number, actual: number, accuracy: number, key = DEEP_WORK) {
  return { key, predicted, actual, accuracy };
}

describe('comparison copy picks its tone from the real score', () => {
  it('a close guess reads as close', () => {
    // 7 guessed, 7.5 actual: the server scores 93.
    expect(comparisonLine(scored(7, 7.5, 93))).toEqual({
      tone: 'close',
      text: 'You guessed 7. You got 7.5. Pretty close!',
    });
  });

  it('an exact guess is a hit, a far one says so plainly', () => {
    expect(comparisonLine(scored(7, 7, 100)).text).toBe('You guessed 7. You got 7. Nailed it!');
    expect(comparisonLine(scored(10, 4, 40))).toEqual({
      tone: 'wayOff',
      text: 'You guessed 10. You got 4. Way off this time. Now you know.',
    });
    expect(comparisonLine(scored(10, 6, 60)).tone).toBe('off');
  });

  it('only adds an overall line when several metrics were scored', () => {
    const one: ResolutionScore = { accuracy: 93, metrics: [scored(7, 7.5, 93)] };
    const two: ResolutionScore = {
      accuracy: 75,
      metrics: [scored(10, 5, 50), scored(6, 6, 100, MOOD)],
    };
    expect(overallLine(one)).toBeNull();
    expect(overallLine(two)).toBe('75% accurate overall this week.');
  });

  it('asks about the metric that was predicted, with its unit', () => {
    expect(metricQuestion(DEEP_WORK)).toBe('How many hours of deep work did you get?');
    expect(metricUnit(DEEP_WORK)).toBe('hours');
    expect(metricQuestion(MOOD)).toBe('What was your average mood, from 1 to 10?');
    expect(metricQuestion('Books read')).toBe('What was your actual Books read?');
    expect(metricUnit('Books read')).toBe('');
  });

  it('every locale carries the same strings', () => {
    const dir = join(__dirname, '../../src/i18n/locales');
    const keysOf = (value: unknown, prefix = ''): string[] =>
      value && typeof value === 'object'
        ? Object.entries(value).flatMap(([k, v]) => keysOf(v, `${prefix}${k}.`))
        : [prefix];
    const read = (file: string) =>
      JSON.parse(readFileSync(join(dir, file), 'utf8')).predictionResolution as unknown;
    const expected = keysOf(read('en-US.json')).sort();
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(11);
    for (const file of files) {
      expect({ file, keys: keysOf(read(file)).sort() }).toEqual({ file, keys: expected });
    }
  });
});

describe('the resolution modal', () => {
  const prediction: PredictionData = {
    id: 'pred_1',
    category: 'productivity',
    question: 'Week of 2026-09-28',
    userPrediction: 7,
    metrics: [
      { key: DEEP_WORK, predicted: 7 },
      { key: MOOD, predicted: 6 },
    ],
    status: 'pending',
    createdAt: '2026-09-28T00:00:00.000Z',
  };

  function click(modal: HTMLElement, selector: string): void {
    modal.querySelector<HTMLButtonElement>(selector)?.click();
  }

  it('asks for each metric, posts them by name, then shows the scored comparison', async () => {
    const score: ResolutionScore = {
      accuracy: 93,
      metrics: [scored(7, 7.5, 93)],
    };
    const submit = vi.fn().mockResolvedValue(score);
    const onScored = vi.fn();
    const modal = openResolutionModal({ prediction, submit, onScored });
    expect(modal).not.toBeNull();
    if (!modal) return;

    const labels = [...modal.querySelectorAll('label')].map((l) => l.textContent);
    expect(labels).toEqual([
      'How many hours of deep work did you get?',
      'What was your average mood, from 1 to 10?',
    ]);
    const [deepWork] = [...modal.querySelectorAll<HTMLInputElement>('input')];
    deepWork.value = '7.5'; // mood left blank: only answered metrics are sent

    click(modal, '.prediction-resolution-modal__submit');
    await vi.waitFor(() => expect(onScored).toHaveBeenCalledWith(score));

    expect(submit).toHaveBeenCalledWith({ [DEEP_WORK]: 7.5 });
    const text = modal.querySelector('[role="status"]')?.textContent ?? '';
    expect(text).toContain('You guessed 7. You got 7.5. Pretty close!');
    expect(text).not.toContain('Nailed it');
    modal.remove();
  });

  it('shows no result when saving fails, and says so', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('400'));
    const onScored = vi.fn();
    const modal = openResolutionModal({ prediction, submit, onScored });
    if (!modal) throw new Error('modal did not open');
    modal.querySelector<HTMLInputElement>('input')!.value = '8';

    click(modal, '.prediction-resolution-modal__submit');
    await vi.waitFor(() =>
      expect(modal.querySelector('[role="alert"]')?.textContent).toBe(
        "Couldn't save that. Try again?"
      )
    );

    expect(onScored).not.toHaveBeenCalled();
    expect(modal.querySelector('[role="status"]')).toBeNull();
    modal.remove();
  });

  it('does not submit without a number', () => {
    const submit = vi.fn();
    const modal = openResolutionModal({ prediction, submit });
    if (!modal) throw new Error('modal did not open');

    click(modal, '.prediction-resolution-modal__submit');

    expect(submit).not.toHaveBeenCalled();
    expect(modal.querySelectorAll('.prediction-resolution-modal__input--error')).toHaveLength(2);
    modal.remove();
  });
});
