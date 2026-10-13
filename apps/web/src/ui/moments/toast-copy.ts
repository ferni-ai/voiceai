/**
 * How Moments copy maps onto the toast region when the overlay host renders it
 * (ui/overlay/toast-region.ts). Kept out of manager.ts, which is over the
 * file-size budget.
 *
 * @module ui/moments/toast-copy
 */

import { t } from '../../i18n/index.js';
import { tp } from '../../i18n/plural.js';
import type { ToastTone } from '../overlay/toast-region.js';
import type { CelebrationConfig, NoticeType } from './types.js';

/** Toast tone for each notice type when the overlay host renders notices. */
export const NOTICE_TONES: Record<NoticeType, ToastTone> = {
  info: 'info',
  checkin: 'info',
  secret: 'info',
  seeds: 'success',
  badge: 'success',
  streak: 'success',
};

/** Headline and subtitle for a celebration (the card and the achievement toast share them). */
export function celebrationCopy(config: CelebrationConfig): { title: string; subtitle?: string } {
  const title =
    config.title ??
    (config.type === 'streak'
      ? tp('moments.streakTitle', config.count ?? 0)
      : config.type === 'team_unlock'
        ? t('moments.teamUnlockTitle', { name: config.personaName ?? '' })
        : t('moments.niceWork'));

  const subtitle =
    config.subtitle ??
    (config.type === 'streak'
      ? t('moments.streakSubtitle')
      : config.type === 'team_unlock'
        ? t('celebration.teamUnlockSubtitle')
        : undefined);
  return { title, subtitle };
}
