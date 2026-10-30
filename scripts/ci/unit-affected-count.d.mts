export const THRESHOLD: number;
export function listAffected(root?: string, base?: string): string[];
export function affectedDecision(opts?: {
  root?: string;
  base?: string;
  threshold?: number;
  list?: (root: string, base: string) => string[];
}): { count: number; sharded: boolean; reason: string };
