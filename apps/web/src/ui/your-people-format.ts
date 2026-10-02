/**
 * Your People - pure formatting helpers. Extracted from your-people.ui.ts.
 */

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getStrengthColor(score: number): string {
  if (score >= 70) return 'var(--persona-primary, var(--color-ferni))';
  if (score >= 40) return 'var(--nayan-primary, var(--color-nayan))';
  return 'var(--color-semantic-error, var(--color-error))';
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
