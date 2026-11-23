/**
 * The Spanish twins of the live means-in-hand forms (CRISIS_ES_MEANS_IN_HAND, #4315, off by
 * default).
 *
 * CRISIS_MEANS_IN_HAND (crisis-means-in-hand.ts) reads its live forms (means with intent, means on
 * the body, an overdose named by the drug, a dose taken, "i did it", cutting now, the means beside
 * ending words) in English only. With this flag on, each live form's Spanish twin reads where the
 * English one does: in 'live' the turn reads explicit and imminent (911 first), in 'all' the shadow
 * log names it (es_<form>), and in 'off' and 'shadow' nothing changes. Shadow-only English forms
 * get no twin. The caller's own medication ("mis pastillas", not "todas mis pastillas") is how a
 * check-in is said, as in English.
 *
 * A twin counts only when it is the caller's own and plain: negated, hypothetical, a dream or a
 * story, someone else's words, the past or a joke leave the turn as main reads it.
 *
 * @module services/safety/crisis-means-in-hand-es
 */
import { flagOn } from '../../config/env-flag.js';
import type { MeansFormName } from './crisis-means-in-hand.js';

/** A Spanish twin's name in the shadow log: es_ before the English form's. */
export type SpanishMeansFormName = `es_${MeansFormName}`;

/** Read from process.env, as readsImminentLive reads the turn (crisis-means-shadow.ts). */
export const spanishMeansOn = (): boolean => flagOn('CRISIS_ES_MEANS_IN_HAND', process.env);

/** A word boundary that counts á, é, í, ó, ú, ñ and ü as letters ("aquí", "soñé"); \b does not. */
const B = String.raw`(?:(?<![\wáéíóúñü])(?=[\wáéíóúñü])|(?<=[\wáéíóúñü])(?![\wáéíóúñü]))`;
const PILLS = String.raw`(?:pastillas|p[ií]ldoras|medicinas|medicamentos|tabletas)`;
/** Pills that are not the caller's own medication alone: "mis pastillas" is a check-in. */
const NOT_MY_PILLS = String.raw`(?<!(?<!${B}todas )${B}mis )${PILLS}`;
const MEANS = String.raw`(?:${NOT_MY_PILLS}|pistola|arma|rev[oó]lver|soga|cuerda|cuchillo|navaja|cuchilla|el frasco)`;
const WHERE = String.raw`(?:aqu[ií](?: mismo)?|en (?:la|mi|las|mis) manos?|frente a m[ií]|delante de m[ií]|conmigo)`;
const INTENT_NOW = String.raw`(?:me (?:las|los|la|lo) (?:voy a tomar|estoy tomando|tomo)|(?:voy a|estoy a punto de) (?:tom[aá]rmelas|tomarlas|tragarlas|hacerlo|matarme|dispararme|colgarme|usarla|jalar el gatillo|apretar el gatillo)|lo (?:voy a hacer|estoy haciendo|hago)(?: (?:ahora|ya|esta noche|ahora mismo))?)`;
const DRUGS = String.raw`(?:tylenol|advil|ibuprofeno|acetaminof[eé]n|paracetamol|aspirinas?|benadryl|xanax|alprazolam|clonazepam|rivotril|diazepam|valium|ambien|oxicodona|percocet|vicodin|tramadol|pastillas para dormir|somn[ií]feros|analg[eé]sicos|calmantes|insulina|litio|seroquel|quetiapina)`;
const TOOK = String.raw`(?:me tom[eé]|tom[eé]|me tragu[eé]|tragu[eé]|me he tomado|ya me tom[eé])`;
/** A strength is not a count: "500 miligramos de tylenol". */
const NOT_A_UNIT = String.raw`(?! ?(?:mg|mgs|miligramos?|mcg|gramos?|g|unidades?|ml|mililitros?|gotas?)${B})`;
const DONE = String.raw`(?:sangrando|sangre por todas partes|sobredosis|${TOOK} (?:todas )?(?:las|mis) pastillas|me las tom[eé] todas|(?:las pastillas|las medicinas) (?:ya )?(?:est[aá]n haciendo|hacen) efecto|la soga|la horca|me cort[eé] (?:las|la) muñecas?)`;
/** A dose's clause ends here: "me tomé todas mis pastillas de hoy" carries on, so it is a check-in. */
const CLAUSE_END = String.raw`(?= *(?:$|[.!?;,]|y${B}|ya${B}|ahora${B}|adi[oó]s${B}|perd[oó]n${B}|lo siento${B}|te quiero${B}|los quiero${B}))`;
const DID_IT = String.raw`${B}(?:ya )?lo hice${B}|${B}me atrev[ií]${B}`;

interface SpanishForm {
  name: SpanishMeansFormName;
  re: RegExp;
  tag: 'suicidal' | 'self_harm';
}

