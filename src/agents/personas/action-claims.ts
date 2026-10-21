/**
 * What Ferni's words claim he did, and what the call's tools actually did
 * (action-claim-guard.ts reads both).
 *
 * Precision first: a sentence wrongly flagged loses Ferni's words, so only
 * clear reports of an action done or under way count. "I'm calling her right
 * now", "calling your brother now", "I've texted her", "I just sent it",
 * "message sent", "it's ringing", "I'll let you know when she picks up", "let
 * me give her a ring", "hang tight while I call her", "your appointment is
 * booked". Not claims: offers and questions, a plain future ("I'll text Dana
 * that you're running late", the confirm read-back), anything in quotes (the
 * words of a message), first-person negations, Ferni's own life (a plain past
 * tense like "so I called her", "when I called the hospital", "last summer")
 * and idioms ("on the phone with you", "I'm calling that a win", "sending you
 * a big hug", "it's ringing a bell", "I'll remind you to breathe"). Clauses are
 * read on their own, so a "?" in another clause never excuses a claim.
 *
 * Also claims: ordering a ride ("I've ordered you an Uber"), a booking reported
 * done ("Done, it's in your diary.", not a read-back of what is already there),
 * and Ferni saying he called emergency services (emergency-claim.ts, #1553).
 *
 * @module agents/personas/action-claims
 */

import {
  ANECDOTE,
  CLAUSE_CONDITION,
  CONDITION,
  EMERGENCY_CALLED,
  EMERGENCY_CLAUSES,
  HELP_COMING,
  OFFER_OR_NOT,
} from './emergency-claim.js';

export type ActionKind = 'call' | 'send' | 'ride' | 'schedule' | 'reminder' | 'save';
/** In match order: a ride ("I've booked you an Uber") is read before a booking. */
export const ACTION_KINDS: readonly ActionKind[] = [
  'call',
  'send',
  'ride',
  'schedule',
  'reminder',
  'save',
];

const HAVE = "\\b(?:i've|i have|we've|i just|i've just|i already|i've already)";
const DOING = "\\b(?:i'm|i am|we're)(?: just| now| already)?";
const LEAD =
  "^(?:(?:okay|ok|alright|all right|sure|right|great|perfect|got it|done|yep|yes|on it|i'm on it|hang on|one sec)\\W+)*";
const NOW =
  '\\b(?:now|right now|right away|straight away|this second|immediately|in a (?:sec|second|moment|minute))\\b';
const KIN =
  '(?:mom|mum|mother|dad|father|sister|brother|grandma|grandmother|gran|grandpa|grandfather|aunt|auntie|uncle|cousin|wife|husband|partner|son|daughter|kids?|friend|boss|doctor|dentist|landlord|teacher|neighbou?r|family)';
/** Someone in the caller's world: a pronoun, a name (read as "her"), or a relative. Never "you" or "my". */
const WHO = `(?:her|him|them|${KIN}|your (?:\\w+ )?${KIN})\\b(?!'s)`;

const CALL_VERB = '(?:calling|ringing|dialing|dialling|phoning)';
/** A short reassurance may follow a bare report: "Calling her now, don't worry." */
const TAIL = "(?:\\W+(?:don't worry|okay|ok|hang tight|one sec|hold on|bear with me))*\\W*$";
/** A call's target: a person, or the number the caller gave. */
const NUMBER = '(?:(?:that|the|this|her|his|their|your \\w+) number|\\d[\\d -]{2,})';
const DIALED = `(?:${WHO}|${NUMBER})`;
/** The whole sentence is only the action, its target and "now": "Calling her now.", "Okay, dialing." */
const BARE = (verbs: string, now = NOW): RegExp =>
  new RegExp(`${LEAD}${verbs}(?: ${DIALED})?(?: ${now})${TAIL}`);

const VEHICLE = '(?:uber|lyft|cab|taxi|ride|car)\\b(?! keys?\\b)';

