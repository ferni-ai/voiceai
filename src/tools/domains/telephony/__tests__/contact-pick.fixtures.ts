/**
 * The #2848 review's probe scenarios (rounds 1-2), with invented contacts and fake numbers.
 * Each row: [what was said, what main rings, what CONTACT_PICK_V2 rings].
 * A pick is "Name|digits"; null asks for the number; "ASK" asks the caller a question.
 * The main column is the review's measured main behaviour, so a flag-off test that matches
 * it also proves these contacts reproduce the review's.
 */

export type Seed = [
  name: string,
  phone?: string,
  notes?: string,
  relationship?: string,
  email?: string,
];
export type Pick = string | null;
export interface Scenario {
  title: string;
  contacts: Seed[];
  rows: Array<[said: string, main: Pick, v2: Pick]>;
}

const F = 'family';
const lindaNotes = (notes: string, mom: Pick, myMom: Pick, mainMyMom: Pick = null): Scenario => ({
  title: `Linda (family) with notes "${notes}"`,
  contacts: [['Linda', '8015550501', notes, F]],
  rows: [
    ['mom', 'Linda|8015550501', mom],
    ['my mom', mainMyMom, myMom],
  ],
});
const LINDA = 'Linda|8015550501';

export const SCENARIOS: Scenario[] = [
  {
    title: 'punctuated names',
    contacts: [
      ["Mama's Kitchen", '8015550301'],
      ['Dr. Patel', '8015550302'],
      ["Sean O'Brien", '8015550303'],
      ['Mary-Jane Watson', '8015550304'],
      ['J.R. Smith', '8015550305'],
    ],
    rows: [
      ["Mama's Kitchen", "Mama's Kitchen|8015550301", "Mama's Kitchen|8015550301"],
      ['Dr. Patel', 'Dr. Patel|8015550302', 'Dr. Patel|8015550302'],
      ["O'Brien", "Sean O'Brien|8015550303", "Sean O'Brien|8015550303"],
      ["Sean O'Brien", "Sean O'Brien|8015550303", "Sean O'Brien|8015550303"],
      ['Mary-Jane', 'Mary-Jane Watson|8015550304', 'Mary-Jane Watson|8015550304'],
      ['J.R.', 'J.R. Smith|8015550305', 'J.R. Smith|8015550305'],
    ],
  },
  {
    title: 'a realistic contact list (titles, a restaurant, two Sarahs)',
    contacts: [
      ['Sarah Lee', '8015550201'],
      ['Sarah Kim', '8015550202'],
      ['Sister Mary', '8015550203', 'nun'],
      ['Father Tom', '8015550204', 'priest'],
      ["Mama's Kitchen", '8015550205'],
      ['Mom', '8015550206', "User's mom", F],
      ['Dad', '8015550207', "User's dad", F],
      ['Jenny', '8015550208', "User's sister", F],
      ['Pat', '8015550209', "Dad's wife", F],
      ['Linda', '8015550210', "Dad's girlfriend", F],
      ['Robert Smith', '8015550211', 'Bobby'],
      ['Dr. Patel', '8015550212', 'dentist', 'professional'],
    ],
    rows: [
      ['Sarah', 'Sarah Lee|8015550201', 'ASK'],
      ['Sarah Kim', 'Sarah Kim|8015550202', 'Sarah Kim|8015550202'],
      ['Bobby', 'Robert Smith|8015550211', 'Robert Smith|8015550211'],
      ['Robert', 'Robert Smith|8015550211', 'Robert Smith|8015550211'],
      ['Sister Mary', 'Sister Mary|8015550203', 'Sister Mary|8015550203'],
      ['Father Tom', 'Father Tom|8015550204', 'Father Tom|8015550204'],
      ['my father', null, 'Dad|8015550207'],
      ['father', 'Father Tom|8015550204', 'Dad|8015550207'],
      ['dad', 'Mom|8015550206', 'Dad|8015550207'],
      ['my dad', null, 'Dad|8015550207'],
      ['papa', 'Mom|8015550206', 'Dad|8015550207'],
      ['my sister', null, 'Jenny|8015550208'],
      ['sister', 'Sister Mary|8015550203', 'Jenny|8015550208'],
      ['sis', 'Sister Mary|8015550203', 'Jenny|8015550208'],
      ['mom', 'Mom|8015550206', 'Mom|8015550206'],
      ['my mom', null, 'Mom|8015550206'],
      ['mama', "Mama's Kitchen|8015550205", 'Mom|8015550206'],
      ["Mama's Kitchen", "Mama's Kitchen|8015550205", "Mama's Kitchen|8015550205"],
      ['Pat', 'Pat|8015550209', 'Pat|8015550209'],
      ['my priest', null, 'Father Tom|8015550204'],
      ['Linda', 'Linda|8015550210', 'Linda|8015550210'],
      ['my dentist', null, 'Dr. Patel|8015550212'],
      ['Jenny', 'Jenny|8015550208', 'Jenny|8015550208'],
      ['my brother', null, null],
    ],
  },
  {
    title: 'Dad has no number; Carol is "Dad\'s wife"',
    contacts: [
      ['Dad', undefined, "User's dad", F],
      ['Carol', '8015550106', "Dad's wife", F],
    ],
    rows: [['my dad', null, null]],
  },
  {
    title: 'Mom has no number; Grandma is "Mom\'s mom"',
    contacts: [
      ['Mom', undefined, undefined, F],
      ['Grandma', '8015550105', "Mom's mom", F],
    ],
    rows: [
      ['my mom', null, null],
      ['mom', null, null],
    ],
  },
  {
    title: 'one shared cell: "Mom\'s cell; Dad uses it too"',
    contacts: [['Mom', '8015550101', "Mom's cell; Dad uses it too", F]],
    rows: [
      ['my dad', null, null],
      ['my mom', null, 'Mom|8015550101'],
    ],
  },
  {
    title: 'the prod bug: two Mom rows, the phoneless one stored first',
    contacts: [
      ['Mom', undefined, undefined, F],
      ['Mom', '8015550163', "User's mom", F],
    ],
    rows: [
      ['my mom', null, 'Mom|8015550163'],
      ['mom', null, 'Mom|8015550163'],
      ['My Mum', null, 'Mom|8015550163'],
      ['mother', null, 'Mom|8015550163'],
    ],
  },
  {
    title: 'non-Latin and accented names',
    contacts: [
      ['José Garcia', '8015550401'],
      ['李明', '8015550402'],
      ['Ольга Петрова', '8015550403'],
      ['Zoë Kim', '8015550404'],
      ['محمد', '8015550405'],
    ],
    rows: [
      ['José', 'José Garcia|8015550401', 'José Garcia|8015550401'],
      ['Jose', null, null],
      ['José Garcia', 'José Garcia|8015550401', 'José Garcia|8015550401'],
      ['李明', '李明|8015550402', '李明|8015550402'],
      ['Ольга', 'Ольга Петрова|8015550403', 'Ольга Петрова|8015550403'],
      ['Ольга Петрова', 'Ольга Петрова|8015550403', 'Ольга Петрова|8015550403'],
      ['Zoë', 'Zoë Kim|8015550404', 'Zoë Kim|8015550404'],
      ['محمد', 'محمد|8015550405', 'محمد|8015550405'],
    ],
  },
  {
    title: 'a contact named "Mum"',
    contacts: [['Mum', '8015550411', undefined, F]],
    rows: [
      ['my mom', null, 'Mum|8015550411'],
      ['mum', 'Mum|8015550411', 'Mum|8015550411'],
      ['Mum', 'Mum|8015550411', 'Mum|8015550411'],
      ['mother', 'Mum|8015550411', 'Mum|8015550411'],
    ],
  },
  {
    title: '"Pops" with notes "User\'s dad"',
    contacts: [['Pops', '8015550412', "User's dad", F]],
    rows: [
      ['my dad', null, 'Pops|8015550412'],
      ['Pops', 'Pops|8015550412', 'Pops|8015550412'],
      ['pops', 'Pops|8015550412', 'Pops|8015550412'],
      ['father', null, 'Pops|8015550412'],
    ],
  },
  {
    title: '"Pops" with no notes',
    contacts: [['Pops', '8015550413']],
    rows: [
      ['my dad', null, null],
      ['Pops', 'Pops|8015550413', 'Pops|8015550413'],
    ],
  },
  {
    title: 'two sisters',
    contacts: [
      ['Jenny', '8015550421', "User's sister", F],
      ['Amy', '8015550422', "User's sister", F],
    ],
    rows: [
      ['call my sister', null, null],
      ['my sister', null, 'ASK'],
      ['sis', 'Jenny|8015550421', 'ASK'],
      ['Amy', 'Amy|8015550422', 'Amy|8015550422'],
    ],
  },
  {
    title: 'a contact literally named "Mom" (relationship other)',
    contacts: [['Mom', '8015550431']],
    rows: [
      ['mom', 'Mom|8015550431', 'Mom|8015550431'],
      ['my mom', null, 'Mom|8015550431'],
      ['Mom', 'Mom|8015550431', 'Mom|8015550431'],
      ['mother', null, 'Mom|8015550431'],
      ['my dad', null, null],
    ],
  },
  {
    title: 'Dad has no number; Bob is "not my dad, just a family friend"',
    contacts: [
      ['Dad', undefined, "User's dad", F],
      ['Bob', '8015550441', 'not my dad, just a family friend', 'friend'],
    ],
    rows: [
      ['my dad', 'Bob|8015550441', null],
      ['dad', null, null],
    ],
  },
  {
    title: 'Dad has no number; Kim\'s notes: "her dad is a doctor"',
    contacts: [
      ['Dad', undefined, "User's dad", F],
      ['Kim', '8015550442', "Jenny's roommate; her dad is a doctor"],
    ],
    rows: [['my dad', null, null]],
  },
  {
    title: 'exact name beats relation: Bob ("User\'s dad"), Dad, Papa',
    contacts: [
      ['Bob', '8015550451', "User's dad", F],
      ['Dad', '8015550452', undefined, F],
      ['Papa', '8015550453'],
    ],
    rows: [
      ['dad', 'Bob|8015550451', 'Dad|8015550452'],
      ['my dad', null, 'Dad|8015550452'],
      ['papa', 'Papa|8015550453', 'Papa|8015550453'],
      ['my father', null, 'ASK'],
      ['Bob', 'Bob|8015550451', 'Bob|8015550451'],
    ],
  },
  {
    title: 'Dad has no number; only Father Tom has one',
    contacts: [
      ['Dad', undefined, "User's dad", F],
      ['Father Tom', '8015550461', 'priest'],
    ],
    rows: [
      ['my dad', null, 'ASK'],
      ['my father', null, 'ASK'],
      ['father', 'Father Tom|8015550461', 'ASK'],
    ],
  },
  {
    title: "Mom has no number; only Mama's Kitchen has one",
    contacts: [
      ['Mom', undefined, undefined, F],
      ["Mama's Kitchen", '8015550462'],
    ],
    rows: [
      ['my mom', null, 'ASK'],
      ['mama', null, 'ASK'],
    ],
  },
  {
    title: 'only Sister Mary',
    contacts: [['Sister Mary', '8015550463']],
    rows: [
      ['my sister', null, 'ASK'],
      ['sister', 'Sister Mary|8015550463', 'ASK'],
    ],
  },
  lindaNotes('Mom', LINDA, LINDA),
  lindaNotes('mom - cell', LINDA, LINDA),
  lindaNotes('Mom (work)', LINDA, LINDA),
  lindaNotes("Mom's new number", null, null),
  lindaNotes('mother', LINDA, LINDA),
  lindaNotes('stepmom', null, null),
  lindaNotes('my mom', LINDA, LINDA, LINDA),
  lindaNotes('User’s mom', LINDA, LINDA),
  lindaNotes('Mother of the bride', null, null),
  {
    title: 'Richard with notes "User\'s father"',
    contacts: [['Richard', '8015550502', "User's father", F]],
    rows: [
      ['dad', null, 'Richard|8015550502'],
      ['my dad', null, 'Richard|8015550502'],
      ['father', 'Richard|8015550502', 'Richard|8015550502'],
    ],
  },
  {
    title: 'plain names, an email and a dentist',
    contacts: [
      ['Sarah Lee', '8015550503', undefined, undefined, 'sl@x.com'],
      ['Robert Smith', '8015550504', 'Bobby'],
      ['Dr. Lee Wong', '8015550505', 'dentist', 'professional'],
    ],
    rows: [
      ['Sarah', 'Sarah Lee|8015550503', 'Sarah Lee|8015550503'],
      ['sarah lee', 'Sarah Lee|8015550503', 'Sarah Lee|8015550503'],
      ['Lee', 'Sarah Lee|8015550503', 'ASK'],
      ['Bobby', 'Robert Smith|8015550504', 'Robert Smith|8015550504'],
      ['dentist', 'Dr. Lee Wong|8015550505', 'Dr. Lee Wong|8015550505'],
      ['my dentist', null, 'Dr. Lee Wong|8015550505'],
      ['Wong', 'Dr. Lee Wong|8015550505', 'Dr. Lee Wong|8015550505'],
      ['Dr. Wong', null, null],
      ['Dr Lee Wong', null, null],
      ['sl@x.com', 'Sarah Lee|8015550503', 'Sarah Lee|8015550503'],
      ['Smith', 'Robert Smith|8015550504', 'Robert Smith|8015550504'],
    ],
  },
  {
    title: 'Tina, relationship friend, no notes',
    contacts: [['Tina', '8015550506', undefined, 'friend']],
    rows: [
      ['my friend', null, null],
      ['friend', null, null],
      ['Tina', 'Tina|8015550506', 'Tina|8015550506'],
    ],
  },
  {
    title: 'Susan, family, no notes',
    contacts: [['Susan', '8015550507', undefined, F]],
    rows: [
      ['mama', 'Susan|8015550507', null],
      ['mom', 'Susan|8015550507', null],
    ],
  },
];

/** On the default path the only change from main: the duplicate-row rescue. */
export const DEFAULT_PATH_FIXES: Record<string, Pick> = {
  'the prod bug: two Mom rows, the phoneless one stored first|mom': 'Mom|8015550163',
  'the prod bug: two Mom rows, the phoneless one stored first|mother': 'Mom|8015550163',
};
