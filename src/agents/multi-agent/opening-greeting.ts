/**
 * Opening Greeting
 *
 * Composes the first thing a freshly spawned persona agent says. The
 * scripted warm greeting (warm-greeting.ts) is the understudy; the director
 * has the character say hello in their own words for this caller, their
 * local hour, how well they know each other, and what they remember.
 *
 * Extracted from orchestrator.ts; behavior is unchanged. Errors propagate
 * to the caller, which handles a failed greeting.
 *
 * @module agents/multi-agent/opening-greeting
 */

import type { UserData } from '../shared/types.js';

/** Compose the opening greeting text for this caller. */
export async function composeOpeningGreeting(
  sessionId: string,
  personaId: string,
  agentUserData: UserData | undefined
): Promise<string> {
  // Import the warm greeting generator (already has per-persona, time-aware, randomized greetings)
  const { generateWarmGreeting } = await import('../shared/warm-greeting.js');

  // Greet the way a friend would after this long and this many talks
  // (neutral "friend" when the profile has not loaded yet)
  const { greetingFamiliarity } = await import('../shared/greeting-familiarity.js');
  const userData = agentUserData as
    | {
        userName?: string;
        timezone?: string;
        openingFacts?: () => Promise<Record<string, string>>;
        daysThatMatter?: string | null;
        daysThatMatterReady?: Promise<void>;
        services?: { userProfile?: Parameters<typeof greetingFamiliarity>[0] };
      }
    | undefined;
  const { localClock } = await import('../../utils/local-clock.js');
  const clock = localClock(userData?.timezone);
  const familiarity = greetingFamiliarity(userData?.services?.userProfile);
  const ctx = {
    hour: clock.hour,
    isReturningUser: familiarity.isReturningUser,
    relationshipStage: familiarity.relationshipStage,
  };

  // The scripted greeting is the understudy; the director has the
  // character say hello in their own words for this caller and hour.
  const scripted = generateWarmGreeting(personaId, ctx);
  const { directedText } = await import('../../speech/direction/index.js');
  const partOfDay = clock.partOfDay;
  const userName = userData?.userName;
  // Something they told you was coming up: a friend opens with it.
  // A birthday or a hard anniversary today shapes the hello too.
  const [memoryFacts = {}] = await Promise.all([
    userData?.openingFacts?.().catch((): Record<string, string> => ({})),
    Promise.race([
      userData?.daysThatMatterReady?.catch(() => undefined),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 300);
      }),
    ]),
  ]);
  // The note's middle lines: what the day is and how to be about it
  const dayThatMatters = userData?.daysThatMatter?.split('\n').slice(1, -1).join(' ');
  const directed = await directedText(sessionId, {
    moment: 'greeting',
    direction:
      'They just connected for a voice call. Greet them like a friend picking up the phone: warm, short, and end with one easy opening. Do not list what you can do or introduce yourself at length.' +
      (memoryFacts['open thread from last time']
        ? ' If it fits, the opening can be the open thread from last time: work out from when it was said whether it has happened, and ask how it went or how it is going.'
        : '') +
      (memoryFacts['how your last call felt']
        ? ' Let how the last call felt shape your hello: if it was heavy, open gently and check in on them first.'
        : ''),
    facts: {
      'time of day': partOfDay,
      ...(userName ? { 'their name': userName } : {}),
      ...memoryFacts,
      ...(dayThatMatters ? { 'a day that matters to them': dayThatMatters } : {}),
      ...familiarity.facts,
    },
    fallback: scripted,
    urgency: 'now',
    maxChars: 140,
  });
  return directed.text;
}
