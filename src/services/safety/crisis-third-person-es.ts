/**
 * The third-person emergency readers in Spanish (#4060, CRISIS_SPANISH_READERS). Someone close
 * went down ("mi esposo se desmayó"), or someone is down and not getting up or not breathing ("mi
 * papá se cayó y no respira", "mi mamá no respira"). Joined to someoneCloseWentDown and
 * thirdPartyEmergency in crisis-third-person.ts, so the reply leads with 911 for them, in Spanish.
 *
 * Read on folded words (foldSpanish: accents off, lower case, a long turn's end only). Every gap
 * is bounded, so each read stays linear. Never read, as in English: a fall with an object or a
 * story after it ("se cayó de la bici ayer"), one long ago ("hace dos años"), one they are fine
 * from ("ya está bien"), a maybe ("si mi papá se cayera", "si mi mamá se desmayó, ¿qué hago?"),
 * one an everyday phrase later explains ("se cayó y no contesta el teléfono"), and grief: the
 * fall's clause goes on to a death and a date ("se desmayó y murió en marzo"). A death alone ("se
 * desmayó y murió") stays 911 for them. A Spanish speaker reviews these lists before the flag is
 * promoted.
 *
 * @module CrisisThirdPersonEs
 */
import { foldSpanish, spanishTail } from '../../utils/fold-spanish.js';

/** Who someone close is to the caller: the one list both readers use ("mi esposo", "mis papás"). */
const PEOPLE =
  'esposo esposa marido mujer papa papi padre mama mami madre hijo hija nino nina bebe hermano hermana abuelo abuela abuelito abuelita amigo amiga novio novia pareja tio tia primo prima sobrino sobrina nieto nieta vecino vecina companero companera suegro suegra';
const CLOSE = String.raw`(?:mi|mis|nuestro|nuestra|nuestros|nuestras) (?:${PEOPLE.split(' ').join('|')})s?`;
/** Someone close, by name too ("mi amigo juan"), or a pronoun: "él", "ella". */
const WHO = String.raw`(?:${CLOSE}(?: [a-z]+)?|el|ella|ellos|ellas)`;
/** A word between who and the fall: "mi papá ya se cayó", "de repente se desmayó". */
const SOON = String.raw`(?:(?:ya|justo|de repente|otra vez|de nuevo) )?`;
/** Down, said in the past: "se desmayó", "se cayó", "perdió el conocimiento". "Si se cayera" stays a maybe. */
const DOWN = String.raw`(?:se (?:desmayo|cayo|desplomo|desvanecio|colapso|ha (?:caido|desmayado|desplomado))|acaba de (?:desmayarse|caerse|desplomarse)|perdio el conocimiento)`;
/** Not breathing, or out cold: an emergency said on its own ("mi mamá no respira"). */
const NOT_BREATHING = String.raw`(?:no (?:respira|esta respirando)|dejo de respirar|esta inconsciente|perdio el conocimiento)`;
/** Not getting up, after a fall: "no se levanta", "no despierta", "no reacciona". */
const NOT_UP = String.raw`(?:no (?:se (?:puede )?levanta|puede levantarse|se puede parar|puede pararse|se para|despierta|se despierta|reacciona|responde|contesta|se mueve|abre los ojos)|sigue sin (?:respirar|despertar|moverse|reaccionar|responder)|${NOT_BREATHING})`;

const DOWN_NOT_UP = new RegExp(
  String.raw`\b${WHO} ${SOON}${DOWN}\b[^.!?]{0,40}?(?:\by\b|\bpero\b|,)(?: (?:ya|todavia|aun))? ${NOT_UP}\b`
);
const OUT_COLD = new RegExp(String.raw`\b${WHO} ${SOON}${NOT_BREATHING}\b`);

/** Where they fell: "en el piso", "en la cocina", "de la cama". Never "de la bici" (an object, a story). */
const PLACE = String.raw`(?:en|al|del|de|por) (?:el |la |los |las |mi |su )?(?:piso|suelo|cocina|bano|regadera|ducha|tina|escaleras?|cuarto|recamara|sala|calle|banqueta|acera|patio|jardin|cochera|garaje|trabajo|oficina|tienda|carro|coche|cama|casa)`;
const RECENT = String.raw`(?:ahorita|ahora mismo|ahora|hace (?:un rato|poco|unos minutos|un momento)|hoy|esta (?:manana|tarde|noche)|anoche|ayer|otra vez|de nuevo)`;
/**
 * The clause ends after the fall, its place or its time: "mi esposo se desmayó y...", "...en el
 * piso, ayuda". Any other word after it ("hace dos años", "de la bici") is a story, not now.
 */
const END = String.raw`(?=$|[,;:]| (?:y|pero|ahora|por favor|ayuda|auxilio|no|esta|yo|que|me|necesito|llama|llame|alguien|ay)\b)`;
/** A maybe: "si mi mamá se desmayó, ¿qué hago?", "en caso de que mi papá se caiga" (English: "if", "in case"). */
const MAYBE = String.raw`(?<!\b(?:si|caso de que) )`;
const CLOSE_WENT_DOWN = new RegExp(
  String.raw`${MAYBE}\b${CLOSE}(?: [a-z]+)? ${SOON}${DOWN}(?: ${PLACE}| ${RECENT}){0,2}${END}`,
  'g'
);
/** Up and well again: "ya está bien", "ya se recuperó". Never "no está bien". */
const RECOVERED =
  /(?<!\bno )\b(?:ya )?estan? (?:bien|mejor)\b|\bya se (?:recupero|levanto|siente mejor)\b/g;

