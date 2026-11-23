/**
 * The Spanish twins of the English imminent crisis patterns (CRISIS_ES_IMMINENT_911_FIRST, #4310,
 * off by default), read through the shared raise (crisis-imminent-raise.ts).
 *
 * The English patterns (crisis-patterns.ts, the rows marked imminent) read an attempt underway or
 * means in hand as imminent, so the reply leads with 911. Spanish had one crisis pattern and no
 * imminent one: "quiero morir, estoy en el puente ahora mismo y voy a saltar" read as a crisis
 * that is not urgent, so 911 came last. With the flag on, each English imminent row's Spanish twin
 * reads imminent too, and the Spanish script leads with 911 (crisis-guard-replies.ts). The twin of
 * "jump off the bridge" reads explicit, not imminent, as its English row does.
 *
 * Escalate-only: a match adds the caller's own read and never removes one. A Spanish line that is
 * negated, in the past, a joke or a condition is left as main reads it. That
 * guard is coarser than the English modifiers (crisis-modifiers.ts): it can leave a line at main's
 * read, never below it. Each twin is said in the first person, as its English row is, so a line
 * about someone else ("mi papá tiene la pistola en la boca") reads as its English twin does.
 *
 * @module services/safety/crisis-spanish-imminent
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { wordPattern, type CrisisRaise } from './crisis-imminent-raise.js';

const PLACE_NOUN = String.raw`(?:puente|techo|azotea|tejado|cornisa|borde|orilla|[uú]ltimo piso|balc[oó]n|acantilado|edificio)`;
const ARTICLE = String.raw`(?:(?:el|la|un|una|mi|este|esta) )?`;
/** On, up on or at the place: "en el puente", "arriba del puente", "encima del techo". */
const PLACE = String.raw`(?:en|sobre|al|(?:arriba|encima|en lo alto|al borde) (?:de|del)) ${ARTICLE}${PLACE_NOUN}`;
const ACT = String.raw`(?:saltar|brincar|tirarme|aventarme|lanzarme|hacerlo|(?:acabar|terminar) con (?:todo|esto|mi vida))`;
const JUMP = String.raw`(?:(?:voy a|me voy a|quiero|estoy a punto de|estoy por|ya voy a) ${ACT}|me (?:voy a |quiero )?(?:tirar|aventar|lanzar)\b|me (?:tiro|aviento|lanzo)\b)`;
const GUN = String.raw`(?:pistola|arma|rev[oó]lver)`;
const HELD = String.raw`(?:la|una|mi|el|un)`;
const PILLS = String.raw`(?:pastillas|p[ií]ldoras|medicinas|medicamentos|tabletas)`;
const TOOK = String.raw`(?:ya )?(?:me tom[eé]|tom[eé]|me tragu[eé]|tragu[eé]|me he tomado|he tomado|me acabo de (?:tomar|tragar)|acabo de (?:tomarme|tragarme))`;

/** One per English imminent row, in crisis-patterns.ts order. */
const IMMINENT = [
  // On the bridge, roof or ledge, and about to jump.
  String.raw`\b${PLACE}\b[^.!?]{0,60}\b${JUMP}`,
  // By the time anyone reads this I'll be gone.
  String.raw`\bpara cuando\b[^.!?]{0,30}\b(?:lea|leas|lean|oiga|oigas|escuche|escuches|vea|veas|encuentre|encuentres|encuentren)\b[^.!?]{0,30}\b(?:ya me habr[eé] ido|ya no (?:estar[eé]|voy a estar)|ya estar[eé] muert[oa]|me habr[eé] ido)\b`,
  // Took a handful, the whole bottle or too many pills.
  String.raw`\b${TOOK} (?:como |unas |unos |casi |m[aá]s de )?(?:[2-9]\d|\d{3}|treinta|cuarenta|cincuenta|sesenta|cien|todas|todo el (?:frasco|bote)|toda la (?:caja|botella)|el (?:frasco|bote) entero|la caja entera|un mont[oó]n de|un pu[nñ]ado de|demasiadas)\b[^.!?]{0,25}\b${PILLS}\b`,
  // Swallowed the medicine cabinet, or the pills are kicking in.
  String.raw`\bme tom[eé] (?:todo )?lo que (?:hab[ií]a|ten[ií]a) en el botiqu[ií]n\b|\b${PILLS} (?:ya )?(?:me )?(?:est[aá]n haciendo|empiezan a hacer|empezaron a hacer|ya hacen) efecto\b|\bya (?:me )?(?:est[aá]n haciendo|empiezan a hacer) efecto las ${PILLS}\b`,
  // I've just overdosed.
  String.raw`\b(?:acabo de (?:tomar|darme|hacerme)|me di|me he dado|tom[eé]) una sobredosis\b|\bme sobredosifiqu[eé]\b`,
  // The noose is ready: mine ("tengo la soga lista"), or the noose itself ("la horca está lista").
  String.raw`\b(?:ya )?(?:tengo|traigo) (?:la|una|mi) (?:soga|horca) (?:lista|amarrada|atada|puesta|preparada)\b|\bla horca (?:ya )?(?:est[aá] )?(?:lista|amarrada|atada|puesta|colgada)\b`,
  // A gun to my head, a rope around my neck, the gun in my hand.
  String.raw`\b${GUN} (?:en|contra) mi (?:cabeza|boca|sien)\b|\b(?:me puse|me estoy poniendo|tengo|traigo) ${HELD} ${GUN} (?:en|contra) (?:la|mi) (?:cabeza|boca|sien)\b|\b(?:la|una|mi) (?:soga|cuerda) (?:est[aá] )?(?:alrededor de|en) mi cuello\b|\b(?:tengo|traigo|estoy sosteniendo|sostengo|agarro) ${HELD} ${GUN} en (?:la|mi) mano\b`,
  // The gun in my lap, loaded beside me.
  String.raw`\b${GUN}\b[^.!?]{0,40}\b(?:en mi regazo|en mis piernas|en mi boca|contra mi cabeza)\b|\bcargad[ao] y (?:est[aá] )?(?:en mi regazo|en mis piernas|junto a m[ií]|a mi lado|en mi mano)\b`,
  // The engine running in the garage.
  String.raw`\b(?:motor|carro|coche|auto) (?:est[aá] )?(?:encendido|prendido|andando|en marcha)\b[^.!?]{0,50}\b(?:garaje|garage|cochera)\b|\b(?:garaje|garage|cochera)\b[^.!?]{0,50}\b(?:motor|carro|coche|auto) (?:est[aá] )?(?:encendido|prendido|andando|en marcha)\b`,
  // Standing or sitting on the ledge, or the edge of the roof or bridge.
  String.raw`\b(?:parad[oa]|sentad[oa]|de pie|subid[oa]) (?:en|sobre|al) (?:(?:el|la) )?(?:cornisa|borde (?:de|del) (?:la |el |un |una )?(?:azotea|techo|puente|edificio|acantilado))\b`,
].map((source) => wordPattern(source));

