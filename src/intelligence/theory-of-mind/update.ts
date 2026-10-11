/**
 * Folds one call's reading into the model. Pure: the caller passes the time.
 *
 * A pattern is established at two moments. Confidence grows with moments and
 * with the number of calls they came from, falls with each contradiction, and
 * a pattern whose confidence reaches zero is dropped. Ferni acts only on
 * established patterns (note.ts).
 *
 * @module intelligence/theory-of-mind/update
 */

import {
  type CallReading,
  type MindModel,
  type Moment,
  type Pattern,
  type ToldItem,
} from './types.js';

export const ESTABLISHED_MOMENTS = 2;
const MAX_MOMENTS = 6;
const MAX_PATTERNS = 12;
const MAX_TOLD = 30;
const MAX_SENSITIVITIES = 8;
const MAX_CONTEXT_DAYS = 14;
const DAY_MS = 86_400_000;

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Grows with evidence across calls; each contradiction takes back more than a moment adds. */
export function confidenceOf(p: Pick<Pattern, 'moments' | 'contradictions'>): number {
  const calls = new Set(p.moments.map((m) => m.sessionId)).size;
  const raw = 0.2 * p.moments.length + 0.15 * (calls - 1) - 0.3 * p.contradictions;
  return Math.round(Math.min(0.95, Math.max(0, raw)) * 100) / 100;
}

export function isEstablished(p: Pattern): boolean {
  return p.moments.length >= ESTABLISHED_MOMENTS && p.confidence > 0;
}

function mergeTold(told: ToldItem[], topics: string[], at: string): ToldItem[] {
  const fresh = topics.map((topic) => ({ topic, at }));
  const seen = new Set<string>();
  const out: ToldItem[] = [];
  // Newest first, so a topic told again moves up and the oldest fall off.
  for (const item of [...fresh, ...told]) {
    const key = norm(item.topic);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, MAX_TOLD);
}

function mergePatterns(
  patterns: Pattern[],
  reading: CallReading,
  sessionId: string,
  at: string
): Pattern[] {
  const byKey = new Map(patterns.map((p) => [p.key, { ...p, moments: [...p.moments] }]));
  for (const o of reading.observations) {
    const moment: Moment = { sessionId, at, cue: o.cue };
    const prev = byKey.get(o.key);
    if (prev) {
      prev.moments = [...prev.moments, moment].slice(-MAX_MOMENTS);
      prev.lastSeen = at;
      prev.statement = o.statement || prev.statement;
    } else {
      byKey.set(o.key, {
        key: o.key,
        kind: o.kind,
        statement: o.statement,
        moments: [moment],
        contradictions: 0,
        confidence: 0,
        lastSeen: at,
      });
    }
  }
  const observed = new Set(reading.observations.map((o) => o.key));
  for (const key of reading.contradicted) {
    const prev = byKey.get(key);
    // A call can't both support and contradict the same pattern.
    if (prev && !observed.has(key)) prev.contradictions += 1;
  }
  return [...byKey.values()]
    .map((p) => ({ ...p, confidence: confidenceOf(p) }))
    .filter((p) => p.confidence > 0 || p.contradictions === 0)
    .sort((a, b) => b.confidence - a.confidence || b.lastSeen.localeCompare(a.lastSeen))
    .slice(0, MAX_PATTERNS);
}

export function applyCallReading(
  model: MindModel,
  reading: CallReading,
  sessionId: string,
  now: Date
): MindModel {
  const at = now.toISOString();
  const days = Math.min(MAX_CONTEXT_DAYS, Math.max(1, Math.round(reading.current?.days ?? 0)));
  const current = reading.current?.state
    ? {
        state: reading.current.state,
        at,
        until: new Date(now.getTime() + days * DAY_MS).toISOString(),
      }
    : model.current && model.current.until > at
      ? model.current
      : undefined;

  const sensitivities = [
    ...reading.sensitivities.map((s) => ({ ...s, at })),
    ...model.sensitivities.filter(
      (s) => !reading.sensitivities.some((n) => norm(n.topic) === norm(s.topic))
    ),
  ].slice(0, MAX_SENSITIVITIES);

  const next: MindModel = {
    ...model,
    calls: model.calls + 1,
    toldFerni: mergeTold(model.toldFerni, reading.told, at),
    patterns: mergePatterns(model.patterns, reading, sessionId, at),
    sensitivities,
    updatedAt: at,
  };
  if (current) next.current = current;
  else delete next.current;
  return next;
}
