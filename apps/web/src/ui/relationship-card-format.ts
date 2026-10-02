/**
 * Relationship card - pure formatting helpers. Extracted from relationship-card.ui.ts.
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

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateStr(dateStr: string): string {
  // Handle MM-DD or YYYY-MM-DD format
  const parts = dateStr.split('-');
  let month: number, day: number;

  if (parts.length === 3) {
    month = parseInt(parts[1] ?? '1', 10) - 1;
    day = parseInt(parts[2] ?? '1', 10);
  } else {
    month = parseInt(parts[0] ?? '1', 10) - 1;
    day = parseInt(parts[1] ?? '1', 10);
  }

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${monthNames[month] ?? 'January'} ${day}`;
}

export function getMonthAbbrev(dateStr: string): string {
  // Handle MM-DD or YYYY-MM-DD format
  const parts = dateStr.split('-');
  const monthNum = parts.length === 3 ? parseInt(parts[1] ?? '1') : parseInt(parts[0] ?? '1');
  const months = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];
  return months[monthNum - 1] ?? 'JAN';
}

export function getDayNumber(dateStr: string): string {
  const parts = dateStr.split('-');
  return parts.length === 3 ? (parts[2] ?? '1') : (parts[1] ?? '1');
}
