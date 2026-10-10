/**
 * What Ferni says first when someone answers a call it placed for a user.
 *
 * The caller's first turn after "Hello?" says who is calling (Schegloff 1986).
 * Ferni isn't someone they'd recognise by voice, so it checks who answered,
 * names itself and the person it's calling for, and on a personal call says
 * nothing's wrong, because an unexpected call reads as urgent.
 *
 * Shared by the agent (silent pickups) and the outbound-call prompt (the reply
 * to "Hello?"), so both say the same thing.
 *
 * @module services/outreach/opening-line
 */

export interface OpeningLineFacts {
  /** How the requester refers to the person called ("Linda", "Mom", "Dr. Patel"). */
  recipientName: string;
  /** The requester's name ("Seth"). */
  requesterName: string;
  /** Personal calls get "nothing's wrong"; business calls don't need it. */
  personal: boolean;
}

/** Family words: what the requester calls them, not their name. */
const KINSHIP = new Set([
  'mom',
  'mum',
  'mother',
  'mama',
  'ma',
  'dad',
  'father',
  'papa',
  'pa',
  'grandma',
  'grandpa',
  'granny',
  'nana',
  'gran',
  'grandmother',
  'grandfather',
  'aunt',
  'auntie',
  'uncle',
  'cousin',
  'sis',
  'bro',
  'sister',
  'brother',
]);
const TITLE = /^(dr|mr|mrs|ms|miss|mx|prof|rev)\.?$/i;
/** Placeholders the pipeline uses when it has no real name. */
const NO_NAME = new Set([
  '',
  'unknown',
  'them',
  'friend',
  'contact',
  'phone',
  'the user',
  'your person',
  'user',
]);

const known = (name: string) => !NO_NAME.has(name.trim().toLowerCase());

/**
 * How to check who answered ("Linda?", "Seth's mom?", "Dr. Patel?"), or null
 * when there's no real name to ask about. Ferni can't confirm a voice, so it
 * asks; and it says "Seth's mom", never "Mom", because she isn't Ferni's mom.
 */
export function addressCheck(facts: OpeningLineFacts): string | null {
  const words = facts.recipientName
    .trim()
    .replace(/^my\s+/i, '')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0 || !known(words.join(' '))) return null;
  const first = words[0].toLowerCase();
  if (words.length === 1 && KINSHIP.has(first)) {
    return known(facts.requesterName) ? `${facts.requesterName}'s ${first}` : null;
  }
  if (words.length > 1 && KINSHIP.has(first)) return words[1]; // "Aunt Sue" -> "Sue"
  if (words.length > 1 && TITLE.test(words[0])) return `${words[0]} ${words[words.length - 1]}`;
  return words[0];
}

/** Ferni's first turn after "Hello?". */
export function openingLine(facts: OpeningLineFacts): string {
  const who = addressCheck(facts);
  const greeting = who ? `Hi, is this ${who}?` : 'Hi there!';
  const requester = facts.requesterName.trim();
  const intro = known(requester)
    ? `This is Ferni, I'm an AI that helps ${requester} out. ${requester} asked me to give you a quick call.`
    : "This is Ferni, I'm an AI, calling to pass along a message.";
  const reassurance = facts.personal ? " Nothing's wrong, everything's fine." : '';
  return `${greeting} ${intro}${reassurance}`;
}