/** Read on each clause: Ferni as the actor, a person in the caller's world (or their number) as the object. */
const CLAIMS: Record<ActionKind, RegExp[]> = {
  call: [
    new RegExp(
      `${HAVE} (?:called|rung|rang|phoned|dialed|dialled|reached out to|got (?:a ?hold|ahold) of|pinged) ${DIALED}`
    ),
    new RegExp(`${HAVE} left ${WHO} a (?:voicemail|message)`),
    new RegExp(
      `${DOING} (?:${CALL_VERB}|reaching out to|getting in touch with|on the phone with) ${DIALED}`
    ),
    new RegExp(`${DOING} (?:${CALL_VERB})(?: ${NOW}| back ${NOW})?\\W*$`),
    new RegExp(`${DOING} (?:getting ${WHO} on the line|placing (?:the|a) call)`),
    new RegExp(
      `\\b(?:let me|i'm going to|i'm gonna|i'll) (?:call|ring|dial|phone) ${DIALED}.*${NOW}`
    ),
    new RegExp(`\\b(?:let me|i'm going to|i'm gonna) give ${WHO} a (?:ring|call|buzz)`),
    new RegExp(
      `\\b(?:i'll|let me|i'm going to|i'm gonna) (?:take care of|handle|make) (?:that|the|this) call\\b.*${NOW}`
    ),
    new RegExp(`\\b(?:i'm giving|i'll give) ${WHO} a (?:ring|call|buzz).*${NOW}`),
    new RegExp(`\\bwhile i (?:call|ring|dial|phone|reach) ${DIALED}`),
    /\bi'll (?:call|ring|phone) you (?:right |straight )?back (?:on this (?:line|number)|once|when|as soon as|after)\b/,
    /\bthe call(?: is|'s) ringing\b|\bcall (?:is|has been|was) placed\b|\bgetting a call (?:any (?:second|minute|moment)|right now|now|shortly)\b/,
    /\b(?:let you know|get back to you|report back|update you) (?:as soon as|when|once|the moment|if|after) i (?:reach|get (?:a ?hold|ahold) of|get through to|hear back from|talk to|speak (?:to|with))/,
    /\b(?:let you know|get back to you|report back|update you) (?:as soon as|when|once|the moment) (?:she|he|they) (?:picks? up|answers?)(?: the phone)?\W*$/,
  ],
  send: [
    new RegExp(`${HAVE} (?:texted|messaged|emailed|pinged) ${WHO}`),
    new RegExp(`${HAVE} (?:let ${WHO} know|dropped ${WHO} a line)`),
    new RegExp(`${HAVE} sent (?:it|that|the (?:text|message|email|note)|${WHO})`),
    new RegExp(`${DOING} (?:texting|messaging|emailing) ${WHO}`),
    new RegExp(`${DOING} sending (?:it|that|the (?:text|message|email|note)|${WHO})`),
    new RegExp(
      `\\b(?:let me|i'm going to|i'm gonna|i'll) (?:text|message|email|send) ${WHO}.*${NOW}`
    ),
    new RegExp(`\\b(?:shot|dropped) ${WHO} a (?:text|message|note|email|line)`),
  ],
  ride: [
    new RegExp(
      `${HAVE} (?:ordered|booked|requested|arranged) (?:you |for you )?(?:an?|the|your) ${VEHICLE}`
    ),
    new RegExp(`${HAVE} (?:got|called|sent) you (?:an?|the) ${VEHICLE}`),
    new RegExp(
      `${DOING} (?:ordering|booking|requesting|arranging) (?:you |for you )?(?:an?|the|your) ${VEHICLE}`
    ),
    new RegExp(`${DOING} (?:getting|calling|sending) you (?:an?|the) ${VEHICLE}`),
    /\byour (?:uber|lyft|cab|taxi|ride|car|driver)(?: is|'s) (?:on (?:its|the|their) way|coming|booked|ordered|arriving|outside|(?:\w+ )?minutes? away)\b/,
  ],
  schedule: [
    new RegExp(`${HAVE} (?:booked|scheduled|reserved) (?:it|that|this|the|a|an|your|you|${WHO})`),
    new RegExp(
      `${HAVE} (?:put|added) (?:it|that|this|the \\w+) (?:on|to|in) (?:your|the) (?:calendar|schedule|diary)\\b`
    ),
    new RegExp(
      `${HAVE} (?:got|have) (?:it|that|this) (?:on|to|in) (?:your|the) (?:calendar|schedule|diary)\\b`
    ),
    /\b(?:it's|it is|that's|that is) (?:been added to|been put (?:in|on|into)|now (?:in|on)) your (?:calendar|diary|schedule)\b/,
    new RegExp(
      `${DOING} (?:booking|scheduling|reserving) (?:it|that|this|the|a|an|your|you)\\b(?! to\\b)`
    ),
    /\bgot you (?:a|the) (?:table|booking|reservation|appointment|spot)\b/,
  ],
  reminder: [
    new RegExp(
      `${HAVE} (?:set|added|created|started) (?:a|the|your|that|an) (?:\\w+ )?(?:reminder|timer|alarm)\\b`
    ),
    new RegExp(
      `${DOING} (?:setting|starting) (?:a|the|your|that|an) (?:\\w+ )?(?:reminder|timer|alarm)\\b`
    ),
  ],
  save: [new RegExp(`${HAVE} (?:saved|stored|logged) (?:it|that|this|those)\\b`)],
};

/** Read on the whole sentence: a bare report that is the entire sentence ("Just sent it.", "Booked!"). */
const WHOLE: Record<ActionKind, RegExp[]> = {
  call: [BARE(`(?:${CALL_VERB}|placing the call)`), new RegExp(`${LEAD}(?:dialing|dialling)\\W*$`)],
  send: [
    BARE('(?:texting|sending it)'),
    new RegExp(`${LEAD}(?:just sent(?: it)?|message sent|text sent|email sent|sent it)\\W*$`),
  ],
  ride: [],
  schedule: [
    new RegExp(`${LEAD}(?:booked|you're all booked)\\W*$`),
    // Only with a word saying it was just done: "It's on your calendar for Friday" may be a read-back.
    new RegExp(
      `${LEAD}(?:done|all done|all set|booked|sorted|there we go|there you go)\\W+(?:it's|it is|that's|that is)(?: now| all)? (?:in|on) your (?:calendar|diary|schedule)(?: for [^?]*)?\\W*$`
    ),
  ],
  reminder: [new RegExp(`${LEAD}(?:your )?(?:reminder|timer|alarm)(?:'s| is) (?:all )?set\\W*$`)],
  save: [new RegExp(`${LEAD}(?:saved|(?:it's|that's) (?:been )?saved)\\W*$`)],
};

/** An offer, question or first-person negation: this clause says it hasn't happened. */
const NOT_A_CLAIM =
  /\?|\b(?:want me to|should i|shall i|can i|could i|i can|i could|i'd|i would|would you like|do you want|say the word|let me know if|if you(?:'d)? (?:want|like|say)|once you|after you|when you say|i can't|i cannot|i couldn't|i won't|i haven't|i didn't|i don't|i'm not|i am not|i wasn't|i never|nothing|no way to|unable)\b/;

/** Ferni's own life, or an idiom: not an action in this call. */
const NOT_AN_ACTION =
  /^(?:and |but |so )?(?:when|after|before|because|since|as|once|the time|back when) (?:i|we)\b|\b(?:yesterday|last (?:night|week|month|year|time|summer|winter|spring|fall|autumn)|ago|used to|back when|the other day|years|growing up|as a kid|that day|that night|this one time|in spirit|before|plenty of times|many times|a few times|so many times|too)\b|\bsend(?:ing)? (?:you )?(?:\w+ ){0,4}(?:hugs?|love|vibes|strength|thoughts|prayers|energy|luck|warmth|kindness|good wishes)\b|\bcall(?:ed|ing)? (?:it|that|this)\b(?! number)|\bcalling (?:you|them|him|her) out\b/;

/** A capitalised word inside a clause is a name: read it as "her" (the patterns are lower case). */
const names = (text: string): string =>
  text.replace(/([a-z,;:]\s+)(?!I\b|I'|I’|(?:Uber|Lyft)\b)[A-Z][a-z]+\b(?!['’])/g, '$1her');

