/**
 * Conversation Tracker Service
 *
 * Tracks conversation messages and transcripts during a session.
 * Persists to backend when session ends for history display.
 */

import { createLogger } from '../utils/logger.js';
import { apiPost } from '../utils/api.js';

const log = createLogger('ConversationTracker');

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
  personaId?: string;
}

export interface ConversationSession {
  id: string;
  startTime: string;
  endTime?: string;
  personaId: string;
  personaName: string;
  messages: ConversationMessage[];
  insights: string[];
  topicsDiscussed: string[];
}

// ============================================================================
// CONVERSATION TRACKER
// ============================================================================

class ConversationTrackerService {
  private currentSession: ConversationSession | null = null;
  private messageBuffer: ConversationMessage[] = [];

  /**
   * Start a new conversation session
   */
  startSession(personaId: string, personaName: string): void {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    this.currentSession = {
      id: sessionId,
      startTime: new Date().toISOString(),
      personaId,
      personaName,
      messages: [],
      insights: [],
      topicsDiscussed: [],
    };

    this.messageBuffer = [];
    log.info('Conversation session started', { sessionId, personaId });
    // NOTE: Relationship tracking is handled by app.ts connection handler
    // to avoid double-counting conversations
  }

  /**
   * Add a message to the current session
   */
  addMessage(role: 'user' | 'agent', content: string, personaId?: string): void {
    if (!this.currentSession) {
      log.debug('No active session, message not tracked');
      return;
    }

    // Skip empty or very short messages
    if (!content || content.trim().length < 2) return;

    const message: ConversationMessage = {
      role,
      content: content.trim(),
      timestamp: Date.now(),
      personaId,
    };

    this.currentSession.messages.push(message);
    this.messageBuffer.push(message);

    log.debug('Message added', { role, length: content.length });
  }

  /**
   * Add an insight discovered during conversation
   */
  addInsight(insight: string): void {
    if (!this.currentSession) return;
    if (!this.currentSession.insights.includes(insight)) {
      this.currentSession.insights.push(insight);
    }
  }

  /**
   * Add a topic discussed
   */
  addTopic(topic: string): void {
    if (!this.currentSession) return;
    if (!this.currentSession.topicsDiscussed.includes(topic)) {
      this.currentSession.topicsDiscussed.push(topic);
    }
  }

  /**
   * Update persona if handoff occurred
   */
  updatePersona(personaId: string, personaName: string): void {
    if (this.currentSession) {
      // Track persona change as a message
      this.addMessage('agent', `[Handoff to ${personaName}]`, personaId);
      this.currentSession.personaId = personaId;
      this.currentSession.personaName = personaName;
    }
  }

  /**
   * End the current session and persist
   */
  async endSession(): Promise<void> {
    if (!this.currentSession) {
      log.debug('No active session to end');
      return;
    }

    this.currentSession.endTime = new Date().toISOString();

    // Only persist if there were actual messages
    if (this.currentSession.messages.length > 0) {
      await this.persistSession(this.currentSession);
    }

    log.info('Conversation session ended', {
      sessionId: this.currentSession.id,
      messages: this.currentSession.messages.length,
      duration: this.getSessionDuration(),
    });

    this.currentSession = null;
    this.messageBuffer = [];
  }

  /**
   * Get current session info
   */
  getCurrentSession(): ConversationSession | null {
    return this.currentSession;
  }

  /**
   * Get session duration in minutes
   */
  getSessionDuration(): number {
    if (!this.currentSession) return 0;
    const start = new Date(this.currentSession.startTime).getTime();
    const end = this.currentSession.endTime 
      ? new Date(this.currentSession.endTime).getTime() 
      : Date.now();
    return Math.round((end - start) / 60000);
  }

  /**
   * Get message count
   */
  getMessageCount(): number {
    return this.currentSession?.messages.length ?? 0;
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  private async persistSession(session: ConversationSession): Promise<void> {
    // Calculate duration
    const duration = this.getSessionDuration();

    // Prepare session data
    const sessionData = {
      id: session.id,
      startTime: session.startTime,
      endTime: session.endTime,
      personaId: session.personaId,
      personaName: session.personaName,
      duration,
      messageCount: session.messages.length,
      // Only include transcripts for non-trivial conversations
      transcript: session.messages.length > 3
        ? session.messages.map(m => ({
            role: m.role,
            content: m.content,
            timestamp: new Date(m.timestamp).toISOString(),
          }))
        : undefined,
      insights: session.insights,
      topicsDiscussed: session.topicsDiscussed,
    };

    try {
      const response = await apiPost('/api/conversations', { session: sessionData });

      if (response.ok) {
        log.info('Session persisted to backend', { sessionId: session.id });
      } else {
        log.warn('Failed to persist session', { status: response.status });
        this.storeLocalSession(sessionData);
      }
    } catch (err) {
      log.warn('Network error persisting session', err);
      // Store locally for later sync
      this.storeLocalSession(sessionData);
    }
  }

  /**
   * Store session locally when backend is unavailable
   */
  private storeLocalSession(session: object): void {
    try {
      const key = 'ferni_pending_sessions';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.push(session);
      // Keep only last 10 pending sessions
      const toStore = existing.slice(-10);
      localStorage.setItem(key, JSON.stringify(toStore));
      log.debug('Session stored locally for later sync');
    } catch {
      log.warn('Failed to store session locally');
    }
  }

  /**
   * Sync any pending local sessions to backend
   */
  async syncPendingSessions(): Promise<void> {
    try {
      const key = 'ferni_pending_sessions';
      const pending = JSON.parse(localStorage.getItem(key) || '[]');

      if (pending.length === 0) return;

      let synced = 0;
      for (const session of pending) {
        try {
          const response = await apiPost('/api/conversations', { session });
          if (response.ok) synced++;
        } catch {
          // Keep trying other sessions
        }
      }

      if (synced > 0) {
        // Clear synced sessions
        localStorage.removeItem(key);
        log.info(`Synced ${synced} pending sessions`);
      }
    } catch {
      // Silent fail
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const conversationTracker = new ConversationTrackerService();

export function initConversationTracker(): void {
  // Try to sync any pending sessions on startup
  void conversationTracker.syncPendingSessions();
}

export default conversationTracker;

