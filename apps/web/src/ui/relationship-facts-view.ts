/**
 * How a surface shows the relationship's numbers (conversations, days together, stage),
 * all from relationshipStageService once it holds the server's record (services/
 * relationship-facts). Before that a surface says so in words: never a 0, never "New Friends".
 *
 * @module ui/relationship-facts-view
 */

import { t } from '../i18n/index.js';
import { tp } from '../i18n/plural.js';
import { relationshipStageService } from '../services/relationship-stage.service.js';

/** True once the server's numbers are in. */
export function relationshipKnown(): boolean {
  return relationshipStageService.factsStatus() === 'known';
}

/** The honest line while the numbers are not in: still loading, or the server couldn't say. */
export function relationshipPendingText(): string {
  return relationshipStageService.factsStatus() === 'unavailable'
    ? t('relationshipFacts.unavailable')
    : t('relationshipFacts.loading');
}

/** A count to show, or nothing while the server's numbers are not in (the line above says why). */
export function relationshipNumber(value: number): string {
  return relationshipKnown() ? String(value) : '';
}

/** The home journey card before the numbers are in: one quiet line, no ring, no stage. */
export function relationshipPendingCardHtml(): string {
  return `<div class="progress-collapsed"><div class="progress-collapsed-text"><span class="progress-stage-name">${relationshipPendingText()}</span></div></div>`;
}

/** "317 days • 59 conversations", or nothing while the numbers are not in. */
export function relationshipStatsHtml(className: string): string {
  if (!relationshipKnown()) return '';
  const { daysSinceFirstMeeting, totalConversations } = relationshipStageService.getMetrics();
  return `<div class="${className}"><span>${tp('relationshipFacts.days', daysSinceFirstMeeting)}</span><span>•</span><span>${tp('relationshipFacts.conversations', totalConversations)}</span></div>`;
}
