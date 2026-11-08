/**
 * #2797: the "Don't say again" part of the told-this-call note must never tell
 * the model to drop a safety question, and says nothing at all once the call
 * has crisis risk noted (told-this-call.ts keptTold).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Director, type Line } from '../director-notes.js';
import { isSafetyLine } from '../phrase-loops.js';
import { formatTold, keptTold, toldThisCall } from '../told-this-call.js';
import { isCareTalk, isSafetyTalk, reachesHelp } from '../../safety/crisis-guard.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';

const user = (text: string): Line => ({ speaker: 'user', text });
const ferni = (text: string): Line => ({ speaker: 'ferni', text });

const SAFETY_QUESTION = 'Are you somewhere safe right now?';
const ORDINARY = 'The quiet hum of a winter night still feels like coming home.';
const DONT_SAY = "Don't say again";

// A distress call where Ferni asked the safety check-in twice, and also repeated
// an ordinary line twice.
const distressCall: Line[] = [
  user('I just feel done with all of it.'),
  ferni(`I'm really glad you told me. ${SAFETY_QUESTION}`),
  user("I don't know."),
  ferni(`I'm right here with you. ${SAFETY_QUESTION}`),
  user('Talk to me about anything else.'),
  ferni(`Sure. ${ORDINARY}`),
  user('What else?'),
  ferni(`Winter is my favourite. ${ORDINARY}`),
];

const keepAll = (): boolean => true;

beforeEach(() => resetCrisisCallRisk());
afterEach(() => resetCrisisCallRisk());

describe('told-this-call never tells the model to drop safety wording (#2797)', () => {
  it('quotes a repeated ordinary line but never the repeated safety question', () => {
    const told = toldThisCall(distressCall);
    // Precondition: the raw record holds both, so the unfiltered note would quote both.
    expect(told.repeated).toContain(SAFETY_QUESTION);
    expect(formatTold(told)).toContain(`"${SAFETY_QUESTION}"`);

    const note = formatTold(keptTold(told, keepAll));
    expect(note).toContain(DONT_SAY);
    expect(note).toContain(ORDINARY);
    expect(note).not.toContain(SAFETY_QUESTION);
  });

  it('quotes nothing once the call has crisis risk noted', () => {
    const told = toldThisCall(distressCall);
    expect(formatTold(keptTold(told, keepAll, 'risky'))).toContain(DONT_SAY); // before risk

    noteCrisisRisk('risky');
    const note = formatTold(keptTold(told, keepAll, 'risky'));
    expect(note).not.toContain(DONT_SAY);
    expect(note).not.toContain(ORDINARY);

    // Another call's risk changes nothing here.
    expect(formatTold(keptTold(told, keepAll, 'other-call'))).toContain(DONT_SAY);
  });

  it('holds through the real director the next request reads from', async () => {
    const director = new Director({ sessionId: 'director-call', writeNotes: false });
    await director.observe(distressCall);
    const before = director.told();
    expect(before).toContain(ORDINARY);
    expect(before).not.toContain(SAFETY_QUESTION);

    noteCrisisRisk('director-call');
    expect(director.told()).not.toContain(DONT_SAY);
  });
});

describe('safety lines the scripts do not word are never quoted (SAFETY_TOPIC)', () => {
  // Paraphrases from the #2804 verify that the script match alone missed.
  const paraphrases = [
    'Do you have a plan to hurt yourself tonight?',
    'You can call or text 988 any time, day or night.',
    'Is there someone with you right now who can stay close?',
    "I want to make sure you're okay and not in any danger tonight, are you safe?",
  ];

  it('flags each paraphrase, and leaves an ordinary line quotable', () => {
    for (const line of paraphrases) expect(isSafetyLine(line), line).toBe(true);
    expect(isSafetyLine(ORDINARY)).toBe(false);
  });

  it('never quotes one said twice, with no crisis risk noted', () => {
    for (const line of paraphrases) {
      const lines = [user('hey'), ferni(`Okay. ${line}`), user('hm'), ferni(`Alright. ${line}`)];
      const told = toldThisCall(lines);
      expect(formatTold(told), line).toContain(line.slice(0, 20)); // precondition: recorded
      expect(formatTold(keptTold(told, keepAll)), line).not.toContain(line.slice(0, 20));
    }
  });
});

describe('a way to reach help is never quoted or listed (services/safety/safety-talk.ts)', () => {
  // #3565's help lines (fixtures/safety-talk-corpus.json).
  const HELP = [
    'You can text HOME any time.',
    'The Trevor Project is there all night.',
    'Telefonseelsorge is free to call at any hour of the night.',
    'SOS Amitie listens day and night.',
    'Befrienders Worldwide lists a line near you.',
  ];
  // #3565's care lines. Care wording alone is quotable, as on main (owner call S4,
  // #3592): the care reader fires on everyday words like "please" and "tonight".
  const CARE = [
    'Hand the keys to your friend.',
    "You've survived every hard day so far.",
    'Can you get away from the tracks?',
    'Can you get somewhere with other people?',
    'I am worried about you, and I am staying right here.',
  ];
  // Everyday lines with a care word in them (the S4 measurement's four shapes).
  const TRIGGER_WORD = [
    "Tonight's game against Denver should be a close one.",
    'Please send me the recipe for that lemon cake.',
    'The train tracks near your place make a cozy sound at night.',
    'We should lock in the dinner reservation before Friday.',
  ];
  // #3565 "ordinary talk is no safety talk": a help word in an everyday sentence.
  const LOOK_ALIKES = ["I'll text home when I land.", 'We watched that police procedural again.'];
  const ORDINARY_LINES = [
    ORDINARY,
    'My sourdough starter finally doubled in size this morning.',
    'That old bookshop on the corner sells the best maps.',
  ];
  const LEADS = ['Okay.', 'Alright.', 'I hear you.'];

  /** A call where Ferni says `said` in three replies. */
  const saidThrice = (said: string): Line[] =>
    LEADS.flatMap((lead, i) => [user(`Turn ${i}.`), ferni(`${lead} ${said}`)]);
  const toldNote = async (lines: Line[]): Promise<string> => {
    const director = new Director({ sessionId: 'safety-talk-call', writeNotes: false });
    await director.observe(lines);
    return director.told();
  };

  it('the readers agree with the rows below', () => {
    for (const line of HELP) expect(reachesHelp(line), line).toBe(true);
    // The care reader fires on each, and nothing else does, so each row below
    // tests the care reader's absence.
    for (const line of [...CARE, ...TRIGGER_WORD]) {
      expect(isCareTalk(line), line).toBe(true);
      expect(reachesHelp(line), line).toBe(false);
      expect(isSafetyLine(line), line).toBe(false);
    }
    for (const line of [...LOOK_ALIKES, ...ORDINARY_LINES])
      expect(isSafetyTalk(line), line).toBe(false);
  });

  it.each(HELP)('never quotes or lists %s, said in three replies', async (line) => {
    const note = await toldNote(saidThrice(line));
    expect(note).not.toContain(line.slice(0, 18));
    for (const name of ['HOME', 'Trevor', 'Telefonseelsorge', 'Amitie', 'Befrienders', 'Worldwide'])
      expect(note, name).not.toContain(name);
  });

  // Non-US lines long enough to be recorded (a 5-word line never is, so it tests
  // nothing). The English wording is read by reachesHelp alone.
  const NON_US = [
    'Die Telefonseelsorge ist rund um die Uhr unter null acht hundert erreichbar.',
    HELP[2],
  ];
  it.each(NON_US)('records %s said in three replies, and keptTold drops it', (line) => {
    const told = toldThisCall(saidThrice(line));
    expect(formatTold(told)).toContain(`"${line}"`); // precondition: main quotes it
    expect(formatTold(keptTold(told, keepAll))).not.toContain('Telefonseelsorge');
  });

  it.each([...CARE, ...TRIGGER_WORD])(
    'still quotes %s said in three replies, as main does',
    async (line) => {
      expect(await toldNote(saidThrice(line))).toContain(`Don't say again: "${line}"]`);
    }
  );

  it('quotes the care line and not the help line said beside it', async () => {
    const [care] = CARE.slice(-1);
    expect(await toldNote(saidThrice(`${care} ${HELP[0]}`))).toBe(
      `[Already said this call: Don't say again: "${care}"]`
    );
  });

  it.each(LOOK_ALIKES)('still quotes the look-alike %s, as main does', async (line) => {
    expect(await toldNote(saidThrice(line))).toBe(
      `[Already said this call: Don't say again: "${line}"]`
    );
  });

  it("quotes main's ordinary repeats, minus the safety talk, and never one main cut", async () => {
    const [first, second, third] = ORDINARY_LINES;
    const note = await toldNote(saidThrice([first, HELP[0], second, third].join(' ')));
    // Main quotes the first three: first, the HOME line, second. third was cut at the cap.
    expect(note).toBe(`[Already said this call: Don't say again: "${first}"; "${second}"]`);
  });

  it('never names a reused phrase of a help line, and still names a care one (PHRASE_LOOP_GUARD=on)', async () => {
    process.env.PHRASE_LOOP_GUARD = 'on';
    try {
      expect(await toldNote(saidThrice(HELP[4]))).toBe('');
      expect(await toldNote(saidThrice(CARE[0]))).toContain(
        'You keep reusing "hand the keys to your friend" (3 replies).'
      );
    } finally {
      delete process.env.PHRASE_LOOP_GUARD;
    }
  });

  it('says exactly what main says on a call with no safety talk', async () => {
    const call: Line[] = [
      user('How was your week?'),
      ferni(
        'I remember Marguerite baking bread every Sunday. The quiet hum of a winter night still feels like coming home.'
      ),
      user('That sounds lovely.'),
      ferni(
        'Marguerite taught me patience. Even after all these years, the quiet hum of a winter night still feels like coming home.'
      ),
      user('Tell me about your morning.'),
      ferni(
        'My sourdough starter finally doubled in size this morning, which felt like a small victory honestly.'
      ),
    ];
    expect(await toldNote(call)).toBe(
      "[Already said this call: You've brought up Marguerite (2 replies). Leave them unless they ask. " +
        "You've told 2 stories about yourself already. Keep this reply on them. " +
        'Don\'t say again: "The quiet hum of a winter night still feels like coming home."; ' +
        '"My sourdough starter finally doubled in size this morning, which felt like a small vict..."; ' +
        '"Even after all these years, the quiet hum of a winter night still feels like coming home."]'
    );
  });
});

