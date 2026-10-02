/**
 * Groups, add choices, status labels and date formatting for the
 * "Work & places" tab.
 *
 * @module ui/memory-control/work-places-config
 */

import { getLocale, t } from '../../i18n/index.js';
import type {
  LifeArea,
  LifeItem,
  LifeKind,
  LifeStatus,
} from '../../services/work-places.service.js';

export interface Group {
  readonly id: string;
  readonly label: () => string;
  readonly match: (i: LifeItem) => boolean;
}

export const WORK_GROUPS: readonly Group[] = [
  {
    id: 'job-now',
    label: () => t('lifeMemory.workNow', 'Your work now'),
    match: (i) => i.kind === 'job' && i.status === 'current',
  },
  {
    id: 'upcoming',
    label: () => t('lifeMemory.comingUp', 'Coming up'),
    match: (i) => (i.kind === 'event' || i.kind === 'application') && i.status === 'planned',
  },
  {
    id: 'projects',
    label: () => t('lifeMemory.projects', 'Projects'),
    match: (i) => i.kind === 'project',
  },
  { id: 'wins', label: () => t('lifeMemory.wins', 'Wins'), match: (i) => i.kind === 'win' },
  {
    id: 'stress',
    label: () => t('lifeMemory.onYourMind', 'On your mind'),
    match: (i) => i.kind === 'stress',
  },
  {
    id: 'goals',
    label: () => t('lifeMemory.goals', 'Career hopes'),
    match: (i) => i.kind === 'goal',
  },
  {
    id: 'job-past',
    label: () => t('lifeMemory.pastJobs', 'Past jobs'),
    match: (i) => i.kind === 'job' && i.status === 'past',
  },
  {
    id: 'events-past',
    label: () => t('lifeMemory.pastEvents', 'Interviews & applications'),
    match: (i) => (i.kind === 'event' || i.kind === 'application') && i.status !== 'planned',
  },
];

export const PLACE_GROUPS: readonly Group[] = [
  {
    id: 'home',
    label: () => t('lifeMemory.home', 'Home'),
    match: (i) => i.kind === 'home' && i.status === 'current',
  },
  {
    id: 'trips-next',
    label: () => t('lifeMemory.tripsNext', 'Trips coming up'),
    match: (i) => i.kind === 'trip' && i.status === 'planned',
  },
  {
    id: 'trips-done',
    label: () => t('lifeMemory.tripsDone', "Trips you've taken"),
    match: (i) => i.kind === 'trip' && i.status === 'done',
  },
  {
    id: 'favorites',
    label: () => t('lifeMemory.favorites', 'Favourite spots'),
    match: (i) => i.kind === 'favorite',
  },
  {
    id: 'meaningful',
    label: () => t('lifeMemory.meaningful', 'Places that matter'),
    match: (i) => i.kind === 'meaningful',
  },
  {
    id: 'bucket',
    label: () => t('lifeMemory.someday', 'Someday'),
    match: (i) => i.kind === 'bucket_list',
  },
  {
    id: 'lived',
    label: () => t('lifeMemory.lived', "Places you've lived"),
    match: (i) => i.kind === 'home' && i.status === 'past',
  },
];

export const ADD_KINDS: Readonly<Record<LifeArea, ReadonlyArray<[LifeKind, () => string]>>> = {
  work: [
    ['job', () => t('lifeMemory.kindJob', 'A job')],
    ['project', () => t('lifeMemory.kindProject', 'A project')],
    ['win', () => t('lifeMemory.kindWin', 'A win')],
    ['goal', () => t('lifeMemory.kindGoal', 'A career hope')],
    ['event', () => t('lifeMemory.kindEvent', 'An interview or review')],
  ],
  places: [
    ['home', () => t('lifeMemory.kindHome', 'Where you live')],
    ['trip', () => t('lifeMemory.kindTrip', 'A trip')],
    ['favorite', () => t('lifeMemory.kindFavorite', 'A favourite spot')],
    ['meaningful', () => t('lifeMemory.kindMeaningful', 'A place that matters')],
    ['bucket_list', () => t('lifeMemory.kindBucket', 'A place you dream of')],
  ],
};

/** Statuses a person can pick when correcting an item. */
export const STATUS_CHOICES: Readonly<Partial<Record<LifeKind, readonly LifeStatus[]>>> = {
  job: ['current', 'past'],
  project: ['current', 'past'],
  home: ['current', 'past'],
  trip: ['planned', 'done'],
  event: ['planned', 'done'],
  goal: ['planned', 'done'],
};

export function statusLabel(status: LifeStatus, kind: LifeKind): string {
  if (kind === 'job')
    return status === 'current'
      ? t('lifeMemory.statusCurrentJob', 'Current')
      : t('lifeMemory.statusPastJob', 'Past');
  if (kind === 'home')
    return status === 'current'
      ? t('lifeMemory.statusLiveHere', 'I live here')
      : t('lifeMemory.statusLivedHere', 'I used to live here');
  const labels: Record<LifeStatus, string> = {
    current: t('lifeMemory.statusCurrent', 'Ongoing'),
    past: t('lifeMemory.statusPast', 'Finished'),
    planned: t('lifeMemory.statusPlanned', 'Coming up'),
    done: t('lifeMemory.statusDone', 'Done'),
  };
  return labels[status];
}

/** t() with placeholders filled even when only the fallback text is available. */
export function tf(key: string, fallback: string, params: Record<string, string>): string {
  return t(key, fallback, params).replace(/\{(\w+)\}/g, (m, k: string) => params[k] ?? m);
}

/** "Oct 2026" for months, "October 9, 2026" for days. */
export function formatLifeDate(value: string | undefined): string {
  if (!value) return '';
  const month = /^\d{4}-\d{2}$/.test(value);
  const date = new Date(`${month ? `${value}-01` : value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(
    getLocale(),
    month
      ? { year: 'numeric', month: 'short', timeZone: 'UTC' }
      : { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }
  );
}

export function dateRange(item: LifeItem): string {
  const start = formatLifeDate(item.startDate);
  const end = formatLifeDate(item.endDate);
  if (start && end && start !== end) return `${start} – ${end}`;
  return start || (end ? tf('lifeMemory.until', 'until {date}', { date: end }) : '');
}
