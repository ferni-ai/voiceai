/**
 * K1 rows (GRADED-GATE.md step 1): someone else in danger now, said in ways the shared reader read
 * as nothing before. Babies and small children, plural subjects ("my grandparents", "the twins"),
 * a "the" before who it is, and a family name with no "my" ("Grandpa fell down the stairs").
 *
 * The contract: a new subject reads exactly as main reads the same line with "my dad" (or "my son"
 * for a child) in its place. No more and no less. So the 10 new catches below read imminent, and
 * every line main already reads for "my <kin>" (play beside a fall, a person named Gates) reads
 * the same here. Things and plants never do.
 *
 * Every line here is invented.
 */
import { describe, expect, it } from 'vitest';

import { decisionFor } from '../../../agents/personas/crisis-gate.js';
import { crisisRead } from '../../outreach/caller-text.js';
import { detectCrisis, guardFromDetection } from '../crisis-guard.js';
import { EMERGENCY_FOR_THEM } from '../crisis-guard-replies.js';

const OPENER = 'hey, can I tell you about something going on with my family?';

type Read = 'EMERGENCY' | 'WORRY' | 'NONE';

/** What the live gate does with the line (crisis-gate.ts decisionFor), first turn and mid-call. */
const gateRead = (line: string): Read => {
  const [first, mid] = [undefined, { recentMessages: [OPENER] }].map((options) => {
    const decision = decisionFor(detectCrisis(line, undefined, options));
    if (decision.action === 'pass') return 'NONE';
    if (decision.action === 'guide') return decision.about === 'third_party' ? 'WORRY' : 'guide';
    return decision.script === EMERGENCY_FOR_THEM ? 'EMERGENCY' : 'replace';
  });
  expect(mid, `mid-call read of: ${line}`).toBe(first);
  expect(crisisRead(line), `crisisRead of: ${line}`).toBe(first !== 'NONE');
  return first as Read;
};

describe('K1: someone else in danger now, in words the reader missed', () => {
  it.each([
    // a baby or a small child
    "my baby isn't breathing",
    "the baby isn't breathing",
    "our toddler isn't breathing",
    'my newborn stopped breathing',
    // plural subjects
    "my kids aren't breathing",
    "my grandparents fainted and they aren't moving",
    "The twins aren't breathing right.",
    "my parents passed out and they won't wake up",
    // a family name with no "my"
    "Grandpa isn't breathing",
    "mom fell down the stairs and she isn't moving",
    // a word after who it is
    'the baby just stopped breathing',
    "the twins both collapsed and they aren't moving",
    "the neighbor kid isn't breathing",
    "Grandpa just collapsed and isn't breathing",
    "my baby girl isn't breathing",
    "the twins fell off the couch and they're not getting up",
  ])('blocks with the 911-for-them reply, first and mid-call: %s', (line) => {
    for (const read of [
      detectCrisis(line),
      detectCrisis(line, undefined, { recentMessages: [OPENER] }),
    ]) {
      expect(read.subject).toBe('third_party');
      expect(read.indicators).toEqual(
        expect.arrayContaining(['third_party_emergency', 'imminent_danger'])
      );
      const guard = guardFromDetection(read);
      expect(guard.shouldBlock).toBe(true);
      expect(guard.replacementResponse).toBe(EMERGENCY_FOR_THEM);
    }
    expect(crisisRead(line)).toBe(true);
  });

  it.each([
    'the server collapsed',
    'my phone died',
    "the plants aren't breathing well",
    'the bridge collapsed',
    'the stock market collapsed',
    'the kids fell asleep',
    'the twins fell asleep in the car',
    "my parents aren't answering their phones",
    "the kids aren't responding to my texts",
  ])('never reads as an emergency: %s', (line) => {
    const read = detectCrisis(line);
    expect(read.indicators).not.toContain('third_party_emergency');
    expect(read.indicators).not.toContain('imminent_danger');
    expect(guardFromDetection(read).shouldBlock).toBe(false);
  });
});

