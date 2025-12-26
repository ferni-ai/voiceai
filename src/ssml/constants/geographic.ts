/**
 * Geographic Place Name Pronunciations
 * Western US, Native American, and other commonly mispronounced places
 *
 * @module ssml/constants/geographic
 */

import type { PronunciationEntry } from './types.js';

export const GEOGRAPHIC_PRONUNCIATIONS: PronunciationEntry[] = [
  // -------------------------------------------------------------------------
  // Wyoming Place Names (Ferni's home)
  // -------------------------------------------------------------------------
  { pattern: /\bTetons\b/g, replacement: 'TEE-tonz', description: 'Grand Teton mountains (plural)' },
  { pattern: /\bTeton\b/g, replacement: 'TEE-ton', description: 'Grand Teton mountain (singular)' },
  { pattern: /\bGrand\s+Tetons\b/gi, replacement: 'Grand TEE-tonz', description: 'Grand Tetons (plural)' },
  { pattern: /\bGrand\s+Teton\b/gi, replacement: 'Grand TEE-ton', description: 'Grand Teton (singular)' },
  { pattern: /\bCheyenne\b/g, replacement: 'shy-ANN', description: 'Wyoming capital' },
  { pattern: /\bLaramie\b/g, replacement: 'LAIR-uh-mee', description: 'Wyoming city' },
  { pattern: /\bShoshone\b/gi, replacement: 'sho-SHO-nee', description: 'Native nation/places' },
  { pattern: /\bDubois\b/g, replacement: 'doo-BOYZ', description: 'Wyoming town (not French)' },
  { pattern: /\bPopo\s+Agie\b/gi, replacement: 'po-PO-zhuh', description: 'Wyoming river' },
  { pattern: /\bAbsaroka\b/gi, replacement: 'ab-SORE-kuh', description: 'Mountain range' },
  { pattern: /\bBighorn\b/gi, replacement: 'BIG-horn', description: 'Bighorn mountains/river' },
  { pattern: /\bThermopolis\b/gi, replacement: 'ther-MOP-oh-lis', description: 'Wyoming town' },
  { pattern: /\bCody\b/g, replacement: 'KO-dee', description: 'Wyoming town' },
  { pattern: /\bJackson\s+Hole\b/gi, replacement: 'JACK-son hole', description: 'Wyoming valley' },

  // -------------------------------------------------------------------------
  // Idaho & Pacific Northwest
  // -------------------------------------------------------------------------
  { pattern: /\bCoeur\s+d['']?Alene\b/gi, replacement: 'core-duh-LANE', description: 'Idaho city' },
  { pattern: /\bBoise\b/g, replacement: 'BOY-see', description: 'Idaho capital' },
  { pattern: /\bSequoia\b/gi, replacement: 'seh-KWOY-uh', description: 'Trees/park' },
  { pattern: /\bYosemite\b/gi, replacement: 'yo-SEM-ih-tee', description: 'National park' },
  { pattern: /\bWillamette\b/gi, replacement: 'wih-LAM-et', description: 'Oregon valley/river' },
  { pattern: /\bSpokan[e]?\b/gi, replacement: 'spo-CAN', description: 'Washington city' },
  { pattern: /\bPuyallup\b/gi, replacement: 'pyoo-AL-up', description: 'Washington city' },
  { pattern: /\bCascade[s]?\b/gi, replacement: 'kass-KADE', description: 'Mountain range' },
  { pattern: /\bWenatchee\b/gi, replacement: 'wuh-NATCH-ee', description: 'Washington city' },
  { pattern: /\bSnoqualmie\b/gi, replacement: 'sno-KWAL-mee', description: 'Washington falls/pass' },
  { pattern: /\bSequim\b/gi, replacement: 'SKWIM', description: 'Washington city' },
  { pattern: /\bKootenai\b/gi, replacement: 'KOOT-nee', description: 'Idaho/Montana region' },

  // -------------------------------------------------------------------------
  // Colorado Place Names
  // -------------------------------------------------------------------------
  { pattern: /\bBuena\s+Vista\b/gi, replacement: 'BYOO-nuh VIS-tuh', description: 'Colorado town' },
  { pattern: /\bOuray\b/gi, replacement: 'yoo-RAY', description: 'Colorado town' },
  { pattern: /\bSalida\b/gi, replacement: 'suh-LYE-duh', description: 'Colorado town' },
  { pattern: /\bGunnison\b/gi, replacement: 'GUN-ih-son', description: 'Colorado town/river' },
  { pattern: /\bSangre\s+de\s+Cristo\b/gi, replacement: 'SANG-gruh duh KRIS-toh', description: 'Mountain range' },
  { pattern: /\bAlamosa\b/gi, replacement: 'AL-uh-MO-suh', description: 'Colorado town' },
  { pattern: /\bPueblo\b/gi, replacement: 'PWEB-lo', description: 'Colorado city' },
  { pattern: /\bSaguache\b/gi, replacement: 'suh-WATCH', description: 'Colorado county' },
  { pattern: /\bLimon\b/g, replacement: 'ly-MONE', description: 'Colorado town' },

  // -------------------------------------------------------------------------
  // Montana Place Names
  // -------------------------------------------------------------------------
  { pattern: /\bMissoula\b/gi, replacement: 'mih-ZOO-luh', description: 'Montana city' },
  { pattern: /\bBozeman\b/gi, replacement: 'BOZE-man', description: 'Montana city' },
  { pattern: /\bBillings\b/g, replacement: 'BIL-ingz', description: 'Montana city' },
  { pattern: /\bHelena\b/g, replacement: 'HEL-ih-nuh', description: 'Montana capital' },
  { pattern: /\bButte\b/g, replacement: 'byoot', description: 'Montana city' },
  { pattern: /\bGlacier\b/gi, replacement: 'GLAY-sher', description: 'National park' },
  { pattern: /\bFlathead\b/gi, replacement: 'FLAT-head', description: 'Montana lake/valley' },

  // -------------------------------------------------------------------------
  // Arizona/New Mexico Place Names
  // -------------------------------------------------------------------------
  { pattern: /\bTucson\b/gi, replacement: 'TOO-sawn', description: 'Arizona city' },
  { pattern: /\bPrescott\b/g, replacement: 'PRESS-kit', description: 'Arizona city' },
  { pattern: /\bTempe\b/g, replacement: 'tem-PEE', description: 'Arizona city' },
  { pattern: /\bSedona\b/gi, replacement: 'seh-DOH-nuh', description: 'Arizona town' },
  { pattern: /\bSaguaro\b/gi, replacement: 'suh-WAHR-oh', description: 'Cactus/park' },
  { pattern: /\bMogollon\b/gi, replacement: 'MUH-gee-own', description: 'Arizona rim' },
  { pattern: /\bAlbuquerque\b/gi, replacement: 'AL-buh-kur-kee', description: 'New Mexico city' },
  { pattern: /\bSanta\s+Fe\b/gi, replacement: 'SAN-tuh fay', description: 'New Mexico capital' },
  { pattern: /\bTaos\b/gi, replacement: 'towse', description: 'New Mexico town' },
  { pattern: /\bRio\s+Grande\b/gi, replacement: 'REE-oh GRAND', description: 'River' },
  { pattern: /\bCarlsbad\b/gi, replacement: 'KARLZ-bad', description: 'New Mexico caves/city' },

  // -------------------------------------------------------------------------
  // Nevada Place Names
  // -------------------------------------------------------------------------
  { pattern: /\bNevada\b/gi, replacement: 'neh-VAD-uh', description: 'State (not neh-VAH-duh)' },
  { pattern: /\bReno\b/g, replacement: 'REE-no', description: 'Nevada city' },
  { pattern: /\bTahoe\b/gi, replacement: 'TAH-ho', description: 'Lake Tahoe' },
  { pattern: /\bTonopah\b/gi, replacement: 'TOH-nuh-pah', description: 'Nevada town' },
  { pattern: /\bEly\b/g, replacement: 'EE-lee', description: 'Nevada town' },

  // -------------------------------------------------------------------------
  // Utah Place Names
  // -------------------------------------------------------------------------
  { pattern: /\bTooele\b/gi, replacement: 'too-WILL-uh', description: 'Utah county/city' },
  { pattern: /\bDuchesne\b/gi, replacement: 'doo-SHAYN', description: 'Utah county/city' },
  { pattern: /\bMoab\b/g, replacement: 'MO-ab', description: 'Utah city near Arches' },
  { pattern: /\bUinta[h]?\b/gi, replacement: 'yoo-IN-tuh', description: 'Utah mountains/county' },
  { pattern: /\bWasatch\b/gi, replacement: 'WAH-satch', description: 'Utah mountain range' },
  { pattern: /\bHurricane\b/g, replacement: 'HER-ih-kun', description: 'Utah city pronunciation' },
  { pattern: /\bNephi\b/g, replacement: 'NEE-fye', description: 'Utah city' },
  { pattern: /\bLehi\b/g, replacement: 'LEE-high', description: 'Utah city' },
  { pattern: /\bKanab\b/gi, replacement: 'kuh-NAB', description: 'Utah city' },
  { pattern: /\bWeber\b/g, replacement: 'WEE-ber', description: 'Utah county/river' },
  { pattern: /\bEscalante\b/gi, replacement: 'es-kuh-LAN-tee', description: 'Utah town/canyon' },
  { pattern: /\bHeber\b/g, replacement: 'HEE-ber', description: 'Utah city' },
  { pattern: /\bPanguitch\b/gi, replacement: 'PAN-gwich', description: 'Utah town' },
  { pattern: /\bParowan\b/gi, replacement: 'puh-ROW-an', description: 'Utah town' },
  { pattern: /\bSanpete\b/gi, replacement: 'SAN-peet', description: 'Utah county' },
  { pattern: /\bSevier\b/gi, replacement: 'suh-VEER', description: 'Utah county/river' },
  { pattern: /\bTimpanogos\b/gi, replacement: 'tim-puh-NO-gus', description: 'Utah mountain' },
  { pattern: /\bBonneville\b/gi, replacement: 'BON-uh-vil', description: 'Utah salt flats' },
  { pattern: /\bZion\b/g, replacement: 'ZY-un', description: 'Utah national park' },
  { pattern: /\bOquirrh\b/gi, replacement: 'OH-ker', description: 'Utah mountains' },

  // -------------------------------------------------------------------------
  // Native American Place Names
  // -------------------------------------------------------------------------
  { pattern: /\bMissouri\b/gi, replacement: 'mih-ZUR-ee', description: 'River/state' },
  { pattern: /\bMississippi\b/gi, replacement: 'miss-ih-SIP-ee', description: 'River/state' },
  { pattern: /\bChattanooga\b/gi, replacement: 'chat-uh-NOO-guh', description: 'Tennessee city' },
  { pattern: /\bTallahassee\b/gi, replacement: 'tal-uh-HAS-ee', description: 'Florida capital' },
  { pattern: /\bOkeechobee\b/gi, replacement: 'oh-kee-CHO-bee', description: 'Florida lake' },
  { pattern: /\bChesapeake\b/gi, replacement: 'CHESS-uh-peek', description: 'Virginia bay' },
  { pattern: /\bPotomac\b/gi, replacement: 'puh-TOH-muk', description: 'Eastern river' },
  { pattern: /\bShenandoah\b/gi, replacement: 'shen-un-DO-uh', description: 'Virginia valley' },
  { pattern: /\bAppalachian\b/gi, replacement: 'ap-uh-LATCH-un', description: 'Eastern mountains' },
  { pattern: /\bAppalachia\b/gi, replacement: 'ap-uh-LATCH-uh', description: 'Eastern region' },
];

