#!/usr/bin/env npx tsx
/**
 * Validate Qwen3-Omni checkpoint weight keys.
 * Reads model.safetensors.index.json and checks for required prefixes and optional subkeys.
 *
 * Usage:
 *   npx tsx scripts/qwen3-omni/validate-weight-keys.ts [path_to_model_dir]
 *   OMNI_MODEL_PATH=/path/to/checkpoint npx tsx scripts/qwen3-omni/validate-weight-keys.ts
 *
 * Exit: 0 if all required prefixes present; 1 otherwise.
 */

import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_INDEX = 'model.safetensors.index.json';

const REQUIRED_PREFIXES = ['thinker.', 'talker.'] as const;
const OPTIONAL_PREFIXES = ['code2wav.'] as const;

// Optional: required subkeys per prefix (e.g. thinker must have model.*)
// HF Qwen3-Omni may use talker.code_predictor.model.* instead of talker.model.input_proj
const PREFIX_SUBKEYS: Record<string, string[]> = {
  'thinker.': ['model.', 'model.embed_tokens', 'model.layers'],
  'talker.': ['model.', 'code_predictor.'], // accept model.* or code_predictor.* (HF layout)
  'code2wav.': [],
};

function main(): number {
  const modelDir = process.env.OMNI_MODEL_PATH ?? process.argv[2] ?? process.cwd();
  const indexPath = path.join(modelDir, DEFAULT_INDEX);

  if (!fs.existsSync(indexPath)) {
    console.error(`Error: ${indexPath} not found. Set OMNI_MODEL_PATH or pass model dir.`);
    return 1;
  }

  const raw = fs.readFileSync(indexPath, 'utf-8');
  let weightMap: Record<string, string>;
  try {
    const json = JSON.parse(raw);
    weightMap = json.weight_map ?? json;
    if (typeof weightMap !== 'object' || weightMap === null) {
      console.error('Error: weight_map missing or invalid in index.');
      return 1;
    }
  } catch (e) {
    console.error('Error: failed to parse index:', (e as Error).message);
    return 1;
  }

  const keys = Object.keys(weightMap);
  console.log(`Checking ${keys.length} weight keys in ${indexPath}`);

  let ok = true;

  for (const prefix of REQUIRED_PREFIXES) {
    const hasPrefix = keys.some((k) => k.startsWith(prefix));
    if (!hasPrefix) {
      console.error(`Missing required prefix: ${prefix}`);
      ok = false;
    } else {
      const subkeys = PREFIX_SUBKEYS[prefix];
      if (subkeys?.length) {
        for (const sub of subkeys) {
          const full = prefix + sub;
          const hasSub = keys.some((k) => k.startsWith(full));
          if (!hasSub) {
            console.error(`Missing expected subkey for ${prefix}: ${sub}`);
            ok = false;
          }
        }
      }
      const count = keys.filter((k) => k.startsWith(prefix)).length;
      console.log(`  ${prefix}: ${count} keys`);
    }
  }

  for (const prefix of OPTIONAL_PREFIXES) {
    const count = keys.filter((k) => k.startsWith(prefix)).length;
    if (count > 0) {
      console.log(`  ${prefix}: ${count} keys (optional)`);
    }
  }

  if (ok) {
    console.log('Weight key validation passed.');
    return 0;
  }
  console.error('Weight key validation failed.');
  return 1;
}

process.exit(main());
