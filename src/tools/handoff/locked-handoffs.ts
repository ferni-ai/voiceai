/**
 * Keep handoff tools for teammates the user hasn't unlocked out of the model's
 * request.
 *
 * The per-session handoff build filters locked teammates, but the shared tool
 * sets merged in later (the dynamic loader's essential domains, the tool
 * gateway, the timeout fallback) are built once per process without a user
 * profile, so they carry every teammate's handoff. A voice eval
 * (2026-09-28) showed the result: Ferni promised a transfer to Alex, the
 * runtime check refused it (Alex is locked on the free tier), and the model
 * tried again next turn. Filtering where each request is made covers every
 * way a tool can reach the agent; the runtime check stays as the backstop.
 *
 * @module tools/handoff/locked-handoffs
 */

import { llm } from '@livekit/agents';
import { isCoach } from '../../personas/persona-ids.js';
import type { UserProfile } from '../../types/user-profile.js';
import { isHandoffTargetOpen } from './handoff-availability.js';
import { createHandoffTools } from './handoff-factory.js';

export interface UnlockView {
  userProfile: UserProfile | null;
  tier: 'free' | 'friend' | 'partner';
  /** Session dev-mode bypass from the app's dev panel. */
  bypass?: boolean;
  /** The persona speaking: a handoff to itself is dropped too. */
  currentAgentId?: string;
}

const same = (a: string, b: string): boolean =>
  (isCoach(a) && isCoach(b)) || a.toLowerCase() === b.toLowerCase();

/** Handoff tool name → the teammates it can target. */
let targets: Promise<Map<string, string[]>> | null = null;

function handoffTargets(): Promise<Map<string, string[]>> {
  targets ??= createHandoffTools()
    .then((set) => {
      const map = new Map<string, string[]>();
      for (const t of set.tools) map.set(t.name, [...(map.get(t.name) ?? []), t.agentId]);
      return map;
    })
    .catch((error: unknown) => {
      targets = null; // let the next request retry
      throw error;
    });
  return targets;
}

/**
 * Names of the handoff tools in `names` that can't go anywhere: every target
 * is locked for this user, or is the persona already speaking (with fewer
 * tools in a request, Ferni called handoffToFerni on itself; dev A/B,
 * 2026-09-29).
 */
export async function lockedHandoffTools(names: string[], view: UnlockView): Promise<string[]> {
  const byName = await handoffTargets();
  const current = view.currentAgentId;
  return names.filter((name) => {
    const agents = byName.get(name);
    if (!agents) return false;
    return agents.every(
      (id) =>
        (current !== undefined && same(id, current)) ||
        (!view.bypass && !isHandoffTargetOpen(id, view.userProfile, view.tier))
    );
  });
}

/** `toolCtx` without handoffs to locked teammates (the same object when there are none). */
export async function withoutLockedHandoffs(
  toolCtx: llm.ToolContext,
  view: UnlockView
): Promise<llm.ToolContext> {
  const names = Object.keys(toolCtx.functionTools).filter((n) => n.startsWith('handoffTo'));
  if (names.length === 0) return toolCtx;
  const locked = new Set(await lockedHandoffTools(names, view));
  if (locked.size === 0) return toolCtx;
  const keep = Object.entries(toolCtx.functionTools)
    .filter(([name]) => !locked.has(name))
    .map(([, tool]) => tool);
  return new llm.ToolContext([...keep, ...toolCtx.providerTools, ...toolCtx.toolsets]);
}
