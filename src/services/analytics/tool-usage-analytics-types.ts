/**
 * Types for tool-usage-analytics.ts: the records and reports it exposes, and the narrow
 * Firestore shape it writes through. Split out so the service has room to bind the
 * Firestore database (the file is over the 500-line ratchet).
 *
 * @module services/analytics/tool-usage-analytics-types
 */

// ============================================================================
// TYPES
// ============================================================================

export interface FirestoreDB {
  collection: (path: string) => CollectionRef;
  runTransaction: <T>(fn: (transaction: Transaction) => Promise<T>) => Promise<T>;
}

export interface CollectionRef {
  doc: (id: string) => DocumentRef;
  get: () => Promise<QuerySnapshot>;
  orderBy: (field: string, direction?: 'asc' | 'desc') => CollectionRef;
  limit: (count: number) => CollectionRef;
  where: (field: string, op: string, value: unknown) => CollectionRef;
}

export interface DocumentRef {
  get: () => Promise<DocumentSnapshot>;
  set: (data: unknown, options?: { merge?: boolean }) => Promise<void>;
  update: (data: unknown) => Promise<void>;
}

export interface DocumentSnapshot {
  exists: boolean;
  data: () => unknown | undefined;
  id: string;
}

export interface QuerySnapshot {
  docs: DocumentSnapshot[];
  empty: boolean;
}

export interface Transaction {
  get: (ref: DocumentRef) => Promise<DocumentSnapshot>;
  set: (ref: DocumentRef, data: unknown, options?: { merge?: boolean }) => void;
  update: (ref: DocumentRef, data: unknown) => void;
}

/**
 * Tool usage record for a single call
 */
export interface ToolCallRecord {
  toolId: string;
  agentId: string;
  userId: string;
  sessionId: string;
  timestamp: Date;
  latencyMs: number;
  success: boolean;
  errorType?: string;
  domain: string;
}

/**
 * Aggregated tool stats
 */
export interface ToolStats {
  toolId: string;
  domain: string;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  lastUsed: Date;
  usedByAgents: string[];
  usedByUserCount: number;
}

/**
 * Tool usage report for analysis
 */
export interface ToolUsageReport {
  timestamp: Date;
  totalTools: number;
  unusedTools: string[];
  topTools: Array<{ toolId: string; calls: number }>;
  slowTools: Array<{ toolId: string; avgLatencyMs: number }>;
  errorProneTools: Array<{ toolId: string; errorRate: number }>;
  recommendations: string[];
}
