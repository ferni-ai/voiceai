/**
 * Memory Tool Session Types
 *
 * Shapes of the session user data and services the memory domain tools read
 * from the tool context.
 */

// ============================================================================
// SERVICE TYPES
// ============================================================================

export interface UserProfile {
  name?: string;
  totalConversations: number;
  relationshipStage: string;
  preferredTopics: string[];
  goals: Array<{ name: string; status: string }>;
  lastConversationSummary?: string;
}

export interface LearningEngine {
  captureExternalKeyMoment: (moment: {
    id: string;
    timestamp: Date;
    type:
      | 'breakthrough'
      | 'milestone'
      | 'concern'
      | 'celebration'
      | 'decision'
      | 'shared_vulnerability';
    summary: string;
    emotionalWeight: 'light' | 'medium' | 'heavy';
    topics: string[];
  }) => void;
}

export interface SessionServices {
  userProfile?: UserProfile;
  learningEngine?: LearningEngine;
  captureInsight?: (type: string, source: string, content: string, confidence: number) => void;
  searchKnowledge?: (query: string) => Promise<string | null>;
}

export interface UserData {
  name?: string;
  userId?: string;
  /** Firestore conversation ID of the live call, when known. */
  conversationId?: string;
  services?: SessionServices;
  keyMoments?: string[];
  topics?: string[];
}
