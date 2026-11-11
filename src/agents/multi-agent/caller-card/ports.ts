/**
 * What the caller card reads, as functions: the production ones are composed in wiring.ts,
 * tests hand in fakes. Any of them may be slow or throw; load.ts bounds and catches each.
 * People, Recent calls and Coming up add their readers in their own PRs (spec §11).
 *
 * @module agents/multi-agent/caller-card/ports
 */
import type { HomePlace } from './types.js';

export interface CallerCardPorts {
  /** Their home place (a city or area, chosen by place.ts), or null when none is known. */
  home: (userId: string) => Promise<HomePlace | null>;
  /** memory_state/forgotten topics plus this process's, or null when they can't be read. */
  forgotten: (userId: string) => Promise<string[] | null>;
  /** MINOR_CARE: the account is held as a minor's, so it gets no card (ruling 5). */
  minorCare: (userId: string) => Promise<boolean>;
}
