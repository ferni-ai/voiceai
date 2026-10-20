/**
 * The gate every script that deletes production data must pass through.
 *
 * Default is a dry run. A real deletion needs BOTH `--execute` (or `--apply`) and
 * `--confirm-project=<id>` naming the project the script is about to touch,
 * so a typo, a copied command or a wrong GCLOUD_PROJECT can't delete anything.
 * `--dry-run` always wins.
 */

export type DestructiveMode = 'dry-run' | 'execute' | 'refused';

export function destructiveMode(argv: readonly string[], projectId: string): DestructiveMode {
  const execute = argv.includes('--execute') || argv.includes('--apply');
  if (argv.includes('--dry-run') || !execute) return 'dry-run';
  const confirm = argv.find((a) => a.startsWith('--confirm-project='))?.split('=')[1];
  return confirm === projectId ? 'execute' : 'refused';
}

export function refusalMessage(projectId: string): string {
  return (
    `Refusing to delete: --execute needs --confirm-project=${projectId} ` +
    `(the project this run would change). Run without --execute for a dry run.`
  );
}
