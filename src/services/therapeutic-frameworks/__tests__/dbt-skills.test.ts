/**
 * DBT Skills Library Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  selectDBTSkill,
  getSkillsByModule,
  getDBTSkill,
  recordSkillUse,
  getMostEffectiveSkills,
  getLearnedSkills,
  buildDBTContext,
  ALL_DBT_SKILLS,
  DISTRESS_TOLERANCE_SKILLS,
  EMOTION_REGULATION_SKILLS,
  INTERPERSONAL_SKILLS,
  MINDFULNESS_SKILLS,
} from '../dbt-skills.js';

describe('DBTSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Skill Libraries', () => {
    it('should have distress tolerance skills defined', () => {
      expect(DISTRESS_TOLERANCE_SKILLS.tipp).toBeDefined();
      expect(DISTRESS_TOLERANCE_SKILLS.stop).toBeDefined();
      expect(DISTRESS_TOLERANCE_SKILLS.accepts).toBeDefined();
      expect(DISTRESS_TOLERANCE_SKILLS.radical_acceptance).toBeDefined();
    });

    it('should have emotion regulation skills defined', () => {
      expect(EMOTION_REGULATION_SKILLS.please).toBeDefined();
      expect(EMOTION_REGULATION_SKILLS.opposite_action).toBeDefined();
      expect(EMOTION_REGULATION_SKILLS.check_the_facts).toBeDefined();
    });

    it('should have interpersonal skills defined', () => {
      expect(INTERPERSONAL_SKILLS.dear_man).toBeDefined();
      expect(INTERPERSONAL_SKILLS.give).toBeDefined();
      expect(INTERPERSONAL_SKILLS.fast).toBeDefined();
    });

    it('should have mindfulness skills defined', () => {
      expect(MINDFULNESS_SKILLS.what_skills).toBeDefined();
      expect(MINDFULNESS_SKILLS.how_skills).toBeDefined();
      expect(MINDFULNESS_SKILLS.wise_mind).toBeDefined();
    });

    it('should have all skills in combined library', () => {
      expect(Object.keys(ALL_DBT_SKILLS).length).toBeGreaterThan(10);
    });

    it('each skill should have required fields', () => {
      for (const skill of Object.values(ALL_DBT_SKILLS)) {
        expect(skill.id).toBeDefined();
        expect(skill.name).toBeDefined();
        expect(skill.module).toBeDefined();
        expect(skill.description).toBeDefined();
        expect(skill.steps).toBeDefined();
        expect(Array.isArray(skill.steps)).toBe(true);
      }
    });

    it('should have voice guidance for skills', () => {
      // Most skills should have voice guidance
      const skillsWithGuidance = Object.values(ALL_DBT_SKILLS).filter(
        (s) => s.voiceGuidance
      );
      expect(skillsWithGuidance.length).toBeGreaterThan(5);
    });
  });

  describe('selectDBTSkill', () => {
    it('should select TIPP for crisis-level emotion intensity', () => {
      const skill = selectDBTSkill({
        emotionIntensity: 0.9,
      });

      expect(skill.id).toBe('tipp');
    });

    it('should select TIPP for survive_crisis goal', () => {
      const skill = selectDBTSkill({
        goal: 'survive_crisis',
      });

      expect(skill.id).toBe('tipp');
    });

    it('should select STOP for impulsive keywords', () => {
      const skill = selectDBTSkill({
        keywords: ['about to send this text'],
      });

      expect(skill.id).toBe('stop');
    });

    it('should select radical acceptance for unchangeable situations', () => {
      const skill = selectDBTSkill({
        keywords: ["can't change this"],
      });

      expect(skill.id).toBe('radical_acceptance');
    });

    it('should select DEAR MAN for communication goal', () => {
      const skill = selectDBTSkill({
        goal: 'communicate',
      });

      expect(skill.id).toBe('dear_man');
    });

    it('should select Wise Mind for presence goal', () => {
      const skill = selectDBTSkill({
        goal: 'be_present',
      });

      expect(skill.id).toBe('wise_mind');
    });

    it('should select check_the_facts for regulate_emotion goal', () => {
      const skill = selectDBTSkill({
        goal: 'regulate_emotion',
      });

      expect(skill.id).toBe('check_the_facts');
    });

    it('should default to wise_mind when no specific criteria', () => {
      const skill = selectDBTSkill({});

      expect(skill.id).toBe('wise_mind');
    });
  });

  describe('getSkillsByModule', () => {
    it('should return distress tolerance skills', () => {
      const skills = getSkillsByModule('distress_tolerance');

      expect(skills.length).toBeGreaterThan(0);
      expect(skills.every((s) => s.module === 'distress_tolerance')).toBe(true);
    });

    it('should return emotion regulation skills', () => {
      const skills = getSkillsByModule('emotion_regulation');

      expect(skills.length).toBeGreaterThan(0);
      expect(skills.every((s) => s.module === 'emotion_regulation')).toBe(true);
    });

    it('should return interpersonal skills', () => {
      const skills = getSkillsByModule('interpersonal');

      expect(skills.length).toBeGreaterThan(0);
      expect(skills.every((s) => s.module === 'interpersonal')).toBe(true);
    });

    it('should return mindfulness skills', () => {
      const skills = getSkillsByModule('mindfulness');

      expect(skills.length).toBeGreaterThan(0);
      expect(skills.every((s) => s.module === 'mindfulness')).toBe(true);
    });
  });

  describe('getDBTSkill', () => {
    it('should return skill by ID', () => {
      const skill = getDBTSkill('tipp');

      expect(skill).toBeDefined();
      expect(skill?.id).toBe('tipp');
      expect(skill?.name).toBe('TIPP');
    });

    it('should return null for unknown skill', () => {
      const skill = getDBTSkill('nonexistent');

      expect(skill).toBeNull();
    });
  });

  describe('Skill Tracking', () => {
    const userId = 'test-user-123';

    it('should record skill use', () => {
      recordSkillUse(userId, 'tipp', { helpfulnessRating: 5 });

      const learned = getLearnedSkills(userId);
      expect(learned).toContain('tipp');
    });

    it('should track multiple skill uses', () => {
      recordSkillUse(userId + '-multi', 'tipp');
      recordSkillUse(userId + '-multi', 'stop');
      recordSkillUse(userId + '-multi', 'wise_mind');

      const learned = getLearnedSkills(userId + '-multi');
      expect(learned).toContain('tipp');
      expect(learned).toContain('stop');
      expect(learned).toContain('wise_mind');
    });

    it('should calculate most effective skills', () => {
      const trackUser = userId + '-effective';
      recordSkillUse(trackUser, 'tipp', { helpfulnessRating: 5 });
      recordSkillUse(trackUser, 'tipp', { helpfulnessRating: 5 });
      recordSkillUse(trackUser, 'stop', { helpfulnessRating: 3 });

      const effective = getMostEffectiveSkills(trackUser);
      expect(effective[0]).toBe('tipp');
    });

    it('should return empty array for user with no rated skills', () => {
      const effective = getMostEffectiveSkills('new-user');

      expect(effective).toEqual([]);
    });
  });

  describe('buildDBTContext', () => {
    it('should build context string with skill info', () => {
      const context = buildDBTContext('user-123', {
        emotionIntensity: 0.5,
      });

      expect(context).toContain('DBT SKILL');
      expect(context).toContain('Voice Guidance');
    });

    it('should include acronym meanings for skills with acronyms', () => {
      const context = buildDBTContext('user-123', {
        emotionIntensity: 0.9, // High intensity triggers TIPP skill
        keywords: ['crisis', 'overwhelmed'],
      });

      expect(context).toContain('TIPP');
      expect(context).toContain('Temperature');
    });

    it('should note when user has used skill before', () => {
      const learnedUser = 'learned-user-123';
      recordSkillUse(learnedUser, 'wise_mind');

      const context = buildDBTContext(learnedUser, {});

      expect(context).toContain('Wise Mind');
    });
  });

  describe('Skill Content Quality', () => {
    it('TIPP should have proper crisis intervention steps', () => {
      const tipp = DISTRESS_TOLERANCE_SKILLS.tipp;

      expect(tipp.whenToUse).toContain('crisis');
      expect(tipp.steps.length).toBe(4);
      expect(tipp.acronymMeaning?.T).toContain('Temperature');
    });

    it('DEAR MAN should have communication steps', () => {
      const dearMan = INTERPERSONAL_SKILLS.dear_man;

      expect(dearMan.acronymMeaning?.D).toContain('Describe');
      expect(dearMan.acronymMeaning?.E).toContain('Express');
      expect(dearMan.acronymMeaning?.A).toContain('Assert');
    });

    it('all skills should have non-empty steps', () => {
      for (const skill of Object.values(ALL_DBT_SKILLS)) {
        expect(skill.steps.length).toBeGreaterThan(0);
        skill.steps.forEach((step) => {
          expect(step.length).toBeGreaterThan(5);
        });
      }
    });
  });
});
