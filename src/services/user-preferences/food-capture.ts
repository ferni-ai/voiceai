/**
 * Food & cooking statements in the user's own words.
 *
 * "I'm allergic to peanuts" · "I'm lactose intolerant" · "I'm vegetarian" ·
 * "my doctor told me to avoid salt" · "I can't handle spicy food" · "the lasagna
 * came out too salty" · "I want to learn to make bread" · "I cook for my kids".
 *
 * Medical restrictions are only captured when the health category is enabled;
 * the caller passes that flag (see food.ts isHealthCategoryEnabled).
 *
 * @module services/user-preferences/food-capture
 */

import type {
  AllergySeverity,
  InterestDetails,
  PreferenceInput,
  PreferenceSource,
} from './types.js';

type Built = {
  key: string;
  value: string;
  details?: InterestDetails;
  sentiment?: 'like' | 'dislike';
};

function clean(raw: string | undefined, splitOnAnd = true): string {
  const text = (raw ?? '')
    .replace(/[.!?,;]+$/g, '')
    .replace(
      /\s+(?:this|next|last|on|for)\s+(?:weekend|week|night|morning|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|dinner|lunch|breakfast)\b.*$/i,
      ''
    )
    .replace(/\s+(?:tonight|tomorrow|today|yesterday|later|soon)\b.*$/i, '')
    .replace(/\s+(?:though|too|lately|now|again|please|anymore)$/i, '');
  return text
    .split(
      splitOnAnd ? /\s+(?:and|but|because|so|which)\s+/i : /\s+(?:but|because|so|which)\s+/i
    )[0]
    .trim()
    .toLowerCase();
}

function severityIn(text: string): AllergySeverity | undefined {
  if (/\b(anaphyla\w*|epi-?pen|deathly|could die|go to the hospital)\b/i.test(text))
    return 'anaphylactic';
  if (/\b(severe(?:ly)?|really bad(?:ly)?|serious(?:ly)?)\b/i.test(text)) return 'severe';
  if (/\b(mild(?:ly)?|a little|slight(?:ly)?)\b/i.test(text)) return 'mild';
  return undefined;
}

const CUISINES =
  /^(italian|mexican|thai|indian|chinese|japanese|korean|vietnamese|greek|french|spanish|lebanese|ethiopian|turkish|mediterranean|middle eastern|bbq|barbecue|southern|cajun|caribbean|peruvian)( food)?$/i;
const INGREDIENTS =
  /^(cilantro|coriander|mushrooms?|olives?|onions?|garlic|tomatoes?|eggplant|aubergine|anchovies|blue cheese|mayo|mayonnaise|pickles?|beets?|tofu|liver|coconut|raisins?|celery|kale)$/i;
const FOODISH =
  /\b(food|pizza|sushi|pasta|tacos?|curry|ramen|burgers?|salad|steak|bbq|dessert|cake|ice cream|chocolate|cheese|soup|noodles|dumplings|pho|lasagna|bread|sandwich|fries|chili|stew|pie)\b/i;

