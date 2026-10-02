/**
 * Adapter to the user's proactive boundaries (`src/services/user-preferences/`,
 * built separately): do-not-contact times and topics to avoid.
 *
 * INTEGRATION POINT: until that module is present this adapter allows
 * everything. It loads the module by a computed path so this file compiles
 * either way; once user-preferences lands, reminders automatically honour
 *   - `isTopicAllowedProactively(userId, topic)`, and
 *   - `getProactiveBoundaries(userId)` do-not-contact windows.
 * The shape of the boundaries object is read defensively (see
 * `doNotContactWindows`) so field-name differences degrade to "allow".
 *
 * @module services/important-dates/boundaries-adapter
 */

import { createLogger } from '../../utils/safe-logger.js';
import { isWithinQuietHours, localParts, parseClock } from './date-math.js';

const log = createLogger({ module: 'important-dates:boundaries' });

interface UserPreferencesModule {
  getProactiveBoundaries?: (userId: string) => Promise<unknown>;
  isTopicAllowedProactively?: (userId: string, topic: string) => Promise<boolean>;
}

const MODULE_PATH = ['..', 'user-preferences', 'index.js'].join('/');

let override: UserPreferencesModule | null | undefined;

/** Tests inject a fake module here (null = module absent). */
export function setUserPreferencesModuleForTests(
  mod: UserPreferencesModule | null | undefined
): void {
  override = mod;
}

async function loadModule(): Promise<UserPreferencesModule | null> {
  if (override !== undefined) return override;
  try {
    return (await import(MODULE_PATH)) as UserPreferencesModule;
  } catch {
    return null;
  }
}

export async function isReminderTopicAllowed(userId: string, topic: string): Promise<boolean> {
  const mod = await loadModule();
  if (!mod?.isTopicAllowedProactively) return true;
  try {
    return await mod.isTopicAllowedProactively(userId, topic);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Topic boundary check failed; allowing');
    return true;
  }
}

interface Window {
  start: number;
  end: number;
  days?: number[];
}

function asWindow(value: unknown): Window | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const start = typeof v.start === 'string' ? parseClock(v.start) : null;
  const end = typeof v.end === 'string' ? parseClock(v.end) : null;
  if (start === null || end === null) return null;
  const days = Array.isArray(v.days)
    ? v.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6)
    : undefined;
  return { start, end, ...(days && days.length > 0 ? { days } : {}) };
}

/** Do-not-contact windows from whatever shape the boundaries object has. */
export function doNotContactWindows(boundaries: unknown): Window[] {
  if (!boundaries || typeof boundaries !== 'object') return [];
  const b = boundaries as Record<string, unknown>;
  const raw = b.doNotContact ?? b.doNotContactTimes ?? b.doNotContactWindows ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map(asWindow).filter((w): w is Window => w !== null);
}

/** Whether `now` falls in one of the user's do-not-contact windows. */
export async function isDoNotContactNow(
  userId: string,
  now: Date,
  timeZone: string
): Promise<boolean> {
  const mod = await loadModule();
  if (!mod?.getProactiveBoundaries) return false;
  try {
    const windows = doNotContactWindows(await mod.getProactiveBoundaries(userId));
    if (windows.length === 0) return false;
    const p = localParts(now, timeZone);
    const minutes = p.hour * 60 + p.minute;
    const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    return windows.some(
      (w) => (!w.days || w.days.includes(weekday)) && isWithinQuietHours(minutes, w.start, w.end)
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Boundary lookup failed; allowing');
    return false;
  }
}
