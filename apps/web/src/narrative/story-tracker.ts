/**
 * 📚 Story Tracker
 * 
 * Tracks the user's narrative journey across sessions.
 * Remembers where we are in long-form story arcs and
 * ensures continuity in the relationship.
 * 
 * WHAT IT TRACKS:
 * - Completed story arcs
 * - Current arc progress
 * - Emotional journey over time
 * - Relationship milestones
 * - Memorable moments
 * 
 * STORAGE:
 * - Local: localStorage for immediate access
 * - Remote: Firestore for cross-device sync (when available)
 * 
 * @module @ferni/narrative/tracker
 */

import { createLogger } from '../utils/logger.js';
import { apiGet, getApiHeadersAsync } from '../utils/api.js';
import { type StoryBeat, type NarrativeContext } from './narrative-director.js';
import { type StoryArcDefinition } from './story-arcs.js';

const log = createLogger('StoryTracker');

// ============================================================================
// TYPES
// ============================================================================

export interface StoryMilestone {
  id: string;
  type: 'first_launch' | 'streak' | 'conversation_count' | 'team_unlock' | 'breakthrough' | 'custom';
  name: string;
  achievedAt: number;
  metadata?: Record<string, unknown>;
}

export interface MemorableMoment {
  id: string;
  beat: StoryBeat;
  description?: string;
  emotion: string;
  timestamp: number;
  sessionId: string;
  personaId: string;
}

export interface ArcProgress {
  arcId: string;
  arcName: string;
  currentBeatIndex: number;
  totalBeats: number;
  startedAt: number;
  lastPlayedAt: number;
  completed: boolean;
  completedAt?: number;
}

export interface EmotionalJourney {
  date: string; // YYYY-MM-DD
  dominantEmotion: string;
  emotionDistribution: Record<string, number>;
  sessionCount: number;
  totalTurns: number;
}

export interface StoryJourney {
  userId: string;
  
  /** When the user first started */
  firstLaunchAt: number;
  
  /** Total sessions */
  totalSessions: number;
  
  /** Current streak */
  currentStreak: number;
  
  /** Longest streak ever */
  longestStreak: number;
  
  /** Last interaction timestamp */
  lastInteractionAt: number;
  
  /** Completed milestones */
  milestones: StoryMilestone[];
  
  /** Memorable moments worth referencing */
  memorableMoments: MemorableMoment[];
  
  /** In-progress story arcs */
  activeArcs: ArcProgress[];
  
  /** Completed arcs (last 50) */
  completedArcs: ArcProgress[];
  
  /** Emotional journey over time (last 30 days) */
  emotionalJourney: EmotionalJourney[];
  
  /** Team members met */
  teamMembersMet: string[];
  
  /** Favorite/frequent personas */
  personaInteractions: Record<string, number>;
}

// ============================================================================
// STORY TRACKER
// ============================================================================

export class StoryTracker {
  private journey: StoryJourney;
  private userId: string;
  private syncEnabled: boolean = false;
  private pendingSync: boolean = false;
  
  constructor(userId: string = 'local_user') {
    this.userId = userId;
    this.journey = this.loadJourney() || this.createNewJourney();
    
    log.info('Story tracker initialized', { 
      userId, 
      sessions: this.journey.totalSessions,
      streak: this.journey.currentStreak,
    });
  }
  
  // ==========================================================================
  // JOURNEY MANAGEMENT
  // ==========================================================================
  
  /**
   * Get the current journey state
   */
  getJourney(): StoryJourney {
    return { ...this.journey };
  }
  
  /**
   * Record a new session start
   */
  recordSessionStart(): void {
    const now = Date.now();
    const lastDate = new Date(this.journey.lastInteractionAt).toDateString();
    const todayDate = new Date().toDateString();
    const yesterdayDate = new Date(Date.now() - 86400000).toDateString();
    
    this.journey.totalSessions++;
    
    // Update streak
    if (lastDate === yesterdayDate) {
      // Consecutive day - streak continues
      this.journey.currentStreak++;
      this.journey.longestStreak = Math.max(
        this.journey.longestStreak,
        this.journey.currentStreak
      );
    } else if (lastDate !== todayDate) {
      // Not today and not yesterday - streak broken
      this.journey.currentStreak = 1;
    }
    // Same day = streak unchanged
    
    this.journey.lastInteractionAt = now;
    this.save();
    
    log.debug('Session recorded', { 
      sessions: this.journey.totalSessions,
      streak: this.journey.currentStreak,
    });
  }
  
  /**
   * Record a milestone
   */
  recordMilestone(milestone: Omit<StoryMilestone, 'id' | 'achievedAt'>): void {
    // Check if already achieved
    const exists = this.journey.milestones.some(
      m => m.type === milestone.type && m.name === milestone.name
    );
    if (exists) return;
    
    const newMilestone: StoryMilestone = {
      ...milestone,
      id: `milestone_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      achievedAt: Date.now(),
    };
    
    this.journey.milestones.push(newMilestone);
    this.save();
    
    log.info('Milestone recorded', newMilestone);
  }
  
  /**
   * Record a memorable moment
   */
  recordMemorableMoment(moment: Omit<MemorableMoment, 'id'>): void {
    const newMoment: MemorableMoment = {
      ...moment,
      id: `moment_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    };
    
    this.journey.memorableMoments.push(newMoment);
    
    // Keep last 100 moments
    if (this.journey.memorableMoments.length > 100) {
      this.journey.memorableMoments.shift();
    }
    
    this.save();
    log.debug('Memorable moment recorded', { beat: moment.beat });
  }
  
