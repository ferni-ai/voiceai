/**
 * Context Builder Import Registry
 *
 * This avoids variable dynamic imports like `import(\`./${name}.js\`)`, which can
 * trigger bundler warnings and reduce static analyzability.
 *
 * IMPORTANT:
 * - This file MUST stay in sync with `BUILDER_MANIFEST` in `loader.ts`.
 * - Only modules referenced by the manifest are listed here.
 *
 * REORGANIZED: January 2026
 * Files have been moved to domain-driven folders. See docs/architecture/CONTEXT-BUILDERS-RATIONALIZATION.md
 */
export type BuilderImporter = () => Promise<unknown>;
export declare const BUILDER_IMPORTS: Record<string, BuilderImporter>;
//# sourceMappingURL=builder-imports.d.ts.map