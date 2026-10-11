import { afterEach, describe, expect, it } from 'vitest';
import { callCharacter, teamLine } from '../../../personas/call-character.js';
import {
  DIRECTOR_SYSTEM,
  Director,
  buildDirectorPrompt,
  directorSystemFor,
  type Line,
} from '../director-notes.js';
import { toldThisCall } from '../told-this-call.js';
import {
  TurnUnderstander,
  UNDERSTANDING_PROMPT,
  understandingPrompt,
} from '../turn-understanding.js';

// The prompts as they were before they knew who is on the call (origin/main 4336cd4d1).
const ROLE =
  'You are the director of a live, unscripted phone call between Ferni (warm, dry, curious; grew up in Wyoming, lived in Japan, a life coach who talks like a friend) and someone he cares about. Ferni improvises every word. Between his turns you whisper at most two private notes for his next reply.';
const RULES = [
  "Never tell him to acknowledge, validate, support or ask about feelings: that's what a therapist does and he's a friend. Never write lines for him to say.",
  "Pauses, short answers and unanswered questions are normal in conversation: never tell him to call them out, ask again or check they're still there. Prefer an observation to an instruction to ask something.",
  "Don't guess at hidden motives or moods (that they're dodging, ignoring him, testing him, stuck, distant, escaping) and never tell him to talk about their tone, mood or reasons instead of what they said. When they ask something, the next reply answers it.",
  'If the conversation is flowing and Ferni is doing fine, reply NONE. Reply with only the notes, one per line, no numbering, or exactly NONE.',
];
const FERNI_DIRECTOR_BEFORE = [
  ROLE,
  "Every note must point at something that actually happened in this call, naming the detail: what they hinted at but didn't say, a pattern across what they've said, the mood or energy they're bringing, or a habit of Ferni's to drop (too many questions, fixing too early, sounding upbeat, repeating himself). Give the nudge and its reason in under 20 words.",
  'Ferni reads your notes only after they have spoken again, and what they say next comes first. So never send him back to an earlier line: no connecting to, coming back to or following up on something they said. Say what you notice about them instead.',
  ...RULES,
];
const FERNI_LOOKING_BACK_BEFORE = [
  ROLE,
  "Every note must point at something that actually happened in this call, naming the words or detail: what they hinted at but didn't say, a pattern across what they've said, something from earlier worth coming back to, the energy they're bringing, or a habit of Ferni's to drop (too many questions, fixing too early, sounding upbeat, repeating himself). Give the nudge and its reason in under 20 words.",
  ...RULES,
];
const FERNI_UNDERSTANDING_BEFORE = `You listen in on a phone call between a caller and their friend Ferni. Read the caller's words (EARLIER is context; judge NOW, which may still be mid-sentence) and return JSON only:
{"move":"ack"|"lookup"|"request"|"about_ferni"|"share","needsTool":bool,"mood":"venting"|"tender"|"bad_news"|"funny"|"surprise"|"excited"|"neutral","laughed":bool,"laughFits":bool,"adviceFits":bool,"wantsToEnd":bool,"reaction":string|null}
move: ack = a short acknowledgement ("yeah", "okay", "thanks"); lookup = asks for live facts (weather, news, scores, times, prices); request = asks Ferni to do or explain something; about_ferni = asks about Ferni himself; share = telling something about their own life or thoughts.
needsTool: true if answering well means doing something (timer, alarm, reminder, music, calendar, note, remembering a fact they asked to keep) or looking something up.
mood: venting = frustrated, tired, stressed or upset; tender = moved, emotional in a warm way; bad_news = something went wrong or someone is hurt or sick; funny = amusing; surprise = big or unexpected news; excited = happy and energized.
laughed: they laughed or are joking. laughFits: a good friend would genuinely laugh here (never at bad news, grief, tenderness or venting). adviceFits: the moment is light and nothing is asked of Ferni right now.
reaction: what a close friend might murmur while still listening to something they are telling ("Oh no", "Ha", "Aw", "Whoa", "No way", "Oof", "Mm"), or null when silence is better. Always null when they ask Ferni something or ask him to do something: that gets a reply, not a murmur.`;

const ferni = callCharacter('ferni');
const maya = callCharacter('maya-santos');
/** The prompt with the team line taken out, to compare with the prompt before it. */
const withoutTeam = (prompt: string, c = ferni) =>
  prompt
    .split('\n')
    .filter((l) => l !== teamLine(c))
    .join('\n');

