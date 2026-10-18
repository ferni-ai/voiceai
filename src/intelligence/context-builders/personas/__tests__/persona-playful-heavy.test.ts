/**
 * Ferni's playful hints (some carry [laughter]) never ride a reply to hard
 * news, "lol" or not: "lol my grandma passed" read as playful text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContextBuilderInput } from '../../index.js';
import { buildFerniPlayfulContext } from '../persona-playful.js';

const input = (userText: string): ContextBuilderInput =>
  ({ userText, userData: { turnCount: 1 } }) as unknown as ContextBuilderInput;

beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0)); // every roll passes
afterEach(() => vi.restoreAllMocks());

describe("Ferni's playful hints on a heavy moment", () => {
  it('still offers one on a light laugh', () => {
    expect(buildFerniPlayfulContext(input('haha you are ridiculous'))).not.toHaveLength(0);
  });

  it('offers none on hard news, however the caller laughed', () => {
    for (const t of ['lol my grandma passed', 'kms lol', 'we lost the baby haha'])
      expect(buildFerniPlayfulContext(input(t)), t).toEqual([]);
  });
});
