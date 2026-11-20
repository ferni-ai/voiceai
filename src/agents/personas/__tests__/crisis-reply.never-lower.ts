/**
 * The calls the reply never-lower test (crisis-reply-never-lower.test.ts) puts through the real
 * reply gate, the least each turn's reply may ever be, and which crisis-lane flag each call
 * shows. Data only. All lines are fictional.
 *
 * A flag whose effect shows on none of these calls is not checked by that test. Add the call
 * that shows it here, with its floors and a SHOWN_ON row, in the PR that adds the flag.
 */

/** What the stubbed crisis classifier answers for every line of a call. */
export const ANSWERS = ['none', 'crisis', 'imminent', 'other', 'throws', 'never'] as const;
export type Answer = (typeof ANSWERS)[number];

/**
 * The least a reply may be, whatever flags are set:
 * - emergency: code speaks it, with 911, and 911 comes before any 988;
 * - crisis line: code speaks it, with 988;
 * - guided: 988 reaches the caller, spoken by code or as the last thing the model is asked;
 * - 988 spoken: 988 is in the reply itself. The test's model never says it, so there it is
 *   code's own line, even on a turn the model speaks;
 * - none: nothing is promised (the reply must still come).
 * The floors below are the kind main gives today (2026-11-13), no more.
 */
export type Floor = 'emergency' | 'crisis line' | '988 spoken' | 'guided' | 'none';
type ByAnswer = Readonly<Record<Answer, Floor>>;

export interface ReplyCall {
  name: string;
  /** The caller's lines, one per turn, on one call. */
  says: readonly string[];
  /** One per turn: the same under every classifier answer, or per answer. */
  floors: ReadonlyArray<Floor | ByAnswer>;
  /** The local hour the call happens at (default 12). */
  hour?: number;
  /** The session's unfinished-turn hold is still holding each line when its reply is asked for. */
  held?: boolean;
  /**
   * The caller cuts off each reply: it goes into the history as interrupted. The one split-read
   * call: its reads give the answer only when their input holds its first line, none otherwise
   * (crisis-reply-never-lower.grid.ts splitRead), so a read of the whole turn differs from a read
   * of the latest line alone. Every other call gives every read one answer.
   */
  cut?: boolean;
}

/** No pattern reads the line as risk: the classifier's answer is all there is. */
const CLASSIFIER_DECIDES: ByAnswer = {
  none: 'none',
  crisis: 'guided',
  imminent: 'emergency',
  other: 'emergency',
  throws: 'none',
  never: 'none',
};
/** A pattern reads worry for someone else; an imminent answer still gets the emergency script. */
const WORRY_FOR_SOMEONE: ByAnswer = {
  ...CLASSIFIER_DECIDES,
  none: 'guided',
  throws: 'guided',
  never: 'guided',
};

const PLAIN = 'i want to kill myself';
const PILLS = 'i have a bottle of pills and i want to take them all';

export const CALLS: readonly ReplyCall[] = [
  { name: 'ordinary', says: ['what should I cook tonight?'], floors: [CLASSIFIER_DECIDES] },
  // A loss said without a death word: HEAVY_MOMENT_WIDER reads it as heavy (heavy-moment.ts).
  {
    name: 'a quiet loss',
    says: ['I was at the cemetery all afternoon yesterday.'],
    floors: [CLASSIFIER_DECIDES],
  },
  { name: 'pills', says: [PILLS], floors: [CLASSIFIER_DECIDES] },
  { name: 'pills at midnight', says: [PILLS], hour: 0, floors: [CLASSIFIER_DECIDES] },
  {
    name: 'unsafe',
    says: ['i feel unsafe with myself tonight'],
    floors: [CLASSIFIER_DECIDES],
  },
  { name: 'plain', says: [PLAIN], floors: ['crisis line'] },
  { name: 'plain at midnight', says: [PLAIN], hour: 0, floors: ['crisis line'] },
  { name: 'under 18', says: ["I'm 15 and I want to kill myself"], floors: ['crisis line'] },
  {
    name: 'in Spanish',
    says: ['ya no quiero vivir, me quiero morir'],
    floors: ['crisis line'],
  },
  {
    name: 'someone else collapsed',
    says: ["my roommate just collapsed and she isn't breathing"],
    floors: ['emergency'],
  },
  {
    name: 'a friend at risk',
    says: ['my friend told me she wants to kill herself'],
    floors: [WORRY_FOR_SOMEONE],
  },
  { name: 'the turn after', says: [PLAIN, 'ok'], floors: ['crisis line', CLASSIFIER_DECIDES] },
  {
    name: 'one thought in two turns',
    says: ['i have the pills right here', 'and i am going to take all of them tonight'],
    floors: [CLASSIFIER_DECIDES, 'crisis line'],
  },
  {
    name: 'said, then taken back',
    says: [PLAIN, 'just kidding, forget i said that'],
    floors: ['crisis line', CLASSIFIER_DECIDES],
  },
  {
    name: 'a line still held',
    says: ['i have been thinking that maybe i should just'],
    held: true,
    floors: [CLASSIFIER_DECIDES],
  },
  // The caller cuts off the 988 script to go on: the script was never heard whole. The one
  // split-read call (`cut`): a read answers only when it holds the first line, so the second
  // turn's floor is none (its latest line alone reads none) and the whole-turn read raises it.
  {
    name: 'said, then cut off',
    says: [PLAIN, 'anyway, what should I cook tonight?'],
    cut: true,
    floors: ['crisis line', 'none'],
  },
];

