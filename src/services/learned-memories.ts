/**
 * Learned Memories Service
 * 
 * Extracts what the AI has learned about a user from their profile
 * and transforms it into a format suitable for the "What I've Learned" UI.
 * 
 * Sources of learned information:
 * - keyMoments: Important moments from conversations
 * - emotionalPatterns: Emotional patterns observed
 * - familyMembers: Relationships mentioned
 * - preferredTopics: Topics they're interested in
 * - goals: Financial and life goals
 * - preferences: Communication preferences
 * - cognitiveIntelligence: How they think/process information
 */

import { getLogger } from '../utils/safe-logger.js';
import type { UserProfile, KeyMoment, EmotionalPattern, FamilyMember } from '../types/user-profile.js';

// ============================================================================
// TYPES - Match frontend UI expectations
// ============================================================================

export type MemoryType = 'fact' | 'preference' | 'goal' | 'pattern' | 'relationship';

export interface LearnedMemory {
  id: string;
  type: MemoryType;
  content: string;
  confidence: number;
  source: string;
  learnedAt: string;
  personaId?: string;
  /** Original data reference for deletion */
  sourceType?: 'keyMoment' | 'emotionalPattern' | 'familyMember' | 'goal' | 'preference' | 'topic';
  sourceId?: string;
}

export interface BehavioralPattern {
  id: string;
  pattern: string;
  frequency: number;
  examples: string[];
  category?: 'timing' | 'communication' | 'engagement' | 'interests' | 'emotional' | 'relationship' | 'voice' | 'life' | 'goals' | 'knowledge' | 'preferences' | 'boundaries' | 'achievements' | 'continuity' | 'relationships';
}

export interface LearnedMemoriesData {
  memories: LearnedMemory[];
  patterns: BehavioralPattern[];
  totalInteractions: number;
  knowledgeScore: number;
}

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Extract memories from KeyMoments
 */
function extractFromKeyMoments(keyMoments: KeyMoment[]): LearnedMemory[] {
  if (!keyMoments || keyMoments.length === 0) return [];

  return keyMoments.map((km, idx) => {
    // Map KeyMoment type to memory type
    const typeMap: Record<string, MemoryType> = {
      shared_vulnerability: 'fact',
      breakthrough: 'goal',
      milestone: 'fact',
      concern: 'pattern',
      celebration: 'fact',
      decision: 'goal',
    };

    const emotionalWeightToConfidence: Record<string, number> = {
      light: 0.7,
      medium: 0.85,
      heavy: 0.95,
    };

    return {
      id: km.id || `km_${idx}`,
      type: typeMap[km.type] || 'fact',
      content: km.summary,
      confidence: emotionalWeightToConfidence[km.emotionalWeight] || 0.8,
      source: 'conversation',
      learnedAt: km.timestamp instanceof Date 
        ? km.timestamp.toISOString() 
        : new Date(km.timestamp).toISOString(),
      sourceType: 'keyMoment' as const,
      sourceId: km.id,
    };
  });
}

/**
 * Extract memories from EmotionalPatterns
 */