/** "jump off the bridge" (an explicit English row, not imminent): "estoy por saltar del puente". */
const EXPLICIT = [
  String.raw`\b(?:(?:voy a|me voy a|quiero|estoy a punto de|estoy por) (?:saltar|brincar|tirarme|aventarme|lanzarme)|me (?:voy a )?(?:tirar|aventar|lanzar)|me (?:tiro|aviento|lanzo)) (?:de|del|desde) ${ARTICLE}${PLACE_NOUN}\b|\bantes de (?:saltar|tirarme|aventarme)\b`,
].map((source) => wordPattern(source));

/**
 * A negator right before the words: "no voy a saltar", "nunca me tomé". Read on the last few words
 * only, and every word has one way to match, so the check is linear in the line.
 */
const NEGATED_BEFORE = wordPattern(
  String.raw`\b(?:no|nunca|jam[aá]s|ni) (?:(?:me|lo|la|te|se|voy|a|estoy|creo|que|pienso|quiero|tengo|ya) )*$`,
  { test: true }
);
const NEGATION_WINDOW = 48;
/**
 * A negator on the act itself, inside the words: "estoy en el puente pero no voy a saltar". Not one
 * on something else ("no tengo a nadie", "no me importa nada", "ya no voy a estar"): those are the
 * risk said, not denied.
 */
const NEGATED_ACT = wordPattern(
  String.raw`\b(?:no|nunca|jam[aá]s) (?:(?:me|te|se|lo|la|ya|voy a|quiero|pienso|estoy a punto de|estoy por) )*(?:salt|brinc|tir|avent|lanz|hac|acab|termin|tom|trag|mat|dispar|colg|ahorc)\w*`,
  { test: true }
);
/**
 * The past or a condition, in the sentence. Not someone else's words ("dijo que estoy en el
 * puente…"): the English twin reads a quote as the caller's own, and the Spanish reads as it does.
 */
const SOFT_SENTENCE = wordPattern(
  String.raw`\bhace (?:\w+ )?(?:años?|meses?)\b|\bel (?:año|mes) pasado\b|\bcuando era (?:niñ[oa]|chic[oa]|joven|adolescente)\b|\bsol[ií]a\b|\bsi (?:estuviera|tuviera|fuera|me tomara|saltara)\b|\bimagin(?:a|ate|emos)\b`,
  { test: true }
);
/** A joke anywhere in the turn, as the English modifiers read "lol" and "haha". */
const JOKE = wordPattern(
  String.raw`\b(?:ja(?:ja)+\w*|je(?:je)+\w*|js(?:js)+\w*|xd+|lol|es broma|de broma|en broma)\b`,
  {
    test: true,
  }
);

/** Whether the Spanish words around one match set it aside. */
function softened(text: string, start: number, end: number): boolean {
  const from =
    Math.max(
      text.lastIndexOf('.', start),
      text.lastIndexOf('!', start),
      text.lastIndexOf('?', start)
    ) + 1;
  const stop = /[.!?]/.exec(text.slice(end));
  const sentence = text.slice(from, stop ? end + stop.index : text.length);
  return (
    NEGATED_BEFORE.test(text.slice(Math.max(from, start - NEGATION_WINDOW), start)) ||
    NEGATED_ACT.test(text.slice(start, end)) ||
    SOFT_SENTENCE.test(sentence) ||
    JOKE.test(text)
  );
}

/** Whether CRISIS_ES_IMMINENT_911_FIRST is on (read by the Spanish script too). */
export const spanishImminentOn = (env: Env = process.env): boolean =>
  flagOn(SPANISH_IMMINENT.flag, env);

/** The Spanish twins, for the shared raise in detectCrisis. */
export const SPANISH_IMMINENT: CrisisRaise = {
  flag: 'CRISIS_ES_IMMINENT_911_FIRST',
  imminent: IMMINENT,
  explicit: EXPLICIT,
  softened,
  language: 'es',
};
