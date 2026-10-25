/**
 * The pause the speech coordinator keeps between the outgoing persona's goodbye and the
 * next persona's first line at a handoff (HANDOFF_FAST_ARRIVAL, agents/multi-agent/handoff-fast-arrival.ts).
 *
 * After every agent utterance the coordinator waits a post-speech cooldown before it
 * speaks the next queued line: at least 750 ms (1.5 × the 500 ms default echo delay),
 * up to 2 s. It is meant to let the agent's own echo die away before Ferni speaks again.
 * At a handoff it is dead air between two voices. Dev recordings 2026-10-17..21 (46
 * handoffs): from the goodbye's last voiced frame to the teammate's first, p50 1.12 s,
 * p90 1.27 s, and the greeting sat queued in the coordinator for most of it.
 *
 * While a handoff holds the window open, a speech end waits `gapMs`, not the cooldown.
 * The window closes when the handoff ends, or after `forMs` at most.
 *
 * @module speech/coordination/arrival-cooldown
 */

let open: { gapMs: number; until: number } | null = null;

/** Open the window: speech ends wait `gapMs` until it closes. */
export function armArrivalCooldown(gapMs: number, forMs = 15_000): void {
  open = { gapMs, until: Date.now() + forMs };
}

/** Close the window: the coordinator's own cooldown again. */
export function disarmArrivalCooldown(): void {
  open = null;
}

/** The cooldown to use now while the window is open; undefined when it is closed. */
export function arrivalCooldownMs(now: number = Date.now()): number | undefined {
  if (open && now > open.until) open = null;
  return open?.gapMs;
}
