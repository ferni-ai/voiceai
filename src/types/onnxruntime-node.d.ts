/**
 * Ambient module shim for `onnxruntime-node`.
 *
 * Pre-existing, unrelated to this change: the installed `onnxruntime-node`
 * package ships `dist/*.js` without matching `dist/*.d.ts` (confirmed on a
 * clean checkout of this branch's HEAD, before any Task 2 edits), so
 * `tsc --noEmit` fails with TS7016 on the dynamic
 * `import('onnxruntime-node')` in `src/utils/transformers-loader.ts`. That
 * failure blocks the pre-commit type-check gate for *any* commit, not just
 * this one.
 *
 * This is force-added despite the `src/**\/*.d.ts` gitignore rule (which
 * targets `tsc`-emitted declaration outputs; this project's `outDir` is
 * `./dist`, so no build step actually writes `.d.ts` files under `src/`).
 * Declaring the module as untyped here matches the JS the package ships;
 * call sites already narrow via the local `OnnxRuntimeModule` interface.
 */
declare module 'onnxruntime-node';
