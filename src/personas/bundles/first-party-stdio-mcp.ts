/**
 * First-party stdio MCP servers
 *
 * A stdio MCP server is a local process our server starts. The only processes we
 * will ever start for MCP are listed here, in the repo, reviewed like any other
 * code. Nothing stored in Firestore, sent in a request, or found in a bundle's
 * mcp.json can add to this list or change what an entry runs: the loader takes
 * the command, args and env from the entry, never from the config that named it.
 *
 * Publisher-registered MCP servers must use an https endpoint.
 *
 * The list is empty today: no first-party stdio MCP server exists.
 *
 * @module personas/bundles/first-party-stdio-mcp
 */

export interface FirstPartyStdioMCPServer {
  /** Server id a bundle config uses to refer to this server */
  readonly id: string;
  /** Executable to run (fixed here, never taken from config) */
  readonly command: string;
  /** Arguments (fixed here, never taken from config) */
  readonly args: readonly string[];
  /** Extra environment for the process; when unset the MCP SDK's minimal default env is used */
  readonly env?: Readonly<Record<string, string>>;
}

export const FIRST_PARTY_STDIO_MCP_SERVERS: readonly FirstPartyStdioMCPServer[] = Object.freeze([]);

/** Look up a first-party stdio server by id; null when the id is not allowlisted. */
export function findFirstPartyStdioServer(id: string): FirstPartyStdioMCPServer | null {
  return FIRST_PARTY_STDIO_MCP_SERVERS.find((server) => server.id === id) ?? null;
}
