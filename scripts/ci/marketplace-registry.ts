#!/usr/bin/env node
/**
 * Checks apps/marketplace-agents/registry.json against what its reader needs.
 *
 * The server reads the file with a bare JSON.parse and a type cast
 * (src/api/marketplace/browse-routes.ts, MarketplaceRegistryData), and serves it to
 * the web app's marketplace. A missing field, a typo'd category or a bad colour
 * shows up as a broken card, never as an error. This turns those into a red check.
 *
 * Not checked here: invented ratings and download counts (registry-route.test.ts),
 * and agent bundles, which no entry points at: they are gitignored and installed
 * from a separate repo (apps/marketplace-agents/CLAUDE.md).
 *
 *   node --experimental-strip-types scripts/ci/marketplace-registry.ts [registry.json]
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEFAULT_PATH = 'apps/marketplace-agents/registry.json';
export const LICENSES = ['free', 'premium', 'enterprise'];

const TOP_STRINGS = ['version', 'name', 'description', 'repository', 'updated_at'];
const AGENT_STRINGS = [
  'id',
  'name',
  'display_name',
  'description',
  'short_description',
  'icon',
  'version',
  'author',
];
const KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const HEX_COLOUR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function categoryProblems(categories: unknown, ids: Set<string>): string[] {
  if (!Array.isArray(categories) || categories.length === 0) {
    return ['registry.categories: missing or empty'];
  }
  const problems: string[] = [];
  for (const [i, category] of categories.entries()) {
    const where = `categories[${i}]`;
    if (!isObject(category)) {
      problems.push(`${where}: not an object`);
      continue;
    }
    for (const key of ['id', 'name', 'description']) {
      if (!isText(category[key])) problems.push(`${where}.${key}: missing or empty`);
    }
    const { id } = category;
    if (typeof id !== 'string') continue;
    if (ids.has(id)) problems.push(`${where}.id: "${id}" appears twice`);
    ids.add(id);
  }
  return problems;
}

function colourProblems(where: string, colors: unknown): string[] {
  if (!isObject(colors)) return [`${where}.colors: missing`];
  return ['primary', 'secondary']
    .filter((key) => typeof colors[key] !== 'string' || !HEX_COLOUR.test(colors[key]))
    .map((key) => `${where}.colors.${key}: "${String(colors[key])}" is not a hex colour`);
}

function idProblems(where: string, id: string, seen: Set<string>): string[] {
  const problems: string[] = [];
  if (!KEBAB_ID.test(id)) problems.push(`${where}.id: not lower-case kebab-case`);
  if (seen.has(id)) problems.push(`${where}.id: appears twice`);
  seen.add(id);
  return problems;
}

function agentProblems(
  agent: Json,
  where: string,
  categoryIds: Set<string>,
  agentIds: Set<string>
): string[] {
  const problems = AGENT_STRINGS.filter((key) => !isText(agent[key])).map(
    (key) => `${where}.${key}: missing or empty`
  );
  if (isText(agent.id)) problems.push(...idProblems(where, agent.id, agentIds));
  if (isText(agent.version) && !SEMVER.test(agent.version)) {
    problems.push(`${where}.version: "${agent.version}" is not x.y.z`);
  }
  if (typeof agent.category !== 'string' || !categoryIds.has(agent.category)) {
    problems.push(`${where}.category: "${String(agent.category)}" is not a listed category`);
  }
  const { tags } = agent;
  if (!Array.isArray(tags) || tags.length === 0 || !tags.every((tag: unknown) => isText(tag))) {
    problems.push(`${where}.tags: must be a non-empty list of words`);
  }
  if (typeof agent.license !== 'string' || !LICENSES.includes(agent.license)) {
    problems.push(`${where}.license: must be one of ${LICENSES.join(', ')}`);
  }
  return problems.concat(colourProblems(where, agent.colors));
}

/** Every problem with a parsed registry, one line each; empty when it is valid. */
export function registryProblems(registry: unknown): string[] {
  if (!isObject(registry)) return ['registry: not a JSON object'];
  const problems = TOP_STRINGS.filter((key) => !isText(registry[key])).map(
    (key) => `registry.${key}: missing or empty`
  );
  const categoryIds = new Set<string>();
  problems.push(...categoryProblems(registry.categories, categoryIds));
  if (!Array.isArray(registry.agents) || registry.agents.length === 0) {
    return problems.concat('registry.agents: missing or empty');
  }
  const agentIds = new Set<string>();
  for (const [i, agent] of registry.agents.entries()) {
    if (!isObject(agent)) {
      problems.push(`agents[${i}]: not an object`);
      continue;
    }
    const where = `agents[${i}] (${isText(agent.id) ? agent.id : 'no id'})`;
    problems.push(...agentProblems(agent, where, categoryIds, agentIds));
  }
  return problems;
}

function main(): void {
  const path = process.argv[2] ?? DEFAULT_PATH;
  let registry: unknown;
  try {
    registry = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.log(`::error file=${path}::cannot read the registry: ${String(error)}`);
    process.exit(1);
  }
  const problems = registryProblems(registry);
  for (const problem of problems) console.log(`::error file=${path}::${problem}`);
  if (problems.length > 0) process.exit(1);
  const count = (registry as { agents: unknown[] }).agents.length;
  console.log(`${path}: ${count} agents, all fields present and valid`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