function extractFromEmotionalPatterns(patterns: EmotionalPattern[]): LearnedMemory[] {
  if (!patterns || patterns.length === 0) return [];

  // Group by emotion to find patterns
  const emotionCounts: Record<string, { count: number; contexts: string[]; lastSeen: Date }> = {};
  
  for (const ep of patterns) {
    const emotion = ep.emotion.toLowerCase();
    if (!emotionCounts[emotion]) {
      emotionCounts[emotion] = { count: 0, contexts: [], lastSeen: new Date(0) };
    }
    emotionCounts[emotion].count++;
    if (ep.context) emotionCounts[emotion].contexts.push(ep.context);
    const epDate = ep.timestamp instanceof Date ? ep.timestamp : new Date(ep.timestamp);
    if (epDate > emotionCounts[emotion].lastSeen) {
      emotionCounts[emotion].lastSeen = epDate;
    }
  }

  // Create pattern memories for emotions that appear frequently
  const memories: LearnedMemory[] = [];
  let patternIdx = 0;

  for (const [emotion, data] of Object.entries(emotionCounts)) {
    if (data.count >= 2) {
      const context = data.contexts.length > 0 
        ? ` (often when discussing ${data.contexts.slice(0, 2).join(', ')})` 
        : '';
      
      memories.push({
        id: `ep_${patternIdx++}`,
        type: 'pattern',
        content: `You often feel ${emotion}${context}`,
        confidence: Math.min(0.95, 0.6 + (data.count * 0.1)),
        source: 'observation',
        learnedAt: data.lastSeen.toISOString(),
        sourceType: 'emotionalPattern',
      });
    }
  }

  return memories;
}

/**
 * Extract memories from FamilyMembers (relationships)
 */
function extractFromFamilyMembers(members: FamilyMember[]): LearnedMemory[] {
  if (!members || members.length === 0) return [];

  return members.map((fm, idx) => {
    let content = fm.name 
      ? `${fm.name} is your ${fm.relationship}` 
      : `Your ${fm.relationship}`;
    if (fm.mentionedTopics && fm.mentionedTopics.length > 0) {
      content += ` (topics: ${fm.mentionedTopics.slice(0, 2).join(', ')})`;
    }

    return {
      id: `fm_${idx}`,
      type: 'relationship' as MemoryType,
      content,
      confidence: 0.95,
      source: 'conversation',
      learnedAt: fm.lastMentioned instanceof Date 
        ? fm.lastMentioned.toISOString() 
        : new Date(fm.lastMentioned || Date.now()).toISOString(),
      sourceType: 'familyMember' as const,
      sourceId: fm.name || `family_${idx}`, // Use name as ID for family members
    };
  });
}

/**
 * Extract memories from financial goals
 */
