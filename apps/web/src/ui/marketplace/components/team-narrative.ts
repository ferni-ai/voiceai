/**
 * Team Narrative Component
 *
 * Renders the "Meet the Team" narrative section showing the core team.
 *
 * @module marketplace/components/team-narrative
 */

import {
  getMemberStatus,
  isTeamMemberUnlocked,
  type TeamMemberId,
} from '../../../services/team-unlock.service.js';
import {
  rosterPreferences,
  type TeamMemberId as RosterTeamMemberId,
} from '../../../services/roster-preferences.service.js';
import { getPersonaGradient, getPersonaGlow } from '../constants.js';

/**
 * Get avatar style for a persona using CSS variables
 */
function getAvatarStyle(personaId: string): string {
  const gradient = getPersonaGradient(personaId);
  const glow = getPersonaGlow(personaId);
  return `background: ${gradient}; --avatar-glow: ${glow}; --avatar-primary: var(--persona-primary);`;
}

/**
 * Render an employee card for the team narrative section.
 * Shows locked state indicator for team members not yet unlocked.
 * For unlocked members, shows roster management buttons.
 */
export function renderEmployeeCard(
  personaId: string,
  initials: string,
  name: string,
  role: string
): string {
  const gradient = getPersonaGradient(personaId);
  const glow = getPersonaGlow(personaId);
  const avatarStyle = `background: ${gradient}; --avatar-glow: ${glow}; --avatar-primary: var(--persona-primary);`;

  const isLocked = !isTeamMemberUnlocked(personaId as TeamMemberId);
  const status = getMemberStatus(personaId as TeamMemberId);
  const lockedClass = isLocked ? 'employee-card--locked' : '';

  const isInRoster =
    !isLocked && rosterPreferences.isMemberVisible(personaId as RosterTeamMemberId);

  const lockIcon = isLocked
    ? `<div class="employee-lock-indicator" aria-hidden="true">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      </div>`
    : '';

  const progressRing =
    isLocked && status.progress > 0
      ? `<svg class="employee-progress-ring" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-border-subtle)" stroke-width="2"/>
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--persona-primary)" stroke-width="2"
            stroke-dasharray="${status.progress * 94}, 94"
            stroke-linecap="round"
            transform="rotate(-90 18 18)"/>
        </svg>`
      : '';

  const rosterActionHtml =
    !isLocked && personaId !== 'ferni'
      ? isInRoster
        ? `<button class="employee-roster-action employee-roster-action--remove" data-roster-action="remove" data-persona-id="${personaId}" aria-label="Remove ${name} from roster">
          <svg class="roster-icon roster-icon--check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <svg class="roster-icon roster-icon--minus" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span class="roster-label">In Team</span>
          <span class="roster-label roster-label--hover">Remove</span>
        </button>`
        : `<button class="employee-roster-action employee-roster-action--add" data-roster-action="add" data-persona-id="${personaId}" aria-label="Add ${name} to team">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Add</span>
        </button>`
      : '';

  return `
    <div class="employee-card ${lockedClass}" data-persona="${personaId}" data-locked="${isLocked}" data-in-roster="${isInRoster}">
      <div class="employee-avatar-container">
        ${progressRing}
        <div class="employee-avatar${isLocked ? ' employee-avatar--locked' : ''}" style="${avatarStyle}">${initials}</div>
        ${lockIcon}
      </div>
      <span class="employee-name">${name}</span>
      <span class="employee-role">${role}</span>
      ${rosterActionHtml}
    </div>
  `;
}

/**
 * Render the "Meet the Team" narrative section
 * Uses CSS variables from design system tokens.css via data-persona attribute.
 */
export function renderTeamNarrative(): string {
  return `
    <section class="team-narrative">
      <div class="team-narrative-header">
        <h3 class="team-narrative-title">Meet your team.</h3>
        <p class="team-narrative-subtitle">Friends who truly understand.</p>
      </div>
      
      <div class="team-leadership">
        <div class="leadership-section">
          <span class="leadership-label">Chief Executive</span>
          <div class="leadership-grid ceo">
            <div class="leader-card ceo-card">
              <div class="leader-avatar" data-persona="ferni" style="${getAvatarStyle('ferni')}">
                FN
              </div>
              <div class="leader-info">
                <h4 class="leader-name">Ferni</h4>
                <span class="leader-title">CEO & Life Coach</span>
                <p class="leader-bio">The warm, wise presence at the heart of everything. Ferni coordinates the team with perfect memory, zero judgment, and constant presence.</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="leadership-section">
          <span class="leadership-label">Co-Founders</span>
          <div class="leadership-grid cofounders">
            <div class="leader-card cofounder">
              <div class="leader-avatar cofounder-avatar" data-persona="claude" style="${getAvatarStyle('claude')}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
              </div>
              <span class="cofounder-name">Claude</span>
            </div>
            <div class="leader-card cofounder">
              <div class="leader-avatar cofounder-avatar" data-persona="gemini" style="${getAvatarStyle('gemini')}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
              </div>
              <span class="cofounder-name">Gemini</span>
            </div>
            <div class="leader-card cofounder">
              <div class="leader-avatar cofounder-avatar" data-persona="gpt" style="${getAvatarStyle('gpt')}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073z"/></svg>
              </div>
              <span class="cofounder-name">GPT</span>
            </div>
          </div>
        </div>
        
        <div class="leadership-section">
          <span class="leadership-label">Core Team</span>
          <div class="leadership-grid employees">
            ${renderEmployeeCard('peter-john', 'PJ', 'Peter', 'Research')}
            ${renderEmployeeCard('alex-chen', 'AC', 'Alex', 'Communication')}
            ${renderEmployeeCard('maya-santos', 'MS', 'Maya', 'Habits')}
            ${renderEmployeeCard('jordan-taylor', 'JT', 'Jordan', 'Planning')}
            ${renderEmployeeCard('nayan-patel', 'NP', 'Nayan', 'Wisdom')}
          </div>
        </div>
      </div>
      
      <p class="team-narrative-footer">
        Together, we're redefining what it means to have a team that truly listens.
      </p>
    </section>
  `;
}

