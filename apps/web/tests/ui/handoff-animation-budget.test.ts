/**
 * Teammate handoff: the new persona appears at once and its entrance motion
 * stays cheap and short.
 *
 * Measured in the dev app (Chrome, 390x844 and 1440x900): the swap used to wait
 * on the transition chime plus a pause (~1.4 s before anything changed) and
 * settled ~2.0 s after the event, animating filter, border-width and box-shadow
 * on the way. These tests pin the fixed shape: the swap happens in the same
 * task as the event, and every animation it starts touches only transform and
 * opacity and ends within HANDOFF_BUDGET_MS.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataMessage } from '../../src/types/events.js';

const HANDOFF_BUDGET_MS = 500;
const COMPOSITOR_ONLY = new Set(['transform', 'opacity', 'offset', 'easing', 'composite']);

interface Recorded {
  target: Element;
  props: string[];
  end: number;
  anim: { onfinish: (() => void) | null };
}

let recorded: Recorded[] = [];

function stubAnimate(): void {
  recorded = [];
  const animate = vi.fn(function (this: Element, keyframes: Keyframe[], options?: number | KeyframeAnimationOptions) {
    const timing = typeof options === 'number' ? { duration: options } : (options ?? {});
    const props = [...new Set(keyframes.flatMap((k) => Object.keys(k)))];
    const anim = { onfinish: null as (() => void) | null, cancel: vi.fn(), finished: Promise.resolve() };
    recorded.push({
      target: this,
      props,
      end: Number(timing.delay ?? 0) + Number(timing.duration ?? 0),
      anim,
    });
    return anim;
  });
  Object.defineProperty(Element.prototype, 'animate', { value: animate, configurable: true });
}

function mountCoach(): void {
  document.body.innerHTML = `
    <div id="coach"><div id="avatarRing"></div><div id="coachAvatar"><span id="avatarText"></span></div>
    <h1 id="personaName">Ferni</h1><p id="personaSubtitle">I am what you make me</p>
    <span id="statusIndicator"></span></div>`;
}

beforeEach(() => {
  vi.resetModules();
  stubAnimate();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('handoff swap timing', () => {
  it('switches the persona in the same task, without waiting for the chime', async () => {
    const { audioService } = await import('../../src/services/audio.service.js');
    // A chime that never finishes: the swap must not depend on it
    const chime = vi.spyOn(audioService, 'playHandoffSound').mockReturnValue(new Promise<void>(() => undefined));
    const { handoffService } = await import('../../src/services/handoff.service.js');
    const { appState } = await import('../../src/state/app.state.js');
    expect(appState.get('activePersona').id).toBe('ferni');

    const seen: string[] = [];
    handoffService.onHandoff((h) => seen.push(h.toPersona));
    const message: DataMessage = {
      type: 'handoff_started',
      newAgent: 'peter-john',
      previousAgent: 'ferni',
      timestamp: Date.now(),
    };
    void handoffService.processDataMessage(message);

    expect(chime).toHaveBeenCalledTimes(1);
    expect(appState.get('activePersona').id).toBe('peter-john');
    expect(document.body.getAttribute('data-persona')).toBe('peter-john');
    expect(seen).toEqual(['peter-john']);
  });
});

describe('handoff animation budget', () => {
  it('coach entrance animates transform/opacity only and ends within budget', async () => {
    mountCoach();
    const { initCoachUI, updatePersonaDisplay, dispose } = await import('../../src/ui/coach.ui.js');
    const { getPersona } = await import('../../src/config/personas.js');
    initCoachUI();
    recorded = [];

    updatePersonaDisplay(getPersona('peter-john'));
    // The name animates in two halves; finish the first so the second starts
    recorded.find((r) => r.target.id === 'personaName')?.anim.onfinish?.();

    const targets = recorded.map((r) => r.target.id);
    expect(targets).toEqual(expect.arrayContaining(['coachAvatar', 'personaName', 'personaSubtitle']));
    expect(document.getElementById('personaName')!.textContent).toBe(getPersona('peter-john').name);
    for (const r of recorded) {
      expect(r.props.filter((p) => !COMPOSITOR_ONLY.has(p)), `#${r.target.id} animates layout/paint properties`).toEqual([]);
      expect(r.end, `#${r.target.id} runs past the budget`).toBeLessThanOrEqual(HANDOFF_BUDGET_MS);
    }
    // Name halves run back to back: their sum is the name's total
    const nameTotal = recorded.filter((r) => r.target.id === 'personaName').reduce((sum, r) => sum + r.end, 0);
    expect(nameTotal).toBeLessThanOrEqual(HANDOFF_BUDGET_MS);
    dispose();
  });

  it('the handoff signature moment is short and animates opacity only', async () => {
    const { SIGNATURE_MOMENTS } = await import('../../src/systems/moment-orchestrator.js');
    const phases = SIGNATURE_MOMENTS['handoff']!.phases;
    const total = phases.reduce((sum, p) => sum + p.duration, 0);
    expect(total).toBeLessThanOrEqual(HANDOFF_BUDGET_MS);
    for (const phase of phases) {
      for (const action of phase.actions) {
        if (action.type !== 'animate') continue;
        const props = action.keyframes.flatMap((k) => Object.keys(k));
        expect(props.filter((p) => !COMPOSITOR_ONLY.has(p))).toEqual([]);
      }
    }
  });

  it('the CSS persona-transition ring animates transform/opacity only, within budget', () => {
    const css = readFileSync(resolve(__dirname, '../../src/styles/inline-styles.css'), 'utf8');
    const rule = /#coach\.persona-transitioning #avatarRing\s*\{\s*animation:\s*ringSparkle\s+([\d.]+)s/.exec(css);
    expect(rule, 'ring rule missing').not.toBeNull();
    expect(Number(rule![1]) * 1000).toBeLessThanOrEqual(HANDOFF_BUDGET_MS);

    const start = css.indexOf('@keyframes ringSparkle');
    const body = css.slice(start, css.indexOf('\n}\n', start));
    const props = [...body.matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1]);
    expect(new Set(props)).toEqual(new Set(['opacity', 'transform']));
    // The avatar's CSS bounce was dropped; the WAAPI bounce in coach.ui is the only one
    expect(css).not.toMatch(/#coach\.persona-transitioning #coachAvatar\s*\{/);
  });
});
