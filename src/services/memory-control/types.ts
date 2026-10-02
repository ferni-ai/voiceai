/**
 * User memory control — public types (the API contract the web page uses).
 *
 * @module services/memory-control/types
 */

import type { Result } from '../../memory/result.js';

export interface Fact {
  id: string;
  text: string;
  category: string;
  confidence: number;
  sourceConversationIds: string[];
  userEdited: boolean;
  updatedAt: string | null;
}

export interface Person {
  id: string;
  name: string;
  /** From personal insights, when known. */
  kind?: 'person' | 'pet';
  memorial?: boolean;
  relationship?: string;
  notes?: string;
  updatedAt: string | null;
}

export interface MemoryOverview {
  facts: Fact[];
  people: Person[];
  updatedAt: string | null;
}

export interface ConversationSummary {
  id: string;
  startedAt: string | null;
  endedAt?: string;
  personaId?: string;
  summary?: string;
  turnCount: number;
}

export interface ConversationTurnView {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string | null;
}

export interface ConversationPage {
  conversations: ConversationSummary[];
  nextCursor?: string;
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  turns: ConversationTurnView[];
}

export interface ConversationDeletion {
  turns: number;
  facts: number;
  embeddings: number;
  /** Items changed per registered memory domain (e.g. importantDates); 'failed' if its hook failed. */
  domains?: Record<string, number | 'failed'>;
}

export interface MemoryDeletionReport {
  /** Documents removed per subcollection. */
  collections: Record<string, number>;
  embeddings: number;
  graphRecords: number;
  /** Items removed per registered memory domain; 'failed' if its hook failed. */
  domains: Record<string, number | 'failed'>;
}

export type ExportFormat = 'json' | 'csv';

export interface MemoryExport {
  exportedAt: string;
  userId: string;
  facts: Fact[];
  people: Person[];
  conversations: Array<ConversationDetail & { summaries: Record<string, unknown>[] }>;
  summaries: Record<string, unknown>[];
  /** Data from registered memory domains, keyed by domain name (e.g. importantDates). */
  domains: Record<string, unknown>;
}

export interface MemoryExportFile {
  filename: string;
  contentType: string;
  body: string;
}

export type MemoryMatchKind = 'fact' | 'person' | 'conversation' | 'domain';

export interface MemoryMatch {
  kind: MemoryMatchKind;
  id: string;
  /** Short human-readable label used in voice confirmations. */
  label: string;
  score: number;
  /** For kind 'domain': the registered memory domain that owns this item. */
  domain?: string;
}

export type TombstoneReason = 'user_deleted' | 'voice_forget';

export type MemoryControlErrorCode = 'not_found' | 'invalid' | 'unavailable';

export interface MemoryControlError {
  code: MemoryControlErrorCode;
  message: string;
}

export type MemoryControlResult<T> = Result<T, MemoryControlError>;
