/**
 * The CSV form of the data export: every stored record as a row (#3995).
 *
 * A category that is a list is one table. A category that is an object is written as
 * `key,value` lines (nested objects as dotted keys), and every list of records inside it gets
 * its own table under a `## CATEGORY / path` heading, so Conversations' sessions and each
 * Records store come out row by row instead of as a count. A table's columns are every key any
 * of its rows has, in first-seen order, so a field only a later row carries (heldByForget, a
 * newer store field) still gets a column. A list or object inside a row is kept as a JSON cell.
 *
 * Cells follow RFC 4180: a quoted cell doubles its inner quotes and may hold commas and
 * newlines.
 *
 * @module services/platform/export-csv
 */

/** What the CSV reads from an export: the envelope and its categories. */
export interface CsvExport {
  exportedAt: string;
  userId: string;
  version: string;
  categories: Record<string, unknown>;
}

type Row = Record<string, unknown>;

/** The whole export as one CSV file. */
export function formatExportCsv(data: CsvExport): string {
  const lines = [
    '# Ferni Data Export',
    `# Exported: ${data.exportedAt}`,
    `# User: ${data.userId}`,
    `# Version: ${data.version}`,
    '',
  ];

  for (const [category, content] of Object.entries(data.categories)) {
    const heading = `## ${category.toUpperCase()}`;
    const nested: Array<[path: string, rows: Row[]]> = [];
    lines.push(heading, '');
    if (Array.isArray(content) && content.every(isRow)) {
      writeTable(lines, content);
    } else if (isRow(content)) {
      writeFields(lines, nested, content, '');
    } else if (content !== null && content !== undefined) {
      lines.push(cell(content));
    }
    lines.push('');
    for (const [path, rows] of nested) {
      lines.push(`${heading} / ${path.replace(/[\r\n]+/g, ' ')}`, '');
      writeTable(lines, rows);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/** `key,value` lines for an object's fields; its lists of records go to `nested` as tables. */
function writeFields(
  lines: string[],
  nested: Array<[string, Row[]]>,
  obj: Row,
  prefix: string
): void {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value) && value.length > 0 && value.every(isRow)) {
      nested.push([path, value]);
    } else if (isRow(value)) {
      writeFields(lines, nested, value, path);
    } else if (value !== undefined) {
      lines.push(`${field(path)},${value === null ? 'null' : cell(value)}`);
    }
  }
}

/** A header row of every key the rows have, in first-seen order, then one line per row. */
function writeTable(lines: string[], rows: readonly Row[]): void {
  if (rows.length === 0) return;
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  lines.push(headers.map(field).join(','));
  for (const row of rows) lines.push(headers.map((h) => cell(row[h])).join(','));
}

/** A plain object that becomes a row or a group of fields (a Date is a value, not a record). */
function isRow(value: unknown): value is Row {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
  );
}

/** A value cell: text, dates and JSON quoted, numbers and booleans bare, missing empty. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return quote(value);
  if (value instanceof Date) return quote(value.toISOString());
  if (typeof value === 'object') {
    return quote(JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? `${v}` : v)));
  }
  return String(value);
}

/** A header or key cell: bare unless it holds a comma, quote or newline. */
function field(name: string): string {
  return /[",\r\n]/.test(name) ? quote(name) : name;
}

function quote(text: string): string {
  return `"${text.replace(/"/g, '""')}"`;
}
