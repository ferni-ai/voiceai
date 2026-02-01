/**
 * AGI Features Test Suite
 *
 * Test utilities for AGI-like Ferni features.
 *
 * @module tests/agi-features
 */

import { vi } from 'vitest';

export function generateTestUserId(prefix = 'test'): string {
  return `${prefix}_user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function generateTestActionId(): string {
  return `action_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMockFirestoreDb() {
  const mockData = new Map<string, Map<string, unknown>>();

  const mockDoc = (collection: string, docId: string) => ({
    get: vi.fn().mockImplementation(async () => {
      const collectionData = mockData.get(collection);
      const data = collectionData?.get(docId);
      return { exists: !!data, data: () => data, id: docId };
    }),
    set: vi.fn().mockImplementation(async (data: unknown) => {
      if (!mockData.has(collection)) mockData.set(collection, new Map());
      mockData.get(collection)!.set(docId, data);
    }),
    update: vi.fn().mockImplementation(async (updates: Record<string, unknown>) => {
      const collectionData = mockData.get(collection);
      const existing = collectionData?.get(docId) || {};
      collectionData?.set(docId, { ...existing, ...updates });
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    collection: vi.fn((subCollection: string) =>
      mockCollection(`${collection}/${docId}/${subCollection}`)
    ),
  });

  const mockCollection = (path: string) => ({
    doc: vi.fn((docId: string) => mockDoc(path, docId)),
    add: vi.fn().mockImplementation(async (data: unknown) => {
      const id = `doc_${Date.now()}`;
      if (!mockData.has(path)) mockData.set(path, new Map());
      mockData.get(path)!.set(id, data);
      return { id };
    }),
    get: vi.fn().mockImplementation(async () => {
      const collectionData = mockData.get(path);
      const docs = collectionData
        ? Array.from(collectionData.entries()).map(([id, data]) => ({
            id,
            exists: true,
            data: () => data,
          }))
        : [];
      return { docs, empty: docs.length === 0, size: docs.length };
    }),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
  });

  return {
    collection: vi.fn((path: string) => mockCollection(path)),
    _mockData: mockData,
    _clear: () => mockData.clear(),
  };
}

export function createMockActionPreview(
  overrides: Partial<{
    title: string;
    summary: string;
    details: string[];
    canUndo: boolean;
    estimatedCost: number;
    affectedParties: string[];
  }> = {}
) {
  return {
    title: 'Test Action',
    summary: 'This is a test action',
    details: ['Detail 1', 'Detail 2'],
    canUndo: true,
    ...overrides,
  };
}

export function createMockTrustProfile(userId: string, actionType: string, overrides = {}) {
  return {
    userId,
    actionType,
    category: 'messaging',
    trustLevel: 'NEW' as const,
    approvalCount: 0,
    rejectionCount: 0,
    sessionApproved: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockAuditEntry(userId: string, overrides = {}) {
  return {
    id: `audit_${Date.now()}`,
    userId,
    category: 'messaging',
    actionType: 'send_sms',
    description: 'Test audit entry',
    status: 'pending',
    requestedAt: new Date().toISOString(),
    requestedBy: 'ferni',
    approvalRequired: true,
    canUndo: false,
    ...overrides,
  };
}
