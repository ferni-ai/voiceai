/**
 * Stage Direction Sanitization Constants
 * Keywords and patterns for removing LLM-generated stage directions from speech
 *
 * These are words/phrases that LLMs often emit as "stage directions" that should
 * NOT be spoken aloud. The sanitizer removes these to prevent awkward TTS output
 * like "asterisk chuckles asterisk".
 *
 * @module ssml/constants/stage-directions
 */

/**
 * Comprehensive list of stage direction keywords to remove from TTS output
 * 
 * Categories:
 * - Breathing/physical sounds
 * - Facial expressions
 * - Head/body movements
 * - Mental actions (not spoken)
 * - Manner/tone adverbs (describe HOW, not WHAT to say)
 * - Tone/attitude descriptors
 * - Emotions as stage directions
 * - Energy/state descriptors
 * - Voice descriptions
 * - Miscellaneous stage cues
 */
export const STAGE_DIRECTION_KEYWORDS: string[] = [
  // -------------------------------------------------------------------------
  // Breathing & Physical Sounds
  // -------------------------------------------------------------------------
  'sighs', 'sigh', 'sighing', 'sighed',
  'exhales', 'exhale', 'exhaling', 'exhaled',
  'inhales', 'inhale', 'inhaling', 'inhaled',
  'breathes', 'breath', 'breathing',
  'deep breath', 'takes a breath', 'takes breath',
  'clears throat', 'clearing throat', 'throat clear',
  'coughs', 'cough', 'coughing', 'coughed',
  'sniffs', 'sniff', 'sniffing', 'sniffed',
  'sneezes', 'sneeze', 'sneezing',
  'yawns', 'yawn', 'yawning', 'yawned',
  'groans', 'groan', 'groaning', 'groaned',
  'grunts', 'grunt', 'grunting',
  'murmurs', 'murmur', 'murmuring',
  'hums', 'hum', 'humming', 'hummed',
  'whistles', 'whistle', 'whistling',
  'gasps', 'gasp', 'gasping', 'gasped',
  
  // -------------------------------------------------------------------------
  // Facial Expressions
  // -------------------------------------------------------------------------
  'smiles', 'smile', 'smiling', 'smiled',
  'grins', 'grin', 'grinning', 'grinned',
  'beams', 'beam', 'beaming', 'beamed',
  'smirks', 'smirk', 'smirking', 'smirked',
  'frowns', 'frown', 'frowning', 'frowned',
  'grimaces', 'grimace', 'grimacing',
  'scowls', 'scowl', 'scowling',
  'pouts', 'pout', 'pouting', 'pouted',
  'winks', 'wink', 'winking', 'winked',
  'blinks', 'blink', 'blinking', 'blinked',
  'raises eyebrow', 'raises eyebrows', 'raised eyebrow',
  'eyebrow raise', 'eyebrows raised',
  'rolls eyes', 'eye roll', 'rolling eyes',
  'squints', 'squint', 'squinting',
  'widens eyes', 'eyes widen', 'eyes widening',
  'narrows eyes', 'eyes narrow', 'eyes narrowing',
  'tears up', 'tearing up', 'teary', 'teary-eyed',
  'eyes glisten', 'glistening eyes',
  'purses lips', 'pursing lips', 'lips pursed',
  'bites lip', 'biting lip', 'lip bite',
  'licks lips', 'licking lips',
  
  // -------------------------------------------------------------------------
  // Head & Body Movements
  // -------------------------------------------------------------------------
  'nods', 'nod', 'nodding', 'nodded',
  'shakes head', 'head shake', 'shaking head',
  'tilts head', 'head tilt', 'tilting head',
  'leans', 'lean', 'leaning', 'leaned',
  'leans forward', 'leans back', 'leans in',
  'sits back', 'sitting back', 'sits up',
  'straightens', 'straightening', 'straightened',
  'shrugs', 'shrug', 'shrugging', 'shrugged',
  'gestures', 'gesture', 'gesturing', 'gestured',
  'waves', 'wave', 'waving', 'waved',
  'points', 'point', 'pointing', 'pointed',
  'claps', 'clap', 'clapping', 'clapped',
  'snaps fingers', 'finger snap', 'snapping',
  'rubs hands', 'rubbing hands',
  'crosses arms', 'arms crossed', 'crossing arms',
  'folds arms', 'arms folded',
  'hands on hips', 'puts hands on hips',
  'scratches head', 'head scratch',
  'rubs chin', 'chin rub',
  'touches face', 'touching face',
  'fidgets', 'fidget', 'fidgeting',
  'shifts', 'shifting', 'shifted',
  'stands', 'standing', 'stood',
  'paces', 'pace', 'pacing', 'paced',
  
  // -------------------------------------------------------------------------
  // Mental Actions (not spoken)
  // -------------------------------------------------------------------------
  'thinks', 'thinking', 'thought',
  'ponders', 'pondering', 'pondered',
  'considers', 'considering', 'considered',
  'reflects', 'reflecting', 'reflected',
  'contemplates', 'contemplating', 'contemplated',
  'wonders', 'wondering', 'wondered',
  'imagines', 'imagining', 'imagined',
  'remembers', 'remembering', 'remembered',
  'realizes', 'realizing', 'realized',
  'notices', 'noticing', 'noticed',
  'observes', 'observing', 'observed',
  'hesitates', 'hesitating', 'hesitated', 'hesitation',
  'pauses', 'pause', 'pausing', 'paused',
  'trails off', 'trailing off', 'trailed off',
  'searches for words', 'searching for words',
  'gathers thoughts', 'gathering thoughts',
  'collects self', 'collecting self',
  
  // -------------------------------------------------------------------------
  // Manner/Tone Adverbs (HOW, not WHAT)
  // -------------------------------------------------------------------------
  'softly', 'gently', 'quietly', 'tenderly',
  'warmly', 'kindly', 'lovingly', 'affectionately',
  'calmly', 'peacefully', 'serenely',
  'slowly', 'deliberately', 'carefully',
  'quickly', 'rapidly', 'briskly',
  'loudly', 'forcefully', 'firmly',
  'nervously', 'anxiously', 'worriedly',
  'excitedly', 'enthusiastically', 'eagerly',
  'sadly', 'mournfully', 'sorrowfully',
  'angrily', 'furiously', 'irritably',
  'playfully', 'teasingly', 'jokingly',
  'sarcastically', 'ironically', 'dryly',
  'sincerely', 'genuinely', 'earnestly',
  'thoughtfully', 'reflectively', 'pensively',
  'matter-of-factly', 'flatly', 'bluntly',
  'hesitantly', 'uncertainly', 'tentatively',
  'confidently', 'assuredly', 'boldly',
  'sympathetically', 'empathetically', 'compassionately',
  
  // -------------------------------------------------------------------------
  // Tone/Attitude Descriptors
  // -------------------------------------------------------------------------
  'with warmth', 'with kindness', 'with care',
  'with concern', 'with worry', 'with empathy',
  'with sympathy', 'with compassion', 'with understanding',
  'with enthusiasm', 'with excitement', 'with energy',
  'with curiosity', 'with interest', 'with intrigue',
  'with certainty', 'with confidence', 'with conviction',
  'with hesitation', 'with uncertainty', 'with doubt',
  'with sadness', 'with sorrow', 'with grief',
  'with anger', 'with frustration', 'with irritation',
  'with humor', 'with amusement', 'with levity',
  'with seriousness', 'with gravity', 'with solemnity',
  'with reverence', 'with respect', 'with admiration',
  'a hint of', 'a touch of', 'a note of',
  'a trace of', 'a tinge of', 'a shade of',
  
  // -------------------------------------------------------------------------
  // Emotions as Stage Directions
  // -------------------------------------------------------------------------
  'feeling', 'feels', 'felt',
  'emotional', 'getting emotional',
  'touched', 'moved', 'affected',
  'overwhelmed', 'overcome',
  'relieved', 'relief', 'with relief',
  'grateful', 'gratefully', 'with gratitude',
  'proud', 'proudly', 'with pride',
  'ashamed', 'shamefully', 'with shame',
  'embarrassed', 'with embarrassment',
  'nervous', 'with nerves',
  'worried', 'with worry',
  'hopeful', 'hopefully', 'with hope',
  'wistful', 'wistfully', 'with wistfulness',
  'nostalgic', 'nostalgically', 'with nostalgia',
  'melancholic', 'melancholically', 'with melancholy',
  
  // -------------------------------------------------------------------------
  // Energy/State Descriptors
  // -------------------------------------------------------------------------
  'energetically', 'with energy',
  'tiredly', 'wearily', 'with fatigue',
  'sleepily', 'drowsily',
  'alertly', 'attentively',
  'distractedly', 'absently',
  'focused', 'intently', 'with focus',
  'relaxed', 'at ease', 'comfortably',
  'tensely', 'stiffly', 'rigidly',
  
  // -------------------------------------------------------------------------
  // State/Emotion Modifiers (as stage directions)
  // -------------------------------------------------------------------------
  'visibly', 'clearly', 'obviously', 'noticeably',
  'suddenly', 'immediately', 'instantly',
  'excited', 'excitedly', 'with excitement',
  'amused', 'amusedly', 'with amusement',
  
  // -------------------------------------------------------------------------
  // Voice Descriptions
  // -------------------------------------------------------------------------
  'voice softens', 'softening voice',
  'voice hardens', 'hardening voice',
  'voice breaks', 'voice breaking', 'voice cracking',
  'voice trails', 'voice trailing',
  'voice rises', 'voice rising',
  'voice drops', 'voice dropping',
  'in a whisper', 'whispered', 'whispering',
  'in a low voice', 'lowering voice',
  'in a high voice', 'raising voice',
  'under breath', 'under their breath',
  'to self', 'to themselves', 'to oneself',
  'mutters', 'muttering', 'muttered',
  'mumbles', 'mumbling', 'mumbled',
  
  // -------------------------------------------------------------------------
  // Miscellaneous Stage Cues
  // -------------------------------------------------------------------------
  'beat', 'a beat', 'long beat', 'short beat',
  'moment', 'a moment', 'for a moment',
  'silence', 'silent', 'silently',
  'quietly', 'quiet',
  'looks away', 'looking away', 'looked away',
  'looks down', 'looking down', 'looked down',
  'looks up', 'looking up', 'looked up',
  'meets eyes', 'makes eye contact', 'eye contact',
  'avoids eye contact', 'avoiding eyes',
  'turns', 'turning', 'turned',
  'faces', 'facing', 'faced',
  'approaches', 'approaching', 'approached',
  'steps back', 'stepping back',
  'moves closer', 'moving closer',
  'reaches out', 'reaching out', 'reached out',
  'pulls back', 'pulling back', 'pulled back',
  'tenses', 'tensing', 'tensed',
  'relaxes', 'relaxing', 'relaxed',
  
  // -------------------------------------------------------------------------
  // Sound/Action Wrappers
  // -------------------------------------------------------------------------
  'sound of', 'the sound of',
  'makes a sound', 'making a sound',
  'lets out', 'letting out', 'let out',
  
  // -------------------------------------------------------------------------
  // Laughter Variants
  // NOTE: These are handled separately in sanitizeSsml() to convert to [laughter]
  // Only include variants that should NOT convert to [laughter]
  // -------------------------------------------------------------------------
  // 'chuckles', 'chuckle', etc. - REMOVED (handled separately)
  // 'laughs', 'laugh', etc. - REMOVED (handled separately)
  // 'giggles', 'giggle', etc. - REMOVED (handled separately)
  'snickers', 'snicker', 'snickering',
  'snorts', 'snort', 'snorting', 'snorted',
  'cackles', 'cackle', 'cackling',
  'guffaws', 'guffaw', 'guffawing',
  'titters', 'titter', 'tittering',
  
  // -------------------------------------------------------------------------
  // Emotional Reactions (remove or convert)
  // -------------------------------------------------------------------------
  'tears', 'crying', 'cries', 'cried',
  'weeps', 'weeping', 'wept',
  'sobs', 'sobbing', 'sobbed',
  'sniffles', 'sniffling', 'sniffled',
  'wails', 'wailing', 'wailed',
  'moans', 'moaning', 'moaned',
  'screams', 'screaming', 'screamed',
  'shouts', 'shouting', 'shouted',
  'yells', 'yelling', 'yelled',
  'whispers', 'whispering', 'whispered',
];

