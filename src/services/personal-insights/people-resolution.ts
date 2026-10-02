/**
 * Who is who: resolves the people the user talks about from extraction
 * output, merging aliases ("Mom", "my mother", "Linda") into one person.
 *
 * Evidence that links a name to a role:
 * - an entity of type person with attributes.relationship = "mother"
 * - a relationship user -[mother]-> Linda (or Linda -[mother_of]-> user)
 * - a fact "Linda | relationship = my mom", "mom | name = Linda",
 *   "user | mother_name = Linda", "user | sister = Kate"
 *
 * A bare role ("mom") merges with the one named person holding that role.
 * For roles people can have several of (sister, friend, coworker) the merge
 * happens only when exactly one named person holds the role; otherwise
 * "your sister" stays a separate, unnamed person.
 *
 * @module services/personal-insights/people-resolution
 */

import {
  isRoleOnly,
  isSelf,
  looksLikeProperName,
  roleFromText,
  roleIsUnique,
} from './text-utils.js';
import type { UserMemorySources } from './types.js';

/** One piece of evidence about a person (an entity, fact or relationship doc). */
export interface PersonEvidence {
  readonly kind: 'entity' | 'fact' | 'relationship';
  readonly docId: string;
  readonly conversationIds: readonly string[];
  readonly at: number;
}

export interface ResolvedPerson {
  /** Node keys in this group: "n:linda", "r:mother". */
  readonly keys: readonly string[];
  /** Proper names as written ("Linda"), most frequent first. */
  readonly names: readonly string[];
  /** Surface forms seen ("Mom", "my mother", "Linda"). */
  readonly surfaces: readonly string[];
  readonly role?: string;
  readonly evidence: readonly PersonEvidence[];
  /** dynamic_facts ids whose subject is this person or that name them. */
  readonly factIds: readonly string[];
}

const NAME_PREDICATE = /\b(name|named|called|goes by)\b/i;
const ROLE_PREDICATE = /\b(relationship|relation|role|is|who|related)\b/i;
const PERSON_TYPES = new Set(['person', 'pet', 'animal', 'dog', 'cat']);

class UnionFind {
  private readonly parent = new Map<string, string>();
  add(k: string): void {
    if (!this.parent.has(k)) this.parent.set(k, k);
  }
  find(k: string): string {
    this.add(k);
    let r = k;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    this.parent.set(k, r);
    return r;
  }
  union(a: string, b: string): void {
    const [ra, rb] = [this.find(a), this.find(b)];
    if (ra !== rb) this.parent.set(rb, ra);
  }
  keys(): string[] {
    return [...this.parent.keys()];
  }
}

interface NodeInfo {
  surfaces: Map<string, number>;
  evidence: PersonEvidence[];
  factIds: Set<string>;
}

function nodeKeyFor(surface: string): string | null {
  const s = surface.trim();
  if (!s || isSelf(s)) return null;
  if (isRoleOnly(s)) {
    const role = roleFromText(s);
    return role ? `r:${role}` : null;
  }
  if (looksLikeProperName(s)) return `n:${s.toLowerCase()}`;
  return null;
}

