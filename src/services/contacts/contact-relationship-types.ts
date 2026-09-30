/**
 * Contact relationship types. Extracted from contact-relationship-service.ts.
 */

export interface ContactRelationship {
  id: string;
  userId: string;
  contactId: string; // Email or phone as identifier

  // Basic info
  name: string;
  email?: string;
  phone?: string;
  relationship?: 'family' | 'friend' | 'colleague' | 'acquaintance' | 'professional' | 'other';
  notes?: string;

  // Relationship tracking
  firstInteraction: Date;
  lastInteraction: Date;
  interactionCount: number;
  strengthScore: number; // 0-100

  // Communication patterns
  avgResponseTimeHours?: number;
  preferredChannel?: 'email' | 'phone' | 'text' | 'in-person';
  bestTimeToReach?: string; // e.g., "mornings", "weekdays"

  // Topics and context
  topics: ContactTopic[];
  recentContext: string[]; // Last 5 interaction summaries

  // Important dates (birthdays, anniversaries, etc.)
  importantDates?: Array<{
    date: string; // MM-DD or YYYY-MM-DD
    type: 'birthday' | 'anniversary' | 'memorial' | 'custom';
    label?: string;
  }>;

  // Follow-up tracking
  pendingFollowUp?: FollowUpReminder;
  lastFollowUpDate?: Date;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactTopic {
  topic: string;
  firstMentioned: Date;
  lastMentioned: Date;
  mentionCount: number;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface FollowUpReminder {
  reason: string;
  dueDate: Date;
  priority: 'high' | 'medium' | 'low';
  completed: boolean;
}

/**
 * Comprehensive interaction types for "Better Than Human" tracking
 *
 * We track EVERYTHING - no human can remember all this!
 */
export type InteractionType =
  // Digital Communication
  | 'email'
  | 'call'
  | 'text'
  | 'video_call' // Zoom, FaceTime, Google Meet
  | 'voice_message'
  | 'instant_message' // WhatsApp, Messenger, etc.

  // Social Media
  | 'social_like'
  | 'social_comment'
  | 'social_dm'
  | 'social_tag'
  | 'social_share'

  // In-Person
  | 'meeting'
  | 'hangout' // Coffee, lunch, casual
  | 'dinner'
  | 'party'
  | 'activity' // Sports, concert, movie
  | 'trip' // Travel together
  | 'visit' // Visited their home or they visited

  // Gifts & Cards
  | 'gift_given'
  | 'gift_received'
  | 'card_sent'
  | 'card_received'
  | 'thank_you_sent'
  | 'thank_you_received'

  // Financial
  | 'money_lent'
  | 'money_borrowed'
  | 'money_repaid'
  | 'split_bill'

  // Life Events
  | 'attended_event' // Their wedding, graduation, etc.
  | 'milestone_shared' // They shared a milestone with you

  // Other
  | 'photo_shared'
  | 'recommendation' // Recommended something to them
  | 'introduction' // Introduced them to someone
  | 'favor_done'
  | 'favor_received'
  | 'other';

export interface InteractionRecord {
  id: string;
  contactId: string;
  userId: string;
  date: Date;
  type: InteractionType;
  direction: 'inbound' | 'outbound' | 'mutual'; // Added 'mutual' for activities together
  summary?: string;
  topics?: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  responseTimeHours?: number;

  // Extended fields for richer tracking
  duration?: number; // Duration in minutes (for calls, meetings, hangouts)
  location?: string; // Where it happened
  platform?: string; // Which app/platform (Zoom, Instagram, etc.)
  mediaUrl?: string; // Photo or voice message URL
  amount?: number; // For financial interactions
  linkedGiftId?: string; // Link to gift if this is a gift interaction
  participantNames?: string[]; // Other people involved (for group activities)
  isStreak?: boolean; // Part of a streak (e.g., weekly call)
  streakCount?: number; // How many in a row
}

export interface ContactInsight {
  contactId: string;
  contactName: string;
  insightType: 'overdue' | 'strengthening' | 'weakening' | 'follow-up' | 'pattern';
  message: string;
  priority: 'high' | 'medium' | 'low';
  suggestedAction?: string;
}
