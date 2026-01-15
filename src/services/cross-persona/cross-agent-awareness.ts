/**
 * Cross-Agent Awareness Service
 *
 * Enables personas to know what their teammates discussed with the user.
 * This creates the feeling of a coordinated team that talks behind the scenes.
 *
 * Example: "Maya mentioned you've been stressed about budgeting - I wanted to
 * check in on how you're feeling about money and life balance."
 *
 * PERSISTENCE: Uses Firestore for cross-session awareness with in-memory caching.
 */

import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { AgentId } from './agent-bus.js';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';

// ============================================================================
// TYPES
// ============================================================================

export interface TeamConversationSummary {
  agentId: string;
  agentName: string;
  timestamp: Date;
  topics: string[];
  emotionalTone: 'positive' | 'neutral' | 'struggling' | 'celebratory';
  keyMoments: string[];
  userGoals?: string[];
  userConcerns?: string[];
  followUpNeeded?: boolean;
}

export interface CrossAgentContext {
  recentTeamInteractions: TeamConversationSummary[];
  sharedGoals: string[];
  teamNotes: TeamNote[];
}

export interface TeamNote {
  fromAgent: string;
  toAgent: string | '*'; // '*' = for everyone
  content: string;
  timestamp: Date;
  priority: 'low' | 'medium' | 'high';
  acknowledged: boolean;
}

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

let db: FirestoreType | null = null;
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise: Promise<FirestoreType | null> | null = null;
const TEAM_AWARENESS_COLLECTION = 'team_awareness';
const TEAM_NOTES_COLLECTION = 'team_notes';

/**
 * Initialize Firestore connection
 */
async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = initializeFirestore();
  return dbInitPromise;
}

async function initializeFirestore(): Promise<FirestoreType | null> {
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    getLogger().info('Cross-agent awareness Firestore initialized');
    return db;
  } catch (error) {
    getLogger().warn(
      { error },
      'Firestore not available for cross-agent awareness, using in-memory only'
    );
    dbInitPromise = null; // Allow retry
    return null;
  }
}

// ============================================================================
// IN-MEMORY CACHE (with Firestore sync)
// ============================================================================

const conversationCache = new Map<string, TeamConversationSummary[]>();
const teamNotesCache = new Map<string, TeamNote[]>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record a conversation summary for cross-agent awareness
 */
export async function recordConversationForTeam(
  userId: string,
  summary: TeamConversationSummary
): Promise<void> {
  const log = getLogger();

  // Update cache
  const existing = conversationCache.get(userId) || [];
  existing.push(summary);

  // Keep only last 20 conversations
  if (existing.length > 20) {
    existing.shift();
  }
  conversationCache.set(userId, existing);

  // Persist to Firestore
  const firestore = await getFirestore();
  if (firestore) {
    try {
      const docRef = firestore.collection(TEAM_AWARENESS_COLLECTION).doc(userId);
      const doc = await docRef.get();

      let teamHistory: TeamConversationSummary[] = [];
      if (doc.exists) {
        const data = doc.data();
        teamHistory = (data?.conversations || []).map((c: Record<string, unknown>) => ({
          ...c,
          timestamp:
            (c.timestamp as { toDate?: () => Date })?.toDate?.() || new Date(c.timestamp as string),
        }));
      }

      teamHistory.push(summary);
      // Keep last 20
      const trimmed = teamHistory.slice(-20);

      await docRef.set(
        cleanForFirestore({
          userId,
          conversations: trimmed,
          lastUpdated: new Date(),
        }),
        { merge: true }
      );

      log.debug({ userId, agentId: summary.agentId }, 'Team conversation persisted to Firestore');
    } catch (err) {
      log.warn({ err, userId }, 'Failed to persist team conversation to Firestore');
    }
  }
}

/**
 * Get what other team members discussed with this user
 */
