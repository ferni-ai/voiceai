/**
 * The beliefs side of the sensitive classifier: faith, spiritual practice and
 * philosophical beliefs are `beliefs` (consent-gated); values and everyday
 * phrases that merely sound similar are not.
 */

import { describe, expect, it } from 'vitest';
import { sensitiveCategoriesOf } from '../classifier.js';

const isBelief = (text: string) => sensitiveCategoriesOf(text).includes('beliefs');

describe('beliefs classifier', () => {
  it.each([
    'I go to mass on Sundays',
    'I went to mass with my mom',
    "I'm Buddhist",
    "I've been questioning my faith",
    'Our parish is having a picnic',
    'I was baptized when I was twelve',
    "I'm a Quaker",
    'I practice Stoicism every morning',
    'I believe in reincarnation',
    'I talked to my rabbi about it',
    'I converted to Islam last year',
    'I fast during Lent',
    "Honestly I'm not religious",
  ])('"%s" is a belief', (text) => {
    expect(isBelief(text)).toBe(true);
  });

  it.each([
    'Family matters most to me',
    'Honesty is really important to me',
    'I believe in hard work',
    'I value loyalty above everything',
    'I lent him twenty dollars',
    'I have a confession: I ate the last cookie',
    'We reached critical mass on the project',
    'I always sleep on big decisions',
    'My kids come first',
  ])('"%s" is not a belief', (text) => {
    expect(isBelief(text)).toBe(false);
  });
});
