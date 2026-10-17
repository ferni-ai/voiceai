/**
 * When Ferni checks in on one family member, set by their sponsor.
 *
 * - GET    /api/sponsored-identities/:id/checkin-schedule → { schedule | null }
 * - PUT    /api/sponsored-identities/:id/checkin-schedule → create or update it
 * - DELETE /api/sponsored-identities/:id/checkin-schedule → remove it
 *
 * One schedule per family member. Only the identity's own sponsor may read or
 * change it. Calls still go out only while the call-consent switch is on.
 *
 * @module api/family-checkin-schedule-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../utils/safe-logger.js';
import { getSponsoredIdentity } from '../services/identity/sponsored-identity.js';
import {
  createCheckinSchedule,
  deleteCheckinSchedule,
  getCheckinSchedules,
  updateCheckinSchedule,
  type DayOfWeek,
  type FamilyCheckinSchedule,
} from '../services/family/proactive-family-checkin.js';

const log = getLogger().child({ module: 'family-checkin-schedule-routes' });

const ROUTE = /^\/([^/]+)\/checkin-schedule$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS: readonly DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];
const MAX_BODY_BYTES = 4096;

type Send = (res: ServerResponse, status: number, data: unknown) => void;
type NewSchedule = Parameters<typeof createCheckinSchedule>[0];

/** The schedule store, injected so tests need no Firestore. */
export interface CheckinScheduleDeps {
  list: (sponsorUserId: string) => Promise<FamilyCheckinSchedule[]>;
  create: (input: NewSchedule) => Promise<FamilyCheckinSchedule>;
  update: (
    sponsorUserId: string,
    scheduleId: string,
    updates: Partial<FamilyCheckinSchedule>
  ) => Promise<void>;
  remove: (sponsorUserId: string, scheduleId: string) => Promise<void>;
}

const defaultDeps: CheckinScheduleDeps = {
  list: async (sponsorUserId) => getCheckinSchedules(sponsorUserId, false),
  create: createCheckinSchedule,
  update: updateCheckinSchedule,
  remove: deleteCheckinSchedule,
};

/** What the sponsor chose, after validation. */
export interface ScheduleChoice {
  frequency: 'daily' | 'weekly';
  dayOfWeek?: DayOfWeek;
  preferredTime: string;
  timezone: string;
}

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** A valid choice, or a message saying what is wrong with it. */
export function parseScheduleChoice(body: unknown): ScheduleChoice | string {
  if (body === null || typeof body !== 'object') return 'Body must be a JSON object';
  const { frequency, dayOfWeek, preferredTime, timezone } = body as Record<string, unknown>;
  if (frequency !== 'daily' && frequency !== 'weekly') {
    return 'frequency must be daily or weekly';
  }
  if (typeof preferredTime !== 'string' || !TIME.test(preferredTime)) {
    return 'preferredTime must be HH:MM in 24-hour time';
  }
  if (typeof timezone !== 'string' || timezone.length > 64 || !isTimezone(timezone)) {
    return 'timezone must be an IANA time zone';
  }
  if (frequency === 'daily') return { frequency, preferredTime, timezone };
  const day = DAYS.find((d) => d === dayOfWeek);
  if (!day) return 'dayOfWeek must be a day of the week for a weekly check-in';
  return { frequency, dayOfWeek: day, preferredTime, timezone };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk: Buffer | string) => {
      raw += chunk.toString();
      if (raw.length > MAX_BODY_BYTES) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : null);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
    req.on('close', () => resolve(null));
  });
}

type ScheduleView = Pick<
  FamilyCheckinSchedule,
  'frequency' | 'preferredTime' | 'timezone' | 'isActive'
> & { dayOfWeek?: DayOfWeek };

const view = (s: FamilyCheckinSchedule): ScheduleView => ({
  frequency: s.frequency,
  dayOfWeek: s.frequency === 'weekly' ? s.daysOfWeek?.[0] : undefined,
  preferredTime: s.preferredTime,
  timezone: s.timezone,
  isActive: s.isActive,
});

/** Handles /:id/checkin-schedule under /api/sponsored-identities. True when handled. */
export async function handleCheckinScheduleRoute(
  req: IncomingMessage,
  res: ServerResponse,
  route: string,
  userId: string,
  send: Send,
  deps: CheckinScheduleDeps = defaultDeps
): Promise<boolean> {
  const match = route.match(ROUTE);
  if (!match || !['GET', 'PUT', 'DELETE'].includes(req.method ?? '')) return false;
  const identityId = match[1];

  const identity = await getSponsoredIdentity(identityId);
  if (!identity || identity.sponsorUserId !== userId) {
    send(res, 404, { error: 'Identity not found or not authorized' });
    return true;
  }

  try {
    const existing = (await deps.list(userId)).find((s) => s.sponsoredIdentityId === identityId);

    if (req.method === 'GET') {
      send(res, 200, { schedule: existing ? view(existing) : null });
      return true;
    }

    if (req.method === 'DELETE') {
      if (existing) await deps.remove(userId, existing.id);
      log.info({ identityId, userId }, 'Sponsor removed family check-in schedule');
      send(res, 200, { schedule: null });
      return true;
    }

    const choice = parseScheduleChoice(await readJson(req));
    if (typeof choice === 'string') {
      send(res, 400, { error: choice });
      return true;
    }
    const saved = await saveSchedule(choice, identity, existing, deps);
    log.info(
      { identityId, userId, frequency: choice.frequency, created: !existing },
      'Sponsor set family check-in schedule'
    );
    send(res, 200, { schedule: view(saved) });
  } catch (error) {
    log.error({ identityId, userId, method: req.method, error }, 'Check-in schedule failed');
    send(res, 503, { error: 'Check-in schedules are unavailable, try again' });
  }
  return true;
}

type Identity = NonNullable<Awaited<ReturnType<typeof getSponsoredIdentity>>>;

/** Update the family member's one schedule, or create it from their identity. */
async function saveSchedule(
  choice: ScheduleChoice,
  identity: Identity,
  existing: FamilyCheckinSchedule | undefined,
  deps: CheckinScheduleDeps
): Promise<FamilyCheckinSchedule> {
  const fields = {
    frequency: choice.frequency,
    daysOfWeek: choice.dayOfWeek ? [choice.dayOfWeek] : [],
    preferredTime: choice.preferredTime,
    timezone: choice.timezone,
    isActive: true,
  };
  if (existing) {
    // Passing frequency makes updateCheckinSchedule recompute nextScheduledCall.
    await deps.update(identity.sponsorUserId, existing.id, fields);
    return { ...existing, ...fields };
  }
  return deps.create({
    ...fields,
    sponsorUserId: identity.sponsorUserId,
    sponsoredIdentityId: identity.id,
    familyMemberName: identity.displayName,
    relationship: identity.relationship,
    phoneNumber: identity.phoneNumber,
    maxDurationMinutes: 15,
    leaveVoicemailIfNoAnswer: false,
  });
}
