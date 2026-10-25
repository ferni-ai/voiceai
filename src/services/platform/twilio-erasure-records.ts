/**
 * Deleting one phone's Twilio records with Ferni (texts and their media, calls and their
 * recordings and transcriptions), for twilio-erasure.ts. Only a record whose to and from
 * are exactly the phone and a Ferni number is deleted, checked on every record.
 *
 * @module services/platform/twilio-erasure-records
 */

const PAGE_SIZE = 1000;
/** Pages read per list in one run; the rest is reached by the next run */
const MAX_PAGES = 20;
/** Deletes in flight at once, well under Twilio's per-account concurrency limit */
const CONCURRENCY = 5;
const RATE_LIMIT_TRIES = 4;

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

export const KINDS = ['messages', 'media', 'calls', 'recordings', 'transcriptions'] as const;
export type Kind = (typeof KINDS)[number];
export type Counts = Record<Kind | 'failed', number>;

export const status = (error: unknown): number | undefined => {
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

export type Deps = Required<TwilioErasureDeps> & { client: TwilioEraseClient };

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
export async function erasePhone(phone: string, deps: Deps, counts: Counts): Promise<boolean> {
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
