/**
 * The Spanish twins of the English imminent crisis patterns (CRISIS_ES_IMMINENT_911_FIRST, #4310,
 * off by default).
 *
 * The English patterns (crisis-patterns.ts, the rows marked imminent) read an attempt underway or
 * means in hand as imminent, so the reply leads with 911. Spanish had one crisis pattern and no
 * imminent one: "quiero morir, estoy en el puente ahora mismo y voy a saltar" read as a crisis
 * that is not urgent, so 911 came last. With the flag on, each English imminent row's Spanish twin
 * reads imminent too, and the Spanish script leads with 911 (crisis-guard-replies.ts).
 *
 * Escalate-only: a match adds the explicit and imminent reads and never removes one. A Spanish
 * line that is negated, in the past, a joke, a condition or someone else's words is left as main
 * reads it. That guard is coarser than the English modifiers (crisis-modifiers.ts): it can leave a
 * line at main's read, never below it.
 *
 * @module services/safety/crisis-spanish-imminent
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { CrisisSubject } from './crisis-guard.js';
import { SEVERITY } from './crisis-severity.js';

const PLACE = String.raw`(?:en|sobre|arriba de|encima de|al)\s+(?:el|la|un|una|mi|este|esta)?\s*(?:puente|techo|azotea|tejado|cornisa|borde|orilla|[uú]ltimo piso|balc[oó]n|acantilado|edificio)`;
const ACT = String.raw`(?:saltar|brincar|tirarme|aventarme|lanzarme|hacerlo|(?:acabar|terminar) con (?:todo|esto|mi vida))`;
const JUMP = String.raw`(?:(?:voy a|me voy a|quiero|estoy a punto de|ya voy a)\s+${ACT}|me (?:voy a |quiero )?(?:tirar|aventar|lanzar)\b|me (?:tiro|aviento|lanzo)\b)`;
const GUN = String.raw`(?:pistola|arma|rev[oó]lver)`;
const PILLS = String.raw`(?:pastillas|p[ií]ldoras|medicinas|medicamentos|tabletas)`;

/** One per English imminent row, in crisis-patterns.ts order. */
const SPANISH_IMMINENT: readonly RegExp[] = [
  // On the bridge, roof or ledge, and about to jump.
  new RegExp(String.raw`\b${PLACE}\b[^.!?]{0,60}\b${JUMP}`),
  // By the time anyone reads this I'll be gone.
  /\bpara cuando\b[^.!?]{0,30}\b(?:lea|leas|lean|oiga|oigas|escuche|escuches|vea|veas|encuentre|encuentres|encuentren)\b[^.!?]{0,30}\b(?:ya me habr[eé] ido|ya no (?:estar[eé]|voy a estar)|ya estar[eé] muert[oa]|me habr[eé] ido)\b/,
  // Took a handful, the whole bottle or too many pills.
  new RegExp(
    String.raw`\b(?:ya )?(?:me tom[eé]|tom[eé]|me tragu[eé]|tragu[eé]|me he tomado|he tomado)\s+(?:como |unas |unos |casi |m[aá]s de )?(?:[2-9]\d|\d{3}|treinta|cuarenta|cincuenta|sesenta|cien|todas|todo el (?:frasco|bote)|toda la (?:caja|botella)|el (?:frasco|bote) entero|la caja entera|un mont[oó]n de|un pu[nñ]ado de|demasiadas)\b[^.!?]{0,25}\b${PILLS}\b`
  ),
  // Swallowed the medicine cabinet, or the pills are kicking in.
  new RegExp(
    String.raw`\bme tom[eé] (?:todo )?lo que (?:hab[ií]a|ten[ií]a) en el botiqu[ií]n\b|\b${PILLS} (?:ya )?(?:me )?(?:est[aá]n haciendo|empiezan a hacer|empezaron a hacer|ya hacen) efecto\b|\bya (?:me )?(?:est[aá]n haciendo|empiezan a hacer) efecto las ${PILLS}\b`
  ),
  // I've just overdosed.
  /\b(?:acabo de (?:tomar|darme|hacerme)|me di|me he dado|tom[eé]) una sobredosis\b|\bme sobredosifiqu[eé]\b/,
  // The noose is ready.
  /\b(?:ya )?(?:tengo|traigo) (?:la|una|mi) (?:soga|horca) (?:lista|amarrada|atada|puesta|preparada)\b|\bla (?:soga|horca) (?:ya )?(?:est[aá] )?(?:lista|amarrada|atada|puesta|colgada)\b/,
  // A gun to my head, a rope around my neck, the gun in my hand.
  new RegExp(
    String.raw`\b${GUN} (?:en|contra) mi (?:cabeza|boca|sien)\b|\b(?:me puse|me estoy poniendo|tengo|traigo) (?:la|una|mi|el) ${GUN} (?:en|contra) (?:la|mi) (?:cabeza|boca|sien)\b|\b(?:la|una|mi) (?:soga|cuerda) (?:est[aá] )?(?:alrededor de|en) mi cuello\b|\b(?:tengo|traigo|estoy sosteniendo|sostengo|agarro) (?:la|una|mi|el) ${GUN} en (?:la|mi) mano\b`
  ),
  // The gun in my lap, loaded beside me.
  new RegExp(
    String.raw`\b${GUN}\b[^.!?]{0,40}\b(?:en mi regazo|en mis piernas|en mi boca|en la boca|contra mi cabeza)\b|\bcargad[ao] y (?:est[aá] )?(?:en mi regazo|en mis piernas|junto a m[ií]|a mi lado|en mi mano)\b`
  ),
  // The engine running in the garage.
  /\b(?:motor|carro|coche|auto) (?:est[aá] )?(?:encendido|prendido|andando|en marcha)\b[^.!?]{0,50}\b(?:garaje|garage|cochera)\b|\b(?:garaje|garage|cochera)\b[^.!?]{0,50}\b(?:motor|carro|coche|auto) (?:est[aá] )?(?:encendido|prendido|andando|en marcha)\b/,
  // Standing or sitting on the ledge, or the edge of the roof or bridge.
  /\b(?:parad[oa]|sentad[oa]|de pie|subid[oa])\s+(?:en|sobre|al)\s+(?:el|la)?\s*(?:cornisa|borde (?:de|del) (?:la |el |un |una )?(?:azotea|techo|puente|edificio|acantilado))\b/,
];