describe('safety lines the talk reader misses, and pointers back to a line (#3592 r2)', () => {
  const LEADS = ['Okay.', 'Alright.', 'I hear you.'];
  const saidThrice = (said: string): Line[] =>
    LEADS.flatMap((lead, i) => [user(`Turn ${i}.`), ferni(`${lead} ${said}`)]);
  const toldNote = async (lines: Line[]): Promise<string> => {
    process.env.PHRASE_LOOP_GUARD = 'on';
    try {
      const director = new Director({ sessionId: 'r2-call', writeNotes: false });
      await director.observe(lines);
      return director.told();
    } finally {
      delete process.env.PHRASE_LOOP_GUARD;
    }
  };
  const NAMED_LINE = 'In Canada you can call Talk Suicide Canada any time you need.';
  const MEANS = 'Could you put the pills in another room for a while?';
  const POINTING_BACK = [
    'That number I gave you earlier is open all night long.',
    'The line I mentioned is free and they will not judge you.',
    'The counselors on that text service are kind and patient.',
    'The people on that line really do listen without rushing you.',
  ];

  it('the talk reader misses these, so each row below tests more than #3565', () => {
    for (const line of [NAMED_LINE, MEANS, ...POINTING_BACK])
      expect(isSafetyTalk(line), line).toBe(false);
  });

  it('never lists a help line named with no number, said in three replies', async () => {
    expect(await toldNote(saidThrice(NAMED_LINE))).not.toMatch(/Canada|Talk Suicide/);
  });

  it('never names a reused phrase of a means line, said in three replies', async () => {
    expect(await toldNote(saidThrice(MEANS))).not.toMatch(/pills|another room|for a while/);
  });

  it.each(POINTING_BACK)('never quotes or loops %s, said in three replies', async (line) => {
    expect(await toldNote(saidThrice(line))).toBe('');
  });

  it('never quotes a line main cut at the cap when safety talk took its place', async () => {
    const help = ['You can text HOME any time.', 'The Trevor Project is there all night.'];
    const said = [
      ...help,
      'Befrienders Worldwide lists a line near you.',
      ORDINARY,
      POINTING_BACK[1],
    ];
    const note = await toldNote(saidThrice(said.join(' ')));
    // Main quotes the three help lines and cuts the rest; none may take their place.
    expect(note).not.toContain(DONT_SAY);
    expect(note).not.toMatch(/HOME|Trevor|Befrienders|Worldwide|judge|line I mentioned/);
    expect(note).toContain('"winter night still feels like coming"'); // its reused phrase, as on main
  });
});

