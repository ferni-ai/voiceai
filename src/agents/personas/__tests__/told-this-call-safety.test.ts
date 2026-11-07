/**
 * #2797: the "Don't say again" part of the told-this-call note must never tell
 * the model to drop a safety question, and says nothing at all once the call
 * has crisis risk noted (told-this-call.ts keptTold).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Director, type Line } from '../director-notes.js';
import { isSafetyLine } from '../phrase-loops.js';
import { formatTold, keptTold, toldThisCall } from '../told-this-call.js';
import { isSafetyTalk, reachesHelp } from '../../../services/safety/index.js';
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

describe('safety talk is never quoted or listed (services/safety/safety-talk.ts)', () => {
  // #3565's help lines and care lines (fixtures/safety-talk-corpus.json).
  const HELP_AND_CARE = [
    'You can text HOME any time.',
    'The Trevor Project is there all night.',
    'Telefonseelsorge is free to call.',
    'SOS Amitie listens day and night.',
    'Befrienders Worldwide lists a line near you.',
    'Stay right here with me.',
    'Hold onto something cold.',
    'Hand the keys to your friend.',
    "You've survived every hard day so far.",
    'Can you get away from the tracks?',
  ];
  const CARE_LINE = 'Can you get somewhere with other people?';
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
    for (const line of [...HELP_AND_CARE, CARE_LINE]) expect(isSafetyTalk(line), line).toBe(true);
    expect(reachesHelp(CARE_LINE)).toBe(false);
    for (const line of [...LOOK_ALIKES, ...ORDINARY_LINES])
      expect(isSafetyTalk(line), line).toBe(false);
  });

  it.each(HELP_AND_CARE)('never quotes or lists %s, said in three replies', async (line) => {
    const note = await toldNote(saidThrice(line));
    expect(note).not.toContain(line.slice(0, 18));
    for (const name of ['HOME', 'Trevor', 'Telefonseelsorge', 'Amitie', 'Befrienders', 'Worldwide'])
      expect(note, name).not.toContain(name);
  });

  it('never quotes a care line said in three replies', async () => {
    expect(await toldNote(saidThrice(CARE_LINE))).not.toContain(CARE_LINE);
  });

  it.each(LOOK_ALIKES)('still quotes the look-alike %s, as main does', async (line) => {
    expect(await toldNote(saidThrice(line))).toBe(
      `[Already said this call: Don't say again: "${line}"]`
    );
  });

  it("quotes main's ordinary repeats, minus the safety talk, and never one main cut", async () => {
    const [first, second, third] = ORDINARY_LINES;
    const note = await toldNote(saidThrice([first, HELP_AND_CARE[0], second, third].join(' ')));
    // Main quotes the first three: first, the HOME line, second. third was cut at the cap.
    expect(note).toBe(`[Already said this call: Don't say again: "${first}"; "${second}"]`);
  });

  it('never names a reused phrase that is safety talk (PHRASE_LOOP_GUARD=on)', async () => {
    process.env.PHRASE_LOOP_GUARD = 'on';
    try {
      const note = await toldNote(saidThrice('Hand the keys to your friend.'));
      expect(note).not.toMatch(/keys|friend/);
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
    const said = [...help, 'Hand the keys to your friend.', ORDINARY, POINTING_BACK[1]];
    const note = await toldNote(saidThrice(said.join(' ')));
    // Main quotes the three help lines and cuts the rest; none may take their place.
    expect(note).not.toContain(DONT_SAY);
    expect(note).not.toMatch(/HOME|Trevor|keys|judge|line I mentioned/);
    expect(note).toContain('"winter night still feels like coming"'); // its reused phrase, as on main
  });
});
