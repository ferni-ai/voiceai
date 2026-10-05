/**
 * Financial Legend handoff contract: agent → web.
 *
 * When the voice agent hands a call to a Financial Legend (Peter Lynch, John
 * Bogle, Joel Dickson), the web must show THAT person. Before this, the web
 * mapped `peter-lynch` to Peter John on purpose, so a handoff to Peter Lynch
 * showed Peter John's name, face and colour.
 *
 * The message is built by the backend's REAL code: the id is canonicalized by
 * src/personas/persona-ids.ts (the coordinator's getCanonicalPersonaId
 * delegates to it) and wrapped by the coordinator adapter's
 * buildHandoffUIMessage, then JSON round-tripped as LiveKit delivers it, and
 * handed to the web's REAL handoff handler. The event data mirrors the
 * coordinator's handoff_complete (src/tools/handoff/handoff-coordinator.ts:
 * `{ traceId, target: canonicalId, displayName, voiceId, durationMs }`).
 */

import { afterEach, describe, expect, it } from 'vitest';

import { buildHandoffUIMessage } from '../../../../src/agents/shared/data-message-envelope.js';
import { toCanonical } from '../../../../src/personas/persona-ids.js';

import { GENERATED_PERSONA_COLORS } from '../../src/config/persona-colors.generated.js';
import { getTeamMembers, LEGENDS, PERSONAS, TEAM_ORDER } from '../../src/config/personas.js';
import { handoffService } from '../../src/services/index.js';
import { appState, setActivePersona } from '../../src/state/app.state.js';
import type { DataMessage } from '../../src/types/events.js';
import { ALL_PERSONA_IDS } from '../../src/types/persona.js';

// The handoff service singleton drops events at or below the last seq it saw.
let seq = Number.MAX_SAFE_INTEGER - 100;

/** What the coordinator adapter publishes for a completed handoff, as the web receives it. */
function handoffCompleteFromAgent(requestedTarget: string, canonicalize = true): DataMessage {
  const target = canonicalize ? toCanonical(requestedTarget) : requestedTarget;
  const event = {
    type: 'handoff_complete',
    data: { traceId: 'hndff_legend', target, displayName: target, voiceId: 'v', durationMs: 900 },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(buildHandoffUIMessage(event, seq++)));
  return JSON.parse(new TextDecoder().decode(bytes)) as DataMessage;
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  setActivePersona('ferni');
});

describe('handoff to a Financial Legend', () => {
  it('shows Peter Lynch, with his own initials and token colour, not Peter John', async () => {
    const completedTo: string[] = [];
    cleanups.push(handoffService.onHandoffComplete((to) => completedTo.push(to)));

    const message = handoffCompleteFromAgent('peter-lynch');
    expect((message as unknown as { target: string }).target).toBe('peter-lynch');
    expect(await handoffService.processDataMessage(message)).toBe(true);

    const speaking = appState.get('activePersona');
    expect(speaking.id).toBe('peter-lynch');
    expect(speaking.name).toBe('Peter Lynch');
    expect(speaking.initials).toBe('PL');
    expect(speaking.subtitle).toBe('Stock Picking Guide');
    expect(speaking.colors.primary).toBe(GENERATED_PERSONA_COLORS['lynch']?.primary);
    expect(speaking.colors.primary).not.toBe(PERSONAS['peter-john'].colors.primary);
    expect(completedTo).toEqual(['peter-lynch']);

    // The page takes his colour: data-persona names him and a theme rule exists for it.
    expect(document.body.getAttribute('data-persona')).toBe('peter-lynch');
    const theme = document.getElementById('legend-persona-themes')?.textContent ?? '';
    expect(theme).toContain(
      `body[data-persona='peter-lynch'] { --persona-primary: ${GENERATED_PERSONA_COLORS['lynch']?.primary};`
    );
  });

  it('shows John Bogle and Joel Dickson as themselves', async () => {
    await handoffService.processDataMessage(handoffCompleteFromAgent('john-bogle'));
    expect(appState.get('activePersona').name).toBe('John Bogle');
    expect(appState.get('activePersona').colors.primary).toBe(
      GENERATED_PERSONA_COLORS['bogle']?.primary
    );

    await handoffService.processDataMessage(handoffCompleteFromAgent('joel-dickson'));
    expect(appState.get('activePersona').name).toBe('Joel Dickson');
    expect(appState.get('activePersona').colors.primary).toBe(
      GENERATED_PERSONA_COLORS['joel']?.primary
    );
  });

  it('still shows Peter John for `peter`', async () => {
    // Raw alias, as multi-agent mode forwards a requested target unchanged
    await handoffService.processDataMessage(handoffCompleteFromAgent('peter', false));
    expect(appState.get('activePersona').id).toBe('peter-john');
    expect(appState.get('activePersona').name).toBe('Peter John');

    setActivePersona('ferni');
    await handoffService.processDataMessage(handoffCompleteFromAgent('peter'));
    expect(appState.get('activePersona').name).toBe('Peter John');
  });
});

describe('Legends are not team members', () => {
  it('stay out of the team registry, roster order and team list', () => {
    expect(Object.keys(LEGENDS).sort()).toEqual(['joel-dickson', 'john-bogle', 'peter-lynch']);
    expect(Object.keys(PERSONAS).sort()).toEqual([...ALL_PERSONA_IDS].sort());
    expect([...TEAM_ORDER].sort()).toEqual([...ALL_PERSONA_IDS].sort());
    expect(getTeamMembers().map((p) => p.id)).not.toContain('peter-lynch');
    expect(Object.values(LEGENDS).every((legend) => legend.role === 'standalone')).toBe(true);
  });
});
