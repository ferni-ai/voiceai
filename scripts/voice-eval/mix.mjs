// Mix a converse.mjs recording into one file to listen to: the scripted user
// and every agent track (reply voice, backchannel/opening clips), each placed
// at the time it started (mix-tracks.mjs).
//
// usage: node mix.mjs <run.json> [out.wav]
import { readFileSync, writeFileSync } from 'node:fs';
import { MIX_RATE, mixParts, partsOf, wavBytes } from './mix-tracks.mjs';

const [runFile, outFile = runFile.replace(/\.json$/, '.mix.wav')] = process.argv.slice(2);
const run = JSON.parse(readFileSync(runFile, 'utf8'));
const parts = partsOf(run);
const { pcm, seconds } = mixParts(parts);
writeFileSync(outFile, wavBytes(pcm, { rate: MIX_RATE }));
console.log(`${outFile} (${seconds.toFixed(1)} s, ${parts.length} tracks)`);