function extractFromGoals(profile: UserProfile): LearnedMemory[] {
  const memories: LearnedMemory[] = [];

  // Financial goals
  if (profile.goals && profile.goals.length > 0) {
    for (const goal of profile.goals) {
      let content = `${goal.name}`;
      if (goal.targetDate) {
        const targetDate = goal.targetDate instanceof Date ? goal.targetDate : new Date(goal.targetDate);
        content += ` by ${targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
      }
      if (goal.status === 'on_track') content += ' (on track!)';
      else if (goal.status === 'behind') content += ' (needs attention)';

      memories.push({
        id: `goal_${goal.id}`,
        type: 'goal',
        content,
        confidence: 0.9,
        source: 'conversation',
        learnedAt: goal.createdAt instanceof Date 
          ? goal.createdAt.toISOString() 
          : new Date(goal.createdAt).toISOString(),
        sourceType: 'goal',
        sourceId: goal.id,
      });
    }
  }

  return memories;
}

/**
 * Extract memories from preferences
 */
function extractFromPreferences(profile: UserProfile): LearnedMemory[] {
  const memories: LearnedMemory[] = [];
  const now = new Date().toISOString();
  let prefIdx = 0;

  // Communication style
  if (profile.communicationStyle && profile.communicationStyle !== 'mixed') {
    memories.push({
      id: `pref_${prefIdx++}`,
      type: 'preference',
      content: `You prefer ${profile.communicationStyle} conversations`,
      confidence: 0.85,
      source: 'observation',
      learnedAt: now,
      sourceType: 'preference',
      sourceId: 'communicationStyle',
    });
  }

  // Speaking pace
  if (profile.speakingPace && profile.speakingPace !== 'moderate') {
    memories.push({
      id: `pref_${prefIdx++}`,
      type: 'preference',
      content: `You tend to speak at a ${profile.speakingPace} pace`,
      confidence: 0.8,
      source: 'observation',
      learnedAt: now,
      sourceType: 'preference',
      sourceId: 'speakingPace',
    });
  }

  // Humor appreciation
  if (profile.humorAppreciation === 'high') {
    memories.push({
      id: `pref_${prefIdx++}`,
      type: 'preference',
      content: 'You enjoy humor and lighthearted moments',
      confidence: 0.85,
      source: 'observation',
      learnedAt: now,
      sourceType: 'preference',
      sourceId: 'humorAppreciation',
    });
  } else if (profile.humorAppreciation === 'low') {
    memories.push({
      id: `pref_${prefIdx++}`,
      type: 'preference',
      content: 'You prefer more serious, focused conversations',
      confidence: 0.85,
      source: 'observation',
      learnedAt: now,
      sourceType: 'preference',
      sourceId: 'humorAppreciation',
    });
  }

  // Response quality preferences
  if (profile.responseQuality?.preferences) {
    const rqp = profile.responseQuality.preferences;
    if (rqp.likesStories) {
      memories.push({
        id: `pref_${prefIdx++}`,
        type: 'preference',
        content: 'You respond well to stories and examples',
        confidence: 0.8,
        source: 'observation',
        learnedAt: now,
        sourceType: 'preference',
        sourceId: 'likesStories',
      });
    }
    if (rqp.prefersDirectAdvice) {
      memories.push({
        id: `pref_${prefIdx++}`,
        type: 'preference',
        content: 'You prefer direct, actionable advice',
        confidence: 0.8,
        source: 'observation',
        learnedAt: now,
        sourceType: 'preference',
        sourceId: 'prefersDirectAdvice',
      });
    }
    if (rqp.preferredResponseLength === 'brief') {
      memories.push({
        id: `pref_${prefIdx++}`,
        type: 'preference',
        content: 'You prefer concise responses',
        confidence: 0.8,
        source: 'observation',
        learnedAt: now,
        sourceType: 'preference',
        sourceId: 'responseLength',
      });
    } else if (rqp.preferredResponseLength === 'lengthy') {
      memories.push({
        id: `pref_${prefIdx++}`,
        type: 'preference',
        content: 'You appreciate detailed, thorough explanations',
        confidence: 0.8,
        source: 'observation',
        learnedAt: now,
        sourceType: 'preference',
        sourceId: 'responseLength',
      });
    }
  }

  return memories;
}

/**
 * Extract memories from preferred/avoided topics
 */
function extractFromTopics(profile: UserProfile): LearnedMemory[] {
  const memories: LearnedMemory[] = [];
  const now = new Date().toISOString();

  // Preferred topics
  if (profile.preferredTopics && profile.preferredTopics.length > 0) {
    // Group related topics
    const topics = profile.preferredTopics.slice(0, 5);
    memories.push({
      id: 'topics_preferred',
      type: 'preference',
      content: `You're interested in: ${topics.join(', ')}`,
      confidence: 0.85,
      source: 'conversation',
      learnedAt: now,
      sourceType: 'topic',
      sourceId: 'preferredTopics',
    });
  }

  // Topics to avoid
  if (profile.avoidTopics && profile.avoidTopics.length > 0) {
    const avoid = profile.avoidTopics.slice(0, 3);
    memories.push({
      id: 'topics_avoid',
      type: 'preference',
      content: `Sensitive topics: ${avoid.join(', ')}`,
      confidence: 0.9,
      source: 'observation',
      learnedAt: now,
      sourceType: 'topic',
      sourceId: 'avoidTopics',
    });
  }

  return memories;
}

/**
 * Extract memories from life context
 */
