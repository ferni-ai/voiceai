/**
 * Unified User Knowledge
 *
 * "Better Than Human" capability: Complete, unified knowledge about a user.
 *
 * Human friends have fragmented memories - they might remember some things
 * about you but forget others. Ferni has PERFECT, UNIFIED recall across:
 *
 * - User profile (name, preferences, communication style)
 * - Voice conversation memory (topics, moments, milestones)
 * - Persona-specific memories (what each team member knows)
 * - Cognitive memory (thinking patterns, values, goals)
 * - Dynamic memory (real-time entities, facts, relationships)
 * - Superhuman services (commitments, dreams, values alignment)
 *
 * This module provides a single function to get EVERYTHING we know about a user,
 * formatted for LLM context injection.
 *
 * Philosophy: The user should feel like they're talking to someone who
 * genuinely KNOWS them, not just has data about them.
 *
 * @module services/superhuman/unified-user-knowledge
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';
import type { UserProfile } from '../../types/user-profile.js';

const log = createLogger({ module: 'UnifiedUserKnowledge' });

// ============================================================================
// TYPES
// ============================================================================

export interface UnifiedUserKnowledge {
  /** User's core identity */
  identity: {
    name: string;
    preferredName?: string;
    communicationStyle?: string;
    relationshipDays: number;
    totalConversations: number;
    lastConversation?: string;
  };

  /** Key people in their life */
  people: Array<{
    name: string;
    relationship: string;
    lastMentioned?: string;
    emotionalContext?: string;
    importance: 'high' | 'medium' | 'low';
  }>;

  /** Active topics and threads */
  activeTopics: Array<{
    topic: string;
    lastMentioned: string;
    daysSince: number;
    emotionalTone?: string;
    needsFollowUp: boolean;
    followUpReason?: string;
  }>;

  /** Important life events and moments */
  keyMoments: Array<{
    type: 'breakthrough' | 'challenge' | 'milestone' | 'decision' | 'realization';
    summary: string;
    date: string;
    emotionalWeight: number;
    personaWhoWitnessed?: string;
  }>;

  /** Their values and what matters to them */
  values: Array<{
    value: string;
    evidence: string;
    strength: number;
  }>;

  /** Dreams and aspirations */
  dreams: Array<{
    dream: string;
    status: 'active' | 'dormant' | 'achieved';
    lastMentioned?: string;
  }>;

  /** Active commitments */
  commitments: Array<{
    description: string;
    dueDate?: string;
    status: 'active' | 'completed' | 'at_risk';
    importance: 'high' | 'medium' | 'low';
  }>;

  /** Communication preferences */
  preferences: {
    preferredTone: string;
    responsiveToHumor: boolean;
    prefers: 'direct' | 'gentle' | 'exploratory';
    bestTimeToReach?: string;
  };

  /** Current emotional state */
  emotionalContext: {
    recentMood?: string;
    activeEmotionalThreads: string[];
    needsSupport: boolean;
    supportReason?: string;
  };

  /** Formatted context string for LLM injection */
  formattedContext: string;

  /** Metadata */
  buildTime: number;
  sources: string[];
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Build unified knowledge about a user from ALL sources.
 *
 * This is the superhuman capability - perfect recall across all memory systems.
 */
