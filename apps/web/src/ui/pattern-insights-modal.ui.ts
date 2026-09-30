/**
 * Pattern Insights Modal
 *
 * Opens "Your Patterns" from the settings menu or the voice agent
 * (ferni:open-patterns). The insights card is built to be embedded; this hosts
 * it in the shared base Modal, which brings the close button, Escape,
 * backdrop dismissal and the brand modal styling.
 */

import { t } from '../i18n/index.js';
import { Modal } from '../components/base/modal.js';
import { createLogger } from '../utils/logger.js';
import { showPatternInsightsCard } from './pattern-insights.ui.js';

const log = createLogger('PatternInsightsModal');

class PatternInsightsModal extends Modal {
  constructor() {
    super({
      id: 'pattern-insights',
      title: t('menu.items.patternInsights', 'Your Patterns'),
      tagline: t('patternInsights.subtitle', 'Insights from our conversations'),
      cardClassName: 'pattern-insights-modal',
    });
  }

  /** Where the insights card goes. */
  getBody(): HTMLElement | null {
    return this.querySelector<HTMLElement>('.ferni-modal__content');
  }
}

let modal: PatternInsightsModal | null = null;

/**
 * Open the pattern insights modal, fetching fresh insights each time.
 */
export async function openPatternInsights(): Promise<void> {
  if (!modal) {
    modal = new PatternInsightsModal();
    modal.mount(document.body);
  }
  modal.open();

  const body = modal.getBody();
  if (!body) {
    log.warn('Pattern insights modal has no content area');
    return;
  }
  await showPatternInsightsCard(body, { embedded: true });
}

/**
 * Remove the modal from the page (app teardown, tests).
 */
export function disposePatternInsightsModal(): void {
  modal?.dispose();
  modal = null;
}