  // ==========================================================================
  // ARC TRACKING
  // ==========================================================================
  
  /**
   * Start tracking an arc
   */
  startArc(arc: StoryArcDefinition): string {
    const progress: ArcProgress = {
      arcId: arc.id,
      arcName: arc.name,
      currentBeatIndex: 0,
      totalBeats: arc.beats.length,
      startedAt: Date.now(),
      lastPlayedAt: Date.now(),
      completed: false,
    };
    
    this.journey.activeArcs.push(progress);
    this.save();
    
    log.debug('Arc started', { arcId: arc.id, name: arc.name });
    return arc.id;
  }
  
  /**
   * Update arc progress
   */
  advanceArc(arcId: string): boolean {
    const arc = this.journey.activeArcs.find(a => a.arcId === arcId);
    if (!arc) return false;
    
    arc.currentBeatIndex++;
    arc.lastPlayedAt = Date.now();
    
    if (arc.currentBeatIndex >= arc.totalBeats) {
      // Arc completed
      arc.completed = true;
      arc.completedAt = Date.now();
      
      // Move to completed
      this.journey.activeArcs = this.journey.activeArcs.filter(a => a.arcId !== arcId);
      this.journey.completedArcs.push(arc);
      
      // Keep last 50 completed
      if (this.journey.completedArcs.length > 50) {
        this.journey.completedArcs.shift();
      }
      
      log.info('Arc completed', { arcId, name: arc.arcName });
    }
    
    this.save();
    return !arc.completed;
  }
  
  /**
   * Get active arcs
   */
  getActiveArcs(): ArcProgress[] {
    return [...this.journey.activeArcs];
  }
  
  /**
   * Check if arc was recently completed
   */
  wasArcCompletedRecently(arcId: string, withinMs: number = 86400000): boolean {
    const cutoff = Date.now() - withinMs;
    return this.journey.completedArcs.some(
      a => a.arcId === arcId && (a.completedAt || 0) > cutoff
    );
  }
  
  // ==========================================================================
  // EMOTIONAL JOURNEY
  // ==========================================================================
  
  /**
   * Record today's emotional state
   */
  recordEmotionalState(emotion: string, turns: number): void {
    const today = new Date().toISOString().slice(0, 10);
    
    let todayJourney = this.journey.emotionalJourney.find(j => j.date === today);
    
    if (!todayJourney) {
      todayJourney = {
        date: today,
        dominantEmotion: emotion,
        emotionDistribution: {},
        sessionCount: 0,
        totalTurns: 0,
      };
      this.journey.emotionalJourney.push(todayJourney);
    }
    
    // Update distribution
    todayJourney.emotionDistribution[emotion] = 
      (todayJourney.emotionDistribution[emotion] || 0) + 1;
    
    // Update dominant
    let maxCount = 0;
    for (const [e, count] of Object.entries(todayJourney.emotionDistribution)) {
      if (count > maxCount) {
        maxCount = count;
        todayJourney.dominantEmotion = e;
      }
    }
    
    todayJourney.sessionCount++;
    todayJourney.totalTurns += turns;
    
    // Keep last 30 days
    if (this.journey.emotionalJourney.length > 30) {
      this.journey.emotionalJourney.shift();
    }
    
    this.save();
  }
  
  /**
   * Get emotional trend (last 7 days)
   */
  getEmotionalTrend(): { date: string; emotion: string }[] {
    return this.journey.emotionalJourney
      .slice(-7)
      .map(j => ({ date: j.date, emotion: j.dominantEmotion }));
  }
  
  // ==========================================================================
  // TEAM INTERACTIONS
  // ==========================================================================
  
  /**
   * Record meeting a team member
   */
  recordTeamMemberMet(personaId: string): void {
    if (!this.journey.teamMembersMet.includes(personaId)) {
      this.journey.teamMembersMet.push(personaId);
      
      // Record as milestone
      this.recordMilestone({
        type: 'team_unlock',
        name: `Met ${personaId}`,
        metadata: { personaId },
      });
    }
  }
  
  /**
   * Record interaction with persona
   */
  recordPersonaInteraction(personaId: string): void {
    this.journey.personaInteractions[personaId] = 
      (this.journey.personaInteractions[personaId] || 0) + 1;
    this.save();
  }
  
  /**
   * Get favorite persona
   */
  getFavoritePersona(): string | null {
    let favorite: string | null = null;
    let maxInteractions = 0;
    
    for (const [personaId, count] of Object.entries(this.journey.personaInteractions)) {
      if (count > maxInteractions) {
        maxInteractions = count;
        favorite = personaId;
      }
    }
    
    return favorite;
  }
  