export async function getTeamContext(
  userId: string,
  currentAgentId: string
): Promise<CrossAgentContext> {
  const log = getLogger();

  // Try cache first
  let summaries = conversationCache.get(userId);

  // Load from Firestore if not cached
  if (!summaries) {
    const firestore = await getFirestore();
    if (firestore) {
      try {
        const doc = await firestore.collection(TEAM_AWARENESS_COLLECTION).doc(userId).get();
        if (doc.exists) {
          const data = doc.data();
          summaries = (data?.conversations || []).map((c: Record<string, unknown>) => ({
            ...c,
            timestamp:
              (c.timestamp as { toDate?: () => Date })?.toDate?.() ||
              new Date(c.timestamp as string),
          })) as TeamConversationSummary[];
          conversationCache.set(userId, summaries);
        }
      } catch (err) {
        log.warn({ err, userId }, 'Failed to load team context from Firestore');
      }
    }
  }

  summaries = summaries || [];

  // Filter to other agents' conversations (not current agent's)
  const otherAgentConversations = summaries.filter((s) => s.agentId !== currentAgentId);

  // Get recent (last 7 days)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentInteractions = otherAgentConversations.filter((s) => new Date(s.timestamp) > weekAgo);

  // Extract shared goals
  const sharedGoals = [...new Set(summaries.flatMap((s) => s.userGoals || []))];

  // Get team notes
  let notes = teamNotesCache.get(userId);
  if (!notes) {
    notes = await loadTeamNotes(userId);
    if (notes) {
      teamNotesCache.set(userId, notes);
    }
  }
  notes = notes || [];

  const relevantNotes = notes.filter(
    (n) => (n.toAgent === currentAgentId || n.toAgent === '*') && !n.acknowledged
  );

  return {
    recentTeamInteractions: recentInteractions.slice(-5), // Last 5
    sharedGoals,
    teamNotes: relevantNotes,
  };
}

/**
 * Load team notes from Firestore
 */
async function loadTeamNotes(userId: string): Promise<TeamNote[]> {
  const firestore = await getFirestore();
  if (!firestore) return [];

  try {
    const doc = await firestore.collection(TEAM_NOTES_COLLECTION).doc(userId).get();
    if (doc.exists) {
      const data = doc.data();
      return (data?.notes || []).map((n: Record<string, unknown>) => ({
        ...n,
        timestamp:
          (n.timestamp as { toDate?: () => Date })?.toDate?.() || new Date(n.timestamp as string),
      })) as TeamNote[];
    }
  } catch (err) {
    getLogger().warn({ err, userId }, 'Failed to load team notes from Firestore');
  }

  return [];
}

/**
 * Add a team note from one agent to another (or all)
 * e.g., "Hey team, user is going through a tough time with their job search"
 */
export async function addTeamNote(
  userId: string,
  note: Omit<TeamNote, 'timestamp' | 'acknowledged'>
): Promise<void> {
  const log = getLogger();

  const fullNote: TeamNote = {
    ...note,
    timestamp: new Date(),
    acknowledged: false,
  };

  // Update cache
  const existing = teamNotesCache.get(userId) || [];
  existing.push(fullNote);
  teamNotesCache.set(userId, existing);

  // Persist to Firestore
  const firestore = await getFirestore();
  if (firestore) {
    try {
      const docRef = firestore.collection(TEAM_NOTES_COLLECTION).doc(userId);
      const doc = await docRef.get();

      let notes: TeamNote[] = [];
      if (doc.exists) {
        const data = doc.data();
        notes = (data?.notes || []).map((n: Record<string, unknown>) => ({
          ...n,
          timestamp:
            (n.timestamp as { toDate?: () => Date })?.toDate?.() || new Date(n.timestamp as string),
        })) as TeamNote[];
      }

      notes.push(fullNote);
      // Keep last 50
      const trimmed = notes.slice(-50);

      await docRef.set(
        cleanForFirestore({
          userId,
          notes: trimmed,
          lastUpdated: new Date(),
        }),
        { merge: true }
      );

      log.debug({ userId, from: note.fromAgent, priority: note.priority }, 'Team note persisted');
    } catch (err) {
      log.warn({ err, userId }, 'Failed to persist team note to Firestore');
    }
  }
}

/**
 * Acknowledge a team note (mark as read)
 */
export async function acknowledgeTeamNote(
  userId: string,
  noteTimestamp: Date,
  _agentId: string // Reserved for audit logging
): Promise<void> {
  // Update cache
  const notes = teamNotesCache.get(userId) || [];
  const note = notes.find((n) => n.timestamp.getTime() === noteTimestamp.getTime());
  if (note) {
    note.acknowledged = true;
  }

  // Update Firestore
  const firestore = await getFirestore();
  if (firestore) {
    try {
      const docRef = firestore.collection(TEAM_NOTES_COLLECTION).doc(userId);
      const doc = await docRef.get();

      if (doc.exists) {
        const data = doc.data();
        const firestoreNotes = (data?.notes || []).map((n: Record<string, unknown>) => {
          const ts =
            (n.timestamp as { toDate?: () => Date })?.toDate?.() || new Date(n.timestamp as string);
          if (ts.getTime() === noteTimestamp.getTime()) {
            return { ...n, acknowledged: true };
          }
          return n;
        });

        await docRef.set(removeUndefined({ notes: firestoreNotes }), { merge: true });
      }
    } catch (err) {
      getLogger().warn({ err, userId }, 'Failed to acknowledge team note in Firestore');
    }
  }
}

// ============================================================================
// PROMPT FORMATTERS
// ============================================================================

