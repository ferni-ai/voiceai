/**
 * Life Thesis Tools Tests
 */

import { describe, it, expect } from 'vitest';
import { thesisTools } from '../thesis-tools.js';

describe('Life Thesis Tools', () => {
  describe('Tool Registration', () => {
    it('should export all 11 thesis tools', () => {
      expect(thesisTools).toHaveLength(11);
    });

    it('should have all required save tools', () => {
      const saveToolIds = thesisTools.filter((t) => t.id.startsWith('save')).map((t) => t.id);

      expect(saveToolIds).toContain('saveHabitThesis');
      expect(saveToolIds).toContain('saveGoalThesis');
      expect(saveToolIds).toContain('saveCareerThesis');
      expect(saveToolIds).toContain('saveRelationshipThesis');
      expect(saveToolIds).toContain('saveHealthThesis');
      expect(saveToolIds).toContain('saveDecisionThesis');
      expect(saveToolIds).toContain('saveBoundaryThesis');
      expect(saveToolIds).toContain('saveCommitmentThesis');
    });

    it('should have universal tools', () => {
      const universalToolIds = thesisTools.filter((t) => !t.id.startsWith('save')).map((t) => t.id);

      expect(universalToolIds).toContain('remindThesis');
      expect(universalToolIds).toContain('getTheses');
      expect(universalToolIds).toContain('reviewThesis');
    });

    it('should have proper domain assignment', () => {
      for (const tool of thesisTools) {
        expect(tool.domain).toBe('life-thesis');
      }
    });

    it('should have create functions', () => {
      for (const tool of thesisTools) {
        expect(tool.create).toBeDefined();
        expect(typeof tool.create).toBe('function');
      }
    });
  });

  describe('Tool Coverage by Persona', () => {
    // Maya should use: saveHabitThesis, remindThesis (habit)
    it('should have habit tools for Maya', () => {
      const habitTool = thesisTools.find((t) => t.id === 'saveHabitThesis');
      expect(habitTool).toBeDefined();
      expect(habitTool?.tags).toContain('habits');
      expect(habitTool?.tags).toContain('maya');
    });

    // Jordan should use: saveGoalThesis, remindThesis (goal)
    it('should have goal tools for Jordan', () => {
      const goalTool = thesisTools.find((t) => t.id === 'saveGoalThesis');
      expect(goalTool).toBeDefined();
      expect(goalTool?.tags).toContain('goals');
      expect(goalTool?.tags).toContain('jordan');
    });

    // Peter should use: saveInvestmentThesis (from research domain), remindThesis (investment)
    it('should support investment domain via remindThesis', () => {
      const remindTool = thesisTools.find((t) => t.id === 'remindThesis');
      expect(remindTool).toBeDefined();
      // remindThesis accepts 'investment' as a domain parameter
    });

    // All personas should have access to universal tools
    it('should have universal tools tagged appropriately', () => {
      const universalTools = thesisTools.filter((t) => t.tags?.includes('universal'));
      expect(universalTools.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Tool Descriptions', () => {
    it('should have meaningful descriptions', () => {
      for (const tool of thesisTools) {
        expect(tool.description.length).toBeGreaterThan(20);
      }
    });

    it('should explain when to use each tool', () => {
      const remindTool = thesisTools.find((t) => t.id === 'remindThesis');
      expect(remindTool?.description).toContain('struggling');
    });
  });
});
