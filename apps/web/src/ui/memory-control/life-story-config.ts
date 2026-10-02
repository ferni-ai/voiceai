/**
 * Groups, add choices and labels for the "Your story" tab.
 *
 * @module ui/memory-control/life-story-config
 */

import { t } from '../../i18n/index.js';
import type { StoryItem, StoryKind } from '../../services/life-story.service.js';
import { tf } from './work-places-config.js';

export interface StoryGroup {
  readonly id: string;
  readonly label: () => string;
  readonly kinds: readonly StoryKind[];
}

export const STORY_GROUPS: readonly StoryGroup[] = [
  {
    id: 'roots',
    label: () => t('lifeStory.roots', 'Where you come from'),
    kinds: ['origin', 'family', 'school'],
  },
  {
    id: 'stories',
    label: () => t('lifeStory.stories', "Stories you've told me"),
    kinds: ['story', 'moment'],
  },
  {
    id: 'turns',
    label: () => t('lifeStory.turns', 'Turning points & chapters'),
    kinds: ['turning_point', 'chapter'],
  },
  {
    id: 'themes',
    label: () => t('lifeStory.themes', 'Threads that keep coming up'),
    kinds: ['theme'],
  },
];

export const ADD_CHOICES: ReadonlyArray<[StoryKind | 'value', () => string]> = [
  ['story', () => t('lifeStory.kind.story', 'A story or memory')],
  ['origin', () => t('lifeStory.kind.origin', 'Where you grew up')],
  ['family', () => t('lifeStory.kind.family', 'Family growing up')],
  ['school', () => t('lifeStory.kind.school', 'School years')],
  ['turning_point', () => t('lifeStory.kind.turningPoint', 'A turning point')],
  ['chapter', () => t('lifeStory.kind.chapter', 'A chapter of your life')],
  ['theme', () => t('lifeStory.kind.theme', 'Something that keeps coming up')],
  ['value', () => t('lifeStory.kind.value', 'Something that matters to you')],
  ['decision', () => t('lifeStory.kind.decision', 'How you make decisions')],
];

/** "age 9 · 1998 · with Sam" */
export function storyDetail(item: StoryItem): string {
  const people = (item.people ?? []).map((p) => p.name);
  return [
    item.period,
    item.date,
    people.length ? tf('lifeStory.with', 'with {people}', { people: people.join(', ') }) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
