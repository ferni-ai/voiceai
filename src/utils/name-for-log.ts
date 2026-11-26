/**
 * A person's name for a log line: whether there is one and how long it is,
 * never the name or the words it came from (#4395). Spread it into the fields
 * (`{ userId, ...nameForLog(name) }`), or key it when a line has two
 * (`{ caller: nameForLog(a), sponsor: nameForLog(b) }`).
 *
 * @module utils/name-for-log
 */

export interface NameForLog {
  hasName: boolean;
  nameChars: number;
}

export function nameForLog(name: string | null | undefined): NameForLog {
  const nameChars = name?.trim().length ?? 0;
  return { hasName: nameChars > 0, nameChars };
}
