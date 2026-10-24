export function loadTriggers(root?: string, config?: string): Promise<string[]>;
export function changedFiles(root?: string, base?: string): string[];
export function firstTrigger(
  files: readonly string[],
  triggers: readonly string[],
  root?: string
): string | undefined;
export function fullSuiteNeeded(opts?: {
  root?: string;
  base?: string;
  listFiles?: (root: string, base: string) => string[];
  readTriggers?: (root: string) => Promise<string[]>;
}): Promise<{ needed: boolean; reason: string }>;