/** Resolve the people in a user's memory. Pure: no I/O. */
export function resolvePeople(sources: UserMemorySources): ResolvedPerson[] {
  const uf = new UnionFind();
  const info = new Map<string, NodeInfo>();
  /** name node -> role -> evidence count */
  const nameRoles = new Map<string, Map<string, number>>();

  const touch = (key: string, surface: string, ev?: PersonEvidence, factId?: string): void => {
    uf.add(key);
    let n = info.get(key);
    if (!n) {
      n = { surfaces: new Map(), evidence: [], factIds: new Set() };
      info.set(key, n);
    }
    n.surfaces.set(surface.trim(), (n.surfaces.get(surface.trim()) ?? 0) + 1);
    if (ev) n.evidence.push(ev);
    if (factId) n.factIds.add(factId);
  };
  const linkRole = (nameKey: string, role: string): void => {
    uf.add(`r:${role}`);
    const roles = nameRoles.get(nameKey) ?? new Map<string, number>();
    roles.set(role, (roles.get(role) ?? 0) + 1);
    nameRoles.set(nameKey, roles);
  };

  for (const e of sources.entities) {
    if (!PERSON_TYPES.has(e.type.toLowerCase())) continue;
    const key = nodeKeyFor(e.name);
    if (!key) continue;
    const ev: PersonEvidence = {
      kind: 'entity',
      docId: e.id,
      conversationIds: e.conversationIds,
      at: e.at,
    };
    touch(key, e.name, ev);
    const roleAttr = e.attributes.relationship ?? e.attributes.relation ?? e.attributes.role;
    const role = roleAttr ? roleFromText(roleAttr) : null;
    if (role && key.startsWith('n:')) linkRole(key, role);
  }

  for (const f of sources.facts) {
    const ev: PersonEvidence = {
      kind: 'fact',
      docId: f.id,
      conversationIds: f.conversationIds,
      at: f.at,
    };
    if (isSelf(f.subject)) {
      // "user | mother_name = Linda", "user | sister = Kate"
      const role = roleFromText(f.predicate);
      if (role && looksLikeProperName(f.value)) {
        const key = `n:${f.value.trim().toLowerCase()}`;
        touch(key, f.value, ev, f.id);
        linkRole(key, role);
      }
      continue;
    }
    const key = nodeKeyFor(f.subject);
    if (!key) continue;
    touch(key, f.subject, ev, f.id);
    if (key.startsWith('r:') && NAME_PREDICATE.test(f.predicate) && looksLikeProperName(f.value)) {
      // "mom | name = Linda"
      const nameKey = `n:${f.value.trim().toLowerCase()}`;
      touch(nameKey, f.value, ev, f.id);
      linkRole(nameKey, key.slice(2));
    } else if (key.startsWith('n:') && ROLE_PREDICATE.test(f.predicate.replace(/_/g, ' '))) {
      // "Linda | relationship = my mom"
      const role = roleFromText(f.value);
      if (role) linkRole(key, role);
    }
  }

  for (const r of sources.relationships) {
    const ev: PersonEvidence = {
      kind: 'relationship',
      docId: r.id,
      conversationIds: r.conversationIds,
      at: r.at,
    };
    const [src, tgt] = [r.source.trim(), r.target.trim()];
    const other = isSelf(src) && !isSelf(tgt) ? tgt : isSelf(tgt) && !isSelf(src) ? src : null;
    if (!other) continue;
    const key = nodeKeyFor(other);
    if (!key) continue;
    touch(key, other, ev);
    const role = roleFromText(r.type);
    if (role && key.startsWith('n:')) linkRole(key, role);
  }

  // Merge names with roles: unique roles take the best-evidenced name; shared
  // roles merge only when a single named person holds them.
  const holders = new Map<string, Array<{ nameKey: string; count: number }>>();
  for (const [nameKey, roles] of nameRoles) {
    for (const [role, count] of roles) {
      const list = holders.get(role) ?? [];
      list.push({ nameKey, count });
      holders.set(role, list);
    }
  }
  for (const [role, list] of holders) {
    const roleKey = `r:${role}`;
    if (list.length === 1 || roleIsUnique(role)) {
      const best = [...list].sort((a, b) => b.count - a.count)[0];
      uf.union(best.nameKey, roleKey);
    }
  }

  // "Linda" and "Linda Smith" are the same person when the first name is unambiguous.
  const nameKeys = uf.keys().filter((k) => k.startsWith('n:'));
  const byFirst = new Map<string, string[]>();
  for (const k of nameKeys) {
    const first = k.slice(2).split(/\s+/)[0];
    byFirst.set(first, [...(byFirst.get(first) ?? []), k]);
  }
  for (const [first, keys] of byFirst) {
    const full = keys.filter((k) => k.slice(2) !== first);
    if (keys.includes(`n:${first}`) && full.length === 1) uf.union(`n:${first}`, full[0]);
  }

  // Collect groups
  const groups = new Map<string, string[]>();
  for (const k of uf.keys()) {
    const root = uf.find(k);
    groups.set(root, [...(groups.get(root) ?? []), k]);
  }

  const people: ResolvedPerson[] = [];
  for (const keys of groups.values()) {
    const surfaces = new Map<string, number>();
    const evidence: PersonEvidence[] = [];
    const factIds = new Set<string>();
    const roleCounts = new Map<string, number>();
    for (const k of keys) {
      const n = info.get(k);
      if (n) {
        for (const [s, c] of n.surfaces) surfaces.set(s, (surfaces.get(s) ?? 0) + c);
        evidence.push(...n.evidence);
        n.factIds.forEach((id) => factIds.add(id));
      }
      if (k.startsWith('r:')) roleCounts.set(k.slice(2), (roleCounts.get(k.slice(2)) ?? 0) + 5);
      for (const [role, c] of nameRoles.get(k) ?? [])
        roleCounts.set(role, (roleCounts.get(role) ?? 0) + c);
    }
    if (evidence.length === 0) continue; // a role nobody mentioned on its own
    const ranked = [...surfaces.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
    const role = [...roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    people.push({
      keys,
      names: ranked.filter(looksLikeProperName),
      surfaces: ranked,
      role,
      evidence,
      factIds: [...factIds],
    });
  }
  return people;
}
