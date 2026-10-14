/**
 * Imported first by longmem.ts. On real calls (--cases), the memory code's
 * info logs would put what the caller said on the console (fastCapture logs
 * the names it heard on every turn), so only warnings and errors are logged.
 * The logger reads LOG_LEVEL when it first writes, so this runs before any
 * module that logs is loaded.
 */
export function quietLogsOnRealCalls(argv: readonly string[], env: NodeJS.ProcessEnv): void {
  if (argv.includes('--cases')) env.LOG_LEVEL = 'warn';
}

quietLogsOnRealCalls(process.argv.slice(2), process.env);