  // ==========================================================================
  // CONTEXT INTEGRATION
  // ==========================================================================
  
  /**
   * Get context for narrative director
   */
  getNarrativeContext(): Partial<NarrativeContext> {
    return {
      totalConversations: this.journey.totalSessions,
      streakCount: this.journey.currentStreak,
      timeSinceLastInteraction: Date.now() - this.journey.lastInteractionAt,
    };
  }
  
  /**
   * Check if this is first launch
   */
  isFirstLaunch(): boolean {
    return this.journey.totalSessions === 0;
  }
  
  /**
   * Get days since first launch
   */
  getDaysSinceFirstLaunch(): number {
    const msPerDay = 86400000;
    return Math.floor((Date.now() - this.journey.firstLaunchAt) / msPerDay);
  }
  
  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================
  
  private createNewJourney(): StoryJourney {
    return {
      userId: this.userId,
      firstLaunchAt: Date.now(),
      totalSessions: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastInteractionAt: Date.now(),
      milestones: [],
      memorableMoments: [],
      activeArcs: [],
      completedArcs: [],
      emotionalJourney: [],
      teamMembersMet: [],
      personaInteractions: {},
    };
  }
  
  private loadJourney(): StoryJourney | null {
    try {
      const stored = localStorage.getItem(`ferni_story_journey_${this.userId}`);
      if (stored) {
        return JSON.parse(stored) as StoryJourney;
      }
    } catch (error) {
      log.warn('Failed to load journey', { error });
    }
    return null;
  }
  
  private save(): void {
    try {
      localStorage.setItem(
        `ferni_story_journey_${this.userId}`,
        JSON.stringify(this.journey)
      );
      
      // Mark for remote sync
      this.pendingSync = true;
    } catch (error) {
      log.warn('Failed to save journey', { error });
    }
  }
  
  /**
   * Enable remote sync (call when user authenticated)
   */
  enableRemoteSync(userId: string): void {
    this.userId = userId;
    this.syncEnabled = true;
    
    // Migrate local journey to user journey
    const localJourney = this.journey;
    localJourney.userId = userId;
    this.save();
    
    log.info('Remote sync enabled', { userId });
  }
  
  /**
   * Sync to remote via backend API
   * Called externally when network available
   * 
   * Backend route: PUT /api/story-journey/:userId
   */
  async syncToRemote(): Promise<void> {
    if (!this.syncEnabled || !this.pendingSync || !this.userId) return;
    
    try {
      // Use getApiHeadersAsync for proper Firebase auth
      const authHeaders = await getApiHeadersAsync(true);
      
      // Use PUT to update full journey - backend expects this at /api/story-journey/:userId
      const response = await fetch(`/api/story-journey/${this.userId}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(this.journey),
      });
      
      if (response.ok) {
        this.pendingSync = false;
        log.debug('Synced to remote');
      } else {
        log.warn('Remote sync failed', { status: response.status });
        // Keep pendingSync = true to retry later
      }
    } catch (error) {
      log.warn('Remote sync error', { error });
      // Keep pendingSync = true to retry later
    }
  }
  
  /**
   * Load from remote via backend API
   * Called on init when user is authenticated
   * 
   * Backend route: GET /api/story-journey/:userId
   */
  async loadFromRemote(): Promise<boolean> {
    if (!this.syncEnabled || !this.userId) return false;
    
    try {
      const response = await apiGet<StoryJourney>(`/api/story-journey/${this.userId}`);
      
      if (response.ok && response.data) {
        // Only use remote data if it's newer than local
        const remoteDate = response.data.lastInteractionAt || 0;
        const localDate = this.journey.lastInteractionAt || 0;
        
        if (remoteDate > localDate) {
          this.journey = { ...this.journey, ...response.data };
          this.save();
          log.info('Loaded journey from remote');
          return true;
        }
      }
    } catch (error) {
      log.debug('Remote load skipped', { error });
    }
    return false;
  }
  
  /**
   * Clear all data (for testing/reset)
   */
  clearAll(): void {
    this.journey = this.createNewJourney();
    this.save();
    log.info('Journey cleared');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let storyTrackerInstance: StoryTracker | null = null;

export function getStoryTracker(userId?: string): StoryTracker {
  if (!storyTrackerInstance) {
    storyTrackerInstance = new StoryTracker(userId);
  }
  return storyTrackerInstance;
}

export function resetStoryTracker(): void {
  storyTrackerInstance = null;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export const recordSession = () => getStoryTracker().recordSessionStart();
export const recordMilestone = (m: Omit<StoryMilestone, 'id' | 'achievedAt'>) => 
  getStoryTracker().recordMilestone(m);
export const recordMoment = (m: Omit<MemorableMoment, 'id'>) =>
  getStoryTracker().recordMemorableMoment(m);
export const getJourney = () => getStoryTracker().getJourney();
export const isFirstLaunch = () => getStoryTracker().isFirstLaunch();

