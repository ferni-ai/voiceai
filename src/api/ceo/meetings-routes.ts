/**
 * Meetings API Routes
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../../utils/safe-logger.js';
import * as meetingsService from '../../services/ceo/meetings.js';
import type { MeetingPeriod } from '../../services/ceo/meetings.js';
import { authenticateUser } from '../middleware/auth.js';

const log = createLogger({ module: 'meetings-routes' });
const router = Router();

const MEETING_PERIODS: MeetingPeriod[] = ['today', 'week', 'month', 'all'];

function isMeetingPeriod(value: unknown): value is MeetingPeriod {
  return typeof value === 'string' && MEETING_PERIODS.includes(value as MeetingPeriod);
}

router.use(authenticateUser);

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { period } = req.query;
    const periodVal = isMeetingPeriod(period) ? period : 'all';
    const meetings = await meetingsService.getMeetings(userId, periodVal);
    return res.json(meetings);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to list meetings');
    return res.status(500).json({ error: 'Failed to list meetings' });
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const meetings = await meetingsService.searchMeetings(userId, query as string);
    return res.json(meetings);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to search meetings');
    return res.status(500).json({ error: 'Failed to search meetings' });
  }
});

router.get('/:meetingId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { meetingId } = req.params;
    const meeting = await meetingsService.getMeeting(userId, meetingId);

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    return res.json(meeting);
  } catch (error) {
    log.error({ error: String(error), meetingId: req.params.meetingId }, 'Failed to get meeting');
    return res.status(500).json({ error: 'Failed to get meeting' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { title, attendees, notes, actionItems } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const meeting = await meetingsService.addMeeting(userId, title, attendees, notes, actionItems);
    return res.status(201).json(meeting);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to add meeting');
    const message = error instanceof Error ? error.message : 'Failed to add meeting';
    return res.status(400).json({ error: message });
  }
});

router.put('/:meetingId/notes', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { meetingId } = req.params;
    const { notes } = req.body;

    if (!notes) {
      return res.status(400).json({ error: 'Notes are required' });
    }

    const meeting = await meetingsService.updateNotes(userId, meetingId, notes);
    return res.json(meeting);
  } catch (error) {
    log.error({ error: String(error), meetingId: req.params.meetingId }, 'Failed to update notes');
    const message = error instanceof Error ? error.message : 'Failed to update notes';
    return res.status(400).json({ error: message });
  }
});

router.post('/:meetingId/action-items', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { meetingId } = req.params;
    const { title, assignee } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const meeting = await meetingsService.addActionItem(userId, meetingId, { description: title, assignee });
    return res.json(meeting);
  } catch (error) {
    log.error({ error: String(error), meetingId: req.params.meetingId }, 'Failed to add action item');
    const message = error instanceof Error ? error.message : 'Failed to add action item';
    return res.status(400).json({ error: message });
  }
});

router.post('/:meetingId/action-items/:actionItemId/complete', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { meetingId, actionItemId } = req.params;

    const meeting = await meetingsService.completeActionItem(userId, meetingId, actionItemId);
    return res.json(meeting);
  } catch (error) {
    log.error({ error: String(error), meetingId: req.params.meetingId, actionItemId: req.params.actionItemId }, 'Failed to complete action item');
    const message = error instanceof Error ? error.message : 'Failed to complete action item';
    return res.status(400).json({ error: message });
  }
});

router.get('/action-items/all', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const actionItems = await meetingsService.getActionItems(userId);
    return res.json(actionItems);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get action items');
    return res.status(500).json({ error: 'Failed to get action items' });
  }
});

export { router as meetingsRoutes };
