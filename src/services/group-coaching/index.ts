/**
 * Group Coaching Service
 *
 * Foundation for multi-participant coaching sessions:
 * - Family coaching sessions
 * - Couple's coaching
 * - Team coaching
 * - Peer support groups
 *
 * Key features:
 * - Multiple participants in a single session
 * - Role-based access (host, participant, observer)
 * - Shared context across participants
 * - Individual follow-ups after group sessions
 *
 * @module GroupCoaching
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  GroupCoachingContext,
  GroupInsight,
  GroupParticipant,
  GroupSession,
  GroupSessionConfig,
  GroupSessionType,
  ParticipantRole,
} from './types.js';

const log = createLogger({ module: 'GroupCoaching' });

// ============================================================================
// GROUP SESSION MANAGER
// ============================================================================

export class GroupSessionManager {
  private sessions: Map<string, GroupSession> = new Map();

  // ==========================================================================
  // SESSION LIFECYCLE
  // ==========================================================================

  /**
   * Create a new group session
   */
  createSession(
    hostUserId: string,
    sessionType: GroupSessionType,
    config?: Partial<GroupSessionConfig>
  ): GroupSession {
    const sessionId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const defaultConfig: GroupSessionConfig = {
      maxParticipants: this.getDefaultMaxParticipants(sessionType),
      allowLateJoin: true,
      requireApproval: sessionType !== 'peer_support',
      enablePrivateNotes: true,
      enableSharedNotes: true,
      followUpEnabled: true,
      recordingEnabled: false,
    };

    const session: GroupSession = {
      id: sessionId,
      type: sessionType,
      hostUserId,
      config: { ...defaultConfig, ...config },
      participants: [
        {
          userId: hostUserId,
          role: 'host',
          displayName: 'Host',
          joinedAt: new Date(),
          isActive: true,
          isMuted: false,
        },
      ],
      status: 'waiting',
      createdAt: new Date(),
      sharedContext: {
        topics: [],
        sharedGoals: [],
        groupInsights: [],
        emotionalTone: 'neutral',
      },
    };

    this.sessions.set(sessionId, session);

    log.info({ sessionId, hostUserId, sessionType }, 'Group session created');

    return session;
  }

  /**
   * Start a session (transition from waiting to active)
   */
  startSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (session.status !== 'waiting') {
      log.warn({ sessionId }, 'Cannot start session - not in waiting status');
      return false;
    }

    session.status = 'active';
    session.startedAt = new Date();

    log.info({ sessionId, participantCount: session.participants.length }, 'Group session started');

    return true;
  }

  /**
   * End a session
   */
  endSession(sessionId: string): {
    success: boolean;
    summary?: GroupSessionSummary;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false };

    session.status = 'ended';
    session.endedAt = new Date();

    const summary = this.generateSessionSummary(session);

    log.info({ sessionId, duration: summary.durationMinutes }, 'Group session ended');

    return { success: true, summary };
  }

  // ==========================================================================
  // PARTICIPANT MANAGEMENT
  // ==========================================================================

  /**
   * Request to join a session
   */
  requestJoin(
    sessionId: string,
    userId: string,
    displayName: string
  ): { success: boolean; needsApproval: boolean; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false, needsApproval: false, error: 'Session not found' };

    if (session.status === 'ended') {
      return { success: false, needsApproval: false, error: 'Session has ended' };
    }

    if (session.status === 'active' && !session.config.allowLateJoin) {
      return { success: false, needsApproval: false, error: 'Session does not allow late join' };
    }

    if (session.participants.length >= session.config.maxParticipants) {
      return { success: false, needsApproval: false, error: 'Session is full' };
    }

    // Check if already a participant
    if (session.participants.some((p) => p.userId === userId)) {
      return { success: false, needsApproval: false, error: 'Already in session' };
    }

    if (session.config.requireApproval) {
      // Add to waiting room
      if (!session.waitingRoom) {
        session.waitingRoom = [];
      }
      session.waitingRoom.push({ userId, displayName, requestedAt: new Date() });

      log.info({ sessionId, userId }, 'Join request added to waiting room');

      return { success: true, needsApproval: true };
    }

    // Direct join
    this.addParticipant(sessionId, userId, displayName, 'participant');
    return { success: true, needsApproval: false };
  }

  /**
   * Approve a join request
   */
  approveJoin(sessionId: string, userId: string, approverUserId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Check approver is host or co-host
    const approver = session.participants.find((p) => p.userId === approverUserId);
    if (!approver || (approver.role !== 'host' && approver.role !== 'co-host')) {
      return false;
    }

    // Find in waiting room
    const waitingIndex = session.waitingRoom?.findIndex((w) => w.userId === userId) ?? -1;
    if (waitingIndex === -1) return false;

    const waiting = session.waitingRoom![waitingIndex];
    session.waitingRoom!.splice(waitingIndex, 1);

    this.addParticipant(sessionId, userId, waiting.displayName, 'participant');

    log.info({ sessionId, userId, approvedBy: approverUserId }, 'Join request approved');

    return true;
  }

  /**
   * Add a participant to a session
   */
  private addParticipant(
    sessionId: string,
    userId: string,
    displayName: string,
    role: ParticipantRole
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant: GroupParticipant = {
      userId,
      role,
      displayName,
      joinedAt: new Date(),
      isActive: true,
      isMuted: false,
    };

    session.participants.push(participant);

    log.info({ sessionId, userId, role }, 'Participant added to group session');
  }

  /**
   * Remove a participant from a session
   */
  removeParticipant(sessionId: string, userId: string, removedBy?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const index = session.participants.findIndex((p) => p.userId === userId);
    if (index === -1) return false;

    session.participants.splice(index, 1);

    log.info({ sessionId, userId, removedBy }, 'Participant removed from group session');

    return true;
  }

  /**
   * Update participant status
   */
  updateParticipant(
    sessionId: string,
    userId: string,
    updates: Partial<Pick<GroupParticipant, 'isActive' | 'isMuted' | 'role'>>
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const participant = session.participants.find((p) => p.userId === userId);
    if (!participant) return false;

    Object.assign(participant, updates);

    return true;
  }

  // ==========================================================================
  // CONTEXT MANAGEMENT
  // ==========================================================================

  /**
   * Add a topic to the shared context
   */
  addTopic(sessionId: string, topic: string, addedBy: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.sharedContext.topics.push({
      topic,
      addedBy,
      addedAt: new Date(),
    });

    log.debug({ sessionId, topic }, 'Topic added to group context');
  }

  /**
   * Add a shared goal
   */
  addSharedGoal(sessionId: string, goal: string, proposedBy: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.sharedContext.sharedGoals.push({
      goal,
      proposedBy,
      agreedBy: [proposedBy],
      createdAt: new Date(),
    });

    log.debug({ sessionId, goal }, 'Shared goal added');
  }

  /**
   * Agree to a shared goal
   */
  agreeToGoal(sessionId: string, goalIndex: number, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const goal = session.sharedContext.sharedGoals[goalIndex];
    if (!goal) return false;

    if (!goal.agreedBy.includes(userId)) {
      goal.agreedBy.push(userId);
    }

    return true;
  }

  /**
   * Add a group insight
   */
  addGroupInsight(sessionId: string, insight: Omit<GroupInsight, 'id' | 'createdAt'>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.sharedContext.groupInsights.push({
      ...insight,
      id: `insight_${Date.now()}`,
      createdAt: new Date(),
    });

    log.debug({ sessionId, type: insight.type }, 'Group insight added');
  }

  /**
   * Update emotional tone of the session
   */
  updateEmotionalTone(sessionId: string, tone: GroupCoachingContext['emotionalTone']): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.sharedContext.emotionalTone = tone;
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): GroupSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get sessions for a user
   */
  getUserSessions(userId: string): GroupSession[] {
    return Array.from(this.sessions.values()).filter((s) =>
      s.participants.some((p) => p.userId === userId)
    );
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): GroupSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.status === 'active');
  }

  // ==========================================================================
  // FOLLOW-UPS
  // ==========================================================================

  /**
   * Generate individual follow-ups for each participant
   */
  generateFollowUps(sessionId: string): Map<string, IndividualFollowUp> {
    const session = this.sessions.get(sessionId);
    if (!session) return new Map();

    const followUps = new Map<string, IndividualFollowUp>();

    for (const participant of session.participants) {
      const followUp: IndividualFollowUp = {
        userId: participant.userId,
        sessionId,
        summary: `You participated in a ${session.type.replace('_', ' ')} session`,
        personalInsights: session.sharedContext.groupInsights
          .filter((i) => i.relatedParticipants?.includes(participant.userId))
          .map((i) => i.content),
        actionItems: session.sharedContext.sharedGoals
          .filter((g) => g.agreedBy.includes(participant.userId))
          .map((g) => g.goal),
        nextSteps: [],
        generatedAt: new Date(),
      };

      followUps.set(participant.userId, followUp);
    }

    log.info({ sessionId, followUpCount: followUps.size }, 'Follow-ups generated');

    return followUps;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private getDefaultMaxParticipants(type: GroupSessionType): number {
    const defaults: Record<GroupSessionType, number> = {
      family: 6,
      couple: 2,
      team: 10,
      peer_support: 8,
    };
    return defaults[type];
  }

  private generateSessionSummary(session: GroupSession): GroupSessionSummary {
    const duration =
      session.endedAt && session.startedAt
        ? (session.endedAt.getTime() - session.startedAt.getTime()) / 60000
        : 0;

    return {
      sessionId: session.id,
      type: session.type,
      durationMinutes: Math.round(duration),
      participantCount: session.participants.length,
      topicsDiscussed: session.sharedContext.topics.map((t) => t.topic),
      sharedGoals: session.sharedContext.sharedGoals.map((g) => g.goal),
      insightCount: session.sharedContext.groupInsights.length,
      emotionalTone: session.sharedContext.emotionalTone,
    };
  }
}

// ============================================================================
// TYPES (local to avoid circular deps)
// ============================================================================

interface GroupSessionSummary {
  sessionId: string;
  type: GroupSessionType;
  durationMinutes: number;
  participantCount: number;
  topicsDiscussed: string[];
  sharedGoals: string[];
  insightCount: number;
  emotionalTone: string;
}

interface IndividualFollowUp {
  userId: string;
  sessionId: string;
  summary: string;
  personalInsights: string[];
  actionItems: string[];
  nextSteps: string[];
  generatedAt: Date;
}

// ============================================================================
// SINGLETON
// ============================================================================

let manager: GroupSessionManager | null = null;

export function getGroupSessionManager(): GroupSessionManager {
  if (!manager) {
    manager = new GroupSessionManager();
  }
  return manager;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type * from './types.js';

export default {
  getGroupSessionManager,
  GroupSessionManager,
};
