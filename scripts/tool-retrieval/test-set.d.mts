export const TEST_SET: URL;
export const TEST_SET_SHA256: string;
export function loadTestSet(file?: URL | string): Array<{ query: string; tool: string }>;
