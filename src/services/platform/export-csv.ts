/**
 * The CSV form of the data export: every stored record as a row (#3995).
 *
 * A category that is a list is one table. A category that is an object is written as
 * `key,value` lines (nested objects as dotted keys), and every list of records inside it gets
 * its own table under a `## CATEGORY / path` heading, so Conversations' sessions and each
 * Records store come out row by row instead of as a count. A table's columns are every key any
 * of its rows has, in first-seen order, so a field only a later row carries (heldByForget, a
 * newer store field) still gets a column. A list or object inside a row is kept as a JSON cell.
 * Past MAX_COLUMNS, a row's remaining fields go in one JSON cell: rows with different keys
 * would otherwise make the file grow as rows times columns, past the bytes the export budget
 * charged for the data.
 *
 * Cells follow RFC 4180: a quoted cell doubles its inner quotes and may hold commas and
 * newlines. Text that a spreadsheet would run as a formula (it starts with = + - @, a tab or a
 * carriage return) gets a leading ' (OWASP CSV injection): stored text includes what other
 * people wrote, such as contact names and email subjects.
 *
 * @module services/platform/export-csv
 */

import { forgetMarksCsvLines, type ForgetMarks } from './export-forget-marks.js';

/** Columns per table; a row's fields past these share the OTHER_FIELDS cell. */
const MAX_COLUMNS = 100;
const OTHER_FIELDS = '_otherFields';
/** What a spreadsheet would run as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** What the CSV reads from an export: the envelope, its forget marks and its categories. */
export interface CsvExport extends Partial<ForgetMarks> {
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
    ...forgetMarksCsvLines(data),
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
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const headers = keys.slice(0, MAX_COLUMNS);
  const columns = new Set(headers);
  const overflow = keys.length > MAX_COLUMNS;
  let other = OTHER_FIELDS;
  while (columns.has(other)) other = `_${other}`;
  lines.push([...headers, ...(overflow ? [other] : [])].map(field).join(','));
  for (const row of rows) {
    const cells = headers.map((h) => cell(row[h]));
    if (overflow) {
      const rest = Object.entries(row).filter(([k]) => !columns.has(k));
      cells.push(rest.length > 0 ? cell(Object.fromEntries(rest)) : '');
    }
    lines.push(cells.join(','));
  }
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

/** A header or key cell: bare unless it holds a comma, quote or newline, or reads as a formula. */
function field(name: string): string {
  return /[",\r\n]/.test(name) || FORMULA_START.test(name) ? quote(name) : name;
}

function quote(text: string): string {
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
