/**
 * A briefed handoff (BRIEFED_HANDOFF=on): the teammate a caller is handed to already
 * knows why they came, so the caller never has to say it twice.
 *
 * Before this, the teammate opened on canned banter ("Hey there! Peter here.") and,
 * asked "Hi Peter", answered "Oh, right, I am Peter" (dev voice eval bh-01, 2026-10-11).
 * The tool's `reason` never reached it ("LLM requested handoff"), a tap's reason was
 * "User requested via UI", and the recall notes Ferni had during the talk are system
 * messages, which the swap drops (persona-swap.ts conversationSoFar).
 *
 * At handoff time, while the outgoing persona says goodbye, two fast-model calls run:
 * the brief (why they came, what they said, what's open, how they seem, what Ferni
 * promised, up to 3 remembered facts; ≤150 tokens, added to the teammate's prompt) and
 * the teammate's first line, written by the director in the teammate's own character
 * (cue-say.ts). Either one late or failed: a brief built from the turns themselves, and
 * the old banter line.
 *
 * @module agents/multi-agent/handoff-brief
 */

import { getGenerativeModel } from '../../config/generative-model.js';
import { getPersonaDisplayName } from '../../personas/voice-registry.js';
import { getArrivingBanter } from '../../services/team-engagement/banter.js';
import { characterOf } from '../../speech/direction/cue-say.js';
import { directLine, type Actor } from '../../speech/direction/director.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'HandoffBrief' });

export function briefedHandoffs(env: Record<string, string | undefined> = process.env): boolean {
  return env.BRIEFED_HANDOFF === 'on';
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
  promised?: string;
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

/** A brief from the turns alone: the reason, and the caller's own last words. */
export function plainBrief(input: BriefInput): HandoffBrief {
  const callerLines = input.turns.filter((t) => t.speaker === 'caller').map((t) => t.text);
  const reason = input.reason && !GENERIC_REASON.test(input.reason.trim()) ? input.reason : '';
  return {
    why: clip(reason || callerLines.at(-1) || `to talk with ${input.toName}`),
    discussed: callerLines.length > 1 ? clip(callerLines.slice(-3, -1).join(' ')) : undefined,
    mood: input.emotion && input.emotion !== 'neutral' ? input.emotion : undefined,
    facts: input.remembered.slice(-3),
  };
}

const WRITER_SYSTEM =
  'You brief a teammate taking over a live voice call. Read the conversation and return JSON with: ' +
  '"why" (why the caller wants this teammate, specific, with their details), ' +
  '"discussed" (what the caller already told, numbers and names kept), ' +
  '"open" (the question still unanswered), "mood" (how they seem, a few words), ' +
  '"promised" (what the outgoing persona told them this teammate would do, if anything), ' +
  '"facts" (at most 3 remembered facts that matter here, copied from the list given, else []). ' +
  'Each field one short sentence or empty. Never invent anything not in the input.';

function writerPrompt(input: BriefInput): string {
  const turns = input.turns
    .map(
      (t) => `${t.speaker === 'caller' ? input.userName || 'Caller' : input.fromName}: ${t.text}`
    )
    .join('\n');
  return [
    `${input.fromName} is handing this caller to ${input.toName}.`,
    input.reason && !GENERIC_REASON.test(input.reason)
      ? `${input.fromName}'s reason: ${input.reason}`
      : '',
    `Conversation:\n${turns || '(nothing yet)'}`,
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
      promised: str('promised'),
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
    brief.promised && `${fromName} told them: ${brief.promised}`,
    brief.facts.length > 0 && `Worth remembering: ${brief.facts.join('; ')}`,
  ].filter((l): l is string => Boolean(l));
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length > BRIEF_MAX_CHARS) break; // whole lines only
    kept.push(line);
    used += line.length;
  }
  return [
    `[HANDOFF BRIEF from ${fromName}, just now]`,
    ...kept,
    `You were filled in: pick it up the way a friend who was briefed would. Never ask them to explain again anything above or anything they already said; ask only about what is still open. Stay yourself.`,
  ].join('\n');
}

/** Director's cue for the teammate's first line. */
export const ARRIVAL_DIRECTION =
  "You've just been brought onto this call by {from}, who filled you in. Open like a friend who was briefed: a quick hello, then show you already know why they came by naming the specific thing in a few words (\"{from} said you're weighing the offer\"), then at most one question that moves it forward and that they have not already answered. Don't ask what's up or how you can help, don't make them repeat themselves, don't introduce your job. Two short sentences at most.";

export async function prepareBriefing(
  input: BriefInput,
  fallbackLine: string,
  opts: { writer?: BriefWriter; actor?: Actor; budgetMs?: number } = {}
): Promise<Briefing> {
  const started = Date.now();
  const budgetMs = opts.budgetMs ?? BRIEFING_BUDGET_MS;
  const plain = plainBrief(input);
  const writer = opts.writer ?? defaultWriter;
  const late = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), budgetMs).unref?.();
  });
  const written = writer(WRITER_SYSTEM, writerPrompt(input))
    .then(parseBrief)
    .catch((error: unknown) => {
      log.warn({ error: String(error) }, 'Handoff brief writer failed, using the plain brief');
      return null;
    });
  const character = characterOf(input.toPersonaId);
  const facts: Record<string, string> = { 'why they came': plain.why };
  if (plain.discussed) facts[`what they told ${input.fromName}`] = plain.discussed;
  if (plain.facts[0]) facts['something you know about them'] = plain.facts[0];
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
      recentTurns: input.turns
        .filter((t) => t.speaker === 'caller')
        .slice(-4)
        .map((t) => ({ speaker: 'user' as const, text: t.text })),
      userName: input.userName,
    },
    { actor: opts.actor, budgetMs }
  );
  const [brief, spoken] = await Promise.all([Promise.race([written, late]), line]);
  log.info(
    {
      to: input.toPersonaId,
      written: Boolean(brief),
      line: spoken.source,
      ms: Date.now() - started,
    },
    'Handoff brief ready'
  );
  return {
    brief: formatBrief(brief ?? plain, input.fromName),
    firstLine: spoken.source === 'actor' ? spoken.text : undefined,
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
      getArrivingBanter(to, from.personaId) ?? "Hey! What's up?"
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
