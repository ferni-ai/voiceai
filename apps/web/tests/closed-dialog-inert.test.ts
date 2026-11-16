/**
 * A dialog that stays mounted when closed (faded out or slid off-screen) is
 * inert: out of the accessibility tree and the tab order. It lifts as soon as
 * the dialog shows (app audit 2026-11-16, item 18: ~20 closed panels were
 * still reachable by screen readers).
 *
 * jsdom has no layout: an element is laid out unless it (or an ancestor) has
 * `hidden`, and `data-rect="left,top,width,height"` sets its box.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDialogFocus } from '../src/utils/dialog-focus';

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await frame();
};
let uninstall: () => void = () => undefined;
const original = {
  rects: HTMLElement.prototype.getClientRects,
  box: HTMLElement.prototype.getBoundingClientRect,
};

beforeEach(() => {
  HTMLElement.prototype.getClientRects = function (this: HTMLElement) {
    return (this.closest('[hidden]') ? [] : [{}]) as unknown as DOMRectList;
  };
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const [left, top, w, h] = (this.dataset.rect ?? '0,0,400,600').split(',').map(Number) as [number, number, number, number];
    return { left, top, width: w, height: h, right: left + w, bottom: top + h, x: left, y: top } as DOMRect;
  };
  Object.assign(window, { innerWidth: 1000, innerHeight: 800 });
  document.body.innerHTML = '<button id="opener">Open</button>';
  uninstall = installDialogFocus();
});

afterEach(() => {
  uninstall();
  HTMLElement.prototype.getClientRects = original.rects;
  HTMLElement.prototype.getBoundingClientRect = original.box;
  document.body.innerHTML = '';
});

/** A panel that stays mounted, like conversation-history.ui.ts: fixed, closed by opacity. */
function mountPanel(style: Partial<CSSStyleDeclaration> = { opacity: '0' }): HTMLElement {
  const panel = document.createElement('div');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Conversation history');
  panel.style.position = 'fixed';
  Object.assign(panel.style, style);
  panel.innerHTML = '<button id="inside">Close</button>';
  document.body.appendChild(panel);
  return panel;
}

describe('closed dialogs are inert', () => {
  it('makes a mounted panel closed by opacity inert, and lifts it when it opens', async () => {
    const panel = mountPanel();
    await frames(2);
    expect(panel.hasAttribute('inert')).toBe(true);

    document.getElementById('opener')!.focus();
    panel.style.opacity = '1'; // opens
    await frames(3);
    expect(panel.hasAttribute('inert')).toBe(false);
    expect(document.activeElement?.id).toBe('inside'); // dialog-focus could move focus in

    panel.style.opacity = '0'; // closes again
    await frames(3);
    expect(panel.hasAttribute('inert')).toBe(true);
  });

  it('makes a drawer slid off-screen inert', async () => {
    const drawer = mountPanel({ opacity: '1' });
    drawer.dataset.rect = '1000,0,360,800'; // translateX(100%) past the right edge
    drawer.style.transform = 'translateX(100%)';
    await frames(2);
    expect(drawer.hasAttribute('inert')).toBe(true);

    drawer.dataset.rect = '640,0,360,800';
    drawer.style.transform = 'none'; // slides in
    await frames(2);
    expect(drawer.hasAttribute('inert')).toBe(false);
  });

  it('lifts inert when an ancestor opens the dialog', async () => {
    const wrapper = document.createElement('div');
    wrapper.style.opacity = '0';
    document.body.appendChild(wrapper);
    const panel = mountPanel({});
    wrapper.appendChild(panel);
    await frames(2);
    expect(panel.hasAttribute('inert')).toBe(true);

    wrapper.style.opacity = '1';
    await frames(3);
    expect(panel.hasAttribute('inert')).toBe(false);
  });

  it('leaves an open dialog, and one below the fold in the page flow, usable', async () => {
    const open = mountPanel({ opacity: '1' });
    const inFlow = document.createElement('div');
    inFlow.setAttribute('role', 'dialog');
    inFlow.dataset.rect = '0,2000,400,300'; // scrolled away, not closed
    document.body.appendChild(inFlow);
    await frames(2);
    expect(open.hasAttribute('inert')).toBe(false);
    expect(inFlow.hasAttribute('inert')).toBe(false);
  });

  it('never lifts an inert the component set itself', async () => {
    const panel = mountPanel({ opacity: '1' });
    panel.setAttribute('inert', '');
    await frames(3);
    expect(panel.hasAttribute('inert')).toBe(true);
  });

  it('gives back every inert it set when uninstalled', async () => {
    const panel = mountPanel();
    await frames(2);
    expect(panel.hasAttribute('inert')).toBe(true);
    uninstall();
    uninstall = () => undefined;
    expect(panel.hasAttribute('inert')).toBe(false);
  });
});
