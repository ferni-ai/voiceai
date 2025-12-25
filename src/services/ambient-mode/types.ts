/**
 * Ambient Mode Types
 *
 * > "Better than human means being there even when we're not talking."
 *
 * Types for continuous ambient presence - knowing where you are,
 * what time it is, and gently nudging when it matters.
 *
 * @module services/ambient-mode/types
 */

// ============================================================================
// AMBIENT STATE
// ============================================================================

/**
 * User's current ambient state (from mobile app)
 */
export interface AmbientState {
  /** User ID */
  userId: string;

  /** Last updated timestamp */
  updatedAt: string;

  // =========================================================================
  // LOCATION CONTEXT (coarse, privacy-respecting)
  // =========================================================================

  /** General location type (not exact coordinates) */
  locationType?: 'home' | 'work' | 'gym' | 'restaurant' | 'transit' | 'outdoors' | 'unknown';

  /** City/region (not exact address) */
  region?: string;

  /** Timezone */
  timezone: string;

  /** Local time at device */
  localTime: string;

  /** Time of day category */
  timeOfDay: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'night' | 'late_night';

  // =========================================================================
  // DEVICE STATE
  // =========================================================================

  /** Device type */
  deviceType: 'ios' | 'android' | 'web' | 'macos' | 'windows';

  /** Is device in use */
  deviceActive: boolean;

  /** Screen on/off */
  screenOn?: boolean;

  /** Battery level (%) */
  batteryLevel?: number;

  /** On charger */
  isCharging?: boolean;

  /** Network connectivity */
  connectivity?: 'wifi' | 'cellular' | 'offline';

  // =========================================================================
  // ACTIVITY CONTEXT
  // =========================================================================

  /** Detected activity from sensors */
  activityType?: 'stationary' | 'walking' | 'running' | 'cycling' | 'driving' | 'unknown';

  /** Is in a meeting (calendar-based) */
  inMeeting?: boolean;

  /** Meeting end time if in meeting */
  meetingEndsAt?: string;

  /** Focus mode enabled */
  focusModeEnabled?: boolean;

  /** DND enabled */
  doNotDisturbEnabled?: boolean;

  // =========================================================================
  // ENVIRONMENTAL
  // =========================================================================

  /** Ambient noise level */
  ambientNoise?: 'quiet' | 'moderate' | 'loud';

  /** Weather at location */
  weather?: {
    condition: string;
    temperature: number;
    unit: 'C' | 'F';
  };
}

// ============================================================================
// AMBIENT NUDGES
// ============================================================================

/**
 * Type of ambient nudge
 */
export type NudgeType =
  | 'morning_checkin' // Good morning check-in
  | 'evening_reflection' // Evening wind-down
  | 'commute_moment' // During commute
  | 'lunch_break' // Lunch break moment
  | 'post_meeting' // After a meeting
  | 'workout_encouragement' // Near gym or workout time
  | 'bedtime_reminder' // Bedtime approaching
  | 'weekend_morning' // Relaxed weekend morning
  | 'long_absence' // Haven't talked in a while
  | 'celebration' // Milestone/achievement
  | 'concern' // Detected something concerning
  | 'weather_related' // Weather-based (nice day, storm coming)
  | 'location_triggered'; // Arrived at significant location

/**
 * An ambient nudge to potentially send
 */
export interface AmbientNudge {
  /** Nudge type */
  type: NudgeType;

  /** Priority (1-10) */
  priority: number;

  /** Message to send (if triggered) */
  message: string;

  /** Should we send this now? */
  shouldSend: boolean;

  /** Reason for sending/not sending */
  reason: string;

  /** Best channel to deliver */
  channel: 'push_notification' | 'in_app' | 'sms' | 'silent';

  /** Generated at */
  generatedAt: string;

  /** Expires at (don't send after this) */
  expiresAt: string;

  /** Related context */
  context?: Record<string, unknown>;
}

// ============================================================================
// AMBIENT AWARENESS RULES
// ============================================================================

/**
 * Rule for triggering ambient nudges
 */
export interface AmbientRule {
  /** Rule ID */
  id: string;

  /** Rule name */
  name: string;

  /** Nudge type this produces */
  nudgeType: NudgeType;

  /** Priority */
  priority: number;

  /** Conditions that must be true */
  conditions: AmbientCondition[];

