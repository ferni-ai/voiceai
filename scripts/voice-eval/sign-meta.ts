/**
 * Print a voice-eval call's job metadata, signed (run.sh job_meta).
 *
 *   EVAL_DISPATCH_SECRET=... npx tsx scripts/voice-eval/sign-meta.ts '<metadata json>'
 *
 * The secret comes from the environment, never an argument, so it stays out of
 * the process list. See eval-dispatch.ts.
 */
import { signEvalMeta } from './eval-dispatch.js';

const meta = JSON.parse(process.argv[2] ?? '{}') as Record<string, unknown>;
process.stdout.write(JSON.stringify(signEvalMeta(meta, process.env.EVAL_DISPATCH_SECRET ?? '')));
