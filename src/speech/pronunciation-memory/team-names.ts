/**
 * How the team's own names (and the places in their stories) are said, for
 * the Cartesia pronunciation dictionary (config/voice-ids.ts
 * cartesiaPronunciation spreads its id into every TTS request).
 *
 * The live dictionary ("Ferni names", built from COMMON_DIFFICULT_NAMES) had
 * only Ferni and Nayan of the team (sonic-capabilities audit, 2026-10-12): so
 * "Maya" could come out MAY-uh on one reply and MY-uh on the next, and the
 * legends' surnames and Nayan's Vadodara were left to the model's guess. IPA,
 * in Cartesia's notation (<<...>>, phonemes split by |, stress mark before the
 * stressed syllable's first consonant), from Cartesia's General American
 * phoneme set; Nayan's is the entry already live.
 *
 * Case-sensitive, like the rest of the dictionary: these are proper names.
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
  Nayan: '<<ˈ|n|ʌ|j|ə|n>>',
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

export interface PronunciationDictItem {
  text: string;
  pronunciation: string;
  case_sensitive: boolean;
}

/** The whole dictionary: the common hard names (sounds-like), then the team's (IPA, which wins). */
export function pronunciationDictItems(): PronunciationDictItem[] {
  const items = new Map<string, PronunciationDictItem>();
  for (const [name, sounds] of Object.entries(COMMON_DIFFICULT_NAMES)) {
    const text = name.charAt(0).toUpperCase() + name.slice(1);
    items.set(text, { text, pronunciation: sounds, case_sensitive: true });
  }
  for (const [text, ipa] of Object.entries(TEAM_NAME_PRONUNCIATIONS)) {
    items.set(text, { text, pronunciation: ipa, case_sensitive: true });
  }
  return [...items.values()];
}
