/**
 * Deliberation: a slower, deeper pass over the call, whose result surfaces a
 * turn or two later, the way a friend says "I've been thinking about what you
 * said about your dad".
 *
 * Every live reply is a first thought: the judge's "thought" score sat at
 * 2.4-2.9 on dev and prod, below a good friend's 3 (judge.mjs, 2026-10-10).
 * After a weighty caller turn, the main model thinks it over privately and
 * keeps at most one insight, better question, connection or reframe; the next
 * suitable request carries it as an optional note (≤80 tokens), at most once
 * every few turns, expiring unused after two. A reply never waits for it
 * (noteFor is synchronous). Never in a crisis or while support comes first
 * after hard news. DELIBERATION=on enables it (off by default).
 *
 * @module agents/personas/deliberation
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { Line } from './director-notes.js';
import { hardNews } from './turn-candor.js';
import { callerVenting } from './turn-extras.js';
import { callerMove } from './turn-shape.js';
import type { Understanding } from './turn-understanding.js';

const log = createLogger({ module: 'Deliberation' });

type Env = Record<string, string | undefined>;

export function deliberationEnabled(env: Env = process.env): boolean {
  return env.DELIBERATION === 'on';
}

export type ThoughtKind = 'insight' | 'question' | 'connection' | 'reframe';

export interface Thought {
  kind: ThoughtKind;
  /** The thought itself, in Ferni's private words. */
  note: string;
  confidence: number;
  /** Why now: asked for because it sharpens the thought; not sent on. */
  whyNow: string;
  /** When bringing it up would be wrong, e.g. they are mid-vent or have moved on. */
  doNotUseIf: string;
}

/** Turns between notes (a friend's thought, not a feature); turns a note lives; turns held after a crisis. */
export const SPACING_TURNS = 3;
export const EXPIRY_TURNS = 2;
const CRISIS_HOLD_TURNS = 3;
/** Deliberations per call, a cost ceiling. */
const MAX_RUNS = 10;
const MIN_CONFIDENCE = 0.6;
/** The note as injected, ≤80 tokens at ~4 characters a token. */
export const MAX_NOTE_TOKENS = 80;
const MAX_THOUGHT_CHARS = 150;
const MAX_CONDITION_CHARS = 60;

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export const DELIBERATION_SYSTEM = `You are Ferni's private thoughts during a live phone call with someone he cares about. Ferni (warm, dry, curious; grew up in Wyoming, lived in Japan, a life coach who talks like a friend) answers in real time. You have a little longer. Think it over carefully and privately, then keep AT MOST ONE thing he might bring up in the next turn or two, and only if it is worth more than what he would say anyway:
- insight: something true about their situation that they have not put into words
- question: a better question than the obvious one, the one that gets at what matters to them
- connection: two things they said (on this call, or in what Ferni remembers) that bear on each other
- reframe: a truer or kinder way to see what they described
Ground it in what they actually said and name the detail. Never invent facts, history or people. No diagnoses, clinical labels or therapy-speak, no advice they did not ask for dressed up as insight, no flattery: honest the way a good friend is.
Return JSON only, either {"kind":"none"} or {"kind":"insight"|"question"|"connection"|"reframe","note":"the thought, under 22 words","confidence":0.0-1.0,"whyNow":"under 12 words","doNotUseIf":"when bringing it up would be wrong, under 10 words"}`;

const KINDS = new Set<ThoughtKind>(['insight', 'question', 'connection', 'reframe']);
/** A label is not a friend's thought, and a wrong one does harm. */
const DIAGNOSIS =
  /\b(depress(?:ed|ion)|anxiety disorder|ptsd|trauma(?:tic|tized)?|adhd|bipolar|ocd|narcissis(?:t|tic|m)|codependen\w*|attachment style|gaslight\w*|disorder|diagnos\w*|therap(?:y|ist)|burn(?:ed )?out|toxic|enabling)\b/i;

/** The model's JSON as a usable thought, or null (none, malformed, unsure, a label, too long). */
export function parseThought(reply: string): Thought | null {
  const json = reply.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const p = JSON.parse(json) as Record<string, unknown>;
    const note = typeof p.note === 'string' ? p.note.trim() : '';
    const confidence = typeof p.confidence === 'number' ? p.confidence : 0;
    if (!KINDS.has(p.kind as ThoughtKind) || !note || note.length > MAX_THOUGHT_CHARS) return null;
    if (confidence < MIN_CONFIDENCE || DIAGNOSIS.test(note)) return null;
    return {
      kind: p.kind as ThoughtKind,
      note,
      confidence,
      whyNow: typeof p.whyNow === 'string' ? p.whyNow.trim() : '',
      doNotUseIf: typeof p.doNotUseIf === 'string' ? p.doNotUseIf.trim() : '',
    };
  } catch {
    return null;
  }
}

