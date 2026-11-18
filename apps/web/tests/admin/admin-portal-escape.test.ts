/**
 * Escape closes the admin portal's top modal. It used to send the browser to / from
 * anywhere in the portal, even mid-edit in a form or a modal, losing unsaved changes.
 * One portal per file: each initAdminPortal adds its own document keydown listener.
 */
import { describe, expect, it, vi } from 'vitest';
import type { AdminSection } from '../../src/admin/section-registry.js';

vi.mock('../../src/admin/admin-fetch.js', () => ({
  adminFetch: async () => new Response('{}', { status: 404 }),
}));
vi.mock('../../src/admin/section-registry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/admin/section-registry.js')>();
  const only: AdminSection = {
    id: 'only',
    name: 'Only',
    icon: '',
    description: '',
    component: async () => '<input id="field" value="unsaved">',
  };
  return { ...actual, ADMIN_SECTIONS: [only], initialSectionId: () => 'only' };
});

const escape = (): void =>
  void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

function openModal(id: string): void {
  const modal = document.createElement('div');
  modal.className = 'admin-modal-overlay';
  modal.id = id;
  document.body.appendChild(modal);
}

describe('Escape in the admin portal', () => {
  it('closes only the top modal, and with none open stays in the portal', async () => {
    window.history.replaceState({}, '', '/admin?section=only');
    document.body.innerHTML = '<div id="app"></div>';
    const { initAdminPortal } = await import('../../src/admin/index.js');
    await initAdminPortal();
    await vi.waitFor(() => expect(document.getElementById('field')).not.toBeNull());
    const address = window.location.href;

    openModal('first');
    openModal('second');
    escape();
    expect(document.getElementById('second')).toBeNull();
    expect(document.getElementById('first')).not.toBeNull();

    escape();
    expect(document.getElementById('first')).toBeNull();

    escape();
    expect(window.location.href).toBe(address);
    expect((document.getElementById('field') as HTMLInputElement | null)?.value).toBe('unsaved');
  });
});
