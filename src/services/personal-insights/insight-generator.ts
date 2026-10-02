/**
 * Insights and conversation openers, grounded in the user's own memory.
 *
 * The LLM (the same provider used for summarization) sees a numbered list of
 * evidence (E1, E2, ...) built from people, threads and dates, and must
 * return strict JSON where every item cites evidence ids. Output is then
 * checked: unknown ids, names or numbers that are not in the cited evidence,
 * and "gotcha" phrasing about sensitive topics are rejected. When the LLM is
 * off or fails, rule-based openers are built straight from the evidence.
 *
 * Crisis material never reaches the LLM: it sets `safetyHold`, openers are
 * withheld and the existing safety handling stays in charge.
 *
 * @module services/personal-insights/insight-generator
 */

import { detectCrisis } from '../safety/crisis-detection.js';
import { daysUntil } from './date-detection.js';
import { DAY_MS, roleLabel, sensitivityOf, truncate } from './text-utils.js';
import type {
  Evidence,
  GroundedItem,
  LifeThread,
  PersonProfile,
  SourceSummary,
  UpcomingDate,
} from './types.js';

export type InsightLlm = (prompt: string) => Promise<string | null>;

const MAX_EVIDENCE = 24;
const MAX_INSIGHT_CHARS = 200;
const MAX_OPENER_CHARS = 140;

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];
const ALLOWED_CAPS = new Set([
  'I',
  "I'm",
  "I've",
  "I'd",
  "I'll",
  'OK',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]);
const GOTCHA =
  /^(you said|you told me|last time you said|you keep|you always|you never)\b|\bagain\?/i;
