/**
 * Two calls on the same worker take turns through this builder. Each call gets
 * at most one cross-session reflection, however their turns interleave.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../index.js', () => ({
  registerContextBuilder: vi.fn(),
  createStandardInjection: (source: string, content: string) => ({ source, content }),
}));

import { crossSessionReflectionBuilder } from '../cross-session-reflection.js';

import type { ContextBuilderInput } from '../../index.js';
import type { ReflectionMoment } from '../../../cross-session-reflection.js';
import type { UserProfile } from '../../../../types/user-profile.js';

function moment(id: string): ReflectionMoment {
  return {
    id,
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    sessionId: 'earlier-call',
    userStatement: "I've never told anyone this",
    topic: 'family',
    emotionalWeight: 'heavy',
    type: 'vulnerability_shared',
    reflectionSeed: 'what you shared about your family',
    reflectedOn: false,
  };
}

function profile(userId: string): UserProfile {
  return {
    id: userId,
    customData: { reflectionMoments: [moment(`${userId}-1`), moment(`${userId}-2`)] },
  } as unknown as UserProfile;
}

function turn(sessionId: string, userProfile: UserProfile, turnCount: number): ContextBuilderInput {
  return {
    services: { sessionId, userId: userProfile.id, personaId: 'ferni' },
    userData: { turnCount },
    userProfile,
    userText: 'okay',
    analysis: {
      emotion: { primary: 'neutral', intensity: 0.2 },
      topics: { detected: [], primary: undefined },
    },
  } as unknown as ContextBuilderInput;
}

describe('cross-session reflection with two concurrent calls', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gives each call one reflection even when their turns interleave', async () => {
    const alice = profile('alice');
    const bob = profile('bob');

    const a1 = await crossSessionReflectionBuilder.build(turn('call-alice', alice, 2));
    const b1 = await crossSessionReflectionBuilder.build(turn('call-bob', bob, 2));
    const a2 = await crossSessionReflectionBuilder.build(turn('call-alice', alice, 3));
    const b2 = await crossSessionReflectionBuilder.build(turn('call-bob', bob, 3));

    expect(a1).toHaveLength(1);
    expect(b1).toHaveLength(1);
    expect(a2).toHaveLength(0);
    expect(b2).toHaveLength(0);
  });
});
