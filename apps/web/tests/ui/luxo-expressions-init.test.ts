/**
 * Luxo expressions initialise on first use, not at import
 *
 * The module used to schedule a 100 ms auto-init timer at import. Any test that
 * imported it (directly or through the app's data-message handlers) could have
 * that timer fire after jsdom was torn down, failing the run with
 * "document is not defined". Importing now schedules nothing, and the first
 * expression still finds the avatar.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

function el(className: string, ...children: HTMLElement[]): HTMLElement {
  const node = document.createElement('div');
  node.className = className;
  node.append(...children);
  return node;
}

/** The avatar markup luxo-expressions looks for (as in index.html). */
function mountAvatar(): void {
  const avatar = el(
    '',
    el('eyes-group', el('eye-left', el('eye-white')), el('eye-right', el('eye-white')))
  );
  avatar.id = 'coachAvatar';
  document.body.append(el('avatar-container', avatar));
}

describe('luxo expressions init', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('schedules no timer when imported', async () => {
    await import('../../src/ui/luxo-expressions.ui.js');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('finds the avatar on the first expression without an earlier init', async () => {
    mountAvatar();
    const luxo = await import('../../src/ui/luxo-expressions.ui.js');
    luxo.setExpression('listening', { duration: 0 });
    vi.runAllTimers();

    expect(document.getElementById('coachAvatar')?.getAttribute('data-expression')).toBe(
      'listening'
    );
    luxo.cleanupLuxoExpressions();
  });
});
