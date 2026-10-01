/**
 * Conversational Voice Call types (including the legacy API surface).
 * Extracted from conversational-calls.ts.
 */

export interface ProactiveCallRequest {
  userId: string;
  phoneNumber: string;
  message: string;
  ssml: string;
  personaId: string;
  reason: string;
  scheduledFor?: Date;

  // Call behavior
  maxDuration?: number; // seconds
  enableConversation?: boolean; // Allow two-way talk?
  voicemailFallback?: boolean; // Leave message if no answer?
}

export interface CallResult {
  success: boolean;
  id?: string; // Alias for callId for backward compatibility
  callId?: string;
  twilioCallSid?: string; // Twilio call SID if available
  livekitRoomName?: string; // LiveKit room name for voice agent
  status?:
    | 'scheduled'
    | 'initiated'
    | 'initiating'
    | 'ringing'
    | 'answered'
    | 'voicemail'
    | 'no_answer'
    | 'failed';
  error?: string;
  // Extended result properties for active calls
  context?: OutboundCallContext;
  initiatedAt?: string;
  answeredAt?: string;
  completedAt?: string;
  callDurationSeconds?: number;
  voicemailLeft?: boolean;
  conversationSummary?: string;
  followUpActions?: string[];
}

export interface ScheduledCall {
  id: string;
  userId: string;
  phoneNumber: string;
  message: string;
  ssml: string;
  personaId: string;
  reason: string;
  scheduledFor: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  lastAttemptAt?: string;
  completedAt?: string;
  outcome?: string;
}

export interface CallStatusUpdate {
  CallSid: string;
  CallStatus: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer';
  CallDuration?: string;
  AnsweredBy?: 'human' | 'machine_start' | 'machine_end_beep' | 'fax' | 'unknown';
}

export type CallStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type { ScheduledCall as OutboundCall };

export interface OutboundCallContext {
  // Simple mode (backward compatible)
  userId?: string;
  phoneNumber?: string;
  message?: string;
  ssml?: string;
  personaId?: string;
  reason?: string;
  maxDuration?: number;

  // Rich context mode (proactive calls)
  trigger?: {
    id: string;
    type: string;
    reason: string;
    urgency?: 'low' | 'medium' | 'high' | 'critical';
  };
  user?: {
    id: string;
    name?: string;
    preferredName?: string;
    phone: string;
    relationshipStage?: 'new' | 'building' | 'established' | 'deep';
    timezone?: string;
  };
  context?: {
    lastConversationSummary?: string;
    activeCommitments?: string[];
    recentWins?: string[];
    avoidTopics?: string[];
    emotionalState?: string;
    insideJokes?: string[];
  };
  approach?: {
    tone?: string;
    primaryGoal?: string;
    maxDuration?: number;
    secondaryGoals?: string[];
  };
  persona?: string;
}

export interface ConversationalCallService {
  isConfigured: () => boolean;
  makeCall: (context: OutboundCallContext) => Promise<CallResult>;
  scheduleCall: (request: ProactiveCallRequest) => Promise<CallResult>;
  // Extended methods for outbound call management
  getActiveCall?: (callId: string) => Promise<CallResult | null>;
  getActiveCalls?: () => Promise<CallResult[]>;
  endCall?: (callId: string, reason?: string) => Promise<void>;
  updateCallSummary?: (callId: string, summary: CallSummaryUpdate) => Promise<void>;
  handleStatusCallback?: (
    callId: string,
    status: string,
    data?: StatusCallbackData
  ) => Promise<void>;
  handleMachineDetection?: (callId: string, answeredBy?: string) => Promise<string | void>;
}

export interface StatusCallbackData {
  callSid?: string;
  duration?: number;
  answeredBy?: string;
}

export interface CallSummaryUpdate {
  conversationSummary?: string;
  followUpActions?: string[];
  userMood?: string;
  keyTopics?: string[];
  receptivity?: string;
}
