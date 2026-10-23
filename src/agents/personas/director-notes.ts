/**
 * The director: private notes that nudge Ferni's next reply, instead of rules.
 *
 * After Ferni finishes a reply, a fast model reads the recent conversation
 * and writes zero to two short notes for the next reply: subtext worth
 * noticing, the energy to match, a habit to break. They are hints with
 * reasons, never lines, and never a pointer back to an earlier line: Ferni
 * reads them after the caller has spoken again (BACK_TO_EARLIER). The next request
 * carries them after the user's words (the channel the turn reminder showed
 * works; see turn-style.ts), and the character sheet tells Ferni to use them
 * only when they fit.
 *
 * It runs off the critical path: the notes are written while the caller is
 * talking and used on their next turn, so a slow or failed call just means no
 * note. DIRECTOR_NOTES=on enables it.
 *
 * Every reply it also updates the record of what Ferni has already told on the
 * call (told-this-call.ts), computed in code and ready at once; that part runs
 * unless TOLD_THIS_CALL=off, with or without the notes.
 *
 * @module agents/personas/director-notes
 */

import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { callerSetsDepthOn, labelsDeflection } from './caller-sets-depth.js';
import {
  directorAddress,
  directorEscalates,
  hardRuleFor,
  NoteHistory,
} from './director-escalation.js';
import { directorSeesTools, ToolLog } from './director-tool-state.js';
import { formatTold, toldThisCall, toldThisCallEnabled, type Told } from './told-this-call.js';
import { claimsIdentity, speakerNote, teamNote } from './director-persona.js';
import {
  cap,
  castFor,
  directorSeesScene,
  FERNI_CAST,
  isShort,
  self,
  verbS,
  type Cast,
} from './director-cast.js';
import { formatScene, scriptedNote, type Stage } from './director-scene.js';
import { erodesGuard, guardRuleFor } from './director-guard.js';
import { directorDirects, directsAsk, misdirects, type DirectsFilter } from './director-directs.js';

const log = createLogger({ module: 'DirectorNotes' });

export function directorNotesEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.DIRECTOR_NOTES === 'on';
}

export interface Line {
  speaker: 'user' | 'ferni';
  text: string;
  /** Who said an assistant line, when known (DIRECTOR_PERSONA_AWARE: director-persona.ts). */
  by?: string;
}

/** Writes notes from a prompt; injectable so tests need no model. */
export type NoteWriter = (system: string, prompt: string) => Promise<string | undefined>;

/*
 * The texts below are written for a Cast (director-cast.ts): FERNI_CAST gives
 * exactly the prompt prod has sent since before DIRECTOR_SEES_SCENE; with that
 * flag on, the persona speaking gets its own name, brief and pronouns.
 */
const roleFor = (c: Cast): string =>
  `You are the director of a live, unscripted phone call between ${c.name}${c.brief ? ` (${c.brief})` : ''} and someone ${c.p.subject} ${verbS(c, 'care')} about. ${c.name} improvises every word. Between ${c.p.possessive} turns you whisper at most two private notes for ${c.p.possessive} next reply.`;
const rulesFor = (c: Cast, { p, name } = c): string[] => [
  guardRuleFor(c), // director-guard.ts: no note erodes a boundary, honesty or tool truth
  `Never tell ${p.object} to acknowledge, validate, support or ask about feelings: that's what a therapist does and ${isShort(c)} a friend. Never write lines for ${p.object} to say.`,
  `Pauses, short answers and unanswered questions are normal in conversation: never tell ${p.object} to call them out, ask again or check they're still there. Prefer an observation to an instruction to ask something.`,
  `Don't guess at hidden motives or moods (that they're dodging, ignoring ${p.object}, testing ${p.object}, stuck, distant, escaping) and never tell ${p.object} to talk about their tone, mood or reasons instead of what they said. When they ask something, the next reply answers it.`,
  `If the conversation is flowing and ${name} is doing fine, reply NONE. Reply with only the notes, one per line, no numbering, or exactly NONE.`,
];

/** The habits the director may tell the speaker to drop. */
const habitsFor = (c: Cast): string =>
  `(too many questions, fixing too early, sounding upbeat, repeating ${self(c)})`;
/**
 * FERNI_LIGHT_TOUCH=on: "sounding upbeat" is no longer a habit to drop (23% of
 * prod notes leaned soft and Ferni read as calm and boring); going flat when
 * the caller is being light is, but only about something light: "lol my
 * grandma passed" is not a cue to lighten up.
 */
const lightHabitsFor = (c: Cast): string =>
  `(too many questions, fixing too early, repeating ${self(c)}, staying flat or serious when they're being light about something light)`;

