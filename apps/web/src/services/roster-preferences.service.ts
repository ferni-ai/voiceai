/**
 * Roster Preferences Service
 *
 * Manages which team members the user has chosen to show in their roster.
 * Implements the "Get to Know Ferni First" UX pattern:
 *
 * - New users see only Ferni + prominent "Meet Your Team" button
 * - Users can add team members from the marketplace
 * - Added members persist across sessions
 * - Subscribers can show all members at once
 *
 * This reduces initial overwhelm while still allowing full access to the team.
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('RosterPrefs');

// ============================================================================
// TYPES
// ============================================================================

export type TeamMemberId =
  'ferni' | 'peter-john' | 'maya-santos' | 'jordan-taylor' | 'alex-chen' | 'nayan-patel';

export interface RosterPreferences {
  /** Members the user has explicitly added to their roster */
  addedMembers: TeamMemberId[];
  /** Whether to show all available team members (for subscribers) */
  showAllMembers: boolean;
  /** First time user - show onboarding hint */
  isFirstVisit: boolean;
  /** Last updated timestamp */
  lastUpdated: number;
}

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEY = 'ferni_roster_prefs';

function getDefaultPreferences(): RosterPreferences {
  return {
    addedMembers: [],
    showAllMembers: false,
    isFirstVisit: true,
    lastUpdated: Date.now(),
  };
}

function loadPreferences(): RosterPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<RosterPreferences>;
      const addedMembers = Array.isArray(parsed.addedMembers)
        ? parsed.addedMembers.filter((id): id is TeamMemberId => typeof id === 'string')
        : [];
      return {
        ...getDefaultPreferences(),
        ...parsed,
        addedMembers,
      };
    }
  } catch (err) {
    log.warn('Could not load roster preferences:', err);
  }
  return getDefaultPreferences();
}

function savePreferences(prefs: RosterPreferences): void {
  try {
    prefs.lastUpdated = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (err) {
    log.warn('Could not save roster preferences:', err);
  }
}

// ============================================================================
// STATE
// ============================================================================

// Loaded from storage on first use, so a read or a write that happens before
// initRosterPreferences() (or without it) still sees the saved roster instead
// of an empty one, and an add can never overwrite what was saved.
let loaded: RosterPreferences | null = null;
const changeListeners: Set<() => void> = new Set();

function current(): RosterPreferences {
  loaded ??= loadPreferences();
  return loaded;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize the roster preferences service
 */
export function initRosterPreferences(): void {
  loaded = loadPreferences();
  const preferences = loaded;
  log.debug('Roster preferences loaded:', {
    addedMembers: preferences.addedMembers.length,
    showAll: preferences.showAllMembers,
    firstVisit: preferences.isFirstVisit,
  });
}

/**
 * Get the list of team members to show in the roster
 * Returns: Ferni + any members the user has added
 */
export function getVisibleMembers(): TeamMemberId[] {
  // Ferni is always visible
  const visible: TeamMemberId[] = ['ferni'];

  // If showing all, return the full list
  const prefs = current();
  if (prefs.showAllMembers) {
    return ['ferni', 'peter-john', 'maya-santos', 'jordan-taylor', 'alex-chen', 'nayan-patel'];
  }

  // Add user's chosen members
  for (const member of prefs.addedMembers) {
    if (!visible.includes(member)) {
      visible.push(member);
    }
  }

  return visible;
}

/**
 * Check if a specific member should be visible in the roster
 */
export function isMemberVisible(memberId: TeamMemberId): boolean {
  if (memberId === 'ferni') return true;
  const prefs = current();
  return prefs.showAllMembers || prefs.addedMembers.includes(memberId);
}

/**
 * Add a team member to the user's roster
 */
export function addMemberToRoster(memberId: TeamMemberId): void {
  if (memberId === 'ferni') return; // Ferni always visible
  const prefs = current();
  if (prefs.addedMembers.includes(memberId)) return; // Already added

  prefs.addedMembers.push(memberId);
  prefs.isFirstVisit = false;
  savePreferences(prefs);

  log.info({ memberId }, 'Added team member to roster');
  notifyListeners();
}

/**
 * Remove a team member from the user's roster
 */
export function removeMemberFromRoster(memberId: TeamMemberId): void {
  if (memberId === 'ferni') return; // Can't remove Ferni

  const prefs = current();
  const index = prefs.addedMembers.indexOf(memberId);
  if (index > -1) {
    prefs.addedMembers.splice(index, 1);
    savePreferences(prefs);

    log.info({ memberId }, 'Removed team member from roster');
    notifyListeners();
  }
}

/**
 * Set whether to show all team members (for subscribers)
 */
export function setShowAllMembers(showAll: boolean): void {
  const prefs = current();
  prefs.showAllMembers = showAll;
  prefs.isFirstVisit = false;
  savePreferences(prefs);

  log.info({ showAll }, 'Set show all members');
  notifyListeners();
}

/**
 * Check if this is the user's first visit
 */
export function isFirstVisit(): boolean {
  return current().isFirstVisit;
}

/**
 * Mark first visit as complete
 */
export function markFirstVisitComplete(): void {
  const prefs = current();
  if (prefs.isFirstVisit) {
    prefs.isFirstVisit = false;
    savePreferences(prefs);
  }
}

/**
 * Get current preferences
 */
export function getPreferences(): Readonly<RosterPreferences> {
  return { ...current() };
}

/**
 * Subscribe to roster changes
 */
export function onRosterChange(callback: () => void): () => void {
  changeListeners.add(callback);
  return () => changeListeners.delete(callback);
}

/**
 * Reset preferences (for testing)
 */
export function resetPreferences(): void {
  loaded = getDefaultPreferences();
  savePreferences(loaded);
  notifyListeners();
}

// ============================================================================
// HELPERS
// ============================================================================

function notifyListeners(): void {
  changeListeners.forEach((cb) => {
    try {
      cb();
    } catch (err) {
      log.warn('Roster change listener error:', err);
    }
  });
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const rosterPreferences = {
  init: initRosterPreferences,
  getVisibleMembers,
  isMemberVisible,
  addMember: addMemberToRoster,
  removeMember: removeMemberFromRoster,
  setShowAll: setShowAllMembers,
  isFirstVisit,
  markFirstVisitComplete,
  getPreferences,
  onChange: onRosterChange,
  reset: resetPreferences,
};
