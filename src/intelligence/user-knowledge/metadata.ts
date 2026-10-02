/**
 * User Knowledge - metadata calculation
 *
 * Per-section completeness scores and the list of sources behind an
 * aggregated UserKnowledge. Used by aggregator.ts.
 *
 * @module intelligence/user-knowledge/metadata
 */

import type {
  IdentityKnowledge,
  LifestyleKnowledge,
  RelationshipKnowledge,
  AspirationsKnowledge,
  WellnessKnowledge,
  WorkKnowledge,
  CommunicationKnowledge,
  EmotionalKnowledge,
  PatternKnowledge,
  BoundaryKnowledge,
  SharedHistoryKnowledge,
  KnowledgeMetadata,
} from './types.js';

export function calculateMetadata(
  _userId: string,
  identity: IdentityKnowledge,
  lifestyle: LifestyleKnowledge,
  relationships: RelationshipKnowledge,
  aspirations: AspirationsKnowledge,
  wellness: WellnessKnowledge,
  work: WorkKnowledge,
  communication: CommunicationKnowledge,
  emotional: EmotionalKnowledge,
  patterns: PatternKnowledge,
  boundaries: BoundaryKnowledge,
  sharedHistory: SharedHistoryKnowledge
): KnowledgeMetadata {
  // Calculate completeness for each section
  const identityScore =
    [identity.name, identity.timezone, identity.occupation].filter(Boolean).length / 3;

  const lifestyleScore =
    [
      lifestyle.entertainment.musicLikes.length > 0,
      lifestyle.food.cuisineLikes.length > 0,
      lifestyle.travel.bucketList.length > 0,
      lifestyle.learning.goals.length > 0,
    ].filter(Boolean).length / 4;

  const relationshipsScore = Math.min(1, relationships.contacts.length / 5);

  const aspirationsScore =
    [aspirations.dreams.length > 0, aspirations.commitments.length > 0].filter(Boolean).length / 2;

  const wellnessScore =
    [
      wellness.health.allergies.length > 0,
      wellness.fitness.exercises.length > 0,
      wellness.mental.practices.length > 0,
    ].filter(Boolean).length / 3;

  const workScore = [work.role, work.company].filter(Boolean).length / 2;

  const communicationScore =
    [communication.preferredStyle, communication.socialStyle].filter(Boolean).length / 2;

  const emotionalScore =
    [emotional.trajectory, emotional.values.length > 0].filter(Boolean).length / 2;

  const patternsScore =
    [patterns.behaviors.length > 0, patterns.correlations.length > 0].filter(Boolean).length / 2;

  const boundariesScore =
    [
      boundaries.avoidTopics.length > 0,
      boundaries.ferniCommitments.length > 0,
      boundaries.sensitivities.length > 0,
    ].filter(Boolean).length / 3;

  const sharedHistoryScore = Math.min(
    1,
    (sharedHistory.insideJokes.length > 0 ? 0.5 : 0) +
      (sharedHistory.totalConversations > 10 ? 0.5 : sharedHistory.totalConversations / 20)
  );

  const overall =
    (identityScore +
      lifestyleScore +
      relationshipsScore +
      aspirationsScore +
      wellnessScore +
      workScore +
      communicationScore +
      emotionalScore +
      patternsScore +
      boundariesScore +
      sharedHistoryScore) /
    11;

  return {
    lastUpdated: new Date(),
    sources: [
      'user_profile',
      'lifestyle_preferences',
      'contacts',
      'dream_keeper',
      'commitment_keeper',
      'ferni_commitments',
      'inside_jokes',
      'open_loops',
      'coaching_patterns',
      'values_alignment',
      'emotional_trajectories',
    ],
    completeness: {
      identity: identityScore,
      lifestyle: lifestyleScore,
      relationships: relationshipsScore,
      aspirations: aspirationsScore,
      wellness: wellnessScore,
      work: workScore,
      communication: communicationScore,
      emotional: emotionalScore,
      patterns: patternsScore,
      boundaries: boundariesScore,
      sharedHistory: sharedHistoryScore,
      overall,
    },
  };
}