/** Anywhere in the sentence: it's about feelings, not an action ("that's saved, in my heart"). */
const FIGURATIVE =
  /\bin (?:my|your|our) (?:heart|head|memory|mind|imagination|dreams)\b|\bin spirit\b|\binto the universe\b/;

const unquoted = (text: string): string => text.replace(/"[^"]*"|“[^”]*”/g, ' '); // a message's words: never Ferni's claim
const flat = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
const normalize = (text: string): string => flat(names(unquoted(text)));

const CLAUSES = /[,;:—–]| - /;

/**
 * Whether one sentence reports emergency services called ('called') or help
 * coming ('coming'), or null. Either way it is a call claim (emergency-claim.ts).
 */
export function emergencyClaim(sentence: string): 'called' | 'coming' | null {
  // Before names(): "the Fire Department" must not read as "the fire her".
  const text = flat(unquoted(sentence)).replace(/^(?:and |but |so )/, '');
  if (FIGURATIVE.test(text) || CONDITION.test(text)) return null;
  for (const raw of text.split(EMERGENCY_CLAUSES)) {
    const clause = raw.trim();
    if (!clause || clause.includes('?') || ANECDOTE.test(clause)) continue;
    if (CLAUSE_CONDITION.test(clause)) continue;
    /** A claim, unless an offer or negation comes before its verb. */
    const said = (re: RegExp): boolean => {
      const at = re.exec(clause)?.index;
      return at !== undefined && !OFFER_OR_NOT.test(clause.slice(0, at + 1));
    };
    if (EMERGENCY_CALLED.some(said)) return 'called';
    if (HELP_COMING.some(said)) return 'coming';
  }
  return null;
}

