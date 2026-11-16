/**
 * The journey dialog's relationship part: the stage map, the stage, the counts and what
 * comes next, all from relationshipStageService (the server's record, services/
 * relationship-facts). The dialog renders it when it opens and again in place whenever the
 * record arrives or changes while it is open, so a dialog opened while the record is on its
 * way fills in rather than keeping "Gathering our story." until it is reopened.
 *
 * @module ui/journey/relationship-overview
 */

import { t } from '../../i18n/index.js';
import { isNoStreaksOn } from '../../config/no-streaks.js';
import { relationshipStageService, getTranslatedStageName } from '../../services/relationship-stage.service.js';
import { relationshipKnown, relationshipNumber, relationshipPendingText } from '../relationship-facts-view.js';
import { JOURNEY_ICONS as ICONS } from '../icons/journey-icons.js';

/** Draws the stage map for a stage and the percent of the way to the next one. */
type JourneyMap = (stage: string, progressPercent: number) => string;

// STAGE DESCRIPTIONS - Brand Voice (Warm, Human, Not Saccharine)
const STAGE_KEYS: Record<string, [string, string]> = {
  'first-meeting': ['relationshipStages.taglines.firstMeeting', 'relationshipStages.descriptions.firstMeeting'],
  'getting-started': ['relationshipStages.taglines.gettingStarted', 'relationshipStages.descriptions.gettingStarted'],
  'building-trust': ['relationshipStages.taglines.buildingTrust', 'relationshipStages.descriptions.buildingTrust'],
  'established': ['relationshipStages.taglines.established', 'relationshipStages.descriptions.established'],
  'deep-partnership': ['relationshipStages.taglines.deepPartnership', 'relationshipStages.descriptions.deepPartnership'],
};

/** The map and the overview section; before the record is in, the honest line and no numbers. */
export function relationshipOverviewHtml(renderMap: JourneyMap): string {
  const known = relationshipKnown();
  const stage = relationshipStageService.getStage();
  const stageMetrics = relationshipStageService.getMetrics();
  const stageProgress = relationshipStageService.getProgressToNextStage();
  const [tagKey, descKey] = (STAGE_KEYS[stage] ?? STAGE_KEYS['first-meeting']) as [string, string];
  const stageName = known ? getTranslatedStageName(stage) : relationshipPendingText();
  const progressPercent = Math.round(stageProgress.progress * 100);
  // Busy only while loading (an unavailable record is said, not pending); no label-only stats read out
  const busy = relationshipStageService.factsStatus() === 'loading';
  const stat = known ? 'class="journey-stat"' : 'class="journey-stat" aria-hidden="true"';

  return `
        <!-- Journey Map - Visual Path (Better than Apple Progress) -->
        ${known ? renderMap(stage, progressPercent) : ''}

        <!-- Progress Overview Section -->
        <section class="journey-progress-overview">
          <h2 class="journey-stage-name">${stageName}</h2>
          <p class="journey-stage-tagline">${known ? t(tagKey) : ''}</p>
          <p class="journey-stage-description">${known ? t(descKey) : ''}</p>

          <div class="journey-stats-row" aria-busy="${busy}">
            <div ${stat}>
              <span class="journey-stat__icon">${ICONS.messageCircle}</span>
              <span class="journey-stat__value">${relationshipNumber(stageMetrics.totalConversations)}</span>
              <span class="journey-stat__label">${t('yourStory.stats.conversations')}</span>
            </div>
            <div ${stat}>
              <span class="journey-stat__icon">${ICONS.calendar}</span>
              <span class="journey-stat__value">${relationshipNumber(stageMetrics.daysSinceFirstMeeting)}</span>
              <span class="journey-stat__label">${t('yourStory.stats.daysTogether')}</span>
            </div>
            ${isNoStreaksOn() ? '' : `<div ${stat}>
              <span class="journey-stat__icon">${ICONS.flame}</span>
              <span class="journey-stat__value">${relationshipNumber(stageMetrics.currentStreak)}</span>
              <span class="journey-stat__label">${t('yourStory.stats.dayStreak')}</span>
            </div>`}
            <div class="journey-stat journey-stat--voice-id" id="journey-voice-id-stat">
              <span class="journey-stat__icon">${ICONS.shield}</span>
              <span class="journey-stat__value journey-stat__value--loading">...</span>
              <span class="journey-stat__label">voice ID</span>
            </div>
          </div>

          ${!known ? '' : stageProgress.nextStage ? `
            <div class="journey-next-stage">
              <span class="journey-next-stage__label">Next: ${getTranslatedStageName(stageProgress.nextStage)}</span>
              <span class="journey-next-stage__req">${stageProgress.requirement}</span>
            </div>
          ` : `
            <div class="journey-next-stage journey-next-stage--max">
              <span class="journey-next-stage__label">${t('journey.maxLevelReached')} <span class="journey-next-stage__icon">${ICONS.star}</span></span>
            </div>
          `}
        </section>`;
}

/**
 * Re-render the open dialog's relationship part whenever the record arrives or changes.
 * `afterRender` refills what the dialog fills itself (the voice ID stat). Returns the
 * unsubscribe, for when the dialog closes.
 */
export function followRelationshipOverview(modal: HTMLElement, renderMap: JourneyMap, afterRender: () => void): () => void {
  return relationshipStageService.onFactsChange(() => {
    const overview = modal.querySelector('.journey-progress-overview');
    if (!overview) return;
    modal.querySelector('.journey-map-section')?.remove();
    overview.outerHTML = relationshipOverviewHtml(renderMap);
    afterRender();
  });
}
