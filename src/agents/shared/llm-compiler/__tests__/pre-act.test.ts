/**
 * Pre-Act Planning Module Tests
 */

import { describe, it, expect } from 'vitest';
import {
  containsPreActPlan,
  detectPreActFormat,
  parsePreActPlan,
  stripPreActFormat,
  validateReasoning,
  analyzePreActPlan,
} from '../pre-act.js';

describe('Pre-Act Planning', () => {
  describe('containsPreActPlan', () => {
    it('detects XML format', () => {
      const text = `
        <think>
        I need to get the weather and play music.
        </think>
        <plan>
        [{"id":"t1","fn":"getWeather","args":{},"dependsOn":[]}]
        </plan>
      `;
      expect(containsPreActPlan(text)).toBe(true);
    });

    it('detects keyword format', () => {
      const text = `
        THINK: I should check the calendar first, then send the email.
        PLAN: [{"id":"t1","fn":"getCalendar","args":{},"dependsOn":[]}]
      `;
      expect(containsPreActPlan(text)).toBe(true);
    });

    it('detects inline format with substantial reasoning', () => {
      const text = `
        The user wants to know the weather and play some jazz music.
        I should handle these as two parallel tasks since they don't depend on each other.
        [{"id":"t1","fn":"getWeather","args":{},"dependsOn":[]},{"id":"t2","fn":"playMusic","args":{"genre":"jazz"},"dependsOn":[]}]
      `;
      expect(containsPreActPlan(text)).toBe(true);
    });

    it('returns false for plain DAG without reasoning', () => {
      const text = `[{"id":"t1","fn":"getWeather","args":{},"dependsOn":[]}]`;
      expect(containsPreActPlan(text)).toBe(false);
    });

    it('returns false for single tool call', () => {
      const text = `{"fn":"getWeather","args":{}}`;
      expect(containsPreActPlan(text)).toBe(false);
    });
  });

  describe('detectPreActFormat', () => {
    it('detects XML format correctly', () => {
      const text = `
        <think>My reasoning here</think>
        <plan>[{"id":"t1","fn":"test","args":{},"dependsOn":[]}]</plan>
      `;
      const result = detectPreActFormat(text);

      expect(result.detected).toBe(true);
      expect(result.format).toBe('xml');
      expect(result.reasoning).toBe('My reasoning here');
      expect(result.planText).toContain('"fn":"test"');
    });

    it('detects keyword format correctly', () => {
      const text = `
        THINK: First I'll check the weather
        PLAN: [{"id":"t1","fn":"getWeather","args":{},"dependsOn":[]}]
      `;
      const result = detectPreActFormat(text);

      expect(result.detected).toBe(true);
      expect(result.format).toBe('keyword');
      expect(result.reasoning).toContain("First I'll check");
    });

    it('handles multiline reasoning', () => {
      const text = `
        <think>
        Step 1: Get the weather
        Step 2: Play appropriate music
        Step 3: Summarize for user
        </think>
        <plan>
        [{"id":"t1","fn":"getWeather","args":{},"dependsOn":[]}]
        </plan>
      `;
      const result = detectPreActFormat(text);

      expect(result.detected).toBe(true);
      expect(result.reasoning).toContain('Step 1');
      expect(result.reasoning).toContain('Step 3');
    });
  });

  describe('parsePreActPlan', () => {
    it('parses valid XML Pre-Act plan', () => {
      const text = `
        <think>
        The user wants weather and music. These can run in parallel.
        </think>
        <plan>
        [
          {"id":"t1","fn":"getWeather","args":{"city":"NYC"},"dependsOn":[]},
          {"id":"t2","fn":"playMusic","args":{"genre":"jazz"},"dependsOn":[]}
        ]
        </plan>
      `;

      const result = parsePreActPlan(text);

      expect(result).not.toBeNull();
      expect(result!.plan.tasks).toHaveLength(2);
      expect(result!.reasoning).toContain('parallel');
      expect(result!.format).toBe('xml');
      expect(result!.confidence).toBeGreaterThan(0.5);
    });

    it('parses keyword format', () => {
      // Note: The keyword format regex expects PLAN: followed by JSON on same line
      const text = `
        THINK: I need to get calendar events and then send a reminder.
        PLAN: [{"id":"t1","fn":"getCalendar","args":{},"dependsOn":[]},{"id":"t2","fn":"sendReminder","args":{"data":"$t1"},"dependsOn":["t1"]}]
      `;

      const result = parsePreActPlan(text);

      expect(result).not.toBeNull();
      expect(result!.plan.tasks).toHaveLength(2);
      expect(result!.plan.tasks[1].dependsOn).toContain('t1');
    });

    it('returns null for invalid DAG', () => {
      const text = `
        <think>Planning something</think>
        <plan>[{"id":"t1","fn":"test","args":{},"dependsOn":["t2"]},{"id":"t2","fn":"test2","args":{},"dependsOn":["t1"]}]</plan>
      `;
      // Circular dependency should fail validation
      const result = parsePreActPlan(text);
      expect(result).toBeNull();
    });

    it('returns null for malformed JSON', () => {
      const text = `
        <think>Reasoning</think>
        <plan>not valid json</plan>
      `;
      const result = parsePreActPlan(text);
      expect(result).toBeNull();
    });
  });

  describe('validateReasoning', () => {
    it('validates high quality reasoning', () => {
      const reasoning =
        "First, I need to check the weather because the user asked about it. Then I should play appropriate music based on the conditions.";
      const result = validateReasoning(reasoning);

      expect(result.valid).toBe(true);
      expect(result.quality).toBe('high');
    });

    it('marks short reasoning as low quality', () => {
      const reasoning = 'Get data';
      const result = validateReasoning(reasoning);

      expect(result.quality).toBe('low');
      expect(result.warnings).toContain('Reasoning is too short');
    });

    it('suggests step-by-step when missing', () => {
      const reasoning =
        'I should get the weather and play music because the user wants both.';
      const result = validateReasoning(reasoning);

      expect(result.warnings.some((w) => w.includes('step-by-step'))).toBe(true);
    });
  });

  describe('stripPreActFormat', () => {
    it('strips XML format and returns clean text', () => {
      const text = `
        Hello!
        <think>My reasoning</think>
        <plan>[{"id":"t1","fn":"test","args":{},"dependsOn":[]}]</plan>
        Goodbye!
      `;

      const { cleanText, preActPlan } = stripPreActFormat(text);

      expect(cleanText).toContain('Hello!');
      expect(cleanText).toContain('Goodbye!');
      expect(cleanText).not.toContain('<think>');
      expect(cleanText).not.toContain('<plan>');
      expect(preActPlan).not.toBeNull();
    });

    it('strips keyword format', () => {
      const text = `
        THINK: My reasoning here
        PLAN: [{"id":"t1","fn":"test","args":{},"dependsOn":[]}]
        Some response text
      `;

      const { cleanText } = stripPreActFormat(text);

      expect(cleanText).not.toContain('THINK:');
      expect(cleanText).not.toContain('PLAN:');
    });

    it('returns original text when no Pre-Act format', () => {
      const text = 'Just regular text';
      const { cleanText, preActPlan } = stripPreActFormat(text);

      expect(cleanText).toBe(text);
      expect(preActPlan).toBeNull();
    });
  });

  describe('analyzePreActPlan', () => {
    it('identifies overly sequential plans', () => {
      const preActPlan = parsePreActPlan(`
        <think>
        First task one, then two, then three, then four in sequence.
        </think>
        <plan>
        [
          {"id":"t1","fn":"a","args":{},"dependsOn":[]},
          {"id":"t2","fn":"b","args":{},"dependsOn":["t1"]},
          {"id":"t3","fn":"c","args":{},"dependsOn":["t2"]},
          {"id":"t4","fn":"d","args":{},"dependsOn":["t3"]}
        ]
        </plan>
      `);

      const analysis = analyzePreActPlan(preActPlan!);

      // With 4 tasks and 3 sequential deps, parallelRatio = 1 - 3/4 = 0.25 < 0.3
      expect(analysis.suggestions.some((s) => s.includes('parallel'))).toBe(true);
    });

    it('gives high score for good plans', () => {
      const preActPlan = parsePreActPlan(`
        <think>
        First, I need to get the weather information for the user.
        Then I'll play some appropriate music while they wait.
        These tasks are independent so they can run in parallel.
        </think>
        <plan>
        [
          {"id":"t1","fn":"getWeather","args":{},"dependsOn":[]},
          {"id":"t2","fn":"playMusic","args":{},"dependsOn":[]}
        ]
        </plan>
      `);

      const analysis = analyzePreActPlan(preActPlan!);

      expect(analysis.score).toBeGreaterThan(70);
      expect(analysis.issues).toHaveLength(0);
    });
  });
});
