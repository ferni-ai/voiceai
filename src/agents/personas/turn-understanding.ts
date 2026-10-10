/**
 * Turn understanding: one small model reads what the caller is saying.
 *
 * Ferni's per-turn decisions (which model answers, whether the caller is
 * venting, whether a laugh or an aside fits, what to say back mid-sentence)
 * were made by hand-written regexes and keyword lists. This asks
 * gemini-3.5-flash-lite once for all of them, in JSON. It runs on the interim
 * transcript while the caller is still talking (re-run as words arrive, one call
 * at a time), so an answer for the whole turn is usually ready when they stop.
 *
 * TURN_UNDERSTANDING=shadow: understand every turn and log it next to what the
 * regexes decided (TURN_UNDERSTANDING record), so agreement and readiness can
 * be measured from real calls; nothing uses it yet. Off by default.
 *
 * @module agents/personas/turn-understanding
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CallerMove } from './turn-shape.js';

const log = createLogger({ module: 'TurnUnderstanding' });

export type Mood = 'venting' | 'tender' | 'bad_news' | 'funny' | 'surprise' | 'excited' | 'neutral';

export interface Understanding {
  /** What the caller's turn does, in the turn-shape's terms. */
  move: CallerMove;
  /** Answering it well needs a tool (a timer, a reminder, music, a look-up, saving something). */
  needsTool: boolean;
  mood: Mood;
  /** The caller laughed or is clearly joking. */
  laughed: boolean;
  /** A friend would laugh at this. */
  laughFits: boolean;
  /** Light enough that Ferni could ask their take on something small in his own life. */
  adviceFits: boolean;
  /** They are wrapping up the call. */
  wantsToEnd: boolean;
  /** A one-to-three word reaction a friend might make while listening, or null. */
  reaction: string | null;
}

export function understandingMode(
  env: Record<string, string | undefined> = process.env
): 'off' | 'shadow' {
  return env.TURN_UNDERSTANDING === 'shadow' ? 'shadow' : 'off';
}

export const UNDERSTANDING_PROMPT = `You listen in on a phone call between a caller and their friend Ferni. Read the caller's words (EARLIER is context; judge NOW, which may still be mid-sentence) and return JSON only:
{"move":"ack"|"lookup"|"request"|"about_ferni"|"share","needsTool":bool,"mood":"venting"|"tender"|"bad_news"|"funny"|"surprise"|"excited"|"neutral","laughed":bool,"laughFits":bool,"adviceFits":bool,"wantsToEnd":bool,"reaction":string|null}
move: ack = a short acknowledgement ("yeah", "okay", "thanks"); lookup = asks for live facts (weather, news, scores, times, prices); request = asks Ferni to do or explain something; about_ferni = asks about Ferni himself; share = telling something about their own life or thoughts.
needsTool: true if answering well means doing something (timer, alarm, reminder, music, calendar, note, remembering a fact they asked to keep) or looking something up.
mood: venting = frustrated, tired, stressed or upset; tender = moved, emotional in a warm way; bad_news = something went wrong or someone is hurt or sick; funny = amusing; surprise = big or unexpected news; excited = happy and energized.
laughed: they laughed or are joking. laughFits: a good friend would genuinely laugh here (never at bad news, grief, tenderness or venting). adviceFits: the moment is light and nothing is asked of Ferni right now.
reaction: what a close friend might murmur while still listening to something they are telling ("Oh no", "Ha", "Aw", "Whoa", "No way", "Oof", "Mm"), or null when silence is better. Always null when they ask Ferni something or ask him to do something: that gets a reply, not a murmur.`;

const MOVES = new Set(['ack', 'lookup', 'request', 'about_ferni', 'share']);
const MOODS = new Set(['venting', 'tender', 'bad_news', 'funny', 'surprise', 'excited', 'neutral']);

