#!/usr/bin/env tsx
/**
 * Outreach dry run: the check-ins Ferni would send one consenting caller
 * between calls over the next 7 days, each judged by Gemini (and later, on a
 * sample, a local model: the GPU is shared). Three arms:
 *
 * - live: the daily outreach run as deployed (automated-scheduler.ts, 09:00
 *   Los Angeles). Its text is what production sends: john-bogle-ui has no
 *   GOOGLE_API_KEY, so llm-content-generator falls back to one fixed line.
 * - pondering-ungated: the pondering pass's follow-ups in that same daily
 *   slot, with no grounding, timing or voice rules.
 * - grounded: the same follow-ups through grounded-checkin.ts (sent live as
 *   in-app notes behind OUTREACH_PONDERED_NOTES), with the caller's own lines.
 *
 * --replay adds past days (as if it were that evening); --passes re-runs the
 * sampled pondering pass per day. Assumes no new calls in the week. READ ONLY,
 * and only for a uid listed in MEMORY_EVAL_ALLOWED_UIDS (set outside the repo;
 * ../lib/allowed-uid.mjs): other uids are refused, Firestore writes throw,
 * nothing is sent.
 *
 *   pnpm tsx scripts/outreach-dryrun/dry-run.ts --uid <uid> [--now ISO] [--replay 2026-01-12,...]
 *     [--passes 1] [--out f.json]
 *   pnpm tsx scripts/outreach-dryrun/dry-run.ts --rejudge-local f.json [--per-arm 4]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { DocumentReference } from 'firebase-admin/firestore';
import type { PonderSummary } from '../../src/intelligence/pondering/pondering.js';
import { assertAllowedUid } from '../lib/allowed-uid.mjs';
import type { JudgeInput, Scores } from './judge.js';

// Everything below loads in loadModules(), after the allowlist check: some of these
// modules log their config as they load, and a refused run prints only the refusal.
let getApps: (typeof import('firebase-admin/app'))['getApps'];
let initializeApp: (typeof import('firebase-admin/app'))['initializeApp'];
let fs: typeof import('firebase-admin/firestore');
let callLLM: (typeof import('../../src/services/llm-utils.js'))['callLLM'];
let ponder: (typeof import('../../src/intelligence/pondering/pondering.js'))['ponder'];
let ponderUserMod: typeof import('../../src/intelligence/pondering/ponder-user.js');
let cadence: typeof import('../../src/services/outreach/outreach-cadence.js');
let generatePersonalizedContent: (typeof import('../../src/services/outreach/llm-content-generator.js'))['generatePersonalizedContent'];
let grounded: typeof import('../../src/services/outreach/grounded-checkin.js');
let pondered: typeof import('../../src/services/outreach/proactive-channels/pondered-triggers.js');
let judge: typeof import('./judge.js');
let getAdminFirestore: (typeof import('../../src/utils/firebase-admin-app.js'))['getAdminFirestore'];

async function loadModules(): Promise<void> {
  ({ getApps, initializeApp } = await import('firebase-admin/app'));
  fs = await import('firebase-admin/firestore');
  ({ callLLM } = await import('../../src/services/llm-utils.js'));
  ({ ponder } = await import('../../src/intelligence/pondering/pondering.js'));
  ponderUserMod = await import('../../src/intelligence/pondering/ponder-user.js');
  cadence = await import('../../src/services/outreach/outreach-cadence.js');
  ({ generatePersonalizedContent } =
    await import('../../src/services/outreach/llm-content-generator.js'));
  grounded = await import('../../src/services/outreach/grounded-checkin.js');
  pondered = await import('../../src/services/outreach/proactive-channels/pondered-triggers.js');
  judge = await import('./judge.js');
  ({ getAdminFirestore } = await import('../../src/utils/firebase-admin-app.js'));
}

const DAY = 86_400_000;
const LA = 'America/Los_Angeles';
const ARMS = ['live', 'pondering-ungated', 'grounded'] as const;

export interface DryItem {
  arm: (typeof ARMS)[number];
  /** "now", or the replayed day. */
  window: string;
  sendAt: string;
  sendLocal: string;
  channel: 'in_app';
  text: string;
  quote?: string;
  callDate?: string;
  eventDate?: string;
  judge?: JudgeInput;
  gemini?: Scores;
  local?: Scores;
}