  /** How often can this trigger (hours) */
  cooldownHours: number;

  /** Message templates */
  messages: string[];

  /** Is rule enabled */
  enabled: boolean;
}

/**
 * Condition for ambient rule
 */
export interface AmbientCondition {
  /** What to check */
  field: keyof AmbientState;

  /** Operator */
  operator: 'equals' | 'not_equals' | 'contains' | 'in_range' | 'before' | 'after';

  /** Value to compare */
  value: unknown;
}

// ============================================================================
// STATE SYNC
// ============================================================================

/**
 * Request from mobile app to sync ambient state
 */
export interface AmbientSyncRequest {
  /** User ID */
  userId: string;

  /** Current ambient state */
  state: Partial<AmbientState>;

  /** App version */
  appVersion?: string;
}

/**
 * Response to ambient sync
 */
export interface AmbientSyncResponse {
  /** Whether sync succeeded */
  success: boolean;

  /** Any pending nudge to deliver */
  pendingNudge?: AmbientNudge;

  /** Next suggested sync interval (seconds) */
  nextSyncInterval: number;

  /** Any flags from server */
  flags?: {
    shouldCheckIn?: boolean;
    urgentMessage?: boolean;
  };
}

// ============================================================================
// USER PREFERENCES
// ============================================================================

/**
 * User preferences for ambient mode
 */
export interface AmbientPreferences {
  /** Ambient mode enabled */
  enabled: boolean;

  /** Allow location tracking (coarse) */
  allowLocation: boolean;

  /** Allow activity detection */
  allowActivityDetection: boolean;

  /** Allow push nudges */
  allowPushNudges: boolean;

  /** Quiet hours start (HH:MM) */
  quietHoursStart?: string;

  /** Quiet hours end (HH:MM) */
  quietHoursEnd?: string;

  /** Max nudges per day */
  maxNudgesPerDay: number;

  /** Nudge types to allow */
  allowedNudgeTypes: NudgeType[];

  /** Last updated */
  updatedAt: string;
}

// ============================================================================
// AMBIENT CONTEXT FOR LLM
// ============================================================================

/**
 * Ambient context to inject into LLM
 */
export interface AmbientContext {
  /** Whether ambient data is available */
  hasAmbientData: boolean;

  /** Time of day awareness */
  timeAwareness?: string;

  /** Location awareness (coarse) */
  locationAwareness?: string;

  /** Activity awareness */
  activityAwareness?: string;

  /** Environmental awareness */
  environmentAwareness?: string;

  /** Generated insights */
  insights?: string[];

  /** Suggested conversation starters */
  conversationStarters?: string[];
}

// ============================================================================
// LOCATION LEARNING
// ============================================================================

/**
 * Learned significant location
 */
export interface LearnedLocation {
  /** Location ID */
  id: string;

  /** User ID */
  userId: string;

  /** Label (home, work, gym, etc.) */
  label: string;

  /** Approximate center (lat/long) */
  center: {
    latitude: number;
    longitude: number;
  };

  /** Radius in meters */
  radiusMeters: number;

  /** Times visited */
  visitCount: number;

  /** Average time spent (minutes) */
  avgDurationMinutes: number;

  /** Common days of week */
  commonDays?: number[];

  /** Common time ranges */
  commonTimeRanges?: Array<{
    start: string;
    end: string;
  }>;

  /** User confirmed this location */
  confirmed: boolean;

  /** Last visited */
  lastVisited?: string;

  /** Created at */
  createdAt: string;
}

// ============================================================================
// AMBIENT INSIGHTS
// ============================================================================

/**
 * Insights derived from ambient patterns
 */
export interface AmbientInsights {
  /** User ID */
  userId: string;

  /** Generated at */
  generatedAt: string;

  /** Sleep pattern (usual bedtime/wake) */
  sleepPattern?: {
    usualBedtime: string;
    usualWakeTime: string;
    consistency: 'regular' | 'irregular';
  };

  /** Work pattern */
  workPattern?: {
    usualStartTime: string;
    usualEndTime: string;
    workDays: number[];
  };

  /** Activity pattern */
  activityPattern?: {
    mostActiveDay: string;
    usualWorkoutTime?: string;
    walkingMinutesPerDay: number;
  };

  /** Social pattern */
  socialPattern?: {
    mostSocialDay: string;
    preferredSocialTime: string;
  };
}