const COUNTING = /\b(\d+|two|three|four|five|six|seven|eight|nine|ten) times\b/i;
/** Present-tense check-ins that would treat someone who has died as alive. */
const AS_IF_ALIVE = /\b(how('s| is| are)|how has|doing|is (he|she|they) (ok|okay|well|better))\b/i;

function ago(ms: number, nowMs: number): string {
  const d = Math.round((nowMs - ms) / DAY_MS);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

function crisisIn(text: string): boolean {
  return sensitivityOf(text) === 'crisis' || detectCrisis(text).detected;
}

export interface EvidenceInput {
  readonly people: readonly PersonProfile[];
  readonly threads: readonly LifeThread[];
  readonly upcomingDates: readonly UpcomingDate[];
  readonly summaries: readonly SourceSummary[];
  readonly nowMs: number;
  /** Material that must not be raised proactively (e.g. mentions an ex). */
  readonly exclude?: (text: string) => boolean;
}

/** Number the facts the generator may use. Crisis material is held back. */
export function buildEvidence(input: EvidenceInput): { evidence: Evidence[]; safetyHold: boolean } {
  const { nowMs } = input;
  const evidence: Evidence[] = [];
  let safetyHold = false;
  const push = (e: Omit<Evidence, 'id' | 'sensitive'>) => {
    if (evidence.length >= MAX_EVIDENCE || input.exclude?.(e.text)) return;
    if (crisisIn(e.text)) {
      safetyHold = true;
      return;
    }
    evidence.push({ ...e, id: `E${evidence.length + 1}`, sensitive: sensitivityOf(e.text) });
  };

  const recent = [...input.summaries].sort((a, b) => b.at - a.at);
  for (const s of recent.slice(0, 3)) {
    if (crisisIn([s.emotionalArc ?? '', ...s.keyPoints].join(' '))) safetyHold = true;
  }

  for (const d of input.upcomingDates.slice(0, 4)) {
    const when =
      d.daysAway === 0 ? 'today' : d.daysAway === 1 ? 'tomorrow' : `in ${d.daysAway} days`;
    push({
      text: `${d.title} is ${when}`,
      at: nowMs,
      personId: d.personId,
      sourceConversationIds: [],
    });
  }
  for (const p of input.people.slice(0, 5)) {
    const role = p.relationship ? `their ${roleLabel(p.relationship)}` : '';
    const rel = p.memorial ? ` (${role ? `${role}, ` : ''}who has died)` : role ? ` (${role})` : '';
    const memorial = p.memorial || undefined;
    for (const t of p.openThreads.slice(0, 2)) {
      push({
        text: `${p.name}${rel}: ${t.text} (${ago(t.mentionedAt, nowMs)})`,
        at: t.mentionedAt,
        personId: p.id,
        memorial,
        sourceConversationIds: t.sourceConversationIds,
      });
    }
    for (const f of p.keyFacts.slice(0, 2)) {
      push({
        text: `${p.name}${rel}: ${f.text}`,
        at: p.lastMentionedAt,
        personId: p.id,
        memorial,
        sourceConversationIds: f.sourceConversationIds,
      });
    }
    const bond = p.relationshipDetails;
    if (bond && !memorial) {
      const ids = p.sourceConversationIds;
      if (bond.whatHelped[0])
        push({
          text: `${p.name}${rel}: after tension, what has helped is ${bond.whatHelped[0]}`,
          at: p.lastMentionedAt,
          personId: p.id,
          sourceConversationIds: ids,
        });
      for (const g of bond.growthIntentions.slice(-1))
        push({
          text: `${p.name}${rel}: they want to do better: ${g.text}`,
          at: g.mentionedAt,
          personId: p.id,
          sourceConversationIds: g.sourceConversationIds,
        });
      if (bond.health === 'improving' || bond.health === 'declining') {
        push({
          text: `${p.name}${rel}: the way they talk about ${p.name} has sounded ${bond.health === 'improving' ? 'warmer' : 'more strained'} lately`,
          at: p.lastMentionedAt,
          personId: p.id,
          sourceConversationIds: ids,
        });
      }
    }
  }
  for (const t of input.threads.slice(0, 6)) {
    const n = t.mentionCount;
    push({
      text: `"${t.label}" came up in ${n} conversation${n === 1 ? '' : 's'}, last ${ago(t.lastMentionedAt, nowMs)} (${t.trajectory})`,
      at: t.lastMentionedAt,
      sourceConversationIds: t.sourceConversationIds,
    });
    for (const u of [...t.unresolved, ...t.commitments].slice(-2)) {
      push({
        text: `Open about "${t.label}": ${u.text}`,
        at: u.mentionedAt,
        sourceConversationIds: u.sourceConversationIds,
      });
    }
  }
  for (const s of recent.slice(0, 2)) {
    if (s.keyPoints[0])
      push({
        text: `From ${ago(s.at, nowMs)}: ${s.keyPoints[0]}`,
        at: s.at,
        sourceConversationIds: [s.conversationId],
      });
  }
  return { evidence, safetyHold };
}

export function buildInsightPrompt(evidence: readonly Evidence[]): string {
  return `You help a warm, attentive companion remember what matters to the person they talk with.
Below is EVERYTHING known, as numbered evidence. Write:
- "insights": up to 3 specific, kind observations about patterns (e.g. a topic rising, a link between two things).
- "openers": up to 3 natural, short check-in questions or follow-ups for the start of the next conversation.

Rules (strict):
- Use ONLY the evidence. Never invent names, dates, numbers, events or feelings.
- Every item must cite the evidence ids it relies on.
- Hedge when unsure ("it sounds like", "seems").
- Health, grief, money and relationship topics: gentle, open, never a gotcha, never count how often they mentioned it.
- Never say "you said" or "you told me". Talk like a friend who remembers, not a record.
- Openers under 20 words, insights under 35 words.

Evidence:
${evidence.map((e) => `${e.id}: ${e.text}`).join('\n')}

Return ONLY JSON: {"insights":[{"text":"...","evidence":["E1"]}],"openers":[{"text":"...","evidence":["E2"]}]}`;
}

function numberTokens(text: string): string[] {
  const t = text.toLowerCase();
  const digits = t.match(/\b\d+\b/g) ?? [];
  const words = NUMBER_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(t));
  return [...digits, ...words];
}

function numberPresent(token: string, evidenceText: string): boolean {
  const e = evidenceText.toLowerCase();
  const asDigit = /^\d+$/.test(token) ? token : String(NUMBER_WORDS.indexOf(token));
  const asWord = /^\d+$/.test(token) ? NUMBER_WORDS[Number(token)] : token;
  return (
    new RegExp(`\\b${asDigit}\\b`).test(e) || (!!asWord && new RegExp(`\\b${asWord}\\b`).test(e))
  );
}

/** Validate raw LLM items against the evidence. Exported for tests. */
export function validateGrounded(
  raw: unknown,
  evidence: readonly Evidence[],
  maxChars: number,
  max: number
): GroundedItem[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const out: GroundedItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { text, evidence: cited } = item as { text?: unknown; evidence?: unknown };
    if (typeof text !== 'string' || !Array.isArray(cited) || cited.length === 0) continue;
    const t = text.trim();
    if (!t || t.length > maxChars) continue;
    const ids = cited.map(String);
    if (!ids.every((id) => byId.has(id))) continue; // cites a fact that does not exist
    const used = ids.map((id) => byId.get(id)!);
    const corpus = used.map((e) => e.text).join(' ');

    // Names: every capitalized word mid-sentence must appear in the cited evidence.
    const words = t.split(/\s+/);
    const invented = words.some((w, i) => {
      const clean = w.replace(/^[^\p{L}]+|[^\p{L}']+$/gu, '').replace(/'s$/, '');
      if (!/^\p{Lu}/u.test(clean) || ALLOWED_CAPS.has(clean)) return false;
      const sentenceStart = i === 0 || /[.!?]$/.test(words[i - 1]);
      if (sentenceStart) return false;
      return !new RegExp(`\\b${clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(corpus);
    });
    if (invented) continue;
    if (!numberTokens(t).every((n) => numberPresent(n, corpus))) continue;

    const sensitive = used.find((e) => e.sensitive)?.sensitive ?? sensitivityOf(t);
    if (sensitive === 'crisis') continue;
    if (GOTCHA.test(t)) continue;
    if (sensitive && COUNTING.test(t)) continue;
    if (used.some((e) => e.memorial) && AS_IF_ALIVE.test(t)) continue;
    if (out.some((o) => o.text.toLowerCase() === t.toLowerCase())) continue;

    out.push({
      text: t,
      evidence: ids,
      sensitive,
      personId: used.find((e) => e.personId)?.personId,
      sourceConversationIds: [...new Set(used.flatMap((e) => e.sourceConversationIds))],
    });
    if (out.length >= max) break;
  }
  return out;
}

function parseJson(text: string): { insights?: unknown; openers?: unknown } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed: unknown = JSON.parse(m[0]);
    return parsed && typeof parsed === 'object'
      ? (parsed as { insights?: unknown; openers?: unknown })
      : null;
  } catch {
    return null;
  }
}

/** Openers built directly from evidence: grounded by construction, phrased as guidance. */
export function ruleBasedOpeners(evidence: readonly Evidence[], max: number): GroundedItem[] {
  const out: GroundedItem[] = [];
  const pick = (pred: (e: Evidence) => boolean, phrase: (e: Evidence) => string) => {
    for (const e of evidence) {
      if (out.length >= max) return;
      if (!pred(e) || out.some((o) => o.evidence.includes(e.id))) continue;
      out.push({
        text: truncate(phrase(e), MAX_OPENER_CHARS),
        evidence: [e.id],
        sensitive: e.sensitive,
        personId: e.personId,
        sourceConversationIds: e.sourceConversationIds,
      });
    }
  };
  pick(
    (e) => / is (today|tomorrow|in \d+ days)$/.test(e.text),
    (e) => `Maybe mention: ${e.text}`
  );
  pick(
    (e) => !!e.personId && !e.memorial && /\(\d+ days ago\)|\(yesterday\)|\(today\)/.test(e.text),
    (e) =>
      e.sensitive
        ? `Gently, only if it fits, check in on: ${e.text}`
        : `Ask how this went: ${e.text}`
  );
  pick(
    (e) => e.text.startsWith('Open about'),
    (e) => `Follow up softly: ${e.text.replace(/^Open about /, '')}`
  );
  return out;
}

export interface GeneratedInsights {
  readonly insights: GroundedItem[];
  readonly openers: GroundedItem[];
  readonly generator: 'llm' | 'rules';
}

export async function generateInsights(
  evidence: readonly Evidence[],
  options: { llm?: InsightLlm; maxInsights: number; maxOpeners: number }
): Promise<GeneratedInsights> {
  const fallback = (): GeneratedInsights => ({
    insights: [],
    openers: ruleBasedOpeners(evidence, options.maxOpeners),
    generator: 'rules',
  });
  if (!options.llm || evidence.length === 0) return fallback();
  let response: string | null = null;
  try {
    response = await options.llm(buildInsightPrompt(evidence));
  } catch {
    return fallback();
  }
  const parsed = response ? parseJson(response) : null;
  if (!parsed) return fallback();
  const insights = validateGrounded(
    parsed.insights,
    evidence,
    MAX_INSIGHT_CHARS,
    options.maxInsights
  );
  const openers = validateGrounded(parsed.openers, evidence, MAX_OPENER_CHARS, options.maxOpeners);
  if (openers.length === 0 && insights.length === 0) return fallback();
  return {
    insights,
    openers: openers.length ? openers : ruleBasedOpeners(evidence, options.maxOpeners),
    generator: 'llm',
  };
}

/** Upcoming dates from detected dates (when the important-dates store is not available). */
export function upcomingFromDetected(
  dates: ReadonlyArray<{
    title: string;
    date: string;
    personId?: string;
    kind: UpcomingDate['kind'];
  }>,
  nowMs: number,
  withinDays: number
): UpcomingDate[] {
  const out: UpcomingDate[] = [];
  for (const d of dates) {
    const days = daysUntil(d.date, nowMs);
    if (days === null || days > withinDays) continue;
    out.push({ title: d.title, date: d.date, daysAway: days, personId: d.personId, kind: d.kind });
  }
  return out.sort((a, b) => a.daysAway - b.daysAway);
}
