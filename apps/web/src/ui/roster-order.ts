/**
 * The order of the team bar, decided in one place.
 *
 * Ferni comes first, then the teammates in the canonical order of
 * TEAM_MEMBERS (team-unlock.service). Before this the bar used two orders:
 * members in the roster followed a list local to team.ui.ts, and the "+"
 * (addable) teammates followed TEAM_MEMBERS and were appended after them, so
 * adding someone or tapping a teammate that got auto-added moved avatars around.
 *
 * Stable roster (VITE_ROSTER_STABLE): every teammate keeps one fixed slot
 * whether they are in the roster or addable. Adding someone changes their slot
 * from "+" to a full avatar in place; nobody else moves. Turn it on, in order
 * of precedence:
 * - `?roster_stable=1` in the URL (remembered on this device; `?roster_stable=0` clears it)
 * - `localStorage.ferni_roster_stable = '1'`
 * - build with `VITE_ROSTER_STABLE=true`
 */

export const ROSTER_STABLE_STORAGE_KEY = 'ferni_roster_stable';

export type RosterSlotState = 'member' | 'addable';

export interface RosterSlot {
  id: string;
  state: RosterSlotState;
}

export interface RosterOrderInput {
  /** Canonical order, Ferni first (TEAM_MEMBERS ids). */
  canonical: readonly string[];
  /** Ids in the user's roster (Ferni included), from roster preferences. */
  visible: readonly string[];
  /** Teammates the user may add (unlocked and not in the roster). */
  addable: readonly string[];
  /** One fixed slot per teammate (true) or members first, then addable (false). */
  stable: boolean;
}

function rankOf(canonical: readonly string[]): (id: string) => number {
  return (id) => {
    const i = canonical.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
}

/**
 * Order the team bar. Pure: the same inputs always give the same order, and an
 * id's position depends only on the canonical list, never on input order,
 * recency or who is speaking. Ids outside the canonical list keep their input
 * order after the known ones.
 */
export function orderRoster({ canonical, visible, addable, stable }: RosterOrderInput): RosterSlot[] {
  const rank = rankOf(canonical);
  const byRank = (a: RosterSlot, b: RosterSlot): number => rank(a.id) - rank(b.id);
  const visibleSet = new Set(visible);
  const members: RosterSlot[] = [...visibleSet].map((id) => ({ id, state: 'member' }));
  const addables: RosterSlot[] = [...new Set(addable)]
    .filter((id) => !visibleSet.has(id))
    .map((id) => ({ id, state: 'addable' }));

  if (stable) return [...members, ...addables].sort(byRank);
  // Array.prototype.sort is stable, so unknown ids keep their input order.
  return [...members.sort(byRank), ...addables.sort(byRank)];
}

function readStored(): string | null {
  try {
    return localStorage.getItem(ROSTER_STABLE_STORAGE_KEY);
  } catch {
    // Storage can throw in private mode; the flag then falls back to the build default.
    return null;
  }
}

function remember(on: boolean): void {
  try {
    if (on) localStorage.setItem(ROSTER_STABLE_STORAGE_KEY, '1');
    else localStorage.removeItem(ROSTER_STABLE_STORAGE_KEY);
  } catch {
    // Not remembered; the URL parameter still applies to this page load.
  }
}

export function isRosterStable(): boolean {
  const fromUrl =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('roster_stable');
  if (fromUrl === '1' || fromUrl === '0') {
    remember(fromUrl === '1');
    return fromUrl === '1';
  }
  const stored = readStored();
  if (stored !== null) return stored === '1';
  return import.meta.env.VITE_ROSTER_STABLE === 'true';
}
