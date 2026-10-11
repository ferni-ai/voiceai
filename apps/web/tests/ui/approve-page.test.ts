/**
 * The /p/:id page: shows a pending action exactly as stored, sends the
 * decision with the shown hash, and signs in again when the server asks.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockSignOut = vi.fn(async () => undefined);
const mockGate = vi.fn(async () => undefined);

vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  apiPost: mockApiPost,
  getApiHeaders: vi.fn(() => ({})),
}));
vi.mock('../../src/services/firebase-auth.service.js', () => ({ signOut: mockSignOut }));
vi.mock('../../src/ui/sign-in-gate.ui.js', () => ({ showSignInGate: mockGate }));

const { pendingActionIdFromPath, renderPendingAction, sendDecision, showPendingAction } =
  await import('../../src/ui/approve-page.ui');

const ID = 'B'.repeat(43);
const NOW = 1_760_000_000_000;
const ACTION = {
  id: ID,
  kind: 'send_text' as const,
  payload: { to: '+15551230000', body: 'Running late <b>sorry</b>' },
  actionHash: 'a'.repeat(64),
  moneyMoving: false,
  expiresAt: NOW + 4 * 60_000,
  status: 'pending' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
});

const click = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === label)?.click();

describe('pendingActionIdFromPath', () => {
  it('takes only a 43-character id under /p/', () => {
    expect(pendingActionIdFromPath(`/p/${ID}`)).toBe(ID);
    expect(pendingActionIdFromPath('/p/short')).toBeNull();
    expect(pendingActionIdFromPath(`/a/${ID}`)).toBeNull();
  });
});

describe('renderPendingAction', () => {
  it('shows every stored field exactly, as text', () => {
    const card = renderPendingAction(ACTION, vi.fn(), NOW);
    expect([...card.querySelectorAll('dt')].map((n) => n.textContent)).toEqual(['to', 'body']);
    expect([...card.querySelectorAll('dd')].map((n) => n.textContent)).toEqual([
      '+15551230000',
      'Running late <b>sorry</b>',
    ]);
    expect(card.querySelector('b')).toBeNull();
    expect(card.querySelector('h1')?.textContent).toBe('Send this text?');
    expect(card.querySelector('[role="status"]')?.textContent).toBe('Good for 4 more min.');
  });

  it('approves once, then shows the outcome in place of the buttons', async () => {
    const onDecide = vi.fn(async () => 'Done.');
    const card = renderPendingAction(ACTION, onDecide, NOW);
    click(card, 'Approve');
    click(card, 'Approve');
    await vi.waitFor(() =>
      expect(card.querySelector('[role="status"]')?.textContent).toBe('Done.')
    );
    expect(onDecide).toHaveBeenCalledTimes(1);
    expect(onDecide).toHaveBeenCalledWith('approve');
    expect(card.querySelector('button')).toBeNull();
  });

  it('offers no buttons once expired or already answered', () => {
    expect(
      renderPendingAction(ACTION, vi.fn(), ACTION.expiresAt + 1).querySelector('button')
    ).toBeNull();
    expect(
      renderPendingAction({ ...ACTION, status: 'approved' }, vi.fn(), NOW).querySelector('button')
    ).toBeNull();
  });
});

describe('sendDecision', () => {
  it('sends the decision with the hash that was shown, never retried', async () => {
    mockApiPost.mockResolvedValue({ ok: true, status: 200, data: { status: 'approved' } });
    expect(await sendDecision(ACTION, 'approve')).toBe(200);
    expect(mockApiPost).toHaveBeenCalledWith(
      `/api/pending-actions/${ID}/decision`,
      { decision: 'approve', actionHash: ACTION.actionHash },
      { maxRetries: 0 }
    );
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('signs in again when the server wants a fresh sign-in, then sends once more', async () => {
    mockApiPost
      .mockResolvedValueOnce({ ok: false, status: 401, error: 'Sign in again' })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { status: 'approved' } });
    expect(await sendDecision(ACTION, 'approve')).toBe(200);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockGate).toHaveBeenCalledTimes(1);
    expect(mockApiPost).toHaveBeenCalledTimes(2);
  });
});

describe('showPendingAction', () => {
  it("says it can't find an action that isn't yours", async () => {
    mockApiGet.mockResolvedValue({ ok: false, status: 404 });
    const root = document.createElement('main');
    await showPendingAction(root, ID);
    expect(root.textContent).toBe("Couldn't find that one. Try the account I texted.");
    expect(root.querySelector('button')).toBeNull();
  });

  it('tells a money-moving action apart when the server refuses it (403)', async () => {
    mockApiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        action: { ...ACTION, kind: 'purchase', moneyMoving: true, expiresAt: Date.now() + 60_000 },
      },
    });
    mockApiPost.mockResolvedValue({ ok: false, status: 403 });
    const root = document.createElement('main');
    await showPendingAction(root, ID);
    click(root, 'Approve');
    await vi.waitFor(() =>
      expect(root.querySelector('[role="status"]')?.textContent).toBe(
        "This one needs a passkey, and you don't have one set up yet."
      )
    );
  });
});
