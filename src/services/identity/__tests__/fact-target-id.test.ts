/**
 * Merging an anonymous identity must key facts exactly like extraction does,
 * or multi-valued facts ("likes jazz", "likes hiking") collapse into one.
 */

import { describe, expect, it } from 'vitest';
import { factIdFor, factIdForExtracted } from '../../../memory/dynamic/fact-identity.js';
import { factTargetId } from '../identity-merge-collections.js';

describe('factTargetId', () => {
  it('uses the extraction id for extracted facts, keeping multi-valued facts apart', () => {
    const jazz = { entityName: 'user', key: 'likes', value: 'jazz', factType: 'preference' };
    const hiking = { entityName: 'user', key: 'likes', value: 'hiking', factType: 'preference' };

    expect(factTargetId('legacy-1', jazz)).toBe(factIdForExtracted(jazz));
    expect(factTargetId('legacy-2', hiking)).toBe(factIdForExtracted(hiking));
    expect(factTargetId('legacy-1', jazz)).not.toBe(factTargetId('legacy-2', hiking));
  });

  it('keys single-valued facts by subject and key, so a newer value replaces the old', () => {
    const before = { entityName: 'user', key: 'job', value: 'teacher', factType: 'attribute' };
    const after = { entityName: 'user', key: 'job', value: 'nurse', factType: 'attribute' };

    expect(factTargetId('a', before)).toBe(factTargetId('b', after));
  });

  it('falls back to subject/predicate, then to the source id', () => {
    expect(factTargetId('x', { subject: 'Sam', predicate: 'birthday' })).toBe(
      factIdFor({ subject: 'Sam', predicate: 'birthday' })
    );
    expect(factTargetId('keep-me', { text: 'something' })).toBe('keep-me');
  });
});
