/**
 * What I Do For You (Ferni Care): no calendar trigger that can never fire, and no
 * silent save failures.
 *
 * Before: the routine builder's Calendar trigger had no config and was saved
 * without the `triggerOn` the server matches on (so it never ran); and a refused
 * save (the automation service returns null, it doesn't throw) closed the builder
 * as if it worked, while a missing user id returned without a word.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const api = vi.hoisted(() => ({ userId: 'user-1' as string | null }));
const mockApiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  getUserId: () => api.userId,
}));

const service = vi.hoisted(() => ({
  listWorkflows: vi.fn(),
  createWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
  createFromTemplate: vi.fn(),
}));
vi.mock('../../src/services/life-automation.service.js', () => ({
  getLifeAutomationService: () => service,
}));

const mockToastError = vi.fn();
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast: { error: mockToastError } }));

let showFerniCareDashboard: () => void;
let showRoutineBuilder: () => void;

const text = (): string => document.body.textContent?.replace(/\s+/g, ' ') ?? '';

beforeEach(async () => {
  // Fresh modules: both screens are singletons that keep a reference to their last overlay
  vi.resetModules();
  ({ showFerniCareDashboard } = await import('../../src/ui/ferni-care/dashboard.ui.js'));
  ({ showRoutineBuilder } = await import('../../src/ui/ferni-care/routine-builder.ui.js'));
  await (await import('../../src/i18n/index.js')).setLocale('en-US', { reload: false });
  api.userId = 'user-1';
  mockApiGet.mockReset();
  mockToastError.mockReset();
  service.listWorkflows.mockReset().mockResolvedValue([]);
  service.createWorkflow.mockReset().mockResolvedValue({ id: 'wf-1' });
  service.updateWorkflow.mockReset();
  service.createFromTemplate.mockReset();
  document.body.innerHTML = '';
});

describe('Routine builder: calendar trigger', () => {
  function openBuilder(): void {
    showRoutineBuilder();
  }
  function typeName(name: string): void {
    const input = document.querySelector<HTMLInputElement>('#rb-name');
    if (!input) throw new Error('no name input');
    input.value = name;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function choose(selector: string, value: string): void {
    const select = document.querySelector<HTMLSelectElement>(selector);
    if (!select) throw new Error(`no ${selector}`);
    select.value = value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const click = (selector: string): void => document.querySelector<HTMLElement>(selector)?.click();

  it('configures when the routine fires and saves the value the server matches on', async () => {
    openBuilder();
    click('[data-trigger="calendar"]');
    const options = [...document.querySelectorAll<HTMLOptionElement>('#rb-calendar-trigger option')];
    expect(options.map((o) => o.value)).toEqual(['event_reminder', 'event_start', 'event_end']);
    expect(text()).not.toMatch(/coming soon/i);

    typeName('Meeting wrap-up');
    choose('#rb-calendar-trigger', 'event_end');
    click('[data-action="save"]');

    await vi.waitFor(() => expect(service.createWorkflow).toHaveBeenCalledTimes(1));
    expect(service.createWorkflow.mock.calls[0]?.[1].trigger).toMatchObject({
      type: 'calendar',
      triggerOn: 'event_end',
    });
  });

  it('saves the default shown in the select when the user never touches it', async () => {
    openBuilder();
    click('[data-trigger="calendar"]');
    typeName('Heads up');
    click('[data-action="save"]');

    await vi.waitFor(() => expect(service.createWorkflow).toHaveBeenCalledTimes(1));
    expect(service.createWorkflow.mock.calls[0]?.[1].trigger.triggerOn).toBe('event_reminder');
  });

  it('does not carry a location trigger\'s "leave" over into a calendar routine', async () => {
    openBuilder();
    click('[data-trigger="location"]');
    choose('#rb-location-trigger', 'exit');
    click('[data-trigger="calendar"]');
    typeName('Switched my mind');
    click('[data-action="save"]');

    await vi.waitFor(() => expect(service.createWorkflow).toHaveBeenCalledTimes(1));
    expect(service.createWorkflow.mock.calls[0]?.[1].trigger.triggerOn).toBe('event_reminder');
  });
});

describe('Routine builder: save failures reach the user', () => {
  function fillAndSave(): void {
    showRoutineBuilder();
    const input = document.querySelector<HTMLInputElement>('#rb-name');
    if (input) {
      input.value = 'Morning hello';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.querySelector<HTMLElement>('[data-action="save"]')?.click();
  }

  it('toasts and stays open when the server refuses the save', async () => {
    service.createWorkflow.mockResolvedValue(null);

    fillAndSave();

    await vi.waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Couldn't save that. Want to try again?"));
    expect(document.querySelector('.routine-builder-overlay.visible')).not.toBeNull();
    expect(document.querySelector('.ferni-care-overlay')).toBeNull();
  });

  it('toasts when saving throws', async () => {
    service.createWorkflow.mockRejectedValue(new Error('network down'));

    fillAndSave();

    await vi.waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Couldn't save that. Want to try again?"));
  });

  it('asks the user to sign in when there is no user id', async () => {
    api.userId = null;

    fillAndSave();

    await vi.waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Sign in to save your routines'));
    expect(service.createWorkflow).not.toHaveBeenCalled();
  });

  it('closes and returns to the dashboard on success', async () => {
    fillAndSave();

    await vi.waitFor(() => expect(document.querySelector('.ferni-care-overlay')).not.toBeNull());
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
