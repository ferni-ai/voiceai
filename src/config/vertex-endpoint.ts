/**
 * Where Vertex AI requests go: the location each caller uses and the host that
 * location is served on. Every Vertex client in src/ takes its host from here.
 *
 * Caller data sent to Gemini stays in the US. Vertex's `global` endpoint "may be
 * processed in any Google Cloud location around the world"; the `us`
 * multi-region and the US regions (us-central1, ...) keep ML processing in the
 * US (https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency).
 *
 * Hosts (https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations):
 *   global        aiplatform.googleapis.com
 *   us, eu        aiplatform.us.rep.googleapis.com, aiplatform.eu.rep.googleapis.com
 *   us-central1   us-central1-aiplatform.googleapis.com (any region: <region>-...)
 *
 * @google/genai 1.34 (our direct dependency) builds `us-aiplatform.googleapis.com`
 * for location `us`, which is not the multi-region host; the 2.x copy under
 * @livekit/agents-plugin-google gets it right. Clients are handed the base URL
 * from here, so the host never depends on which SDK copy built the client.
 *
 * @module config/vertex-endpoint
 */

type Env = Readonly<Record<string, string | undefined>>;

/** Vertex multi-regions, served on their own `.rep.` hosts. */
export const VERTEX_MULTI_REGIONS: readonly string[] = ['us', 'eu'];

/** The host Vertex serves `location` on. */
export function vertexHost(location: string): string {
  if (location === 'global') return 'aiplatform.googleapis.com';
  if (VERTEX_MULTI_REGIONS.includes(location)) return `aiplatform.${location}.rep.googleapis.com`;
  return `${location}-aiplatform.googleapis.com`;
}

/** `https://<host>/`, the base URL @google/genai takes in httpOptions. */
export function vertexBaseUrl(location: string): string {
  return `https://${vertexHost(location)}/`;
}

/** True for a host vertexHost() can return: global, a multi-region, or a region. */
export function isVertexHost(host: string): boolean {
  return (
    host === vertexHost('global') ||
    VERTEX_MULTI_REGIONS.some((r) => host === vertexHost(r)) ||
    host.endsWith('-aiplatform.googleapis.com')
  );
}

/** @google/genai options for a Vertex client on `location`, with its host pinned. */
export function vertexGenAIOptions(
  project: string | undefined,
  location: string
): {
  vertexai: true;
  project: string | undefined;
  location: string;
  httpOptions: { baseUrl: string };
} {
  return { vertexai: true, project, location, httpOptions: { baseUrl: vertexBaseUrl(location) } };
}

/** Location of the shared Gemini client and the cascade LLM: GEMINI_LOCATION, default global. */
export function geminiLocation(env: Env = process.env): string {
  return env.GEMINI_LOCATION || 'global';
}

/**
 * Location for gemini-embedding-001 through the shared client. Vertex does not
 * serve it on the `us` multi-region (404, 2026-11-01) but does on us-central1,
 * so GEMINI_EMBEDDING_LOCATION can keep embeddings on a US region when
 * GEMINI_LOCATION=us. Defaults to GEMINI_LOCATION.
 */
export function geminiEmbeddingLocation(env: Env = process.env): string {
  return env.GEMINI_EMBEDDING_LOCATION || geminiLocation(env);
}
