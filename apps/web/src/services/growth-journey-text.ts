/**
 * Growth Journey text: the season and milestone definitions hold i18n keys,
 * translated here when they leave the service.
 *
 * The definitions are built when the module is imported, which is before
 * initI18n() has loaded any translations, so calling t() there showed raw keys
 * ("growthJourney.seasons.fall.name") in the UI. Translating on the way out
 * also follows a later language change.
 */

import { t } from '../i18n/index.js';

/** The text fields of a JourneyMilestone (kept structural to avoid an import cycle). */
interface MilestoneText {
  title: string;
  message: string;
  gift: { title?: string };
}

/** The text fields of a Season. */
interface SeasonText<M extends MilestoneText> {
  name: string;
  description: string;
  milestones: M[];
}

/** A copy of the milestone with its title, message and gift title translated. */
export function localizeMilestone<M extends MilestoneText>(milestone: M): M {
  const { gift } = milestone;
  return {
    ...milestone,
    title: t(milestone.title),
    message: t(milestone.message),
    gift: gift.title ? { ...gift, title: t(gift.title) } : { ...gift },
  };
}

/** A copy of the season with its name, description and milestones translated. */
export function localizeSeason<M extends MilestoneText, S extends SeasonText<M>>(season: S): S {
  return {
    ...season,
    name: t(season.name),
    description: t(season.description),
    milestones: season.milestones.map((milestone) => localizeMilestone(milestone)),
  };
}
