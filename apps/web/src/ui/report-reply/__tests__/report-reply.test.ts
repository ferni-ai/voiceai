/**
 * Reporting one of Ferni's replies from the web app: which replies are kept,
 * what the sheet sends to POST /api/reports, and where the entry points show.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ apiPost: vi.fn() }));
vi.mock('../../../utils/api.js', () => api);
const toasts = vi.hoisted(() => ({ toast: { success: vi.fn() } }));
vi.mock('../../whisper.ui.js', () => toasts);
vi.mock('../../../i18n/index.js', () => ({
  t: (key: string, params?: Record<string, string>) =>
    params?.name ? `${key}:${params.name}` : key,
}));
const room = vi.hoisted(() => ({ name: 'voice-1' as string | null }));
vi.mock('../../../services/connection.service.js', () => ({
  connectionService: { getRoomState: () => ({ roomName: room.name }) },
}));

const { getRecentReplies, recordReply, resetRecentReplies } = await import('../recent-replies.js');
const { openReportSheet } = await import('../report-reply-sheet.js');
const entry = await import('../report-reply-entry.js');

function say(text: string, isFinal = true, type = 'agent'): void {
  window.dispatchEvent(new CustomEvent('ferni:transcript', { detail: { type, text, isFinal } }));
}

function choose(name: string, value: string): void {
  const input = document.querySelector<HTMLInputElement>(`input[name=${name}][value="${value}"]`);
  if (!input) throw new Error(`no ${name}=${value}`);
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

const submit = (): HTMLButtonElement =>
  document.querySelector<HTMLButtonElement>('.ferni-report-sheet button[type=submit]')!;
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  resetRecentReplies();
  room.name = 'voice-1';
  api.apiPost.mockReset();
  toasts.toast.success.mockReset();
  document.body.innerHTML = '<div class="controls"><button id="muteBtn"></button></div>';
  localStorage.clear();
});
afterEach(() => document.querySelectorAll('dialog').forEach((d) => d.remove()));

describe("this call's replies", () => {
  it("keeps Ferni's finished replies, newest first, and nothing else", () => {
    entry.initReportReply();
    say('Hello there');
    say('half a senten', false);
    say('the person talking', true, 'user');
    say('How did the week go?');
    expect(getRecentReplies().map((r) => [r.text, r.sessionId])).toEqual([
      ['How did the week go?', 'voice-1'],
      ['Hello there', 'voice-1'],
    ]);
  });

  it('a new call starts the list over', () => {
    recordReply('old call', 'voice-1');
    recordReply('new call', 'voice-2');
    expect(getRecentReplies().map((r) => r.text)).toEqual(['new call']);
  });
});

describe('the report sheet', () => {
  const replies = [
    { text: 'Second reply', at: 2_000, sessionId: 'voice-1' },
    { text: 'First reply', at: 1_000, sessionId: 'voice-1' },
  ];

  it('sends the chosen reply, the reason and the note, once, then thanks the person', async () => {
    api.apiPost.mockResolvedValue({ ok: true, status: 201 });
    const closed = openReportSheet(replies);
    expect(submit().disabled).toBe(true); // a reason is required
    choose('reply', '1');
    expect(submit().disabled).toBe(true); // still: picking the reply is not picking a reason
    choose('reason', 'wrong');
    expect(submit().disabled).toBe(false);
    document.querySelector('textarea')!.value = '  That date is wrong  ';
    submit().click();
    await closed;

    expect(api.apiPost).toHaveBeenCalledTimes(1);
    expect(api.apiPost).toHaveBeenCalledWith(
      '/api/reports',
      {
        sessionId: 'voice-1',
        messageAt: 1_000,
        textHint: 'First reply',
        reason: 'wrong',
        note: 'That date is wrong',
        appVersion: 'dev',
        platform: 'web',
      },
      { maxRetries: 0 }
    );
    expect(toasts.toast.success).toHaveBeenCalledWith('reportReply.thanks');
    expect(document.querySelector('.ferni-report-sheet')).toBeNull();
  });

  it('with one reply chosen, shows it and sends no note when none was written', async () => {
    api.apiPost.mockResolvedValue({ ok: true, status: 201 });
    const closed = openReportSheet(replies, replies[1]);
    expect(document.querySelector('input[name=reply]')).toBeNull();
    expect(document.querySelector('blockquote')?.textContent).toBe('First reply');
    choose('reason', 'harmful');
    submit().click();
    await closed;
    expect(api.apiPost.mock.calls[0]?.[1]).not.toHaveProperty('note');
  });

  it('says so when today’s limit is reached, and keeps the sheet open', async () => {
    api.apiPost.mockResolvedValue({ ok: false, status: 429 });
    void openReportSheet(replies);
    choose('reason', 'other');
    submit().click();
    await settle();
    expect(document.querySelector('[role=alert]')?.textContent).toBe('reportReply.tooMany');
    expect(toasts.toast.success).not.toHaveBeenCalled();
    expect(submit().disabled).toBe(false);
  });

  it('labels every question for screen readers and caps the note at 500', () => {
    void openReportSheet(replies);
    const legends = [...document.querySelectorAll('legend')].map((l) => l.textContent);
    expect(legends).toEqual(['reportReply.whichReply', 'reportReply.whatsWrong']);
    expect(document.querySelector('dialog')?.getAttribute('aria-labelledby')).toBe(
      'ferni-report-sheet-title'
    );
    expect(document.querySelector('textarea')?.maxLength).toBe(500);
    expect(document.querySelectorAll('input[name=reason]')).toHaveLength(4);
  });
});

describe('where reporting shows', () => {
  it('during a call: a Report button beside Mute once Ferni has said something', () => {
    entry.initReportReply();
    document.dispatchEvent(new CustomEvent('ferni:connected'));
    const button = document.getElementById('reportReplyBtn')!;
    expect(button.hidden).toBe(true);
    say('Hi, good to hear you');
    expect(button.hidden).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('reportReply.describe:Ferni');
    document.dispatchEvent(new CustomEvent('ferni:disconnected'));
    expect(document.getElementById('reportReplyBtn')).toBeNull();
  });

  it('after a call: a link on the card, only when there is something to report', () => {
    expect(entry.buildReportLink('Ferni')).toBeNull();
    recordReply('Something Ferni said', 'voice-1');
    expect(entry.buildReportLink('Ferni')?.textContent).toBe('reportReply.describe:Ferni');
    localStorage.setItem(entry.REPORT_REPLY_FLAG_KEY, 'false');
    expect(entry.buildReportLink('Ferni')).toBeNull();
  });
});
