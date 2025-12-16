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
  | 'ferni'
  | 'peter-john'
  | 'maya-santos'
  | 'jordan-taylor'
  | 'alex-chen'
  | 'nayan-patel';

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
      const parsed = JSON.parse(stored) as RosterPreferences;
      return {
        ...getDefaultPreferences(),
        ...parsed,
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

let preferences: RosterPreferences = getDefaultPreferences();
const changeListeners: Set<() => void> = new Set();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize the roster preferences service
 */
export function initRosterPreferences(): void {
  preferences = loadPreferences();
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
  if (preferences.showAllMembers) {
    return ['ferni', 'peter-john', 'maya-santos', 'jordan-taylor', 'alex-chen', 'nayan-patel'];
  }
  
  // Add user's chosen members
  for (const member of preferences.addedMembers) {
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
  if (preferences.showAllMembers) return true;
  return preferences.addedMembers.includes(memberId);
}

/**
 * Add a team member to the user's roster
 */
export function addMemberToRoster(memberId: TeamMemberId): void {
  if (memberId === 'ferni') return; // Ferni always visible
  if (preferences.addedMembers.includes(memberId)) return; // Already added
  
  preferences.addedMembers.push(memberId);
  preferences.isFirstVisit = false;
  savePreferences(preferences);
  
  log.info({ memberId }, 'Added team member to roster');
  notifyListeners();
}

/**
 * Remove a team member from the user's roster
 */
export function removeMemberFromRoster(memberId: TeamMemberId): void {
  if (memberId === 'ferni') return; // Can't remove Ferni
  
  const index = preferences.addedMembers.indexOf(memberId);
  if (index > -1) {
    preferences.addedMembers.splice(index, 1);
    savePreferences(preferences);
    
    log.info({ memberId }, 'Removed team member from roster');
    notifyListeners();
  }
}

/**
 * Set whether to show all team members (for subscribers)
 */
export function setShowAllMembers(showAll: boolean): void {
  preferences.showAllMembers = showAll;
  preferences.isFirstVisit = false;
  savePreferences(preferences);
  
  log.info({ showAll }, 'Set show all members');
  notifyListeners();
}

/**
 * Check if this is the user's first visit
 */
export function isFirstVisit(): boolean {
  return preferences.isFirstVisit;
}

/**
 * Mark first visit as complete
 */
export function markFirstVisitComplete(): void {
  if (preferences.isFirstVisit) {
    preferences.isFirstVisit = false;
    savePreferences(preferences);
  }
}

/**
 * Get current preferences
 */
export function getPreferences(): Readonly<RosterPreferences> {
  return { ...preferences };
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
  preferences = getDefaultPreferences();
  savePreferences(preferences);
  notifyListeners();
}

// ============================================================================
// HELPERS
// ============================================================================

function notifyListeners(): void {
  changeListeners.forEach(cb => {
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

