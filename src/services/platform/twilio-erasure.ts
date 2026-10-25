/**
 * Account erasure for what Twilio keeps about the person (TWILIO_ERASE_ON_DELETE, off by
 * default): the texts and calls between their verified phones (erasure-keys.ts) and
 * Ferni's numbers, with each text's media and each call's recordings and transcriptions.
 *
 * Never part of the account delete's success: erasure queues
 * pending_twilio_erasures/{hmac(phone)} = { encrypted phone, createdAt, attempts,
 * nextAttemptAt } before Firestore is erased, starts a run in the background once it
 * has been, and the retry-pending-revocations job (every 15 min) retries what is left,
 * with backoff. A doc goes only once a run finds nothing left to delete (one whose phone
 * won't decrypt is kept and logged as TWILIO_ERASURE_UNDECRYPTABLE). Logs counts only,
 * never a number.
 *
 * Only a record whose to and from are exactly the person's phone and a Ferni number is
 * deleted, checked on every record, not just in the list filter.
 *
 * @module services/platform/twilio-erasure
 */

import { createHmac } from 'node:crypto';
import { flagOn } from '../../config/env-flag.js';
import { decryptData, encryptData } from '../../utils/token-encryption.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  KINDS,
  erasePhone,
  status,
  type Counts,
  type Deps,
  type Kind,
  type TwilioEraseClient,
  type TwilioErasureDeps,
} from './twilio-erasure-records.js';

const log = createLogger({ module: 'twilio-erasure' });

type Db = FirebaseFirestore.Firestore;
export const PENDING_TWILIO_ERASURES = 'pending_twilio_erasures';
const MINUTE = 60_000;
/** The background run goes first; the job only retries after this */
const FIRST_RETRY_MS = 15 * MINUTE;
const MAX_RETRY_MS = 6 * 60 * MINUTE;
const OVERDUE_MS = 7 * 24 * 60 * MINUTE;
const BATCH = 50;

export type { Counts, TwilioEraseClient, TwilioErasureDeps } from './twilio-erasure-records.js';

export const pendingId = (phone: string, env = process.env): string =>
  createHmac('sha256', env.LOG_HASH_SECRET ?? '')
    .update(`twilio-erasure:${phone}`)
    .digest('hex')
    .slice(0, 32);

/** Queue the phones before the records they are read from are erased. Returns the doc ids */
export async function queueTwilioErasure(
  db: Db,
  phones: readonly string[],
  now = Date.now()
): Promise<string[]> {
  const col = db.collection(PENDING_TWILIO_ERASURES);
  const doc = { createdAt: now, attempts: 0, nextAttemptAt: now + FIRST_RETRY_MS };
  const ids = phones.map((phone) => pendingId(phone));
  await Promise.all(
    phones.map(async (phone, i) =>
      col.doc(ids[i] ?? '').set({ ...doc, encrypted: encryptData({ phone }) })
    )
  );
  return ids;
}

export interface TwilioErasureReport extends Counts {
  due: number;
  done: number;
  retrying: number;
  /** Kept: the phone couldn't be decrypted (TWILIO_ERASURE_UNDECRYPTABLE) */
  undecryptable: number;
}

type Doc = FirebaseFirestore.DocumentSnapshot;

/** One pending doc: gone once nothing is left, else backed off */
async function settle(
  doc: Doc,
  deps: Deps | null,
  report: TwilioErasureReport,
  now: number
): Promise<void> {
  report.due++;
  const data = doc.data() ?? {};
  const phone = decryptData<{ phone?: string }>(String(data.encrypted ?? ''))?.phone;
  // Undecryptable (a rotated or missing key): kept and backed off like any failure, never dropped
  if (!phone) report.undecryptable++;
  let complete = false;
  try {
    complete = !!phone && deps !== null && (await erasePhone(phone, deps, report));
  } catch (error) {
    log.warn({ error: status(error) ?? (error as Error)?.name }, 'Twilio erasure run failed');
  }
  if (complete) {
    report.done++;
    await doc.ref.delete();
    return;
  }
  report.retrying++;
  const attempts = (typeof data.attempts === 'number' ? data.attempts : 0) + 1;
  const backoff = Math.min(FIRST_RETRY_MS * 2 ** (attempts - 1), MAX_RETRY_MS);
  await doc.ref.update({ attempts, nextAttemptAt: now + backoff });
  // A doc with no createdAt can't be shown to be recent, so it counts as overdue
  const createdAt = typeof data.createdAt === 'number' ? data.createdAt : 0;
  if (now - createdAt > OVERDUE_MS) log.error({ attempts }, 'TWILIO_ERASURE_OVERDUE');
}

/**
 * Erase the due pending docs (or, given ids, those docs whatever their schedule). Never
 * throws for a Twilio failure: the doc is kept and backed off.
 */
export async function retryPendingTwilioErasures(
  db: Db,
  opts: { ids?: readonly string[]; now?: number; deps?: TwilioErasureDeps } = {}
): Promise<TwilioErasureReport> {
  const now = opts.now ?? Date.now();
  const zero = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number>;
  const report: TwilioErasureReport = {
    due: 0,
    done: 0,
    retrying: 0,
    undecryptable: 0,
    failed: 0,
    ...zero,
  };
  if (!flagOn('TWILIO_ERASE_ON_DELETE')) return report;
  const col = db.collection(PENDING_TWILIO_ERASURES);
  const docs = opts.ids
    ? (await Promise.all(opts.ids.map(async (id) => col.doc(id).get()))).filter((d) => d.exists)
    : (await col.where('nextAttemptAt', '<=', now).limit(BATCH).get()).docs;
  if (docs.length === 0) return report;
  const { client, ferniNumbers, sleep } = opts.deps ?? (await defaultTwilioErasureDeps());
  const deps =
    client && ferniNumbers.length > 0
      ? { client, ferniNumbers, sleep: sleep ?? defaultSleep }
      : null;
  if (!deps) log.warn('Twilio erasure waiting: Twilio or a Ferni number is not configured');
  for (const doc of docs) {
    await settle(doc, deps, report, now); // eslint-disable-line no-await-in-loop -- one phone at a time
  }
  if (report.undecryptable > 0)
    log.error({ undecryptable: report.undecryptable }, 'TWILIO_ERASURE_UNDECRYPTABLE');
  log.info({ ...report }, 'Twilio records erased');
  return report;
}

/** After the Firestore erasure: a run in the background that never throws (the job retries) */
export async function startTwilioErasure(
  db: Db,
  ids: readonly string[],
  deps?: TwilioErasureDeps
): Promise<void> {
  try {
    await retryPendingTwilioErasures(db, { ids, deps });
  } catch (error) {
    log.warn({ error: (error as Error)?.name }, 'Twilio erasure not started');
  }
}

const defaultSleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** The live client (twilio-sms.ts) and Ferni's numbers, from the environment */
export async function defaultTwilioErasureDeps(env = process.env): Promise<TwilioErasureDeps> {
  const { getTwilioClient } = await import('../external-apis/twilio-sms.js');
  const client: TwilioEraseClient | null = await getTwilioClient();
  const numbers = [env.TWILIO_PHONE_NUMBER, env.TWILIO_CONCIERGE_NUMBER];
  const ferniNumbers = [...new Set(numbers.filter((n): n is string => !!n))];
  return { client, ferniNumbers };
}
