/**
 * FIRESTORE_ERROR: one line per rejected Firestore RPC. ~200 FAILED_PRECONDITION
 * queries (missing indexes) and ~90 INVALID_ARGUMENT commits a day left no log
 * line because callers swallow them. firestore-db-pin.ts hands each rejection
 * here, then re-throws it unchanged.
 *
 * The line is the call's shape, never its data: collection path with ids as
 * `:id`, query field names and operators, first app frame, database, and the
 * index-creation link. No error message (it can quote document names). Each
 * (code, method, path, call site) logs at most once a minute, with a count.
 * Filter: textPayload:"\"event\":\"FIRESTORE_ERROR\"" OR jsonPayload.event="FIRESTORE_ERROR"
 *
 * @module utils/firestore-error-log
 */

import { createLogger } from './safe-logger.js';

const log = createLogger({ module: 'firestore-error-log' });

/** gRPC status names by number. */
const CODES = (
  'OK CANCELLED UNKNOWN INVALID_ARGUMENT DEADLINE_EXCEEDED NOT_FOUND ALREADY_EXISTS ' +
  'PERMISSION_DENIED RESOURCE_EXHAUSTED FAILED_PRECONDITION ABORTED OUT_OF_RANGE ' +
  'UNIMPLEMENTED INTERNAL UNAVAILABLE DATA_LOSS UNAUTHENTICATED'
).split(' ');
/** App bugs rather than blips: logged at error, the rest at warn. */
const BUG_CODES = new Set(['INVALID_ARGUMENT', 'FAILED_PRECONDITION']);
/** Our own guards' refusals; they log their own lines. */
const OWN_ERRORS = new Set(['FirestoreDatabaseMismatchError', 'SyntheticWriteRefusedError']);
const WINDOW_MS = 60_000;
const MAX_KEYS = 500;
const MAX_PATHS = 3;

export interface FirestoreErrorLine {
  event: 'FIRESTORE_ERROR';
  code: string;
  method: string;
  /** Collection template(s); `**` marks a collection group. */
  path: string;
  query?: string;
  callSite: string;
  database: string;
  /** This error plus those deduped since the last line. */
  count: number;
  indexUrl?: string;
}

export type FirestoreErrorSink = (line: FirestoreErrorLine) => void;

export const logFirestoreError: FirestoreErrorSink = (line) => {
  if (BUG_CODES.has(line.code)) log.error(line, 'FIRESTORE_ERROR');
  else log.warn(line, 'FIRESTORE_ERROR');
};

/** Document ids, uids, phone numbers, emails, uuids, timestamps. */
export const isIdLike = (s: string): boolean =>
  /\d{5,}|[@+]|^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s) || /^(?=.*\d)(?=.*[a-z])[\w-]{16,}$/i.test(s);

const redact = (segment: string): string => (isIdLike(segment) ? ':id' : segment);
const DOCS = /^projects\/[^/]+\/databases\/[^/]+\/documents\/?/;
const segmentsOf = (name: string): string[] => name.replace(DOCS, '').split('/').filter(Boolean);
/** Odd positions are document ids. */
const template = (segments: string[]): string =>
  segments.map((s, i) => (i % 2 === 1 ? ':id' : redact(s))).join('/');

interface FieldRef {
  fieldPath?: string;
}
interface Filter {
  compositeFilter?: { op?: string; filters?: Filter[] };
  fieldFilter?: { field?: FieldRef; op?: string };
  unaryFilter?: { field?: FieldRef; op?: string };
}
interface StructuredQuery {
  from?: Array<{ collectionId?: string; allDescendants?: boolean }>;
  where?: Filter;
  orderBy?: Array<{ field?: FieldRef; direction?: string }>;
  findNearest?: { vectorField?: FieldRef; distanceMeasure?: string };
  limit?: unknown;
}
interface RpcRequest {
  parent?: string;
  structuredQuery?: StructuredQuery;
  structuredAggregationQuery?: { structuredQuery?: StructuredQuery };
  writes?: Array<{
    update?: { name?: string };
    delete?: string;
    transform?: { document?: string };
  }>;
  documents?: string[];
}

const field = (ref: FieldRef | undefined): string =>
  (ref?.fieldPath ?? '?').split('.').map(redact).join('.');
const op = (value: unknown): string =>
  typeof value === 'string' && /^[A-Z_]+$/.test(value) ? value : '?';

function filterShape(f: Filter): string {
  if (f.compositeFilter) {
    const parts = (f.compositeFilter.filters ?? []).map(filterShape);
    return `(${parts.join(` ${op(f.compositeFilter.op)} `)})`;
  }
  const leaf = f.fieldFilter ?? f.unaryFilter;
  return leaf ? `${field(leaf.field)} ${op(leaf.op)}` : '?';
}

