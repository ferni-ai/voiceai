/**
 * Real-Time Memory Types
 *
 * Conversation shapes and minimal Firestore client types for realtime-memory.ts.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    emotion?: string;
    topics?: string[];
    durationMs?: number;
  };
  /** Monotonic per conversation, shared by both roles (see turn-sequencer.ts) */
  turnNumber?: number;
  /** Persona that spoke (assistant) or was being spoken to (user) */
  personaId?: string;
}

export interface ConversationMetadata {
  id: string;
  userId: string;
  personaId: string;
  startedAt: Date;
  endedAt?: Date;
  turnCount: number;
  summarized: boolean;
  summary?: string;
}

// Firestore types (to avoid import issues)
export interface FirestoreDB {
  collection: (path: string) => CollectionRef;
  collectionGroup: (path: string) => CollectionRef;
}

export interface CollectionRef {
  doc: (id: string) => DocumentRef;
  add: (data: unknown) => Promise<{ id: string }>;
  orderBy: (field: string, direction?: 'asc' | 'desc') => CollectionRef;
  where: (field: string, op: string, value: unknown) => CollectionRef;
  limit: (n: number) => CollectionRef;
  get: () => Promise<QuerySnapshot>;
}

export interface DocumentRef {
  collection: (path: string) => CollectionRef;
  set: (data: unknown, options?: { merge?: boolean }) => Promise<void>;
  update: (data: unknown) => Promise<void>;
  get: () => Promise<DocumentSnapshot>;
}

export interface QuerySnapshot {
  docs: DocumentSnapshot[];
  empty: boolean;
}

export interface DocumentSnapshot {
  id: string;
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  ref: DocumentRef & { parent: { parent: DocumentRef | null } };
}
