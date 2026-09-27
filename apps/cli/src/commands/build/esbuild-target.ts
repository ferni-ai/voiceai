/**
 * esbuild target settings for the server build (build-fast.ts).
 *
 * es2022 predates import attributes, so esbuild silently drops
 * `with { type: 'json' }` for that target. Node refuses a JSON import without
 * it ("needs an import attribute of type json"), which broke the research tools
 * and the i18n locale import at runtime. The runtime is Node 20+, which
 * supports import attributes, so keep them.
 */
export const ESBUILD_TARGET = 'es2022' as const;

export const ESBUILD_SUPPORTED: Record<string, boolean> = {
  'import-attributes': true,
};