/** Words no reply may carry, whatever else it says. */
export const NEVER_HEARD: readonly string[] = [
  "don't call 911",
  'do not call 911',
  "don't call 988",
  'do not call 988',
];

/**
 * Every field of the session the gate reads on these calls, at the defaults and with every flag
 * on. Measured by the test, which fails on a field that is not here. Three carry a time:
 * callerTimezone, evalLocalTime and services.sessionStartTime. The test sets each where it
 * reads the flags in CLOCK_READ_BY. A new field worked out from the time of day (a late-night
 * mark, say) goes here only with readings that set it to each value a reply can turn on.
 */
export const SESSION_FIELDS_READ: readonly string[] = [
  'emit',
  'history',
  'off',
  'on',
  'unfinishedTurnHoldMs',
  'userData',
  'userData.callerTimezone',
  'userData.crisisGatePassedTurn',
  'userData.evalLocalTime',
  'userData.evalLocalTime.hour',
  'userData.evalLocalTime.minute',
  'userData.isReturningUser',
  'userData.personaId',
  'userData.services',
  'userData.services.devMode',
  'userData.services.sessionId',
  'userData.services.sessionStartTime',
  'userData.services.userId',
  'userData.services.userProfile',
  'userData.turnCount',
  'userData.userId',
  'userData.userName',
  'userData.userProfile',
  'userData.voiceEmotion',
];

/**
 * The copies of the environment made while a reply is being made (a spread, Object.assign,
 * keys, entries, JSON.stringify). A flag read off a copy is not recorded as read, so the test
 * would never set it. All measured by the test:
 * - by: the functions that copy. Two today: the classifier's start, which builds its plain
 *   prompt from a copy with the everyday rules off; and the scripted turn's read
 *   (CRISIS_SCRIPT_IMMINENT_READ), which gives the classifier a copy with its own deadline;
 * - lines: the lines of code that copy, by file. The classifier's hands its copy to
 *   crisisClassifierPrompt and nothing else;
 * - kept: a copy kept under a name, with every line that names it or the options it is put
 *   in. The scripted read's goes to startCrisisClassifier and nowhere else;
 * - readOffTheCopy: the names crisisClassifierPrompt reads off its copy, exactly;
 * - readOffTheScriptedCopy: the flags startCrisisClassifier reads off the scripted read's copy
 *   on the calls, exactly. Each name in either list must be a flag the gate also reads off
 *   the environment itself, where every word of it is tried;
 * - byFlagAlone: the flags that, set alone, have a reply copy the environment;
 * - how many copies the calls make, run once: at the defaults, and with every flag the gate
 *   reads on, and live (the everyday rules take the word on only; the scripted read takes
 *   live as on).
 * A new copy in the gate's path changes one of these. Read the flag from the environment
 * itself, or show here why the copy cannot carry a flag's lowering.
 */
