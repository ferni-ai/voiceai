/**
 * A briefed handoff (BRIEFED_HANDOFF=on): the teammate already knows why the caller came.
 *
 * Before, the teammate opened on canned banter ("Hey there! Peter here."); asked "Hi
 * Peter", it said "Oh, right, I am Peter" (dev eval bh-01, 2026-10-11). The swap drops
 * Ferni's recall notes (system messages). While the goodbye plays, two fast-model calls
 * write the brief (≤150 tokens, into the teammate's prompt) and the teammate's first
 * line (the director, in their character). Late or failed: a brief from the turns, and
 * the old banter line.
 *
 * @module agents/multi-agent/handoff-brief
 */

import { getGenerativeModel } from '../../config/generative-model.js';
import { contentWords } from '../../memory/recall/session-recall.js';
import { getPersonaDisplayName } from '../../personas/voice-registry.js';
import { getArrivingBanter, getHandoffBanter } from '../../services/team-engagement/banter.js';
import { characterOf } from '../../speech/direction/cue-say.js';
import { directLine, type Actor } from '../../speech/direction/director.js';
import { handoffAskFirstEnabled } from '../../tools/handoff/handoff-consent.js';
import { teammateHeardAs } from '../../tools/handoff/teammate-names.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'HandoffBrief' });

export function briefedHandoffs(env: Record<string, string | undefined> = process.env): boolean {
  return env.BRIEFED_HANDOFF === 'on';
}

const firstName = (personaId: string): string => getPersonaDisplayName(personaId).split(/\s+/)[0];

/**
 * What the outgoing persona says as it hands over: the pair's banter, or a
 * plain line. Off, the old switchboard line. With HANDOFF_ASK_FIRST=on the
 * caller asked for this teammate (tools/handoff/handoff-consent.ts), so it is
 * a yes.
 */
export function departureLine(from: string, to: string, env = process.env): string {
  const banter = getHandoffBanter(from, to);
  if (banter) return banter;
  return handoffAskFirstEnabled(env)
    ? `Sure, here's ${firstName(to)}.`
    : `Let me hand you off to ${getPersonaDisplayName(to)}.`;
}

/**
 * What the arriving teammate says first: banter, or a plain line. With
 * HANDOFF_ASK_FIRST=on they say who they are instead of "What's up?", which
 * made the caller start over.
 */
export function arrivalLine(to: string, from: string, env = process.env): string {
  const banter = getArrivingBanter(to, from);
  if (banter) return banter;
  return handoffAskFirstEnabled(env) ? `Hey, it's ${firstName(to)}.` : "Hey! What's up?";
}

export interface BriefTurn {
  speaker: 'caller' | 'persona';
  text: string;
}

export interface HandoffBrief {
  why: string;
  discussed?: string;
  open?: string;
  mood?: string;
  facts: string[];
}

export interface BriefInput {
  fromName: string;
  toName: string;
  toPersonaId: string;
  turns: BriefTurn[];
  /** The handoff tool's reason; generic ones ("User requested via UI") are ignored. */
  reason?: string;
  emotion?: string;
  /** Lines from the outgoing persona's recall notes ("Sam: sister = Ana"). */
  remembered: string[];
  userName?: string;
}

export interface Briefing {
  /** Added to the teammate's prompt. */
  brief: string;
  /** The teammate's first line, or undefined to keep the old one. */
  firstLine?: string;
}

/** ~150 tokens at the repo's chars/4. */
export const BRIEF_MAX_CHARS = 600;
const FIELD_MAX = 160;
// The director's fast model: one client, already warm by the time a handoff happens
const BRIEF_MODEL = (): string => process.env.DIRECTED_SPEECH_MODEL || 'gemini-3.5-flash-lite';
export const BRIEFING_BUDGET_MS = 2500;
const GENERIC_REASON = /^(user requested via ui|llm requested handoff)$/i;

const clip = (s: string | undefined, n = FIELD_MAX): string => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

interface HistoryItem {
  type?: string;
  role?: string;
  textContent?: string;
  content?: unknown;
}

const textOf = (i: HistoryItem): string =>
  i.textContent ??
  (Array.isArray(i.content) ? i.content.filter((c) => typeof c === 'string').join(' ') : '');

/**
 * The talk so far and what the outgoing persona had recalled, from its session's
 * history (or chat context): the last `maxTurns` caller and persona lines, and the
 * "- who: what = value" lines of its recall notes ([WHAT YOU REMEMBER ABOUT …]).
 */