function blockWrites(): void {
  const refuse = (): never => {
    throw new Error('outreach dry run: Firestore writes are blocked');
  };
  const protos = [fs.DocumentReference, fs.CollectionReference, fs.WriteBatch].map(
    (c) => c.prototype as unknown as Record<string, unknown>
  );
  for (const p of protos)
    for (const m of ['set', 'update', 'delete', 'create', 'add', 'commit']) p[m] = refuse;
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dayIn = (at: number, tz: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(at);
const fmt = (at: number, tz: string): string =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(at);
/** The daily-outreach scheduler slot, 09:00 Los Angeles, `n` days after `now`. */
const dailySlot = (now: Date, n: number): Date =>
  grounded.atLocal(dayIn(now.getTime() + n * DAY, LA), 9, LA);

/** The live daily run over the week: which days it picks the caller, which type, which text. */
async function liveArm(user: Record<string, unknown>, now: Date): Promise<DryItem[]> {
  delete process.env.GOOGLE_API_KEY; // as on john-bogle-ui
  delete process.env.GEMINI_API_KEY;
  let seed = 20261011;
  const coin = (): number => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const state = { ...user };
  const items: DryItem[] = [];
  for (let n = 1; n <= 7; n++) {
    const at = dailySlot(now, n).getTime();
    const level = cadence.engagementLevel(state, at);
    if (cadence.cadenceHold(state, level, at)) continue;
    const pick = { high: coin() < 0.3, medium: true, low: true, silent: true }[level];
    if (!pick) continue;
    const type = (
      {
        high: 'thinking_of_you',
        medium: 'momentum_check',
        low: 'reengagement_gentle',
        silent: 'reengagement_warmth',
      } as const
    )[level];
    const ctx = {
      userId: 'dry-run',
      daysSinceSignup: 280,
      conversationCount: 0,
      engagementLevel: level,
    };
    // eslint-disable-next-line no-await-in-loop
    const { text } = await generatePersonalizedContent(ctx, type, 'in_app');
    items.push({
      arm: 'live',
      window: 'now',
      sendAt: new Date(at).toISOString(),
      sendLocal: '',
      channel: 'in_app',
      text,
    });
    state.lastOutreachDate = new Date(at).toISOString();
    state.outreachUnanswered = cadence.unansweredCount(state) + 1;
  }
  return items;
}

interface Window {
  ref: DocumentReference;
  tz: string;
  name?: string;
  now: Date;
  lastTalked: number;
  window: string;
}

/** One day: ponder the summaries before `now` (`passes` times), then both pondering arms. */
async function ponderedArms(w: Window, summaries: PonderSummary[], passes: number) {
  const seen = new Map<string, { id: string; text: string; when?: string; basis: string }>();
  for (let i = 0; i < passes; i++) {
    // eslint-disable-next-line no-await-in-loop
    const p = await ponder(summaries, w.now.toISOString().slice(0, 10), (prompt) =>
      callLLM(prompt, { maxTokens: 1500, temperature: 0.4 })
    );
    for (const f of p.followUps) seen.set(f.text, { ...f, id: pondered.itemId(f.basis, f.text) });
  }
  const followUps = [...seen.values()];
  const calls = await pondered.loadSourceCalls(
    w.ref,
    followUps.map((f) => f.basis),
    w.tz
  );
  const items: DryItem[] = followUps.map((f, i) => ({
    arm: 'pondering-ungated',
    window: w.window,
    sendAt: dailySlot(w.now, i + 1).toISOString(),
    sendLocal: '',
    channel: 'in_app',
    text: f.text,
    callDate: calls.get(f.basis)?.date,
    eventDate: f.when,
  }));
  const plan = grounded.planCheckIns(followUps, {
    ...w,
    timezone: w.tz,
    lastTalkedAt: w.lastTalked,
    calls,
    sent: [],
  });
  for (const p of plan.planned) {
    const { message: text, quote, callDate, when: eventDate } = p;
    items.push({
      arm: 'grounded',
      window: w.window,
      sendAt: p.sendAt.toISOString(),
      sendLocal: '',
      channel: 'in_app',
      text,
      quote,
      callDate,
      eventDate,
    });
  }
  // The judge sees what the caller actually said on the cited call, not the summary's paraphrase.
  const linesOf = (text: string) => {
    const basis = followUps.find((f) => text.toLowerCase().endsWith(f.text.toLowerCase()))?.basis;
    return (basis ? (calls.get(basis)?.userLines ?? []) : [])
      .slice(0, 15)
      .map((l) => l.slice(0, 160));
  };
  const dropped = plan.dropped.map((d) => ({ ...d, window: w.window }));
  return { items, linesOf, dropped, followUps };
}

const scoresOf = (items: DryItem[]) =>
  Object.fromEntries(
    ARMS.map((a) => {
      const arm = items.filter((i) => i.arm === a);
      return [
        a,
        {
          gemini: judge.means(arm.map((i) => i.gemini)),
          local: judge.means(arm.map((i) => i.local)),
        },
      ];
    })
  );

/** The local judge on a sample of an earlier report, once the GPU is free. */
async function rejudgeLocal(file: string, perArm: number): Promise<void> {
  const report = JSON.parse(readFileSync(file, 'utf8')) as { items: DryItem[]; scores: unknown };
  for (const a of ARMS) {
    for (const it of report.items.filter((i) => i.arm === a && i.judge).slice(0, perArm)) {
      // eslint-disable-next-line no-await-in-loop
      it.local = await judge.judgeLocal(it.judge as JudgeInput).catch(() => undefined);
    }
  }
  report.scores = scoresOf(report.items);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.scores, null, 2));
}