/**
 * Patterns for matching stage directions in various formats
 * Used by sanitizeSsml() in core.ts
 */
export const STAGE_DIRECTION_PATTERNS = {
  /** Stage directions wrapped in asterisks: *chuckles* */
  asterisk: /\*[^*]+\*/g,
  
  /** Stage directions in parentheses: (laughs) */
  parenthesis: /\([^)]+\)/g,
  
  /** Stage directions in brackets: [sighs] */
  bracket: /\[[^\]]+\]/g,
  
  /** Stage directions in em dashes: — pauses — */
  emDash: /—[^—]+—/g,
  
  /** Stage directions with colons: action: description */
  colonPrefix: /^\s*\w+:\s*/gm,
  
  /** Standalone action verbs at start of line */
  standaloneAction: /^(He|She|They|I)\s+(sighs?|laughs?|smiles?|nods?|pauses?)/gim,
};

/**
 * Keywords that should CONVERT to [laughter] (not just remove)
 * Only "laughter" is supported by Cartesia Sonic-3
 */
export const LAUGHTER_CONVERSION_KEYWORDS: string[] = [
  'laughs', 'laugh', 'laughing', 'laughed',
  'chuckles', 'chuckle', 'chuckling', 'chuckled',
  'giggles', 'giggle', 'giggling', 'giggled',
  // Note: snickers, snorts, guffaws, etc. are TOO specific
  // and may not map well to generic [laughter]
];

/**
 * Keywords that should be REMOVED entirely (no conversion)
 * These have no supported nonverbal equivalent in Cartesia
 */
export const UNSUPPORTED_NONVERBALS: string[] = [
  'sighs', 'sigh', 'sighing',
  'groans', 'groan', 'groaning',
  'coughs', 'cough', 'coughing',
  'sneezes', 'sneeze',
  'yawns', 'yawn', 'yawning',
  'gasps', 'gasp', 'gasping',
];