const call: Line[] = [
  { speaker: 'user', text: 'I keep skipping my morning walk.' },
  { speaker: 'ferni', text: "I'm Maya, by the way. What gets in the way of the walk?" },
];

describe('director and turn understanding know who is on the call', () => {
  afterEach(() => {
    delete process.env.DIRECTOR_LOOK_BACK;
  });

  it("leaves Ferni's prompts as they were, apart from the team line", () => {
    expect(withoutTeam(DIRECTOR_SYSTEM)).toBe(FERNI_DIRECTOR_BEFORE.join('\n'));
    expect(DIRECTOR_SYSTEM.split('\n')[1]).toBe(teamLine(ferni));
    process.env.DIRECTOR_LOOK_BACK = 'on';
    expect(withoutTeam(directorSystemFor(ferni))).toBe(FERNI_LOOKING_BACK_BEFORE.join('\n'));
    expect(UNDERSTANDING_PROMPT).toBe(FERNI_UNDERSTANDING_BEFORE);
    expect(buildDirectorPrompt(call, 'Seth')).toContain("Your notes for Ferni's next reply:");
  });

  it('steers a Maya call as Maya, with none of Ferni in it but his name on the team', () => {
    const system = directorSystemFor(maya);
    expect(system).toContain('between Maya (');
    expect(system).toContain('someone she cares about. Maya improvises every word.');
    expect(system).toContain("a habit of Maya's to drop");
    expect(system).toContain("that's what a therapist does and she's a friend");
    expect(system).not.toMatch(/Wyoming|Japan|\bhim\b|\bhis\b/);
    expect(withoutTeam(system, maya)).not.toMatch(/Ferni/);

    const prompt = buildDirectorPrompt(call, 'Seth', maya);
    expect(prompt).toContain("Maya: I'm Maya, by the way.");
    expect(prompt).toContain("Your notes for Maya's next reply:");
    expect(prompt).not.toMatch(/Ferni/);

    const understanding = understandingPrompt(maya);
    expect(understanding).toContain('their friend Maya');
    expect(understanding).toContain('about_ferni = asks about Maya herself');
    expect(understanding.replace(/about_ferni/g, '')).not.toMatch(/Ferni|\bhim\b/);
  });

  it('names the team, so asking for a teammate reads as a transfer, not a friend', () => {
    expect(teamLine(ferni)).toBe(
      "Ferni's teammates are Maya, Alex, Peter, Jordan and Nayan: colleagues on his team, not friends of the caller. When the caller asks for one of them, even by a name the transcript got slightly wrong, they want to be transferred; never treat it as a mistake."
    );
    expect(teamLine(maya)).toMatch(
      /^Maya's teammates are Ferni, Alex, Peter, Jordan and Nayan: colleagues on her team/
    );
    expect(directorSystemFor(maya)).toContain(teamLine(maya));
    expect(directorSystemFor(callCharacter('nayan-patel'))).toContain(
      "Nayan's teammates are Ferni, Maya, Alex, Peter and Jordan"
    );
    // A legend's team is the legends.
    expect(teamLine(callCharacter('john-bogle'))).toMatch(
      /^John Bogle's teammates are Peter Lynch and Joel/
    );
  });

  it('gives the model the persona on the call now, following a handoff', async () => {
    const asked: Array<{ system: string; prompt: string }> = [];
    let onCall = ferni;
    const director = new Director({
      sessionId: 's',
      writer: async (system, prompt) => (asked.push({ system, prompt }), 'NONE'),
      character: () => onCall,
    });
    await director.observe(call);
    onCall = maya;
    await director.observe(call);
    expect(asked[0].system).toBe(DIRECTOR_SYSTEM);
    expect(asked[0].prompt).toContain('Ferni: ');
    expect(asked[1].system).toBe(directorSystemFor(maya));
    expect(asked[1].prompt).toContain('Maya: ');
    expect(asked[1].prompt).not.toContain('Ferni: ');
  });

  it('asks turn understanding about the persona on the call', async () => {
    const systems: string[] = [];
    const u = new TurnUnderstander(
      async (system) => (systems.push(system), '{}'),
      Date.now,
      100,
      () => understandingPrompt(maya)
    );
    await u.settle('can you remind me to stretch');
    expect(systems).toEqual([understandingPrompt(maya)]);
  });

  it("doesn't count the persona saying its own name as bringing someone up", () => {
    expect(toldThisCall(call, 'Seth', 'Maya').names).toEqual([]);
    expect(toldThisCall(call, 'Seth').names.map((n) => n.name)).toEqual(['Maya']);
  });
});
