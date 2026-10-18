#!/usr/bin/env tsx
/**
 * One-time migration: re-write integration tokens still stored in plaintext as
 * the sealed `{ encrypted }` record the stores now write (utils/token-at-rest).
 * Dry run by default; counts only, never a token, uid or email.
 *
 *   GOOGLE_CLOUD_PROJECT=<project> pnpm tsx scripts/migrations/encrypt-integration-tokens.ts   # dry run
 *   OAUTH_ENCRYPTION_KEY=... LOG_HASH_SECRET=... GOOGLE_CLOUD_PROJECT=<project> \
 *     pnpm tsx scripts/migrations/encrypt-integration-tokens.ts --apply --expect-kid=<kid>
 *
 * --apply always needs --expect-kid, and it must equal the token_at_rest_kid
 * line BOTH the web server and the agent log at boot (check both match first):
 * the agent reads these tokens too, and an envelope that opens here only proves
 * the web's key. As an extra check, if the servers have written envelopes, at
 * least one must open with this run's keys. It refuses otherwise, and with no
 * key at all (encryptData would write plain JSON).
 *
 * Set the env vars the servers have. A re-seal run after OAUTH_ENCRYPTION_KEY
 * is introduced needs BOTH: the new key to seal, LOG_HASH_SECRET to open the
 * legacy envelopes it re-seals (without it they count as unopenable).
 *
 * Per record: plaintext is sealed and its plaintext keys deleted; an
 * `encrypted` string that is not a real envelope (written with no key) is
 * plaintext too; an envelope with plaintext keys beside it keeps the envelope
 * and loses the keys (unless no key opens the envelope: then nothing is touched). Sealed records are skipped, so a re-run writes nothing.
 * Each write is an update() with a lastUpdateTime precondition, so a token
 * refreshed mid-run is not clobbered: that doc (or any doc whose write fails)
 * keeps what it has, is counted under its error code, and a re-run picks it up.
 */
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
} from '@google-cloud/firestore';
import { getFirestoreDb } from '../../src/utils/firestore-utils.js';
import { isEncrypted, openEnvelope } from '../../src/utils/token-encryption.js';
import {
  PLAINTEXT_TOKEN_KEYS,
  openTokens,
  sealTokens,
  tokenKeyId,
  tokenKeyIdLine,
} from '../../src/utils/token-at-rest.js';

/** Root-level docs whose whole body (minus bookkeeping) is the token record. */
export const DOC_COLLECTIONS = [
  'spotify_tokens',
  'oura_tokens',
  'eight_sleep_tokens',
  'ecobee_tokens',
  'apple_calendar_tokens',
] as const;
/**
 * Per-user subcollection docs: bogle_users/{uid}/plaid_tokens/data and
 * bogle_users/{uid}/smart_home/{hue,lifx,sonos} (homekit and _setup_state hold no tokens).
 */
export const DOC_GROUPS = ['plaid_tokens', 'smart_home'] as const;
/** Token maps nested in a subcollection doc: users/{uid}/calendar_providers/outlook.tokens. */
export const NESTED_GROUP_FIELDS = [{ group: 'calendar_providers', field: 'tokens' }] as const;
/** Token maps kept on the profile doc (bogle_users/{uid}.<field>). */
export const PROFILE_FIELDS = ['linkedInTokens', 'biometricTokens'] as const;
/** Already-sealed stores the servers write: evidence for which key they use. */
export const KEY_PROBE_COLLECTIONS = [
  'google_calendar_tokens',
  'spotify_links',
  'gmail_send_tokens',
];

/** Written by the stores beside the tokens; not secret, stays readable. */
const BOOKKEEPING = new Set(['updatedAt', '_updatedAt', '_userId', 'connectedAt']);
/** Fields holding a secret: the OAuth names, plus LIFX `token` and the Hue bridge `username`. */
const TOKEN_KEYS = [...PLAINTEXT_TOKEN_KEYS, 'token', 'username'];

export interface Counts {
  scanned: number;
  sealed: number;
  /** Plaintext tokens, including an `encrypted` string that is not a real envelope. */
  plaintext: number;
  /** A real envelope with plaintext keys left beside it. */
  mixed: number;
  /** An envelope sealed with a key other than this run's (the LOG_HASH_SECRET legacy key): re-sealed. */
  legacy: number;
  /** An envelope no key on the ring opens: left alone, needs a look. */
  unopenable: number;
  written: number;
  failed: number;
  failureCodes: Record<string, number>;
}

export interface RunOptions {
  apply: boolean;
  /** The kid the web server and the agent log at boot; required with apply. */
  expectKid?: string;
}

