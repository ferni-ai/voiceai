/**
 * The brand-word exemption reads the live tool registry: once the coaching
 * tool module is loaded, a registered tool whose name looks like "iPhone"
 * is still dropped from web text.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { webData } from '../../services/coach-media/result-text.js';
import { toolRegistry } from '../../tools/registry/index.js';
import type { ToolDefinition } from '../../tools/registry/types.js';
import '../../tools/domains/learning/coaching-resources-tool.js';

afterEach(() => {
  toolRegistry.unregister('iCoach');
});

describe('brand-shaped tool names from the registry', () => {
  it('drops a word of the exempt shape once a tool by that name is registered', () => {
    expect(webData('The iCoach plan works', 200).text).toBe('The iCoach plan works');
    toolRegistry.register({
      id: 'iCoach',
      name: 'Synthetic test tool',
      description: 'A test tool shaped like a brand name',
      domain: 'learning',
      tags: ['test'],
      create: () => ({}) as never,
    } as ToolDefinition);
    expect(webData('The iCoach plan works', 200).text).toBe('');
    expect(webData('Apple iPhone 16 Pro', 200).text).toBe('Apple iPhone 16 Pro');
  });
});
