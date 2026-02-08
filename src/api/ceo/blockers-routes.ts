/**
 * Blockers API Routes
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../../utils/safe-logger.js';
import * as blockersService from '../../services/ceo/blockers.js';
import type { BlockerSeverity } from '../../services/ceo/blockers.js';
import { authenticateUser } from '../middleware/auth.js';

const log = createLogger({ module: 'blockers-routes' });
const router = Router();

const SEVERITIES: BlockerSeverity[] = ['low', 'medium', 'high', 'critical'];

function isSeverity(value: unknown): value is BlockerSeverity {
  return typeof value === 'string' && SEVERITIES.includes(value as BlockerSeverity);
}

router.use(authenticateUser);

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const blockers = await blockersService.getBlockers(userId);
    return res.json(blockers);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to list blockers');
    return res.status(500).json({ error: 'Failed to list blockers' });
  }
});

router.get('/active', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const blockers = await blockersService.getActiveBlockers(userId);
    return res.json(blockers);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get active blockers');
    return res.status(500).json({ error: 'Failed to get active blockers' });
  }
});

router.get('/count', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const count = await blockersService.getActiveBlockerCount(userId);
    return res.json({ count });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get blocker count');
    return res.status(500).json({ error: 'Failed to get blocker count' });
  }
});

router.get('/severity/:severity', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { severity } = req.params;
    if (!isSeverity(severity)) {
      return res.status(400).json({ error: 'Invalid severity. Use: low, medium, high, critical' });
    }
    const blockers = await blockersService.getBlockersBySeverity(userId, severity);
    return res.json(blockers);
  } catch (error) {
    log.error({ error: String(error), severity: req.params.severity }, 'Failed to get blockers by severity');
    return res.status(500).json({ error: 'Failed to get blockers by severity' });
  }
});

router.get('/:blockerId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { blockerId } = req.params;
    const blocker = await blockersService.getBlocker(userId, blockerId);

    if (!blocker) {
      return res.status(404).json({ error: 'Blocker not found' });
    }

    return res.json(blocker);
  } catch (error) {
    log.error({ error: String(error), blockerId: req.params.blockerId }, 'Failed to get blocker');
    return res.status(500).json({ error: 'Failed to get blocker' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { title, description, severity, impactedGoals } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const blocker = await blockersService.addBlocker(userId, title, impactedGoals, severity);
    return res.status(201).json(blocker);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to add blocker');
    const message = error instanceof Error ? error.message : 'Failed to add blocker';
    return res.status(400).json({ error: message });
  }
});

router.post('/:blockerId/resolve', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { blockerId } = req.params;
    const { resolution } = req.body;

    const blocker = await blockersService.resolveBlocker(userId, blockerId, resolution);
    return res.json(blocker);
  } catch (error) {
    log.error({ error: String(error), blockerId: req.params.blockerId }, 'Failed to resolve blocker');
    const message = error instanceof Error ? error.message : 'Failed to resolve blocker';
    return res.status(400).json({ error: message });
  }
});

router.post('/:blockerId/escalate', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { blockerId } = req.params;

    const blocker = await blockersService.escalateBlocker(userId, blockerId);
    return res.json(blocker);
  } catch (error) {
    log.error({ error: String(error), blockerId: req.params.blockerId }, 'Failed to escalate blocker');
    const message = error instanceof Error ? error.message : 'Failed to escalate blocker';
    return res.status(400).json({ error: message });
  }
});

export { router as blockersRoutes };
