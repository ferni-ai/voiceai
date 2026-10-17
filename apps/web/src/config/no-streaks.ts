/**
 * No-streaks flag. Off by default.
 *
 * The brand doesn't count streaks ("Growth Through Gentleness" in
 * CORE-PRINCIPLES.md): showing up is noticed, never tallied, and heavy,
 * compulsion-driven use goes with worse wellbeing. When on, the web app shows
 * no streak counts, fires no streak celebrations, milestone notices or
 * streak rituals, and pays no streak-gated seeds. Seeds for genuine actions
 * (a day's conversation, goals, referrals) still accrue.
 *
 * Streak data is still recorded, so turning the flag off restores everything.
 *
 * Turn it on by building with `VITE_NO_STREAKS=true`.
 */
export function isNoStreaksOn(): boolean {
  return import.meta.env.VITE_NO_STREAKS === 'true';
}

/** The streak count to show: 0 under VITE_NO_STREAKS, so `streak > 0` UI stays hidden. */
export function shownStreak(count: number): number {
  return isNoStreaksOn() ? 0 : count;
}
