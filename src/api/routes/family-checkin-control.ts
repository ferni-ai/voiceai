/**
 * Family check-in control — the owner's side of "Ferni calls my mom".
 *
 * - GET  /api/family/status          schedules + counts
 * - GET  /api/family/members         who Ferni checks in with
 * - POST /api/family/checkin         { member } call one family member now
 * - POST /api/family/checkin/round   call everyone with an active schedule
 *
 * Backed by services/family (schedules under bogle_users/{uid}/…, calls via
 * family-checkin-caller: LiveKit room + voice agent + SIP). Verified user only;
 * 3 manual check-in calls per hour.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { checkRateLimitAsync, requireAuth } from '../auth-middleware.js';
import { parseRequestBody, sendJSON } from '../helpers.js';
import {
  getCheckinSchedules,
  type FamilyCheckinSchedule,
} from '../../services/family/proactive-family-checkin.js';
import { initiateCheckinCall } from '../../services/family/family-checkin-caller.js';

const log = createLogger({ module: 'FamilyCheckinControl' });
const MANUAL_CALLS_PER_HOUR = 3;
const ROUTES = new Set(['/api/family/status', '/api/family/members', '/api/family/checkin', '/api/family/checkin/round']);

function member(schedule: FamilyCheckinSchedule) {
  return {
    id: schedule.id,
    name: schedule.familyMemberName,
    relationship: schedule.relationship,
    lastCheckin: schedule.lastSuccessfulCall,
    nextCheckin: schedule.nextScheduledCall,
    frequency: schedule.frequency,
    phone: schedule.phoneNumber ? `•••${schedule.phoneNumber.replace(/\D/g, '').slice(-4)}` : undefined,
  };
}

async function callAllowed(userId: string, count = 1): Promise<boolean> {
  for (let i = 0; i < count; i++) {
    const r = await checkRateLimitAsync(`family-checkin:${userId}`, MANUAL_CALLS_PER_HOUR, 60 * 60 * 1000);
    if (!r.allowed) return false;
  }
  return true;
}

export async function handleFamilyCheckinControl(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!ROUTES.has(pathname)) return false;

  const auth = await requireAuth(req, res);
  if (!auth) return true;
  const userId = auth.userId;

  try {
    if (req.method === 'GET' && (pathname === '/api/family/status' || pathname === '/api/family/members')) {
      const schedules = await getCheckinSchedules(userId, false);
      const members = schedules.map(member);
      if (pathname === '/api/family/members') {
        sendJSON(res, { members });
        return true;
      }
      const active = schedules.filter((s) => s.isActive);
      sendJSON(res, {
        pending: active.length,
        completed: schedules.reduce((n, s) => n + (s.totalCallsMade || 0), 0),
        lastRound: schedules.map((s) => s.lastSuccessfulCall).filter(Boolean).sort().pop(),
        members,
      });
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/family/checkin') {
      const body = ((await parseRequestBody(req)) ?? {}) as { member?: string };
      const wanted = (body.member || '').trim().toLowerCase();
      const schedules = await getCheckinSchedules(userId, false);
      const schedule = schedules.find(
        (s) => s.familyMemberName.toLowerCase() === wanted || s.relationship.toLowerCase() === wanted || s.id === body.member
      );
      if (!schedule) {
        sendJSON(res, { success: false, error: `No family check-in set up for "${body.member}"` }, 404);
        return true;
      }
      if (!(await callAllowed(userId))) {
        sendJSON(res, { success: false, error: 'Too many check-in calls this hour. Try again later?' }, 429);
        return true;
      }
      const result = await initiateCheckinCall(schedule);
      log.info({ userId, member: schedule.familyMemberName, success: result.success }, 'Manual family check-in');
      sendJSON(res, result, result.success ? 200 : 502);
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/family/checkin/round') {
      const active = (await getCheckinSchedules(userId, true)).slice(0, MANUAL_CALLS_PER_HOUR);
      if (!active.length) {
        sendJSON(res, { success: false, error: 'No active family check-ins' }, 404);
        return true;
      }
      if (!(await callAllowed(userId, active.length))) {
        sendJSON(res, { success: false, error: 'Too many check-in calls this hour. Try again later?' }, 429);
        return true;
      }
      const results = await Promise.all(active.map((s) => initiateCheckinCall(s)));
      sendJSON(res, {
        success: results.some((r) => r.success),
        members: active.filter((_, i) => results[i].success).map((s) => s.familyMemberName),
        failed: active.filter((_, i) => !results[i].success).map((s) => s.familyMemberName),
      });
      return true;
    }

    sendJSON(res, { error: 'Method not allowed' }, 405);
    return true;
  } catch (error) {
    log.error({ error: String(error), userId, pathname }, 'Family check-in control failed');
    sendJSON(res, { success: false, error: "Couldn't reach family check-ins right now" }, 500);
    return true;
  }
}
