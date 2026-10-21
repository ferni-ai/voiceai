/**
 * Account erasure for what Twilio keeps about the person (TWILIO_ERASE_ON_DELETE, off by
 * default): the texts and calls between their verified phones (erasure-keys.ts) and
 * Ferni's numbers, with each text's media and each call's recordings and transcriptions.
 *
 * Never part of the account delete's success: erasure queues
 * pending_twilio_erasures/{hmac(phone)} = { encrypted phone, createdAt, attempts,
 * nextAttemptAt } before Firestore is erased, starts a run in the background once it
 * has been, and the retry-pending-revocations job (every 15 min) retries what is left,
 * with backoff. A doc goes once a run finds nothing left to delete. Logs counts only,
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

const log = createLogger({ module: 'twilio-erasure' });

type Db = FirebaseFirestore.Firestore;
export const PENDING_TWILIO_ERASURES = 'pending_twilio_erasures';
const MINUTE = 60_000;
/** The background run goes first; the job only retries after this */
const FIRST_RETRY_MS = 15 * MINUTE;
const MAX_RETRY_MS = 6 * 60 * MINUTE;
const OVERDUE_MS = 7 * 24 * 60 * MINUTE;
const PAGE_SIZE = 1000;
/** Pages read per list in one run; the rest is reached by the next run */
const MAX_PAGES = 20;
/** Deletes in flight at once, well under Twilio's per-account concurrency limit */
const CONCURRENCY = 5;
const RATE_LIMIT_TRIES = 4;
const BATCH = 50;

interface Page<T> {
  instances: T[];
  nextPage: () => Promise<Page<T>> | undefined;
}
interface Removable {
  remove: () => Promise<boolean>;
}
interface Sid {
  sid: string;
}
interface Leg extends Sid {
  to: string;
  from: string;
}
type PageOf<T, O = object> = (opts: O & { pageSize: number }) => Promise<Page<T>>;
type Legs = PageOf<Leg, { to: string; from: string }>;

/** The part of the twilio client this uses (the real one fits it) */
export interface TwilioEraseClient {
  messages: ((sid: string) => Removable & {
    media: ((sid: string) => Removable) & { page: PageOf<Sid> };
  }) & { page: Legs };
  calls: ((sid: string) => Removable) & { page: Legs };
  recordings: ((sid: string) => Removable & {
    transcriptions: ((sid: string) => Removable) & { page: PageOf<Sid> };
  }) & { page: PageOf<Sid & { callSid: string }, { callSid: string }> };
}

export interface TwilioErasureDeps {
  client: TwilioEraseClient | null;
  ferniNumbers: string[];
  sleep?: (ms: number) => Promise<void>;
}

const KINDS = ['messages', 'media', 'calls', 'recordings', 'transcriptions'] as const;
type Kind = (typeof KINDS)[number];
export type Counts = Record<Kind | 'failed', number>;

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

const status = (error: unknown): number | undefined => {
  const s = (error as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : undefined;
};

/** Retries a 429 with backoff; a 404 means already gone */
async function call<T>(
  fn: () => Promise<T>,
  sleep: (ms: number) => Promise<void>
): Promise<T | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(); // eslint-disable-line no-await-in-loop -- a retry waits for the last try
    } catch (error) {
      if (status(error) === 404) return null;
      if (status(error) !== 429 || attempt >= RATE_LIMIT_TRIES) throw error;
      await sleep(1_000 * 2 ** attempt); // eslint-disable-line no-await-in-loop -- backoff
    }
  }
}

async function listAll<T extends Sid>(
  first: () => Promise<Page<T>>,
  sleep: Deps['sleep']
): Promise<T[]> {
  const out: T[] = [];
  let page: Page<T> | null | undefined = await call(first, sleep);
  for (let n = 0; page && n < MAX_PAGES; n++) {
    out.push(...page.instances);
    const next = page.nextPage();
    page = next ? await call(async () => next, sleep) : undefined; // eslint-disable-line no-await-in-loop -- pages in order
  }
  return out;
}

type Deps = Required<TwilioErasureDeps> & { client: TwilioEraseClient };

type Remove = (sid: string) => Promise<unknown>;

