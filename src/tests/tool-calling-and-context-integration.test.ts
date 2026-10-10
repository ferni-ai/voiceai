/**
 * Tool calling + context injection still coexist: native tools execute,
 * and leaked spoken tool names are sanitized before TTS.
 */

import { describe, expect, it } from 'vitest';
import type { ContextInjection } from '../agents/processors/types.js';
import { executeTool } from '../agents/shared/tool-dispatcher.js';
import {
  detectsFunctionCallLeakage,
  sanitizeToolCallLeakage,
} from '../agents/shared/sanitizer/index.js';

describe('tool calling and context integration', () => {
  it('builds context injections without leaking tags', () => {
    const injections: ContextInjection[] = [
      { category: 'identity', content: 'You are Ferni, the team coordinator.', priority: 100 },
      {
        category: 'relationship_stage',
        content: '[🤝 RELATIONSHIP CONTEXT]\nStage: friend',
        priority: 85,
      },
    ];
    const contextBlock = injections
      .sort((a, b) => b.priority - a.priority)
      .map((inj) => inj.content)
      .join('\n\n');
    expect(contextBlock).toContain('You are Ferni');
    expect(contextBlock).toContain('RELATIONSHIP CONTEXT');
    expect(contextBlock).not.toContain('<context>');
  });

  it('sanitizes leaked tool announcements', () => {
    const badResponse = "I'll play some jazz for you now.";
    expect(detectsFunctionCallLeakage(badResponse).detected).toBe(true);
    const sanitized = sanitizeToolCallLeakage(badResponse);
    expect(sanitized).not.toContain("I'll play");
  });

  it('allows normal conversation through the sanitizer', () => {
    const normalResponse = 'I understand you want to relax. Music can really help with that.';
    expect(detectsFunctionCallLeakage(normalResponse).detected).toBe(false);
  });

  it('dispatches getCurrentTime through the neutral tool dispatcher', async () => {
    const result = await executeTool(
      { name: 'getCurrentTime', args: {} },
      { sessionId: 'test-chat-dispatch', personaId: 'ferni' }
    );
    expect(result.success).toBe(true);
    expect(result.fn).toBe('getCurrentTime');
    expect(typeof result.result).toBe('string');
  });
});
