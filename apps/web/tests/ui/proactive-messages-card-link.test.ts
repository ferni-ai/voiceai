/**
 * A coaching pick in the in-app inbox links its answer card (/a/:id), where
 * its sources and Google's search suggestions are shown. Only a well-formed
 * card id becomes a link; anything else shows the message without one.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api.js', () => ({
  apiGet: vi.fn(async () => ({ ok: false, status: 401 })),
  apiPost: vi.fn(async () => ({ ok: true, status: 200 })),
}));
vi.mock('../../src/services/attention-queue.js', () => ({ requestAttention: vi.fn() }));

const { initI18n } = await import('../../src/i18n/index');
const { answerCardHref, initProactiveMessages, showTestMessage } =
  await import('../../src/ui/proactive-messages.ui');

const ID = 'Ab_-'.repeat(10) + 'xyz';

beforeAll(async () => initI18n());
// The test setup empties the page between tests; mount the inbox fresh each time.
beforeEach(() => initProactiveMessages());

const shown = () => document.querySelector<HTMLAnchorElement>('a.message-card-link');

describe('answerCardHref', () => {
  it('links only a 43-character card id', () => {
    expect(ID).toHaveLength(43);
    expect(answerCardHref({ answerCardId: ID })).toBe(`/a/${ID}`);
    for (const bad of [undefined, '', 'short', `${ID}x`, 'javascript:alert(1)'.padEnd(43, 'a')])
      expect(answerCardHref({ answerCardId: bad })).toBeNull();
    expect(answerCardHref({ answerCardId: `../${ID.slice(3)}` })).toBeNull();
  });
});

describe('the inbox message', () => {
  it("links the pick's card in a new tab, labelled for what it shows", () => {
    showTestMessage({ type: 'coaching_resource', answerCardId: ID, text: 'From Ferni, the video' });
    const link = shown();
    expect(link?.getAttribute('href')).toBe(`/a/${ID}`);
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toBe('noopener noreferrer');
    expect(link?.textContent).toBe('Why I picked it, and where I found it');
  });

  it('shows no link for a message without a card, or with a malformed id', () => {
    showTestMessage({ text: 'Just thinking of you.' });
    expect(shown()).toBeNull();
    showTestMessage({ answerCardId: '"><img src=x onerror=alert(1)>'.padEnd(43, 'a') });
    expect(shown()).toBeNull();
    expect(document.querySelector('.message-card img')).toBeNull();
  });
});
