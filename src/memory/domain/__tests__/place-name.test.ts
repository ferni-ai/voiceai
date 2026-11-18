import { describe, expect, it } from 'vitest';
import { properNameAsSaid } from '../place-name.js';

describe('properNameAsSaid (#4028)', () => {
  it.each(['Denver', 'New York', 'Acme Labs', 'The Bronx', 'Maple Street'])('keeps "%s"', (p) => {
    expect(properNameAsSaid(p)).toBe(p);
  });

  it.each([
    'work',
    'the hospital',
    'Friday',
    'March',
    'Today',
    'This Morning',
    'Mom',
    'My',
    'Her',
    '',
  ])('is no place or company: "%s"', (p) => {
    expect(properNameAsSaid(p)).toBeNull();
  });

  it.each(['NYC', 'LA', 'Washington DC'])('keeps the listed abbreviation "%s" (#4034)', (p) => {
    expect(properNameAsSaid(p)).toBe(p);
  });

  it.each(['IBM', 'NASA'])('keeps a company said in capitals: "%s"', (p) => {
    expect(properNameAsSaid(p)).toBe(p);
  });

  it('trims what it keeps', () => {
    expect(properNameAsSaid(' Acme Labs ')).toBe('Acme Labs');
  });
});
