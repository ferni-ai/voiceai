/**
 * A saved relationship record that is missing fields must not stop the app.
 *
 * The service is created at module load from localStorage. A record without
 * its metrics object (an older or interrupted save) threw in the constructor,
 * so every import of the module failed and the app never finished starting:
 * no settings, no buttons, on every reload, until site data was cleared.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/api-helpers.js', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));

const KEY = 'ferni_relationship';

async function freshService() {
  vi.resetModules();
  return (await import('../src/services/relationship-stage.service.js')).relationshipStageService;
}

beforeEach(() => localStorage.clear());

describe('loading saved relationship data', () => {
  it('keeps the saved stage from a partial record and fills in the rest', async () => {
    localStorage.setItem(KEY, JSON.stringify({ stage: 'getting-started', lastUpdated: new Date().toISOString() }));
    const service = await freshService();
    expect(service.getStage()).toBe('getting-started');
    expect(typeof service.getMetrics().daysSinceFirstMeeting).toBe('number');
  });

  it('keeps saved metrics and adds the ones the save predates', async () => {
    localStorage.setItem(KEY, JSON.stringify({ stage: 'building-trust', metrics: { totalConversations: 12 } }));
    const service = await freshService();
    expect(service.getMetrics().totalConversations).toBe(12);
    expect(typeof service.getMetrics().daysSinceFirstMeeting).toBe('number');
  });

  it('starts over from an unknown stage or a record that is not an object', async () => {
    localStorage.setItem(KEY, JSON.stringify({ stage: 'best-friends-forever' }));
    expect((await freshService()).getStage()).toBe('first-meeting');

    localStorage.setItem(KEY, '5');
    expect((await freshService()).getStage()).toBe('first-meeting');
  });
});
