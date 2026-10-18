/**
 * Where a person can report one of Ferni's replies, at any width:
 * - during a call, a quiet "Report" button beside Mute, shown once Ferni has
 *   said something;
 * - after a call, a "Report something Ferni said" link on the after-call card.
 * Both open the report sheet (loaded on first use) with this call's replies.
 *
 * Both app stores require an in-app way to report the assistant's replies, so
 * this is on by default. Kill switch: VITE_REPORT_REPLY=false for a build, or
 * localStorage `ferni:flag:report-reply` = 'false' for one browser.
 *
 * @module ui/report-reply/report-reply-entry
 */

import { t } from '../../i18n/index.js';
import { connectionService } from '../../services/connection.service.js';
import { createLogger } from '../../utils/logger.js';
import {
  getRecentReplies,
  onRepliesChanged,
  trackRecentReplies,
  type RecentReply,
} from './recent-replies.js';

const log = createLogger('ReportReplyEntry');
export const REPORT_REPLY_FLAG_KEY = 'ferni:flag:report-reply';
const BUTTON_ID = 'reportReplyBtn';
const FLAG_ICON =
  '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/></svg>';

export function isReportReplyEnabled(): boolean {
  try {
    const override = localStorage.getItem(REPORT_REPLY_FLAG_KEY);
    if (override === 'true' || override === 'false') return override === 'true';
  } catch (error) {
    log.debug('localStorage unavailable for report-reply flag', { error: String(error) });
  }
  return import.meta.env.VITE_REPORT_REPLY !== 'false';
}

/** Open the sheet with this call's replies, or one chosen reply. */
export function openReport(chosen?: RecentReply): void {
  void import('./report-reply-sheet.js')
    .then((m) => m.openReportSheet(getRecentReplies(), chosen))
    .catch((error: unknown) => log.warn('Report sheet failed to open', { error: String(error) }));
}

function syncButton(): void {
  const button = document.getElementById(BUTTON_ID);
  if (!button) return;
  button.hidden = getRecentReplies().length === 0;
  button.style.display = button.hidden ? 'none' : ''; // .btn sets display, which beats [hidden]
}

function addCallButton(): void {
  const controls = document.querySelector('.controls');
  if (!controls || document.getElementById(BUTTON_ID)) return;
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  // A round icon button like Mute: quiet, and it fits beside Disconnect at 390px
  button.className = 'btn btn-secondary btn-mute btn-report-reply';
  button.setAttribute('aria-label', t('reportReply.describe', { name: 'Ferni' }));
  button.title = t('reportReply.button');
  button.innerHTML = FLAG_ICON; // a constant icon, no text from anywhere else
  button.addEventListener('click', () => openReport());
  controls.append(button);
  syncButton();
}

/** The after-call card's quiet link, or null when there is nothing to report. */
export function buildReportLink(personaName: string): HTMLElement | null {
  if (!isReportReplyEnabled() || getRecentReplies().length === 0) return null;
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'after-call-support after-call-report';
  link.textContent = t('reportReply.describe', { name: personaName });
  link.addEventListener('click', () => openReport());
  return link;
}

export function initReportReply(): void {
  if (!isReportReplyEnabled()) return;
  trackRecentReplies(() => connectionService.getRoomState().roomName);
  onRepliesChanged(syncButton);
  document.addEventListener('ferni:connected', addCallButton);
  document.addEventListener('ferni:disconnected', () =>
    document.getElementById(BUTTON_ID)?.remove()
  );
}