function extractFromLifeContext(profile: UserProfile): LearnedMemory[] {
  const memories: LearnedMemory[] = [];
  let factIdx = 0;

  // Life stage
  if (profile.lifeStage) {
    const lifeStageLabels: Record<string, string> = {
      student: 'You\'re currently a student',
      early_career: 'You\'re in the early stages of your career',
      mid_career: 'You\'re established in your career',
      pre_retirement: 'You\'re approaching retirement',
      retired: 'You\'re enjoying retirement',
      career_change: 'You\'re going through a career transition',
    };
    const label = lifeStageLabels[profile.lifeStage];
    if (label) {
      memories.push({
        id: `life_${factIdx++}`,
        type: 'fact',
        content: label,
        confidence: 0.9,
        source: 'conversation',
        learnedAt: new Date().toISOString(),
        sourceType: 'preference',
        sourceId: 'lifeStage',
      });
    }
  }

  // Investment experience
  if (profile.investmentExperience && profile.investmentExperience !== 'unknown') {
    const expLabels: Record<string, string> = {
      beginner: 'You\'re new to investing',
      intermediate: 'You have some investing experience',
      experienced: 'You\'re an experienced investor',
    };
    memories.push({
      id: `life_${factIdx++}`,
      type: 'fact',
      content: expLabels[profile.investmentExperience] || `Investment experience: ${profile.investmentExperience}`,
      confidence: 0.85,
      source: 'conversation',
      learnedAt: new Date().toISOString(),
      sourceType: 'preference',
      sourceId: 'investmentExperience',
    });
  }

  // Financial anxieties
  if (profile.financialAnxietyTriggers && profile.financialAnxietyTriggers.length > 0) {
    memories.push({
      id: `life_${factIdx++}`,
      type: 'pattern',
      content: `Financial concerns: ${profile.financialAnxietyTriggers.slice(0, 3).join(', ')}`,
      confidence: 0.85,
      source: 'observation',
      learnedAt: new Date().toISOString(),
      sourceType: 'preference',
      sourceId: 'financialAnxietyTriggers',
    });
  }

  // Name
  if (profile.preferredName || profile.name) {
    memories.push({
      id: `life_${factIdx++}`,
      type: 'fact',
      content: `Your name is ${profile.preferredName || profile.name}`,
      confidence: 0.99,
      source: 'conversation',
      learnedAt: profile.firstContact instanceof Date 
        ? profile.firstContact.toISOString() 
        : new Date(profile.firstContact || Date.now()).toISOString(),
      sourceType: 'preference',
      sourceId: 'name',
    });
  }

  return memories;
}

/**
 * Extract behavioral patterns from conversation history
 */
