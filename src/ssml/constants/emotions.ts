/**
 * Emotion Detection Constants
 * Keywords for detecting emotional content to apply SSML emotion tags
 *
 * @module ssml/constants/emotions
 */

/**
 * Keywords mapped to Cartesia-supported emotions
 * Format: keyword → emotion (for easy lookup during detection)
 */
export const EMOTION_KEYWORDS: Record<string, string> = {
  // -------------------------------------------------------------------------
  // Angry (High Arousal Negative)
  // -------------------------------------------------------------------------
  'angry': 'angry',
  'furious': 'angry',
  'mad': 'angry',
  'frustrated': 'angry',
  'annoyed': 'angry',
  'irritated': 'angry',
  'upset': 'angry',
  'outraged': 'angry',
  'livid': 'angry',
  'incensed': 'angry',
  'enraged': 'angry',
  'infuriated': 'angry',
  'seething': 'angry',
  'fuming': 'angry',
  'irate': 'angry',
  'indignant': 'angry',
  'resentful': 'angry',
  'bitter': 'angry',
  'aggravated': 'angry',
  'exasperated': 'angry',
  
  // -------------------------------------------------------------------------
  // Surprised (High Arousal)
  // -------------------------------------------------------------------------
  'surprised': 'surprised',
  'shocked': 'surprised',
  'amazed': 'surprised',
  'astonished': 'surprised',
  'wow': 'surprised',
  'incredible': 'surprised',
  'unbelievable': 'surprised',
  'unexpected': 'surprised',
  'startling': 'surprised',
  'stunning': 'surprised',
  'astounding': 'surprised',
  'remarkable': 'surprised',
  'extraordinary': 'surprised',
  'mind-blowing': 'surprised',
  'jaw-dropping': 'surprised',
  'speechless': 'surprised',
  'dumbfounded': 'surprised',
  'flabbergasted': 'surprised',
  'taken aback': 'surprised',
  'whoa': 'surprised',
  
  // -------------------------------------------------------------------------
  // Sad (Low Arousal Negative)
  // -------------------------------------------------------------------------
  'sad': 'sad',
  'depressed': 'sad',
  'unhappy': 'sad',
  'melancholy': 'sad',
  'sorrowful': 'sad',
  'grief': 'sad',
  'heartbroken': 'sad',
  'devastated': 'sad',
  'miserable': 'sad',
  'gloomy': 'sad',
  'downhearted': 'sad',
  'despondent': 'sad',
  'dejected': 'sad',
  'disheartened': 'sad',
  'crestfallen': 'sad',
  'forlorn': 'sad',
  'mournful': 'sad',
  'tearful': 'sad',
  'weepy': 'sad',
  'heavy-hearted': 'sad',
  'hurting': 'sad',
  'lonely': 'sad',
  
  // -------------------------------------------------------------------------
  // Calm (Low Arousal Positive)
  // -------------------------------------------------------------------------
  'calm': 'calm',
  'peaceful': 'calm',
  'serene': 'calm',
  'tranquil': 'calm',
  'relaxed': 'calm',
  'at ease': 'calm',
  'composed': 'calm',
  'collected': 'calm',
  'centered': 'calm',
  'grounded': 'calm',
  'still': 'calm',
  'quiet': 'calm',
  'gentle': 'calm',
  'soothing': 'calm',
  'restful': 'calm',
  'unhurried': 'calm',
  'placid': 'calm',
  'untroubled': 'calm',
  'balanced': 'calm',
  'harmonious': 'calm',
  'mellow': 'calm',
  'zen': 'calm',
  
  // -------------------------------------------------------------------------
  // Affectionate (Positive Valence)
  // -------------------------------------------------------------------------
  'love': 'affectionate',
  'loving': 'affectionate',
  'affectionate': 'affectionate',
  'caring': 'affectionate',
  'warm': 'affectionate',
  'tender': 'affectionate',
  'heartfelt': 'affectionate',
  'devoted': 'affectionate',
  'adoring': 'affectionate',
  'cherish': 'affectionate',
  'fond': 'affectionate',
  'compassionate': 'affectionate',
  'kind': 'affectionate',
  'sweet': 'affectionate',
  'endearing': 'affectionate',
  'nurturing': 'affectionate',
  'supportive': 'affectionate',
  'understanding': 'affectionate',
  'empathetic': 'affectionate',
  
  // -------------------------------------------------------------------------
  // Confident (Positive Valence)
  // -------------------------------------------------------------------------
  'confident': 'confident',
  'certain': 'confident',
  'sure': 'confident',
  'assured': 'confident',
  'positive': 'confident',
  'convinced': 'confident',
  'determined': 'confident',
  'resolute': 'confident',
  'bold': 'confident',
  'assertive': 'confident',
  'self-assured': 'confident',
  'unwavering': 'confident',
  'steadfast': 'confident',
  'decisive': 'confident',
  'strong': 'confident',
  'empowered': 'confident',
  'capable': 'confident',
  'competent': 'confident',
  'ready': 'confident',
  'unstoppable': 'confident',
  
  // -------------------------------------------------------------------------
  // Curious (Cognitive/Engaged)
  // -------------------------------------------------------------------------
  'curious': 'curious',
  'wondering': 'curious',
  'interested': 'curious',
  'intrigued': 'curious',
  'inquisitive': 'curious',
  'questioning': 'curious',
  'exploring': 'curious',
  'pondering': 'curious',
  'contemplating': 'curious',
  'fascinated': 'curious',
  'captivated': 'curious',
  'engaged': 'curious',
  'investigative': 'curious',
  'probing': 'curious',
  'analytical': 'curious',
  'thoughtful about': 'curious',
  'considering': 'curious',
  'examining': 'curious',
  'studying': 'curious',
  'researching': 'curious',
  
  // -------------------------------------------------------------------------
  // Thoughtful (Cognitive/Reflective)
  // -------------------------------------------------------------------------
  'thoughtful': 'thoughtful',
  'reflective': 'thoughtful',
  'contemplative': 'thoughtful',
  'pensive': 'thoughtful',
  'meditative': 'thoughtful',
  'philosophical': 'thoughtful',
  'introspective': 'thoughtful',
  'deep': 'thoughtful',
  'profound': 'thoughtful',
  'meaningful': 'thoughtful',
  'wise': 'thoughtful',
  'insightful': 'thoughtful',
  'perceptive': 'thoughtful',
  'mindful': 'thoughtful',
  'aware': 'thoughtful',
  'conscious': 'thoughtful',
  'deliberate': 'thoughtful',
  'intentional': 'thoughtful',
  'careful': 'thoughtful',
  'measured': 'thoughtful',
};

/**
 * Default emotion when no keywords match
 */
export const DEFAULT_EMOTION = 'neutral';

/**
 * Emotion intensity modifiers
 * Detect these words near emotion keywords to adjust intensity
 */
export const INTENSITY_MODIFIERS = {
  high: [
    'very', 'extremely', 'incredibly', 'really', 'so', 'absolutely',
    'completely', 'totally', 'utterly', 'deeply', 'profoundly',
    'intensely', 'overwhelmingly', 'extraordinarily',
  ],
  low: [
    'slightly', 'somewhat', 'a bit', 'a little', 'kind of', 'sort of',
    'mildly', 'fairly', 'moderately', 'rather', 'relatively',
  ],
};
