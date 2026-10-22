/**
 * POST /api/outreach/milestone: celebrate a milestone by email/SMS, once, and only when it's real.
 *
 * The web app kept milestone state in localStorage only and sent its own
 * numbers (daysTogether, streak). A cleared browser, a second device or a
 * reinstall re-sent the same celebration, and the numbers in it were whatever
 * the client said. Now the server checks the milestone against the user's
 * stored sessions, writes its own numbers, and claims
 * bogle_users/{uid}/milestone_outreach/{milestoneId} with create() so each
 * milestone goes out at most once per user, across devices and retries.
 *
 * @module api/milestone-outreach-route
 */
import type { ServerResponse } from 'http';
import {
  currentDayStreak,
  getSessionsTogether,
  type SessionsTogether,
} from '../services/stores/sessions-together.js';
import { getFirestoreDb } from '../utils/firestore-utils.js';
import { getLogger } from '../utils/safe-logger.js';
import { sendJsonResponse } from './helpers.js';

const log = getLogger().child({ module: 'milestone-outreach-route' });

type Facts = SessionsTogether & { streak: number };

/** What each milestone needs, measured on the server, and the line that states it. */
const MILESTONES: Record<string, { reached: (f: Facts) => boolean; fact: (f: Facts) => string }> = {
  'first-hello': { reached: (f) => f.count >= 1, fact: () => '' },
  'week-together': byDays(7),
  'month-of-growth': byDays(30),
  'three-month': byDays(90),
  'six-month': byDays(180),
  'one-year': byDays(365),
  'streak-7': byStreak(7),
  'streak-30': byStreak(30),
  'fifty-talks': byCount(50),
  'hundred-conversations': byCount(100),
};

function byDays(n: number) {
  return {
    reached: (f: Facts) => f.days.length >= n,
    fact: (f: Facts) => `We've talked on ${f.days.length} different days now.`,
  };
}
function byStreak(n: number) {
  return {
    reached: (f: Facts) => f.streak >= n,
    fact: (f: Facts) => `That's ${f.streak} days in a row.`,
  };
}
function byCount(n: number) {
  return {
    reached: (f: Facts) => f.count >= n,
    fact: (f: Facts) => `That's ${f.count} conversations together.`,
  };
}

/** Plain text from the client (it is shown back to the same user), bounded. */
function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export interface MilestoneOutreachDeps {
  getContactInfo: (
    userId: string
  ) => Promise<
    { email?: string; phone?: string; preferredMethod?: string; timezone?: string } | undefined
  >;
  emailUser: (userId: string, subject: string, body: string) => Promise<{ success: boolean }>;
  textUser: (userId: string, body: string) => Promise<{ success: boolean }>;
}

async function defaultDeps(): Promise<MilestoneOutreachDeps> {
  const { emailUser, textUser, getUserContactInfo } =
    await import('../tools/domains/proactive/outreach/index.js');
  return { emailUser, textUser, getContactInfo: getUserContactInfo };
}

function claimRef(userId: string, milestoneId: string) {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore unavailable');
  return db.collection('bogle_users').doc(userId).collection('milestone_outreach').doc(milestoneId);
}

/**
 * A claim moves pending (create) -> sending (just before the send) -> sent (sentAt).
 * Only a claim still 'pending' 15 minutes later is taken over: nothing went out for it.
 * 'sending' that old may or may not have gone out, so it is logged for review and never
 * re-sent; a claim with no state (or any other) counts as sent. Never double-send.
 */
export const STALE_CLAIM_MS = 15 * 60 * 1000;

const asMs = (v: unknown): number =>
  ((v as { toDate?: () => Date })?.toDate?.() ?? new Date(v as string)).getTime();

/** Claim the milestone for this user, as 'pending'. False when it can't be claimed now. */
async function claim(userId: string, milestoneId: string): Promise<boolean> {
  const ref = claimRef(userId, milestoneId);
  try {
    await ref.create({ milestoneId, state: 'pending', claimedAt: new Date() });
    return true;
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code !== 6 && code !== 'already-exists' && code !== 'ALREADY_EXISTS') throw error;
  }
  const snap = await ref.get();
  const data = snap.data() ?? {};
  const stale = Date.now() - asMs(data.claimedAt) >= STALE_CLAIM_MS;
  if (data.state === 'sending' && stale) {
    log.error({ userId, milestoneId }, 'Milestone outreach stuck in sending: needs review');
  }
  if (data.state !== 'pending' || !stale) return false;
  // Only if nobody touched it since we read it (two retries racing take it once)
  try {
    await ref.update({ claimedAt: new Date() }, { lastUpdateTime: snap.updateTime });
    return true;
  } catch {
    return false; // the other retry took it
  }
}

