/**
 * Test Suite Index
 *
 * Comprehensive test suite for the John Bogle Voice AI Agent.
 * Run with: npx vitest run
 */

// Export all test modules for documentation
export const testModules = {
  memory: './memory.test.ts',
  intelligence: './intelligence.test.ts',
  speech: './speech.test.ts',
  continuity: './continuity.test.ts',
};

export const testCategories = {
  'Memory System': ['User Profile CRUD', 'Conversation History', 'Vector Store', 'Session Memory'],
  'Intelligence System': [
    'Emotion Detection',
    'Intent Classification',
    'Topic Tracking',
    'Conversation State Machine',
    'Combined Analysis',
  ],
  'Speech System': [
    'WPM Tracking',
    'Speech Context Building',
    'Adaptive SSML Tagging',
    'Specialized Taggers',
    'Base SSML Tagger',
  ],
  'Cross-Session Continuity': [
    'Returning User Recognition',
    'Conversation Summary Continuity',
    'Goal Continuity',
    'Follow-Up Continuity',
    'Relationship Stage Progression',
    'Context Manager Integration',
    'Story Tracking',
    'New vs Returning User Experience',
  ],
};

/**
 * Total test coverage summary:
 *
 * - Memory: 15 tests
 *   - Profile creation, saving, retrieval
 *   - Session updates and progression
 *   - Conversation history tracking
 *   - Vector store semantic search
 *
 * - Intelligence: 25 tests
 *   - Emotion detection (joy, anxiety, sadness, neutral, curiosity)
 *   - Distress level detection
 *   - Suggested tone selection
 *   - Intent classification (advice, questions, greetings, endings)
 *   - Intent attributes (empathy, action requirements)
 *   - Topic extraction and tracking
 *   - State machine phase transitions
 *   - Combined analysis
 *
 * - Speech: 20 tests
 *   - WPM tracking and classification
 *   - Speech context building
 *   - Adaptive SSML tagging
 *   - Context-aware speed/pause adjustment
 *   - Laughter gating
 *   - Specialized taggers (greeting, support, advice, story, wrap-up)
 *
 * - Continuity: 15 tests
 *   - Returning user recognition
 *   - Name persistence
 *   - Conversation count tracking
 *   - Summary storage and retrieval
 *   - Goal persistence and updates
 *   - Follow-up and question tracking
 *   - Relationship stage progression
 *   - Story tracking
 *
 * Total: ~75 tests covering all major systems
 */
