/**
 * A forgotten phone number (stored as its digits, "4355550142") hides the
 * number however a memory writes it. Speech-to-text writes a spoken number
 * with commas ("It's 435, 555, 0142."), and the matcher joined digits only
 * across spaces and dashes, so the caller's own words kept the number after
 * it was forgotten (relationship_network recentMentions, dev 2026-11-19 fgN2,
 * where the next call read the number back). Fictional numbers (555-01xx).
 */
import { describe, expect, it } from 'vitest';
import { isForgotten, isForgottenPassage } from '../forgotten.js';

const NUMBER = ['4355550142'];
const said = "Also, my brother Theo got a new cell number. It's 435, 555, 0142.";

describe('a forgotten number, however it is written', () => {
  it.each([
    said,
    'his number is 435-555-0142',
    'his number is (435) 555 0142',
    'call him at 435.555.0142',
    'four three five, five five five, zero one four two',
  ])('hides %j', (text) => {
    expect(isForgotten(text, NUMBER)).toBe(true);
    expect(isForgottenPassage(text, NUMBER)).toBe(true);
  });

  it.each([
    'Theo got a new cell number',
    'his number is 435-555-0199',
    'in 2019, 2020 and 2021 we went to Utah',
  ])('keeps %j', (text) => {
    expect(isForgotten(text, NUMBER)).toBe(false);
    expect(isForgottenPassage(text, NUMBER)).toBe(false);
  });

  it('still hides one year of a list when the year is the topic', () => {
    expect(isForgotten('in 2019, 2020 and 2021 we went to Utah', ['2019'])).toBe(true);
  });
});
