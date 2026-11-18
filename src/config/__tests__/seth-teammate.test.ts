/**
 * The seth teammate is reachable only while his gate is open: SETH_TEAMMATE on and his
 * own voice setting (ROSTER_VOICE_SETH) holding a clone id. Closed, nothing lists him,
 * no handoff tool or unlock check reaches him, and a call can't start as him, however
 * much of the team the caller has unlocked. Open, he isn't behind team unlocks. The
 * voice id here is invented.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentDirectory } from '../../personas/agent-directory.js';
import { livePersonaId } from '../../personas/persona-ids.js';
import { AgentRegistry } from '../../personas/registry/unified-registry.js';
import { isHandoffTargetOpen } from '../../tools/handoff/handoff-availability.js';
import { handoffConsent, holdUnaskedHandoff } from '../../tools/handoff/handoff-consent.js';
import {
  buildHandoffTools,
  clearHandoffToolCache,
  createHandoffTools,
} from '../../tools/handoff/handoff-factory.js';
import { checkHandoffUnlocked } from '../../tools/handoff/handoff-unlock-check.js';
import type { UserProfile } from '../../types/user-profile.js';
import { sethTeammateOpen } from '../seth-teammate.js';

const partner = { id: 'u1', subscription: { tier: 'partner' } } as unknown as UserProfile;
const newcomer = { id: 'u1', totalConversations: 0 } as unknown as UserProfile;

function gate(open: boolean): void {
  vi.stubEnv('SETH_TEAMMATE', open ? 'on' : 'off');
  vi.stubEnv('ROSTER_VOICE_SETH', open ? 'fake-seth-id' : '');
  AgentRegistry.clearCache();
  AgentDirectory.clearCache();
  clearHandoffToolCache();
}

beforeEach(() => vi.stubEnv('BYPASS_TEAM_UNLOCKS', ''));
afterEach(() => {
  vi.unstubAllEnvs();
  AgentRegistry.clearCache();
  AgentDirectory.clearCache();
  clearHandoffToolCache();
});

describe('sethTeammateOpen', () => {
  it('opens only with the flag on and his own voice set', () => {
    expect(sethTeammateOpen({})).toBe(false);
    expect(sethTeammateOpen({ SETH_TEAMMATE: 'on' })).toBe(false);
    expect(sethTeammateOpen({ SETH_TEAMMATE: 'on', ROSTER_VOICE_SETH: '  ' })).toBe(false);
    expect(sethTeammateOpen({ ROSTER_VOICE_SETH: 'fake-seth-id' })).toBe(false);
    expect(sethTeammateOpen({ SETH_TEAMMATE: 'on', ROSTER_VOICE_SETH: 'fake-seth-id' })).toBe(true);
  });
});

describe('handing off to Seth', () => {
  it('is closed with the gate closed, even for a caller with the whole team unlocked', () => {
    gate(false);
    expect(isHandoffTargetOpen('seth', partner, 'partner')).toBe(false);
    vi.stubEnv('BYPASS_TEAM_UNLOCKS', 'true');
    expect(isHandoffTargetOpen('seth', partner, 'partner')).toBe(false);
    const check = checkHandoffUnlocked('seth', partner, 'partner');
    expect(check.open).toBe(false);
    expect(check).not.toHaveProperty('locked');
  });

  it('is open with the gate open, and not behind team unlocks', () => {
    gate(true);
    expect(isHandoffTargetOpen('seth', partner, 'partner')).toBe(true);
    expect(isHandoffTargetOpen('seth', newcomer, 'free')).toBe(true);
    expect(isHandoffTargetOpen('seth', null, 'free')).toBe(true);
    expect(checkHandoffUnlocked('seth', newcomer, 'free')).toEqual({ open: true, target: 'seth' });
  });

  it('gives the model no handoffToSeth and the directory no Seth with the gate closed', async () => {
    gate(false);
    const forPartner = await buildHandoffTools({
      currentAgentId: 'ferni',
      userProfile: partner,
      subscriptionTier: 'partner',
    });
    const devBypass = await buildHandoffTools({
      currentAgentId: 'ferni',
      userProfile: null,
      services: { devMode: { enabled: true, bypassUnlocks: true } },
    });
    for (const built of [forPartner, devBypass]) {
      expect(Object.keys(built.tools)).not.toContain('handoffToSeth');
      expect(built.agentIds).not.toContain('seth');
    }
    // The partner caller does get the rest of the team, so the filter isn't empty-handed.
    expect(Object.keys(forPartner.tools)).toContain('handoffToMaya');
    const directory = JSON.stringify(await AgentDirectory.getAllEntries());
    expect(directory).not.toMatch(/\bSeth\b/);
    expect(await AgentRegistry.getAgentOrNull('seth')).toBeNull();
  }, 60_000);

  it('"can I talk to Seth" reaches him by name with the gate open', async () => {
    gate(true);
    const { tools } = await buildHandoffTools({
      currentAgentId: 'ferni',
      userProfile: newcomer,
      subscriptionTier: 'free',
    });
    expect(Object.keys(tools)).toContain('handoffToSeth');
    const def = (await createHandoffTools()).tools.find((t) => t.agentId === 'seth');
    expect(def?.name).toBe('handoffToSeth');
    expect(def?.agentName).toContain('Seth');
    // Only his name makes this an ask: no "transfer me to", no "your teammate".
    const asked = new llm.ChatContext();
    asked.addMessage({ role: 'assistant', content: 'Hey, what can I do for you?' });
    asked.addMessage({ role: 'user', content: 'Can I talk to Seth?' });
    expect(handoffConsent(asked, def?.agentName ?? '', {})).toBe('asked');
    expect(handoffConsent(asked, 'Maya Santos', {})).toBe('none');
    const runCtx = { session: { history: asked } };
    // HANDOFF_ASK_FIRST holds a transfer the caller didn't ask for; this one they did.
    expect(
      holdUnaskedHandoff(runCtx, def?.agentName ?? '', false, { HANDOFF_ASK_FIRST: 'on' })
    ).toBe(null);
  }, 60_000);
});

describe('starting a call as Seth', () => {
  it('starts on Ferni with the gate closed and on Seth with it open', () => {
    gate(false);
    expect(livePersonaId('seth')).toBe('ferni');
    expect(livePersonaId(' SETH ')).toBe('ferni');
    gate(true);
    expect(livePersonaId('seth')).toBe('seth');
  });
});