describe('pointers back to a safety line, in any word order (#3592 r3)', () => {
  const LEADS = ['Okay.', 'Alright.', 'I hear you.'];
  const saidThrice = (said: string): Line[] =>
    LEADS.flatMap((lead, i) => [user(`Turn ${i}.`), ferni(`${lead} ${said}`)]);
  const toldNote = async (lines: Line[]): Promise<string> => {
    process.env.PHRASE_LOOP_GUARD = 'on';
    try {
      const director = new Director({ sessionId: 'r3-call', writeNotes: false });
      await director.observe(lines);
      return director.told();
    } finally {
      delete process.env.PHRASE_LOOP_GUARD;
    }
  };
  // The five shapes the r3 verify found quoted, each in two more word orders, and
  // every noun with the back-reference before it and after it.
  const POINTING_BACK = [
    'I gave you a number earlier and I really hope you will call it tonight.',
    'The number I gave you earlier is still open all night tonight.',
    'Earlier I gave you a number, and I really hope you use it tonight.',
    'The number from before is still the best place to reach someone tonight.',
    'From before, that number is still the best one to call tonight.',
    'Call the number from before if it gets heavy again tonight.',
    'Those counselors I mentioned would really want to hear from you tonight.',
    'I mentioned those counselors because they really want to hear from you.',
    'Earlier I mentioned some counselors, they really want to hear from you.',
    'Remember the line from earlier, they are awake and ready to talk with you.',
    'From earlier, remember that line, they are awake and ready to talk.',
    'Earlier I gave you the line, they are awake and ready to talk.',
    'Reaching out to that line tonight could really help you get through it.',
    'That line is worth reaching out to tonight, it could really help.',
    'Tonight, reaching out to the line could really help you get through.',
    'The hotline I mentioned is open all night long for you tonight.',
    'I mentioned a hotline earlier and it is open all night long.',
    'The text service we talked about answers in minutes, day or night.',
    'We talked about a text service, and it answers in minutes, day or night.',
    'Those people I mentioned would really want to hear from you tonight.',
    'I mentioned those people because they really want to hear from you tonight.',
    'The crisis line from before is still open all night for you.',
    'From before, the crisis line is still open all night for you.',
    'We talked about that crisis line, it is open all night long.',
  ];
  // Everyday lines with a noun and a back-reference near each other.
  const EVERYDAY = [
    'The line at the coffee shop was out the door again this morning.',
    'I spent an hour counting the number of finches at the feeder.',
    'I mentioned the people at work who keep borrowing my good stapler.',
    'Earlier that line of thinking really did make a lot of sense to me.',
    'My phone number from before changed when I moved across town last spring.',
  ];

  it.each(POINTING_BACK)('never quotes or loops %s, said in three replies', async (line) => {
    // Precondition: the call records it, so the unfiltered note would quote it.
    expect(formatTold(toldThisCall(saidThrice(line)))).toContain(`"${line}"`);
    expect(await toldNote(saidThrice(line))).toBe('');
  });

  it.each(EVERYDAY)('still quotes %s said in three replies, as main does', async (line) => {
    expect(await toldNote(saidThrice(line))).toContain(`"${line}"`);
  });
});