export const ENV_COPIED = {
  /** In the order of `lines`. */
  by: [
    'scriptRead in src/agents/personas/crisis-script-imminent.ts',
    'startCrisisClassifier in src/services/safety/crisis-classifier.ts',
  ],
  /** Each file that copies, with its copying lines. Another site is another row. */
  lines: {
    'src/agents/personas/crisis-script-imminent.ts': [
      'const readEnv = { ...env, CRISIS_CLASSIFIER_TIMEOUT_MS: String(waitMs) };',
    ],
    'src/services/safety/crisis-classifier.ts': [
      "? crisisClassifierPrompt({ ...env, CRISIS_CLASSIFIER_EVERYDAY_RULES: 'off' })",
    ],
  } as Readonly<Record<string, readonly string[]>>,
  /** A copy kept under a name: every line of the file that says one of the names. */
  kept: {
    'src/agents/personas/crisis-script-imminent.ts': {
      names: ['readEnv', 'options'],
      lines: [
        'const readEnv = { ...env, CRISIS_CLASSIFIER_TIMEOUT_MS: String(waitMs) };',
        'const options = { ...at, scope: undefined, env: readEnv, readBlocked: true };',
        'const run = startCrisisClassifier(said, options);',
      ],
    },
  } as Readonly<Record<string, { names: readonly string[]; lines: readonly string[] }>>,
  /** Every name crisisClassifierPrompt reads off the copy. */
  readOffTheCopy: ['CRISIS_AGREEMENT_GATE', 'CRISIS_CLASSIFIER_EVERYDAY_RULES'],
  /** Every flag startCrisisClassifier reads off the scripted read's copy. */
  readOffTheScriptedCopy: [
    'CRISIS_AGREEMENT_GATE',
    'CRISIS_CLASSIFIER_BLOCKED_SIGNAL',
    'CRISIS_CLASSIFIER_EVERYDAY_RULES',
    'CRISIS_CLASSIFIER_SECOND_READ',
    'CRISIS_IMMINENT_NEEDS_AGREEMENT',
  ] as readonly string[],
  byFlagAlone: [
    'CRISIS_CLASSIFIER_EVERYDAY_RULES',
    'CRISIS_SCRIPT_IMMINENT_READ',
  ] as readonly string[],
  atDefaults: 0,
  everyFlagOn: 84,
  everyFlagLive: 42,
} as const;

/**
 * The flags that have a reply ask the clock for the hour, the weekday, the date or the
 * timezone. Measured by the test: a flag does so exactly if it is here. Each is read at every
 * hour, weekday and month and more (MOMENTS in the test); every other flag only at the calls'
 * own moments.
 */
export const CLOCK_READ_BY: readonly string[] = ['FERNI_STATE', 'WORLD_NOW'];

/**
 * How much wording the test does not read, counted so the limit can't be stated loosely. The
 * test measures each number and fails when one is out of date.
 * - atDefaults.scripted: turns code speaks. Read for 911, 988 and their order only: a sentence
 *   with no number in it, lost with the flag on and off alike, is not seen.
 * - atDefaults.guided: turns the model speaks after being asked to give 988. Only the numbers
 *   in what it is asked are read.
 * - atDefaults.unguided: turns the model speaks with no number asked. Nothing is read but
 *   that the reply came, and in time.
 * - onlyWithFlag: each flag that, set alone, has code speak sentences it does not speak on
 *   that turn at the defaults (a whole script, or a line added to one or after the model's
 *   reply), with how many different sentences. They have nothing to be compared with, so
 *   dropping one is a lowering brought by a flag setting that the test does not see.
 *   CRISIS_TIMEOUT_CHECKIN brings the check-in's ending after the model's reply: the question
 *   "Are you safe right now?" and the line that gives 988. Its 988 is read (the '988 spoken'
 *   floor in SHOWN_ON); the question, and the line's other words, are not.
 *   CRISIS_SELF_HARM_911_LINE brings one sentence after the crisis-line script, about 911.
 *   CRISIS_SCRIPT_IMMINENT_READ brings the imminent script after the crisis-line script's
 *   first sentence, on an imminent read. That its 911 comes first is read (the 'emergency'
 *   floor in SHOWN_ON); its other words are not.
 *   CRISIS_GATE_TURN_READS brings the emergency script on the turn after a cut-off crisis line,
 *   when the read of the whole turn is imminent ("said, then cut off"). That 911 leads is read
 *   (the 'emergency' floor in SHOWN_ON); its other words are not.
 *   CRISIS_GUIDED_LINE_FLOOR brings the line a crisis guide's reply left out, after it: the
 *   caller's 988 line, or the for-them 988 line for a friend at risk. Its 988 is read (the
 *   '988 spoken' floor in SHOWN_ON); the lines' other words are not.
 *   `sentences` is how many; `says` is the number those sentences must carry. So a flag's
 *   sentence dropped whole, or kept with its number taken out, is seen; its other words changed
 *   is not.
 */