/** One twin per live English form, in crisis-means-in-hand.ts order. */
const SPANISH_FORMS: readonly SpanishForm[] = [
  {
    name: 'es_means_with_intent',
    re: new RegExp(
      String.raw`(?:${B}(?:tengo|traigo|ya tengo)${B}[^.!?]{0,25}${B}${MEANS}${B}[^.!?]{0,30}${B}${WHERE}|${B}${MEANS}${B} (?:est[aá]n?|las tengo|la tengo) ${WHERE})${B}[^.!?]{0,20}?${B}${INTENT_NOW}`
    ),
    tag: 'suicidal',
  },
  {
    name: 'es_on_body',
    re: new RegExp(
      String.raw`${B}(?:soga|horca) (?:est[aá] )?(?:alrededor de|en) mi cuello${B}|${B}(?:pistola|arma|rev[oó]lver) (?:est[aá] )?(?:apuntando|apuntada) (?:a|hacia) (?:mi|la) (?:cabeza|pecho|sien|cara)${B}|${B}(?:cuchillo|navaja|cuchilla) (?:est[aá] )?(?:en|contra|sobre) (?:mi|mis) (?:muñecas?|garganta|cuello)${B}|${B}(?:pistola|arma|rev[oó]lver) cargad[ao]${B}[^.!?]{0,20}${B}(?:junto a m[ií]|a mi lado|en mi regazo|en mi mano|en mis piernas)${B}`
    ),
    tag: 'suicidal',
  },
  {
    name: 'es_drug_count',
    re: new RegExp(
      String.raw`${B}${TOOK} (?:como |unas |unos |casi |m[aá]s de )?(?:(?:[1-9]\d|\d{3,})${B}${NOT_A_UNIT}|un pu[nñ]ado de|un mont[oó]n de|todo el frasco de|toda la caja de|todas las|todos los|demasiad[oa]s)${B}[^.!?]{0,25}${B}${DRUGS}${B}`
    ),
    tag: 'suicidal',
  },
  {
    name: 'es_took_dose',
    re: new RegExp(
      String.raw`${B}${TOOK} (?:todas (?:las|mis) ${PILLS}|todo el frasco|el frasco entero|un frasco entero|un pu[nñ]ado(?: de ${PILLS})?|todo lo que (?:ten[ií]a|hab[ií]a)|(?:como |unas |m[aá]s de )?(?:[1-9]\d|\d{3,}) ${PILLS})${B}${CLAUSE_END}`
    ),
    tag: 'suicidal',
  },
  {
    name: 'es_did_it',
    re: new RegExp(
      String.raw`${B}${DONE}[\s\S]{0,60}(?:${DID_IT})|(?:${DID_IT})[\s\S]{0,60}${B}${DONE}`
    ),
    tag: 'suicidal',
  },
  {
    name: 'es_cutting_now',
    re: new RegExp(
      String.raw`${B}(?:me estoy (?:cortando|quemando)|estoy (?:cort[aá]ndome|quem[aá]ndome))(?: (?:las|la|los|mis|mi) (?:muñecas?|brazos?|piernas?|muslos?|piel))? (?:ahora mismo|ahorita|ahora|en este momento)${B}`
    ),
    tag: 'self_harm',
  },
];

/** The means at hand, beside the caller's own ending words (ending_beside_means). */
const MEANS_AT_HAND = new RegExp(
  String.raw`${B}(?:${PILLS}|pistola|arma|soga|cuerda|navaja|cuchilla)${B}[^.!?]{0,25}${B}(?:listas?|en mi mano|en la mano|en mi regazo|cargada|junto a m[ií]|a mi lado|aqu[ií] mismo)${B}`
);

/** A negator right before the words, or inside them: "no tengo las pastillas", "nunca lo hice". */
const NEGATED_BEFORE = new RegExp(
  String.raw`${B}(?:no|nunca|jam[aá]s|ni)\s+(?:(?:me|las|los|la|lo|ya|tengo|voy|estoy)\s+)*$`
);
const NEGATED_INSIDE = new RegExp(
  String.raw`${B}(?:no|nunca|jam[aá]s)\s+(?:tengo|voy|me|lo|las|estoy|tom[eé])${B}`
);
/** Not happening (a condition, a dream, a story), someone else's words, the past or a joke. */
const SOFT_SENTENCE = new RegExp(
  String.raw`${B}si (?:tuviera|estuviera|fuera|me tomara)${B}|${B}(?:qu[eé] tal si|imagina\w*|sup[oó]n|supongamos)${B}|${B}(?:so[nñ][eé]|en (?:mi|un|el) sue[nñ]o|en (?:la|una) (?:pel[ií]cula|serie|novela|canci[oó]n)|en el (?:libro|juego))${B}|${B}(?:dijo|dice|me dijo|escribi[oó]|public[oó]) que${B}|${B}hace (?:\w+ )?(?:años?|meses?)${B}|${B}el (?:año|mes) pasado${B}|${B}cuando era (?:niñ[oa]|chic[oa]|joven|adolescente)${B}|${B}(?:jaja\w*|jeje\w*|es broma|de broma|en broma)${B}`
);

/** Whether a match reads plainly: the caller's own, and nothing in its sentence softens it. */
function plain(text: string, start: number, end: number): boolean {
  const from =
    Math.max(
      text.lastIndexOf('.', start),
      text.lastIndexOf('!', start),
      text.lastIndexOf('?', start)
    ) + 1;
  const stop = /[.!?]/.exec(text.slice(end));
  const sentence = text.slice(from, stop ? end + stop.index : text.length);
  return !(
    NEGATED_BEFORE.test(text.slice(from, start)) ||
    NEGATED_INSIDE.test(text.slice(start, end)) ||
    SOFT_SENTENCE.test(sentence)
  );
}

/**
 * The Spanish twin that reads in this turn, or null. `free` is the English read's own check (spans
 * the patterns already softened stay softened); `ending` says whether the caller's own ending words
 * are in the turn, for the means beside them.
 */
export function spanishMeansRead(
  text: string,
  free: (start: number, end: number) => boolean,
  ending: boolean
): { tag: 'suicidal' | 'self_harm'; form: SpanishMeansFormName } | null {
  const reads = (re: RegExp): boolean => {
    for (const m of text.matchAll(new RegExp(re.source, 'g'))) {
      const end = m.index + m[0].length;
      if (free(m.index, end) && plain(text, m.index, end)) return true;
    }
    return false;
  };
  for (const form of SPANISH_FORMS) if (reads(form.re)) return { tag: form.tag, form: form.name };
  if (ending && reads(MEANS_AT_HAND)) return { tag: 'suicidal', form: 'es_ending_beside_means' };
  return null;
}
