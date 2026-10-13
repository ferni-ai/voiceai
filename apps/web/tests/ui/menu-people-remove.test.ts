/**
 * The edit form's Remove sends DELETE /api/contacts/:contactId (the route that now
 * exists, src/api/contact-delete.ts) and treats only a 2xx as removed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('../../src/utils/api-helpers.js', () => ({ apiFetch }));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast }));
vi.mock('../../src/i18n/index.js', () => ({ t: (key: string) => key }));

import { openEditPerson, closeEditPerson } from '../../src/ui/edit-person.ui.js';

const person = { id: 'doc-1', contactId: 'contact_1', name: 'Rosa Diaz', relationship: 'family' };

async function remove(status: number): Promise<ReturnType<typeof vi.fn>> {
  apiFetch.mockResolvedValue(new Response(JSON.stringify({ deleted: status < 300 }), { status }));
  const onDelete = vi.fn();
  openEditPerson({ person, onDelete });
  (document.querySelector('#ep-delete-btn') as HTMLButtonElement).click();
  (document.querySelector('#ep-delete-confirm') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(apiFetch).toHaveBeenCalled());
  await vi.waitFor(() =>
    expect(toast.success.mock.calls.length + toast.error.mock.calls.length).toBe(1)
  );
  return onDelete;
}

describe('menu: removing a person', () => {
  beforeEach(() => {
    closeEditPerson();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('Remove, confirmed, deletes that person through DELETE /api/contacts/:contactId', async () => {
    const onDelete = await remove(200);

    expect(apiFetch).toHaveBeenCalledWith('/api/contacts/contact_1', { method: 'DELETE' });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('editPerson.removed');
  });

  it('a person the server does not find is not shown as removed', async () => {
    const onDelete = await remove(404);

    expect(onDelete).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('editPerson.couldNotRemove');
  });
});