/** The note for the request: optional, in his own words, never "I was thinking in the background". */
export function formatThought(t: Thought): string {
  const line = (skip: string): string =>
    `[On your mind, if it fits: ${t.note}${skip} Say it your own way, as a friend; never mention having thought it over in the background.]`;
  const condition = t.doNotUseIf.replace(/[.\s]+$/, '').slice(0, MAX_CONDITION_CHARS);
  const full = condition ? line(` Not if ${condition}.`) : line('');
  return estimateTokens(full) <= MAX_NOTE_TOKENS ? full : line('');
}

/** Worth thinking over: a real share or request, not small talk, a look-up, a tool job or hard news. */
const STAKES =
  /\b(should i|decid(?:e|ing)|decision|not sure (?:if|whether)|torn|can'?t (?:decide|stop thinking)|thinking (?:about|of)|keep thinking|worried|scared|afraid|regret|miss(?:ed)? (?:him|her|them)|my (?:dad|mom|mother|father|sister|brother|wife|husband|partner|kids?|son|daughter|boss|friend|grandma|grandpa))\b/i;

export function carriesWeight(said: string, u: Understanding | null): boolean {
  const t = said.trim();
  if (!t || hardNews(t) || u?.mood === 'bad_news' || u?.needsTool) return false;
  const move = u?.move ?? callerMove(t);
  if (move !== 'share' && move !== 'request') return false;
  const words = t.split(/\s+/).length;
  const felt = u ? !['neutral', 'funny'].includes(u.mood) : callerVenting(t);
  return words >= 18 || (words >= 8 && (felt || STAKES.test(t)));
}

/** Sends the prompt to a model; the raw text and token counts. Injectable so tests need no model. */
export type ThinkFn = (
  system: string,
  prompt: string,
  signal: AbortSignal
) => Promise<{ text: string; usage?: Usage }>;

export interface Usage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
}

export function buildDeliberationPrompt(lines: Line[], memory: string, userName?: string): string {
  const who = userName || 'Them';
  const call = lines
    .slice(-16)
    .map((l) => `${l.speaker === 'ferni' ? 'Ferni' : who}: ${l.text}`)
    .join('\n');
  const known = memory.trim()
    ? `What Ferni remembers that may bear on it:\n${memory.trim().slice(0, 1200)}\n\n`
    : '';
  return `${known}The call so far (most recent last):\n${call}\n\nYour one thought, or none:`;
}

/** The caller's last turn: their lines just before Ferni's latest reply. */
export function lastCallerTurn(lines: Line[]): string {
  let i = lines.length - 1;
  while (i >= 0 && lines[i].speaker === 'ferni') i--;
  const said: string[] = [];
  for (; i >= 0 && lines[i].speaker === 'user'; i--) said.unshift(lines[i].text);
  return said.join(' ');
}

