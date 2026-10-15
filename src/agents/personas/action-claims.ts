/**
 * What Ferni's words claim he did, and what the call's tools actually did
 * (action-claim-guard.ts reads both).
 *
 * A claim is an action reported as done or under way: "I'm calling her right
 * now", "I've texted your brother", "Done, message sent", "It's ringing",
 * "I'll let you know once I reach her". These are not claims: offers and
 * questions ("want me to call her?"), conditions ("I'll call you back if we
 * get cut off"), negations, a plain future without "now" ("I'll text Dana that
 * you're running late", the confirm read-back), and Ferni's own life ("I
 * called my sister last week", "when I called the hospital"). Idioms ("sending
 * you a big hug", "I called it") are not either. Clauses are read on their own,
 * so a "?" or "don't worry" elsewhere in a sentence never excuses a claim.
 *
 * @module agents/personas/action-claims
 */

export type ActionKind = 'call' | 'send' | 'schedule' | 'reminder' | 'save';
export const ACTION_KINDS: readonly ActionKind[] = ['call', 'send', 'schedule', 'reminder', 'save'];

const DONE = "\\b(?:i|i've|i have|we've|we)(?: just| already| now)?";
const DOING = "\\b(?:i'm|i am|we're)(?: just| now| already)?";
const LEAD = '^(?:(?:okay|ok|alright|sure|right|great|perfect|got it|done|yep|yes|all right)\\W+)*';
const WILL_NOW =
  "\\b(?:i'll|i will|let me|i'm going to|i'm gonna)(?: just)? VERB\\b(?! (?:my|it)\\b).*\\b(?:now|right now|right away|straight away|this second|immediately)\\b";
const NOT_MINE = '(?! (?:my|it)\\b)';

const CALL_DONE = '(?:called|rang|phoned|dialed|dialled|reached out to|got (?:a ?hold|ahold) of)';
const CALL_DOING =
  '(?:calling|ringing|dialing|dialling|phoning|on the phone with|placing (?:the|a) call)';
const SEND_DONE =
  '(?:texted|messaged|emailed|sent|posted|let (?:her|him|them|your \\w+(?: \\w+)?) know)';
const SEND_DOING = '(?:texting|messaging|emailing|sending|posting)';

const CLAIMS: Record<ActionKind, RegExp[]> = {
  call: [
    new RegExp(`${DONE} ${CALL_DONE}\\b${NOT_MINE}`),
    new RegExp(`${DOING} ${CALL_DOING}\\b${NOT_MINE}`),
    new RegExp(`${LEAD}${CALL_DOING}\\b${NOT_MINE}`),
    new RegExp(WILL_NOW.replace('VERB', '(?:call|ring|dial|phone)')),
    /\b(?:it's|it is|the call is|call's|phone's|she's|he's|they're) (?:ringing|connecting|going through|on its way)\b|\bgetting a call\b|\bcall (?:is|has been|was) placed\b|\bgetting (?:her|him|them|\w+) on the line\b/,
    /\b(?:let you know|get back to you|report back|update you)\b.{0,40}\b(?:reach|get (?:a ?hold|ahold) of|get through to|hear back|talk to|speak (?:to|with)|talk with)\b/,
  ],
  send: [
    new RegExp(`${DONE} ${SEND_DONE}\\b(?! my\\b)`),
    new RegExp(`${DOING} ${SEND_DOING}\\b(?! my\\b)`),
    new RegExp(`${LEAD}(?:just )?(?:sent|texting|sending)\\b(?! my\\b)`),
    new RegExp(WILL_NOW.replace('VERB', '(?:text|message|email|send)')),
    /\b(?:message|text|email|note)(?: is| has been|'s)? (?:sent|delivered|on its way|gone out)\b|\b(?:she'll|he'll|they'll) get the (?:text|message|email)\b/,
  ],
  schedule: [
    new RegExp(`${DONE} (?:booked|scheduled|reserved)\\b(?! my\\b)`),
    new RegExp(
      `${DONE} (?:put|added) (?:it|that|this|the \\w+|\\w+) (?:on|to|in) (?:your|the) (?:calendar|schedule|diary)\\b`
    ),
    new RegExp(`${DOING} (?:booking|scheduling|reserving)\\b(?! my\\b)`),
    /\bgot you (?:a|the) (?:table|booking|reservation|appointment|spot)\b|\b(?:you're|you are) (?:all )?(?:booked|scheduled)\b|\b(?:it's|that's) (?:on|in) your calendar\b/,
  ],
  reminder: [
    new RegExp(
      `${DONE} (?:set|added|created|started) (?:a|the|your|that|an) (?:\\w+ )?(?:reminder|timer|alarm)\\b`
    ),
    new RegExp(
      `${DOING} (?:setting|starting) (?:a|the|your|that|an) (?:\\w+ )?(?:reminder|timer|alarm)\\b`
    ),
    /\b(?:reminder|timer|alarm)(?: is|'s| has been)(?: all)? (?:set|running|on|started)\b/,
    /\bi'll remind you (?:to|at|in|on|tomorrow|tonight|this|before|after)\b/,
  ],
  save: [
    new RegExp(`${DONE} (?:saved|stored|logged) (?:it|that|this|those|your)\\b`),
    /\b(?:it's|that's|it is|that is) (?:been )?(?:saved|stored|logged)\b/,
    new RegExp(`${LEAD}saved\\b`),
  ],
};

/** An offer, question, condition or negation: this clause says it hasn't happened. */
const NOT_A_CLAIM =
  /\?|\b(?:want me to|should i|shall i|can i|could i|i can|i could|i'd|i would|would you like|do you want|say the word|let me know if|if|unless|once you|after you|when you|can't|cannot|couldn't|won't|wasn't able|haven't|hasn't|didn't|don't|not|never|unable|no way to)\b/;

/** Ferni's own life, or an idiom: not an action in this call. */
const NOT_AN_ACTION =
  /^(?:and |but |so )?(?:when|after|before|because|since|while|as|once|the time|back when) (?:i|we)\b|\b(?:yesterday|last (?:night|week|month|year|time)|ago|used to|back when|the other day|years|growing up|as a kid|that day|that night|this one time)\b|\bsend(?:ing)? (?:you )?(?:\w+ ){0,4}(?:hugs?|love|vibes|strength|thoughts|prayers|energy|luck|warmth|kindness|good wishes)\b|\bcall(?:ed|ing)? it\b/;

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** The kind of action one sentence claims was done or is under way, or null. */
export function claimedAction(sentence: string): ActionKind | null {
  for (const raw of normalize(sentence).split(/[,;:]| - /)) {
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
