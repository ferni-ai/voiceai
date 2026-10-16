/**
 * The state classes the caretaker styles (--in-team, --locked; --addable and --switching
 * are set where those happen), from the unlock service, which follows the server. A
 * locked teammate carries the server's reason as its tooltip and accessible description,
 * and a click shows it (showLockedMemberFeedback in team.ui.ts) instead of sending a
 * handoff_request. Kept apart from team.ui.ts, which is over the file-size limit.
 */
import {
  getMemberStatus,
  getTeamMember,
  type TeamMemberId,
} from '../services/team-unlock.service.js';

/** Sets data-locked and the state classes; the coordinator (Ferni) is always in the team. */
export function applyLockState(
  element: HTMLElement,
  id: TeamMemberId,
  isLocked: boolean,
  coordinator = false
): void {
  element.setAttribute('data-locked', isLocked.toString());
  if (coordinator) {
    element.classList.add('team-member--in-team');
    return;
  }
  element.classList.toggle('team-member--locked', isLocked);
  element.classList.toggle('team-member--in-team', !isLocked);
  const reasonId = `team-lock-reason-${id}`;
  element.querySelector(`#${reasonId}`)?.remove();
  const reason = isLocked ? lockReasonFor(id) : undefined;
  if (!reason) {
    element.removeAttribute('title');
    element.removeAttribute('aria-describedby');
    return;
  }
  const described = document.createElement('span');
  described.id = reasonId;
  described.className = 'sr-only';
  described.textContent = reason;
  element.appendChild(described);
  element.setAttribute('title', reason);
  element.setAttribute('aria-describedby', reasonId);
}

/** Why a teammate is locked: the server's words when it has said, else the shipped teaser. */
function lockReasonFor(id: TeamMemberId): string | undefined {
  return getMemberStatus(id).lockReason || getTeamMember(id)?.teaserMessage;
}
