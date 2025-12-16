/**
 * 🎬 Narrative System
 * 
 * The storytelling brain of Ferni. Coordinates all animation systems
 * to create cohesive emotional journeys.
 * 
 * @module @ferni/narrative
 */

// ============================================================================
// NARRATIVE DIRECTOR
// ============================================================================

export {
  NarrativeDirector,
  getNarrativeDirector,
  resetNarrativeDirector,
  playBeat,
  updateNarrativeContext,
  type StoryBeat,
  type NarrativeContext,
  type StoryArc,
} from './narrative-director.js';

// ============================================================================
// STORY ARCS
// ============================================================================

export {
  STORY_ARCS,
  getArc,
  getAvailableArcs,
  getSuggestedArc,
  type StoryArcDefinition,
  
  // Individual arcs for direct import
  FIRST_LAUNCH_ARC,
  WELCOME_BACK_ARC,
  CONNECTION_FLOW_ARC,
  RECONNECTION_ARC,
  CONVERSATION_START_ARC,
  DEEP_CONVERSATION_ARC,
  BREAKTHROUGH_ARC,
  SMALL_WIN_ARC,
  BIG_WIN_ARC,
  STREAK_CELEBRATION_ARC,
  GOAL_COMPLETION_ARC,
  MEET_TEAM_MEMBER_ARC,
  PERSONA_HANDOFF_ARC,
  TEAM_HUDDLE_ARC,
  MORNING_GREETING_ARC,
  EVENING_WIND_DOWN_ARC,
  LATE_NIGHT_ARC,
  BIRTHDAY_ARC,
  ANNIVERSARY_ARC,
  FRUSTRATION_SUPPORT_ARC,
  SADNESS_SUPPORT_ARC,
  EXCITEMENT_CELEBRATION_ARC,
} from './story-arcs.js';

// ============================================================================
// NARRATIVE BRIDGE (App Integration)
// ============================================================================

export {
  initNarrativeBridge,
  disposeNarrativeBridge,
  triggerTestBeat,
  triggerTestArc,
  getSessionStats,
  isNarrativeBridgeInitialized,
} from './narrative-bridge.js';

// ============================================================================
// EMOTION ANALYZER
// ============================================================================

export {
  EmotionAnalyzer,
  getEmotionAnalyzer,
  resetEmotionAnalyzer,
  analyzeText,
  getCurrentEmotion,
  startEmotionAnalysis,
  stopEmotionAnalysis,
  type EmotionCategory,
  type DetectedEmotion,
  type EmotionAnalyzerConfig,
} from './emotion-analyzer.js';

// ============================================================================
// STORY TRACKER (Cross-Session)
// ============================================================================

export {
  StoryTracker,
  getStoryTracker,
  resetStoryTracker,
  recordSession,
  recordMilestone,
  recordMoment,
  getJourney,
  isFirstLaunch,
  type StoryJourney,
  type StoryMilestone,
  type MemorableMoment,
  type ArcProgress,
  type EmotionalJourney,
} from './story-tracker.js';

