/**
 * The caller card's data (spec §7), in memory for the call only. Home is filled; People, Recent
 * calls and Coming up stay null until their PRs. No forgetGeneration: forgotten topics are
 * re-read at every persona setup instead (ruling 4).
 *
 * @module agents/multi-agent/caller-card/types
 */
export interface HomePlace {
  place: string;
  source: 'preferences' | 'profile' | 'fact';
}
export interface CallerCard {
  v: 1;
  userId: string; // never logged
  builtAt: string; // ISO
  home: Section<HomePlace> | null;
  people: Section<CardPerson[]> | null; // <= 5
  recentCalls: Section<CardCall[]> | null; // <= 3, within 14 days
  comingUp: Section<CardDate[]> | null; // <= 3, next 14 days
  budgetHit: boolean;
}
interface Section<T> {
  value: T;
  loadedMs: number;
} // same role as person-model's Section<T> ({ value, prov }); M6 maps between them
interface CardPerson {
  name: string;
  relation: string | null;
  lastMentioned: string | null;
  sensitive: boolean;
}
interface CardCall {
  who: string; // contact's name as the owner knows them
  status: 'answered' | 'voicemail' | 'no_answer' | 'declined' | 'scheduled' | 'failed'; // closed enum, mapped from call-status.ts
  at: string; // ISO
}
interface CardDate {
  on: string /* YYYY-MM-DD, caller's zone */;
  label: string;
  sensitive: boolean;
  factId: string;
}
