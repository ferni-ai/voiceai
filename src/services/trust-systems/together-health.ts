/**
 * "How we're doing together": a relationship health read built only from what
 * actually happened between Ferni and this user.
 *
 * Four factors, each from one real signal, each OMITTED when that signal isn't
 * there (never shown as 0 or a neutral default):
 * - rhythm:   how many days we talked in the last 30
 * - promises: promises Ferni made that are known to be kept or broken
 * - lift:     whether conversations end lighter than they start, day by day
 * - mood:     the last week's mood against the weeks before it
 *
 * Fewer than three days together is "just getting started": no score, because
 * two days can't honestly say how a relationship is going.
 *
 * Each factor carries `tone` (which friendly sentence fits the number) and the
 * ids of the records it was computed from, so every claim can be traced back.
 *
 * @module services/trust-systems/together-health
 */

import {
  DAY_MS,
  conversationDays,
  mean,
  signalsAsOf,
  within,
  type LocalClock,
  type TogetherSignals,
} from './together-signals.js';

export type FactorId = 'rhythm' | 'promises' | 'lift' | 'mood';
export type FactorTone = 'high' | 'mid' | 'low' | 'quiet' | 'up' | 'steady' | 'down';
export type Trend = 'improving' | 'stable' | 'declining';
export type Stage = 'new' | 'building' | 'established' | 'deep' | 'flourishing';

export interface TogetherFactor {
  id: FactorId;
  tone: FactorTone;
  score: number; // 0-100
  /** Against two weeks ago; null when there was nothing to compare with then. */
  trend: Trend | null;
  /** The numbers the sentence quotes. */
  detail: Record<string, number>;
  /** Ids of the snapshots / promises this factor was computed from. */
  evidence: string[];
}

export interface TogetherHealth {
  state: 'none' | 'getting-started' | 'ready';
  score: number | null;
  stage: Stage | null;
  trend: Trend | null;
  /** Distinct days we've ever talked. */
  daysTalked: number;
  factors: TogetherFactor[];
}

/** Days together before a score means anything. */
export const MIN_DAYS_FOR_SCORE = 3;
const LOOKBACK_DAYS = 30;
const TREND_DAYS = 14;
const MOOD_SHIFT = 0.15;

function band(score: number, high: number, mid: number): FactorTone {
  return score >= high ? 'high' : score >= mid ? 'mid' : 'low';
}

function rhythm(s: TogetherSignals, now: Date, clock: LocalClock): TogetherFactor | null {
  if (s.snapshots.length === 0) return null;
  const days = conversationDays(
    s.snapshots,
    clock,
    new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS),
    now
  );
  // About three days a week is as often as anyone needs to talk.
  const score = Math.min(100, Math.round((days.length / 12) * 100));
  return {
    id: 'rhythm',
    tone: days.length === 0 ? 'quiet' : band(score, 70, 35),
    score,
    trend: null,
    detail: { days: days.length },
    evidence: days.map((d) => d.snapshots[0].id),
  };
}

function promises(s: TogetherSignals): TogetherFactor | null {
  // Only promises with a known outcome count; an open one is not a broken one.
  const resolved = s.promises.filter((p) => p.fulfilled || p.violated);
  if (resolved.length === 0) return null;
  const kept = resolved.filter((p) => p.fulfilled && !p.violated).length;
  const score = Math.round((kept / resolved.length) * 100);
  return {
    id: 'promises',
    tone: band(score, 80, 50),
    score,
    trend: null,
    detail: { kept, total: resolved.length },
    evidence: resolved.map((p) => p.id),
  };
}

