/**
 * Anticipation: what is this person likely to bring up today?
 *
 * Simple, transparent scoring (no opaque ML). Every candidate (a life
 * thread, a person with something open, an upcoming date, a fresh follow-up)
 * gets component scores in [0,1]:
 *   recency     exp(-daysSinceLast / 14)
 *   frequency   min(1, conversations / 5)
 *   cadence     1 when it is "due" by its usual rhythm
 *   timePattern share of past mentions on this weekday / time of day
 *   unresolved  1 when something is still open
 *   upcoming    1 - days/8 for a date within a week
 * combined with fixed per-kind weights, then calibrated per kind by how
 * often past predictions of that kind came true:
 *   factor = (hits + 1) / (sum of predicted confidence + 1), clipped to [0.5, 1.5]
 * After each conversation the predictions made before it are scored
 * (hit = the conversation's summary mentions it) and stored, so the factor
 * keeps learning.
 *
 * @module services/personal-insights/prediction
 */

import { personMatchTerms } from './people-model.js';
import { DAY_MS, textMatchesTerms } from './text-utils.js';
import type {
  CalibrationStats,
  LifeThread,
  PersonProfile,
  PredictionComponents,
  PredictionKind,
  PredictionOutcome,
  SourceConversation,
  SourceSummary,
  TopicPrediction,
  UpcomingDate,
} from './types.js';

const ZERO: PredictionComponents = {
  recency: 0,
  frequency: 0,
  cadence: 0,
  timePattern: 0,
  unresolved: 0,
  upcoming: 0,
};

const WEIGHTS: Record<PredictionKind, PredictionComponents> = {
  thread: {
    recency: 0.3,
    frequency: 0.2,
    cadence: 0.15,
    timePattern: 0.1,
    unresolved: 0.25,
    upcoming: 0,
  },
  person: {
    recency: 0.35,
    frequency: 0.15,
    cadence: 0,
    timePattern: 0,
    unresolved: 0.35,
    upcoming: 0.15,
  },
  date: { recency: 0, frequency: 0, cadence: 0, timePattern: 0, unresolved: 0.3, upcoming: 0.7 },
  followup: {
    recency: 0.5,
    frequency: 0,
    cadence: 0,
    timePattern: 0,
    unresolved: 0.5,
    upcoming: 0,
  },
};

export const EMPTY_CALIBRATION: CalibrationStats = {
  byKind: {
    thread: { n: 0, hits: 0, sumConfidence: 0 },
    person: { n: 0, hits: 0, sumConfidence: 0 },
    date: { n: 0, hits: 0, sumConfidence: 0 },
    followup: { n: 0, hits: 0, sumConfidence: 0 },
  },
  outcomes: 0,
  meanBrier: null,
};

const recencyOf = (lastMs: number, nowMs: number) =>
  Math.exp(-Math.max(0, nowMs - lastMs) / DAY_MS / 14);

function bucketOf(ms: number): number {
  const h = new Date(ms).getUTCHours();
  return h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3;
}

function timePatternOf(times: readonly number[], nowMs: number): number {
  if (times.length < 3) return 0;
  const dow = new Date(nowMs).getUTCDay();
  const sameDay = times.filter((t) => new Date(t).getUTCDay() === dow).length / times.length;
  const sameBucket = times.filter((t) => bucketOf(t) === bucketOf(nowMs)).length / times.length;
  return Math.max(sameDay, sameBucket);
}

function cadenceOf(thread: LifeThread, nowMs: number): number {
  if (!thread.cadenceDays || thread.cadenceDays <= 0) return 0;
  const since = (nowMs - thread.lastMentionedAt) / DAY_MS;
  const ratio = since / thread.cadenceDays;
  if (ratio >= 0.7 && ratio <= 1.5) return 1;
  if (ratio > 1.5 && ratio <= 3) return 0.4;
  return ratio > 0.4 && ratio < 0.7 ? 0.5 : 0;
}

function combine(kind: PredictionKind, c: PredictionComponents): number {
  const w = WEIGHTS[kind];
  return Math.min(
    1,
    c.recency * w.recency +
      c.frequency * w.frequency +
      c.cadence * w.cadence +
      c.timePattern * w.timePattern +
      c.unresolved * w.unresolved +
      c.upcoming * w.upcoming
  );
}

export function calibrationFactor(stats: CalibrationStats, kind: PredictionKind): number {
  const k = stats.byKind[kind];
  return Math.min(1.5, Math.max(0.5, (k.hits + 1) / (k.sumConfidence + 1)));
}

