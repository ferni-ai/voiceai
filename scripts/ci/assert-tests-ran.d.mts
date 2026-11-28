/** The fields of vitest's JSON report this script reads. */
export interface VitestReport {
  numTotalTests: number;
  numPassedTests?: number;
  numFailedTests?: number;
  testResults: { name: string }[];
}
export function testsRan(report: Partial<VitestReport>): number;
export function reportedFiles(report: Partial<VitestReport>, root?: string): string[];
export function missingExpected(files: string[], expected: string[]): string[];
export function checkReport(
  report: unknown,
  opts?: { allowEmpty?: string; expect?: string[]; root?: string }
): { ran: number; errors: string[]; notices: string[] };
export function parseArgs(argv: string[]): {
  report: string;
  allowEmpty: string | undefined;
  expect: string[];
};
