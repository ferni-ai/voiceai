/**
 * Who the server says is unlocked, and why each locked teammate is locked (its words),
 * from GET /api/relationship/team-unlocks: the same rule the voice agent refuses taps
 * with. While the tier hasn't changed here since that answer, it decides who is
 * unlocked; the local calculation only fills in progress. Before, the app read a field
 * the server never sent (unlockedTeamMembers) and decided from its own metrics, so on
 * dev 2026-10-11 it offered Nayan and Jordan, the agent refused both taps, and it
 * didn't offer Maya, whom the server had unlocked.
 *
 * Kept apart from team-unlock.service.ts (over the file-size limit). It takes member ids
 * and teasers as arguments, so it never imports the service back.
 */

type Tier = 'free' | 'friend' | 'partner';

/** The body of GET /api/relationship/team-unlocks, as far as the app reads it. */
export interface TeamUnlocksResponse {
  bypassMode?: string;
  teamByNeed?: boolean;
  tier?: string;
  unlockedMembers?: string[];
  members?: Array<{ id?: string; unlocked?: boolean; teaserMessage?: string | null }>;
}

/** Same shape as MemberUnlockStatus in team-unlock.service.ts. */
interface UnlockStatus {
  unlocked: boolean;
  progress: number;
  lockReason?: string;
  unlockHint?: string;
}

interface ServerView {
  unlocked: Set<string>;
  tier: Tier;
  reasons: Map<string, string>;
}

let view: ServerView | null = null;

/** Unsubscribes the resync on a refused handoff; set once per page (resyncOnRefusal). */
let stopResyncOnRefusal: (() => void) | null = null;

/** Keeps the server's answer; a response without unlockedMembers changes nothing. */
export function record(
  data: TeamUnlocksResponse,
  tier: Tier,
  members: readonly { id: string }[]
): void {
  if (!Array.isArray(data.unlockedMembers)) return;
  const known = new Set(members.map((m) => m.id));
  const reasons = new Map<string, string>();
  for (const m of data.members ?? []) {
    if (m.id && known.has(m.id) && !m.unlocked && typeof m.teaserMessage === 'string') {
      reasons.set(m.id, m.teaserMessage);
    }
  }
  view = { unlocked: new Set(data.unlockedMembers.filter((id) => known.has(id))), tier, reasons };
}

/** The server's answer when it still describes this client (the tier hasn't moved since). */
function current(tier: Tier): ServerView | null {
  return view && view.tier === tier ? view : null;
}

/** Whether the server has this teammate unlocked; undefined when it has no current answer. */
export function unlocked(id: string, tier: Tier): boolean | undefined {
  return current(tier)?.unlocked.has(id);
}

/** The local status, with the server's decision and reason when there is one. */
export function decide(
  local: UnlockStatus,
  member: { id: string; teaserMessage?: string },
  tier: Tier,
  bypassed: boolean
): UnlockStatus {
  const decided = current(tier);
  if (!decided || member.id === 'ferni' || bypassed) return local;
  if (decided.unlocked.has(member.id)) return { unlocked: true, progress: 1 };
  return {
    ...local,
    unlocked: false,
    // Local metrics said unlocked: they're wrong, so they say nothing about progress either
    progress: local.unlocked ? 0 : local.progress,
    lockReason: decided.reasons.get(member.id) ?? local.lockReason ?? member.teaserMessage,
  };
}

/**
 * A refused tap means this client and the server disagreed: ask the server again, so the
 * teammate shows as locked, with its reason, instead of offering another dead click.
 */
export function resyncOnRefusal(resync: () => void): void {
  if (stopResyncOnRefusal) return;
  const claim = (): void => undefined; // claimed now; the import below fills it in
  stopResyncOnRefusal = claim;
  void import('./handoff.service.js').then(({ handoffService }) => {
    if (stopResyncOnRefusal !== claim) return; // reset meanwhile
    stopResyncOnRefusal = handoffService.onHandoffFailed(() => resync());
  });
}

export function reset(): void {
  view = null;
  stopResyncOnRefusal?.();
  stopResyncOnRefusal = null;
}