export function readConversation(
  session: unknown,
  maxTurns = 10
): { turns: BriefTurn[]; remembered: string[] } {
  const s = session as {
    history?: { items?: HistoryItem[] };
    chatCtx?: { items?: HistoryItem[] };
  } | null;
  const items = s?.history?.items ?? s?.chatCtx?.items ?? [];
  const turns: BriefTurn[] = [];
  const remembered: string[] = [];
  for (const item of items) {
    if (item.type !== 'message') continue;
    const text = textOf(item)
      .replace(/<[^>]+>/g, '')
      .trim();
    if (!text) continue;
    if (item.role === 'user' || item.role === 'assistant') {
      turns.push({ speaker: item.role === 'user' ? 'caller' : 'persona', text: clip(text, 300) });
    } else if (item.role === 'system' && text.startsWith('[WHAT YOU REMEMBER')) {
      for (const line of text.split('\n')) {
        if (line.startsWith('- ')) remembered.push(clip(line.slice(2), 120));
      }
    }
  }
  return { turns: turns.slice(-maxTurns), remembered: [...new Set(remembered)].slice(-12) };
}

/*
 * Grounding. Prod 2026-10-13: the caller said only "can I talk to Jordan?", Ferni's
 * handoff tool gave the reason "retirement planning", and Jordan opened with the
 * direction's own example, "Ferni told me you're weighing the offer". The call's
 * summary then kept "the offer" as the caller's, and later calls asked about it.
 * So the brief holds only what the caller said on this call, marked as theirs;
 * nothing grounded means the teammate greets without a topic.
 */

/** The brief's reason when the caller gave none: they asked for the teammate, that's all. */
export const NO_TOPIC = 'They asked for you by name and have not said what about yet.';

/** Words that ask for a teammate, or are filler, rather than say what the call is about. */
const ASKING = new Set(
  'talk speak chat switch transfer hand bring put connect over hey please want wanted need wanna gonna let help hello thank thanks sure yes yep okay right now quick minute someone somebody doing well good great hope question thing stuff side'.split(
    ' '
  )
);

/** What a line is about once the teammates' names and the asking are taken out. */
export function topicWords(text: string): string[] {
  return [...contentWords(text)].filter((w) => !ASKING.has(w) && teammateHeardAs(w) === null);
}

const stem = (w: string): string => w.slice(0, 5);

/**
 * True when `text` is the caller's own words or a close paraphrase: at least two
 * thirds of its topic words (by their first five letters) are in what they said.
 */
export function groundedIn(text: string, callerLines: string[]): boolean {
  const said = new Set(topicWords(callerLines.join(' ')).map(stem));
  const words = topicWords(text).map(stem);
  if (words.length === 0) return false;
  return words.filter((w) => said.has(w)).length >= Math.ceil((words.length * 2) / 3);
}

const callerLinesOf = (input: BriefInput): string[] =>
  input.turns.filter((t) => t.speaker === 'caller').map((t) => t.text);

const quoted = (line: string): string => `"${clip(line, FIELD_MAX - 20)}"`;

/** The handoff tool's reason, only when it is what the caller actually said. */
export function groundedReason(
  reason: string | undefined,
  callerLines: string[]
): string | undefined {
  if (!reason || GENERIC_REASON.test(reason.trim())) return undefined;
  return groundedIn(reason, callerLines) ? reason : undefined;
}

/** The input without a reason the caller never gave. */
export function groundedInput(input: BriefInput): BriefInput {
  return { ...input, reason: groundedReason(input.reason, callerLinesOf(input)) };
}

/**
 * A brief from the turns alone: the reason if the caller said it, else their own last
 * words when those say what it's about, else NO_TOPIC. Earlier lines are quoted.
 */
export function plainBrief(input: BriefInput): HandoffBrief {
  const callerLines = callerLinesOf(input);
  const last = callerLines.at(-1);
  const lastHasTopic = last !== undefined && topicWords(last).length > 0;
  const earlier = callerLines.slice(0, -1).filter((l) => topicWords(l).length > 0);
  const reason = groundedReason(input.reason, callerLines);
  return {
    why: clip(reason || (lastHasTopic ? `In their words: ${quoted(last)}` : NO_TOPIC)),
    discussed: earlier.length > 0 ? clip(earlier.slice(-2).map(quoted).join(' ')) : undefined,
    mood: input.emotion && input.emotion !== 'neutral' ? input.emotion : undefined,
    facts: input.remembered.slice(-3),
  };
}