/** A date long ago: "en marzo", "el año pasado", "hace dos años", "en 2019" (English DATED). */
const DATED = String.raw`(?:en|el) (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?: pasado)?|(?:el|la) (?:ano|mes|semana) pasad[oa]|hace (?:(?:un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|unos|unas|varios|varias|muchos|muchas|algunos|algunas|\d+) )?(?:anos?|meses|mes|semanas?|tiempo)|en (?:19|20)\d\d`;
/**
 * Grief, and only this, as in English (DIED_LONG_AGO, crisis-third-person.ts): the fall's own
 * clause goes on to a death and then a date, "mi papá se desmayó y murió en marzo". A death alone
 * ("se desmayó y murió") or a date earlier in the sentence never drops the 911 for them.
 */
const DIED_LONG_AGO = new RegExp(
  String.raw`^,? y (?:luego |despues )?(?:murio|fallecio|se murio)(?: ${PLACE})? (?:${DATED})\b`
);
/** Now, still down, or still happening, anywhere in the sentence: "ahora", "hoy", "no se levanta". */
const NOW_OR_STILL = new RegExp(String.raw`\b(?:ahora|ahorita|justo|acaba|${RECENT}|${NOT_UP})\b`);
/** Any fall, even one told with "él" or "ella": a second one in the sentence is never grief. */
const A_FALL = new RegExp(String.raw`\b${DOWN}\b`, 'g');
/** Words read after a fall for the grief check, at most this far: each check stays linear. */
const NEAR = 120;
/** What readsIn leaves where it masked an everyday phrase (English IDIOM_LATER). */
const MASKED = ' _ ';
const nowOrStill = (said: string): boolean => {
  if (NOW_OR_STILL.test(said)) return true;
  let falls = 0;
  for (const _fall of said.matchAll(A_FALL)) if (++falls > 1) return true;
  return false;
};

/**
 * A fall that ends its clause, told after the last "ya está bien" or masked everyday phrase in its
 * sentence, unless its own clause is grief in a sentence that says nothing of now (as in English).
 */
const closeWentDownIn = (said: string): boolean => {
  let explained = said.lastIndexOf(MASKED);
  for (const later of said.matchAll(RECOVERED)) explained = Math.max(explained, later.index);
  let stillHere: boolean | undefined;
  for (const down of said.matchAll(CLOSE_WENT_DOWN)) {
    const end = down.index + down[0].length;
    if (end <= explained) continue;
    if (!DIED_LONG_AGO.test(said.slice(end, end + NEAR))) return true;
    stillHere ??= nowOrStill(said);
    if (stillHere) return true;
  }
  return false;
};
const downAndOut = (said: string): boolean => DOWN_NOT_UP.test(said) || OUT_COLD.test(said);

/** Everyday words built from the same ones: a laughing fit, or not answering messages. */
const EVERYDAY =
  /\bse (?:cayo|desmayo) de (?:la )?risa\b|\bno (?:responde|contesta) (?:a )?(?:mis|sus|los|las|mi|su|el|la) (?:mensajes?|llamadas?|textos?|whatsapps?|correos?|telefono|celular)\b/g;
/**
 * Words that keep it an emergency, whatever everyday words the sentence also holds (English
 * STILL_EMERGENCY): "se cayó en el piso y no contesta el teléfono" is read again whole.
 */
const STILL_SIGNS = String.raw`no (?:se (?:puede )?(?:levanta|mueve|despierta)|despierta|reacciona|puede (?:levantarse|moverse))|piso|suelo|escaleras?|911|ambulancia|paramedicos?|emergencia|sangre|sangrando|convulsion\w*|rcp`;
const STILL = new RegExp(String.raw`\b(?:${NOT_BREATHING}|${STILL_SIGNS})\b`);

/** "Sí" (yes) is no "si" (if) once the accents are off: "Sí, mi mamá se desmayó" still reads. */
const YES = /(?<!\p{L})sí(?!\p{L})/giu;
/** Each sentence read with the everyday words masked, and again whole when a breathing word is left. */
const readsIn = (text: string, read: (said: string) => boolean): boolean =>
  foldSpanish(spanishTail(text).normalize('NFC').replace(YES, 'ok'))
    .split(/[.!?¿¡]+/)
    .some((said) => {
      const masked = said.replace(EVERYDAY, MASKED);
      return read(masked) || (STILL.test(masked) && read(said));
    });

/** Someone close went down, in Spanish: 911 for them first (owner, 2026-11-07). */
export const closeWentDownEs = (text: string): boolean => readsIn(text, closeWentDownIn);
/** Someone is down and not getting up, or not breathing, in Spanish: 911 for them. */
export const emergencyEs = (text: string): boolean => readsIn(text, downAndOut);