export async function buildUnifiedUserKnowledge(
  userId: string,
  options: {
    includeProfile?: boolean;
    includeVoiceMemory?: boolean;
    includePersonaMemories?: boolean;
    includeCognitiveMemory?: boolean;
    includeDynamicMemory?: boolean;
    includeSuperhuman?: boolean;
    maxPeople?: number;
    maxTopics?: number;
    maxMoments?: number;
  } = {}
): Promise<UnifiedUserKnowledge> {
  const startTime = Date.now();

  const opts = {
    includeProfile: true,
    includeVoiceMemory: true,
    includePersonaMemories: true,
    includeCognitiveMemory: true,
    includeDynamicMemory: true,
    includeSuperhuman: true,
    maxPeople: 10,
    maxTopics: 10,
    maxMoments: 5,
    ...options,
  };

  const sources: string[] = [];
  const now = new Date();

  // Initialize empty knowledge
  const knowledge: UnifiedUserKnowledge = {
    identity: {
      name: 'Friend',
      relationshipDays: 0,
      totalConversations: 0,
    },
    people: [],
    activeTopics: [],
    keyMoments: [],
    values: [],
    dreams: [],
    commitments: [],
    preferences: {
      preferredTone: 'warm',
      responsiveToHumor: true,
      prefers: 'gentle',
    },
    emotionalContext: {
      activeEmotionalThreads: [],
      needsSupport: false,
    },
    formattedContext: '',
    buildTime: 0,
    sources: [],
  };

  try {
    const db = getFirestoreDb();
    if (!db) {
      log.warn('Firestore not available, returning minimal knowledge');
      return knowledge;
    }

    // ========================================================================
    // 1. USER PROFILE
    // ========================================================================
    if (opts.includeProfile) {
      try {
        const profileDoc = await db.collection('bogle_users').doc(userId).get();
        if (profileDoc.exists) {
          const profile = profileDoc.data() as UserProfile;
          sources.push('user_profile');

          knowledge.identity = {
            name: profile.preferredName || profile.name || 'Friend',
            preferredName: profile.preferredName,
            communicationStyle: profile.communicationStyle,
            relationshipDays: profile.firstContact
              ? Math.floor(
                  (now.getTime() - new Date(profile.firstContact).getTime()) /
                    (1000 * 60 * 60 * 24)
                )
              : 0,
            totalConversations: profile.totalConversations || 0,
            lastConversation: profile.lastContact?.toISOString?.() || profile.lastContact?.toString(),
          };

          // Communication preferences from profile
          if (profile.communicationStyle) {
            knowledge.preferences = {
              preferredTone: profile.communicationStyle || 'warm',
              responsiveToHumor: profile.humorAppreciation !== 'low',
              prefers:
                (profile.communicationStyle as 'direct' | 'gentle' | 'exploratory') ||
                'gentle',
              bestTimeToReach: profile.contactInfo?.quietHoursEnd
                ? `After ${profile.contactInfo.quietHoursEnd}:00`
                : undefined,
            };
          }
        }
      } catch (e) {
        log.warn({ error: String(e) }, 'Failed to load user profile');
      }
    }

    // ========================================================================
    // 2. VOICE CONVERSATION MEMORY
    // ========================================================================
    if (opts.includeVoiceMemory) {
      try {
        const voiceMemoryDoc = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('voice-conversation-memory')
          .doc('current')
          .get();

        if (voiceMemoryDoc.exists) {
          const voiceMemory = voiceMemoryDoc.data();
          sources.push('voice_memory');

          // Topics
          if (voiceMemory?.topics) {
            for (const topic of voiceMemory.topics.slice(0, opts.maxTopics)) {
              const lastMentioned = topic.lastMentioned?.toDate?.() || new Date(topic.lastMentioned);
              const daysSince = Math.floor(
                (now.getTime() - lastMentioned.getTime()) / (1000 * 60 * 60 * 24)
              );

              knowledge.activeTopics.push({
                topic: topic.topic,
                lastMentioned: lastMentioned.toISOString(),
                daysSince,
                emotionalTone: topic.emotionalTone,
                needsFollowUp: daysSince > 3 && daysSince < 14,
                followUpReason:
                  daysSince > 3 && daysSince < 14
                    ? `Mentioned ${daysSince} days ago, worth checking in`
                    : undefined,
              });
            }
          }

          // Important moments
          if (voiceMemory?.importantMoments) {
            for (const moment of voiceMemory.importantMoments.slice(0, opts.maxMoments)) {
              knowledge.keyMoments.push({
                type: moment.type || 'realization',
                summary: moment.summary,
                date: moment.date?.toDate?.()?.toISOString() || moment.date,
                emotionalWeight: moment.emotionalWeight || 0.7,
                personaWhoWitnessed: moment.personaId,
              });
            }
          }
        }
      } catch (e) {
        log.warn({ error: String(e) }, 'Failed to load voice memory');
      }
    }

    // ========================================================================
    // 3. PERSONA MEMORIES (Cross-persona knowledge)
    // ========================================================================
    if (opts.includePersonaMemories) {
      try {
        const personaMemoriesSnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('persona-memories')
          .limit(50)
          .get();

        if (!personaMemoriesSnap.empty) {
          sources.push('persona_memories');

          for (const doc of personaMemoriesSnap.docs) {
            const memory = doc.data();

            // Extract people from memories
            if (memory.type === 'relationship' && memory.entity) {
              const existingPerson = knowledge.people.find(
                (p) => p.name.toLowerCase() === memory.entity.toLowerCase()
              );
              if (!existingPerson) {
                knowledge.people.push({
                  name: memory.entity,
                  relationship: memory.relationship || 'mentioned',
                  lastMentioned: memory.timestamp?.toDate?.()?.toISOString(),
                  emotionalContext: memory.emotionalContext,
                  importance: memory.emotionalWeight > 0.7 ? 'high' : 'medium',
                });
              }
            }

            // Extract values
            if (memory.type === 'value' && memory.content) {
              knowledge.values.push({
                value: memory.content,
                evidence: memory.evidence || '',
                strength: memory.emotionalWeight || 0.5,
              });
            }
          }
        }
      } catch (e) {
        log.warn({ error: String(e) }, 'Failed to load persona memories');
      }
    }

    // ========================================================================
    // 4. COGNITIVE MEMORY
    // ========================================================================
    if (opts.includeCognitiveMemory) {
      try {
        const cognitiveDoc = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('cognitive-memory')
          .doc('current')
          .get();

        if (cognitiveDoc.exists) {
          const cognitive = cognitiveDoc.data();
          sources.push('cognitive_memory');

          // Thinking patterns might reveal values
          if (cognitive?.thinkingPatterns) {
            for (const pattern of cognitive.thinkingPatterns.slice(0, 5)) {
              if (
                pattern.type === 'value' &&
                !knowledge.values.find((v) => v.value === pattern.content)
              ) {
                knowledge.values.push({
                  value: pattern.content,
                  evidence: pattern.evidence || '',
                  strength: pattern.confidence || 0.5,
                });
              }
            }
          }

          // Goals from cognitive memory
          if (cognitive?.goals) {
            for (const goal of cognitive.goals) {
              knowledge.dreams.push({
                dream: goal.description,
                status: goal.status || 'active',
                lastMentioned: goal.lastMentioned,
              });
            }
          }
        }
      } catch (e) {
        log.warn({ error: String(e) }, 'Failed to load cognitive memory');
      }
    }

    // ========================================================================
    // 5. DYNAMIC MEMORY (Real-time entities, facts, relationships)
    // ========================================================================
    if (opts.includeDynamicMemory) {
      try {
        // Entities
        const entitiesSnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('dynamic_entities')
          .orderBy('lastSeenAt', 'desc')
          .limit(20)
          .get();

        if (!entitiesSnap.empty) {
          sources.push('dynamic_entities');

          for (const doc of entitiesSnap.docs) {
            const entity = doc.data();
            if (entity.type === 'person') {
              const existingPerson = knowledge.people.find(
                (p) => p.name.toLowerCase() === entity.value.toLowerCase()
              );
              if (!existingPerson) {
                knowledge.people.push({
                  name: entity.value,
                  relationship: entity.context || 'mentioned',
                  lastMentioned: entity.lastSeenAt?.toDate?.()?.toISOString(),
                  importance: entity.frequency > 3 ? 'high' : 'medium',
                });
              }
            }
          }
        }

        // Facts
        const factsSnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('dynamic_facts')
          .orderBy('extractedAt', 'desc')
          .limit(20)
          .get();

        if (!factsSnap.empty) {
          sources.push('dynamic_facts');
          // Facts can enrich existing knowledge
        }

        // Relationships
        const relSnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('dynamic_relationships')
          .limit(30)
          .get();

        if (!relSnap.empty) {
          sources.push('dynamic_relationships');

          for (const doc of relSnap.docs) {
            const rel = doc.data();
            if (rel.sourceType === 'person' || rel.targetType === 'person') {
              const personName = rel.sourceType === 'person' ? rel.source : rel.target;
              const existingPerson = knowledge.people.find(
                (p) => p.name.toLowerCase() === personName.toLowerCase()
              );
              if (existingPerson && rel.relationship) {
                existingPerson.relationship = rel.relationship;
              }
            }
          }
        }
      } catch (e) {
        log.warn({ error: String(e) }, 'Failed to load dynamic memory');
      }
    }

    // ========================================================================
    // 6. SUPERHUMAN SERVICES (Commitments, dreams, values)
    // ========================================================================
    if (opts.includeSuperhuman) {
      try {
        // Commitments
        const commitmentsSnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('commitments')
          .where('status', '==', 'active')
          .limit(10)
          .get();

        if (!commitmentsSnap.empty) {
          sources.push('superhuman_commitments');

          for (const doc of commitmentsSnap.docs) {
            const commitment = doc.data();
            knowledge.commitments.push({
              description: commitment.description,
              dueDate: commitment.dueDate,
              status:
                commitment.dueDate && new Date(commitment.dueDate) < now ? 'at_risk' : 'active',
              importance: commitment.importance || 'medium',
            });
          }
        }

        // Dreams from dream keeper
        const dreamsSnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('dreams')
          .limit(5)
          .get();

        if (!dreamsSnap.empty) {
          sources.push('superhuman_dreams');

          for (const doc of dreamsSnap.docs) {
            const dream = doc.data();
            if (!knowledge.dreams.find((d) => d.dream === dream.description)) {
              knowledge.dreams.push({
                dream: dream.description,
                status: dream.status || 'active',
                lastMentioned: dream.lastMentioned,
              });
            }
          }
        }

        // Values from values alignment
        const valuesSnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('values')
          .limit(10)
          .get();

        if (!valuesSnap.empty) {
          sources.push('superhuman_values');

          for (const doc of valuesSnap.docs) {
            const value = doc.data();
            if (!knowledge.values.find((v) => v.value === value.name)) {
              knowledge.values.push({
                value: value.name,
                evidence: value.evidence?.join(', ') || '',
                strength: value.strength || 0.5,
              });
            }
          }
        }
      } catch (e) {
        log.warn({ error: String(e) }, 'Failed to load superhuman services');
      }
    }

    // ========================================================================
    // 7. DEDUPLICATE AND SORT
    // ========================================================================

    // Sort people by importance
    knowledge.people = knowledge.people
      .slice(0, opts.maxPeople)
      .sort((a, b) => {
        const importanceOrder = { high: 3, medium: 2, low: 1 };
        return importanceOrder[b.importance] - importanceOrder[a.importance];
      });

    // Sort topics by recency
    knowledge.activeTopics = knowledge.activeTopics
      .slice(0, opts.maxTopics)
      .sort((a, b) => a.daysSince - b.daysSince);

    // Sort values by strength
    knowledge.values = knowledge.values.sort((a, b) => b.strength - a.strength).slice(0, 5);

    // Sort dreams - active first
    knowledge.dreams = knowledge.dreams
      .sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (b.status === 'active' && a.status !== 'active') return 1;
        return 0;
      })
      .slice(0, 5);

    // ========================================================================
    // 8. FORMAT FOR LLM CONTEXT
    // ========================================================================
    knowledge.formattedContext = formatKnowledgeForLLM(knowledge);
    knowledge.buildTime = Date.now() - startTime;
    knowledge.sources = sources;

    log.info(
      {
        userId,
        sources: sources.length,
        people: knowledge.people.length,
        topics: knowledge.activeTopics.length,
        buildTime: knowledge.buildTime,
      },
      '📚 Built unified user knowledge'
    );

    return knowledge;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to build unified knowledge');
    return knowledge;
  }
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format unified knowledge into LLM context string
 */
