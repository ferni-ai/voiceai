import { describe, expect, it } from 'vitest';

import { documentsUrl, evalDatabase } from '../eval-database.mjs';

describe('evalDatabase: the Firestore database an eval env uses', () => {
  it('prod is always (default), whatever the dev switch says', () => {
    expect(evalDatabase('prod', { vars: { EVAL_DEV_DATABASE: 'ferni-dev' } })).toBe('(default)');
  });

  it('dev, local and phone stay on (default) until EVAL_DEV_DATABASE moves them', () => {
    for (const env of ['dev', 'local', 'phone']) {
      expect(evalDatabase(env, { vars: {} })).toBe('(default)');
      expect(evalDatabase(env, { vars: { EVAL_DEV_DATABASE: 'ferni-dev' } })).toBe('ferni-dev');
    }
  });

  it('ignores FIRESTORE_DATABASE, which a dev .env sets for every env', () => {
    expect(evalDatabase('prod', { vars: { FIRESTORE_DATABASE: 'ferni-dev' } })).toBe('(default)');
  });

  it('a --database override wins, and an unknown env throws instead of guessing', () => {
    expect(evalDatabase('prod', { override: 'ferni-dev', vars: {} })).toBe('ferni-dev');
    expect(() => evalDatabase('staging', { vars: {} })).toThrow(/unknown env/);
  });

  it('builds the REST documents base for a named database', () => {
    expect(documentsUrl('p', 'ferni-dev')).toBe(
      'https://firestore.googleapis.com/v1/projects/p/databases/ferni-dev/documents'
    );
    expect(documentsUrl('p', '(default)')).toContain('/databases/(default)/documents');
  });
});