const queryOf = (req: RpcRequest): StructuredQuery | undefined =>
  req.structuredQuery ?? req.structuredAggregationQuery?.structuredQuery;

/** where / orderBy / nearest / limit: field names and operators only. */
export function queryShape(request: unknown): string | undefined {
  const q = queryOf((request ?? {}) as RpcRequest);
  if (!q) return undefined;
  const parts: string[] = [];
  if (q.where) parts.push(`where ${filterShape(q.where)}`);
  const order = (q.orderBy ?? []).map((o) => `${field(o.field)} ${op(o.direction)}`);
  if (order.length > 0) parts.push(`orderBy ${order.join(', ')}`);
  const n = q.findNearest;
  if (n) parts.push(`nearest ${field(n.vectorField)} ${op(n.distanceMeasure)}`);
  if (q.limit !== undefined && q.limit !== null) parts.push('limit');
  return parts.join(' ').slice(0, 300) || 'all';
}

/** The collection(s) an RPC touched, as templates. */
export function pathTemplate(request: unknown): string {
  const req = (request ?? {}) as RpcRequest;
  const parent = template(segmentsOf(req.parent ?? ''));
  const from = queryOf(req)?.from?.[0];
  if (from) {
    const leaf = `${from.allDescendants === true ? '**/' : ''}${redact(from.collectionId ?? '?')}`;
    return parent ? `${parent}/${leaf}` : leaf;
  }
  const names = [
    ...(req.writes ?? []).map((w) => w.update?.name ?? w.delete ?? w.transform?.document),
    ...(req.documents ?? []),
  ].filter((n): n is string => typeof n === 'string');
  if (names.length === 0) return parent || '-';
  const paths = [...new Set(names.map((n) => template(segmentsOf(n).slice(0, -1))))].sort();
  const more = paths.length > MAX_PATHS ? `,+${paths.length - MAX_PATHS}` : '';
  return paths.slice(0, MAX_PATHS).join(',') + more;
}

const INDEX_URL =
  /https:\/\/console\.firebase\.google\.com\/v1\/r\/project\/[a-z0-9-]+\/firestore\/(?:databases\/[^/\s?]+\/)?indexes\?create_[a-z_]+=([\w+/=-]+)/;

/**
 * The index-creation link in a FAILED_PRECONDITION message, cut to its known
 * shape. Its parameter is a base64 Index proto (project, database, collection
 * group, field paths); dropped if any of that looks like an id (a map key).
 */
export function indexUrlOf(message: unknown): string | undefined {
  const m = typeof message === 'string' ? INDEX_URL.exec(message) : null;
  if (!m) return undefined;
  const decoded = Buffer.from(m[1] as string, 'base64').toString('latin1');
  const tokens = (decoded.match(/[\x20-\x7e]{2,}/g) ?? []).flatMap((s) => s.split(/[/.`]/));
  return tokens.some(isIdLike) ? 'dropped: id-like field in index' : m[0];
}

type Report = (error: unknown, method: string, request: unknown, db: string, site: string) => void;

export function createFirestoreErrorReporter(
  sink: FirestoreErrorSink = logFirestoreError,
  now: () => number = Date.now
): Report {
  const seen = new Map<string, { at: number; missed: number }>();
  return (error, method, request, database, callSite) => {
    const e = (error ?? {}) as { code?: unknown; name?: unknown; message?: unknown };
    if (typeof e.code !== 'number' || OWN_ERRORS.has(String(e.name))) return;
    const code = CODES[e.code];
    if (code === undefined || code === 'OK') return;
    const path = pathTemplate(request);
    const key = `${code}|${method}|${path}|${callSite}`;
    const t = now();
    const prev = seen.get(key);
    if (prev && t - prev.at < WINDOW_MS) {
      prev.missed++;
      return;
    }
    seen.delete(key);
    if (seen.size >= MAX_KEYS) seen.delete(seen.keys().next().value as string);
    seen.set(key, { at: t, missed: 0 });
    const query = queryShape(request);
    const indexUrl = code === 'FAILED_PRECONDITION' ? indexUrlOf(e.message) : undefined;
    sink({
      event: 'FIRESTORE_ERROR',
      ...{ code, method, path, callSite, database, count: (prev?.missed ?? 0) + 1 },
      ...(query === undefined ? {} : { query }),
      ...(indexUrl === undefined ? {} : { indexUrl }),
    });
  };
}
