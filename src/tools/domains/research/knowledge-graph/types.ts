/**
 * Knowledge Graph Types
 *
 * Defines the structure of Peter's financial knowledge graph.
 * This maps concepts, their relationships, and optimal explanations.
 *
 * @module tools/domains/research/knowledge-graph/types
 */

// ============================================================================
// KNOWLEDGE NODES
// ============================================================================

export type NodeType = 'concept' | 'strategy' | 'metric' | 'event' | 'person' | 'product' | 'rule';
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type ExplanationStyle = 'simple' | 'technical' | 'analogy' | 'story' | 'data';

export interface KnowledgeNode {
  id: string;
  type: NodeType;
  name: string;
  aliases: string[];               // Other ways to refer to this
  
  // Core content
  content: {
    definition: string;            // Formal definition
    simpleExplanation: string;     // ELI5 version
    technicalExplanation: string;  // Expert version
    whyItMatters: string;          // Why should user care?
  };
  
  // Analogies that work
  analogies: Analogy[];
  
  // Common misconceptions
  misconceptions: Misconception[];
  
  // Related questions
  typicalQuestions: string[];
  
  // Learning metadata
  difficulty: DifficultyLevel;
  prerequisites: string[];         // Node IDs that should be understood first
  
  // Effectiveness tracking
  stats: {
    timesExplained: number;
    comprehensionRate: number;     // 0-1, based on follow-up behavior
    bestExplanationStyle: ExplanationStyle;
    bestAnalogy?: string;
  };
  
  // Metadata
  category: string;
  tags: string[];
  lastUpdated: Date;
}

export interface Analogy {
  id: string;
  type: 'sports' | 'cooking' | 'building' | 'gardening' | 'travel' | 'everyday' | 'tech' | 'medical';
  text: string;
  
  // Who it works for
  effectiveFor: {
    experienceLevels: DifficultyLevel[];
    ageGroups?: string[];
  };
  
  // Effectiveness
  effectiveness: {
    timesUsed: number;
    successRate: number;           // Did they understand after?
  };
}

export interface Misconception {
  belief: string;                  // What people wrongly believe
  reality: string;                 // The truth
  whyCommon: string;               // Why this misconception exists
  frequency: number;               // How often we see this (0-1)
  correction: string;              // Best way to correct it
}

// ============================================================================
// KNOWLEDGE EDGES
// ============================================================================

export type RelationshipType = 
  | 'prerequisite'    // Must understand A before B
  | 'related'         // A and B are related concepts
  | 'opposite'        // A is the opposite of B
  | 'example_of'      // A is an example of B
  | 'part_of'         // A is part of B
  | 'leads_to'        // Understanding A leads to understanding B
  | 'applies_to'      // A applies to B (strategy to situation)
  | 'contrasts_with'; // A contrasts with B

export interface KnowledgeEdge {
  id: string;
  from: string;                    // Node ID
  to: string;                      // Node ID
  relationship: RelationshipType;
  strength: number;                // 0-1, how strong is this relationship?
  bidirectional: boolean;          // Does the relationship go both ways?
  description?: string;            // Optional description
}

// ============================================================================
// LEARNING PATHS
// ============================================================================

export interface LearningPath {
  id: string;
  name: string;
  description: string;
  targetAudience: string;
  
  // Path structure
  steps: LearningStep[];
  
  // Estimated time
  estimatedMinutes: number;
  
  // Goal
  outcomes: string[];              // What will they understand?
  
  // Tracking
  stats: {
    timesStarted: number;
    completionRate: number;
    averageRating: number;
  };
}

export interface LearningStep {
  order: number;
  nodeId: string;                  // Knowledge node to learn
  focusPoints: string[];           // What to emphasize
  exercises?: string[];            // Optional exercises/questions
  estimatedMinutes: number;
  checkpointQuestion?: string;     // Question to verify understanding
}

// ============================================================================
// EXPLANATION TEMPLATES
// ============================================================================

export interface ExplanationTemplate {
  id: string;
  conceptId: string;               // Which concept this explains
  style: ExplanationStyle;
  
  // The explanation
  template: {
    opening: string;               // How to start
    core: string;                  // Main explanation
    example: string;               // Concrete example
    closing: string;               // How to wrap up
    callToAction?: string;         // What they should do next
  };
  
  // Variants for different audiences
  variants: {
    beginner?: string;
    intermediate?: string;
    advanced?: string;
  };
  
  // Effectiveness
  effectiveness: {
    timesUsed: number;
    comprehensionRate: number;
    averageFollowUpQuestions: number;
    userSatisfaction: number;
  };
}

// ============================================================================
// GRAPH OPERATIONS
// ============================================================================

export interface GraphQuery {
  startNode?: string;
  targetNode?: string;
  relationshipTypes?: RelationshipType[];
  maxDepth?: number;
  includePrerequisites?: boolean;
}

export interface PathResult {
  path: string[];                  // Node IDs in order
  totalDistance: number;
  relationships: RelationshipType[];
}

export interface RecommendedConcept {
  nodeId: string;
  name: string;
  reason: string;
  relevanceScore: number;
  prerequisitesMet: boolean;
}