const AGENT_NAMES: Record<string, string> = {
  ferni: 'Ferni',
  'alex-chen': 'Alex',
  'maya-santos': 'Maya',
  'jordan-taylor': 'Jordan',
  'peter-john': 'Peter',
  'nayan-patel': 'Nayan',
};

/**
 * Format cross-agent context for prompt injection
 */
export function formatCrossAgentContextForPrompt(
  context: CrossAgentContext,
  _currentAgentId: string // Reserved for agent-specific filtering
): string {
  if (
    context.recentTeamInteractions.length === 0 &&
    context.teamNotes.length === 0 &&
    context.sharedGoals.length === 0
  ) {
    return '';
  }

  const parts: string[] = [];

  // Team interactions header
  if (context.recentTeamInteractions.length > 0) {
    parts.push('[TEAM AWARENESS - What your teammates discussed with this user recently]');

    for (const interaction of context.recentTeamInteractions) {
      const { agentName } = interaction;
      const daysAgo = Math.floor(
        (Date.now() - new Date(interaction.timestamp).getTime()) / (1000 * 60 * 60 * 24)
      );
      const timeRef = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;

      let summary = `- ${agentName} (${timeRef}): Discussed ${interaction.topics.join(', ')}`;

      if (interaction.emotionalTone === 'struggling') {
        summary += ' [User was struggling]';
      } else if (interaction.emotionalTone === 'celebratory') {
        summary += ' [User was celebrating!]';
      }

      if (interaction.keyMoments.length > 0) {
        summary += `\n  Key moments: ${interaction.keyMoments.slice(0, 2).join('; ')}`;
      }

      if (interaction.userConcerns?.length) {
        summary += `\n  Concerns mentioned: ${interaction.userConcerns.join(', ')}`;
      }

      if (interaction.followUpNeeded) {
        summary += '\n  [FOLLOW-UP RECOMMENDED]';
      }

      parts.push(summary);
    }

    parts.push('');
    parts.push(
      `[TIP: You can naturally reference what ${context.recentTeamInteractions[0]?.agentName || 'a teammate'} discussed - e.g., "${context.recentTeamInteractions[0]?.agentName || 'Alex'} mentioned you were working on..."]`
    );
  }

  // Team notes
  if (context.teamNotes.length > 0) {
    parts.push('\n[TEAM NOTES - Messages from your teammates]');
    for (const note of context.teamNotes) {
      const fromName = AGENT_NAMES[note.fromAgent] || note.fromAgent;
      const priority = note.priority === 'high' ? '🔴 ' : note.priority === 'medium' ? '🟡 ' : '';
      parts.push(`- ${priority}From ${fromName}: "${note.content}"`);
    }
  }

  // Shared goals
  if (context.sharedGoals.length > 0) {
    parts.push('\n[SHARED TEAM KNOWLEDGE - Goals this user is working on]');
    parts.push(`- ${context.sharedGoals.slice(0, 5).join('\n- ')}`);
  }

  return parts.join('\n');
}

/**
 * Generate a natural team reference phrase
 */
export function generateTeamReferencePhrases(
  context: CrossAgentContext,
  _currentAgentId: string // Reserved for agent-specific phrase generation
): string[] {
  const phrases: string[] = [];

  for (const interaction of context.recentTeamInteractions.slice(0, 3)) {
    const { agentName } = interaction;

    // Topic-based references
    if (interaction.topics.includes('stress') || interaction.topics.includes('anxiety')) {
      phrases.push(
        `${agentName} mentioned you've been under some pressure lately. How are you holding up?`
      );
    }

    if (interaction.topics.includes('goals') || interaction.topics.includes('planning')) {
      phrases.push(
        `I heard from ${agentName} you're working on some goals. Want to talk about how that's going?`
      );
    }

    if (interaction.topics.includes('finances') || interaction.topics.includes('budget')) {
      phrases.push(
        `${agentName} and I were chatting - sounds like you've been thinking about finances. How's that sitting with you?`
      );
    }

    // Emotional tone references
    if (interaction.emotionalTone === 'struggling') {
      phrases.push(
        `I know things have been tough - ${agentName} filled me in. I'm here if you want to talk.`
      );
    }

    if (interaction.emotionalTone === 'celebratory') {
      phrases.push(`${agentName} told me about your win! I wanted to congratulate you myself.`);
    }

    // Follow-up references
    if (interaction.followUpNeeded && interaction.keyMoments.length > 0) {
      phrases.push(
        `${agentName} mentioned something I wanted to follow up on: ${interaction.keyMoments[0]}`
      );
    }
  }

  return phrases;
}

/**
 * Analyze a conversation and extract a summary for team sharing
 */
