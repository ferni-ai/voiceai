/**
 * In-memory stand-in for FirestoreVectorStore (the methods memory-control uses).
 */

export interface FakeVectorDoc {
  id: string;
  text: string;
  embedding?: number[];
  metadata: { source: string; userId?: string; [key: string]: unknown };
}

export class FakeVectorStore {
  readonly docs = new Map<string, FakeVectorDoc>();
  failWipe = false;

  add(doc: FakeVectorDoc): void {
    this.docs.set(doc.id, doc);
  }

  async getDocument(id: string): Promise<FakeVectorDoc | undefined> {
    return this.docs.get(id);
  }

  async addDocument(doc: FakeVectorDoc): Promise<void> {
    this.docs.set(doc.id, doc);
  }

  async removeDocument(id: string): Promise<boolean> {
    this.docs.delete(id);
    return true;
  }

  async removeDocumentsForUser(_userId: string, ids: readonly string[]): Promise<number> {
    let removed = 0;
    for (const id of ids) if (this.docs.delete(id)) removed++;
    return removed;
  }

  async removeAllForUser(userId: string): Promise<number> {
    if (this.failWipe) throw new Error('vector store down');
    let removed = 0;
    for (const [id, doc] of this.docs) {
      if (doc.metadata.userId === userId) {
        this.docs.delete(id);
        removed++;
      }
    }
    return removed;
  }

  async list(filter?: { userId?: string; source?: string }): Promise<FakeVectorDoc[]> {
    return [...this.docs.values()].filter(
      (d) =>
        (!filter?.userId || d.metadata.userId === filter.userId) &&
        (!filter?.source || d.metadata.source === filter.source)
    );
  }
}
