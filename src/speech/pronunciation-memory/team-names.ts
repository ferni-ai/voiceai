/**
 * The Cartesia pronunciation dictionary (config/voice-ids.ts
 * cartesiaPronunciation spreads its id into every TTS request), built here.
 *
 * IPA is in Cartesia's notation: <<...>>, symbols split by |, from Cartesia's
 * 41-symbol General American set (docs: capability-guides/phonemes), the
 * stress mark before the stressed syllable's first consonant. There is no ʌ:
 * a stressed ə is "uh". Sounds-like spellings stay lowercase: Sonic spelled
 * capitalised syllables out as letters ("NUH-yun" as "N-U-H yun", "HOR-hay"
 * as "H-O-R hay").
 *
 * How Cartesia matches (probed 2026-10-20 with a scratch dictionary):
 * - whole words only ("Isla" did not touch "Island"), so plurals need their
 *   own entry;
 * - a possessive matches its base word ("Isla's", with ' or ’), so there are
 *   no possessive entries;
 * - case_sensitive with a capitalised key matches that spelling only.
 *
 * Beyond the team's own names, an entry is here only if it beat no entry (or
 * the old entry) by 2 or more of 6-8 takes in an ASR round trip (Gemini, a
 * proxy) on both Ferni voices: an entry for a word Sonic already says right
 * can only make it worse. No function words: a "her" entry made "her" no
 * clearer in 72 takes. No users' names: those belong to the user.
 * Evidence: ~/Documents/voiceai-evidence/pronunciation-2026-10-20/.
 *
 * @module speech/pronunciation-memory/team-names
 */

import { COMMON_DIFFICULT_NAMES } from './constants.js';

export const TEAM_NAME_PRONUNCIATIONS: Readonly<Record<string, string>> = {
  // Ferni's team
  Ferni: 'Fur-nee',
  Maya: '<<ˈ|m|aɪ|ə>>',
  Santos: '<<ˈ|s|ɑ|n|t|oʊ|s>>',
  Jordan: '<<ˈ|dʒ|ɔ|ɹ|d|ə|n>>',
  Taylor: '<<ˈ|t|eɪ|l|ɝ>>',
  Alex: '<<ˈ|æ|l|ə|k|s>>',
  Chen: '<<ˈ|tʃ|ɛ|n>>',
  Peter: '<<ˈ|p|i|t|ɝ>>',
  // Was <<ˈ|n|ʌ|j|ə|n>>: ʌ is outside Cartesia's set. Neither form, nor any
  // sounds-like tried, reliably avoided "NIGH-un" to the ASR judge; by ear TBD.
  Nayan: '<<ˈ|n|ə|j|ə|n>>',
  Patel: '<<p|ə|ˈ|t|ɛ|l>>',
  // The legends
  Henry: '<<ˈ|h|ɛ|n|ɹ|i>>',
  Caldwell: '<<ˈ|k|ɔ|l|d|w|ɛ|l>>',
  Brannigan: '<<ˈ|b|ɹ|æ|n|ə|ɡ|ə|n>>',
  Nate: '<<ˈ|n|eɪ|t>>',
  Holloway: '<<ˈ|h|ɑ|l|ə|ˌ|w|eɪ>>',
  // Places in their stories
  Vadodara: '<<v|ə|ˈ|d|oʊ|d|ə|ˌ|ɹ|ɑ>>',
  Gujarat: '<<ˌ|ɡ|u|dʒ|ə|ˈ|ɹ|ɑ|t>>',
  Pawtucket: '<<p|ə|ˈ|t|ə|k|ɪ|t>>',
};

/**
 * Names Sonic misread with no entry or with constants.ts's sounds-like one
 * (judged ok, of 6: Siobhan 3 → 6, Genevieve 2 → 6, Renee 0 → 6, Soren 1 → 6,
 * Thaler 4 → 6). Genevieve is the American JEN-uh-veev. Case-sensitive.
 */
export const NAME_IPA: Readonly<Record<string, string>> = {
  Siobhan: '<<ʃ|ɪ|ˈ|v|ɔ|n>>',
  Genevieve: '<<ˈ|dʒ|ɛ|n|ə|ˌ|v|i|v>>',
  Renee: '<<ɹ|ə|ˈ|n|eɪ>>',
  Soren: '<<ˈ|s|ɔ|ɹ|ə|n>>',
  // Richard Thaler, quoted by Peter
  Thaler: '<<ˈ|t|eɪ|l|ɝ>>',
};

/**
 * Words from the team's stories and tool replies that Sonic misread (judged
 * ok with no entry → with this one: quinceañera 1/6 → 4/6, saudade 0/6 →
 * 6/6, hygge 1/8 → 6/8, bayanihan 4/8 → 6/8, 401k 2/4 → 4/4). Matched in
 * any capitalisation (Sonic 3.6+; the model is pinned to a 3.6 snapshot).
 */
export const SPOKEN_WORD_PRONUNCIATIONS: Readonly<Record<string, string>> = {
  quinceañera: '<<ˌ|k|i|n|s|eɪ|ə|ˈ|n|j|ɛ|ɹ|ə>>',
  quinceañeras: '<<ˌ|k|i|n|s|eɪ|ə|ˈ|n|j|ɛ|ɹ|ə|z>>',
  quinceanera: '<<ˌ|k|i|n|s|eɪ|ə|ˈ|n|j|ɛ|ɹ|ə>>',
  quinceaneras: '<<ˌ|k|i|n|s|eɪ|ə|ˈ|n|j|ɛ|ɹ|ə|z>>',
  saudade: '<<s|aʊ|ˈ|d|ɑ|dʒ|i>>',
  hygge: 'hoo-guh',
  bayanihan: 'bah-yah-nee-hahn',
  // Sonic read "401k" as "four hundred and one K" in 2 of 4 takes.
  '401k': 'four oh one K',
  '401(k)': 'four oh one K',
};

export interface PronunciationDictItem {
  text: string;
  pronunciation: string;
  case_sensitive: boolean;
}

/**
 * The whole dictionary: the common hard names (sounds-like), then the IPA
 * names, the spoken words and the team, each later table winning a clash.
 */
export function pronunciationDictItems(): PronunciationDictItem[] {
  const items = new Map<string, PronunciationDictItem>();
  const add = (text: string, pronunciation: string, caseSensitive = true): void => {
    items.set(text, { text, pronunciation, case_sensitive: caseSensitive });
  };
  for (const [name, sounds] of Object.entries(COMMON_DIFFICULT_NAMES)) {
    add(name.charAt(0).toUpperCase() + name.slice(1), sounds);
  }
  for (const [text, p] of Object.entries(NAME_IPA)) add(text, p);
  for (const [text, p] of Object.entries(SPOKEN_WORD_PRONUNCIATIONS)) add(text, p, false);
  for (const [text, p] of Object.entries(TEAM_NAME_PRONUNCIATIONS)) add(text, p);
  return [...items.values()];
}