/**
 * The model's brief with every field the caller didn't say dropped: `why` falls back
 * to the plain one, facts must be copied from the recall notes, a mood is a few words.
 */
export function groundBrief(
  brief: HandoffBrief,
  input: BriefInput,
  plain: HandoffBrief = plainBrief(input)
): HandoffBrief {
  const callerLines = callerLinesOf(input);
  const keep = (field: string | undefined): string | undefined =>
    field && groundedIn(field, callerLines) ? field : undefined;
  const mood = brief.mood && brief.mood.split(/\s+/).length <= 3 ? brief.mood : keep(brief.mood);
  return {
    why: plain.why === NO_TOPIC ? NO_TOPIC : (keep(brief.why) ?? plain.why),
    discussed: keep(brief.discussed),
    open: keep(brief.open),
    mood,
    facts: brief.facts.filter((f) => input.remembered.includes(f)),
  };
}

/** A claim about what the caller said ("Ferni told me you're…", "you're weighing…"). */
const CLAIMS = [
  /\b(?:told me|tells me|said|says|mentioned|filled me in|heard)\b(.*)$/i,
  /\byou(?:'re| are)\s+(\w+ing\b.*)$/i,
];

/** True when `line` claims something about the caller that they never said. */
export function ungroundedClaim(line: string, callerLines: string[]): boolean {
  return CLAIMS.some((re) => {
    const clause = line.match(re)?.[1]?.split(/[.?!]/)[0] ?? '';
    return topicWords(clause).length > 0 && !groundedIn(clause, callerLines);
  });
}

const WRITER_SYSTEM =
  'You brief a teammate taking over a live voice call. You get only the lines the caller ' +
  'said on this call. Return JSON with: ' +
  '"why" (why the caller wants this teammate, in their own words), ' +
  '"discussed" (what the caller already told, numbers and names kept, in their words), ' +
  '"open" (the question the caller asked that is still unanswered), "mood" (how they seem, ' +
  'at most three words), ' +
  '"facts" (at most 3 remembered facts that matter here, copied exactly from the list given, else []). ' +
  'Each field one short sentence or empty. Use only what the caller said: never add a topic, ' +
  'a plan or a detail they did not say. If they only asked for the teammate, "why" is "".';

function writerPrompt(input: BriefInput): string {
  const said = callerLinesOf(input).map(quoted);
  return [
    `${input.fromName} is handing this caller to ${input.toName}.`,
    input.reason ? `The caller's reason, as ${input.fromName} put it: ${input.reason}` : '',
    `What ${input.userName || 'the caller'} said on this call, oldest first:\n${
      said.length ? `- ${said.join('\n- ')}` : '(nothing yet)'
    }`,
    input.remembered.length
      ? `Remembered from past calls:\n- ${input.remembered.join('\n- ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Writes the brief's JSON; injectable so tests need no model. */
export type BriefWriter = (system: string, prompt: string) => Promise<string | undefined>;

const defaultWriter: BriefWriter = async (system, prompt) => {
  const model = await getGenerativeModel({
    model: BRIEF_MODEL(),
    systemInstruction: system,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 400,
      responseMimeType: 'application/json',
    },
  });
  if (!model) return undefined;
  return (await model.generateContent(prompt)).response.text();
};

/** The model's brief, or null when its JSON is unusable. */
export function parseBrief(raw: string | undefined): HandoffBrief | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')) as Record<string, unknown>;
    const str = (k: string): string | undefined =>
      (typeof j[k] === 'string' ? clip(j[k] as string) : undefined) || undefined;
    const why = str('why');
    if (!why) return null;
    const facts = Array.isArray(j.facts)
      ? j.facts
          .filter((f): f is string => typeof f === 'string' && f.trim() !== '')
          .map((f) => clip(f, 120))
      : [];
    return {
      why,
      discussed: str('discussed'),
      open: str('open'),
      mood: str('mood'),
      facts: facts.slice(0, 3),
    };
  } catch {
    return null;
  }
}

/** The brief as it goes in the teammate's prompt, at most BRIEF_MAX_CHARS of content. */
export function formatBrief(brief: HandoffBrief, fromName: string): string {
  const lines = [
    `Why they came to you: ${brief.why}`,
    brief.discussed && `What they already told ${fromName}: ${brief.discussed}`,
    brief.open && `Still open: ${brief.open}`,
    brief.mood && `How they seem: ${brief.mood}`,
    brief.facts.length > 0 && `From past calls (not said today): ${brief.facts.join('; ')}`,
  ].filter((l): l is string => Boolean(l));
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length > BRIEF_MAX_CHARS) break; // whole lines only
    kept.push(line);
    used += line.length;
  }
  return [
    `[HANDOFF BRIEF from ${fromName}, just now: only what the caller said]`,
    ...kept,
    `You were filled in: pick it up the way a friend who was briefed would. Never ask them to explain again anything above or anything they already said; ask only about what is still open. Anything not above, they have not told you: never say ${fromName} told you something that isn't here. Stay yourself.`,
  ].join('\n');
}

/**
 * Director's cue for the teammate's first line. It used to carry a copyable example
 * ("{from} said you're weighing the offer"), and in prod the teammate said exactly that
 * to a caller who had only asked for them by name.
 */
export const ARRIVAL_DIRECTION =
  "You've just been brought onto this call by {from}. Open like a friend who was filled in: a quick hello, then, only if the facts say what they want, name it in a few of their own words. If they only asked for you by name, just say hi warmly and ask what they'd like to get into. Never say {from} told you anything that is not in the facts. At most one question, never one they already answered; don't introduce your job or make them repeat themselves. Two short sentences at most.";

export async function prepareBriefing(
  raw: BriefInput,
  fallbackLine: string,
  opts: { writer?: BriefWriter; actor?: Actor; budgetMs?: number } = {}
): Promise<Briefing> {
  const input = groundedInput(raw);
  const callerLines = callerLinesOf(input);
  const started = Date.now();
  const budgetMs = opts.budgetMs ?? BRIEFING_BUDGET_MS;
  const plain = plainBrief(input);
  const writer = opts.writer ?? defaultWriter;
  const late = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), budgetMs).unref?.();
  });
  const written = writer(WRITER_SYSTEM, writerPrompt(input))
    .then(parseBrief)
    .then((b) => (b ? groundBrief(b, input, plain) : null))
    .catch((error: unknown) => {
      log.warn({ error: String(error) }, 'Handoff brief writer failed, using the plain brief');
      return null;
    });
  const character = characterOf(input.toPersonaId);
  // Only this call's caller lines: a fact from past calls is not why they came today
  const facts: Record<string, string> = { 'why they came': plain.why };
  if (plain.discussed && plain.why !== NO_TOPIC) {
    facts[`what they told ${input.fromName}`] = plain.discussed;
  }
  const line = directLine(
    {
      moment: 'handoff_arrival',
      direction: ARRIVAL_DIRECTION.replaceAll('{from}', input.fromName),
      facts,
      fallback: fallbackLine,
      urgency: 'soon',
      maxChars: 200,
    },
    {
      character: character.name,
      brief: character.brief,
      // The persona's own lines were the outgoing persona's: only the caller's are shown.
      recentTurns: callerLines.slice(-4).map((text) => ({ speaker: 'user' as const, text })),
      userName: input.userName,
    },
    { actor: opts.actor, budgetMs }
  );
  const [brief, spoken] = await Promise.all([Promise.race([written, late]), line]);
  const invented = spoken.source === 'actor' && ungroundedClaim(spoken.text, callerLines);
  log.info(
    {
      to: input.toPersonaId,
      written: Boolean(brief),
      line: spoken.source,
      invented,
      ms: Date.now() - started,
    },
    'Handoff brief ready'
  );
  return {
    brief: formatBrief(brief ?? plain, input.fromName),
    firstLine: spoken.source === 'actor' && !invented ? spoken.text : undefined,
  };
}

/** The talk the outgoing persona's session holds, and what the handoff request knows. */
export async function briefingFor(
  from: { personaId: string; session: unknown },
  request: { targetPersonaId: string; reason: string; userName?: string; userEmotion?: string }
): Promise<Briefing | null> {
  try {
    const { turns, remembered } = readConversation(from.session);
    const to = request.targetPersonaId;
    return await prepareBriefing(
      {
        fromName: getPersonaDisplayName(from.personaId),
        toName: getPersonaDisplayName(to),
        toPersonaId: to,
        turns,
        remembered,
        reason: request.reason,
        emotion: request.userEmotion,
        userName: request.userName,
      },
      arrivalLine(to, from.personaId)
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Handoff brief failed: the teammate starts unbriefed');
    return null;
  }
}

/** The summary the teammate's prompt gets: the brief first, then whatever else was known. */
export function withBrief(
  briefing: Briefing | null | undefined,
  summary?: string
): string | undefined {
  return [briefing?.brief, summary].filter(Boolean).join('\n\n') || undefined;
}
