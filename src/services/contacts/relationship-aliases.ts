/**
 * Words people use for someone, by the relationship group they belong to. Shared by the
 * contact search ("call my mom") and the people panel's grouping (people-list.ts).
 *
 * @module services/contacts/relationship-aliases
 */

export const RELATIONSHIP_ALIASES: Record<string, string[]> = {
  family: [
    'mom',
    'mother',
    'mama',
    'ma',
    'mommy',
    'dad',
    'father',
    'papa',
    'pa',
    'daddy',
    'brother',
    'bro',
    'sis',
    'sister',
    'grandma',
    'grandmother',
    'granny',
    'nana',
    'grandpa',
    'grandfather',
    'grandad',
    'gramps',
    'aunt',
    'auntie',
    'uncle',
    'cousin',
    'niece',
    'nephew',
    'son',
    'daughter',
    'kid',
    'child',
    'wife',
    'husband',
    'spouse',
    'partner',
  ],
  friend: ['friend', 'buddy', 'pal', 'bestie', 'bff'],
  colleague: ['colleague', 'coworker', 'boss', 'manager', 'teammate'],
  professional: ['doctor', 'dentist', 'lawyer', 'therapist', 'accountant'],
};
