/**
 * The portal wires a section after its HTML is in the page, hands it the content area,
 * stops it when another section opens, drops a load a newer click replaced, and keeps
 * ?section= in the address. Sections used to wire themselves on a 100 ms timer that fired
 * before the portal's 150 ms fade inserted their HTML, and BTH Validation and Blind
 * Evaluation were handed a null root and crashed on open.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSection } from '../../src/admin/section-registry.js';

vi.mock('../../src/admin/admin-fetch.js', () => ({
  adminFetch: async () => new Response('{}', { status: 404 }),
}));

const calls: string[] = [];
const roots: Array<{ section: string; rootId: string; hasOwnHtml: boolean }> = [];

function fakeSection(id: string, delayMs = 0): AdminSection {
  return {
    id,
    name: `Section ${id}`,
    icon: '',
    description: '',
    component: async () => {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return `<button id="${id}-btn">${id}</button>`;
    },
    setup: (root) => {
      calls.push(`setup:${id}`);
      roots.push({ section: id, rootId: root.id, hasOwnHtml: !!root.querySelector(`#${id}-btn`) });
    },
    cleanup: () => void calls.push(`cleanup:${id}`),
  };
}

vi.mock('../../src/admin/section-registry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/admin/section-registry.js')>();
  const sections = [fakeSection('one'), fakeSection('two'), fakeSection('three')];
  return {
    ...actual,
    ADMIN_SECTIONS: sections,
    initialSectionId: (search: string, fallback: string) => {
      const id = new URLSearchParams(search).get('section');
      return sections.some((s) => s.id === id) && id ? id : fallback;
    },
  };
});

async function openPortal(search: string): Promise<void> {
  window.history.replaceState({}, '', `/admin${search}`);
  document.body.innerHTML = '<div id="app"></div>';
  const { initAdminPortal } = await import('../../src/admin/index.js');
  await initAdminPortal();
}

const navTo = (id: string): void => {
  document
    .querySelector<HTMLElement>(`.admin-nav-btn[data-section="${id}"]`)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

const shown = (): string => document.getElementById('adminContent')?.textContent ?? '';

describe('admin portal section lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    calls.length = 0;
    roots.length = 0;
  });

  it('wires a section with the content area, after its HTML is in it', async () => {
    await openPortal('?section=one');
    expect(roots).toEqual([{ section: 'one', rootId: 'adminContent', hasOwnHtml: true }]);
  });

  it('stops the open section when another one opens, then wires the new one', async () => {
    await openPortal('?section=one');
    navTo('two');
    await vi.waitFor(() => expect(calls).toContain('setup:two'));
    expect(calls).toEqual(['setup:one', 'cleanup:one', 'setup:two']);
  });

  it('keeps ?section= in the address as the sidebar changes section', async () => {
    await openPortal('?section=one');
    navTo('three');
    expect(new URLSearchParams(window.location.search).get('section')).toBe('three');
    await vi.waitFor(() => expect(shown()).toBe('three'));
  });

  it('never shows or wires a section a newer click replaced during its fade', async () => {
    await openPortal('?section=one');
    navTo('two');
    navTo('three');
    await vi.waitFor(() => expect(calls).toContain('setup:three'));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(calls).not.toContain('setup:two');
    expect(shown()).toBe('three');
  });
});
