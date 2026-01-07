#!/usr/bin/env npx tsx
/**
 * Test the extractNames function
 */

import { extractNames } from '../src/services/superhuman/relationship-network.js';

const tests = [
  'I talked to Sarah yesterday',
  'My mom Betty called me',
  'John said he would help',
  'I met with my friend Mike at the coffee shop',
  'My sister Jane and my brother Tom are coming over',
  'Remember my name is Seth',
];

console.log('Testing extractNames function:\n');

for (const test of tests) {
  console.log('Input:', test);
  const result = extractNames(test);
  console.log('Output:', result.length > 0 ? result : '(no names found)');
  console.log();
}
