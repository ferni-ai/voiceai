import { describe, expect, it, vi } from 'vitest';

const locale = { current: 'en-US' };
vi.mock('../src/i18n/index.js', () => {
  const strings: Record<string, string> = {
    'seeds.one': '{count} seed',
    'seeds.other': '{count} seeds',
    'days.other': '{count} days',
  };
  return {
    getLocale: () => locale.current,
    t: (key: string, params: Record<string, string | number> = {}, fallback?: string) => {
      const value = strings[key] ?? fallback ?? key;
      return value.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
    },
  };
});

const { tp } = await import('../src/i18n/plural');

describe('tp', () => {
  it('picks the plural category for the locale', () => {
    locale.current = 'en-US';
    expect(tp('seeds', 1)).toBe('1 seed');
    expect(tp('seeds', 5)).toBe('5 seeds');
  });

  it('falls back to other when the category is missing', () => {
    expect(tp('days', 1)).toBe('1 days');
  });

  it('uses the locale rules, not English ones', () => {
    // Japanese has no "one" category, so 1 uses "other".
    locale.current = 'ja';
    expect(tp('seeds', 1)).toBe('1 seeds');
  });
});
