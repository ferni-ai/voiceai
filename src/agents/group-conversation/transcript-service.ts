/**
 * Attributed Transcript Service
 *
 * Manages conversation transcripts with speaker attribution.
 * Provides summarization, action item extraction, and export functionality.
 *
 * @module agents/group-conversation/transcript-service
 */

import { getLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type {
  AttributedUtterance,
  GroupConversationSummary,
  GroupParticipant,
  ParticipantType,
} from './types.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface TranscriptServiceConfig {
  /** Session ID */
  sessionId: string;

  /** User ID (for persistence) */
  userId: string;

  /** Whether to persist to Firestore */
  persist?: boolean;

  /** Callback when action items are detected */
  onActionItems?: (items: ActionItem[]) => void;

  /** Callback when key moments are detected */
  onKeyMoment?: (moment: KeyMoment) => void;
}

export interface ActionItem {
  /** The action item text */
  text: string;

  /** Who it's assigned to (if detected) */
  assignedTo?: string;

  /** Due date (if mentioned) */
  dueDate?: string;

  /** Speaker who mentioned it */
  mentionedBy: string;

  /** When it was mentioned */
  timestamp: Date;

  /** Confidence score 0-1 */
  confidence: number;
}

export interface KeyMoment {
  /** Type of moment */
  type:
    | 'decision'
    | 'agreement'
    | 'disagreement'
    | 'breakthrough'
    | 'action_item'
    | 'emotion_shift'
    | 'topic_change';

  /** Description */
  description: string;

  /** Related utterance IDs */
  utteranceIds: string[];

  /** Timestamp */
  timestamp: Date;

  /** Importance score 0-1 */
  importance: number;
}

export interface TranscriptExport {
  /** Session metadata */
  session: {
    id: string;
    startedAt: string;
    endedAt?: string;
    topic?: string;
    mode: string;
  };

  /** Participants */
  participants: Array<{
    id: string;
    name: string;
    type: ParticipantType;
    utteranceCount: number;
    speakingTimeMs: number;
  }>;

  /** Full transcript */
  transcript: Array<{
    timestamp: string;
    speaker: string;
    text: string;
  }>;

  /** Summary */
  summary: GroupConversationSummary;

  /** Action items */
  actionItems: ActionItem[];

  /** Key moments */
  keyMoments: KeyMoment[];
}

// ============================================================================
// TRANSCRIPT SERVICE
// ============================================================================

/**
 * AttributedTranscriptService
 *
 * Manages the conversation transcript with full speaker attribution.
 * Provides real-time analysis for action items, emotions, and key moments.
 */
export class AttributedTranscriptService {
  private readonly config: TranscriptServiceConfig;
  private readonly utterances: AttributedUtterance[] = [];
  private readonly actionItems: ActionItem[] = [];
  private readonly keyMoments: KeyMoment[] = [];
  private utteranceCounter = 0;

