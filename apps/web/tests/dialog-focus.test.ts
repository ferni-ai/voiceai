/**
 * Modal dialogs take keyboard focus, keep Tab inside, and give it back on close.
 * jsdom has no layout, so element size and visibility are stubbed: an element
 * is "shown" unless it (or an ancestor) has the `hidden` attribute, and
 * `data-rect="w,h"` sets its size.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDialogFocus, isModalDialog } from '../src/utils/dialog-focus';

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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
    const [w, h] = (this.dataset.rect ?? '100,40').split(',').map(Number);
    return { width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0 } as DOMRect;
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

function openModal(html = '<button id="a">A</button><input id="b"><button id="c">C</button>'): HTMLElement {
  document.getElementById('opener')!.focus();
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.innerHTML = html;
  document.body.appendChild(dialog);
  return dialog;
}

const tab = (shiftKey = false) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }));

describe('dialog focus', () => {
  it('moves focus to the first control when a modal opens', async () => {
    openModal();
    expect(document.activeElement?.id).toBe('opener');
    await frame();
    expect(document.activeElement?.id).toBe('a');
  });

  it('waits for a dialog that animates in from hidden', async () => {
    const dialog = openModal();
    dialog.setAttribute('hidden', '');
    await frame();
    await frame();
    expect(document.activeElement?.id).toBe('opener');
    dialog.removeAttribute('hidden');
    await frame();
    await frame();
    expect(document.activeElement?.id).toBe('a');
  });

  it('ignores a mounted panel that is closed by opacity or by sliding off-screen', async () => {
    const faded = openModal();
    faded.style.opacity = '0';
    faded.style.pointerEvents = 'none';
    await frame();
    expect(document.activeElement?.id).toBe('opener');
    faded.remove();

    const offscreen = document.createElement('div');
    offscreen.setAttribute('role', 'dialog');
    offscreen.setAttribute('aria-modal', 'true');
    offscreen.innerHTML = '<button id="x">X</button>';
    offscreen.getBoundingClientRect = () => ({ left: 1400, right: 1720, top: 0, bottom: 800, width: 320, height: 800 }) as DOMRect;
    document.body.appendChild(offscreen);
    await frame();
    expect(document.activeElement?.id).toBe('opener');
  });

  it('handles a mounted panel that opens and closes by toggling an attribute', async () => {
    const panel = document.createElement('div');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('hidden', '');
    panel.innerHTML = '<button id="p">P</button>';
    document.body.appendChild(panel);
    document.getElementById('opener')!.focus();
    await frame();
    expect(document.activeElement?.id).toBe('opener');

    panel.removeAttribute('hidden'); // opens
    await frame();
    await frame();
    expect(document.activeElement?.id).toBe('p');

    panel.setAttribute('hidden', ''); // closes, still mounted
    await frame();
    await frame();
    expect(document.activeElement?.id).toBe('opener');
  });

  it('prefers an [autofocus] control', async () => {
    openModal('<button id="a">A</button><input id="b" autofocus>');
    await frame();
    expect(document.activeElement?.id).toBe('b');
  });

  it('keeps Tab and Shift+Tab inside the topmost modal', async () => {
    openModal();
    await frame();
    document.getElementById('c')!.focus();
    tab();
    expect(document.activeElement?.id).toBe('a');
    tab(true);
    expect(document.activeElement?.id).toBe('c');
  });

  it('gives focus back to the opener when the modal is removed', async () => {
    const dialog = openModal();
    await frame();
    dialog.remove();
    await Promise.resolve(); // MutationObserver callbacks run as microtasks
    expect(document.activeElement?.id).toBe('opener');
  });

  it('stops trapping once a modal is hidden instead of removed', async () => {
    const dialog = openModal();
    await frame();
    dialog.setAttribute('hidden', '');
    document.getElementById('opener')!.focus();
    tab();
    expect(document.activeElement?.id).toBe('opener');
  });

  it('treats a full-screen overlay as modal but not a small popover', () => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.dataset.rect = '1000,800';
    overlay.innerHTML = '<div role="dialog" id="card"></div>';
    const popover = document.createElement('div');
    popover.setAttribute('role', 'dialog');
    popover.style.position = 'fixed';
    popover.dataset.rect = '240,120';
    document.body.append(overlay, popover);

    expect(isModalDialog(document.getElementById('card')!)).toBe(true);
    expect(isModalDialog(popover)).toBe(false);
    popover.setAttribute('aria-modal', 'true');
    expect(isModalDialog(popover)).toBe(true);
  });
});