/** Record that it went out. One retry; if both fail it stays 'sending' (never re-sent). */
async function markSent(userId: string, milestoneId: string): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await claimRef(userId, milestoneId).update({ state: 'sent', sentAt: new Date() });
      return;
    } catch (error) {
      if (attempt === 2) {
        log.error(
          { error: String(error), userId, milestoneId },
          'Milestone sent but not marked: left as sending, so it is not sent again'
        );
      }
    }
  }
}

export async function sendMilestoneOutreach(
  res: ServerResponse,
  userId: string,
  body: unknown,
  deps?: MilestoneOutreachDeps
): Promise<void> {
  const input = (body ?? {}) as Record<string, unknown>;
  const milestoneId = clean(input.milestoneId, 64);
  const milestoneName = clean(input.milestoneName, 120);
  const milestoneMessage = clean(input.milestoneMessage, 600);
  // daysTogether / streak from the client are ignored: the server counts for itself
  const rule = MILESTONES[milestoneId];
  if (!rule || !milestoneName || !milestoneMessage) {
    sendJsonResponse(res, 400, {
      success: false,
      error: 'A known milestoneId, milestoneName and milestoneMessage are required',
    });
    return;
  }

  try {
    const { getContactInfo, emailUser, textUser } = deps ?? (await defaultDeps());
    const contactInfo = await getContactInfo(userId);
    if (!contactInfo?.email && !contactInfo?.phone) {
      sendJsonResponse(res, 200, { success: true, sent: false, reason: 'no-contact-info' });
      return;
    }

    // The app fires a milestone when the call that crosses it connects, before it has ended,
    // so the live call counts here (only here): without it the milestone read as n-1 forever
    const sessions = await getSessionsTogether(userId, contactInfo.timezone, { fresh: true });
    const days = [...new Set([...sessions.days, ...sessions.inProgress.days])].sort();
    const facts: Facts = {
      ...sessions,
      count: sessions.count + sessions.inProgress.count,
      days,
      streak: currentDayStreak(days, new Date(), contactInfo.timezone),
    };
    if (!rule.reached(facts)) {
      sendJsonResponse(res, 200, { success: true, sent: false, reason: 'not-reached' });
      return;
    }
    if (!(await claim(userId, milestoneId))) {
      sendJsonResponse(res, 200, { success: true, sent: false, reason: 'already-sent' });
      return;
    }

    // From here it may go out: 'sending' is never taken over, so it is never sent twice
    await claimRef(userId, milestoneId).update({ state: 'sending', sendingAt: new Date() });
    const fact = rule.fact(facts);
    const results: { email?: boolean; sms?: boolean } = {};
    if (contactInfo.email) {
      const emailBody = [
        milestoneMessage,
        fact,
        "I don't take these moments for granted. Thank you for trusting me with your thoughts.",
        "Here's to many more.",
      ]
        .filter(Boolean)
        .join('\n\n');
      results.email = (await emailUser(userId, milestoneName, emailBody)).success;
    }
    if (contactInfo.phone && contactInfo.preferredMethod !== 'email') {
      const smsBody = [`${milestoneName}: ${milestoneMessage}`, fact] // textUser signs it
        .filter(Boolean)
        .join(' ');
      results.sms = (await textUser(userId, smsBody)).success;
    }

    // Nothing went out (both providers said no): release it so a later try can celebrate it
    if (!results.email && !results.sms) await claimRef(userId, milestoneId).delete();
    else await markSent(userId, milestoneId);

    log.info({ userId, milestoneId, results }, 'Milestone outreach sent');
    sendJsonResponse(res, 200, { success: true, sent: !!(results.email || results.sms), results });
  } catch (error) {
    log.error({ error: String(error), userId, milestoneId }, 'Milestone outreach failed');
    sendJsonResponse(res, 500, { success: false, error: 'Could not send milestone outreach' });
  }
}
