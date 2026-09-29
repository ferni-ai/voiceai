/**
 * How well the persona knows the caller, for the opening hello.
 *
 * The greeting used to be generated as if every call were the first ("friend",
 * not returning). Friends greet differently after a day than after a month,
 * and differently the tenth time than the first; this reads that from the
 * profile when it has loaded, and falls back to the old neutral greeting when
 * it has not.
 *
 * @module agents/shared/greeting-familiarity
 */

import type { UserProfile } from '../../types/user-profile.js';
import type { GreetingContext } from './warm-greeting.js';

type GreetingStage = NonNullable<GreetingContext['relationshipStage']>;

export interface GreetingFamiliarity {
  isReturningUser: boolean;
  relationshipStage: GreetingStage;
  /** Facts for the directed greeting; empty when nothing is known. */
  facts: Record<string, string>;
}

const STAGE: Record<UserProfile['relationshipStage'], GreetingStage> = {
  new_acquaintance: 'acquaintance',
  getting_to_know: 'acquaintance',
  trusted_advisor: 'friend',
  old_friend: 'trusted_advisor',
};

const DAY_MS = 24 * 60 * 60 * 1000;

function sinceLastTalk(lastContact: Date | string, now: Date): string | undefined {
  const days = Math.floor((now.getTime() - new Date(lastContact).getTime()) / DAY_MS);
  if (!Number.isFinite(days) || days < 0) return undefined;
  if (days === 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `about ${Math.round(days / 7)} weeks ago`;
  return `over a month ago (${Math.round(days / 30)} months)`;
}

type ProfileSlice = Partial<
  Pick<UserProfile, 'totalConversations' | 'relationshipStage' | 'lastContact'>
>;

export function greetingFamiliarity(
  profile: ProfileSlice | null | undefined,
  now: Date = new Date()
): GreetingFamiliarity {
  const count = profile?.totalConversations;
  if (count === undefined) {
    return { isReturningUser: false, relationshipStage: 'friend', facts: {} };
  }
  if (count === 0) {
    return {
      isReturningUser: false,
      relationshipStage: 'stranger',
      facts: { 'how well you know them': 'this is your first conversation' },
    };
  }
  const facts: Record<string, string> = {
    'how well you know them':
      count === 1 ? 'you have talked once before' : `you have talked ${count} times`,
  };
  const last = profile?.lastContact ? sinceLastTalk(profile.lastContact, now) : undefined;
  if (last) facts['last talked'] = last;
  return {
    isReturningUser: true,
    relationshipStage: profile?.relationshipStage
      ? STAGE[profile.relationshipStage]
      : 'acquaintance',
    facts,
  };
}