type Json = Record<string, unknown>;
type Kind = 'sealed' | 'plaintext' | 'mixed' | 'legacy' | 'unopenable' | 'empty';
interface Job {
  counts: Counts;
  ref: DocumentReference;
  updateTime: QueryDocumentSnapshot['updateTime'];
  update: () => Json;
}

const newCounts = (): Counts => ({
  scanned: 0,
  sealed: 0,
  plaintext: 0,
  mixed: 0,
  legacy: 0,
  unopenable: 0,
  written: 0,
  failed: 0,
  failureCodes: {},
});

/** Plaintext secret fields; `enc_` values are already encrypted (services/platform/privacy-crypto). */
const plaintextKeysOf = (record: Json) =>
  TOKEN_KEYS.filter((k) => {
    const v = record[k];
    return typeof v === 'string' && v !== '' && !v.startsWith('enc_');
  });

/** A real AES-GCM envelope, as opposed to the plain JSON encryptData writes with no key. */
const envelopeOf = (record: Json): string | undefined =>
  typeof record.encrypted === 'string' && isEncrypted(record.encrypted)
    ? record.encrypted
    : undefined;

export function classify(record: unknown): Kind {
  if (record === null || typeof record !== 'object') return 'empty';
  const r = record as Json;
  const plain = plaintextKeysOf(r).length > 0;
  const envelope = envelopeOf(r);
  if (envelope !== undefined) {
    const opened = openEnvelope(envelope);
    // An envelope nothing opens may be the only copy: keep its plaintext keys too.
    if (opened === null) return 'unopenable';
    if (plain) return 'mixed';
    return opened.kid === tokenKeyId() ? 'sealed' : 'legacy';
  }
  return plain || typeof r.encrypted === 'string' ? 'plaintext' : 'empty';
}

/** Seal and prove it opens back to the same record before anything is written. */
function sealVerified(tokens: Json) {
  const sealed = sealTokens(tokens);
  if (JSON.stringify(openTokens(sealed, 'migration')) !== JSON.stringify(tokens)) {
    throw new Error('sealed record did not round-trip');
  }
  return sealed;
}

/** The token record to seal: the fields (minus bookkeeping), or a no-key `encrypted` JSON string. */
function tokensOf(record: Json): Json {
  if (typeof record.encrypted === 'string' && envelopeOf(record) === undefined) {
    return JSON.parse(record.encrypted) as Json; // throws on garbage: counted as a failure
  }
  return Object.fromEntries(Object.entries(record).filter(([k]) => !BOOKKEEPING.has(k)));
}

/** Fields to write for a whole-doc token record. */
function docUpdate(record: Json, kind: Kind): Json {
  const deletes = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, FieldValue.delete()]));
  if (kind === 'mixed') return deletes(plaintextKeysOf(record)); // keep the envelope as it is
  if (kind === 'legacy') return { encrypted: resealed(record) };
  const tokens = tokensOf(record);
  // Every plaintext key goes, including ones left beside a no-key `encrypted` string.
  const stale = new Set([...Object.keys(tokens), ...plaintextKeysOf(record)]);
  return { ...deletes([...stale]), ...sealVerified(tokens) };
}

/** A legacy-key envelope opened with the ring and sealed again with this run's key. */
function resealed(record: Json): string {
  const opened = openEnvelope<Json>(envelopeOf(record) ?? '');
  if (opened === null) throw new Error('legacy envelope no longer opens');
  return sealVerified(opened.value).encrypted;
}

/** The replacement map for a profile token field (update() replaces the whole map). */
function fieldValue(record: Json, kind: Kind): Json {
  if (kind === 'mixed') return { encrypted: envelopeOf(record) };
  if (kind === 'legacy') return { encrypted: resealed(record) };
  return { ...sealVerified(tokensOf(record)) };
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return code === undefined ? 'unknown' : String(code);
}

/**
 * Whether the servers' envelopes open with this run's keys: 'none-found' when
 * there are none yet, else 'opens' if at least one does.
 */
async function serverEnvelopes(
  db: Firestore,
  seen: string[]
): Promise<'none-found' | 'opens' | 'none-open'> {
  const found = [...seen];
  for (const name of KEY_PROBE_COLLECTIONS) {
    const snaps = await db.collection(name).where('encrypted', '!=', null).limit(20).get();
    for (const s of snaps.docs) {
      const e = s.data().encrypted;
      if (typeof e === 'string' && isEncrypted(e)) found.push(e);
    }
  }
  if (found.length === 0) return 'none-found';
  return found.some((e) => openEnvelope(e) !== null) ? 'opens' : 'none-open';
}