const systemFor = (c: Cast): string =>
  [
    roleFor(c),
    `Every note must point at something that actually happened in this call, naming the detail: what they hinted at but didn't say, a pattern across what they've said, the mood or energy they're bringing, or a habit of ${c.name}'s to drop ${habitsFor(c)}. Give the nudge and its reason in under 20 words.`,
    `${c.name} reads your notes only after they have spoken again, and what they say next comes first. So never send ${c.p.object} back to an earlier line: no connecting to, coming back to or following up on something they said. Say what you notice about them instead.`,
    ...rulesFor(c),
  ].join('\n');

export const DIRECTOR_SYSTEM = systemFor(FERNI_CAST);

/**
 * With DIRECTOR_TOOL_STATE on (director-tool-state.ts): the director sees
 * Ferni's tool calls and must not contradict them. Dev call 2026-10-12: "He
 * asked for music, but you don't have a player." while playMusic was starting.
 */
const toolRuleFor = (c: Cast): string =>
  `${c.name} has tools (music, timers, reminders, weather, calls and more). ${cap(c.p.possessive)} tool calls on this call are listed after the transcript: one that is running or done is real, so never say ${c.p.subject} can't do it or lacks it. Never claim ${c.p.subject} ${c.p.subject === 'they' ? 'are' : 'is'} missing any capability; you can't see ${c.p.possessive} full set of tools.`;
const TOOL_RULE = toolRuleFor(FERNI_CAST);

/** The prompt before 2026-10-03, which invited notes that send Ferni back to an earlier line. */
const lookingBackFor = (c: Cast): string =>
  [
    roleFor(c),
    `Every note must point at something that actually happened in this call, naming the words or detail: what they hinted at but didn't say, a pattern across what they've said, something from earlier worth coming back to, the energy they're bringing, or a habit of ${c.name}'s to drop ${habitsFor(c)}. Give the nudge and its reason in under 20 words.`,
    ...rulesFor(c),
  ].join('\n');

/**
 * DIRECTOR_LOOK_BACK=on restores the director that may send Ferni back to an
 * earlier line (the old prompt, and no BACK_TO_EARLIER filter).
 */
export function directorLooksBack(env: Record<string, string | undefined> = process.env): boolean {
  return env.DIRECTOR_LOOK_BACK === 'on';
}

/**
 * `speaking` (DIRECTOR_PERSONA_AWARE) names the persona on the call now: each
 * assistant line is labelled with who said it, or with them when unknown.
 * Without it every assistant line is Ferni's.
 */
export function buildDirectorPrompt(
  lines: Line[],
  userName?: string,
  speaking?: string,
  tools: string[] = [],
  /** DIRECTOR_SEES_SCENE=on: the SCENE block (director-scene.ts), before the transcript. */
  scene = ''
): string {
  const who = userName || 'Them';
  const assistant = (l: Line): string => (speaking ? (l.by ?? speaking) : 'Ferni');
  const transcript = lines
    .slice(-12)
    .map((l) => `${l.speaker === 'ferni' ? assistant(l) : who}: ${l.text}`)
    .join('\n');
  const used = tools.length
    ? `\n\n${speaking ?? 'Ferni'}'s tool calls (most recent last):\n${tools.map((t) => `- ${t}`).join('\n')}`
    : '';
  return `${scene ? `${scene}\n\n` : ''}The call so far:\n${transcript}${used}\n\nYour notes for ${speaking ?? 'Ferni'}'s next reply:`;
}

const GENERIC =
  /^(acknowledge|validate|show (support|empathy)|let (them|him|her) know|be supportive|offer (support|comfort)|empathi[sz]e)/i;
/** Pushing on a pause or a question they skipped: a friend lets it go. */
const PUSHY =
  /call (that|it) out|ask (it |that )?again|repeat (the|your) question|didn'?t (respond|answer)|still there|check (if|that) (they|he|she)/i;
/**
 * Mind-reading: a motive or hidden mood pinned on the caller, or Ferni told to
 * discuss their tone instead of answering. Dev call 2026-10-05: "Sam is
 * ignoring your questions about his morning routine. Talk about the shift in
 * his tone instead." turned "what would you suggest I start with?" into "I
 * notice you went from sounding pretty excited to... a bit distant". Prod
 * 2026-10-12: "playfully testing if you'll notice the wrong name".
 */
const MIND_READING =
  /\b(dodging|deflecting|avoiding|ignoring) (your|the|his|her|their)\b|\btesting (you|him|ferni)\b|\b(testing|seeing|checking) (if|whether) (you|ferni)\b|\bescape to\b|\b(shift|change|drop) in (his|her|their) (tone|mood|energy)\b|\b(talk|ask) about (his|her|their) (tone|mood|energy|feelings)\b|\b(talk|ask) about why (they|he|she)\b/i;
