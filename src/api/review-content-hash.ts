/**
 * What a marketplace review decision is bound to: a hash of the manifest
 * content the reviewer judged. A submission records it; an approval is refused
 * once the item's current content no longer matches.
 *
 * @module api/review-content-hash
 */
import { createHash } from 'node:crypto';
import type { AgentManifest, ToolManifest } from '../marketplace/schema/types.js';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Hash of what a reviewer judges: the manifest without its (server-owned) review state. */
export function manifestContentHash(manifest: ToolManifest | AgentManifest): string {
  const { verification: _verification, ...content } = manifest;
  return createHash('sha256').update(stableStringify(content)).digest('hex');
}

/** Whether the submission was made for the item's current content. */
export function matchesCurrentContent(
  submission: { contentHash?: string },
  manifest: ToolManifest | AgentManifest | undefined
): boolean {
  return (
    !!manifest &&
    !!submission.contentHash &&
    submission.contentHash === manifestContentHash(manifest)
  );
}