/**
 * Never lower: a fall with laughing or pretending somewhere in the sentence is still a fall.
 * Main reads each of these as an emergency, and so must this reader.
 */
const PLAY_BESIDE_A_FALL = [
  "my dad fell and he isn't getting up, we were laughing at a movie a minute ago",
  "my brother collapsed and isn't getting up, I thought he was pretending",
  "the kids were giggling and then my mom fell and she's not getting up",
  "my wife laughed, then collapsed, and she isn't standing up",
  "she was laughing and then she collapsed and she isn't getting up",
  "he collapsed while laughing and he's not getting up",
  "my husband fell down the stairs and isn't getting up, the kids were giggling upstairs",
  "my daughter fell off the swing and isn't getting up, she was laughing a second ago",
  "my friend passed out and he's not getting up, everyone was laughing at the party",
  "the kids were horsing around and my son fell and he's not getting up",
  "my brother was goofing around on the roof and he fell and isn't getting up",
  "we thought she was just playing but my mom collapsed and isn't getting up",
  "my uncle fainted and he isn't getting up, I thought he was just kidding",
  "he was messing around, then he fell, and he's not standing up",
  'my roommate collapsed and is not getting up, we were laughing at him at first',
  "my dad was pretending to be a zombie and then he really collapsed and isn't getting up",
  "they were fooling around and he fell and he's not getting up and there's blood",
  "my dad fell on the floor and he isn't getting up, the kids are laughing because they think it's a game",
  'my mom fainted and she is not getting up, call 911, my little brother keeps laughing',
  "the twins were laughing and then they both collapsed and aren't getting up",
  "my son fell off the bunk bed laughing and now he's not getting up",
  "my sister laughed so hard she passed out and she's still not getting up",
];

/** Never lower: a person whose name is also a thing ("my friend Gates") is still a person. */
const NAMED_LIKE_A_THING: Array<[line: string, read: Read]> = [
  ["my friend Gate isn't breathing", 'EMERGENCY'],
  ["my friend Gates isn't breathing", 'EMERGENCY'],
  ["my coworker Gates collapsed and isn't moving", 'EMERGENCY'],
  ["my brother Carrier collapsed and isn't moving", 'EMERGENCY'],
  ["my neighbor Card isn't breathing", 'EMERGENCY'],
  ['my coworker Carrier is unresponsive', 'EMERGENCY'],
  ["my uncle Bed fell and isn't moving", 'EMERGENCY'],
  ["my friend Plan collapsed and won't wake up", 'EMERGENCY'],
  ["my roommate Seat isn't breathing", 'EMERGENCY'],
  ["my cousin Monitor isn't breathing", 'EMERGENCY'],
  ["our neighbor Gates fell and isn't getting up", 'EMERGENCY'],
  ['her son Gates stopped breathing', 'EMERGENCY'],
  ["his daughter Class passed out and won't wake up", 'EMERGENCY'],
  ["a coworker Gates collapsed and isn't breathing", 'EMERGENCY'],
  ['my grandpa Card is unresponsive', 'EMERGENCY'],
  ['my sister Card keeps saying everyone would be better off without her', 'WORRY'],
];

describe('K1 never lowers what main reads', () => {
  it.each(PLAY_BESIDE_A_FALL)('play beside a fall stays an emergency: %s', (line) => {
    expect(gateRead(line)).toBe('EMERGENCY');
  });

  it.each(NAMED_LIKE_A_THING)(
    'a person named like a thing reads as main does: %s',
    (line, read) => {
      expect(gateRead(line)).toBe(read);
    }
  );
});

/**
 * The contract, line by line: [said, the same line with "my dad" or "my son" for the new subject,
 * what main reads for that "my <kin>" line]. The new subject must read exactly that, and the
 * "my <kin>" line must still read it too. Lines from the #3558 verifies, both rounds.
 */
