/**
 * Pronunciation Memory Constants
 *
 * Common difficult names and detection patterns.
 *
 * @module speech/pronunciation-memory/constants
 */
// ============================================================================
// COMMON DIFFICULT NAME PRONUNCIATIONS
// ============================================================================
/**
 * Names that are commonly mispronounced.
 * Format: lowercase canonical → sounds-like
 */
export const COMMON_DIFFICULT_NAMES = {
    // ==========================================================================
    // FERNI TEAM PERSONAS - Ensure consistent pronunciation
    // ==========================================================================
    ferni: 'Fur-nee',
    nayan: 'Nuh-yahn',
    // Note: Peter, Alex, Maya, Jordan are standard English names
    // ==========================================================================
    // Irish names
    // ==========================================================================
    siobhan: 'Shi-vawn',
    niamh: 'Neev',
    caoimhe: 'Kee-va',
    aoife: 'Ee-fa',
    saoirse: 'Seer-sha',
    oisin: 'Oh-sheen',
    cillian: 'Kill-ee-an',
    sean: 'Shawn',
    sinead: 'Shi-nayd',
    ciara: 'Keer-ah',
    aisling: 'Ash-ling',
    eoin: 'Oh-in',
    tadhg: 'Tie-g',
    roisin: 'Ro-sheen',
    grainne: 'Grawn-ya',
    padraig: 'Paw-drig',
    deirdre: 'Dear-dra',
    maeve: 'Mayv',
    fionnuala: 'Fin-oo-la',
    orlaith: 'Or-la',
    blathnaid: 'Blaw-nid',
    meadhbh: 'Mayv',
    clodagh: 'Clo-da',
    eimear: 'Ee-mer',
    laoghaire: 'Lee-ry',
    ruairi: 'Roo-ree',
    // ==========================================================================
    // Scottish names
    // ==========================================================================
    alasdair: 'Al-as-der',
    eilidh: 'Ay-lee',
    mhairi: 'Var-ee',
    iain: 'Ee-an',
    // ==========================================================================
    // Welsh names
    // ==========================================================================
    rhiannon: 'Ree-an-on',
    siân: 'Shahn',
    gwyneth: 'Gwin-eth',
    llewelyn: 'Hloo-el-in',
    rhys: 'Reese',
    angharad: 'An-har-ad',
    cerys: 'Care-iss',
    carys: 'Care-iss',
    ffion: 'Fee-on',
    bethan: 'Beth-an',
    eirlys: 'Ayr-liss',
    // ==========================================================================
    // Greek names
    // ==========================================================================
    stavros: 'Stav-ros',
    phoebe: 'Fee-bee',
    chloe: 'Klo-ee',
    zoe: 'Zo-ee',
    thalia: 'Ta-lee-a',
    kyriakos: 'Keer-ya-kos',
    panagiotis: 'Pa-na-yo-tees',
    // ==========================================================================
    // French names
    // ==========================================================================
    francois: 'Fran-swah',
    margaux: 'Mar-go',
    thierry: 'Tee-air-ee',
    genevieve: 'Zhen-vee-ev',
    renee: 'Ruh-nay',
    guillaume: 'Gee-yohm',
    louis: 'Loo-ee',
    // ==========================================================================
    // German names
    // ==========================================================================
    liesel: 'Lee-zul',
    heinrich: 'Hine-rick',
    joachim: 'Yo-ah-kim',
    matthias: 'Ma-tee-as',
    // ==========================================================================
    // Scandinavian names
    // ==========================================================================
    bjorn: 'Bee-yorn',
    soren: 'Suh-ren',
    sigrid: 'See-grid',
    astrid: 'Ah-strid',
    lars: 'Lars',
    torbjorn: 'Tor-byorn',
    ingrid: 'Ing-grid',
    // ==========================================================================
    // Eastern European names
    // ==========================================================================
    wojciech: 'Voy-check',
    zbigniew: 'Zbig-nyev',
    czeslaw: 'Chess-wav',
    krzysztof: 'Kshish-tof',
    miroslav: 'Meer-o-slav',
    vladislav: 'Vlad-ee-slav',
    bronislaw: 'Bron-ee-swav',
    // ==========================================================================
    // Asian names
    // ==========================================================================
    xiaoming: 'Shao-ming',
    wei: 'Way',
    jin: 'Jin',
    yuki: 'You-kee',
    kenji: 'Ken-jee',
    haruki: 'Ha-roo-kee',
    satoshi: 'Sa-toh-shee',
    nguyen: 'Win',
    phuong: 'Fong',
    rajesh: 'Ra-jesh',
    priya: 'Pree-ya',
    ananya: 'A-nun-ya',
    ishaan: 'I-shaan',
    vihaan: 'Vee-haan',
    aarav: 'Ah-rahv',
    // ==========================================================================
    // Middle Eastern names
    // ==========================================================================
    zahra: 'Zah-ra',
    fatima: 'Fa-tee-ma',
    khalid: 'Ka-leed',
    yasmin: 'Yas-meen',
    leila: 'Lay-la',
    tariq: 'Ta-reek',
    // ==========================================================================
    // Spanish/Portuguese names
    // ==========================================================================
    joaquin: 'Wa-keen',
    jorge: 'Hor-hey',
    javier: 'Ha-vee-air',
    guillermo: 'Gee-yair-mo',
    rafael: 'Rah-fay-el',
    joao: 'Zhwow',
    // ==========================================================================
    // Other commonly mispronounced
    // ==========================================================================
    aaliyah: 'Ah-lee-yah',
    isaiah: 'Eye-zay-ah',
    liam: 'Lee-um',
    niall: 'Nye-ul',
    isla: 'Eye-lah',
    freya: 'Fray-ah',
    ailsa: 'Ale-sah',
};
// ============================================================================
// NAME INTRODUCTION PATTERNS
// ============================================================================
/**
 * Patterns to detect when a user introduces themselves with pronunciation hints
 */
export const INTRODUCTION_PATTERNS = [
    // "I'm [Name]"
    /(?:i'm|i am|my name is|call me|they call me|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    // "It's pronounced [sounds-like]"
    /(?:it's|its) pronounced\s+(?:like\s+)?["']?([^"'\n]+)["']?/i,
    // "[Name], pronounced [sounds-like]"
    /([A-Z][a-z]+),?\s+pronounced\s+(?:like\s+)?["']?([^"'\n]+)["']?/i,
    // "It rhymes with [word]"
    /(?:it|that) rhymes with\s+["']?([^"'\n]+)["']?/i,
    // "Like [sounds-like]"
    /(?:sounds? like|say it like)\s+["']?([^"'\n]+)["']?/i,
];
/**
 * Patterns to detect technical terms that might need pronunciation
 */
export const TECHNICAL_TERM_PATTERNS = [
    // Acronyms (3+ capital letters)
    /\b([A-Z]{3,})\b/g,
    // CamelCase compounds (likely technical)
    /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g,
    // Words with numbers (likely technical)
    /\b([A-Za-z]+\d+[A-Za-z]*)\b/g,
];
//# sourceMappingURL=constants.js.map