function extractBehavioralPatterns(profile: UserProfile): BehavioralPattern[] {
  const patterns: BehavioralPattern[] = [];

  // Conversation time patterns
  if (profile.conversationPatterns?.preferences) {
    const cp = profile.conversationPatterns.preferences;
    if (cp.preferredDays && cp.preferredDays.length > 0) {
      patterns.push({
        id: 'pattern_days',
        pattern: `You usually chat on ${cp.preferredDays.slice(0, 3).join(', ')}`,
        frequency: cp.preferredDays.length * 2,
        examples: cp.preferredDays,
        category: 'timing',
      });
    }
    if (cp.preferredTimes && cp.preferredTimes.length > 0) {
      patterns.push({
        id: 'pattern_time',
        pattern: `You prefer ${cp.preferredTimes.slice(0, 2).join(' or ')} conversations`,
        frequency: 5,
        examples: cp.preferredTimes,
        category: 'timing',
      });
    }
    if (cp.avgDuration) {
      const duration = cp.avgDuration < 10 
        ? 'quick' 
        : cp.avgDuration > 20 
          ? 'longer' 
          : 'moderate-length';
      patterns.push({
        id: 'pattern_duration',
        pattern: `Your conversations are typically ${duration} (avg ${Math.round(cp.avgDuration)} min)`,
        frequency: 3,
        examples: [],
        category: 'timing',
      });
    }
  }

  // Topic sequence patterns
  if (profile.conversationPatterns?.sessions && profile.conversationPatterns.sessions.length >= 3) {
    const openingStyles: Record<string, number> = {};
    for (const session of profile.conversationPatterns.sessions) {
      if (session.openingStyle) {
        openingStyles[session.openingStyle] = (openingStyles[session.openingStyle] || 0) + 1;
      }
    }
    const mostCommonOpening = Object.entries(openingStyles)
      .sort((a, b) => b[1] - a[1])[0];
    if (mostCommonOpening && mostCommonOpening[1] >= 2) {
      patterns.push({
        id: 'pattern_opening',
        pattern: `You often start conversations with ${mostCommonOpening[0]}`,
        frequency: mostCommonOpening[1],
        examples: [],
        category: 'communication',
      });
    }
  }

  // Engagement topics
  if (profile.responseQuality?.preferences?.highEngagementTopics?.length) {
    patterns.push({
      id: 'pattern_engagement',
      pattern: `You get most engaged when discussing ${profile.responseQuality.preferences.highEngagementTopics.slice(0, 3).join(', ')}`,
      frequency: profile.responseQuality.preferences.highEngagementTopics.length,
      examples: profile.responseQuality.preferences.highEngagementTopics,
      category: 'interests',
    });
  }
  
  // Voice pace patterns
  if (profile.voicePace?.preferences) {
    const vp = profile.voicePace.preferences;
    if (vp.avgWPM && vp.avgWPM > 0) {
      const pace = vp.avgWPM < 120 ? 'thoughtful' : vp.avgWPM > 160 ? 'quick' : 'comfortable';
      patterns.push({
        id: 'pattern_wpm',
        pattern: `You speak at a ${pace} pace (around ${Math.round(vp.avgWPM)} words per minute)`,
        frequency: 3,
        examples: [],
        category: 'voice',
      });
    }
  }
  
  // Relationship milestones
  if (profile.humanizingState?.relationshipMilestones?.length) {
    const milestones = profile.humanizingState.relationshipMilestones;
    patterns.push({
      id: 'pattern_milestones',
      pattern: `Our relationship has grown through ${milestones.length} meaningful milestone${milestones.length > 1 ? 's' : ''}`,
      frequency: milestones.length,
      examples: milestones.slice(0, 3).map(m => `${m.from} → ${m.to}`),
      category: 'relationship',
    });
  }
  
  // Mood patterns
  if (profile.humanizingState?.moodHistory?.length && profile.humanizingState.moodHistory.length >= 3) {
    const moodCounts: Record<string, number> = {};
    for (const entry of profile.humanizingState.moodHistory) {
      moodCounts[entry.mood] = (moodCounts[entry.mood] || 0) + 1;
    }
    const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];
    if (dominantMood && dominantMood[1] >= 2) {
      patterns.push({
        id: 'pattern_mood',
        pattern: `I often notice a ${dominantMood[0]} mood in our conversations`,
        frequency: dominantMood[1],
        examples: [],
        category: 'emotional',
      });
    }
  }
  
  // Financial journey progress
  if (profile.financialJourney?.milestones?.length) {
    const achievements = profile.financialJourney.milestones.filter(m => m.celebrationGiven);
    if (achievements.length > 0) {
      patterns.push({
        id: 'pattern_financial_wins',
        pattern: `We've celebrated ${achievements.length} financial milestone${achievements.length > 1 ? 's' : ''} together`,
        frequency: achievements.length,
        examples: achievements.slice(0, 3).map(m => m.title),
        category: 'achievements',
      });
    }
  }
  
  // Pending follow-ups
  if (profile.pendingFollowUps?.length) {
    const pending = profile.pendingFollowUps.filter(f => new Date(f.targetDate) >= new Date());
    if (pending.length > 0) {
      patterns.push({
        id: 'pattern_followups',
        pattern: `I have ${pending.length} thing${pending.length > 1 ? 's' : ''} I want to follow up on with you`,
        frequency: pending.length,
        examples: pending.slice(0, 3).map(f => f.topic),
        category: 'continuity',
      });
    }
  }

  return patterns;
}