/** Remove each, CONCURRENCY at a time; counts what went and what failed */
async function removeAll(
  items: readonly Sid[],
  kind: Kind,
  counts: Counts,
  remove: Remove
): Promise<void> {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY).map(async (item) => remove(item.sid));
    const results = await Promise.allSettled(batch); // eslint-disable-line no-await-in-loop -- bounded concurrency
    for (const r of results) counts[r.status === 'fulfilled' ? kind : 'failed']++;
  }
}

/** A text, after its media */
async function eraseMessage(sid: string, deps: Deps, counts: Counts): Promise<unknown> {
  const msg = deps.client.messages(sid);
  const media = await listAll(async () => msg.media.page({ pageSize: PAGE_SIZE }), deps.sleep);
  await removeAll(media, 'media', counts, async (id) =>
    call(async () => msg.media(id).remove(), deps.sleep)
  );
  return call(async () => msg.remove(), deps.sleep);
}

/** A recording, after its transcriptions */
async function eraseRecording(sid: string, deps: Deps, counts: Counts): Promise<unknown> {
  const rec = deps.client.recordings(sid);
  const page = async (): Promise<Page<Sid>> => rec.transcriptions.page({ pageSize: PAGE_SIZE });
  const remove: Remove = async (id) =>
    call(async () => rec.transcriptions(id).remove(), deps.sleep);
  await removeAll(await listAll(page, deps.sleep), 'transcriptions', counts, remove);
  return call(async () => rec.remove(), deps.sleep);
}

/** A call, after its recordings */
async function eraseCall(callSid: string, deps: Deps, counts: Counts): Promise<unknown> {
  const page = async (): Promise<Page<Sid & { callSid: string }>> =>
    deps.client.recordings.page({ callSid, pageSize: PAGE_SIZE });
  const recordings = (await listAll(page, deps.sleep)).filter((r) => r.callSid === callSid);
  await removeAll(recordings, 'recordings', counts, async (sid) =>
    eraseRecording(sid, deps, counts)
  );
  return call(async () => deps.client.calls(callSid).remove(), deps.sleep);
}

/** One direction of one phone and one Ferni number; returns how many records it found */
async function eraseLeg(to: string, from: string, deps: Deps, counts: Counts): Promise<number> {
  const ours = (r: Leg): boolean => r.to === to && r.from === from;
  const { client, sleep } = deps;
  const [messages, calls] = await Promise.all([
    listAll(async () => client.messages.page({ to, from, pageSize: PAGE_SIZE }), sleep),
    listAll(async () => client.calls.page({ to, from, pageSize: PAGE_SIZE }), sleep),
  ]).then(([m, c]) => [m.filter(ours), c.filter(ours)]);
  await removeAll(messages, 'messages', counts, async (sid) => eraseMessage(sid, deps, counts));
  await removeAll(calls, 'calls', counts, async (sid) => eraseCall(sid, deps, counts));
  return messages.length + calls.length;
}

/**
 * Erase one phone's records with Ferni. True only when a run found nothing left, so a
 * run that deleted anything is checked by the next one before the doc goes.
 */
async function erasePhone(phone: string, deps: Deps, counts: Counts): Promise<boolean> {
  const failedBefore = counts.failed;
  const legs = deps.ferniNumbers.flatMap((ferni) => [
    [phone, ferni],
    [ferni, phone],
  ]);
  let found = 0;
  for (const [to, from] of legs) {
    // eslint-disable-next-line no-await-in-loop -- one leg at a time keeps the request rate low
    if (to && from) found += await eraseLeg(to, from, deps, counts);
  }
  return found === 0 && counts.failed === failedBefore;
}

export interface TwilioErasureReport extends Counts {
  due: number;
  done: number;
  retrying: number;
  dropped: number;
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
  if (!phone) {
    report.dropped++;
    await doc.ref.delete();
    return;
  }
  let complete = false;
  try {
    complete = deps !== null && (await erasePhone(phone, deps, report));
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
  if (now - Number(data.createdAt) > OVERDUE_MS) log.error({ attempts }, 'TWILIO_ERASURE_OVERDUE');
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
    dropped: 0,
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
