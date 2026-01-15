/**
 * Visual Storytelling Service
 *
 * Fetches and manages visual storytelling data from the backend API.
 * Integrates with circadian, warmth, and persona managers for a unified
 * ambient experience.
 *
 * @module services/visual-storytelling
 */

import { apiGet, apiPut, apiPost } from '../utils/api.js';
import { circadianManager, type SleepPattern } from './circadian-manager.js';
import { warmthManager, type WarmthConfig } from './warmth-manager.js';
import { relationshipStageService, type RelationshipStage } from './relationship-stage.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('VisualStorytellingService');

// ============================================================================
// TYPES
// ============================================================================

export interface SleepPatternData {
  wakeTime: number;
  sleepTime: number;
  isNightOwl: boolean;
  isEarlyBird: boolean;
  timezone?: string;
}

export interface RelationshipMetrics {
  stage: RelationshipStage;
  stageIndex: number;
  progressPercent: number;
  daysTogether: number;
  conversationCount: number;
  currentStreak: number;
  longestStreak: number;
  warmthConfig: WarmthConfig;
}

export interface TeaserEligibility {
  history: boolean;
  goals: boolean;
  team: boolean;
  patterns: boolean;
  wellbeing: boolean;
}

export interface MilestoneData {
  id: string;
  type: string;
  title: string;
  emoji: string;
  celebratedAt: string | null;
  personaId: string;
  progressPercent: number;
}

export interface TeamMemberProgress {
  personaId: string;
  name: string;
  isUnlocked: boolean;
  progressPercent: number;
  unlockThreshold: number;
}

export interface VisualStorytellingData {
  sleepPattern: SleepPatternData | null;
  relationship: RelationshipMetrics;
  teaserEligibility: TeaserEligibility;
  milestones: MilestoneData[];
  teamProgress: TeamMemberProgress[];
  lastUpdated: string;
}

// ============================================================================
// STATE
// ============================================================================

let cachedData: VisualStorytellingData | null = null;
let currentUserId: string | null = null;
let isInitialized = false;
let fetchPromise: Promise<VisualStorytellingData | null> | null = null;

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch visual storytelling data from the backend
 */
async function fetchVisualStorytellingData(userId: string): Promise<VisualStorytellingData | null> {
  try {
    const response = await apiGet<VisualStorytellingData>(`/api/visual-storytelling/${userId}`);
    if (response?.ok && response.data) {
      cachedData = response.data;
      return response.data;
    }
    return null;
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch visual storytelling data, using defaults');
    return null;
  }
}

/**
 * Update sleep pattern on the backend
 */
async function updateSleepPatternAPI(userId: string, pattern: SleepPatternData): Promise<boolean> {
  try {
    await apiPut(`/api/visual-storytelling/${userId}/sleep-pattern`, pattern);
    
    // Update cache
    if (cachedData) {
      cachedData.sleepPattern = pattern;
    }
    
    return true;
  } catch (error) {
    log.error({ error, userId }, 'Failed to update sleep pattern');
    return false;
  }
}

/**
 * Mark a milestone as celebrated
 */
async function celebrateMilestoneAPI(userId: string, milestoneId: string): Promise<boolean> {
  try {
    await apiPost(`/api/visual-storytelling/${userId}/milestone/${milestoneId}/celebrate`, {});
    
    // Update cache
    if (cachedData) {
      const milestone = cachedData.milestones.find(m => m.id === milestoneId);
      if (milestone) {
        milestone.celebratedAt = new Date().toISOString();
      }
    }
    
    return true;
  } catch (error) {
    log.error({ error, userId, milestoneId }, 'Failed to celebrate milestone');
    return false;
  }
}

/**
 * Infer sleep pattern from usage history
 */
async function inferSleepPatternAPI(userId: string): Promise<SleepPatternData | null> {
  try {
    const response = await apiGet<{ inferred: SleepPatternData | null }>(
      `/api/visual-storytelling/${userId}/infer-sleep`
    );
    return response?.ok && response.data ? response.data.inferred : null;
  } catch (error) {
    log.warn({ error, userId }, 'Failed to infer sleep pattern');
    return null;
  }
}

// ============================================================================
// INTEGRATION FUNCTIONS
// ============================================================================

/**
 * Apply fetched data to the ambient systems
 */