const contentWords = (text: string): Set<string> =>
  new Set(text.toLowerCase().match(/[a-z']{5,}/g) ?? []);

export class Deliberator {
  /** Exchanges completed (caller turn plus Ferni's reply). */
  private turn = 0;
  private thought: { t: Thought; readyAt: number } | null = null;
  private offered: { said: string; line: string; note: string } | null = null;
  private lastOfferedTurn = -Infinity;
  private heldUntil = -1;
  private running = false;
  // prettier-ignore
  private readonly stats = { runs: 0, none: 0, failed: 0, offered: 0, expired: 0, echoed: 0, promptTokens: 0, outputTokens: 0, thoughtTokens: 0 };

  constructor(
    private readonly opts: {
      sessionId: string;
      think: ThinkFn;
      userName?: string;
      timeoutMs?: number;
    }
  ) {}

  /**
   * An exchange finished: the last offer is spent, an old thought may expire,
   * and a weighty caller turn starts a deliberation in the background.
   * Never throws; the reply path never awaits it.
   */
  async observe(lines: Line[], understanding: Understanding | null, memory = ''): Promise<void> {
    this.turn++;
    if (this.offered) {
      const last = lines.at(-1);
      const reply = last?.speaker === 'ferni' ? last.text : '';
      const shared = [...contentWords(this.offered.note)].filter((w) => contentWords(reply).has(w));
      if (shared.length >= 2) this.stats.echoed++;
      this.offered = null;
    }
    if (this.thought && this.turn - this.thought.readyAt >= EXPIRY_TURNS) {
      this.stats.expired++;
      log.info(
        { sessionId: this.opts.sessionId, kind: this.thought.t.kind },
        'DELIBERATION_EXPIRED'
      );
      this.thought = null;
    }
    const ready = this.turn - this.lastOfferedTurn >= SPACING_TURNS - 1;
    if (this.running || this.thought || !ready || this.turn <= this.heldUntil) return;
    if (this.stats.runs >= MAX_RUNS || !carriesWeight(lastCallerTurn(lines), understanding)) return;
    return this.deliberate(buildDeliberationPrompt(lines, memory, this.opts.userName));
  }

  private async deliberate(prompt: string): Promise<void> {
    this.running = true;
    this.stats.runs++;
    const startedTurn = this.turn;
    const started = Date.now();
    const controller = new globalThis.AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 15_000);
    try {
      const aborted = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('timeout')));
      });
      aborted.catch(() => undefined);
      const { text, usage } = await Promise.race([
        this.opts.think(DELIBERATION_SYSTEM, prompt, controller.signal),
        aborted,
      ]);
      this.stats.promptTokens += usage?.promptTokenCount ?? 0;
      this.stats.outputTokens += usage?.candidatesTokenCount ?? 0;
      this.stats.thoughtTokens += usage?.thoughtsTokenCount ?? 0;
      // One landing during a crisis hold is never offered: it expires before the hold ends.
      const t = parseThought(text);
      if (!t) this.stats.none++;
      else this.thought = { t, readyAt: this.turn };
      log.info(
        {
          sessionId: this.opts.sessionId,
          ms: Date.now() - started,
          kind: t?.kind ?? 'none',
          confidence: t?.confidence,
          turnsLate: this.turn - startedTurn,
          usage,
        },
        'DELIBERATION'
      );
    } catch (error) {
      this.stats.failed++;
      log.warn({ sessionId: this.opts.sessionId, error: String(error) }, 'deliberation failed');
    } finally {
      clearTimeout(timer);
      this.running = false;
    }
  }

  /** A crisis decision on this turn: drop any thought and stop thinking for a few turns. */
  hold(): void {
    this.thought = null;
    this.offered = null;
    this.heldUntil = this.turn + CRISIS_HOLD_TURNS;
  }

  /**
   * The note for the reply being asked for now, or ''. Synchronous: it never
   * waits for a deliberation in progress. A turn can be asked for more than
   * once (preemptive, final, after tools): the same words, or words extending
   * them, get the same note; any later turn never sees it again.
   */
  noteFor(said: string, held: boolean): string {
    const s = said.trim();
    if (this.offered && (s === this.offered.said || s.startsWith(this.offered.said)))
      return this.offered.line;
    if (!this.thought || held || this.turn <= this.heldUntil) return '';
    if (this.turn - this.lastOfferedTurn < SPACING_TURNS) return '';
    const { t } = this.thought;
    const line = formatThought(t);
    this.offered = { said: s, line, note: t.note };
    this.thought = null;
    this.lastOfferedTurn = this.turn;
    this.stats.offered++;
    log.info(
      { sessionId: this.opts.sessionId, kind: t.kind, tokens: estimateTokens(line) },
      'DELIBERATION_OFFERED'
    );
    return line;
  }

  /** Counts and tokens for the call (no words), logged when it ends. */
  summary(): Deliberator['stats'] & { turns: number } {
    return { ...this.stats, turns: this.turn };
  }
}

/** Gemini 3.5 Flash with a thinking budget; '' when Gemini is not configured. */
export function geminiThink(env: Env = process.env): ThinkFn {
  const model = env.DELIBERATION_MODEL || 'gemini-3.5-flash';
  const thinkingBudget = Number(env.DELIBERATION_THINKING_BUDGET) || 1024;
  return async (system, prompt, signal) => {
    const { getGeminiClient } = await import('../../config/gemini-config.js');
    const client = (await getGeminiClient()) as {
      models: {
        generateContent: (req: unknown) => Promise<{ text?: string; usageMetadata?: Usage }>;
      };
    } | null;
    if (!client) return { text: '' };
    const response = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: system,
        temperature: 0.7,
        maxOutputTokens: thinkingBudget + 300,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget },
        abortSignal: signal,
      },
    });
    return { text: response.text ?? '', usage: response.usageMetadata };
  };
}

// Keyed by the AgentSession object, like the director.
const deliberators = new WeakMap<object, Deliberator>();

export function setDeliberator(session: object, d: Deliberator | null): void {
  if (d) deliberators.set(session, d);
  else deliberators.delete(session);
}

export function getDeliberator(session: object | undefined): Deliberator | undefined {
  return session ? deliberators.get(session) : undefined;
}