export function analyzeConversationForTeam(
  agentId: string,
  conversationText: string,
  userEmotions: string[]
): TeamConversationSummary {
  // Simple keyword extraction
  const topics: string[] = [];

  const topicKeywords: Record<string, string[]> = {
    stress: ['stressed', 'overwhelmed', 'anxious', 'worried', 'pressure'],
    finances: ['money', 'budget', 'spending', 'saving', 'financial', 'bills'],
    goals: ['goal', 'achieve', 'working on', 'plan', 'want to'],
    relationships: ['relationship', 'partner', 'family', 'friend', 'dating'],
    work: ['job', 'work', 'career', 'boss', 'coworker', 'office'],
    health: ['health', 'exercise', 'diet', 'sleep', 'tired', 'energy'],
    planning: ['planning', 'event', 'trip', 'vacation', 'wedding'],
  };

  const lowerText = conversationText.toLowerCase();
  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some((k) => lowerText.includes(k))) {
      topics.push(topic);
    }
  }

  // Determine emotional tone
  let emotionalTone: TeamConversationSummary['emotionalTone'] = 'neutral';
  if (userEmotions.includes('sad') || userEmotions.includes('anxious')) {
    emotionalTone = 'struggling';
  } else if (userEmotions.includes('happy') || userEmotions.includes('excited')) {
    emotionalTone = 'celebratory';
  } else if (userEmotions.includes('content')) {
    emotionalTone = 'positive';
  }

  // Extract key moments (sentences with strong emotional content)
  const keyMoments: string[] = [];
  const sentences = conversationText.split(/[.!?]+/);
  for (const sentence of sentences.slice(0, 10)) {
    if (
      sentence.includes('I feel') ||
      sentence.includes('I want') ||
      sentence.includes('worried about') ||
      sentence.includes('excited about')
    ) {
      keyMoments.push(sentence.trim());
    }
  }

  return {
    agentId,
    agentName: AGENT_NAMES[agentId] || agentId,
    timestamp: new Date(),
    topics: topics.slice(0, 5),
    emotionalTone,
    keyMoments: keyMoments.slice(0, 3),
    followUpNeeded: emotionalTone === 'struggling',
  };
}

// ============================================================================
// SESSION HOOKS
// ============================================================================

/**
 * Call at end of session to record what was discussed
 */
export async function recordSessionForTeam(
  userId: string,
  agentId: AgentId,
  conversationSummary: string,
  userEmotions: string[]
): Promise<void> {
  const summary = analyzeConversationForTeam(agentId, conversationSummary, userEmotions);
  await recordConversationForTeam(userId, summary);

  getLogger().info(
    {
      userId,
      agentId,
      topics: summary.topics,
      tone: summary.emotionalTone,
    },
    '📝 Recorded session for team awareness'
  );
}

/**
 * Initialize cross-agent awareness for a user
 */
export async function initializeCrossAgentAwareness(userId: string): Promise<void> {
  const log = getLogger();

  // Load from Firestore into cache
  const firestore = await getFirestore();
  if (firestore) {
    try {
      // Load conversations and notes in parallel (2x faster)
      const [convDoc, notesDoc] = await Promise.all([
        firestore.collection(TEAM_AWARENESS_COLLECTION).doc(userId).get(),
        firestore.collection(TEAM_NOTES_COLLECTION).doc(userId).get(),
      ]);

      // Process conversations
      if (convDoc.exists) {
        const data = convDoc.data();
        const conversations = (data?.conversations || []).map((c: Record<string, unknown>) => ({
          ...c,
          timestamp:
            (c.timestamp as { toDate?: () => Date })?.toDate?.() || new Date(c.timestamp as string),
        })) as TeamConversationSummary[];
        conversationCache.set(userId, conversations);
        log.debug(
          { userId, count: conversations.length },
          'Loaded team conversations from Firestore'
        );
      }

      // Process notes
      if (notesDoc.exists) {
        const data = notesDoc.data();
        const notes = (data?.notes || []).map((n: Record<string, unknown>) => ({
          ...n,
          timestamp:
            (n.timestamp as { toDate?: () => Date })?.toDate?.() || new Date(n.timestamp as string),
        })) as TeamNote[];
        teamNotesCache.set(userId, notes);
        log.debug({ userId, count: notes.length }, 'Loaded team notes from Firestore');
      }
    } catch (err) {
      log.warn({ err, userId }, 'Failed to initialize cross-agent awareness from Firestore');
    }
  }

  // Initialize empty caches if not loaded
  if (!conversationCache.has(userId)) {
    conversationCache.set(userId, []);
  }
  if (!teamNotesCache.has(userId)) {
    teamNotesCache.set(userId, []);
  }
}

/**
 * Clear caches (for testing)
 */
export function clearCrossAgentCaches(): void {
  conversationCache.clear();
  teamNotesCache.clear();
}
