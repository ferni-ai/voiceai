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
 * @module agents/personas/action-claims
 */

export type ActionKind = 'call' | 'send' | 'schedule' | 'reminder' | 'save';
export const ACTION_KINDS: readonly ActionKind[] = ['call', 'send', 'schedule', 'reminder', 'save'];

const HAVE = "\\b(?:i've|i have|we've|i just|i've just|i already|i've already)";
const DOING = "\\b(?:i'm|i am|we're)(?: just| now| already)?";
const LEAD =
  '^(?:(?:okay|ok|alright|all right|sure|right|great|perfect|got it|done|yep|yes|on it|hang on|one sec)\\W+)*';
const NOW = '\\b(?:now|right now|right away|straight away|this second|immediately)\\b';
/** Someone in the caller's world: never "you" (Ferni is on the call), "my", "it" or "that". */
const WHO = "(?!(?:you|my|it|that|this|me)\\b)(?:her|him|them|your \\w+(?: \\w+)?|\\w+(?:'s)?)";
const OBJ = '(?! (?:you|my|it|that|this|a bell)\\b)';

const CALL_DOING =
  '(?:calling|ringing|dialing|dialling|phoning|placing (?:the|a) call (?:to|for)|getting \\w+ on the line)';
const CLAIMS: Record<ActionKind, RegExp[]> = {
  call: [
    new RegExp(
      `${HAVE} (?:called|rung|rang|phoned|dialed|dialled|reached out to|got (?:a ?hold|ahold) of)\\b${OBJ}`
    ),
    new RegExp(`${DOING} ${CALL_DOING}\\b${OBJ}`),
    new RegExp(`${DOING} on the phone with ${WHO}`),
    new RegExp(`${LEAD}(?:calling|ringing|dialing|dialling|phoning)\\b${OBJ}`),
    new RegExp(`${LEAD}placing the call\\b`),
    new RegExp(`\\b(?:let me|i'm going to|i'm gonna|i'll) (?:call|ring|dial|phone) ${WHO}.*${NOW}`),
    new RegExp(`\\b(?:let me|i'm going to|i'm gonna) give ${WHO} a (?:ring|call|buzz)\\b`),
    new RegExp(`\\bwhile i (?:call|ring|dial|phone|reach) ${WHO}`),
    /\b(?:it's|it is|the call is|call's|phone's|she's|he's|they're) (?:ringing|connecting|going through|on its way)\b(?! a bell)|\bgetting a call\b|\bcall (?:is|has been|was) placed\b/,
    /\b(?:let you know|get back to you|report back|update you)\b.{0,40}\b(?:reach|get (?:a ?hold|ahold) of|get through to|hear back|picks? up|answers?|talk to|speak (?:to|with)|talk with)\b/,
  ],
  send: [
    new RegExp(
      `${HAVE} (?:texted|messaged|emailed|sent|posted|let ${WHO} know)\\b(?! (?:you|my)\\b)`
    ),
    new RegExp(`${DOING} (?:texting|messaging|emailing|sending|posting)\\b(?! (?:you|my)\\b)`),
    new RegExp(
      `${LEAD}(?:just )?(?:sent|texting|sending) (?:it|that|the \\w+|${WHO})\\b(?! (?:you|my)\\b)`
    ),
    new RegExp(`${LEAD}(?:just )?sent\\W*$`),
    new RegExp(
      `\\b(?:let me|i'm going to|i'm gonna|i'll) (?:text|message|email|send) ${WHO}.*${NOW}`
    ),
    /\bshot (?:her|him|them|\w+) a (?:text|message|note|email)\b/,
    /\b(?:message|text|email|note)(?: is| has been|'s)? (?:sent|delivered|on its way|gone out)\b|\b(?:she'll|he'll|they'll) get the (?:text|message|email)\b/,
  ],
  schedule: [
    new RegExp(`${HAVE} (?:booked|scheduled|reserved)\\b(?! my\\b)`),
    new RegExp(
      `${HAVE} (?:put|added) (?:it|that|this|the \\w+|\\w+) (?:on|to|in) (?:your|the) (?:calendar|schedule|diary)\\b`
    ),
    new RegExp(`${DOING} (?:booking|scheduling|reserving)\\b(?! (?:my|a cabin)\\b)`),
    /\bgot you (?:a|the) (?:table|booking|reservation|appointment|spot)\b|\b(?:you're|you are) (?:all )?(?:booked|scheduled)\b|\b(?:it's|that's) (?:on|in) your calendar\b|\b(?:your )?(?:appointment|reservation|table|booking) (?:is|'s|has been) (?:booked|set|confirmed|made)\b/,
  ],
  reminder: [
    new RegExp(
      `${HAVE} (?:set|added|created|started) (?:a|the|your|that|an) (?:\\w+ )?(?:reminder|timer|alarm)\\b`
    ),
    new RegExp(
      `${DOING} (?:setting|starting) (?:a|the|your|that|an) (?:\\w+ )?(?:reminder|timer|alarm)\\b`
    ),
    /\b(?:reminder|timer|alarm)(?: is|'s| has been)(?: all)? (?:set|running|on|started)\b/,
  ],
  save: [
    new RegExp(`${HAVE} (?:saved|stored|logged) (?:it|that|this|those|your)\\b`),
    /\b(?:it's|that's|it is|that is) (?:been )?(?:saved|stored|logged)\b/,
    new RegExp(`${LEAD}saved\\W*$`),
  ],
};

/** An offer, question or first-person negation: this clause says it hasn't happened. */
const NOT_A_CLAIM =
  /\?|\b(?:want me to|should i|shall i|can i|could i|i can|i could|i'd|i would|would you like|do you want|say the word|let me know if|if you(?:'d)? (?:want|like|say)|once you|after you|when you say|i can't|i cannot|i couldn't|i won't|i haven't|i didn't|i don't|i'm not|i am not|i wasn't|i never|nothing|no way to|unable)\b/;