async function main(): Promise<void> {
  const rejudge = arg('rejudge-local');
  if (rejudge) {
    await loadModules();
    return rejudgeLocal(rejudge, Number(arg('per-arm') ?? 4));
  }
  const uid = assertAllowedUid(arg('uid'));
  await loadModules();
  const now = new Date(arg('now') ?? Date.now());
  const passes = Number(arg('passes') ?? 1);
  const out = arg('out') ?? 'outreach-dryrun.json';

  if (getApps().length === 0) initializeApp({ projectId: 'johnb-2025' });
  blockWrites();
  const ref = getAdminFirestore().collection('bogle_users').doc(uid);
  const user = (await ref.get()).data() ?? {};
  const tz = (user.contactInfo as { timezone?: string } | undefined)?.timezone ?? LA;
  const name = pondered.firstName(user);
  const before = async (at: Date): Promise<PonderSummary[]> => {
    const snap = await ref
      .collection('summaries')
      .where('timestamp', '<=', at.toISOString())
      .orderBy('timestamp', 'desc')
      .limit(ponderUserMod.SUMMARIES_READ)
      .get();
    return snap.docs.map((d) => ponderUserMod.toPonderSummary(d.id, d.data()));
  };
  const lastTalked = cadence.lastTalkedAt(user) ?? now.getTime();
  const windows: Window[] = [{ ref, tz, name, now, lastTalked, window: 'now' }];
  for (const day of (arg('replay') ?? '').split(',').filter(Boolean)) {
    // As if it were 23:00 that day, their time, after the day's calls.
    const at = grounded.atLocal(day, 23, tz);
    windows.push({ ref, tz, name, now: at, lastTalked: at.getTime() - 3_600_000, window: day });
  }

  const items: DryItem[] = [];
  const dropped: unknown[] = [];
  const ponderings: Record<string, unknown> = {};
  for (const w of windows) {
    const summaries = await before(w.now);
    const arms = await ponderedArms(w, summaries, passes);
    const mine = [...(w.window === 'now' ? await liveArm(user, now) : []), ...arms.items];
    for (const it of mine) {
      it.sendLocal = fmt(Date.parse(it.sendAt), tz);
      it.judge = {
        ...it,
        lastTalkedLocal: fmt(w.lastTalked, tz),
        quoteDate: it.callDate,
        callerLines: arms.linesOf(it.text),
        recentCalls: summaries.slice(0, 5).map((s) => `${s.date}: ${s.topics.join('; ')}`),
      };
      it.gemini = await judge.judgeGemini(it.judge);
    }
    items.push(...mine);
    dropped.push(...arms.dropped);
    ponderings[w.window] = arms.followUps;
  }
  const report = {
    generatedAt: new Date().toISOString(),
    now,
    timezone: tz,
    lastTalked: new Date(lastTalked),
    windows: windows.map((w) => w.window),
    ponderings,
    dropped,
    items,
    scores: scoresOf(items),
  };
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.scores, null, 2));
  console.log(`Dry run, nothing sent or written. Report: ${out}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  // Imported clients hold the event loop open, so exitCode alone never exits.
  process.exit(1);
});