/**
 * The rest of a sentence once its emergency claim is cut ("..., start chest
 * compressions."), or ''. A piece that claims another action is cut too.
 */
export function emergencyRemainder(sentence: string): string {
  const kept = sentence
    .split(/[,;:—–]\s*|\s+-\s+|\s+(?:and|so|but|then)\s+/i)
    .map((piece) => piece.trim().replace(/^(?:and|so|but|then)\s+/i, ''))
    .filter(
      (piece) =>
        piece !== '' &&
        emergencyClaim(piece) === null &&
        claimedAction(piece) === null &&
        !/^(?:okay|ok|alright|all right|right|sure|yes|yep|on it|i'?m on it|hang on|hold on)\W*$/i.test(
          piece
        )
    );
  if (kept.length === 0) return '';
  const text = kept.join(', ').replace(/[\s,]+$/, '');
  const ended = /[.!?]$/.test(text) ? text : `${text}.`;
  return ended.charAt(0).toUpperCase() + ended.slice(1);
}

/** The kind of action one sentence claims was done or is under way, or null. */
export function claimedAction(sentence: string): ActionKind | null {
  const text = normalize(sentence);
  if (FIGURATIVE.test(text)) return null;
  if (emergencyClaim(sentence) === 'called') return 'call';
  const whole = text.replace(/[—–]/g, ',');
  if (!NOT_A_CLAIM.test(whole) && !NOT_AN_ACTION.test(whole)) {
    const kind = ACTION_KINDS.find((k) => WHOLE[k].some((re) => re.test(whole)));
    if (kind) return kind;
  }
  for (const raw of text.split(CLAUSES)) {
    const clause = raw.trim();
    if (!clause || NOT_A_CLAIM.test(clause) || NOT_AN_ACTION.test(clause)) continue;
    const kind = ACTION_KINDS.find((k) => CLAIMS[k].some((re) => re.test(clause)));
    if (kind) return kind;
  }
  return null;
}

const ACK = 'okay|ok|alright|all right|sure|great|perfect|got it|you got it|yep|yes|yeah';
const ON_IT = new RegExp(
  `^(?:${ACK}|i'm on it|on it|consider it done|will do|wish me luck|here goes|here we go|leave it (?:to|with) me)$`
);
/**
 * A sentence of only "I'm on it", "wish me luck" and the like: no action named,
 * so not a claim by itself, but on the caller's yes to a call it says the call
 * is under way (action-claim-guard.ts). Owner call 2026-10-18: "All right, I'm
 * on it, wish me luck" and no call tool ran.
 */