/** Throws unless --expect-kid names this run's key and the servers' envelopes open (see the header). */
export async function assertServerKey(db: Firestore, seen: string[], expectKid?: string) {
  const kid = tokenKeyId();
  if (kid === 'none') {
    throw new Error(
      'No encryption key (OAUTH_ENCRYPTION_KEY / LOG_HASH_SECRET): refusing to write'
    );
  }
  if (expectKid === undefined) {
    throw new Error(
      `--apply needs --expect-kid=<token_at_rest_kid>, matching the web server and the agent boot logs (this run: ${kid})`
    );
  }
  if (expectKid !== kid) {
    throw new Error(
      `This run's kid ${kid} does not match --expect-kid=${expectKid}: refusing to write`
    );
  }
  if ((await serverEnvelopes(db, seen)) === 'none-open') {
    throw new Error(
      "No envelope the servers wrote opens with this run's keys (set the same env vars they have): refusing to write"
    );
  }
}

export async function runEncryptIntegrationTokens(
  db: Firestore,
  { apply, expectKid }: RunOptions
): Promise<Record<string, Counts>> {
  const result: Record<string, Counts> = {};
  const jobs: Job[] = [];
  const seenEnvelopes: string[] = [];

  const consider = (
    counts: Counts,
    snap: QueryDocumentSnapshot,
    record: unknown,
    update: (r: Json, k: Kind) => Json
  ) => {
    counts.scanned++;
    const kind = classify(record);
    if (kind === 'empty') return;
    const envelope = envelopeOf(record as Json);
    if (envelope !== undefined) seenEnvelopes.push(envelope);
    if (kind === 'sealed' || kind === 'unopenable') {
      counts[kind]++;
      return;
    }
    counts[kind]++;
    jobs.push({
      counts,
      ref: snap.ref,
      updateTime: snap.updateTime,
      update: () => update(record as Json, kind),
    });
  };

  // Read everything first, so the key check sees every envelope before any write.
  for (const name of DOC_COLLECTIONS) {
    const counts = (result[name] = newCounts());
    for (const snap of (await db.collection(name).get()).docs)
      consider(counts, snap, snap.data(), docUpdate);
  }
  for (const name of DOC_GROUPS) {
    const counts = (result[name] = newCounts());
    for (const snap of (await db.collectionGroup(name).get()).docs)
      consider(counts, snap, snap.data(), docUpdate);
  }
  for (const field of PROFILE_FIELDS) {
    const counts = (result[`bogle_users.${field}`] = newCounts());
    const snaps = await db.collection('bogle_users').where(field, '!=', null).get();
    for (const snap of snaps.docs) {
      consider(counts, snap, snap.data()[field], (r, k) => ({ [field]: fieldValue(r, k) }));
    }
  }
  for (const { group, field } of NESTED_GROUP_FIELDS) {
    const counts = (result[`${group}.${field}`] = newCounts());
    // No where(): a collection-group inequality filter needs an index; these groups are small.
    for (const snap of (await db.collectionGroup(group).get()).docs) {
      const value = snap.data()[field];
      if (value === null || typeof value !== 'object') continue;
      consider(counts, snap, value, (r, k) => ({ [field]: fieldValue(r, k) }));
    }
  }
  if (!apply) return result;

  await assertServerKey(db, seenEnvelopes, expectKid);
  for (const job of jobs) {
    try {
      await job.ref.update(job.update(), { lastUpdateTime: job.updateTime });
      job.counts.written++;
    } catch (error) {
      // The doc keeps what it has (a refresh since the read fails the precondition).
      job.counts.failed++;
      const code = errorCode(error);
      job.counts.failureCodes[code] = (job.counts.failureCodes[code] ?? 0) + 1;
    }
  }
  return result;
}

export function parseExpectKid(argv: readonly string[]): string | undefined {
  return argv.find((a) => a.startsWith('--expect-kid='))?.slice('--expect-kid='.length);
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const expectKid = parseExpectKid(process.argv);
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? '(unset)';
  console.log(`Project: ${project}  mode: ${apply ? 'apply' : 'dry run'}  ${tokenKeyIdLine()}`);
  if (apply) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const typed = await rl.question(
      `This RE-WRITES plaintext token docs in "${project}". Type the project id to continue: `
    );
    rl.close();
    if (typed.trim() !== project) {
      console.log('Not confirmed: nothing written.');
      return;
    }
  }
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  console.log(JSON.stringify(await runEncryptIntegrationTokens(db, { apply, expectKid }), null, 2));
}

// Run only when invoked as a script.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(String(error));
    process.exitCode = 1;
  });
}
