/**
 * Focus API Routes
 * REST API for focus session management
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../../utils/safe-logger.js';
import { focusService } from '../../services/ceo/focus.js';
import { authenticateUser } from '../middleware/auth.js';

const log = createLogger({ module: 'focus-routes' });
const router = Router();

router.use(authenticateUser);

/**
 * POST /api/ceo/focus/start
 * Start a focus session
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { duration, task } = req.body;

    if (!duration) {
      return res.status(400).json({ error: 'Duration is required' });
    }

    const session = await focusService.startSession(userId, { duration, task });

    return res.status(201).json(session);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to start focus session');
    const message = error instanceof Error ? error.message : 'Failed to start focus session';
    return res.status(400).json({ error: message });
  }
});

/**
 * POST /api/ceo/focus/:sessionId/stop
 * Stop a focus session
 */
router.post('/:sessionId/stop', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const session = await focusService.endSession(userId);

    return res.json(session);
  } catch (error) {
    log.error({ error: String(error), sessionId: req.params.sessionId }, 'Failed to stop focus session');
    const message = error instanceof Error ? error.message : 'Failed to stop focus session';
    return res.status(400).json({ error: message });
  }
});

/**
 * GET /api/ceo/focus/current
 * Get current active focus session
 */
router.get('/current', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const session = await focusService.getCurrentSession(userId);

    if (!session) {
      return res.status(404).json({ error: 'No active focus session' });
    }

    return res.json(session);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get current session');
    return res.status(500).json({ error: 'Failed to get current session' });
  }
});

/**
 * GET /api/ceo/focus/history
 * Get focus session history
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { limit } = req.query;

    const sessions = await focusService.getSessionHistory(userId, limit ? parseInt(limit as string) : undefined);

    return res.json(sessions);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get focus history');
    return res.status(500).json({ error: 'Failed to get focus history' });
  }
});

/**
 * GET /api/ceo/focus/stats
 * Get focus statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const stats = await focusService.getStats(userId, 'week');

    return res.json(stats);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get focus stats');
    return res.status(500).json({ error: 'Failed to get focus stats' });
  }
});

export { router as focusRoutes };
