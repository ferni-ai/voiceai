/**
 * Where quickCall, quickText and quickEmail hand off.
 *
 * They used to look up tools that were never registered (makePhoneCall,
 * callContact, sendText, sendSMS, sendMessage, sendEmail, composeEmail), so
 * every one answered "isn't set up yet" and did nothing. They now hand off
 * to the registered tools: callOnBehalf for a call, reachOut for a text or
 * an email. That places real calls and sends real texts, so it is behind
 * ASSISTANT_ACTIONS_REAL. With the flag off, the shortcut names the tool
 * that does the job instead of claiming the feature isn't set up.
 *
 * @module simple-utilities/shortcut-handoff
 */

import { isAssistantActionsReal } from '../../../config/assistant-actions-flag.js';
import type { ToolContext, ToolDefinition } from '../../registry/types.js';

type DomainModule = { getToolDefinitions: () => ToolDefinition[] | Promise<ToolDefinition[]> };

export const SHORTCUT_TARGETS = {
  quickCall: {
    toolId: 'callOnBehalf',
    verb: 'call',
    load: (): Promise<DomainModule> => import('../telephony/index.js'),
  },
  quickText: {
    toolId: 'reachOut',
    verb: 'text',
    load: (): Promise<DomainModule> => import('../communication/index.js'),
  },
  quickEmail: {
    toolId: 'reachOut',
    verb: 'email',
    load: (): Promise<DomainModule> => import('../communication/index.js'),
  },
} as const;

export type Shortcut = keyof typeof SHORTCUT_TARGETS;

/** Run the real tool behind a shortcut, or say plainly that this shortcut can't. */
export async function handOff(
  shortcut: Shortcut,
  ctx: ToolContext,
  contact: string,
  args: Record<string, unknown>
): Promise<string> {
  const { toolId, verb, load } = SHORTCUT_TARGETS[shortcut];
  if (!isAssistantActionsReal()) {
    return `This shortcut can't ${verb} anyone, so nothing was sent. Use ${toolId} to ${verb} ${contact} instead.`;
  }
  const defs = await (await load()).getToolDefinitions();
  const def = defs.find((d) => d.id === toolId);
  if (!def) return `I can't ${verb} ${contact} right now, so nothing was sent.`;
  const tool = def.create(ctx);
  return String(await tool.execute(args, { toolCallId: `${shortcut}-handoff`, ctx: {} }));
}