/** A negator right before the words, or inside them: "no voy a saltar", "nunca me tomé". */
const NEGATED_BEFORE =
  /\b(?:no|nunca|jam[aá]s|ni)\s+(?:(?:me|lo|la|te|se|voy|a|estoy|creo|que|pienso|quiero|tengo|lo voy|ya)\s+)*$/;
const NEGATED_INSIDE =
  /\b(?:no|nunca|jam[aá]s)\s+(?:voy|me|estoy|lo|quiero|tengo|tom[eé]|pienso)\b/;
/** The past, a joke, a condition or someone else's words, anywhere in the sentence. */
const SOFT_SENTENCE =
  /\bhace (?:\w+ )?(?:años?|meses?)\b|\bel (?:año|mes) pasado\b|\bcuando era (?:niñ[oa]|chic[oa]|joven|adolescente)\b|\bsol[ií]a\b|\b(?:jaja\w*|jeje\w*|es broma|de broma|en broma|lol)\b|\bsi (?:estuviera|tuviera|fuera|me tomara|saltara)\b|\bimagin(?:a|ate|emos)\b|\b(?:dijo|dice|me dijo|escribi[oó]|public[oó]) que\b|\b(?:su|sus) (?:diario|mensajes?|notas?|carta)\b/;

/** Whether one Spanish imminent twin reads plainly in the text. */
function readsImminent(text: string): boolean {
  return SPANISH_IMMINENT.some((re) => {
    const match = re.exec(text);
    if (!match) return false;
    const start =
      Math.max(
        text.lastIndexOf('.', match.index),
        text.lastIndexOf('!', match.index),
        text.lastIndexOf('?', match.index)
      ) + 1;
    const ends = /[.!?]/.exec(text.slice(match.index + match[0].length));
    const sentence = text.slice(
      start,
      ends ? match.index + match[0].length + ends.index : text.length
    );
    return !(
      NEGATED_BEFORE.test(text.slice(start, match.index)) ||
      NEGATED_INSIDE.test(match[0]) ||
      SOFT_SENTENCE.test(sentence)
    );
  });
}

/** What withSpanishImminent reads and may raise: a text score from crisis-guard.ts. */
interface ScoreLike {
  severity: number;
  indicators: string[];
  subject?: CrisisSubject;
  language?: 'en' | 'es';
  hardSelf: boolean;
}

/** Whether CRISIS_ES_IMMINENT_911_FIRST is on (read by the Spanish script too). */
export const spanishImminentOn = (env: Env = process.env): boolean =>
  flagOn('CRISIS_ES_IMMINENT_911_FIRST', env);

/**
 * The score, raised to an explicit imminent read of the caller's own when the flag is on and a
 * Spanish imminent twin reads plainly in the text. Otherwise the score as it was.
 */
export function withSpanishImminent<T extends ScoreLike>(text: string, score: T, env?: Env): T {
  if (!spanishImminentOn(env) || !readsImminent(text)) return score;
  const indicators = [...score.indicators];
  for (const tag of ['explicit_crisis_language', 'imminent_danger'])
    if (!indicators.includes(tag)) indicators.push(tag);
  return {
    ...score,
    severity: Math.max(score.severity, SEVERITY.explicit),
    indicators,
    subject: 'self',
    language: score.language ?? 'es',
    hardSelf: true,
  };
}