export const NATIVE_AMERICAN_PRONUNCIATIONS: PronunciationEntry[] = [
  // -------------------------------------------------------------------------
  // Native Nations/Peoples
  // -------------------------------------------------------------------------
  { pattern: /\bNavajo\b/gi, replacement: 'NAV-uh-ho', description: 'Diné people' },
  { pattern: /\bDin[eé]\b/gi, replacement: 'dih-NEH', description: 'Navajo self-name' },
  { pattern: /\bHopi\b/gi, replacement: 'HO-pee', description: 'Arizona pueblo people' },
  { pattern: /\bApache\b/gi, replacement: 'uh-PATCH-ee', description: 'Southwest peoples' },
  { pattern: /\bUte\b/gi, replacement: 'YOOT', description: 'Colorado/Utah people' },
  { pattern: /\bPaiute\b/gi, replacement: 'PIE-yoot', description: 'Great Basin people' },
  { pattern: /\bArapaho\b/gi, replacement: 'uh-RAP-uh-ho', description: 'Plains people' },
  { pattern: /\bCheyenne\b(?=.*tribe|.*nation|.*people)/gi, replacement: 'shy-ANN', description: 'Plains nation' },
  { pattern: /\bCrow\b(?=.*tribe|.*nation|.*people)/gi, replacement: 'Crow', description: 'Montana people' },
  { pattern: /\bBlackfeet\b/gi, replacement: 'BLACK-feet', description: 'Montana/Alberta people' },
  { pattern: /\bNez\s+Perc[eé]\b/gi, replacement: 'NEZ perss', description: 'Idaho/Oregon people' },
  { pattern: /\bYakama\b/gi, replacement: 'YAK-uh-muh', description: 'Washington people' },
  { pattern: /\bSalish\b/gi, replacement: 'SAY-lish', description: 'Pacific Northwest peoples' },
  { pattern: /\bLakota\b/gi, replacement: 'luh-KO-tuh', description: 'Sioux people' },
  { pattern: /\bDakota\b(?=.*tribe|.*sioux|.*people)/gi, replacement: 'duh-KO-tuh', description: 'Sioux people' },
  { pattern: /\bOjibwe\b/gi, replacement: 'oh-JIB-way', description: 'Great Lakes people' },
  { pattern: /\bAnishinaabe\b/gi, replacement: 'ah-nish-ih-NAH-bay', description: 'Ojibwe self-name' },
  { pattern: /\bCherokee\b/gi, replacement: 'CHAIR-oh-kee', description: 'Southeast/Oklahoma nation' },
  { pattern: /\bZuni\b/gi, replacement: 'ZOO-nee', description: 'New Mexico pueblo' },
  { pattern: /\bTaos\s+Pueblo\b/gi, replacement: 'TOUSE PWEB-lo', description: 'New Mexico pueblo' },

  // -------------------------------------------------------------------------
  // Native American Spiritual/Cultural Terms
  // -------------------------------------------------------------------------
  { pattern: /\bpowwow\b/gi, replacement: 'POW-wow', description: 'Gathering/ceremony' },
  { pattern: /\bhogan\b/gi, replacement: 'HO-gahn', description: 'Navajo dwelling' },
  { pattern: /\bkiva\b/gi, replacement: 'KEE-vuh', description: 'Pueblo ceremonial room' },
  { pattern: /\bkachina\b/gi, replacement: 'kuh-CHEE-nuh', description: 'Hopi spirit being' },
  { pattern: /\btipi\b/gi, replacement: 'TEE-pee', description: 'Plains dwelling' },
  { pattern: /\bteepee\b/gi, replacement: 'TEE-pee', description: 'Plains dwelling' },
  { pattern: /\bsweat\s+lodge\b/gi, replacement: 'swet loj', description: 'Purification ceremony' },
  { pattern: /\bpetroglyph\b/gi, replacement: 'PET-ro-glif', description: 'Rock carving' },
  { pattern: /\bpetroglyphs\b/gi, replacement: 'PET-ro-glifs', description: 'Rock carvings' },
  { pattern: /\bpictograph\b/gi, replacement: 'PIK-tuh-graf', description: 'Rock painting' },
];