// #3604 r2: read from structure (a back-reference near a referent that stands for
// help), so wording no list foresaw is still read. Rows are new; none tuned on.
describe('pointers back to help in wording no list foresaw (#3604 r2)', () => {
  const LEADS = ['Okay.', 'Alright.', 'I hear you.'];
  const saidThrice = (said: string): Line[] =>
    LEADS.flatMap((lead, i) => [user(`Turn ${i}.`), ferni(`${lead} ${said}`)]);
  const toldNote = async (lines: Line[]): Promise<string> => {
    const director = new Director({ sessionId: 'r4-call', writeNotes: false });
    await director.observe(lines);
    return director.told();
  };

  const POINTING_BACK = [
    'The volunteers I mentioned answer at any hour, day or night.',
    'You could text the line I gave you a little while ago.',
    'Please call the number I read out earlier if tonight gets heavier.',
    'Those listeners I told you about are there for you right now.',
    'Remember the chat service, it is open whenever you need it.',
    'The support I suggested at the start of our call still stands.',
    'Reach back out to the folks I connected you with whenever you want.',
    'I already gave you a number, and it works all night long.',
  ];
  // A back-reference in each, near a noun that belongs to something else.
  const EVERYDAY = [
    'The number I gave you for the landlord goes straight to voicemail now.',
    'The bus line I mentioned earlier stops right beside the library.',
    'Remember the folks from the choir, they sent another card again.',
    'That line I quoted from the novel still makes me laugh out loud.',
    'The recipe I told you about earlier needs a little more salt.',
    'Call the plumber at the number I left you, any time before noon.',
  ];

  it.each(POINTING_BACK)('never quotes or loops %s, said in three replies', async (line) => {
    expect(formatTold(toldThisCall(saidThrice(line)))).toContain(`"${line}"`);
    expect(isSafetyLine(line) || reachesHelp(line), line).toBe(false); // the matcher reads it
    expect(await toldNote(saidThrice(line))).toBe('');
  });

  it.each(EVERYDAY)('still quotes %s said in three replies, as main does', async (line) => {
    expect(await toldNote(saidThrice(line))).toContain(`"${line}"`);
  });
});