export const WORDING_NOT_READ: {
  atDefaults: { scripted: number; guided: number; unguided: number };
  onlyWithFlag: Readonly<Record<string, { sentences: number; says: readonly string[] }>>;
} = {
  atDefaults: { scripted: 74, guided: 13, unguided: 33 },
  onlyWithFlag: {
    CRISIS_GATE_TURN_READS: { sentences: 6, says: ['911', '988'] },
    CRISIS_GUIDED_LINE_FLOOR: { sentences: 3, says: ['988'] },
    CRISIS_SCRIPT_IMMINENT_READ: { sentences: 5, says: ['911', '988'] },
    CRISIS_SELF_HARM_911_LINE: { sentences: 1, says: ['911'] },
    CRISIS_TIMEOUT_CHECKIN: { sentences: 2, says: ['988'] },
  },
};

/** A call a flag shows on, and, where the flag is there to raise a reply, what it raises. */
export interface Shown {
  call: string;
  /**
   * With the flag on, the call's turn under this answer meets this floor; without, not. The turn
   * is the first unless a third entry names it (0-based).
   */
  raises?: readonly [Answer, Floor] | readonly [Answer, Floor, number];
}

/**
 * Crisis-lane flags checked at the reply, each with a call above that it changes a turn of. The
 * test fails when the flag stops changing that call, so a row can't outlive what it shows.
 * (Flags outside the crisis lane that the gate reads are checked too; they need no row.)
 */
export const SHOWN_ON: Readonly<Record<string, Shown>> = {
  // The whole turn since the last reply heard whole: the cut-off script's words are read again.
  CRISIS_GATE_TURN_READS: { call: 'said, then cut off', raises: ['imminent', 'emergency', 1] },
  // A crisis guide's reply names its line (crisis lead, 2026-11-17): code says 988 when the model doesn't.
  CRISIS_GUIDED_LINE_FLOOR: { call: 'pills', raises: ['crisis', '988 spoken'] },
  CRISIS_READ_JOINED_TURN: { call: 'a line still held' },
  // A turn the patterns answer with the 988 script is still read: imminent makes it 911-first.
  CRISIS_SCRIPT_IMMINENT_READ: { call: 'plain', raises: ['imminent', 'emergency'] },
  // The owner's rule (2026-11-11): a check-in plus 988, and code says the 988 itself.
  CRISIS_TIMEOUT_CHECKIN: { call: 'pills', raises: ['throws', '988 spoken'] },
  FERNI_STATE: { call: 'ordinary' },
  // Loss without a death word reads heavy: it only holds laughs, play and bright sounds back.
  HEAVY_MOMENT_WIDER: { call: 'a quiet loss' },
  SEXUAL_TOPIC_BOUNDARY: { call: 'ordinary' },
};

/**
 * Flags known to lower a reply today: the value that does it, and exactly what is lost. Each
 * must stay off by default; the test fails once it stops lowering, so the row is deleted and
 * the flag gets a SHOWN_ON row. `onEveryLive`: exactly what is lost on top of every other flag
 * set to live, where another flag's raise is lost with it; absent, the same as `lost`.
 */
export const LOWERS_A_REPLY: Readonly<
  Record<string, { value: string; lost: readonly string[]; onEveryLive?: readonly string[] }>
> = {
  // A friend-at-risk line the classifier reads as the caller's own crisis: the guidance for
  // a worried friend (988 for them, 911 if the danger is immediate) gives way to the caller's
  // own, which has no 911.
  THIRD_PARTY_SELF_HARM: {
    value: 'live',
    lost: ['a friend at risk/crisis turn 1 :: 911 asked of the model'],
    // With CRISIS_GUIDED_LINE_FLOOR live, code speaks the for-them line, whose 911 this
    // flag's re-read drops too: the caller's own line is 988 only (crisis lead, 2026-11-17).
    onEveryLive: ['a friend at risk/crisis turn 1 :: 911 spoken, 911 asked of the model'],
  },
};
