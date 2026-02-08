/**
 * Priorities API Routes
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../../utils/safe-logger.js';
import * as prioritiesService from '../../services/ceo/priorities.js';
import { authenticateUser } from '../middleware/auth.js';

const log = createLogger({ module: 'priorities-routes' });
const router = Router();

router.use(authenticateUser);

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const priorities = await prioritiesService.getPriorities(userId);
    return res.json(priorities);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to list priorities');
    return res.status(500).json({ error: 'Failed to list priorities' });
  }
});

router.get('/top', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const priority = await prioritiesService.getTopPriority(userId);

    if (!priority) {
      return res.status(404).json({ error: 'No priorities found' });
    }

    return res.json(priority);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get top priority');
    return res.status(500).json({ error: 'Failed to get top priority' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { title, importance } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const priority = await prioritiesService.addPriority(userId, title, importance);
    return res.status(201).json(priority);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to add priority');
    const message = error instanceof Error ? error.message : 'Failed to add priority';
    return res.status(400).json({ error: message });
  }
});

router.post('/:priorityId/complete', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { priorityId } = req.params;

    const priority = await prioritiesService.completePriority(userId, priorityId);
    return res.json(priority);
  } catch (error) {
    log.error({ error: String(error), priorityId: req.params.priorityId }, 'Failed to complete priority');
    const message = error instanceof Error ? error.message : 'Failed to complete priority';
    return res.status(400).json({ error: message });
  }
});

router.post('/reorder', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { orderedIds } = req.body;

    if (!orderedIds || !Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds array is required' });
    }

    const priorities = await prioritiesService.reorderPriorities(userId, orderedIds);
    return res.json(priorities);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to reorder priorities');
    const message = error instanceof Error ? error.message : 'Failed to reorder priorities';
    return res.status(400).json({ error: message });
  }
});

router.post('/clear-completed', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    await prioritiesService.clearCompleted(userId);
    return res.status(204).send();
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to clear completed');
    return res.status(500).json({ error: 'Failed to clear completed' });
  }
});

export { router as prioritiesRoutes };