function lift(s: TogetherSignals, now: Date, clock: LocalClock): TogetherFactor | null {
  const from = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);
  const days = conversationDays(s.snapshots, clock, from, now).filter(
    (d) => d.snapshots.length >= 2
  );
  if (days.length < 2) return null;
  let lifted = 0;
  let steady = 0;
  for (const d of days) {
    const delta = d.snapshots[d.snapshots.length - 1].valence - d.snapshots[0].valence;
    if (delta > 0.1) lifted++;
    else if (delta >= -0.1) steady++;
  }
  const score = Math.round((100 * (lifted + steady / 2)) / days.length);
  return {
    id: 'lift',
    tone: band(score, 60, 40),
    score,
    trend: null,
    detail: { lifted, days: days.length },
    evidence: days.flatMap((d) => [d.snapshots[0].id, d.snapshots[d.snapshots.length - 1].id]),
  };
}

function mood(s: TogetherSignals, now: Date): TogetherFactor | null {
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const recent = s.snapshots.filter((x) => within(x.timestamp, weekAgo, now));
  const before = s.snapshots.filter((x) =>
    within(
      x.timestamp,
      new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS),
      new Date(weekAgo.getTime() - 1)
    )
  );
  if (recent.length < 3 || before.length < 3) return null;
  const recentMean = mean(recent.map((x) => x.valence)) as number;
  const shift = recentMean - (mean(before.map((x) => x.valence)) as number);
  const tone: FactorTone = shift >= MOOD_SHIFT ? 'up' : shift <= -MOOD_SHIFT ? 'down' : 'steady';
  return {
    id: 'mood',
    tone,
    score: Math.round(((recentMean + 1) / 2) * 100),
    trend: tone === 'up' ? 'improving' : tone === 'down' ? 'declining' : 'stable',
    detail: { shift: Math.round(shift * 100) / 100 },
    evidence: [...recent, ...before].map((x) => x.id),
  };
}

function trendOf(now: number, then: number | undefined): Trend | null {
  if (then === undefined) return null;
  return now - then >= 5 ? 'improving' : now - then <= -5 ? 'declining' : 'stable';
}

function stageFor(score: number): Stage {
  if (score <= 20) return 'new';
  if (score <= 45) return 'building';
  if (score <= 65) return 'established';
  if (score <= 85) return 'deep';
  return 'flourishing';
}

function factorsAt(s: TogetherSignals, now: Date, clock: LocalClock): TogetherFactor[] {
  return [rhythm(s, now, clock), promises(s), lift(s, now, clock), mood(s, now)].filter(
    (f): f is TogetherFactor => f !== null
  );
}

function allDays(s: TogetherSignals, now: Date, clock: LocalClock): number {
  return conversationDays(s.snapshots, clock, new Date(0), now).length;
}

/** How we're doing together, as of `now`, from real signals only. */
export function computeTogetherHealth(
  signals: TogetherSignals,
  now: Date,
  clock: LocalClock
): TogetherHealth {
  const daysTalked = allDays(signals, now, clock);
  const empty = { score: null, stage: null, trend: null, factors: [], daysTalked };
  if (daysTalked === 0 && !signals.promises.some((p) => p.fulfilled || p.violated)) {
    return { state: 'none', ...empty };
  }
  if (daysTalked < MIN_DAYS_FOR_SCORE) return { state: 'getting-started', ...empty };

  const factors = factorsAt(signals, now, clock);
  const score = Math.round(mean(factors.map((f) => f.score)) as number);

  // The same read as it stood two weeks ago, for honest trends.
  const thenAt = new Date(now.getTime() - TREND_DAYS * DAY_MS);
  const thenSignals = signalsAsOf(signals, thenAt);
  const thenReady = allDays(thenSignals, thenAt, clock) >= MIN_DAYS_FOR_SCORE;
  const then = thenReady ? factorsAt(thenSignals, thenAt, clock) : [];
  const thenScore =
    then.length > 0 ? Math.round(mean(then.map((f) => f.score)) as number) : undefined;

  return {
    state: 'ready',
    score,
    stage: stageFor(score),
    trend: trendOf(score, thenScore),
    daysTalked,
    factors: factors.map((f) =>
      f.id === 'mood'
        ? f
        : { ...f, trend: trendOf(f.score, then.find((t) => t.id === f.id)?.score) }
    ),
  };
}