/**
 * Calculate knowledge score based on profile completeness
 */
function calculateKnowledgeScore(profile: UserProfile, totalMemories: number): number {
  let score = 0;
  const maxScore = 100;

  // Base score from interactions
  const interactionScore = Math.min(30, (profile.totalConversations || 0) * 3);
  score += interactionScore;

  // Score from memories
  const memoryScore = Math.min(25, totalMemories * 2);
  score += memoryScore;

  // Score from profile completeness
  if (profile.name || profile.preferredName) score += 5;
  if (profile.familyMembers && profile.familyMembers.length > 0) score += 10;
  if (profile.goals && profile.goals.length > 0) score += 10;
  if (profile.keyMoments && profile.keyMoments.length > 0) score += 10;
  if (profile.preferredTopics && profile.preferredTopics.length > 0) score += 5;
  if (profile.lifeStage) score += 5;

  return Math.min(maxScore, score);
}

// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================

/**
 * Extract all learned memories from a user profile
 */
export function extractLearnedMemories(profile: UserProfile): LearnedMemoriesData {
  const log = getLogger();
  
  try {
    // Extract memories from all sources
    const memories: LearnedMemory[] = [
      ...extractFromLifeContext(profile),
      ...extractFromKeyMoments(profile.keyMoments || []),
      ...extractFromFamilyMembers(profile.familyMembers || []),
      ...extractFromGoals(profile),
      ...extractFromPreferences(profile),
      ...extractFromTopics(profile),
      ...extractFromEmotionalPatterns(profile.emotionalPatterns || []),
    ];

    // Sort by confidence (highest first), then by date (newest first)
    memories.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime();
    });

    // Extract behavioral patterns
    const patterns = extractBehavioralPatterns(profile);

    // Calculate knowledge score
    const knowledgeScore = calculateKnowledgeScore(profile, memories.length);

    log.debug({
      userId: profile.id,
      memoryCount: memories.length,
      patternCount: patterns.length,
      knowledgeScore,
    }, '📚 Extracted learned memories');

    return {
      memories,
      patterns,
      totalInteractions: profile.totalConversations || 0,
      knowledgeScore,
    };
  } catch (error) {
    log.error({ error, userId: profile.id }, '❌ Failed to extract learned memories');
    return {
      memories: [],
      patterns: [],
      totalInteractions: 0,
      knowledgeScore: 0,
    };
  }
}

/**
 * Delete a specific memory from user profile
 * Returns the updated profile if successful
 */
