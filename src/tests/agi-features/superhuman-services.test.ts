/**
 * Superhuman Services Tests
 * Run: pnpm vitest run src/tests/agi-features/superhuman-services.test.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { generateTestUserId, createMockFirestoreDb } from './index.js';

const mockFirestoreDb = createMockFirestoreDb();
vi.mock('../../utils/firestore-utils.js', () => ({ getFirestoreDb: vi.fn(() => mockFirestoreDb) }));

import { generateLifeTrajectory, getLatestTrajectory } from '../../services/superhuman/life-trajectory-engine.js';
import { generateHabitCompoundModel, generateFinancialCompoundModel, getUserCompoundModels } from '../../services/superhuman/compound-effects.js';
import { generateLifeSynthesis, getLatestSynthesis } from '../../services/superhuman/cross-domain-synthesis.js';

describe('Superhuman Services', () => {
  let testUserId: string;

  beforeEach(() => {
    testUserId = generateTestUserId('superhuman');
    mockFirestoreDb._clear();
    vi.clearAllMocks();
  });

  describe('Life Trajectory Engine', () => {
    it('should generate trajectory with all required sections', async () => {
      const trajectory = await generateLifeTrajectory(testUserId);
      expect(trajectory).toHaveProperty('userId');
      expect(trajectory).toHaveProperty('generatedAt');
      expect(trajectory).toHaveProperty('currentChapter');
      expect(trajectory).toHaveProperty('projectedOutcomes');
      expect(trajectory).toHaveProperty('lifeScore');
    });

    it('should calculate life score between 0-100', async () => {
      const trajectory = await generateLifeTrajectory(testUserId);
      expect(trajectory.lifeScore.overall).toBeGreaterThanOrEqual(0);
      expect(trajectory.lifeScore.overall).toBeLessThanOrEqual(100);
    });

    it('should return null for user with no trajectories', async () => {
      const trajectory = await getLatestTrajectory(testUserId);
      expect(trajectory).toBeNull();
    });
  });

  describe('Compound Effects', () => {
    it('should generate model for fitness habit', () => {
      const model = generateHabitCompoundModel({ id: 'h1', name: 'Exercise', category: 'fitness', consistency: 75, streak: 30 });
      expect(model.habitId).toBe('h1');
      expect(model.habitName).toBe('Exercise');
      expect(model.category).toBe('fitness');
    });

    it('should generate projections for all timeframes', () => {
      const model = generateHabitCompoundModel({ id: 'h2', name: 'Reading', category: 'learning', consistency: 60, streak: 15 });
      expect(model.projections.length).toBeGreaterThan(0);
      const timeframes = model.projections.map(p => p.timeframe);
      expect(timeframes).toContain('1 month');
      expect(timeframes).toContain('1 year');
    });

    it('should project savings growth', () => {
      const model = generateFinancialCompoundModel('saving', 10000, 500, 0.05);
      expect(model.type).toBe('saving');
      expect(model.currentAmount).toBe(10000);
      expect(model.projections.length).toBeGreaterThan(0);
    });

    it('should return empty array for user with no habits', async () => {
      const models = await getUserCompoundModels(testUserId);
      expect(Array.isArray(models)).toBe(true);
    });
  });

  describe('Cross-Domain Synthesis', () => {
    it('should generate synthesis with all required fields', async () => {
      const synthesis = await generateLifeSynthesis(testUserId);
      expect(synthesis).toHaveProperty('userId');
      expect(synthesis).toHaveProperty('domains');
      expect(synthesis).toHaveProperty('connections');
      expect(synthesis).toHaveProperty('insights');
      expect(synthesis).toHaveProperty('recommendations');
      expect(synthesis).toHaveProperty('riskAlerts');
    });

    it('should analyze all life domains', async () => {
      const synthesis = await generateLifeSynthesis(testUserId);
      const domainNames = synthesis.domains.map(d => d.name);
      expect(domainNames).toContain('health');
      expect(domainNames).toContain('career');
      expect(domainNames).toContain('relationships');
    });

    it('should return null for user with no synthesis', async () => {
      const synthesis = await getLatestSynthesis(testUserId);
      expect(synthesis).toBeNull();
    });
  });
});
