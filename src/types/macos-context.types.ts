/**
 * Types for macOS Desktop Context
 *
 * These types define the data channel messages sent from the
 * macOS menubar app to the voice agent.
 */

// MARK: - Data Channel Message Types

export interface MacOSContextMessage {
  type: 'macos_context';
  payload: MacOSContextPayload;
  timestamp: number;
}

export interface MacOSContextPayload {
  // Context Awareness (from ContextAwarenessService)
  activeApp: string;
  activeAppBundleId?: string;
  windowTitle: string;
  selectedText?: string;

  // Calendar (from CalendarService)
  upcomingEvent?: MacOSUpcomingEvent;
  currentMeeting?: MacOSCurrentMeeting;
  todaysEventCount: number;
  isInMeeting?: boolean;

  // Focus Mode (from FocusModeService)
  isFocused: boolean;
  focusMode?: string | null;

  // Location (from LocationService - future)
  location?: string | null;

  // Screen Time (from ScreenTimeService - future)
  topApp?: MacOSTopApp | null;
}

export interface MacOSUpcomingEvent {
  title: string;
  inMinutes: number;
  attendees?: string[];
  notes?: string;
  location?: string;
  calendarTitle?: string;
}

export interface MacOSCurrentMeeting {
  title: string;
  remainingMinutes: number;
  attendees?: string[];
}

export interface MacOSTopApp {
  name: string;
  minutesToday: number;
}

// MARK: - Work Context Types

export type WorkContextType =
  | 'communication'
  | 'email'
  | 'coding'
  | 'terminal'
  | 'notes'
  | 'documents'
  | 'spreadsheet'
  | 'presentation'
  | 'browsing'
  | 'design'
  | 'media'
  | 'other';

// MARK: - Session Context Extension

/**
 * Extension to session context for macOS-specific data
 */
export interface MacOSSessionContext {
  /** The latest macOS context received */
  latestContext?: MacOSContextPayload;

  /** When the context was last updated */
  contextUpdatedAt?: Date;

  /** Classified work context */
  workContext?: WorkContextType;

  /** Whether the user triggered "Help me with this" */
  isHelpMeWithThis?: boolean;

  /** The text that was selected when "Help me with this" was triggered */
  helpMeWithThisText?: string;
}

// MARK: - Data Channel Requests (Mac → Agent)

export interface MacOSDataChannelRequest {
  type: 'macos_request';
  action: 'create_calendar_event' | 'set_reminder' | 'lookup_contact' | 'suggest_focus_mode';
  payload: Record<string, unknown>;
  requestId: string;
}

// MARK: - Data Channel Responses (Agent → Mac)

export interface MacOSDataChannelResponse {
  type: 'macos_response';
  requestId: string;
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}
