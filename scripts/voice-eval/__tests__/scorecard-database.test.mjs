import { describe, expect, it } from 'vitest';

import { scorecardDatabase } from '../scorecard.mjs';

describe('scorecardDatabase: where the owner records are read', () => {
  it('is prod (default), even when a dev .env sets FIRESTORE_DATABASE', () => {
    expect(scorecardDatabase([], {})).toBe('(default)');
    expect(scorecardDatabase(['--days', '7'], { FIRESTORE_DATABASE: 'ferni-dev' })).toBe(
      '(default)'
    );
    expect(scorecardDatabase([], { EVAL_DEV_DATABASE: 'ferni-dev' })).toBe('(default)');
  });

  it('--database is the one explicit override', () => {
    expect(scorecardDatabase(['--database', 'ferni-dev'], { FIRESTORE_DATABASE: 'other' })).toBe(
      'ferni-dev'
    );
  });
});
