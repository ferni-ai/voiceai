/**
 * Goals API Routes
 * REST API for goal management
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../../utils/safe-logger.js';
import { createGoal, getGoals, getGoal, updateGoal, deleteGoal, updateProgress, addMilestone, completeMilestone } from '../../services/ceo/goals.js';
import { authenticateUser } from '../middleware/auth.js';

const log = createLogger({ module: 'goals-routes' });
const router = Router();

// All routes require authentication
router.use(authenticateUser);

/**
 * GET /api/ceo/goals
 * List goals with optional filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { status, category } = req.query;

    const filter: any = {};
    if (status) {
      filter.status = status as string;
    }
    if (category) {
      filter.category = category as string;
    }

    const goals = await getGoals(userId, filter.status);

    return res.json(goals);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to list goals');
    return res.status(500).json({ error: 'Failed to list goals' });
  }
});

/**
 * GET /api/ceo/goals/progress
 * Get progress summary
 */
router.get('/progress', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;

    const goals = await getGoals(userId);
    const total = goals.length;
    const completed = goals.filter(g => g.status === 'completed').length;
    const summary = { total, completed, active: total - completed };

    return res.json(summary);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get progress summary');
    return res.status(500).json({ error: 'Failed to get progress summary' });
  }
});

/**
 * GET /api/ceo/goals/needs-attention
 * Get goals that need attention
 */
router.get('/needs-attention', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;

    const allGoals = await getGoals(userId, 'active');
    const needsAttention = allGoals.filter(g => g.progress < 25);

    return res.json(needsAttention);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get goals needing attention');
    return res.status(500).json({ error: 'Failed to get goals needing attention' });
  }
});

/**
 * GET /api/ceo/goals/by-category
 * Get goals grouped by category
 */
router.get('/by-category', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;

    const allGoals = await getGoals(userId);
    const byCategory: Record<string, typeof allGoals> = {};
    for (const goal of allGoals) {
      const cat = goal.category || 'personal';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(goal);
    }

    return res.json(byCategory);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get goals by category');
    return res.status(500).json({ error: 'Failed to get goals by category' });
  }
});

/**
 * GET /api/ceo/goals/:goalId
 * Get a specific goal
 */
router.get('/:goalId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { goalId } = req.params;

    const goal = await getGoal(userId, goalId);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    return res.json(goal);
  } catch (error) {
    log.error({ error: String(error), goalId: req.params.goalId }, 'Failed to get goal');
    return res.status(500).json({ error: 'Failed to get goal' });
  }
});

/**
 * POST /api/ceo/goals
 * Create a new goal
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { title, description, targetDate, category, tags } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const data: any = { title };

    if (description) {
      data.description = description;
    }

    if (targetDate) {
      data.targetDate = new Date(targetDate);
    }

    if (category) {
      data.category = category;
    }

    if (tags) {
      data.tags = Array.isArray(tags) ? tags : [tags];
    }

    const goal = await createGoal(userId, data);

    return res.status(201).json(goal);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to create goal');
    const message = error instanceof Error ? error.message : 'Failed to create goal';
    return res.status(400).json({ error: message });
  }
});

/**
 * PUT /api/ceo/goals/:goalId
 * Update a goal
 */
router.put('/:goalId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { goalId } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.userId;
    delete updates.createdAt;
    delete updates.updatedAt;

    const goal = await updateGoal(userId, goalId, updates);

    return res.json(goal);
  } catch (error) {
    log.error({ error: String(error), goalId: req.params.goalId }, 'Failed to update goal');
    const message = error instanceof Error ? error.message : 'Failed to update goal';
    return res.status(400).json({ error: message });
  }
});

/**
 * POST /api/ceo/goals/:goalId/complete
 * Mark a goal as completed
 */
router.post('/:goalId/complete', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { goalId } = req.params;

    const goal = await updateGoal(userId, goalId, { status: 'completed' });

    return res.json(goal);
  } catch (error) {
    log.error({ error: String(error), goalId: req.params.goalId }, 'Failed to complete goal');
    const message = error instanceof Error ? error.message : 'Failed to complete goal';
    return res.status(400).json({ error: message });
  }
});

/**
 * POST /api/ceo/goals/:goalId/archive
 * Archive a goal
 */
router.post('/:goalId/archive', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { goalId } = req.params;

    const goal = await updateGoal(userId, goalId, { status: 'paused' });

    return res.json(goal);
  } catch (error) {
    log.error({ error: String(error), goalId: req.params.goalId }, 'Failed to archive goal');
    const message = error instanceof Error ? error.message : 'Failed to archive goal';
    return res.status(400).json({ error: message });
  }
});

/**
 * DELETE /api/ceo/goals/:goalId
 * Delete a goal
 */
router.delete('/:goalId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { goalId } = req.params;

    await deleteGoal(userId, goalId);

    return res.status(204).send();
  } catch (error) {
    log.error({ error: String(error), goalId: req.params.goalId }, 'Failed to delete goal');
    const message = error instanceof Error ? error.message : 'Failed to delete goal';
    return res.status(400).json({ error: message });
  }
});

/**
 * PUT /api/ceo/goals/:goalId/progress
 * Update goal progress
 */
router.put('/:goalId/progress', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { goalId } = req.params;
    const { progress } = req.body;

    if (progress === undefined || progress === null) {
      return res.status(400).json({ error: 'Progress value is required' });
    }

    if (typeof progress !== 'number' || progress < 0 || progress > 100) {
      return res.status(400).json({ error: 'Progress must be a number between 0 and 100' });
    }

    const goal = await updateProgress(userId, goalId, progress);

    return res.json(goal);
  } catch (error) {
    log.error({ error: String(error), goalId: req.params.goalId }, 'Failed to update progress');
    const message = error instanceof Error ? error.message : 'Failed to update progress';
    return res.status(400).json({ error: message });
  }
});

/**
 * POST /api/ceo/goals/:goalId/milestones
 * Add a milestone to a goal
 */
router.post('/:goalId/milestones', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { goalId } = req.params;
    const { title } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Milestone title is required' });
    }

    const goal = await addMilestone(userId, goalId, { title });

    return res.json(goal);
  } catch (error) {
    log.error({ error: String(error), goalId: req.params.goalId }, 'Failed to add milestone');
    const message = error instanceof Error ? error.message : 'Failed to add milestone';
    return res.status(400).json({ error: message });
  }
});

/**
 * POST /api/ceo/goals/:goalId/milestones/:milestoneId/complete
 * Complete a milestone
 */
router.post('/:goalId/milestones/:milestoneId/complete', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { goalId, milestoneId } = req.params;

    const goal = await completeMilestone(userId, goalId, milestoneId);

    return res.json(goal);
  } catch (error) {
    log.error(
      { error: String(error), goalId: req.params.goalId, milestoneId: req.params.milestoneId },
      'Failed to complete milestone'
    );
    const message = error instanceof Error ? error.message : 'Failed to complete milestone';
    return res.status(400).json({ error: message });
  }
});

export { router as goalsRoutes };
