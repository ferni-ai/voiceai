/**
 * V7 Domain Label → ToolDomain Mapping
 *
 * The V7 hierarchical classifier (Stage 1) predicts domain labels from the training
 * taxonomy (e.g., "music_audio", "career_work"). These don't match the tool registry's
 * ToolDomain names (e.g., "entertainment", "career"). This module bridges that gap.
 *
 * Source of truth for V7 taxonomy: apps/ml-training/router/v7_taxonomy.py
 * Source of truth for ToolDomain: src/tools/registry/types.ts
 *
 * @module semantic-router/advanced/intelligent/v7-domain-map
 */

import type { ToolDomain } from '../../../registry/types.js';

/**
 * Maps V7 Stage 1 predicted domain labels → one or more ToolDomain values.
 *
 * Each V7 domain maps to the tool registry domains that contain the relevant tools.
 * Order matters: the first domain is the primary match, subsequent ones are related.
 */
export const V7_DOMAIN_TO_TOOL_DOMAINS: Record<string, ToolDomain[]> = {
  // --- No tool (conversation, no action needed) ---
  __no_tool__: [],

  // --- Emotional & Mental Health ---
  anger_conflict: ['anger', 'difficult-conversations'],
  body_image: ['body-relationship'],
  boundaries_selfcare: ['boundaries', 'digital-wellness', 'self-compassion'],
  crisis_safety: ['crisis'],
  difficult_conversations: ['difficult-conversations'],
  divorce: ['divorce'],
  emotional_support: ['wellness', 'presence', 'vulnerability'],
  grief_loss: ['grief'],
  recovery: ['sobriety'],
  self_compassion: ['self-compassion', 'perfectionism'],
  shame: ['shame'],

  // --- Relationships & Family ---
  family_parenting: ['family', 'new-parent', 'empty-nest', 'sandwich-generation', 'blended-family'],
  relationships_dating: ['relationships', 'dating', 'intimacy', 'infidelity', 'breakup-recovery'],
  social_connection: ['connection', 'social-skills', 'community'],

  // --- Productivity & Organization ---
  calendar: ['calendar'],
  career_work: ['career', 'burnout-recovery'],
  habits_routines: ['habits', 'routines'],
  productivity_focus: ['productivity', 'decisions', 'workflow-mastery'],
  tasks_reminders: ['productivity', 'simple-utilities'],
  timers_alarms: ['simple-utilities'],
  documents_files: ['documents', 'legal-admin'],

  // --- Life & Growth ---
  celebration_joy: ['play', 'engagement', 'life-planning'],
  learning: ['learning'],
  life_transitions: ['life-transitions', 'midlife', 'faith-transition'],
  values_purpose: ['meaning', 'life-thesis', 'wisdom'],
  wisdom_philosophy: ['wisdom', 'timeless-perspective'],

  // --- Health & Wellness ---
  food_nutrition: ['meal-planning', 'health'],
  health_fitness: ['health', 'wellness', 'chronic-conditions'],

  // --- Communication & Social ---
  communication: ['communication', 'superhuman-communication'],
  social_media: ['marketing'],
  telephony: ['telephony'],

  // --- Entertainment & Media ---
  games: ['games', 'engagement'],
  music_audio: ['entertainment', 'ambient-mode', 'vibe'],

  // --- Home & Environment ---
  home_maintenance: ['home'],
  smart_home: ['smart-home'],

  // --- Services & Utilities ---
  background_tasks: ['concierge', 'scheduling'],
  concierge: ['concierge'],
  finance_shopping: ['finance', 'research', 'commerce'],
  knowledge_search: ['information', 'local-search'],
  travel: ['travel', 'transportation'],

  // --- Memory & Recall ---
  memory_recall: ['memory', 'visual-memory'],

  // --- System ---
  developer: ['developer'],
  team_handoff: ['handoff', 'cameo', 'group-conversation'],
};

/**
 * Map a V7 domain label to ToolDomain values.
 * Returns empty array for unknown domains (safe fallback).
 */
export function mapV7DomainToToolDomains(v7Domain: string): ToolDomain[] {
  return V7_DOMAIN_TO_TOOL_DOMAINS[v7Domain] ?? [];
}

/**
 * Get all V7 domain labels that are mapped.
 */
export function getMappedV7Domains(): string[] {
  return Object.keys(V7_DOMAIN_TO_TOOL_DOMAINS);
}

/**
 * Check if a V7 domain label has a mapping.
 */
export function isV7DomainMapped(v7Domain: string): boolean {
  return v7Domain in V7_DOMAIN_TO_TOOL_DOMAINS;
}
