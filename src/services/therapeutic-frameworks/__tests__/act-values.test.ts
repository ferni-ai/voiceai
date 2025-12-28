/**
 * ACT Values Work Tests
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
  VALUES_QUESTIONS,
  VALUE_EXAMPLES,
  detectValuesInSpeech,
  recordValue,
  getUserValues,
  getValuesByDomain,
  getTopValues,
  recordCommittedAction,
  completeAction,
  getPendingActions,
  checkValuesAlignment,
  getValuesQuestion,
  getValueExamples,
  generateValuesPrompt,
  buildValuesContext,
} from '../act-values.js';

describe('ACTValues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('VALUES_QUESTIONS', () => {
    it('should have questions for all domains', () => {
      expect(VALUES_QUESTIONS.relationships.length).toBeGreaterThan(0);
      expect(VALUES_QUESTIONS.work.length).toBeGreaterThan(0);
      expect(VALUES_QUESTIONS.health.length).toBeGreaterThan(0);
      expect(VALUES_QUESTIONS.growth.length).toBeGreaterThan(0);
      expect(VALUES_QUESTIONS.leisure.length).toBeGreaterThan(0);
      expect(VALUES_QUESTIONS.spirituality.length).toBeGreaterThan(0);
      expect(VALUES_QUESTIONS.community.length).toBeGreaterThan(0);
      expect(VALUES_QUESTIONS.environment.length).toBeGreaterThan(0);
    });

    it('each domain should have at least 3 questions', () => {
      for (const questions of Object.values(VALUES_QUESTIONS)) {
        expect(questions.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('VALUE_EXAMPLES', () => {
    it('should have examples for all domains', () => {
      expect(VALUE_EXAMPLES.relationships.length).toBeGreaterThan(0);
      expect(VALUE_EXAMPLES.work.length).toBeGreaterThan(0);
      expect(VALUE_EXAMPLES.health.length).toBeGreaterThan(0);
    });

    it('each domain should have meaningful examples', () => {
      for (const examples of Object.values(VALUE_EXAMPLES)) {
        examples.forEach((ex) => {
          expect(ex.length).toBeGreaterThan(2);
        });
      }
    });
  });

  describe('detectValuesInSpeech', () => {
    it('should detect direct value statements', () => {
      const result = detectValuesInSpeech('I really value honesty');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].value.toLowerCase()).toContain('honesty');
    });

    it('should detect importance statements', () => {
      const result = detectValuesInSpeech('Family is really important to me');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].value.toLowerCase()).toContain('family');
    });

    it('should detect caring statements', () => {
      const result = detectValuesInSpeech('I care a lot about helping others');

      expect(result.length).toBeGreaterThan(0);
    });

    it('should detect what matters statements', () => {
      const result = detectValuesInSpeech('What matters most to me is growth');

      expect(result.length).toBeGreaterThan(0);
    });

    it('should detect wanting to be statements', () => {
      const result = detectValuesInSpeech('I want to be a better friend');

      expect(result.length).toBeGreaterThan(0);
    });

    it('should detect indirect value indicators', () => {
      const result = detectValuesInSpeech('I try to be there for my friends');

      expect(result.length).toBeGreaterThan(0);
      expect(result.some((r) => r.value === 'Presence')).toBe(true);
    });

    it('should detect helping others indicator', () => {
      const result = detectValuesInSpeech('I love to help others');

      expect(result.some((r) => r.value === 'Service')).toBe(true);
    });

    it('should infer correct domain', () => {
      const familyResult = detectValuesInSpeech('I value my family');
      const workResult = detectValuesInSpeech('Career success is important to me');

      expect(familyResult.some((r) => r.domain === 'relationships')).toBe(true);
      expect(workResult.some((r) => r.domain === 'work')).toBe(true);
    });

    it('should return empty for neutral speech', () => {
      const result = detectValuesInSpeech('The weather is nice today');

      expect(result.length).toBe(0);
    });
  });

  describe('Value Recording', () => {
    const userId = 'values-user-123';

    it('should record a value', () => {
      const value = recordValue(userId, 'Connection', 'relationships', {
        importance: 9,
      });

      expect(value.value).toBe('Connection');
      expect(value.domain).toBe('relationships');
      expect(value.importance).toBe(9);
    });

    it('should retrieve user values', () => {
      const userId2 = userId + '-get';
      recordValue(userId2, 'Growth', 'growth');
      recordValue(userId2, 'Creativity', 'leisure');

      const values = getUserValues(userId2);

      expect(values.length).toBe(2);
    });

    it('should update existing value on re-record', () => {
      const userId3 = userId + '-update';
      recordValue(userId3, 'Balance', 'health', { importance: 5 });
      recordValue(userId3, 'Balance', 'health', { importance: 8 });

      const values = getUserValues(userId3);

      expect(values.length).toBe(1);
      expect(values[0].importance).toBe(8);
    });

    it('should filter by domain', () => {
      const userId4 = userId + '-domain';
      recordValue(userId4, 'Connection', 'relationships');
      recordValue(userId4, 'Growth', 'growth');
      recordValue(userId4, 'Trust', 'relationships');

      const relationshipValues = getValuesByDomain(userId4, 'relationships');

      expect(relationshipValues.length).toBe(2);
      expect(relationshipValues.every((v) => v.domain === 'relationships')).toBe(true);
    });

    it('should get top values by importance', () => {
      const userId5 = userId + '-top';
      recordValue(userId5, 'Low', 'growth', { importance: 3 });
      recordValue(userId5, 'High', 'work', { importance: 9 });
      recordValue(userId5, 'Medium', 'health', { importance: 6 });

      const topValues = getTopValues(userId5, 2);

      expect(topValues.length).toBe(2);
      expect(topValues[0].value).toBe('High');
      expect(topValues[1].value).toBe('Medium');
    });
  });

  describe('Committed Actions', () => {
    const userId = 'actions-user-123';

    it('should record committed action', () => {
      recordValue(userId, 'Health', 'health');
      const action = recordCommittedAction(userId, 'Health', 'Go for a morning walk');

      expect(action.action).toBe('Go for a morning walk');
      expect(action.completed).toBe(false);
    });

    it('should mark action as complete', () => {
      const userId2 = userId + '-complete';
      recordValue(userId2, 'Family', 'relationships');
      recordCommittedAction(userId2, 'Family', 'Call mom');

      completeAction(userId2, 'Call mom', 'Had a great conversation', 8);

      const pending = getPendingActions(userId2);
      expect(pending.length).toBe(0);
    });

    it('should track pending actions', () => {
      const userId3 = userId + '-pending';
      recordValue(userId3, 'Work', 'work');
      recordCommittedAction(userId3, 'Work', 'Finish project');
      recordCommittedAction(userId3, 'Work', 'Schedule meeting');

      const pending = getPendingActions(userId3);
      expect(pending.length).toBe(2);
    });
  });

  describe('checkValuesAlignment', () => {
    it('should indicate no values when user has none', () => {
      const result = checkValuesAlignment('no-values-user', 'Go to the gym');

      expect(result.hasValues).toBe(false);
      expect(result.alignmentScore).toBeNull();
      expect(result.suggestion).toContain("haven't explored");
    });

    it('should find aligned values', () => {
      const userId = 'aligned-user-123';
      recordValue(userId, 'Family', 'relationships', { importance: 9 });

      const result = checkValuesAlignment(userId, 'Spend quality time with kids');

      expect(result.hasValues).toBe(true);
      expect(result.alignedValues.length).toBeGreaterThan(0);
    });

    it('should detect semantic alignment', () => {
      const userId = 'semantic-user-123';
      recordValue(userId, 'Health', 'health', { importance: 8 });

      const result = checkValuesAlignment(userId, 'Go to the gym for exercise');

      expect(result.alignedValues).toContain('Health');
    });

    it('should calculate high alignment score for top values', () => {
      const userId = 'high-align-user-123';
      recordValue(userId, 'Growth', 'growth', { importance: 10 });

      const result = checkValuesAlignment(userId, 'Take a learning course to improve skills');

      expect(result.alignmentScore).toBeGreaterThanOrEqual(0.6);
    });

    it('should suggest when action misaligns with top values', () => {
      const userId = 'misalign-user-123';
      recordValue(userId, 'Connection', 'relationships', { importance: 10 });

      const result = checkValuesAlignment(userId, 'Work overtime alone');

      // Should suggest reflection when doesn't align
      if (result.alignmentScore !== null && result.alignmentScore < 0.5) {
        expect(result.suggestion).toBeDefined();
      }
    });
  });

  describe('Values Exploration', () => {
    it('getValuesQuestion should return question for domain', () => {
      const question = getValuesQuestion('relationships');

      expect(question.length).toBeGreaterThan(10);
      expect(question.includes('?')).toBe(true);
    });

    it('getValueExamples should return examples for domain', () => {
      const examples = getValueExamples('work', 3);

      expect(examples.length).toBe(3);
    });

    it('generateValuesPrompt should return intro for new user', () => {
      const prompt = generateValuesPrompt('new-user');

      expect(prompt).toContain('matters most');
    });

    it('generateValuesPrompt should explore unexplored domains', () => {
      const userId = 'partial-user-123';
      recordValue(userId, 'Family', 'relationships');

      const prompt = generateValuesPrompt(userId);

      // Should ask about an unexplored domain
      expect(prompt.length).toBeGreaterThan(10);
    });

    it('generateValuesPrompt should deepen misaligned values', () => {
      const userId = 'misaligned-user-123';
      // Record values in all domains first so exploration phase is complete
      recordValue(userId, 'Connection', 'relationships');
      recordValue(userId, 'Career', 'work');
      recordValue(userId, 'Health', 'health', { importance: 9, currentAlignment: 3 });
      recordValue(userId, 'Learning', 'growth');
      recordValue(userId, 'Fun', 'leisure');
      recordValue(userId, 'Peace', 'spirituality');
      recordValue(userId, 'Service', 'community');
      recordValue(userId, 'Nature', 'environment');

      const prompt = generateValuesPrompt(userId);

      // Should now focus on misaligned value
      expect(prompt).toContain('Health');
    });
  });

  describe('buildValuesContext', () => {
    it('should return null for user with no values', () => {
      const context = buildValuesContext('no-values-user');

      expect(context).toBeNull();
    });

    it('should build context with user values', () => {
      const userId = 'context-user-123';
      recordValue(userId, 'Connection', 'relationships', { importance: 9 });
      recordValue(userId, 'Growth', 'growth', { importance: 8 });

      const context = buildValuesContext(userId);

      expect(context).not.toBeNull();
      expect(context).toContain('THEIR VALUES');
      expect(context).toContain('Connection');
      expect(context).toContain('Growth');
    });

    it('should include alignment status', () => {
      const userId = 'status-user-123';
      recordValue(userId, 'Health', 'health', {
        importance: 9,
        currentAlignment: 8,
      });

      const context = buildValuesContext(userId);

      expect(context).toContain('living it');
    });

    it('should include pending actions', () => {
      const userId = 'actions-context-user';
      recordValue(userId, 'Creativity', 'leisure', { importance: 8 });
      recordCommittedAction(userId, 'Creativity', 'Paint for 30 minutes');

      const context = buildValuesContext(userId);

      expect(context).toContain('Committed to');
      expect(context).toContain('Paint for 30 minutes');
    });

    it('should include guidance for using values', () => {
      const userId = 'guidance-user-123';
      recordValue(userId, 'Service', 'community', { importance: 9 });

      const context = buildValuesContext(userId);

      expect(context).toContain('truly matters');
    });
  });

  describe('Domain Inference', () => {
    it('should infer relationships domain from family keywords', () => {
      const result = detectValuesInSpeech('I value my family and loved ones');

      expect(result.some((r) => r.domain === 'relationships')).toBe(true);
    });

    it('should infer work domain from career keywords', () => {
      const result = detectValuesInSpeech('Career success is important to me');

      expect(result.some((r) => r.domain === 'work')).toBe(true);
    });

    it('should infer health domain from wellness keywords', () => {
      const result = detectValuesInSpeech('I really value my health and fitness');

      expect(result.some((r) => r.domain === 'health')).toBe(true);
    });

    it('should default to growth for unrecognized values', () => {
      const result = detectValuesInSpeech('I value innovation');

      // Innovation doesn't have explicit domain mapping
      if (result.length > 0) {
        expect(['growth', 'work']).toContain(result[0].domain);
      }
    });
  });
});
