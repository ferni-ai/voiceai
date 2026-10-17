#!/usr/bin/env tsx
/**
 * Manage feature cohorts and per-person overrides (src/services/platform/cohort-flags.ts).
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 pnpm tsx scripts/flags/cohorts.ts <command>
 *
 *   list                                 cohorts, members and flags
 *   create <cohort> "<name>"             a new cohort, enabled, no flags
 *   add <cohort> <uid> [uid...]          add members
 *   remove <cohort> <uid> [uid...]       remove members
 *   set <cohort> FLAG=on|off [...]       set flags for a cohort
 *   unset <cohort> FLAG [...]            drop flags from a cohort
 *   enable|disable <cohort>              turn a whole cohort on or off
 *   percent <cohort> <0-100>             also a stable sample of every known caller (0: members only)
 *   override <uid> FLAG=on|off [...]     one person's own override
 *   clear <uid> FLAG [...]               drop one person's override
 *   who <uid>                            the flags a call from this person gets
 *
 * Changes apply from each member's next call. Flags are limited to
 * COHORT_FLAGS; the agent applies them only with COHORT_FLAGS=on.
 * OUTREACH_PONDERED_NOTES is read outside calls, by the API server's
 * per-minute proactive run: it applies within a minute, and only with
 * COHORT_FLAGS=on on that server.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { getFirestoreDb } from '../../src/utils/firestore-utils.js';
import {
  COHORT_FLAGS,
  missingPrerequisites,
  resolveCallerFlags,
} from '../../src/services/platform/cohort-flags.js';

const ALLOWED = new Set<string>(COHORT_FLAGS);

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const a of args) {
    const [k, v] = a.split('=');
    if (!k || !ALLOWED.has(k))
      throw new Error(`${k}: not a cohort flag (${COHORT_FLAGS.join(', ')})`);
    if (v !== 'on' && v !== 'off') throw new Error(`${a}: value must be on or off`);
    flags[k] = v;
  }
  return flags;
}

function names(args: string[]): string[] {
  for (const k of args) if (!ALLOWED.has(k)) throw new Error(`${k}: not a cohort flag`);
  return args;
}

async function main(): Promise<void> {
  const [cmd, target, ...rest] = process.argv.slice(2);
  const db = getFirestoreDb();
  if (!db) throw new Error('no Firestore (set GOOGLE_CLOUD_PROJECT)');
  const cohort = (id: string) => db.collection('feature_cohorts').doc(id);
  const override = (uid: string) => db.collection('feature_flag_overrides').doc(uid);
  const now = new Date().toISOString();
  const need = (v: string | undefined, what: string): string => {
    if (!v) throw new Error(`missing ${what}`);
    return v;
  };

  switch (cmd) {
    case 'list': {
      const snap = await db.collection('feature_cohorts').get();
      if (snap.empty) console.log('no cohorts');
      for (const d of snap.docs) {
        const x = d.data();
        console.log(`${d.id} (${x.name ?? ''}) ${x.enabled === false ? 'DISABLED' : 'enabled'}`);
        console.log(`  members: ${(x.members ?? []).join(', ') || '(none)'}`);
        if (typeof x.percent === 'number') console.log(`  sample:  ${x.percent}% of callers`);
        console.log(`  flags:   ${JSON.stringify(x.flags ?? {})}`);
      }
      return;
    }
    case 'create':
      await cohort(need(target, 'cohort')).create({
        name: rest.join(' ') || target,
        enabled: true,
        members: [],
        flags: {},
        updatedAt: now,
      });
      break;
    case 'add':
    case 'remove': {
      const uids = rest.filter(Boolean);
      if (uids.length === 0) throw new Error('missing uid');
      const op = cmd === 'add' ? FieldValue.arrayUnion(...uids) : FieldValue.arrayRemove(...uids);
      await cohort(need(target, 'cohort')).update({ members: op, updatedAt: now });
      break;
    }
    case 'set': {
      const flags = parseFlags(rest);
      const ref = cohort(need(target, 'cohort'));
      await ref.update({
        ...Object.fromEntries(Object.entries(flags).map(([k, v]) => [`flags.${k}`, v])),
        updatedAt: now,
      });
      const after = (await ref.get()).data()?.flags ?? {};
      for (const m of missingPrerequisites(after))
        console.warn(`warning: ${m} (on in this cohort or on the agent)`);
      break;
    }
    case 'percent': {
      const p = Number(rest[0]);
      if (!Number.isInteger(p) || p < 0 || p > 100)
        throw new Error('percent: a whole number 0-100');
      await cohort(need(target, 'cohort')).update({
        percent: p === 0 ? FieldValue.delete() : p,
        updatedAt: now,
      });
      break;
    }
    case 'unset':
      await cohort(need(target, 'cohort')).update({
        ...Object.fromEntries(names(rest).map((k) => [`flags.${k}`, FieldValue.delete()])),
        updatedAt: now,
      });
      break;
    case 'enable':
    case 'disable':
      await cohort(need(target, 'cohort')).update({ enabled: cmd === 'enable', updatedAt: now });
      break;
    case 'override':
      await override(need(target, 'uid')).set(
        { flags: parseFlags(rest), updatedAt: now },
        { merge: true }
      );
      break;
    case 'clear':
      await override(need(target, 'uid')).update({
        ...Object.fromEntries(names(rest).map((k) => [`flags.${k}`, FieldValue.delete()])),
        updatedAt: now,
      });
      break;
    case 'who':
      console.log(JSON.stringify(await resolveCallerFlags(need(target, 'uid')), null, 2));
      return;
    default:
      throw new Error(
        'usage: cohorts.ts list|create|add|remove|set|unset|enable|disable|percent|override|clear|who ...'
      );
  }
  console.log(`done: ${cmd} ${target}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(1);
  });