function formatKnowledgeForLLM(knowledge: UnifiedUserKnowledge): string {
  const sections: string[] = [];

  // Identity
  if (knowledge.identity.name !== 'Friend') {
    sections.push(
      `## WHO ${knowledge.identity.name} IS\n` +
        `Known for ${knowledge.identity.relationshipDays} days, ` +
        `${knowledge.identity.totalConversations} conversations. ` +
        (knowledge.identity.communicationStyle
          ? `Communication style: ${knowledge.identity.communicationStyle}.`
          : '')
    );
  }

  // Key people
  if (knowledge.people.length > 0) {
    const peopleStr = knowledge.people
      .map(
        (p) =>
          `- ${p.name}: ${p.relationship}${p.emotionalContext ? ` (${p.emotionalContext})` : ''}`
      )
      .join('\n');
    sections.push(`## IMPORTANT PEOPLE IN THEIR LIFE\n${peopleStr}`);
  }

  // Active topics needing follow-up
  const followUpTopics = knowledge.activeTopics.filter((t) => t.needsFollowUp);
  if (followUpTopics.length > 0) {
    const topicsStr = followUpTopics
      .map((t) => `- "${t.topic}" (${t.daysSince} days ago)${t.followUpReason ? ` - ${t.followUpReason}` : ''}`)
      .join('\n');
    sections.push(
      `## TOPICS WORTH FOLLOWING UP ON\n${topicsStr}\n\n*These were mentioned recently but not resolved - a good friend would ask about them.*`
    );
  }

  // Values
  if (knowledge.values.length > 0) {
    const valuesStr = knowledge.values.map((v) => `- ${v.value}`).join('\n');
    sections.push(`## WHAT MATTERS TO THEM\n${valuesStr}`);
  }

  // Dreams
  const activeDreams = knowledge.dreams.filter((d) => d.status === 'active');
  if (activeDreams.length > 0) {
    const dreamsStr = activeDreams.map((d) => `- ${d.dream}`).join('\n');
    sections.push(`## THEIR DREAMS & ASPIRATIONS\n${dreamsStr}`);
  }

  // Commitments needing attention
  const atRiskCommitments = knowledge.commitments.filter((c) => c.status === 'at_risk');
  if (atRiskCommitments.length > 0) {
    const commitmentsStr = atRiskCommitments.map((c) => `- ${c.description}`).join('\n');
    sections.push(
      `## COMMITMENTS THAT MAY NEED SUPPORT\n${commitmentsStr}\n\n*These are past due - check in gently.*`
    );
  }

  // Key moments
  if (knowledge.keyMoments.length > 0) {
    const momentsStr = knowledge.keyMoments
      .slice(0, 3)
      .map((m) => `- [${m.type.toUpperCase()}] ${m.summary}`)
      .join('\n');
    sections.push(`## SIGNIFICANT MOMENTS\n${momentsStr}`);
  }

  // Communication preferences
  if (knowledge.preferences.prefers !== 'gentle') {
    sections.push(
      `## HOW TO COMMUNICATE\nThey prefer ${knowledge.preferences.prefers} communication. ` +
        (knowledge.preferences.responsiveToHumor ? 'Humor works well.' : 'Keep it serious.')
    );
  }

  return sections.join('\n\n');
}

// ============================================================================
// CONTEXT INJECTION HELPER
// ============================================================================

/**
 * Get unified knowledge as a context injection for the LLM.
 *
 * Use this in turn handlers to inject comprehensive user knowledge.
 */
export async function getUnifiedKnowledgeInjection(
  userId: string
): Promise<{ content: string; priority: number }> {
  const knowledge = await buildUnifiedUserKnowledge(userId);

  return {
    content:
      `[UNIFIED USER KNOWLEDGE - What you know about this person]\n\n` + knowledge.formattedContext,
    priority: 95, // High priority - this is core context
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  buildUnifiedUserKnowledge,
  getUnifiedKnowledgeInjection,
};