/** The model's JSON, or null when it is not a usable understanding. */
export function parseUnderstanding(reply: string): Understanding | null {
  const json = reply.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const p = JSON.parse(json) as Record<string, unknown>;
    if (!MOVES.has(p.move as string) || !MOODS.has(p.mood as string)) return null;
    const reaction =
      typeof p.reaction === 'string' && p.reaction.trim() && p.reaction.split(/\s+/).length <= 3
        ? p.reaction.trim()
        : null;
    return {
      move: p.move as CallerMove,
      needsTool: p.needsTool === true,
      mood: p.mood as Mood,
      laughed: p.laughed === true,
      laughFits: p.laughFits === true,
      adviceFits: p.adviceFits === true,
      wantsToEnd: p.wantsToEnd === true,
      reaction,
    };
  } catch {
    return null;
  }
}

/** Sends the prompt and input to a model and returns its raw text. */
export type UnderstandFn = (system: string, input: string, signal: AbortSignal) => Promise<string>;

export const DEFAULT_UNDERSTANDING_MODEL = 'gemini-3.5-flash-lite';
const TIMEOUT_MS = 1500;

/** Gemini-backed call; '' when Gemini is not configured. */
export function geminiUnderstand(
  model: string = process.env.TURN_UNDERSTANDING_MODEL || DEFAULT_UNDERSTANDING_MODEL
): UnderstandFn {
  return async (system, input, signal) => {
    const { getGeminiClient } = await import('../../config/gemini-config.js');
    const client = (await getGeminiClient()) as {
      models: { generateContent: (req: unknown) => Promise<{ text?: string }> };
    } | null;
    if (!client) return '';
    const response = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: input }] }],
      config: {
        systemInstruction: system,
        temperature: 0,
        maxOutputTokens: 120,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
        abortSignal: signal,
      },
    });
    return response.text ?? '';
  };
}

const words = (t: string): string[] => t.toLowerCase().match(/[a-z0-9']+/g) ?? [];

/**
 * Understands one call's turns as they are spoken. Feed it each transcript
 * update; read the latest understanding for the words it covers.
 */
export class TurnUnderstander {
  private latest: { text: string; result: Understanding; at: number } | null = null;
  private running: string | null = null;
  private pending: string | null = null;
  private earlier: string[] = [];

  constructor(
    private readonly understand: UnderstandFn,
    private readonly now: () => number = Date.now,
    private readonly timeoutMs = TIMEOUT_MS
  ) {}

  /** The whole turn so far (finals plus the current interim). */
  onTurnText(text: string): void {
    const t = text.trim();
    if (!t || t === this.latest?.text) return;
    if (this.running !== null) {
      this.pending = t;
      return;
    }
    const covered = this.latest ? words(this.latest.text).length : 0;
    if (this.latest && words(t).length - covered < 2) {
      this.pending = t; // wait for a couple more words, or for the end of the turn
      return;
    }
    void this.run(t);
  }

  /** The turn ended: understand whatever is still pending. */
  async settle(text: string): Promise<void> {
    const t = text.trim();
    if (!t || this.latest?.text === t) return;
    this.pending = t;
    if (this.running === null) await this.run(t);
  }

  /** The latest understanding, if it covers these words (all but at most two). */
  forTurn(text: string): { result: Understanding; covered: number; ageMs: number } | null {
    if (!this.latest) return null;
    const turn = words(text);
    const seen = words(this.latest.text);
    const covered = seen.length <= turn.length && seen.every((w, i) => turn[i] === w);
    if (!covered || turn.length - seen.length > 2) return null;
    return {
      result: this.latest.result,
      covered: seen.length / Math.max(turn.length, 1),
      ageMs: this.now() - this.latest.at,
    };
  }

  /** A new caller turn begins: the last one becomes context. */
  newTurn(lastTurn: string): void {
    if (lastTurn.trim()) this.earlier = [...this.earlier, lastTurn.trim()].slice(-3);
    this.latest = null;
    this.pending = null;
  }

  private async run(text: string): Promise<void> {
    this.running = text;
    const controller = new globalThis.AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const input = JSON.stringify({ EARLIER: this.earlier, NOW: text });
      const result = parseUnderstanding(
        await this.understand(UNDERSTANDING_PROMPT, input, controller.signal)
      );
      if (result) this.latest = { text, result, at: this.now() };
    } catch (error) {
      log.debug({ error: String(error) }, 'turn understanding failed');
    } finally {
      clearTimeout(timer);
      this.running = null;
    }
    const next = this.pending;
    this.pending = null;
    if (next && next !== text) await this.run(next);
  }
}