export function deleteMemoryFromProfile(
  profile: UserProfile,
  memoryId: string
): { success: boolean; profile: UserProfile; deletedType?: string } {
  const log = getLogger();
  
  // Parse the memory ID to find the source
  // IDs are formatted as: km_0, ep_0, fm_0, goal_xxx, pref_0, etc.
  
  const updated = { ...profile };
  let deletedType: string | undefined;

  // Key moments
  if (memoryId.startsWith('km_') && updated.keyMoments) {
    const idx = parseInt(memoryId.replace('km_', ''));
    if (!isNaN(idx) && idx >= 0 && idx < updated.keyMoments.length) {
      updated.keyMoments = updated.keyMoments.filter((_, i) => i !== idx);
      deletedType = 'keyMoment';
      log.info({ memoryId, type: 'keyMoment' }, '🗑️ Deleted key moment');
    } else {
      // Try matching by ID field
      const original = updated.keyMoments.length;
      updated.keyMoments = updated.keyMoments.filter(km => km.id !== memoryId);
      if (updated.keyMoments.length < original) {
        deletedType = 'keyMoment';
      }
    }
  }
  
  // Family members
  else if (memoryId.startsWith('fm_') && updated.familyMembers) {
    const idx = parseInt(memoryId.replace('fm_', ''));
    if (!isNaN(idx) && idx >= 0 && idx < updated.familyMembers.length) {
      updated.familyMembers = updated.familyMembers.filter((_, i) => i !== idx);
      deletedType = 'familyMember';
      log.info({ memoryId, type: 'familyMember' }, '🗑️ Deleted family member');
    }
  }
  
  // Goals
  else if (memoryId.startsWith('goal_') && updated.goals) {
    const goalId = memoryId.replace('goal_', '');
    const original = updated.goals.length;
    updated.goals = updated.goals.filter(g => g.id !== goalId);
    if (updated.goals.length < original) {
      deletedType = 'goal';
      log.info({ memoryId, type: 'goal' }, '🗑️ Deleted goal');
    }
  }
  
  // Preferred topics
  else if (memoryId === 'topics_preferred' && updated.preferredTopics) {
    updated.preferredTopics = [];
    deletedType = 'preferredTopics';
    log.info({ memoryId }, '🗑️ Cleared preferred topics');
  }
  
  // Avoid topics  
  else if (memoryId === 'topics_avoid' && updated.avoidTopics) {
    updated.avoidTopics = [];
    deletedType = 'avoidTopics';
    log.info({ memoryId }, '🗑️ Cleared avoid topics');
  }
  
  // Preferences - these need special handling
  else if (memoryId.startsWith('pref_')) {
    // For preferences, we can reset specific fields
    // This is more complex since preferences are derived from multiple fields
    log.info({ memoryId }, '🗑️ Preference deletion requested (limited support)');
    deletedType = 'preference';
  }
  
  // Life context facts
  else if (memoryId.startsWith('life_')) {
    // These are derived from profile fields, harder to delete individually
    log.info({ memoryId }, '🗑️ Life context deletion requested (limited support)');
    deletedType = 'lifeContext';
  }

  return {
    success: deletedType !== undefined,
    profile: updated,
    deletedType,
  };
}

// ============================================================================
// SERVICE SINGLETON
// ============================================================================

export interface LearnedMemoriesService {
  getLearnedMemories: (userId: string) => Promise<LearnedMemoriesData>;
  deleteMemory: (userId: string, memoryId: string) => Promise<{ success: boolean }>;
}

let serviceInstance: LearnedMemoriesService | null = null;

/**
 * Get the learned memories service (singleton)
 * Requires a memory store to be passed for profile operations
 */
export function createLearnedMemoriesService(
  getStore: () => Promise<import('../memory/store.js').MemoryStore>
): LearnedMemoriesService {
  return {
    async getLearnedMemories(userId: string): Promise<LearnedMemoriesData> {
      const store = await getStore();
      const profile = await store.getProfile(userId);
      
      if (!profile) {
        return {
          memories: [],
          patterns: [],
          totalInteractions: 0,
          knowledgeScore: 0,
        };
      }
      
      return extractLearnedMemories(profile);
    },
    
    async deleteMemory(userId: string, memoryId: string): Promise<{ success: boolean }> {
      const store = await getStore();
      const profile = await store.getProfile(userId);
      
      if (!profile) {
        return { success: false };
      }
      
      const result = deleteMemoryFromProfile(profile, memoryId);
      
      if (result.success) {
        await store.saveProfile(result.profile);
      }
      
      return { success: result.success };
    },
  };
}

export function getLearnedMemoriesService(): LearnedMemoriesService {
  if (!serviceInstance) {
    throw new Error('LearnedMemoriesService not initialized. Call createLearnedMemoriesService first.');
  }
  return serviceInstance;
}

export function initLearnedMemoriesService(
  getStore: () => Promise<import('../memory/store.js').MemoryStore>
): void {
  serviceInstance = createLearnedMemoriesService(getStore);
}

export default {
  extractLearnedMemories,
  deleteMemoryFromProfile,
  createLearnedMemoriesService,
  getLearnedMemoriesService,
  initLearnedMemoriesService,
};