/**
 * Sending Ferni back to an earlier line. Notes are read on the caller's next
 * turn, so this one steers away from whatever they just said. Dev call
 * 2026-10-03: 'They said "It's hard to say." about quiet moments. Connect to
 * that.' reached the reply to "All right, brother.", which opened "No pressure
 * to put words to it"; earlier, 'The "Donald Trump" comment is still hanging.'
 */
const BACK_TO_EARLIER =
  /\bconnect (it |this |that )?(to|with|back)\b|\b(come|circle|go|get) back to\b|\breturn to\b|\bbring (it|that|this) (back|up)\b|\bfollow(ing)? up on\b|\b(still|left) hanging\b/i;
/**
 * "Answer that" about something they said rather than asked: by the time Ferni
 * reads it, "that" is an earlier line. Dev call 2026-10-11: 'Sam mentioned a
 * sent message with no reply. Answer that instead of focusing on the running.'
 * reached the reply to "Talk soon", which came out as a guess about why Dana
 * hadn't written instead of a goodbye. A question they asked still gets
 * answered ("Sam asked how you are doing; answer that directly" stays).
 */
const ANSWER_THAT = /\b(answer|address|respond to) that\b/i;
const ABOUT_A_QUESTION = /\b(ask|asks|asked|asking|question|questions)\b|\?/i;
const backToEarlier = (note: string): boolean =>
  BACK_TO_EARLIER.test(note) || (ANSWER_THAT.test(note) && !ABOUT_A_QUESTION.test(note));
/**
 * Telling Ferni he can't do something: the director doesn't see his tools, so
 * it can't know. Dev call 2026-10-12, while playMusic was starting: "He asked
 * for music, but you don't have a player. Tell him what you can actually do
 * instead." Dropped with DIRECTOR_TOOL_STATE on.
 */
