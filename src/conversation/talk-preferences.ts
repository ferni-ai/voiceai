/**
 * How they have asked to be talked to.
 *
 * "I just need you to listen." "Give it to me straight." "Stop asking me so
 * many questions." A good friend hears this once and keeps to it, for the
 * rest of the conversation and, when it is how the person is, for good,
 * without making a thing of it. Ferni hears the request in the caller's own
 * words, keeps to it for the call, and remembers the lasting ones.
 *
 * Pure: detection and wording. Storage lives with the recall store.
 *
 * @module conversation/talk-preferences
 */

export type TalkPreference = 'just_listen' | 'be_direct' | 'fewer_questions' | 'shorter';

export interface TalkRequest {
  preference: TalkPreference;
  /** false when they take it back ("what do you think I should do?"). */
  on: boolean;
  /** Said as how they are, not just how they feel now ("I never want advice"). */
  lasting: boolean;
}

const ASKS: ReadonlyArray<{ preference: TalkPreference; pattern: RegExp }> = [
  {
    preference: 'just_listen',
    pattern:
      /\b(just (need|want) (you )?to (listen|vent)|(can you|could you|please) just listen\b(?! to)|(don'?t|do not) (try to )?fix (it|this|anything|me)|(don'?t|do not) (give|want) (me )?(your |any )?advice|stop giving (me )?advice|(not|n't) (looking|asking) for advice)/i,
  },
  {
    preference: 'be_direct',
    pattern:
      /\b(be (straight|direct|honest|blunt) with me|(don'?t|do not) sugar ?coat|give it to me straight|no sugar ?coating|when you sugar ?coat|tell me straight)\b/i,
  },
  {
    preference: 'fewer_questions',
    pattern: /\b(stop asking (me )?(so many )?questions|(too|so) many questions|quit asking me)\b/i,
  },
  {
    preference: 'shorter',
    pattern:
      /\b(keep it (short|brief)|shorter (answers|responses)|you('re| are)? talk(ing)? too much|get to the point|less rambling)\b/i,
  },
];

/** Asking for advice takes back "just listen". */
const WANTS_ADVICE =
  /\b(what do you think i should|what should i do|what would you do (if you were me|in my (place|shoes))|(give|want) (me )?(some |your )?advice|any advice for me|you can give me advice)\b/i;

/** Marks a request as how they are rather than how they feel right now. */
const LASTING =
  /\b((always|never) (want|need|like|give|ask|fix|sugar)|in general|generally|every time|i hate (it )?when you|i don'?t like (it )?when you|i prefer|from now on|please remember)/i;

/** The requests in something the caller said. */
export function detectTalkRequests(text: string): TalkRequest[] {
  const lasting = LASTING.test(text);
  const found: TalkRequest[] = ASKS.filter((a) => a.pattern.test(text)).map((a) => ({
    preference: a.preference,
    on: true,
    lasting,
  }));
  if (!found.some((r) => r.preference === 'just_listen') && WANTS_ADVICE.test(text)) {
    // "From now on you can give me advice" takes a lasting one back for good
    found.push({ preference: 'just_listen', on: false, lasting });
  }
  return found;
}

/** Apply requests to the preferences in force. */
export function applyTalkRequests(
  current: ReadonlySet<TalkPreference>,
  requests: readonly TalkRequest[]
): Set<TalkPreference> {
  const next = new Set(current);
  for (const r of requests) {
    if (r.on) next.add(r.preference);
    else next.delete(r.preference);
  }
  return next;
}

const WORDING: Record<TalkPreference, string> = {
  just_listen:
    'they want to be listened to, not fixed: reflect and stay with them, no advice unless they ask for it',
  be_direct: 'they want it straight: say the true thing plainly, without cushioning',
  fewer_questions: 'they find a lot of questions tiring: at most one, and often none',
  shorter: 'they like it short: a sentence or two',
};

/** The note for the reply, or null when they have asked for nothing. */
export function formatTalkPreferences(preferences: ReadonlySet<TalkPreference>): string | null {
  if (preferences.size === 0) return null;
  return [
    '[HOW THEY HAVE ASKED YOU TO TALK]',
    ...[...preferences].map((p) => `- ${WORDING[p]}`),
    'Keep to it without mentioning it, unless they ask for something else.',
  ].join('\n');
}

export function isTalkPreference(value: unknown): value is TalkPreference {
  return typeof value === 'string' && Object.hasOwn(WORDING, value);
}
