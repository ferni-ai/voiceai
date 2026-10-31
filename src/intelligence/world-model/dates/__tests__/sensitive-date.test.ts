/**
 * Which dates the hello may ask about, and who a sensitive one is about
 * (ruling 1): when unsure, sensitive. Whole words only. Fictional labels.
 */
import { describe, expect, it } from 'vitest';
import { personFromLabel, sensitiveDate } from '../sensitive-date.js';

describe('sensitiveDate', () => {
  it.each([
    ["Grandma Rose's procedure", true],
    ["Rose, 10am at St. Mary's", true], // a hospital-ish place with no lexicon word: unsure
    ["Priya's visit", false],
    ['', true],
    ['   ', true],
    ['10:30', true], // no letters
    ['scanner pickup', false], // "scan" is a whole word, "scanner" is not
    ["their sister Priya's visit", false],
    ["mom's birthday", false],
    ['dentist appointment', true],
    ["dad's MRI", true],
    ['x-ray', true],
    ['test results', true],
    ["Marcus's funeral", true],
    ['the divorce hearing', true], // isSensitiveThread
    ['moving day stuff', true], // no event noun it knows: unsure
    ['soccer games', false],
  ])('%j -> %s', (label, expected) => {
    expect(sensitiveDate(label)).toBe(expected);
  });
});

describe('personFromLabel', () => {
  it.each([
    ["Grandma Rose's procedure", 'grandma Rose'],
    ["their sister Priya's visit", 'sister Priya'],
    ["my mom's surgery", 'mom'],
    ['Dad biopsy', 'dad'],
    ['grandpa Surgery', 'grandpa'], // a capitalised topic word is never taken for a name
    ["Rose, 10am at St. Mary's", null],
    ["Marcus's appointment", null], // a bare name is no relation from the lexicon
    ['', null],
    ['stepmother', null], // whole words only
  ])('%j -> %s', (label, expected) => {
    expect(personFromLabel(label)).toBe(expected);
  });
});
