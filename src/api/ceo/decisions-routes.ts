/**
 * Decisions API Routes
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../../utils/safe-logger.js';
import * as decisionsService from '../../services/ceo/decisions.js';
import { authenticateUser } from '../middleware/auth.js';

const log = createLogger({ module: 'decisions-routes' });
const router = Router();

router.use(authenticateUser);

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const decisions = await decisionsService.getDecisions(userId);
    return res.json(decisions);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to list decisions');
    return res.status(500).json({ error: 'Failed to list decisions' });
  }
});

router.get('/pending', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const decisions = await decisionsService.getPendingDecisions(userId);
    return res.json(decisions);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get pending decisions');
    return res.status(500).json({ error: 'Failed to get pending decisions' });
  }
});

router.get('/:decisionId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { decisionId } = req.params;
    const decision = await decisionsService.getDecision(userId, decisionId);

    if (!decision) {
      return res.status(404).json({ error: 'Decision not found' });
    }

    return res.json(decision);
  } catch (error) {
    log.error({ error: String(error), decisionId: req.params.decisionId }, 'Failed to get decision');
    return res.status(500).json({ error: 'Failed to get decision' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { title, context, options, deadline } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const decision = await decisionsService.addDecision(userId, title, context, options);
    return res.status(201).json(decision);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to add decision');
    const message = error instanceof Error ? error.message : 'Failed to add decision';
    return res.status(400).json({ error: message });
  }
});

router.post('/:decisionId/make', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { decisionId } = req.params;
    const { choice, reasoning } = req.body;

    if (!choice) {
      return res.status(400).json({ error: 'Choice is required' });
    }

    const decision = await decisionsService.makeDecision(userId, decisionId, choice, reasoning);
    return res.json(decision);
  } catch (error) {
    log.error({ error: String(error), decisionId: req.params.decisionId }, 'Failed to make decision');
    const message = error instanceof Error ? error.message : 'Failed to make decision';
    return res.status(400).json({ error: message });
  }
});

router.post('/:decisionId/outcome', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { decisionId } = req.params;
    const { outcome } = req.body;

    if (!outcome) {
      return res.status(400).json({ error: 'Outcome is required' });
    }

    const decision = await decisionsService.addOutcome(userId, decisionId, outcome);
    return res.json(decision);
  } catch (error) {
    log.error({ error: String(error), decisionId: req.params.decisionId }, 'Failed to add outcome');
    const message = error instanceof Error ? error.message : 'Failed to add outcome';
    return res.status(400).json({ error: message });
  }
});

export { router as decisionsRoutes };