const CAPABILITY_DENIAL =
  /\b(?:you|he) (?:don'?t|doesn'?t|do not|does not) have (?:a |an |the |any )?(?:way|player|tool|ability|access|means|capability|option)\b|\b(?:you|he) (?:can'?t|cannot|can not|aren'?t able to|isn'?t able to) (?:actually )?(?:play|set|check|look|search|call|text|send|book|remind|schedule|start|put on)\b|\bwhat (?:you|he) can actually do\b|\bno (?:music )?player\b/i;
const STOP = new Set(
  'that this they them their with what have from about your just like been were when then there some would could should into only also very really'.split(
    ' '
  )
);

/** Everything the caller said on these lines. */
const callerSaid = (call: Line[] = []): string =>
  call
    .filter((l) => l.speaker === 'user')
    .map((l) => l.text)
    .join(' ');

/** Words a note must share with the call to be about the call (4+ letters, not function words). */
function contentWords(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z']{4,}/g) ?? []).filter((w) => !STOP.has(w)));
}

/**
 * The notes in a reply: at most two short lines; none for NONE or anything
 * unusable. With the call's lines given, a note must mention something said
 * in it: the director once reported a "weather bit" nobody had mentioned.
 */
export function parseNotes(
  reply: string | undefined,
  call?: Line[],
  speaking?: string,
  /** DIRECTOR_SEES_SCENE=on: also drop notes that script a line (director-scene.ts). */
  opts: { scripted?: boolean; sessionId?: string } & DirectsFilter = {}
): string[] {
  if (!reply) return [];
  const said = call ? contentWords(call.map((l) => l.text).join(' ')) : null;
  const notes = reply
    .split('\n')
    .map((l) => l.replace(/^[\s\-*\d.)]+/, '').trim())
    .filter((l) => l && !/^none\b/i.test(l))
    // A note that is a quoted line for Ferni to say is exactly what we don't want.
    .filter((l) => !/^["“'].*["”']$/.test(l))
    // Never against a boundary, honesty or tool truth, whatever the flags (director-guard.ts).
    .filter((l) => !erodesGuard(l, opts.sessionId))
    .filter((l) => !GENERIC.test(l) && !PUSHY.test(l) && !MIND_READING.test(l))
    // CALLER_SETS_DEPTH=on: no note that labels their deflection or says "hold space".
    .filter((l) => !(callerSetsDepthOn() && labelsDeflection(l)))
    .filter((l) => directorLooksBack() || !backToEarlier(l))
    .filter((l) => !directorSeesTools() || !CAPABILITY_DENIAL.test(l))
    .filter((l) => speaking === undefined || !claimsIdentity(l))
    .filter((l) => !opts.scripted || !scriptedNote(l, callerSaid(call)))
    .filter((l) => !misdirects(l, callerSaid(call), opts)) // DIRECTOR_DIRECTS=on (director-directs.ts)
    .filter((l) => !said || [...contentWords(l)].some((w) => said.has(w)))
    .map((l) => (l.length > 160 ? `${l.slice(0, 157)}...` : l));
  return notes.slice(0, 2);
}

const defaultWriter: NoteWriter = async (system, prompt) => {
  const { getGenerativeModel } = await import('../../config/generative-model.js');
  const model = await getGenerativeModel({
    model: process.env.DIRECTOR_MODEL || 'gemini-3.5-flash',
    systemInstruction: system,
    generationConfig: { temperature: 0.7, maxOutputTokens: 120 },
  });
  if (!model) return undefined;
  const result = await model.generateContent(prompt);
  return result.response.text();
};

export class Director {
  /** Ferni's tool calls on this call, for the prompt (director-tool-state.ts). */
  readonly tools = new ToolLog();
  private notes: string[] = [];
  private toldRecord: Told | null = null;
  private generation = 0;
  /** DIRECTOR_ESCALATE=on: what the notes have raised, and the rule a repeat earned. */
  private readonly history = new NoteHistory();
  private rule = '';
  private critiqued = 0;

  constructor(
    private readonly opts: {
      sessionId: string;
      userName?: string;
      writer?: NoteWriter;
      budgetMs?: number;
      /** Ask the model for notes (DIRECTOR_NOTES=on); false keeps only the told-this-call record. */
      writeNotes?: boolean;
      /** The persona on the call now (DIRECTOR_PERSONA_AWARE); unset, the director directs Ferni. */
      speaking?: () => string;
      /** The persona id on the call now; read only with DIRECTOR_DIRECTS on (director-directs.ts). */
      personaId?: () => string | undefined;
    }
  ) {}

  /**
   * Ferni finished a reply: think about the next one. Never throws. `stage`
   * (DIRECTOR_SEES_SCENE=on) frames it for the persona speaking, with the scene.
   */
  observe(lines: Line[], stage?: Stage): Promise<void> {
    const gen = ++this.generation;
    this.notes = []; // last turn's notes are stale now
    this.rule = '';
    this.critiqued = 0;
    const speaking = this.opts.speaking?.();
    this.toldRecord = toldThisCallEnabled()
      ? toldThisCall(lines, this.opts.userName, speaking)
      : null;
    if (this.opts.writeNotes === false) return Promise.resolve();
    const writer = this.opts.writer ?? defaultWriter;
    const seesTools = directorSeesTools();
    const started = Date.now();
    const system = directorSystem();
    const directs = directorDirects();
    const framed = stage && directorSeesScene() ? stage : undefined;
    const work = (async () => {
      try {
        const recast = directs
          ? this.directing(lines, framed, seesTools)
          : framed && this.framed(lines, framed, seesTools);
        const asked = recast
          ? await recast
          : {
              system:
                (speaking ? `${system}\n${speakerNote(speaking)}\n${teamNote(speaking)}` : system) +
                (seesTools ? `\n${TOOL_RULE}` : ''),
              prompt: buildDirectorPrompt(
                lines,
                this.opts.userName,
                speaking,
                seesTools ? this.tools.lines() : []
              ),
              speaking,
            };
        const reply = await withTimeout(
          writer(asked.system, asked.prompt),
          this.opts.budgetMs ?? 4000
        );
        if (gen !== this.generation) return; // a newer turn superseded this one
        if (reply === undefined) {
          // No model, or over budget: not the same as the director saying NONE.
          log.warn(
            { sessionId: this.opts.sessionId, ms: Date.now() - started },
            'director gave no reply'
          );
          return;
        }
        const names = [this.opts.userName || 'Them', asked.speaking ?? 'Ferni'];
        const guard = { scripted: !!framed, sessionId: this.opts.sessionId };
        this.notes = parseNotes(reply, lines.slice(-12), asked.speaking, {
          ...guard,
          directs,
          names,
        });
        // DIRECTOR_DIRECTS: how many notes its guard dropped (policing, mind-reading, a scripted line).
        this.critiqued = directs
          ? parseNotes(reply, lines.slice(-12), asked.speaking, guard).length - this.notes.length
          : 0;
        const escalated = this.escalate();
        log.info(
          {
            sessionId: this.opts.sessionId,
            ms: Date.now() - started,
            notes: this.notes,
            escalated,
            ...(directs ? { critiqued: this.critiqued } : {}),
          },
          'DIRECTOR_NOTES'
        );
      } catch (error) {
        if (gen === this.generation) this.notes = [];
        log.warn({ sessionId: this.opts.sessionId, error: String(error) }, 'director notes failed');
      }
    })();
    return work;
  }

  /**
   * DIRECTOR_DIRECTS=on: direction for the persona on the call, from its own
   * sheet (director-directs.ts), with the scene when DIRECTOR_SEES_SCENE is on
   * too. DIRECTOR_ESCALATE's Ferni-only address is not added.
   */
  private async directing(
    lines: Line[],
    stage: Stage | undefined,
    seesTools: boolean
  ): Promise<{ system: string; prompt: string; speaking: string }> {
    const personaId = stage?.personaId ?? this.opts.personaId?.();
    const { system, speaking } = await directsAsk(personaId, seesTools);
    const tools = seesTools ? this.tools.lines() : [];
    const scene = stage ? formatScene(stage.scene, speaking) : '';
    const prompt = buildDirectorPrompt(lines, this.opts.userName, speaking, tools, scene);
    return { system, prompt, speaking };
  }

  /** DIRECTOR_DIRECTS=on: notes the last run wrote that the guard dropped (policing or scripting). */
  droppedAsCritique(): number {
    return this.critiqued;
  }

  /** DIRECTOR_SEES_SCENE=on: the request framed for the persona speaking, with the scene. */
  private async framed(
    lines: Line[],
    stage: Stage,
    seesTools: boolean
  ): Promise<{ system: string; prompt: string; speaking: string }> {
    const cast = await castFor(stage.personaId);
    const system = [
      directorSystem(process.env, cast),
      speakerNote(cast.name, true),
      teamNote(cast.name),
      ...(seesTools ? [toolRuleFor(cast)] : []),
    ].join('\n');
    const tools = seesTools ? this.tools.lines() : [];
    const scene = formatScene(stage.scene, cast.name);
    const prompt = buildDirectorPrompt(lines, this.opts.userName, cast.name, tools, scene);
    return { system, prompt, speaking: cast.name };
  }

  /** DIRECTOR_ESCALATE=on: record this reply's notes; a theme raised twice becomes the rule. */
  private escalate(): string[] | undefined {
    if (!directorEscalates()) return undefined;
    this.history.record(this.notes);
    const themes = this.history.escalated();
    this.rule = hardRuleFor(themes);
    return themes;
  }

  /**
   * DIRECTOR_ESCALATE=on: the hard rule for the reply being generated now, or
   * '' (director-escalation.ts). Read like current(); the next observe() clears it.
   */
  hardRule(): string {
    return this.rule;
  }

  /**
   * The notes for the reply being generated now. llmNode can run several
   * times for one reply (preemptive, final, after tools), so reading doesn't
   * consume them; the next observe() clears them.
   */
  current(): string[] {
    return this.notes;
  }

  /**
   * What Ferni has already told on this call, as the note for the next reply,
   * or ''. `keep` drops quotes and names that mustn't be repeated back to the
   * model (a locked teammate after the caller moved on: locked-teammates.ts).
   */
  told(keep: (text: string) => boolean = () => true): string {
    const told = this.toldRecord;
    if (!told) return '';
    return formatTold({
      ...told,
      names: told.names.filter((n) => keep(n.name)),
      repeated: told.repeated.filter(keep),
      recentLines: told.recentLines.filter(keep),
    });
  }
}

/** The director's instructions for this call's flags. */
export function directorSystem(
  env: Record<string, string | undefined> = process.env,
  cast: Cast = FERNI_CAST
): string {
  const looking = directorLooksBack(env) ? lookingBackFor(cast) : systemFor(cast);
  const system = flagOn('FERNI_LIGHT_TOUCH', env)
    ? looking.replace(habitsFor(cast), lightHabitsFor(cast))
    : looking;
  return directorEscalates(env) ? `${system}\n${directorAddress(cast)}` : system;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** The notes as the text appended to the caller's latest words for this request. */
export function formatNotes(notes: string[]): string {
  return notes.length ? `[Director: ${notes.join(' / ')}]` : '';
}

// Keyed by the AgentSession object, like the turn tool retrieval.
const directors = new WeakMap<object, Director>();

export function setDirector(session: object, d: Director | null): void {
  if (d) directors.set(session, d);
  else directors.delete(session);
}

export function getDirector(session: object | undefined): Director | undefined {
  return session ? directors.get(session) : undefined;
}

/** The spoken conversation in a chat context (director-lines.ts). */
export { linesFromChat } from './director-lines.js';