const RULES: readonly [RegExp, (m: RegExpExecArray, text: string) => Built | null][] = [
  [
    /\bi'?m (?:\w+ )?allergic to ([a-z][a-z ,'-]{1,40})/i,
    (m, t) => ({
      key: 'allergy',
      value: clean(m[1]),
      details: { ...(severityIn(t) ? { severity: severityIn(t) } : {}) },
    }),
  ],
  [
    /\bi have an? (?:\w+ )?([a-z][a-z -]{1,25}) allergy\b/i,
    (m, t) => ({
      key: 'allergy',
      value: clean(m[1]),
      details: { ...(severityIn(t) ? { severity: severityIn(t) } : {}) },
    }),
  ],
  [
    /\bi'?m (lactose|gluten|dairy|fructose|histamine) intolerant\b/i,
    (m, t) => ({
      key: 'intolerance',
      value: m[1].toLowerCase(),
      details: { ...(severityIn(t) ? { severity: severityIn(t) } : {}) },
    }),
  ],
  [
    /\b([a-z][a-z -]{1,20}) (?:doesn'?t|does not) agree with me\b/i,
    (m) => ({ key: 'intolerance', value: clean(m[1]), details: {} }),
  ],
  [
    /\bi'?m\s+(?:a\s+|strictly\s+|mostly\s+)?(vegetarian|vegan|pescatarian|gluten[- ]free|dairy[- ]free|keto|paleo|kosher|halal)\b/i,
    (m) => ({ key: 'diet', value: m[1].toLowerCase().replace(' ', '-') }),
  ],
  [/\bi (?:keep|eat) (kosher|halal)\b/i, (m) => ({ key: 'diet', value: m[1].toLowerCase() })],
  [
    /\bmy doctor (?:told me|says|wants me|said) (?:to )?(?:avoid|cut (?:out|back on)|stay away from|no more|limit) ([a-z][a-z -]{1,30})/i,
    (m) => ({ key: 'medical', value: clean(m[1]) }),
  ],
  [
    /\b(?:i can'?t (?:handle|do|take) (?:spicy|spice|heat)|nothing (?:too )?spicy)\b/i,
    () => ({ key: 'spiceTolerance', value: 'mild' }),
  ],
  [
    /\bi (?:love|like) (?:it |things |food )?(?:really |super )?(?:spicy|hot)\b/i,
    () => ({ key: 'spiceTolerance', value: 'hot' }),
  ],
  [
    /\bmy (?:go-to |ultimate )?comfort food is ([a-z][a-z '-]{1,30})/i,
    (m) => ({ key: 'comfort', value: clean(m[1], false) }),
  ],
  [
    /\bmy favou?rite restaurant is ([A-Za-z][\w '&-]{1,40})/i,
    (m) => ({ key: 'restaurant', value: m[1].replace(/[.!?]+$/, '').trim() }),
  ],
  [
    /\bmy (?:signature|specialty) (?:dish )?is (?:my )?([a-z][a-z '-]{1,30})/i,
    (m) => ({ key: 'signature', value: clean(m[1], false) }),
  ],
  [
    /\b(?:i|we) (?:made|cooked|baked|tried making) (?:the |a |an |my |that )?([a-z][a-z '-]{1,30}?)(?: (?:last night|yesterday|today|this weekend|on \w+))?[,]? (?:and )?(?:it )?(?:was|came out|turned out|ended up)\s+([a-z][a-z '-]{1,40})/i,
    (m) => ({
      key: 'recipe',
      value: clean(m[1]),
      details: { outcome: clean(m[2]), status: 'finished' },
    }),
  ],
  [
    /\bi'?m (?:going to|gonna) (?:make|try making|bake|cook) (?:a |an |the |some )?([a-z][a-z '-]{1,30})/i,
    (m) => ({ key: 'recipe', value: clean(m[1]), details: { status: 'want_to' } }),
  ],
  [
    /\bi (?:want|would love|'d love) to learn (?:how )?to (?:make|bake|cook) ([a-z][a-z '-]{1,30})/i,
    (m) => ({ key: 'goal', value: clean(m[1]), details: { status: 'want_to' } }),
  ],
  [
    /\bi (?:usually )?cook for my ([a-z]+(?: and [a-z]+)?)/i,
    (m) => ({
      key: 'cooksFor',
      value: clean(m[1], false),
      details: {
        relatedPeople: clean(m[1], false)
          .split(' and ')
          .map((name) => ({ name })),
      },
    }),
  ],
  [
    /\bi (?:just )?(?:got|bought) (?:a |an |myself a |myself an )?(instant pot|air fryer|stand mixer|dutch oven|cast iron(?: pan| skillet)?|sous vide|pizza oven|wok|bread machine|rice cooker|smoker|pasta maker)\b/i,
    (m) => ({ key: 'equipment', value: m[1].toLowerCase() }),
  ],
  [
    /\bi meal ?prep (?:on |every )?([a-z]+s?)\b/i,
    (m) => ({ key: 'routine', value: `meal prep ${clean(m[1])}` }),
  ],
  [
    /\bi'?m (?:a |an )?(beginner|terrible|bad|decent|okay|good|great|confident|experienced) cook\b/i,
    (m) => ({
      key: 'cookingSkill',
      value: /beginner|terrible|bad/.test(m[1])
        ? 'beginner'
        : /decent|okay/.test(m[1])
          ? 'intermediate'
          : /good|confident/.test(m[1])
            ? 'confident'
            : 'advanced',
    }),
  ],
];

/** "I love sushi" / "I hate cilantro" → tastes. */
function tasteFrom(text: string): Built | null {
  const m =
    /\bi\s+(?:really\s+)?(love|adore|enjoy|like|hate|can'?t stand|dislike|don'?t like)\s+([a-z][a-z' -]{1,30})/i.exec(
      text
    );
  if (!m) return null;
  const item = clean(m[2]);
  if (!item || item.split(' ').length > 4) return null;
  const sentiment = /hate|can'?t stand|dislike|don'?t like/i.test(m[1]) ? 'dislike' : 'like';
  if (CUISINES.test(item)) return { key: 'cuisine', value: item.replace(/ food$/, ''), sentiment };
  if (INGREDIENTS.test(item)) return { key: 'ingredient', value: item, sentiment };
  if (FOODISH.test(item)) return { key: 'dish', value: item, sentiment };
  return null;
}

const SINGLE = new Set(['spiceTolerance', 'cookingSkill']);

export function parseFoodStatements(
  text: string,
  source: PreferenceSource,
  confidence: number,
  opts: { conversationId?: string; healthEnabled?: boolean } = {}
): PreferenceInput[] {
  if (!text || text.length > 2000) return [];
  const built: Built[] = [];
  for (const [re, build] of RULES) {
    const m = re.exec(text);
    const b = m ? build(m, text) : null;
    if (b && b.value) built.push(b);
  }
  const taste = tasteFrom(text);
  if (taste && !built.some((b) => b.key === 'spiceTolerance')) built.push(taste);
  return built
    .filter((b) => b.key !== 'medical' || opts.healthEnabled !== false)
    .map((b) => ({
      domain: 'food' as const,
      key: SINGLE.has(b.key) ? b.key : `${b.key}:${b.value}`,
      value: b.value,
      ...(b.sentiment ? { sentiment: b.sentiment } : {}),
      ...(SINGLE.has(b.key) ? {} : { details: b.details ?? {} }),
      source,
      confidence,
      ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
    }));
}
