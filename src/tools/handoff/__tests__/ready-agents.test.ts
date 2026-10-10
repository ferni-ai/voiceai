/**
 * With one session per call, the LLM's handoff tool returns the next persona as an SDK
 * handoff instead of waiting for the switch, which waited on the tool itself and never
 * finished: no voice handoff succeeded on a live call (dev, 2026-10-10).
 */
import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import type { HandoffResult } from '../executor.js';
import { handoffToolResponse } from '../handoff-tool-response.js';
import { offerAgent, takeOfferedAgent, withdrawAgent } from '../ready-agents.js';

const toMaya: HandoffResult = {
  success: true,
  targetAgent: 'maya-santos',
  targetAgentName: 'Maya',
  previousAgent: 'ferni',
  greeting: '',
};
const mayaAgent = { name: 'maya-agent' };

/** What the SDK checks a tool result for: the marker llm.handoff() puts on it */
const [handoffMarker] = Object.getOwnPropertySymbols(llm.handoff({ agent: {} as never }));
const isSdkHandoff = (response: object) =>
  (response as Record<symbol, unknown>)[handoffMarker!] === true;

describe('the handoff tool, with the next persona waiting', () => {
  it('returns it as an SDK handoff, so the SDK swaps after the tool call', () => {
    offerAgent('call-1', 'maya', mayaAgent);
    const response = handoffToolResponse(toMaya, 'Maya', 'call-1');
    expect(isSdkHandoff(response)).toBe(true);
    expect((response as { agent: unknown }).agent).toBe(mayaAgent);
  });

  it('takes it once', () => {
    offerAgent('call-2', 'maya-santos', mayaAgent);
    expect(takeOfferedAgent('call-2', 'maya-santos')).toBe(mayaAgent);
    expect(takeOfferedAgent('call-2', 'maya-santos')).toBeUndefined();
  });

  it("never hands one call's persona to another call", () => {
    offerAgent('call-3', 'maya-santos', mayaAgent);
    expect(isSdkHandoff(handoffToolResponse(toMaya, 'Maya', 'call-4'))).toBe(false);
    withdrawAgent('call-3', 'maya-santos');
    expect(takeOfferedAgent('call-3', 'maya-santos')).toBeUndefined();
  });

  it('with nothing waiting, answers as before', () => {
    expect(handoffToolResponse(toMaya, 'Maya', 'call-5')).toMatchObject({
      handoff_complete: true,
      new_agent: 'Maya',
    });
  });
});