function ago(ms: number, nowMs: number): string {
  const d = Math.round((nowMs - ms) / DAY_MS);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

export interface PredictInput {
  readonly threads: readonly LifeThread[];
  readonly people: readonly PersonProfile[];
  readonly upcomingDates: readonly UpcomingDate[];
  readonly summaries: readonly SourceSummary[];
  readonly conversations: readonly SourceConversation[];
  readonly calibration: CalibrationStats;
  readonly nowMs: number;
  readonly max: number;
}

/** Likely topics for the next conversation, most likely first. Pure. */
export function predictTopics(input: PredictInput): TopicPrediction[] {
  const { nowMs } = input;
  const out: TopicPrediction[] = [];
  const add = (
    kind: PredictionKind,
    key: string,
    label: string,
    c: PredictionComponents,
    reason: string,
    matchTerms: string[],
    sensitive?: TopicPrediction['sensitive']
  ) => {
    const raw = combine(kind, c);
    if (raw <= 0.05) return;
    const confidence = Math.min(0.95, raw * calibrationFactor(input.calibration, kind));
    out.push({
      key,
      kind,
      label,
      confidence: round(confidence),
      rawScore: round(raw),
      reason,
      matchTerms,
      components: c,
      sensitive,
    });
  };

  for (const t of input.threads) {
    if (t.sensitive === 'crisis') continue;
    const c: PredictionComponents = {
      ...ZERO,
      recency: recencyOf(t.lastMentionedAt, nowMs),
      frequency: Math.min(1, t.mentionCount / 5),
      cadence: cadenceOf(t, nowMs),
      timePattern: timePatternOf(t.mentionTimes, nowMs),
      unresolved: t.unresolved.length + t.commitments.length > 0 ? 1 : 0,
    };
    const why = [
      `came up in ${t.mentionCount} conversation${t.mentionCount === 1 ? '' : 's'}, last ${ago(t.lastMentionedAt, nowMs)}`,
    ];
    if (c.unresolved) why.push('something is still open');
    if (c.cadence === 1) why.push(`usually comes up every ~${Math.round(t.cadenceDays ?? 0)} days`);
    if (c.timePattern >= 0.5) why.push('often comes up around this time');
    add('thread', t.id, t.label, c, why.join('; '), [t.label], t.sensitive);
  }

  const holders = new Map<string, number>();
  for (const p of input.people)
    if (p.relationship) holders.set(p.relationship, (holders.get(p.relationship) ?? 0) + 1);
  for (const p of input.people) {
    const soon = input.upcomingDates.find((d) => d.personId === p.id && d.daysAway <= 7);
    if (p.memorial || (p.openThreads.length === 0 && !soon)) continue;
    const c: PredictionComponents = {
      ...ZERO,
      recency: recencyOf(p.lastMentionedAt, nowMs),
      frequency: Math.min(1, p.mentionCount / 5),
      unresolved: p.openThreads.length > 0 ? 1 : 0,
      upcoming: soon ? 1 - soon.daysAway / 8 : 0,
    };
    const why = [`last mentioned ${ago(p.lastMentionedAt, nowMs)}`];
    if (p.openThreads[0]) why.push(`open: ${p.openThreads[0].text}`);
    if (soon) why.push(`${soon.title} in ${soon.daysAway} day${soon.daysAway === 1 ? '' : 's'}`);
    const terms = personMatchTerms(p, !!p.relationship && (holders.get(p.relationship) ?? 0) > 1);
    add('person', p.id, p.name, c, why.join('; '), terms);
  }

  for (const d of input.upcomingDates) {
    if (d.daysAway > 7) continue;
    const c: PredictionComponents = {
      ...ZERO,
      upcoming: 1 - d.daysAway / 8,
      unresolved: d.kind === 'event' || d.kind === 'deadline' ? 1 : 0,
    };
    const when =
      d.daysAway === 0 ? 'today' : d.daysAway === 1 ? 'tomorrow' : `in ${d.daysAway} days`;
    add('date', `date:${d.title}:${d.date}`, d.title, c, `${d.title} is ${when}`, [
      d.title.replace(/^(your|.*?'s)\s+/i, ''),
    ]);
  }

  // Fresh follow-ups from the most recent conversation not already covered.
  const last = [...input.summaries].sort((a, b) => b.at - a.at)[0];
  if (last) {
    for (const item of last.followUps) {
      if (out.some((p) => textMatchesTerms(item, p.matchTerms))) continue;
      const c: PredictionComponents = {
        ...ZERO,
        recency: recencyOf(last.at, nowMs),
        unresolved: 1,
      };
      add(
        'followup',
        `followup:${item.toLowerCase()}`,
        item,
        c,
        `open from ${ago(last.at, nowMs)}`,
        [item]
      );
    }
  }

  return out.sort((a, b) => b.confidence - a.confidence).slice(0, input.max);
}

/** Score predictions against what a conversation actually covered. Pure. */
export function scorePredictions(
  predictions: readonly TopicPrediction[],
  conversationId: string,
  conversationText: string,
  predictedAt: number,
  nowMs: number
): PredictionOutcome {
  const items = predictions.map((p) => ({
    key: p.key,
    kind: p.kind,
    label: p.label,
    confidence: p.confidence,
    hit: textMatchesTerms(conversationText, p.matchTerms),
  }));
  const hits = items.filter((i) => i.hit).length;
  const brier = items.length
    ? items.reduce((s, i) => s + (i.confidence - (i.hit ? 1 : 0)) ** 2, 0) / items.length
    : 0;
  return {
    conversationId,
    predictedAt,
    scoredAt: nowMs,
    items,
    hits,
    total: items.length,
    brier: round(brier),
    sourceConversationIds: [conversationId],
  };
}

/** Aggregate recent outcomes into per-kind calibration. Pure. */
export function calibrationFrom(outcomes: readonly PredictionOutcome[]): CalibrationStats {
  const byKind = {
    thread: { n: 0, hits: 0, sumConfidence: 0 },
    person: { n: 0, hits: 0, sumConfidence: 0 },
    date: { n: 0, hits: 0, sumConfidence: 0 },
    followup: { n: 0, hits: 0, sumConfidence: 0 },
  };
  let brierSum = 0;
  let scored = 0;
  for (const o of outcomes) {
    for (const i of o.items) {
      const k = byKind[i.kind];
      if (!k) continue;
      k.n++;
      k.hits += i.hit ? 1 : 0;
      k.sumConfidence += i.confidence;
    }
    if (o.total > 0) {
      brierSum += o.brier;
      scored++;
    }
  }
  return { byKind, outcomes: outcomes.length, meanBrier: scored ? round(brierSum / scored) : null };
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}