function applyDataToSystems(data: VisualStorytellingData): void {
  // Apply sleep pattern to circadian manager
  if (data.sleepPattern) {
    circadianManager.setSleepPattern(data.sleepPattern);
    log.debug({ sleepPattern: data.sleepPattern }, 'Applied sleep pattern to circadian manager');
  }
  
  // Apply relationship metrics to warmth manager
  // Note: warmthManager gets stage from relationshipStageService, which we don't override here
  // The warmth config from API is informational for now
  
  // Dispatch data loaded event for other components
  window.dispatchEvent(new CustomEvent('ferni:visual-storytelling-loaded', {
    detail: data,
  }));
  
  log.info(
    { 
      stage: data.relationship.stage, 
      conversationCount: data.relationship.conversationCount,
      hasSleepPattern: !!data.sleepPattern,
    }, 
    'Visual storytelling data applied'
  );
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize the visual storytelling service
 * Call this after user authentication
 */
export async function initVisualStorytelling(userId: string): Promise<VisualStorytellingData | null> {
  if (isInitialized && currentUserId === userId && cachedData) {
    return cachedData;
  }
  
  // Prevent duplicate fetches
  if (fetchPromise && currentUserId === userId) {
    return fetchPromise;
  }
  
  currentUserId = userId;
  
  fetchPromise = (async () => {
    try {
      const data = await fetchVisualStorytellingData(userId);
      
      if (data) {
        applyDataToSystems(data);
        isInitialized = true;
      }
      
      return data;
    } finally {
      fetchPromise = null;
    }
  })();
  
  return fetchPromise;
}

/**
 * Get cached visual storytelling data
 */
export function getVisualStorytellingData(): VisualStorytellingData | null {
  return cachedData;
}

/**
 * Get teaser eligibility (whether user has enough data for features)
 */
export function getTeaserEligibility(): TeaserEligibility {
  return cachedData?.teaserEligibility || {
    history: false,
    goals: false,
    team: false,
    patterns: false,
    wellbeing: false,
  };
}

/**
 * Get milestone data for the scrapbook
 */
export function getMilestones(): MilestoneData[] {
  return cachedData?.milestones || [];
}

/**
 * Get team member unlock progress
 */
export function getTeamProgress(): TeamMemberProgress[] {
  return cachedData?.teamProgress || [];
}

/**
 * Get relationship metrics
 */
export function getRelationshipMetrics(): RelationshipMetrics | null {
  return cachedData?.relationship || null;
}

/**
 * Update user's sleep pattern
 */
export async function updateSleepPattern(pattern: Partial<SleepPatternData>): Promise<boolean> {
  if (!currentUserId) {
    log.warn('Cannot update sleep pattern: no user ID');
    return false;
  }
  
  const currentPattern = cachedData?.sleepPattern || {
    wakeTime: 7,
    sleepTime: 23,
    isNightOwl: false,
    isEarlyBird: false,
  };
  
  const newPattern: SleepPatternData = {
    ...currentPattern,
    ...pattern,
  };
  
  // Update local circadian manager immediately
  circadianManager.setSleepPattern(newPattern);
  
  // Persist to backend
  const success = await updateSleepPatternAPI(currentUserId, newPattern);
  
  if (success) {
    // Dispatch event
    window.dispatchEvent(new CustomEvent('ferni:sleep-pattern-updated', {
      detail: newPattern,
    }));
  }
  
  return success;
}

/**
 * Celebrate a milestone
 */
export async function celebrateMilestone(milestoneId: string): Promise<boolean> {
  if (!currentUserId) {
    log.warn('Cannot celebrate milestone: no user ID');
    return false;
  }
  
  const success = await celebrateMilestoneAPI(currentUserId, milestoneId);
  
  if (success) {
    window.dispatchEvent(new CustomEvent('ferni:milestone-celebrated', {
      detail: { milestoneId },
    }));
  }
  
  return success;
}

/**
 * Auto-infer and apply sleep pattern from usage history
 */
export async function autoInferSleepPattern(): Promise<SleepPatternData | null> {
  if (!currentUserId) {
    log.warn('Cannot infer sleep pattern: no user ID');
    return null;
  }
  
  const inferred = await inferSleepPatternAPI(currentUserId);
  
  if (inferred) {
    await updateSleepPattern(inferred);
    log.info({ inferred }, 'Auto-inferred and applied sleep pattern');
  }
  
  return inferred;
}

/**
 * Refresh data from the server
 */
export async function refreshVisualStorytelling(): Promise<VisualStorytellingData | null> {
  if (!currentUserId) return null;
  
  const data = await fetchVisualStorytellingData(currentUserId);
  
  if (data) {
    applyDataToSystems(data);
  }
  
  return data;
}

/**
 * Dispose the service
 */
export function disposeVisualStorytelling(): void {
  cachedData = null;
  currentUserId = null;
  isInitialized = false;
  fetchPromise = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const visualStorytellingService = {
  init: initVisualStorytelling,
  dispose: disposeVisualStorytelling,
  refresh: refreshVisualStorytelling,
  getData: getVisualStorytellingData,
  getTeaserEligibility,
  getMilestones,
  getTeamProgress,
  getRelationshipMetrics,
  updateSleepPattern,
  celebrateMilestone,
  autoInferSleepPattern,
};

export default visualStorytellingService;
