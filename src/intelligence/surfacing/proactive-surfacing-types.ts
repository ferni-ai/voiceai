/**
 * Types for the proactive surfacing engine (proactive-surfacing-engine.ts re-exports
 * them). Split out so the engine has room to bind the Firestore database (the file is
 * over the 500-line ratchet).
 *
 * @module intelligence/surfacing/proactive-surfacing-types
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Content types that can be surfaced
 */
export type SurfaceContentType =
  | 'memory'
  | 'insight'
  | 'reminder'
  | 'celebration'
  | 'check_in'
  | 'recommendation'
  | 'pattern_observation'
  | 'growth_update'
  | 'relationship_touchpoint';

/**
 * Delivery channels
 */
export type DeliveryChannel = 'voice' | 'notification' | 'in_conversation' | 'daily_summary';

/**
 * Surfacing priority levels
 */
export type SurfacingPriority = 'critical' | 'high' | 'medium' | 'low' | 'background';

/**
 * Content to be surfaced
 */
export interface SurfaceContent {
  id: string;
  userId: string;
  type: SurfaceContentType;
  /** Main content to surface */
  content: string;
  /** Why this is being surfaced */
  reason: string;
  /** Related entity IDs */
  relatedEntities?: string[];
  /** Source of this content */
  source: {
    type: 'memory' | 'prediction' | 'pattern' | 'schedule' | 'milestone';
    id: string;
  };
  /** Delivery preferences */
  delivery: {
    channels: DeliveryChannel[];
    preferredChannel: DeliveryChannel;
    tone: 'warm' | 'celebratory' | 'gentle' | 'direct' | 'curious';
  };
  /** Priority */
  priority: SurfacingPriority;
  /** Timing constraints */
  timing: {
    /** Earliest time to surface */
    notBefore?: Date;
    /** Latest time to surface (expires after) */
    notAfter?: Date;
    /** Optimal time windows */
    optimalWindows?: Array<{
      startHour: number;
      endHour: number;
      days?: number[]; // 0=Sunday, 6=Saturday
    }>;
  };
  /** Created timestamp */
  createdAt: Date;
  /** Status */
  status: 'pending' | 'scheduled' | 'delivered' | 'skipped' | 'expired';
  /** When this was delivered */
  deliveredAt?: Date;
  /** User response/engagement */
  engagement?: {
    responded: boolean;
    responseType?: 'positive' | 'neutral' | 'dismissive';
    responseAt?: Date;
  };
}

/**
 * Timing intelligence result
 */
export interface TimingDecision {
  shouldSurfaceNow: boolean;
  optimalTime?: Date;
  reason: string;
  confidence: number;
  factors: {
    userAvailability: number; // 0-1
    contextRelevance: number; // 0-1
    urgency: number; // 0-1
    recentSurfacing: number; // 0-1 (lower = more recent surfacing)
  };
}

/**
 * User surfacing preferences
 */
export interface SurfacingPreferences {
  userId: string;
  /** Enable proactive surfacing */
  enabled: boolean;
  /** Quiet hours (no surfacing) */
  quietHours: {
    start: number; // Hour (0-23)
    end: number;
  };
  /** Preferred channels by content type */
  channelPreferences: Partial<Record<SurfaceContentType, DeliveryChannel>>;
  /** Maximum surfacings per day */
  maxPerDay: number;
  /** Types to exclude */
  excludeTypes: SurfaceContentType[];
  /** Updated at */
  updatedAt: Date;
}
