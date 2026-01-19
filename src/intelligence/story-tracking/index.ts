/**
 * Story Arc Tracking Module
 *
 * Track narrative threads across sessions.
 *
 * @module @ferni/intelligence/story-tracking
 */

export type {
  StoryArc,
  StoryEvent,
  Cliffhanger,
  ContinuityPrompt,
  IStoryArcTracker,
} from './types.js';

export { StoryArcTrackerToken } from './types.js';

export {
  StoryArcTracker,
  getStoryArcTracker,
  createStoryArcTracker,
  resetStoryArcTracker,
  clearUserData,
} from './engine.js';