const CONTRACT: Array<[said: string, myKin: string, mainRead: Read]> = [
  [
    "my dad fell and he isn't getting up, we were laughing at a movie a minute ago",
    "my dad fell and he isn't getting up, we were laughing at a movie a minute ago",
    'EMERGENCY',
  ],
  [
    "my brother collapsed and isn't getting up, I thought he was pretending",
    "my brother collapsed and isn't getting up, I thought he was pretending",
    'EMERGENCY',
  ],
  [
    "I thought she was just messing around but my sister isn't getting up",
    "I thought she was just messing around but my sister isn't getting up",
    'NONE',
  ],
  [
    "the kids were giggling and then my mom fell and she's not getting up",
    "my son were giggling and then my mom fell and she's not getting up",
    'EMERGENCY',
  ],
  [
    "my son was playing dead but now he's not getting up and he's pale",
    "my son was playing dead but now he's not getting up and he's pale",
    'NONE',
  ],
  [
    "my wife laughed, then collapsed, and she isn't standing up",
    "my wife laughed, then collapsed, and she isn't standing up",
    'EMERGENCY',
  ],
  [
    "we were laughing. then my dad fell and he isn't getting up",
    "we were laughing. then my dad fell and he isn't getting up",
    'EMERGENCY',
  ],
  [
    "my grandma fell and isn't getting up. we were laughing a second ago",
    "my grandma fell and isn't getting up. we were laughing a second ago",
    'EMERGENCY',
  ],
  [
    "she was laughing and then she collapsed and she isn't getting up",
    "she was laughing and then she collapsed and she isn't getting up",
    'EMERGENCY',
  ],
  [
    "he collapsed while laughing and he's not getting up",
    "he collapsed while laughing and he's not getting up",
    'EMERGENCY',
  ],
  [
    "the twins were giggling then the baby fell and isn't getting up",
    "my son were giggling then my son fell and isn't getting up",
    'EMERGENCY',
  ],
  [
    "grandpa fell and isn't getting up, he was laughing right before",
    "my dad fell and isn't getting up, he was laughing right before",
    'EMERGENCY',
  ],
  [
    "mom collapsed and she's not getting up, I thought she was pretending at first",
    "my dad collapsed and she's not getting up, I thought she was pretending at first",
    'EMERGENCY',
  ],
  [
    "my husband fell down the stairs and isn't getting up, the kids were giggling upstairs",
    "my husband fell down the stairs and isn't getting up, my son were giggling upstairs",
    'EMERGENCY',
  ],
  [
    "my daughter fell off the swing and isn't getting up, she was laughing a second ago",
    "my daughter fell off the swing and isn't getting up, she was laughing a second ago",
    'EMERGENCY',
  ],
  [
    "my friend passed out and he's not getting up, everyone was laughing at the party",
    "my friend passed out and he's not getting up, everyone was laughing at the party",
    'EMERGENCY',
  ],
  [
    "the kids were horsing around and my son fell and he's not getting up",
    "my son were horsing around and my son fell and he's not getting up",
    'EMERGENCY',
  ],
  [
    "my brother was goofing around on the roof and he fell and isn't getting up",
    "my brother was goofing around on the roof and he fell and isn't getting up",
    'EMERGENCY',
  ],
  [
    "we thought she was just playing but my mom collapsed and isn't getting up",
    "we thought she was just playing but my mom collapsed and isn't getting up",
    'EMERGENCY',
  ],
  [
    "my uncle fainted and he isn't getting up, I thought he was just kidding",
    "my uncle fainted and he isn't getting up, I thought he was just kidding",
    'EMERGENCY',
  ],
  [
    "he was messing around, then he fell, and he's not standing up",
    "he was messing around, then he fell, and he's not standing up",
    'EMERGENCY',
  ],
  [
    'my roommate collapsed and is not getting up, we were laughing at him at first',
    'my roommate collapsed and is not getting up, we were laughing at him at first',
    'EMERGENCY',
  ],
  [
    "Dad fell and isn't getting up, the baby is giggling next to him",
    "my dad fell and isn't getting up, my son is giggling next to him",
    'EMERGENCY',
  ],
  [
    'the baby was giggling and then the baby fell and is not getting up',
    'my son was giggling and then my son fell and is not getting up',
    'EMERGENCY',
  ],
  [
    "my grandpa collapsed and isn't getting up! we were laughing",
    "my grandpa collapsed and isn't getting up! we were laughing",
    'EMERGENCY',
  ],
  [
    "my dad was pretending to be a zombie and then he really collapsed and isn't getting up",
    "my dad was pretending to be a zombie and then he really collapsed and isn't getting up",
    'EMERGENCY',
  ],
  [
    "they were fooling around and he fell and he's not getting up and there's blood",
    "they were fooling around and he fell and he's not getting up and there's blood",
    'EMERGENCY',
  ],
  [
    "my dad fell on the floor and he isn't getting up, the kids are laughing because they think it's a game",
    "my dad fell on the floor and he isn't getting up, my son are laughing because they think it's a game",
    'EMERGENCY',
  ],
  [
    'my mom fainted and she is not getting up, call 911, my little brother keeps laughing',
    'my mom fainted and she is not getting up, call 911, my little brother keeps laughing',
    'EMERGENCY',
  ],
  [
    "the twins were laughing and then they both collapsed and aren't getting up",
    "my son were laughing and then they both collapsed and aren't getting up",
    'EMERGENCY',
  ],
  [
    "my son fell off the bunk bed laughing and now he's not getting up",
    "my son fell off the bunk bed laughing and now he's not getting up",
    'EMERGENCY',
  ],
  [
    "my sister laughed so hard she passed out and she's still not getting up",
    "my sister laughed so hard she passed out and she's still not getting up",
    'EMERGENCY',
  ],
  [
    "my sister fell and she can't get up, she was laughing",
    "my sister fell and she can't get up, she was laughing",
    'EMERGENCY',
  ],
  [
    "my dad fell and he isn't getting up and he's not breathing, we were laughing",
    "my dad fell and he isn't getting up and he's not breathing, we were laughing",
    'EMERGENCY',
  ],
  [
    "my mom laughed and then she fainted and she won't wake up",
    "my mom laughed and then she fainted and she won't wake up",
    'EMERGENCY',
  ],
  [
    "he was pretending, then he collapsed and he isn't moving",
    "he was pretending, then he collapsed and he isn't moving",
    'EMERGENCY',
  ],
  [
    "my mom passed out cookies and she's not answering the door",
    "my mom passed out cookies and she's not answering the door",
    'EMERGENCY',
  ],
  [
    'my dad stopped breathing so loud when he snores',
    'my dad stopped breathing so loud when he snores',
    'EMERGENCY',
  ],
  [
    "my dad passed out on the couch, he's not moving, typical sunday",
    "my dad passed out on the couch, he's not moving, typical sunday",
    'EMERGENCY',
  ],
  [
    "my son collapsed on the bed after soccer and isn't moving a muscle",
    "my son collapsed on the bed after soccer and isn't moving a muscle",
    'EMERGENCY',
  ],
  [
    "my brother fell down messing around and he's not getting up",
    "my brother fell down messing around and he's not getting up",
    'EMERGENCY',
  ],
  [
    "my dad passed out cards and now he isn't answering",
    "my dad passed out cards and now he isn't answering",
    'EMERGENCY',
  ],
  [
    "my parents passed out candy and they're not answering the door",
    "my dad passed out candy and they're not answering the door",
    'EMERGENCY',
  ],
  ['a parent portal is unresponsive', 'a parent portal is unresponsive', 'EMERGENCY'],
  ['my partner api is unresponsive', 'my partner api is unresponsive', 'EMERGENCY'],
  [
    "their parent company collapsed and isn't responding",
    "their parent company collapsed and isn't responding",
    'EMERGENCY',
  ],
  [
    "my brother fell and he's not getting up, he was laughing at a video",
    "my brother fell and he's not getting up, he was laughing at a video",
    'EMERGENCY',
  ],
  [
    "my dad fell and isn't getting up, he was pretending",
    "my dad fell and isn't getting up, he was pretending",
    'EMERGENCY',
  ],
  [
    "my mom fell and she isn't getting up and we were laughing",
    "my mom fell and she isn't getting up and we were laughing",
    'EMERGENCY',
  ],
  [
    "my dad fell and he isn't getting up, we were laughing",
    "my dad fell and he isn't getting up, we were laughing",
    'EMERGENCY',
  ],
  [
    "my dad fell and he isn't getting up and he's not answering me, we were laughing",
    "my dad fell and he isn't getting up and he's not answering me, we were laughing",
    'EMERGENCY',
  ],
  [
    "my dad fell and he isn't getting up and he won't open his eyes, we were laughing",
    "my dad fell and he isn't getting up and he won't open his eyes, we were laughing",
    'EMERGENCY',
  ],
  [
    "my dad fell and he isn't getting up and his lips are blue, we were laughing",
    "my dad fell and he isn't getting up and his lips are blue, we were laughing",
    'EMERGENCY',
  ],
  [
    "my dad fell and he isn't getting up, there's blood everywhere, we were laughing",
    "my dad fell and he isn't getting up, there's blood everywhere, we were laughing",
    'EMERGENCY',
  ],
  [
    "my dad fell and he's not getting up, i need an ambulance, he was laughing",
    "my dad fell and he's not getting up, i need an ambulance, he was laughing",
    'EMERGENCY',
  ],
  [
    "mom passed out the papers at church, then passed out and isn't responding",
    "my dad passed out the papers at church, then passed out and isn't responding",
    'EMERGENCY',
  ],
  [
    "grandpa passed out cards in his hand and he won't wake up",
    "my dad passed out cards in his hand and he won't wake up",
    'EMERGENCY',
  ],
  [
    "my dad passed out flyers all day and then passed out, he's not moving",
    "my dad passed out flyers all day and then passed out, he's not moving",
    'EMERGENCY',
  ],
  [
    "my sister passed out the snacks and then she passed out and won't wake up",
    "my sister passed out the snacks and then she passed out and won't wake up",
    'EMERGENCY',
  ],
  [
    "grandma passed out treats and then fainted and isn't breathing",
    "my dad passed out treats and then fainted and isn't breathing",
    'EMERGENCY',
  ],
  [
    "my brother passed out programs at the door, then he collapsed and won't wake up",
    "my brother passed out programs at the door, then he collapsed and won't wake up",
    'EMERGENCY',
  ],
  [
    "dad passed out cards at the table, then he passed out and he's not responding",
    "my dad passed out cards at the table, then he passed out and he's not responding",
    'EMERGENCY',
  ],
  [
    "my mom passed out the candy and passed out on the floor and she won't wake up",
    "my mom passed out the candy and passed out on the floor and she won't wake up",
    'EMERGENCY',
  ],
  [
    "my aunt passed out papers and she won't wake up",
    "my aunt passed out papers and she won't wake up",
    'EMERGENCY',
  ],
  [
    "my uncle passed out cards and now he isn't moving",
    "my uncle passed out cards and now he isn't moving",
    'EMERGENCY',
  ],
  [
    "my dad passed out flyers and he's not moving",
    "my dad passed out flyers and he's not moving",
    'EMERGENCY',
  ],
  [
    "my mom passed out handouts and then she collapsed and isn't breathing",
    "my mom passed out handouts and then she collapsed and isn't breathing",
    'EMERGENCY',
  ],
  ["my friend Gate isn't breathing", "my friend Gate isn't breathing", 'EMERGENCY'],
  ["my friend Gates isn't breathing", "my friend Gates isn't breathing", 'EMERGENCY'],
  [
    "my coworker Gates collapsed and isn't moving",
    "my coworker Gates collapsed and isn't moving",
    'EMERGENCY',
  ],
  [
    "my brother Carrier collapsed and isn't moving",
    "my brother Carrier collapsed and isn't moving",
    'EMERGENCY',
  ],
  ["my neighbor Card isn't breathing", "my neighbor Card isn't breathing", 'EMERGENCY'],
  ['my coworker Carrier is unresponsive', 'my coworker Carrier is unresponsive', 'EMERGENCY'],
  [
    "my dad's card fell out of his wallet and he collapsed and isn't moving",
    "my dad's card fell out of his wallet and he collapsed and isn't moving",
    'EMERGENCY',
  ],
  [
    "my sister's seat belt jammed and she isn't breathing",
    "my sister's seat belt jammed and she isn't breathing",
    'EMERGENCY',
  ],
  [
    "my son class trip got cancelled, he collapsed and isn't getting up",
    "my son class trip got cancelled, he collapsed and isn't getting up",
    'EMERGENCY',
  ],
  ["my uncle Bed fell and isn't moving", "my uncle Bed fell and isn't moving", 'EMERGENCY'],
  [
    "my friend Plan collapsed and won't wake up",
    "my friend Plan collapsed and won't wake up",
    'EMERGENCY',
  ],
  ["my roommate Seat isn't breathing", "my roommate Seat isn't breathing", 'EMERGENCY'],
  ["my cousin Monitor isn't breathing", "my cousin Monitor isn't breathing", 'EMERGENCY'],
  ["my teacher's aide collapsed", "my teacher's aide collapsed", 'NONE'],
  [
    "our neighbor Gates fell and isn't getting up",
    "our neighbor Gates fell and isn't getting up",
    'EMERGENCY',
  ],
  [
    "my brother Cards fainted and he isn't breathing",
    "my brother Cards fainted and he isn't breathing",
    'EMERGENCY',
  ],
  ['her son Gates stopped breathing', 'her son Gates stopped breathing', 'EMERGENCY'],
  [
    "his daughter Class passed out and won't wake up",
    "his daughter Class passed out and won't wake up",
    'EMERGENCY',
  ],
  ["my friend robin isn't breathing", "my friend robin isn't breathing", 'EMERGENCY'],
  [
    "my dad suddenly collapsed and isn't moving",
    "my dad suddenly collapsed and isn't moving",
    'EMERGENCY',
  ],
  ['my brother bed-bound and now unconscious', 'my brother bed-bound and now unconscious', 'NONE'],
  [
    'my mom bedridden and she stopped breathing',
    'my mom bedridden and she stopped breathing',
    'EMERGENCY',
  ],
  [
    "a coworker Gates collapsed and isn't breathing",
    "a coworker Gates collapsed and isn't breathing",
    'EMERGENCY',
  ],
  ["my partner Chase isn't breathing", "my partner Chase isn't breathing", 'EMERGENCY'],
  [
    "my wife Sage collapsed and isn't moving",
    "my wife Sage collapsed and isn't moving",
    'EMERGENCY',
  ],
  ["their baby Gates isn't breathing", "their son Gates isn't breathing", 'EMERGENCY'],
  ['my grandpa Card is unresponsive', 'my grandpa Card is unresponsive', 'EMERGENCY'],
  [
    "my friend Gates said she doesn't want to be here anymore",
    "my friend Gates said she doesn't want to be here anymore",
    'WORRY',
  ],
  [
    'my sister Card keeps saying everyone would be better off without her',
    'my sister Card keeps saying everyone would be better off without her',
    'WORRY',
  ],
  ["Grandma Rose isn't breathing", "my dad Rose isn't breathing", 'EMERGENCY'],
  ["the baby's dad collapsed", "my son's my dad collapsed", 'NONE'],
  [
    "the baby's dad collapsed and isn't moving",
    "my son's my dad collapsed and isn't moving",
    'EMERGENCY',
  ],
  ["the twins' mom isn't breathing", "my son' my dad isn't breathing", 'EMERGENCY'],
  ["my baby girl isn't breathing", "my son girl isn't breathing", 'EMERGENCY'],
  ["the little one isn't breathing", "my son isn't breathing", 'EMERGENCY'],
  ["Uncle Joe isn't breathing", "Uncle Joe isn't breathing", 'NONE'],
  ["the boy isn't breathing", "the boy isn't breathing", 'NONE'],
  ["my little girl isn't breathing", "my little girl isn't breathing", 'NONE'],
  ["Grandpa Joe collapsed and isn't moving", "my dad Joe collapsed and isn't moving", 'EMERGENCY'],
  [
    "the old man next door collapsed and isn't moving",
    "the old man next door collapsed and isn't moving",
    'NONE',
  ],
  ["my baby brother isn't breathing", "my son brother isn't breathing", 'EMERGENCY'],
  ["the kid next door isn't breathing", "my son next door isn't breathing", 'NONE'],
  ["the toddler next door fell and isn't moving", "my son next door fell and isn't moving", 'NONE'],
  ["my 3 year old isn't breathing", "my 3 year old isn't breathing", 'NONE'],
  ["my two year old fell and isn't moving", "my two year old fell and isn't moving", 'NONE'],
  [
    'dad stopped breathing so loud when he snores',
    'my dad stopped breathing so loud when he snores',
    'EMERGENCY',
  ],
  [
    "grandma passed out the cookies and she's not answering the door",
    "my dad passed out the cookies and she's not answering the door",
    'EMERGENCY',
  ],
  [
    "my parents passed out cookies and they're not answering the door",
    "my dad passed out cookies and they're not answering the door",
    'EMERGENCY',
  ],
  [
    "the kids passed out cupcakes and they're not answering",
    "my son passed out cupcakes and they're not answering",
    'EMERGENCY',
  ],
  [
    "my grandparents passed out presents and they aren't answering the door",
    "my dad passed out presents and they aren't answering the door",
    'EMERGENCY',
  ],
  [
    "my parents passed out ballots and they're not answering",
    "my dad passed out ballots and they're not answering",
    'EMERGENCY',
  ],
  [
    "the twins collapsed on the bed after soccer and aren't moving a muscle",
    "my son collapsed on the bed after soccer and aren't moving a muscle",
    'EMERGENCY',
  ],
  [
    "dad passed out on the couch, he's not moving, typical sunday",
    "my dad passed out on the couch, he's not moving, typical sunday",
    'EMERGENCY',
  ],
  [
    "grandpa passed out cookies at church and isn't answering",
    "my dad passed out cookies at church and isn't answering",
    'EMERGENCY',
  ],
  [
    'mom passed out the cookies and is not responding to anyone',
    'my dad passed out the cookies and is not responding to anyone',
    'EMERGENCY',
  ],
  ['the child process is unresponsive', 'my son process is unresponsive', 'EMERGENCY'],
  ['the parent portal is unresponsive', 'my dad portal is unresponsive', 'EMERGENCY'],
  ['the student portal is unresponsive', 'my dad portal is unresponsive', 'EMERGENCY'],
  ['the baby monitor is unresponsive', 'my son monitor is unresponsive', 'EMERGENCY'],
  ['the twin engine is unresponsive', 'my son engine is unresponsive', 'EMERGENCY'],
  ['the partner api is unresponsive', 'my dad api is unresponsive', 'EMERGENCY'],
  ['the child node stopped breathing', 'my son node stopped breathing', 'EMERGENCY'],
  [
    'the baby monitor stopped breathing alerts',
    'my son monitor stopped breathing alerts',
    'EMERGENCY',
  ],
  [
    "the parent company collapsed and isn't responding",
    "my dad company collapsed and isn't responding",
    'EMERGENCY',
  ],
  [
    "the twins fell off the couch laughing and they're not getting up, just giggling",
    "my son fell off the couch laughing and they're not getting up, just giggling",
    'EMERGENCY',
  ],
  ["my baby isn't breathing", "my son isn't breathing", 'EMERGENCY'],
  ["the baby isn't breathing", "my son isn't breathing", 'EMERGENCY'],
  ["our toddler isn't breathing", "our son isn't breathing", 'EMERGENCY'],
  ['my newborn stopped breathing', 'my son stopped breathing', 'EMERGENCY'],
  ["my kids aren't breathing", "my son aren't breathing", 'EMERGENCY'],
  [
    "my grandparents fainted and they aren't moving",
    "my dad fainted and they aren't moving",
    'EMERGENCY',
  ],
  ["The twins aren't breathing right.", "my son aren't breathing right.", 'EMERGENCY'],
  [
    "my parents passed out and they won't wake up",
    "my dad passed out and they won't wake up",
    'EMERGENCY',
  ],
  ["Grandpa isn't breathing", "my dad isn't breathing", 'EMERGENCY'],
  [
    "mom fell down the stairs and she isn't moving",
    "my dad fell down the stairs and she isn't moving",
    'EMERGENCY',
  ],
  ['the server collapsed', 'the server collapsed', 'NONE'],
  ['my phone died', 'my phone died', 'NONE'],
  ["the plants aren't breathing well", "the plants aren't breathing well", 'NONE'],
  ['the bridge collapsed', 'the bridge collapsed', 'NONE'],
  ['the stock market collapsed', 'the stock market collapsed', 'NONE'],
  ['the kids fell asleep', 'my son fell asleep', 'NONE'],
  ['the twins fell asleep in the car', 'my son fell asleep in the car', 'NONE'],
  ["my parents aren't answering their phones", "my dad aren't answering their phones", 'NONE'],
  ["the kids aren't responding to my texts", "my son aren't responding to my texts", 'NONE'],
  ['the baby just stopped breathing', 'my son just stopped breathing', 'EMERGENCY'],
  [
    "the twins both collapsed and they aren't moving",
    "my son both collapsed and they aren't moving",
    'EMERGENCY',
  ],
  ["the neighbor kid isn't breathing", "my dad kid isn't breathing", 'EMERGENCY'],
  [
    "Grandpa just collapsed and isn't breathing",
    "my dad just collapsed and isn't breathing",
    'EMERGENCY',
  ],
  [
    "my dad collapsed laughing and now he isn't responding",
    "my dad collapsed laughing and now he isn't responding",
    'EMERGENCY',
  ],
  [
    "my dad collapsed laughing and now he's not breathing",
    "my dad collapsed laughing and now he's not breathing",
    'EMERGENCY',
  ],
  [
    "the twins fell off the couch laughing and now they can't get up",
    "my son fell off the couch laughing and now they can't get up",
    'EMERGENCY',
  ],
  [
    "my dad passed out flyers and now he isn't breathing",
    "my dad passed out flyers and now he isn't breathing",
    'EMERGENCY',
  ],
  [
    "the twins fell off the couch and they're not getting up",
    "my son fell off the couch and they're not getting up",
    'EMERGENCY',
  ],
  [
    "their parent company merged, then collapsed and isn't responding",
    "their parent company merged, then collapsed and isn't responding",
    'EMERGENCY',
  ],
  ['papa johns is unresponsive', 'my dad johns is unresponsive', 'EMERGENCY'],
];

describe('K1 contract: a new subject reads as main reads "my <kin>"', () => {
  it.each(CONTRACT)('%s', (said, myKin, mainRead) => {
    expect(gateRead(myKin)).toBe(mainRead);
    expect(gateRead(said)).toBe(mainRead);
  });
});
