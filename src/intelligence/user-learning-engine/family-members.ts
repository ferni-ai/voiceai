/**
 * Family members learned from the names the caller said ("my brother Jason"), filed on the
 * profile at session end. Read by the person model and the "how's Jason doing?" callback.
 *
 * @module intelligence/user-learning-engine/family-members
 */

import { nameAsSaid, relationWordNearest } from '../../memory/index.js';
import type { FamilyMember } from '../../types/user-profile.js';
import type { SmallDetail } from '../conversation-quality.js';

/** The relation words a family member is filed under, as the caller said them. */
const FAMILY_WORDS = [
  'wife',
  'husband',
  'spouse',
  'partner',
  'son',
  'daughter',
  'mother',
  'father',
  'mom',
  'dad',
  'brother',
  'sister',
  'grandma',
  'grandpa',
  'grandmother',
  'grandfather',
  'aunt',
  'uncle',
  'cousin',
  'niece',
  'nephew',
];

/**
 * Add each named family member in `details` to `members` once, by name. The relation is the
 * whole word nearest the name: a substring match filed "my brother Jason" as a son (#3993).
 */
export function addFamilyMembers(members: FamilyMember[], details: readonly SmallDetail[]): void {
  for (const detail of details) {
    const name = detail.type === 'person_name' && detail.context ? nameAsSaid(detail.value) : null;
    if (!name) continue;
    const relationship = relationWordNearest(detail.context, name, FAMILY_WORDS);
    if (!relationship) continue;
    if (members.some((m) => m.name?.toLowerCase() === name.toLowerCase())) continue;
    members.push({ relationship, name, mentionedTopics: [] });
  }
}
