/**
 * quickCall / quickText / quickEmail must point at tools that are actually
 * registered. They used to look up makePhoneCall, sendText, sendEmail and
 * friends, none of which exist, so every one said "isn't set up yet".
 */
import { afterEach, describe, expect, it } from 'vitest';
import { SHORTCUT_TARGETS, type Shortcut } from '../shortcut-handoff.js';
import { getToolDefinitions as getShortcutTools } from '../index.js';
import type { ToolContext } from '../../../registry/types.js';

const ctx = { userId: 'u1', agentId: 'ferni' } as ToolContext;

afterEach(() => {
  delete process.env.ASSISTANT_ACTIONS_REAL;
});

describe('every shortcut target is a registered tool', () => {
  for (const [shortcut, target] of Object.entries(SHORTCUT_TARGETS)) {
    it(`${shortcut} → ${target.toolId}`, async () => {
      const ids = (await (await target.load()).getToolDefinitions()).map((d) => d.id);
      expect(ids).toContain(target.toolId);
    });
  }
});

describe('flag off: the shortcut says nothing was sent and names the real tool', () => {
  const calls: Array<[Shortcut, Record<string, string>]> = [
    ['quickCall', { contact: 'mom' }],
    ['quickText', { contact: 'mom', message: 'on my way' }],
    ['quickEmail', { recipient: 'mom', body: 'hi' }],
  ];
  for (const [shortcut, args] of calls) {
    it(shortcut, async () => {
      const def = (await getShortcutTools()).find((d) => d.id === shortcut)!;
      const reply = String(await def.create(ctx).execute(args, {}));
      expect(reply).toMatch(/nothing was sent/);
      expect(reply).toContain(SHORTCUT_TARGETS[shortcut].toolId);
      expect(reply).not.toMatch(/isn't set up/);
    });
  }
});
