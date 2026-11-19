/**
 * The Dev Panel's "check config" reads the signed-in user's saved phone and email.
 * It used to GET /api/outreach/contact, a POST-only route, so every check said
 * "No contact info configured" whatever was saved.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleOutreachAction } from '../src/ui/dev-panel/handlers/outreach.js';

function serve(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function check(): Promise<{ text: string; isError: boolean }> {
  document.body.innerHTML = '<span id="outreach-status-value"></span>';
  await handleOutreachAction('check-config', () => 'user-1');
  const el = document.getElementById('outreach-status-value') as HTMLElement;
  return { text: el.textContent ?? '', isError: el.style.color === 'var(--color-error)' };
}

afterEach(() => vi.unstubAllGlobals());

describe('Dev Panel contact check', () => {
  it('reads the signed-in user from GET /api/user/contact and shows what is saved', async () => {
    const fetchMock = serve(200, {
      success: true,
      contactInfo: { phone: '+15555550142', email: 'pat@example.com', verifiedPhone: null },
    });
    const status = await check();
    expect(fetchMock).toHaveBeenCalledWith('/api/user/contact');
    expect(status).toEqual({
      text: 'Phone: +15555550142 | Email: pat@example.com',
      isError: false,
    });
  });

  it('prefers the verified phone and says so', async () => {
    serve(200, {
      success: true,
      contactInfo: { phone: '+15555550100', verifiedPhone: '+15555550142' },
    });
    expect((await check()).text).toBe('Phone: +15555550142 (verified)');
  });

  it('says nothing is saved when the user has no contact info', async () => {
    serve(200, { success: true, contactInfo: null });
    expect(await check()).toEqual({ text: 'No phone or email saved', isError: true });
  });

  it('reports a failed request as unavailable, not as missing contact info', async () => {
    serve(401, { success: false, error: 'Authentication required' });
    expect(await check()).toEqual({ text: 'Contact check unavailable (HTTP 401)', isError: true });
  });
});
