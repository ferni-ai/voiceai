/**
 * LLMCompiler Planner Tests
 */

import { describe, it, expect } from 'vitest';
import {
  containsLLMCompilerPlan,
  parseLLMCompilerPlan,
  validateDAG,
  resolveVariableReferences,
  stripLLMCompilerPlan,
} from '../planner.js';

describe('LLMCompiler Planner', () => {
  describe('containsLLMCompilerPlan', () => {
    it('detects valid DAG format', () => {
      const text = `[
        {"id":"t1","fn":"getWeather","args":{"city":"NYC"},"dependsOn":[]},
        {"id":"t2","fn":"playMusic","args":{"genre":"jazz"},"dependsOn":[]}
      ]`;
      expect(containsLLMCompilerPlan(text)).toBe(true);
    });

    it('rejects single function call format', () => {
      const text = '{"fn":"getWeather","args":{"city":"NYC"}}';
      expect(containsLLMCompilerPlan(text)).toBe(false);
    });

    it('rejects array without dependsOn', () => {
      const text = '[{"id":"t1","fn":"getWeather","args":{}}]';
      expect(containsLLMCompilerPlan(text)).toBe(false);
    });

    it('detects DAG with surrounding text', () => {
      const text = `Let me help you with that.
      [{"id":"t1","fn":"getWeather","args":{},"dependsOn":[]}]
      I'll get the weather for you.`;
      expect(containsLLMCompilerPlan(text)).toBe(true);
    });
  });

  describe('parseLLMCompilerPlan', () => {
    it('parses valid plan', () => {
      const text = `[
        {"id":"t1","fn":"getWeather","args":{"city":"NYC"},"dependsOn":[]},
        {"id":"t2","fn":"playMusic","args":{"genre":"jazz"},"dependsOn":[]}
      ]`;

      const plan = parseLLMCompilerPlan(text);

      expect(plan).not.toBeNull();
      expect(plan?.tasks).toHaveLength(2);
      expect(plan?.tasks[0].id).toBe('t1');
      expect(plan?.tasks[0].fn).toBe('getWeather');
      expect(plan?.tasks[1].id).toBe('t2');
    });

    it('parses plan with dependencies', () => {
      const text = `[
        {"id":"t1","fn":"getWeather","args":{"city":"NYC"},"dependsOn":[]},
        {"id":"t2","fn":"summarize","args":{"data":"$t1"},"dependsOn":["t1"]}
      ]`;

      const plan = parseLLMCompilerPlan(text);

      expect(plan).not.toBeNull();
      expect(plan?.tasks[1].dependsOn).toEqual(['t1']);
    });

    it('returns null for invalid JSON', () => {
      const text = '[{"id":"t1","fn":}]';
      expect(parseLLMCompilerPlan(text)).toBeNull();
    });

    it('returns null for missing required fields', () => {
      const text = '[{"id":"t1","args":{}}]'; // Missing fn
      expect(parseLLMCompilerPlan(text)).toBeNull();
    });

    it('extracts plan from surrounding text', () => {
      const text = `Here's my plan:
      [{"id":"t1","fn":"test","args":{},"dependsOn":[]}]
      Let me execute it.`;

      const plan = parseLLMCompilerPlan(text);
      expect(plan).not.toBeNull();
      expect(plan?.tasks[0].fn).toBe('test');
    });
  });

  describe('validateDAG', () => {
    it('validates valid DAG', () => {
      const tasks = [
        { id: 't1', fn: 'a', args: {}, dependsOn: [] },
        { id: 't2', fn: 'b', args: {}, dependsOn: ['t1'] },
        { id: 't3', fn: 'c', args: {}, dependsOn: ['t1', 't2'] },
      ];

      const result = validateDAG(tasks);
      expect(result.valid).toBe(true);
    });

    it('detects duplicate IDs', () => {
      const tasks = [
        { id: 't1', fn: 'a', args: {}, dependsOn: [] },
        { id: 't1', fn: 'b', args: {}, dependsOn: [] },
      ];

      const result = validateDAG(tasks);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Duplicate');
    });

    it('detects missing dependencies', () => {
      const tasks = [
        { id: 't1', fn: 'a', args: {}, dependsOn: [] },
        { id: 't2', fn: 'b', args: {}, dependsOn: ['t3'] }, // t3 doesn't exist
      ];

      const result = validateDAG(tasks);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing dependencies');
      expect(result.missingDeps).toContain('t3');
    });

    it('detects simple cycle', () => {
      const tasks = [
        { id: 't1', fn: 'a', args: {}, dependsOn: ['t2'] },
        { id: 't2', fn: 'b', args: {}, dependsOn: ['t1'] },
      ];

      const result = validateDAG(tasks);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Circular dependency');
    });

    it('detects longer cycle', () => {
      const tasks = [
        { id: 't1', fn: 'a', args: {}, dependsOn: ['t3'] },
        { id: 't2', fn: 'b', args: {}, dependsOn: ['t1'] },
        { id: 't3', fn: 'c', args: {}, dependsOn: ['t2'] },
      ];

      const result = validateDAG(tasks);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Circular dependency');
    });

    it('detects self-reference', () => {
      const tasks = [{ id: 't1', fn: 'a', args: {}, dependsOn: ['t1'] }];

      const result = validateDAG(tasks);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Circular dependency');
    });
  });

  describe('resolveVariableReferences', () => {
    it('resolves simple variable', () => {
      const args = { data: '$t1' };
      const outputs = new Map([['t1', 'weather data']]);

      const resolved = resolveVariableReferences(args, outputs);
      expect(resolved.data).toBe('weather data');
    });

    it('resolves embedded variables', () => {
      const args = { message: 'The weather is $t1 and music is $t2' };
      const outputs = new Map([
        ['t1', 'sunny'],
        ['t2', 'playing'],
      ]);

      const resolved = resolveVariableReferences(args, outputs);
      expect(resolved.message).toBe('The weather is sunny and music is playing');
    });

    it('preserves unresolved variables', () => {
      const args = { data: '$t1' };
      const outputs = new Map<string, unknown>();

      const resolved = resolveVariableReferences(args, outputs);
      expect(resolved.data).toBe('$t1');
    });

    it('handles nested objects', () => {
      const args = {
        outer: {
          inner: '$t1',
        },
      };
      const outputs = new Map([['t1', 'value']]);

      const resolved = resolveVariableReferences(args, outputs);
      expect((resolved.outer as Record<string, unknown>).inner).toBe('value');
    });

    it('handles arrays', () => {
      const args = { items: ['$t1', 'static', '$t2'] };
      const outputs = new Map([
        ['t1', 'first'],
        ['t2', 'third'],
      ]);

      const resolved = resolveVariableReferences(args, outputs);
      expect(resolved.items).toEqual(['first', 'static', 'third']);
    });

    it('stringifies object outputs for embedded refs', () => {
      const args = { message: 'Result: $t1' };
      const outputs = new Map([['t1', { key: 'value' }]]);

      const resolved = resolveVariableReferences(args, outputs);
      expect(resolved.message).toBe('Result: {"key":"value"}');
    });

    it('returns object directly for full variable reference', () => {
      const args = { data: '$t1' };
      const outputs = new Map([['t1', { key: 'value' }]]);

      const resolved = resolveVariableReferences(args, outputs);
      expect(resolved.data).toEqual({ key: 'value' });
    });
  });

  describe('stripLLMCompilerPlan', () => {
    it('removes plan from text', () => {
      const text = `Here's my plan:
      [{"id":"t1","fn":"test","args":{},"dependsOn":[]}]
      Let me execute it.`;

      const stripped = stripLLMCompilerPlan(text);
      expect(stripped).not.toContain('[');
      expect(stripped).toContain("Here's my plan");
      expect(stripped).toContain('Let me execute it');
    });

    it('returns original text if no plan', () => {
      const text = 'Just some regular text.';
      expect(stripLLMCompilerPlan(text)).toBe(text);
    });
  });
});