  constructor(config: TranscriptServiceConfig) {
    this.config = config;

    log.debug({ sessionId: config.sessionId }, '📝 TranscriptService created');
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Add a new utterance to the transcript
   */
  addUtterance(
    speakerId: string,
    speakerName: string,
    speakerType: ParticipantType,
    text: string,
    durationMs = 0
  ): AttributedUtterance {
    const utterance: AttributedUtterance = {
      id: `utt_${++this.utteranceCounter}`,
      speakerId,
      speakerName,
      speakerType,
      text,
      timestamp: new Date(),
      durationMs,
    };

    this.utterances.push(utterance);

    // Real-time analysis
    this.analyzeUtterance(utterance);

    return utterance;
  }

  /**
   * Get all utterances
   */
  getUtterances(): AttributedUtterance[] {
    return [...this.utterances];
  }

  /**
   * Get recent utterances
   */
  getRecentUtterances(count = 10): AttributedUtterance[] {
    return this.utterances.slice(-count);
  }

  /**
   * Get utterances by speaker
   */
  getUtterancesBySpeaker(speakerId: string): AttributedUtterance[] {
    return this.utterances.filter((u) => u.speakerId === speakerId);
  }

  /**
   * Get formatted transcript for display or LLM context
   */
  getFormattedTranscript(lastN?: number): string {
    const utterances = lastN ? this.utterances.slice(-lastN) : this.utterances;

    return utterances.map((u) => `[${u.speakerName}]: ${u.text}`).join('\n');
  }

  /**
   * Get formatted transcript with timestamps
   */
  getTimestampedTranscript(lastN?: number): string {
    const utterances = lastN ? this.utterances.slice(-lastN) : this.utterances;

    return utterances
      .map((u) => {
        const time = u.timestamp.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        return `[${time}] ${u.speakerName}: ${u.text}`;
      })
      .join('\n');
  }

  /**
   * Get all detected action items
   */
  getActionItems(): ActionItem[] {
    return [...this.actionItems];
  }

  /**
   * Get all key moments
   */
  getKeyMoments(): KeyMoment[] {
    return [...this.keyMoments];
  }

  /**
   * Generate conversation summary
   */
  async generateSummary(participants: GroupParticipant[]): Promise<GroupConversationSummary> {
    // Build participant summaries
    const participantSummaries = new Map<
      string,
      {
        utteranceCount: number;
        speakingTimeMs: number;
        mainContributions: string[];
      }
    >();

    for (const participant of participants) {
      const utterances = this.getUtterancesBySpeaker(participant.id);
      participantSummaries.set(participant.id, {
        utteranceCount: utterances.length,
        speakingTimeMs: utterances.reduce((sum, u) => sum + u.durationMs, 0),
        mainContributions: this.extractMainContributions(utterances),
      });
    }

    // Extract key points from key moments
    const keyPoints = this.keyMoments
      .filter((m) => m.type === 'decision' || m.type === 'agreement' || m.type === 'breakthrough')
      .map((m) => m.description);

    // Format action items
    const formattedActionItems = this.actionItems.map((item) => ({
      item: item.text,
      assignedTo: item.assignedTo,
      dueDate: item.dueDate,
    }));

    // Extract decisions
    const decisions = this.keyMoments
      .filter((m) => m.type === 'decision')
      .map((m) => m.description);

    return {
      keyPoints,
      actionItems: formattedActionItems,
      decisions,
      participantSummaries,
    };
  }

  /**
   * Export transcript in a shareable format
   */
  async exportTranscript(
    participants: GroupParticipant[],
    sessionMeta: { topic?: string; mode: string; startedAt: Date; endedAt?: Date }
  ): Promise<TranscriptExport> {
    const summary = await this.generateSummary(participants);

    return {
      session: {
        id: this.config.sessionId,
        startedAt: sessionMeta.startedAt.toISOString(),
        endedAt: sessionMeta.endedAt?.toISOString(),
        topic: sessionMeta.topic,
        mode: sessionMeta.mode,
      },
      participants: participants.map((p) => {
        const utterances = this.getUtterancesBySpeaker(p.id);
        return {
          id: p.id,
          name: p.name,
          type: p.type,
          utteranceCount: utterances.length,
          speakingTimeMs: utterances.reduce((sum, u) => sum + u.durationMs, 0),
        };
      }),
      transcript: this.utterances.map((u) => ({
        timestamp: u.timestamp.toISOString(),
        speaker: u.speakerName,
        text: u.text,
      })),
      summary,
      actionItems: this.actionItems,
      keyMoments: this.keyMoments,
    };
  }

  /**
   * Clear the transcript
   */
  clear(): void {
    this.utterances.length = 0;
    this.actionItems.length = 0;
    this.keyMoments.length = 0;
    this.utteranceCounter = 0;
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Analyze an utterance for action items, emotions, etc.
   */
  private analyzeUtterance(utterance: AttributedUtterance): void {
    // Detect action items
    const actionItems = this.detectActionItems(utterance);
    if (actionItems.length > 0) {
      this.actionItems.push(...actionItems);
      this.config.onActionItems?.(actionItems);
    }

    // Detect key moments
    const keyMoment = this.detectKeyMoment(utterance);
    if (keyMoment) {
      this.keyMoments.push(keyMoment);
      this.config.onKeyMoment?.(keyMoment);
    }

    // Analyze sentiment (basic)
    utterance.sentiment = this.analyzeSentiment(utterance.text);
  }

  /**
   * Detect action items in an utterance
   */
  private detectActionItems(utterance: AttributedUtterance): ActionItem[] {
    const items: ActionItem[] = [];
    const text = utterance.text.toLowerCase();

    // Pattern matching for action items
    const patterns = [
      { regex: /i('ll| will) (.+?)(?:\.|,|$)/gi, confidence: 0.8 },
      { regex: /we should (.+?)(?:\.|,|$)/gi, confidence: 0.7 },
      { regex: /let's (.+?)(?:\.|,|$)/gi, confidence: 0.75 },
      { regex: /need to (.+?)(?:\.|,|$)/gi, confidence: 0.7 },
      { regex: /have to (.+?)(?:\.|,|$)/gi, confidence: 0.7 },
      { regex: /going to (.+?)(?:\.|,|$)/gi, confidence: 0.75 },
      { regex: /can you (.+?)(?:\?|$)/gi, confidence: 0.6 },
      { regex: /would you (.+?)(?:\?|$)/gi, confidence: 0.6 },
    ];

    for (const pattern of patterns) {
      const matches = text.matchAll(pattern.regex);
      for (const match of matches) {
        const actionText = match[1] || match[2];
        if (actionText && actionText.length > 5) {
          items.push({
            text: actionText.trim(),
            mentionedBy: utterance.speakerName,
            timestamp: utterance.timestamp,
            confidence: pattern.confidence,
          });
        }
      }
    }

    return items;
  }

  /**
   * Detect key moments in the conversation
   */
  private detectKeyMoment(utterance: AttributedUtterance): KeyMoment | null {
    const text = utterance.text.toLowerCase();

    // Decision indicators
    if (
      text.includes("let's do") ||
      text.includes('we decided') ||
      text.includes('decision is') ||
      text.includes("that's the plan")
    ) {
      return {
        type: 'decision',
        description: utterance.text.slice(0, 100),
        utteranceIds: [utterance.id],
        timestamp: utterance.timestamp,
        importance: 0.9,
      };
    }

    // Agreement indicators
    if (
      text.includes('i agree') ||
      text.includes('totally') ||
      text.includes('exactly') ||
      text.includes("you're right")
    ) {
      return {
        type: 'agreement',
        description: `${utterance.speakerName} agreed: "${utterance.text.slice(0, 50)}"`,
        utteranceIds: [utterance.id],
        timestamp: utterance.timestamp,
        importance: 0.6,
      };
    }

    // Breakthrough indicators
    if (
      text.includes('aha') ||
      text.includes('i just realized') ||
      text.includes('that makes sense') ||
      text.includes('never thought of')
    ) {
      return {
        type: 'breakthrough',
        description: `${utterance.speakerName}: "${utterance.text.slice(0, 80)}"`,
        utteranceIds: [utterance.id],
        timestamp: utterance.timestamp,
        importance: 0.85,
      };
    }

    return null;
  }

  /**
   * Basic sentiment analysis
   */
  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const lower = text.toLowerCase();

    const positiveWords = [
      'great',
      'good',
      'love',
      'happy',
      'excited',
      'amazing',
      'wonderful',
      'yes',
      'agree',
      'perfect',
    ];
    const negativeWords = [
      'bad',
      'hate',
      'sad',
      'angry',
      'frustrated',
      'worried',
      'scared',
      'no',
      'disagree',
      'terrible',
    ];

    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of positiveWords) {
      if (lower.includes(word)) positiveCount++;
    }

    for (const word of negativeWords) {
      if (lower.includes(word)) negativeCount++;
    }

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Extract main contributions from a speaker's utterances
   */
  private extractMainContributions(utterances: AttributedUtterance[]): string[] {
    // Get the longest/most substantial utterances
    return utterances
      .sort((a, b) => b.text.length - a.text.length)
      .slice(0, 3)
      .map((u) => (u.text.length > 100 ? `${u.text.slice(0, 100)}...` : u.text));
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a transcript service
 */
export function createTranscriptService(
  config: TranscriptServiceConfig
): AttributedTranscriptService {
  return new AttributedTranscriptService(config);
}