export function bareOnIt(sentence: string): boolean {
  const parts = sentence
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .split(/[^a-z' ]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    parts.every((p) => ON_IT.test(p)) && parts.some((p) => !new RegExp(`^(?:${ACK})$`).test(p))
  );
}

/** Tool names by the kind of action they carry out (lower case). */
const TOOL_KINDS: Record<ActionKind, RegExp> = {
  call: /^(?:callonbehalf|callandconverse|quickcall|reachout|multioutreach|makephonecall|backgroundcall|invitefriendbycall|calluser|callcontact|haveferni?call|callforconversation|call_make|telephony_call)$/,
  ride: /^(?:requestride|scheduleride|bookride|book_ride|request_ride)$/,
  send: /^(?:reachout|multioutreach|quicktext|quickemail|send\w*|backgroundfollowup|post\w*|sms_send|message_send)$/,
  schedule:
    // A read (getCalendarToday, getUpcomingAppointments) is not a schedule action, so its reply never counts as one (#1547).
    /^(?!(?:get|detect|check|find|suggest|list|view)\w*$)(?:\w*calendar\w*|\w*event\w*|\w*appointment\w*|\w*reservation\w*|book\w*|schedule(?!reminder)\w*)$/,
  reminder: /^\w*(?:remind|timer|alarm)\w*$/,
  save: /^(?:remember\w*|save\w*|addtask|addnote|\w*journal\w*|loghabit\w*|createhabit)$/,
};

export function kindsOfTool(name: string): ActionKind[] {
  const id = name.toLowerCase();
  return ACTION_KINDS.filter((kind) => TOOL_KINDS[kind].test(id));
}

/** The confirm gate's preview (outreach-confirm.ts): nothing sent until the caller says yes. */
const PREVIEW = /^\W*not sent yet\b/i;
/** A save that landed in Ferni's own list, not the caller's calendar (#1547). */
const ELSEWHERE = /\bisn't on your calendar\b/i;
/** A call held for a better hour (services/outreach/deferred-calls.ts): set, but nothing rang. */
const HELD = /^\W*nothing was dialed yet\b/i;
/** The held call's time as its result words it: "later today at 9:00 AM". */
const HELD_WHEN = /\b((?:later today|tomorrow|\w+day) at \d{1,2}:\d{2}\s?[AP]M)\b/i;
/** A result that says the action did not happen. */
const REFUSAL =
  /^\W*(?:no calendar is connected|nothing (?:was|has been)|i couldn't|i could not|i can't|i cannot|i wasn't able|couldn't|could not|unable to|failed|error\b|sorry,? (?:i|but|that|it|something|there))|\bbut i don't have\b|\bi don't have (?:a|the|their|any) (?:phone )?number\b|\bi couldn't find\b|\bdon't see \w+(?: \w+)? in your contacts\b|\bdoesn't look (?:valid|right)\b|\b(?:calls?|calling|texts?|texting|outbound \w+) (?:are|is) (?:disabled|turned off|off|not available|unavailable)\b|\bcould you (?:tell me|provide|give me) (?:their|the|a) (?:phone )?number\b|"success"\s*:\s*false|"error"\s*:/i;

function outputText(output: unknown): string {
  if (typeof output !== 'string') return JSON.stringify(output ?? '');
  try {
    const value: unknown = JSON.parse(output);
    return (typeof value === 'string' ? value : output).replace(/[‘’]/g, "'").trim();
  } catch {
    return output.replace(/[‘’]/g, "'").trim();
  }
}

interface ItemView {
  type?: string;
  name?: string;
  output?: unknown;
  isError?: boolean;
}

export interface CallActions {
  /** Kinds whose latest tool result on this call carried it out. */
  done: Set<ActionKind>;
  /** Kinds whose latest result is the confirm preview: waiting on the caller's yes. */
  awaiting: Set<ActionKind>;
  /** Kinds whose latest result refused or failed. */
  failed: Set<ActionKind>;
  /** Schedule whose latest result saved to Ferni's own list, not the caller's calendar. */
  elsewhere: Set<ActionKind>;
  /** Kinds whose latest result is held for later (a call outside the recipient's hours). */
  held: Set<ActionKind>;
  /** When the held action happens, as its result said, if it said. */
  heldWhen?: string;
}

/** What the call's tools did: each kind as its latest tool result left it. */
export function callActions(chatCtx: { items: readonly unknown[] }): CallActions {
  type State = 'done' | 'awaiting' | 'failed' | 'held' | 'elsewhere';
  const latest = new Map<ActionKind, State>();
  let heldWhen: string | undefined;
  for (const item of chatCtx.items as readonly ItemView[]) {
    if (item.type !== 'function_call_output') continue;
    const text = outputText(item.output);
    // Held is read first: "Nothing was dialed yet" would otherwise read as a refusal.
    const state: State = item.isError
      ? 'failed'
      : HELD.test(text)
        ? 'held'
        : REFUSAL.test(text)
          ? 'failed'
          : PREVIEW.test(text)
            ? 'awaiting'
            : ELSEWHERE.test(text)
              ? 'elsewhere'
              : 'done';
    if (state === 'held') heldWhen = HELD_WHEN.exec(text)?.[1];
    for (const kind of kindsOfTool(item.name ?? '')) {
      // "Saved to Ferni's list" only matters for a schedule item; any other tool's result is done.
      latest.set(kind, state === 'elsewhere' && kind !== 'schedule' ? 'done' : state);
    }
  }
  const actions: CallActions = {
    done: new Set(),
    awaiting: new Set(),
    failed: new Set(),
    elsewhere: new Set(),
    held: new Set(),
  };
  for (const [kind, state] of latest) actions[state].add(kind);
  if (actions.held.size > 0) actions.heldWhen = heldWhen;
  return actions;
}
