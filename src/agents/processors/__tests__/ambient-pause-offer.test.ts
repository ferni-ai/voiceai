/**
 * In a noisy room Ferni offers once to pause. The audio processor used to mark
 * the offer as made and leave a canned line for a post-LLM step that never ran
 * on calls, so a very noisy caller never heard the offer, and a moderately
 * noisy one was offered on every turn. The injection builder now makes the
 * offer and marks it made.
 */
import { describe, expect, it } from 'vitest';

import type { UserData } from '../../shared/types.js';
import { buildAmbientAwarenessInjections } from '../injection-builders/better-than-human-builders.js';

const OFFER_PRIORITY = 79;

const noisyCaller = (): UserData =>
  ({ ambientEnvironment: 'coffee_shop', ambientNoiseLevel: 0.75 }) as unknown as UserData;

const offers = (userData: UserData) =>
  buildAmbientAwarenessInjections(userData).filter((i) => i.priority === OFFER_PRIORITY);

describe('offer to pause in a noisy room', () => {
  it('offers on the first noisy turn and marks the offer made', () => {
    const userData = noisyCaller();
    expect(userData.hasOfferedToPause).toBeUndefined();

    expect(offers(userData)).toHaveLength(1);
    expect(userData.hasOfferedToPause).toBe(true);
  });

  it('does not offer again on the next noisy turn, but keeps the quieter context', () => {
    const userData = noisyCaller();
    buildAmbientAwarenessInjections(userData);

    const next = buildAmbientAwarenessInjections(userData);
    expect(next.some((i) => i.priority === OFFER_PRIORITY)).toBe(false);
    expect(next.some((i) => i.category === 'ambient_awareness')).toBe(true);
  });

  it('does not offer in a quiet room', () => {
    const userData = {
      ambientEnvironment: 'quiet_room',
      ambientNoiseLevel: 0.1,
    } as unknown as UserData;

    expect(buildAmbientAwarenessInjections(userData)).toHaveLength(0);
    expect(userData.hasOfferedToPause).toBeUndefined();
  });
});
