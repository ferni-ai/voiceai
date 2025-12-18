/**
 * Jordan's Life's Firsts Tools - Unit Tests
 *
 * Tests for the new Life's Firsts tracking system, cultural celebrations,
 * first-time planning templates, and gift registry tools.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMilestone,
  getMilestone,
  getUserMilestones,
  updateMilestoneChecklist,
  addMilestoneMemory,
  MILESTONE_TEMPLATES,
  type MilestoneCategory,
} from '../tools/domains/life-planning/life-firsts-tracker.js';

import { CULTURAL_CELEBRATIONS } from '../tools/cultural-celebrations.js';

import { BABY_PLANNING, HOME_PLANNING, WEDDING_PLANNING } from '../tools/first-time-planning.js';

import {
  analyzeUserMilestones,
  getProactiveCheckIn,
  getMostUrgentMilestone,
  getMilestonesSummary,
} from '../tools/milestone-proactive.js';

describe("Jordan Life's Firsts Tools", () => {
  describe('Life Milestone Tracker', () => {
    it('should create a wedding milestone with default checklist', async () => {
      const milestone = await createMilestone(
        'test-user-1',
        'wedding',
        'Our Wedding',
        new Date('2025-06-15'),
        30000
      );

      expect(milestone).toBeDefined();
      expect(milestone.name).toBe('Our Wedding');
      expect(milestone.category).toBe('wedding');
      expect(milestone.budget).toBe(30000);
      expect(milestone.checklist.length).toBeGreaterThan(0);
      expect(milestone.status).toBe('planning');
    });

    it('should create a first baby milestone', async () => {
      const milestone = await createMilestone(
        'test-user-2',
        'first-baby',
        'Baby Smith',
        new Date('2025-09-01')
      );

      expect(milestone).toBeDefined();
      expect(milestone.category).toBe('first-baby');
      expect(milestone.checklist.length).toBeGreaterThan(10);

      // Should have baby-specific checklist items
      const hasCarSeat = milestone.checklist.some((item: { task: string }) =>
        item.task.toLowerCase().includes('car seat')
      );
      expect(hasCarSeat).toBe(true);
    });

    it('should create a first home milestone', async () => {
      const milestone = await createMilestone(
        'test-user-3',
        'first-home',
        'Our First House',
        new Date('2025-03-01'),
        15000
      );

      expect(milestone).toBeDefined();
      expect(milestone.category).toBe('first-home');

      // Should have home buying checklist items
      const hasPreApproval = milestone.checklist.some((item: { task: string }) =>
        item.task.toLowerCase().includes('pre-approved')
      );
      expect(hasPreApproval).toBe(true);
    });

    it('should retrieve milestone by ID', async () => {
      const created = await createMilestone(
        'test-user-4',
        'graduation',
        'College Graduation',
        new Date('2025-05-15')
      );

      const retrieved = getMilestone(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('College Graduation');
    });

    it('should get all milestones for a user', async () => {
      const userId = 'test-user-5';

      await createMilestone(userId, 'wedding', 'Wedding');
      await createMilestone(userId, 'first-home', 'House');
      await createMilestone(userId, 'first-baby', 'Baby');

      const milestones = await getUserMilestones(userId);

      expect(milestones.length).toBe(3);
    });

    it('should update checklist items', async () => {
      const milestone = await createMilestone('test-user-6', 'wedding', 'Test Wedding');

      const firstTask = milestone.checklist[0];
      expect(firstTask.completed).toBe(false);

      const updated = updateMilestoneChecklist(milestone.id, firstTask.id, true);

      expect(updated?.checklist[0].completed).toBe(true);
    });

    it('should add memories to milestones', async () => {
      const milestone = await createMilestone('test-user-7', 'wedding', 'Memory Test Wedding');

      expect(milestone.memories.length).toBe(0);

      const updated = addMilestoneMemory(milestone.id, 'highlight', 'Found the perfect venue!');

      expect(updated?.memories.length).toBe(1);
      expect(updated?.memories[0].type).toBe('highlight');
      expect(updated?.memories[0].content).toBe('Found the perfect venue!');
    });

    it('should support cultural celebrations', async () => {
      const milestone = await createMilestone(
        'test-user-8',
        'coming-of-age',
        "Sofia's Quinceañera",
        new Date('2025-08-15'),
        15000,
        'quinceanera'
      );

      expect(milestone.culturalType).toBe('quinceanera');
    });
  });

  describe('Milestone Templates', () => {
    it('should have templates for all milestone categories', () => {
      const expectedCategories: MilestoneCategory[] = [
        'first-home',
        'first-baby',
        'wedding',
        'engagement',
        'graduation',
        'milestone-birthday',
        'retirement',
        'first-job',
        'first-car',
        'first-pet',
        'first-solo-trip',
        'college-sendoff',
        'coming-of-age',
        'anniversary',
        'memorial',
        'other',
      ];

      expectedCategories.forEach((category) => {
        const template = MILESTONE_TEMPLATES[category];
        expect(template).toBeDefined();
        expect(template.name).toBeTruthy();
        expect(template.description).toBeTruthy();
        expect(template.defaultChecklist.length).toBeGreaterThan(0);
        expect(template.tips.length).toBeGreaterThan(0);
        expect(template.typicalTimeline).toBeTruthy();
        expect(template.budgetRange).toBeDefined();
        expect(template.budgetRange.low).toBeDefined();
        expect(template.budgetRange.high).toBeDefined();
      });
    });

    it('should have wedding template with correct checklist', () => {
      const template = MILESTONE_TEMPLATES['wedding'];

      expect(template.name).toBe('Wedding');
      expect(template.typicalTimeline).toBe('12-18 months');

      const taskNames = template.defaultChecklist.map((t) => t.task.toLowerCase());
      expect(taskNames.some((t) => t.includes('venue'))).toBe(true);
      expect(taskNames.some((t) => t.includes('photographer'))).toBe(true);
      expect(taskNames.some((t) => t.includes('invitation'))).toBe(true);
    });

    it('should have first baby template with correct checklist', () => {
      const template = MILESTONE_TEMPLATES['first-baby'];

      expect(template.name).toBe('First Baby');
      expect(template.typicalTimeline).toBe('9 months');

      const taskNames = template.defaultChecklist.map((t) => t.task.toLowerCase());
      expect(taskNames.some((t) => t.includes('car seat'))).toBe(true);
      expect(taskNames.some((t) => t.includes('pediatrician'))).toBe(true);
      expect(taskNames.some((t) => t.includes('nursery'))).toBe(true);
    });
  });

  describe('Cultural Celebrations Database', () => {
    it('should have quinceañera details', () => {
      const quinceanera = CULTURAL_CELEBRATIONS['quinceanera'];

      expect(quinceanera).toBeDefined();
      expect(quinceanera.name).toBe('Quinceañera');
      expect(quinceanera.culture).toBe('Latin American');
      expect(quinceanera.typicalAge).toBe(15);
      expect(quinceanera.traditions.length).toBeGreaterThan(3);
      expect(quinceanera.planningTimeline).toBe('9-12 months');
    });

    it('should have bar mitzvah details', () => {
      const barMitzvah = CULTURAL_CELEBRATIONS['bar-mitzvah'];

      expect(barMitzvah).toBeDefined();
      expect(barMitzvah.name).toBe('Bar Mitzvah');
      expect(barMitzvah.culture).toBe('Jewish');
      expect(barMitzvah.typicalAge).toBe(13);
      expect(barMitzvah.traditions.length).toBeGreaterThan(3);
    });

    it('should have bat mitzvah details', () => {
      const batMitzvah = CULTURAL_CELEBRATIONS['bat-mitzvah'];

      expect(batMitzvah).toBeDefined();
      expect(batMitzvah.name).toBe('Bat Mitzvah');
      expect(batMitzvah.culture).toBe('Jewish');
    });

    it('should have sweet sixteen details', () => {
      const sweetSixteen = CULTURAL_CELEBRATIONS['sweet-sixteen'];

      expect(sweetSixteen).toBeDefined();
      expect(sweetSixteen.name).toBe('Sweet Sixteen');
      expect(sweetSixteen.typicalAge).toBe(16);
    });

    it('should have modern twists for cultural celebrations', () => {
      const quinceanera = CULTURAL_CELEBRATIONS['quinceanera'];
      expect(quinceanera.modernTwists.length).toBeGreaterThan(0);

      const barMitzvah = CULTURAL_CELEBRATIONS['bar-mitzvah'];
      expect(barMitzvah.modernTwists.length).toBeGreaterThan(0);
    });
  });

  describe('First-Time Planning Templates', () => {
    describe('Baby Planning', () => {
      it('should have nursery essentials', () => {
        const { essentials } = BABY_PLANNING.nurseryShopping;

        expect(essentials.length).toBeGreaterThan(5);

        const hasRequiredItems = essentials.some((item) => item.priority === 'must-have');
        expect(hasRequiredItems).toBe(true);
      });

      it('should have hospital bag checklists', () => {
        expect(BABY_PLANNING.hospitalBag.forMom.length).toBeGreaterThan(5);
        expect(BABY_PLANNING.hospitalBag.forBaby.length).toBeGreaterThan(3);
        expect(BABY_PLANNING.hospitalBag.forPartner.length).toBeGreaterThan(3);
      });

      it('should have baby shower themes', () => {
        expect(BABY_PLANNING.babyShowerThemes.length).toBeGreaterThan(5);

        const hasThemeDetails = BABY_PLANNING.babyShowerThemes.every(
          (theme) => theme.theme && theme.colors && theme.style
        );
        expect(hasThemeDetails).toBe(true);
      });
    });

    describe('Home Planning', () => {
      it('should have moving checklist for all phases', () => {
        expect(HOME_PLANNING.movingChecklist.twoMonthsBefore.length).toBeGreaterThan(3);
        expect(HOME_PLANNING.movingChecklist.oneMonthBefore.length).toBeGreaterThan(3);
        expect(HOME_PLANNING.movingChecklist.oneWeekBefore.length).toBeGreaterThan(3);
        expect(HOME_PLANNING.movingChecklist.movingDay.length).toBeGreaterThan(3);
        expect(HOME_PLANNING.movingChecklist.firstWeek.length).toBeGreaterThan(3);
      });

      it('should have housewarming party guidance', () => {
        expect(HOME_PLANNING.housewarmingParty.timing).toBeTruthy();
        expect(HOME_PLANNING.housewarmingParty.checklist.length).toBeGreaterThan(5);
        expect(HOME_PLANNING.housewarmingParty.tips.length).toBeGreaterThan(2);
      });

      it('should have first year home maintenance checklist', () => {
        expect(HOME_PLANNING.firstYearHomeChecklist.length).toBeGreaterThan(5);

        const hasTimingInfo = HOME_PLANNING.firstYearHomeChecklist.every(
          (item) => item.task && item.when
        );
        expect(hasTimingInfo).toBe(true);
      });
    });

    describe('Wedding Planning', () => {
      it('should have timeline for all phases', () => {
        const { timeline } = WEDDING_PLANNING;

        expect(Object.keys(timeline).length).toBeGreaterThan(4);

        // Check each phase has tasks
        Object.values(timeline).forEach((tasks) => {
          expect(tasks.length).toBeGreaterThan(3);
        });
      });

      it('should have budget breakdown', () => {
        const breakdown = WEDDING_PLANNING.budgetBreakdown;

        expect(breakdown.venue).toBeTruthy();
        expect(breakdown.photography).toBeTruthy();
        expect(breakdown.music).toBeTruthy();
        expect(breakdown.flowers).toBeTruthy();
      });

      it('should have saving tips', () => {
        expect(WEDDING_PLANNING.savingTips.length).toBeGreaterThan(5);
      });
    });
  });

  describe('Handoff Triggers for Jordan', () => {
    // Test that common life milestone phrases trigger Jordan handoff

    it('should have triggers for first home', async () => {
      const { shouldHandoffToJordan } = await import('../tools/handoff/index.js');

      expect(shouldHandoffToJordan("I'm buying my first home")).toBe(true);
      expect(shouldHandoffToJordan('we are moving to a new house')).toBe(true);
      expect(shouldHandoffToJordan('planning a housewarming party')).toBe(true);
    });

    it('should have triggers for first baby', async () => {
      const { shouldHandoffToJordan } = await import('../tools/handoff/index.js');

      expect(shouldHandoffToJordan("we're expecting our first baby")).toBe(true);
      expect(shouldHandoffToJordan('planning a baby shower')).toBe(true);
      expect(shouldHandoffToJordan('setting up the nursery')).toBe(true);
    });

    it('should have triggers for wedding', async () => {
      const { shouldHandoffToJordan } = await import('../tools/handoff/index.js');

      expect(shouldHandoffToJordan('planning our wedding')).toBe(true);
      expect(shouldHandoffToJordan('just got engaged')).toBe(true);
      expect(shouldHandoffToJordan('bridal shower ideas')).toBe(true);
    });

    it('should have triggers for cultural celebrations', async () => {
      const { shouldHandoffToJordan } = await import('../tools/handoff/index.js');

      expect(shouldHandoffToJordan('planning a quinceañera')).toBe(true);
      expect(shouldHandoffToJordan('bar mitzvah preparation')).toBe(true);
      expect(shouldHandoffToJordan('sweet sixteen party')).toBe(true);
    });

    it('should have triggers for milestone birthdays', async () => {
      const { shouldHandoffToJordan } = await import('../tools/handoff/index.js');

      expect(shouldHandoffToJordan('planning my 30th birthday')).toBe(true);
      expect(shouldHandoffToJordan('milestone birthday celebration')).toBe(true);
      expect(shouldHandoffToJordan('turning 50 party')).toBe(true);
    });

    it('should have triggers for graduation', async () => {
      const { shouldHandoffToJordan } = await import('../tools/handoff/index.js');

      expect(shouldHandoffToJordan('graduation party')).toBe(true);
      expect(shouldHandoffToJordan('going to college soon')).toBe(true);
      expect(shouldHandoffToJordan('college send-off')).toBe(true);
    });

    it('should have triggers for gift management', async () => {
      const { shouldHandoffToJordan } = await import('../tools/handoff/index.js');

      expect(shouldHandoffToJordan('creating a gift registry')).toBe(true);
      expect(shouldHandoffToJordan('thank you notes to write')).toBe(true);
    });
  });

  describe('Proactive Milestone System', () => {
    it('should analyze user milestones and determine urgency', async () => {
      const userId = 'proactive-test-user';

      // Create a milestone with a date 10 days away
      const tenDaysFromNow = new Date();
      tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);

      await createMilestone(userId, 'wedding', 'Urgent Wedding', tenDaysFromNow);

      const urgencies = await analyzeUserMilestones(userId);

      expect(urgencies.length).toBeGreaterThan(0);
      expect(urgencies[0].milestoneName).toBe('Urgent Wedding');
      expect(urgencies[0].urgency).toBe('urgent'); // 10 days = urgent
    });

    it('should return relaxed urgency for far-away milestones', async () => {
      const userId = 'proactive-test-user-2';

      // Create a milestone 6 months away
      const sixMonthsFromNow = new Date();
      sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

      await createMilestone(userId, 'wedding', 'Relaxed Wedding', sixMonthsFromNow);

      const urgencies = await analyzeUserMilestones(userId);
      const wedding = urgencies.find(
        (u: { milestoneName: string }) => u.milestoneName === 'Relaxed Wedding'
      );

      expect(wedding).toBeDefined();
      expect(wedding?.urgency).toBe('relaxed');
    });

    it('should generate proactive check-in messages', async () => {
      const userId = 'proactive-test-user-3';

      const oneMonthFromNow = new Date();
      oneMonthFromNow.setDate(oneMonthFromNow.getDate() + 25);

      const milestone = await createMilestone(
        userId,
        'first-baby',
        'Baby Check-In',
        oneMonthFromNow
      );

      const checkIn = getProactiveCheckIn(milestone);

      expect(checkIn).toBeDefined();
      expect(checkIn.length).toBeGreaterThan(50); // Should be substantial message
      // Check-in should mention time remaining (days OR month for 25-day window)
      expect(checkIn.includes('days') || checkIn.includes('month')).toBe(true);
    });

    it('should get the most urgent milestone', async () => {
      const userId = 'proactive-test-user-4';

      // Create one far away and one close
      const farDate = new Date();
      farDate.setMonth(farDate.getMonth() + 6);

      const closeDate = new Date();
      closeDate.setDate(closeDate.getDate() + 5);

      await createMilestone(userId, 'first-home', 'Far Home', farDate);
      await createMilestone(userId, 'wedding', 'Close Wedding', closeDate);

      const mostUrgent = await getMostUrgentMilestone(userId);

      expect(mostUrgent).toBeDefined();
      expect(mostUrgent?.milestoneName).toBe('Close Wedding');
    });

    it('should generate a milestone summary', async () => {
      const userId = 'proactive-test-user-5';

      const date1 = new Date();
      date1.setMonth(date1.getMonth() + 2);

      const date2 = new Date();
      date2.setMonth(date2.getMonth() + 4);

      await createMilestone(userId, 'graduation', 'Graduation', date1);
      await createMilestone(userId, 'first-home', 'New House', date2);

      const summary = await getMilestonesSummary(userId);

      expect(summary).toContain('2 milestones');
      expect(summary).toContain('Graduation');
      expect(summary).toContain('New House');
    });

    it('should return empty message when no milestones', async () => {
      const summary = await getMilestonesSummary('user-with-no-milestones');

      expect(summary).toContain('No upcoming milestones');
    });

    it('should calculate progress percentage correctly', async () => {
      const userId = 'proactive-test-user-6';

      const date = new Date();
      date.setMonth(date.getMonth() + 1);

      const milestone = await createMilestone(userId, 'wedding', 'Progress Test Wedding', date);

      // Complete some tasks
      if (milestone.checklist.length > 0) {
        updateMilestoneChecklist(milestone.id, milestone.checklist[0].id, true);
        updateMilestoneChecklist(milestone.id, milestone.checklist[1].id, true);
      }

      const urgencies = await analyzeUserMilestones(userId);
      const wedding = urgencies.find(
        (u: { milestoneName: string }) => u.milestoneName === 'Progress Test Wedding'
      );

      expect(wedding).toBeDefined();
      expect(wedding?.progressPercent).toBeGreaterThan(0);
      expect(wedding?.incompleteTasks).toBeLessThan(wedding?.totalTasks || 0);
    });
  });
});
