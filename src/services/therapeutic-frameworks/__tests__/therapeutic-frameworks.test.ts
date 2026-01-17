/**
 * Therapeutic Frameworks Tests
 *
 * Tests for evidence-based therapeutic frameworks adapted for voice coaching.
 * Includes ACT (values, defusion), DBT skills, and Motivational Interviewing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock persistence
vi.mock('../../persistence/index.js', () => ({
  createPersistenceStore: vi.fn(() => ({
    load: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    flushUser: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  })),
}));

import {
  // Unified API
  buildTherapeuticContext,
  getTherapeuticSummary,
  // ACT Values
  detectValuesInSpeech,
  recordValue,
  getUserValues,
  getTopValues,
  buildValuesContext,
  checkValuesAlignment,
  getValuesQuestion,
  VALUES_QUESTIONS,
  VALUE_EXAMPLES,
  // ACT Defusion
  DEFUSION_TECHNIQUES,
  selectDefusionTechnique,
  getDefusionTechnique,
  getAllDefusionTechniques,
  recordDefusionUse,
  buildDefusionContext,
  // DBT Skills
  DISTRESS_TOLERANCE_SKILLS,
  EMOTION_REGULATION_SKILLS,
  MINDFULNESS_SKILLS,
  INTERPERSONAL_SKILLS,
  ALL_DBT_SKILLS,
  selectDBTSkill,
  getDBTSkill,
  getSkillsByModule,
  recordSkillUse,
  buildDBTContext,
  // Motivational Interviewing
  detectChangeTalk,
  detectSustainTalk,
  getStrongestChangeTalk,
  recordChangeTalk,
  buildMIContext,
  CHANGE_TALK_PATTERNS,
  OPEN_QUESTIONS,
  REFLECTION_TEMPLATES,
  generateOARSResponse,
} from '../index.js';

describe('TherapeuticFrameworks', () => {
  const testUserId = 'test-user-' + Date.now();

  describe('Unified API - buildTherapeuticContext', () => {
    it('should build context with high emotion intensity', () => {
      const result = buildTherapeuticContext(testUserId, "I'm feeling really overwhelmed", {
        emotionIntensity: 0.8,
        enableDBT: true,
      });

      expect(result.hasContext).toBe(true);
      expect(result.frameworks).toContain('dbt');
      expect(result.primaryRecommendation).toBe('dbt_skill');
    });

    it('should include MI for non-new relationships', () => {
      const result = buildTherapeuticContext(testUserId, 'I want to start exercising more', {
        relationshipStage: 'building',
        enableMI: true,
        emotionIntensity: 0.4,
      });

      expect(result.frameworks).toContain('mi');
    });

    it('should not include MI for new users', () => {
      const result = buildTherapeuticContext(testUserId, 'I want to start exercising', {
        relationshipStage: 'new',
        enableMI: true,
        emotionIntensity: 0.4,
      });

      expect(result.frameworks).not.toContain('mi');
    });

    it('should respect enable flags', () => {
      const result = buildTherapeuticContext(testUserId, "I'm feeling stressed", {
        emotionIntensity: 0.8,
        enableDBT: false,
        enableMI: false,
        enableACT: false,
      });

      expect(result.frameworks).toEqual([]);
    });

    it('should detect sustain talk when present', () => {
      const result = buildTherapeuticContext(testUserId, "I can't do this, nothing works", {
        relationshipStage: 'building',
        enableMI: true,
      });

      expect(result.hasSustainTalk).toBe(true);
      expect(result.sustainTalkPatterns?.length).toBeGreaterThan(0);
    });
  });

  describe('getTherapeuticSummary', () => {
    it('should return summary object', () => {
      const summary = getTherapeuticSummary(testUserId);

      expect(summary).toHaveProperty('hasData');
      expect(summary).toHaveProperty('valuesIdentified');
      expect(summary).toHaveProperty('topValues');
      expect(summary).toHaveProperty('changeTalkTopics');
    });
  });

  describe('ACT Values', () => {
    describe('detectValuesInSpeech', () => {
      it('should detect direct value statements', () => {
        const detected = detectValuesInSpeech('I really value honesty in my relationships');

        expect(detected.length).toBeGreaterThan(0);
        expect(detected[0].value.toLowerCase()).toContain('honesty');
        expect(detected[0].confidence).toBeGreaterThanOrEqual(0.8);
      });

      it('should detect "important to me" patterns', () => {
        const detected = detectValuesInSpeech('Family is really important to me');

        expect(detected.length).toBeGreaterThan(0);
      });

      it('should detect "I care about" patterns', () => {
        const detected = detectValuesInSpeech('I care a lot about helping others');

        expect(detected.length).toBeGreaterThan(0);
      });

      it('should detect "I want to be" patterns', () => {
        const detected = detectValuesInSpeech('I want to be more present with my kids');

        expect(detected.length).toBeGreaterThan(0);
      });

      it('should return empty for non-value statements', () => {
        const detected = detectValuesInSpeech('The weather is nice today');

        expect(detected.length).toBe(0);
      });
    });

    describe('VALUES_QUESTIONS', () => {
      it('should have questions for all domains', () => {
        const domains = [
          'relationships',
          'work',
          'health',
          'growth',
          'leisure',
          'spirituality',
          'community',
          'environment',
        ];

        for (const domain of domains) {
          expect(VALUES_QUESTIONS[domain as keyof typeof VALUES_QUESTIONS]).toBeDefined();
          expect(VALUES_QUESTIONS[domain as keyof typeof VALUES_QUESTIONS].length).toBeGreaterThan(
            0
          );
        }
      });
    });

    describe('VALUE_EXAMPLES', () => {
      it('should have examples for all domains', () => {
        const domains = [
          'relationships',
          'work',
          'health',
          'growth',
          'leisure',
          'spirituality',
          'community',
          'environment',
        ];

        for (const domain of domains) {
          expect(VALUE_EXAMPLES[domain as keyof typeof VALUE_EXAMPLES]).toBeDefined();
          expect(VALUE_EXAMPLES[domain as keyof typeof VALUE_EXAMPLES].length).toBeGreaterThan(0);
        }
      });
    });

    describe('getValuesQuestion', () => {
      it('should return a question for a domain', () => {
        const question = getValuesQuestion('relationships');

        expect(typeof question).toBe('string');
        expect(question.length).toBeGreaterThan(0);
      });
    });
  });

  describe('ACT Defusion', () => {
    describe('DEFUSION_TECHNIQUES', () => {
      it('should have multiple techniques', () => {
        const techniques = getAllDefusionTechniques();

        expect(techniques.length).toBeGreaterThan(0);
      });

      it('should have required properties for each technique', () => {
        const techniques = getAllDefusionTechniques();

        for (const technique of techniques) {
          expect(technique.id).toBeDefined();
          expect(technique.name).toBeDefined();
          expect(technique.description).toBeDefined();
        }
      });
    });

    describe('selectDefusionTechnique', () => {
      it('should return a technique for a thought', () => {
        const technique = selectDefusionTechnique({
          thought: "I'm a failure and nothing will ever get better",
          emotionIntensity: 0.7,
        });

        expect(technique).toBeDefined();
        expect(technique?.id).toBeDefined();
      });
    });

    describe('getDefusionTechnique', () => {
      it('should return technique by ID', () => {
        const techniques = getAllDefusionTechniques();
        if (techniques.length > 0) {
          const technique = getDefusionTechnique(techniques[0].id);
          expect(technique).toBeDefined();
          expect(technique?.id).toBe(techniques[0].id);
        }
      });

      it('should return null for unknown ID', () => {
        const technique = getDefusionTechnique('unknown-technique-id');
        expect(technique).toBeNull();
      });
    });
  });

  describe('DBT Skills', () => {
    describe('Skill Categories', () => {
      it('should have distress tolerance skills', () => {
        expect(Object.keys(DISTRESS_TOLERANCE_SKILLS).length).toBeGreaterThan(0);
      });

      it('should have emotion regulation skills', () => {
        expect(Object.keys(EMOTION_REGULATION_SKILLS).length).toBeGreaterThan(0);
      });

      it('should have mindfulness skills', () => {
        expect(Object.keys(MINDFULNESS_SKILLS).length).toBeGreaterThan(0);
      });

      it('should have interpersonal skills', () => {
        expect(Object.keys(INTERPERSONAL_SKILLS).length).toBeGreaterThan(0);
      });

      it('should have all skills combined', () => {
        expect(Object.keys(ALL_DBT_SKILLS).length).toBeGreaterThan(0);
      });
    });

    describe('Skill Properties', () => {
      it('should have required properties for TIPP', () => {
        const tipp = DISTRESS_TOLERANCE_SKILLS.tipp;

        expect(tipp.id).toBe('tipp');
        expect(tipp.name).toBe('TIPP');
        expect(tipp.module).toBe('distress_tolerance');
        expect(tipp.description).toBeDefined();
        expect(tipp.whenToUse).toBeDefined();
        expect(tipp.steps).toBeDefined();
        expect(tipp.voiceGuidance).toBeDefined();
      });

      it('should have required properties for STOP', () => {
        const stop = DISTRESS_TOLERANCE_SKILLS.stop;

        expect(stop.id).toBe('stop');
        expect(stop.name).toBe('STOP');
        expect(stop.acronym).toBe('STOP');
        expect(stop.acronymMeaning).toBeDefined();
      });
    });

    describe('selectDBTSkill', () => {
      it('should select skill for high emotion intensity', () => {
        const skill = selectDBTSkill({
          emotionIntensity: 0.9,
          keywords: ['panic', 'cant', 'breathe'],
        });

        expect(skill).toBeDefined();
        expect(skill?.module).toBe('distress_tolerance');
      });

      it('should select skill based on keywords', () => {
        const skill = selectDBTSkill({
          emotionIntensity: 0.5,
          keywords: ['angry', 'text', 'regret'],
        });

        expect(skill).toBeDefined();
      });
    });

    describe('getDBTSkill', () => {
      it('should return skill by ID', () => {
        const skill = getDBTSkill('tipp');

        expect(skill).toBeDefined();
        expect(skill?.id).toBe('tipp');
      });

      it('should return null for unknown skill', () => {
        const skill = getDBTSkill('nonexistent');

        expect(skill).toBeNull();
      });
    });

    describe('getSkillsByModule', () => {
      it('should return skills for distress tolerance', () => {
        const skills = getSkillsByModule('distress_tolerance');

        expect(skills.length).toBeGreaterThan(0);
        for (const skill of skills) {
          expect(skill.module).toBe('distress_tolerance');
        }
      });

      it('should return skills for emotion regulation', () => {
        const skills = getSkillsByModule('emotion_regulation');

        expect(skills.length).toBeGreaterThan(0);
      });
    });

    describe('buildDBTContext', () => {
      it('should build context for high intensity emotions', () => {
        const context = buildDBTContext(testUserId, {
          emotionIntensity: 0.85,
          keywords: ['overwhelmed', 'panic'],
        });

        expect(context).toBeDefined();
        expect(typeof context).toBe('string');
        expect(context?.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Motivational Interviewing', () => {
    describe('CHANGE_TALK_PATTERNS', () => {
      it('should have patterns for all change talk types', () => {
        const types = ['desire', 'ability', 'reasons', 'need', 'commitment', 'taking_steps'];

        for (const type of types) {
          expect(CHANGE_TALK_PATTERNS[type as keyof typeof CHANGE_TALK_PATTERNS]).toBeDefined();
          expect(
            CHANGE_TALK_PATTERNS[type as keyof typeof CHANGE_TALK_PATTERNS].length
          ).toBeGreaterThan(0);
        }
      });
    });

    describe('detectChangeTalk', () => {
      it('should detect desire change talk', () => {
        const instances = detectChangeTalk('I really want to start eating healthier');

        expect(instances.length).toBeGreaterThan(0);
        expect(instances.some((i) => i.type === 'desire')).toBe(true);
      });

      it('should detect ability change talk', () => {
        const instances = detectChangeTalk('I think I can do this if I try');

        expect(instances.length).toBeGreaterThan(0);
        expect(instances.some((i) => i.type === 'ability')).toBe(true);
      });

      it('should detect commitment change talk', () => {
        const instances = detectChangeTalk("I'm going to start exercising tomorrow");

        expect(instances.length).toBeGreaterThan(0);
        expect(instances.some((i) => i.type === 'commitment')).toBe(true);
      });

      it('should detect taking steps change talk', () => {
        const instances = detectChangeTalk('I already started meal prepping this week');

        expect(instances.length).toBeGreaterThan(0);
        expect(instances.some((i) => i.type === 'taking_steps')).toBe(true);
      });

      it('should detect need change talk', () => {
        const instances = detectChangeTalk('I really need to get my health in order');

        expect(instances.length).toBeGreaterThan(0);
        expect(instances.some((i) => i.type === 'need')).toBe(true);
      });

      it('should detect reasons change talk', () => {
        const instances = detectChangeTalk('Because my family depends on me being healthy');

        expect(instances.length).toBeGreaterThan(0);
        expect(instances.some((i) => i.type === 'reasons')).toBe(true);
      });

      it('should boost strength for emphatic statements', () => {
        const normalInstances = detectChangeTalk('I want to change');
        const emphaticInstances = detectChangeTalk('I really definitely want to change');

        if (normalInstances.length > 0 && emphaticInstances.length > 0) {
          expect(emphaticInstances[0].strength).toBeGreaterThan(normalInstances[0].strength);
        }
      });

      it('should return empty for non-change talk', () => {
        const instances = detectChangeTalk('The sky is blue today');

        expect(instances.length).toBe(0);
      });
    });

    describe('detectSustainTalk', () => {
      it("should detect 'I can't' sustain talk", () => {
        const result = detectSustainTalk("I can't do this anymore");

        expect(result.detected).toBe(true);
        expect(result.patterns.length).toBeGreaterThan(0);
      });

      it("should detect 'nothing works' sustain talk", () => {
        const result = detectSustainTalk("I've tried everything, nothing works");

        expect(result.detected).toBe(true);
      });

      it("should detect 'too hard' sustain talk", () => {
        const result = detectSustainTalk("It's too hard to keep going");

        expect(result.detected).toBe(true);
      });

      it('should not detect sustain talk in positive statements', () => {
        const result = detectSustainTalk("I'm making progress and feeling good");

        expect(result.detected).toBe(false);
      });
    });

    describe('getStrongestChangeTalk', () => {
      it('should return commitment as strongest', () => {
        const instances = detectChangeTalk("I'm going to start tomorrow, I want this");
        const strongest = getStrongestChangeTalk(instances);

        // Commitment has higher strength than desire
        if (instances.some((i) => i.type === 'commitment')) {
          expect(strongest).toBe('commitment');
        }
      });

      it('should return null for empty array', () => {
        const strongest = getStrongestChangeTalk([]);

        expect(strongest).toBeNull();
      });
    });

    describe('OARS Response', () => {
      it('should have open questions for various change talk types', () => {
        // OPEN_QUESTIONS is a Record<ChangeTalk | 'general', string[]>
        expect(Object.keys(OPEN_QUESTIONS).length).toBeGreaterThan(0);
        expect(OPEN_QUESTIONS.general).toBeDefined();
        expect(OPEN_QUESTIONS.general.length).toBeGreaterThan(0);
      });

      it('should have reflection templates', () => {
        expect(REFLECTION_TEMPLATES.length).toBeGreaterThan(0);
      });

      it('should generate OARS response with change talk', () => {
        // generateOARSResponse takes detected change talk instances, not raw statements
        const changeTalk = detectChangeTalk('I want to quit smoking');
        const response = generateOARSResponse({
          changeTalk,
          topic: 'smoking',
        });

        expect(response).toBeDefined();
        expect(response.type).toBeDefined();
        expect(response.response).toBeDefined();
      });
    });

    describe('buildMIContext', () => {
      it('should build context with change talk', () => {
        const context = buildMIContext(
          testUserId,
          'I really want to start taking better care of myself',
          'health'
        );

        expect(context).toBeDefined();
        if (context) {
          expect(typeof context).toBe('string');
        }
      });
    });
  });
});
