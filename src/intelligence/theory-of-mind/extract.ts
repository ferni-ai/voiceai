/**
 * Reads one finished call for what it shows about the person: what they told
 * Ferni, moments that show how they feel, cope, what helps them and what they
 * care about, and anything that went against what Ferni already believed.
 *
 * The model returns paraphrases, never quotes, and the parser keeps only
 * well-formed, short fields, so no transcript text is stored.
 *
 * @module intelligence/theory-of-mind/extract
 */

import { type CallReading, type MindModel, PATTERN_KINDS, type PatternKind } from './types.js';

export interface CallTurn {
  role: string;
  content?: string;
  text?: string;
}

export interface CallSummaryView {
  keyPoints?: string[];
  emotionalArc?: string;
  mainTopics?: string[];
}

const MAX_TRANSCRIPT_CHARS = 12_000;
const MAX_FIELD = 140;
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+){0,6}$/;
// A reading, not a diagnosis: clinical labels never enter the model.
const LABEL =
  /\b(disorder|adhd|autis\w*|bipolar|narciss\w*|borderline|ocd|ptsd|depress(ed|ion)|diagnos\w*)\b/i;

function transcriptOf(turns: CallTurn[]): string {
  const lines = turns
    .map((t) => {
      const text = (t.content ?? t.text ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return '';
      return `${t.role === 'user' ? 'CALLER' : 'FERNI'}: ${text}`;
    })
    .filter(Boolean);
  // Keep the end of a long call: that is where it lands.
  let out = lines.join('\n');
  if (out.length > MAX_TRANSCRIPT_CHARS) out = out.slice(out.length - MAX_TRANSCRIPT_CHARS);
  return out;
}

export function readingPrompt(
  turns: CallTurn[],
  summary: CallSummaryView | null,
  model: MindModel
): string {
  const known = model.patterns.map((p) => `- ${p.key} (${p.kind}): ${p.statement}`).join('\n');
  const told = model.toldFerni.map((t) => t.topic).join('; ');
  const sum = summary
    ? `Summary: ${(summary.keyPoints ?? []).join('; ')}\nHow it felt: ${summary.emotionalArc ?? ''}\n\n`
    : '';
  return `You are helping a warm, perceptive friend understand the person they just talked with on the phone. Read the call and note only what it clearly shows. Be tentative and fair; no labels, diagnoses or judgements.

Return JSON only:
{"told": [<topics or facts the CALLER shared about their life, 3-10 words each, so the friend never asks about them as if new>],
 "observations": [{"key": "<kebab-case id; reuse a key below if this is the same pattern>", "kind": "coping" | "feeling" | "support" | "care", "statement": "<the pattern in plain words, e.g. 'jokes when anxious, then wants practical help'>", "cue": "<one short paraphrase of the moment that shows it; never a quote>"}],
 "contradicted": [<keys below that this call clearly went against>],
 "current": {"state": "<how they are right now, e.g. 'anxious about a final-round interview'>", "days": <1-14, how long that likely lasts>} | null,
 "sensitivities": [{"topic": "<what to go gently around>", "how": "<e.g. 'doesn't want to talk about it'>"}]}

Kinds: coping = how they handle stress or bad news; feeling = how they tend to feel about something recurring; support = what helps them (advice, listening, distraction, a laugh); care = what matters to them.
Give one observation per moment: if a pattern shows twice in this call, list it twice with different cues. Skip anything shown only by Ferni's words, and skip patterns you would have to guess at.

What the friend already believes:
${known || '(nothing yet)'}

Already told: ${told || '(nothing yet)'}

${sum}CALL:
${transcriptOf(turns)}`;
}

const text = (v: unknown, max = MAX_FIELD): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  if (!s || LABEL.test(s)) return null;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Parse the model's reply, keeping only well-formed fields. Null when nothing usable came back. */
export function parseReading(raw: string): CallReading | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const told = list(data.told)
    .map((t) => text(t, 90))
    .filter((t): t is string => Boolean(t))
    .slice(0, 12);
  const observations = list(data.observations)
    .map((o) => {
      const r = (o ?? {}) as Record<string, unknown>;
      const key = typeof r.key === 'string' ? r.key.trim().toLowerCase() : '';
      const kind = r.kind as PatternKind;
      const statement = text(r.statement);
      const cue = text(r.cue);
      if (!KEY.test(key) || !PATTERN_KINDS.includes(kind) || !statement || !cue) return null;
      return { key, kind, statement, cue };
    })
    .filter((o): o is CallReading['observations'][number] => o !== null)
    .slice(0, 10);
  const contradicted = list(data.contradicted)
    .filter((k): k is string => typeof k === 'string' && KEY.test(k))
    .slice(0, 6);
  const c = (data.current ?? null) as Record<string, unknown> | null;
  const state = c ? text(c.state) : null;
  const current = state ? { state, days: Number(c?.days) || 3 } : undefined;
  const sensitivities = list(data.sensitivities)
    .map((s) => {
      const r = (s ?? {}) as Record<string, unknown>;
      const topic = text(r.topic, 60);
      const how = text(r.how, 80);
      return topic && how ? { topic, how } : null;
    })
    .filter((s): s is { topic: string; how: string } => s !== null)
    .slice(0, 4);
  return { told, observations, contradicted, current, sensitivities };
}
