/**
 * Calendar Selection Handlers
 *
 * Handles listing and selecting which calendars to sync.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../utils/safe-logger.js';
import { parseBody, sendError } from '../helpers.js';
import { sendJson, checkRateLimitAndApply } from './helpers.js';
import {
  getSelectedCalendars,
  updateSelectedCalendars,
} from '../../services/calendar/calendar-selection.js';
import type {
  SelectedCalendar,
  CalendarProvider as ProviderType,
} from '../../services/calendar/types.js';

const log = getLogger();

/**
 * GET /calendar/{provider}/calendars - List available calendars
 */
export async function handleListCalendars(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  provider: ProviderType
): Promise<void> {
  try {
    const calendars = await getSelectedCalendars(userId, provider);

    sendJson(res, {
      success: true,
      provider,
      calendars,
      enabledCount: calendars.filter((c) => c.enabled).length,
      totalCount: calendars.length,
    });
  } catch (error) {
    log.error({ error, userId, provider }, 'Failed to list calendars');
    sendError(res, 'Failed to list calendars', 500);
  }
}

/**
 * POST /calendar/{provider}/calendars/select - Update selected calendars
 */
export async function handleSelectCalendars(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  provider: ProviderType
): Promise<void> {
  if (checkRateLimitAndApply(res, userId, 'credential')) return;

  try {
    const body = await parseBody<{
      calendar_ids?: string[];
      calendarIds?: string[];
    }>(req);

    const selectedIds = body.calendar_ids || body.calendarIds || [];

    if (!Array.isArray(selectedIds)) {
      sendError(res, 'calendar_ids must be an array', 400);
      return;
    }

    const result = await updateSelectedCalendars(userId, provider, selectedIds);

    if (result.success) {
      sendJson(res, {
        success: true,
        provider,
        calendars: result.calendars,
        enabledCount: result.calendars.filter((c: SelectedCalendar) => c.enabled).length,
        message: 'Calendar selection updated',
      });
      log.info({ userId, provider, selectedIds }, 'Updated calendar selection');
    } else {
      sendJson(res, { success: false, error: 'Failed to update calendar selection' });
    }
  } catch (error) {
    log.error({ error, userId, provider }, 'Failed to update calendar selection');
    sendError(res, 'Failed to update calendar selection', 500);
  }
}


