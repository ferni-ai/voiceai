/**
 * Demo rate limit shared by every UI server instance.
 *
 * The in-memory limit in ./demo-rate-limit.ts is per instance: Cloud Run runs
 * several, and each one forgets its counts when it scales to zero, so the
 * "3 demos a day" limit was really "3 per instance per lifetime". With
 * DEMO_RATE_LIMIT_SHARED=true the counters live in Firestore
 * (`demo_rate_limits/{sha256(ip)}`), read and bumped in one transaction so two
 * instances can't both hand out the last demo. Off (the default), or when
 * Firestore fails, the in-memory limit decides, as before; a failure is logged.
 *
 * @module servers/token/demo-rate-limit-shared
 */

import crypto from 'crypto';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { RateLimitResult } from '../shared/types.js';
import {
  DEMO_CONFIG,
  checkDemoAllowed,
  demoDayStart,
  evaluateDemoLimit,
  recordDemoSession,
  type DemoLimitCounters,
} from './demo-rate-limit.js';

const log = createLogger({ module: 'DemoRateLimitShared' });

const COLLECTION = 'demo_rate_limits';
const DAY_MS = 24 * 60 * 60 * 1000;

/** True when the demo limit is counted in Firestore across instances. */
export function isSharedDemoLimitOn(): boolean {
  return process.env.DEMO_RATE_LIMIT_SHARED === 'true';
}

/** Where the shared counters live. `change` runs inside one atomic read-modify-write. */
export interface DemoLimitStore {
  read: (key: string) => Promise<DemoLimitCounters | null>;
  change: <T>(
    key: string,
    fn: (current: DemoLimitCounters | null) => { next?: DemoLimitCounters; result: T }
  ) => Promise<T>;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toCounters(data: unknown): DemoLimitCounters | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  return {
    dayStart: num(record['dayStart']),
    sessionCount: num(record['sessionCount']),
    lastSession: num(record['lastSession']),
  };
}

/** The Firestore store, using the repo's shared Firestore client. */
export function createFirestoreDemoLimitStore(): DemoLimitStore {
  const dbOrThrow = (): NonNullable<ReturnType<typeof getFirestoreDb>> => {
    const db = getFirestoreDb();
    if (!db) throw new Error('Firestore unavailable');
    return db;
  };
  return {
    async read(key) {
      const snap = await dbOrThrow().collection(COLLECTION).doc(key).get();
      return snap.exists ? toCounters(snap.data()) : null;
    },
    async change(key, fn) {
      const db = dbOrThrow();
      const ref = db.collection(COLLECTION).doc(key);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const { next, result } = fn(snap.exists ? toCounters(snap.data()) : null);
        // expiresAt lets a Firestore TTL policy drop yesterday's counters
        if (next) tx.set(ref, { ...next, expiresAt: new Date(next.dayStart + 2 * DAY_MS) });
        return result;
      });
    },
  };
}

/** Today's counters: a missing or earlier day's record counts as a fresh day. */
function today(current: DemoLimitCounters | null, now: number): DemoLimitCounters {
  const dayStart = demoDayStart(now);
  if (!current || current.dayStart !== dayStart) {
    return { dayStart, sessionCount: 0, lastSession: 0 };
  }
  return current;
}

export interface DemoLimiter {
  /** Whether a demo is allowed now, without using one. */
  peek: (ip: string) => Promise<RateLimitResult>;
  /** Use one demo if allowed; `sessionsRemaining` is what is left after it. */
  reserve: (ip: string) => Promise<RateLimitResult>;
}

/** The in-memory limit: this instance only. */
function reserveInMemory(ip: string, config = DEMO_CONFIG): RateLimitResult {
  const result = checkDemoAllowed(ip, config);
  if (!result.allowed) return result;
  recordDemoSession(ip);
  return { allowed: true, sessionsRemaining: (result.sessionsRemaining ?? 1) - 1 };
}

/** A limiter counting in `store`, falling back to memory when the store fails. */
export function createSharedDemoLimiter(store: DemoLimitStore, config = DEMO_CONFIG): DemoLimiter {
  const keyOf = (ip: string): string => crypto.createHash('sha256').update(ip).digest('hex');
  const fallBack = (op: string, error: unknown): void =>
    log.error({ error: String(error), op }, 'Shared demo limit failed, using in-memory limit');

  return {
    async peek(ip) {
      try {
        const now = Date.now();
        return evaluateDemoLimit(today(await store.read(keyOf(ip)), now), now, config);
      } catch (error) {
        fallBack('peek', error);
        return checkDemoAllowed(ip, config);
      }
    },
    async reserve(ip) {
      try {
        return await store.change(keyOf(ip), (current) => {
          const now = Date.now();
          const counters = today(current, now);
          const result = evaluateDemoLimit(counters, now, config);
          if (!result.allowed) return { result };
          const next = { ...counters, sessionCount: counters.sessionCount + 1, lastSession: now };
          return {
            next,
            result: {
              allowed: true,
              sessionsRemaining: config.maxSessionsPerDay - next.sessionCount,
            },
          };
        });
      } catch (error) {
        fallBack('reserve', error);
        return reserveInMemory(ip, config);
      }
    },
  };
}

let sharedLimiter: DemoLimiter | null = null;

function limiter(): DemoLimiter | null {
  if (!isSharedDemoLimitOn()) return null;
  sharedLimiter ??= createSharedDemoLimiter(createFirestoreDemoLimitStore());
  return sharedLimiter;
}

/** Whether this IP may start a demo now (shared when the flag is on). */
export async function peekDemoAllowance(ip: string): Promise<RateLimitResult> {
  return limiter()?.peek(ip) ?? checkDemoAllowed(ip);
}

/** Use one of this IP's demos if allowed (shared when the flag is on). */
export async function reserveDemoSession(ip: string): Promise<RateLimitResult> {
  return limiter()?.reserve(ip) ?? reserveInMemory(ip);
}