/** Ferni's own life, or an idiom: not an action in this call. */
const NOT_AN_ACTION =
  /^(?:and |but |so )?(?:when|after|before|because|since|as|once|the time|back when) (?:i|we)\b|\b(?:yesterday|last (?:night|week|month|year|time|summer|winter|spring|fall|autumn)|ago|used to|back when|the other day|years|growing up|as a kid|that day|that night|this one time|in spirit)\b|\bsend(?:ing)? (?:you )?(?:\w+ ){0,4}(?:hugs?|love|vibes|strength|thoughts|prayers|energy|luck|warmth|kindness|good wishes)\b|\bcall(?:ed|ing)? (?:it|that|this)\b|\bcalling (?:you|them|him|her) out\b/;

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/"[^"]*"|“[^”]*”/g, ' ') // a message's words, quoted: never Ferni's claim
    .replace(/\s+/g, ' ')
    .trim();

/** The kind of action one sentence claims was done or is under way, or null. */
export function claimedAction(sentence: string): ActionKind | null {
  for (const raw of normalize(sentence).split(/[,;:—–]| - /)) {
    const clause = raw.trim();
    if (!clause || NOT_A_CLAIM.test(clause) || NOT_AN_ACTION.test(clause)) continue;
    const kind = ACTION_KINDS.find((k) => CLAIMS[k].some((re) => re.test(clause)));
    if (kind) return kind;
  }
  return null;
}

/** Tool names by the kind of action they carry out (lower case). */
const TOOL_KINDS: Record<ActionKind, RegExp> = {
  call: /^(?:callonbehalf|callandconverse|quickcall|reachout|multioutreach|makephonecall|backgroundcall|invitefriendbycall|calluser|callcontact|haveferni?call|callforconversation|call_make|telephony_call)$/,
  send: /^(?:reachout|multioutreach|quicktext|quickemail|send\w*|backgroundfollowup|post\w*|sms_send|message_send)$/,
  schedule:
    /^(?:\w*calendar\w*|\w*event\w*|\w*appointment\w*|\w*reservation\w*|book\w*|schedule(?!reminder)\w*)$/,
  reminder: /^\w*(?:remind|timer|alarm)\w*$/,
  save: /^(?:remember\w*|save\w*|addtask|addnote|\w*journal\w*|loghabit\w*|createhabit)$/,
};

export function kindsOfTool(name: string): ActionKind[] {
  const id = name.toLowerCase();
  return ACTION_KINDS.filter((kind) => TOOL_KINDS[kind].test(id));
}

/** The confirm gate's preview (outreach-confirm.ts): nothing sent until the caller says yes. */
const PREVIEW = /^\W*not sent yet\b/i;
/** A result that says the action did not happen. */
const REFUSAL =
  /^\W*(?:nothing (?:was|has been)|i couldn't|i could not|i can't|i cannot|i wasn't able|couldn't|could not|unable to|failed|error\b|sorry,? (?:i|but|that|it|something|there))|"success"\s*:\s*false|"error"\s*:/i;

function outputText(output: unknown): string {
  if (typeof output !== 'string') return JSON.stringify(output ?? '');
  try {
    const value: unknown = JSON.parse(output);
    return (typeof value === 'string' ? value : output).trim();
  } catch {
    return output.trim();
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
}

/** What the call's tools did: each kind as its latest tool result left it. */
export function callActions(chatCtx: { items: readonly unknown[] }): CallActions {
  const latest = new Map<ActionKind, keyof CallActions>();
  for (const item of chatCtx.items as readonly ItemView[]) {
    if (item.type !== 'function_call_output') continue;
    const text = outputText(item.output);
    const state =
      item.isError || REFUSAL.test(text) ? 'failed' : PREVIEW.test(text) ? 'awaiting' : 'done';
    for (const kind of kindsOfTool(item.name ?? '')) latest.set(kind, state);
  }
  const actions: CallActions = { done: new Set(), awaiting: new Set(), failed: new Set() };
  for (const [kind, state] of latest) actions[state].add(kind);
  return actions;
}
