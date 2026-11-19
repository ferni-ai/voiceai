/**
 * The third-person emergency readers in Spanish (#4060, CRISIS_SPANISH_READERS). Someone close
 * went down ("mi esposo se desmayó"), or someone is down and not getting up or not breathing ("mi
 * papá se cayó y no respira", "mi mamá no respira"). Joined to someoneCloseWentDown and
 * thirdPartyEmergency in crisis-third-person.ts, so the reply leads with 911 for them, in Spanish.
 *
 * Read on folded words (foldSpanish: accents off, lower case, a long turn's end only). Every gap
 * is bounded, so each read stays linear. A fall with an object or a story after it ("se cayó de
 * la bici ayer"), one long ago ("hace dos años"), one they are fine from ("ya está bien") or a
 * maybe ("si mi papá se cayera") is never read. A Spanish speaker reviews these lists before the
 * flag is promoted.
 *
 * @module CrisisThirdPersonEs
 */
import { foldSpanish } from '../../utils/fold-spanish.js';

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
const CLOSE_WENT_DOWN = new RegExp(
  String.raw`\b${CLOSE}(?: [a-z]+)? ${SOON}${DOWN}(?: ${PLACE}| ${RECENT}){0,2}${END}`,
  'g'
);
/** Up and well again: "ya está bien", "ya se recuperó". Never "no está bien". */
const RECOVERED =
  /(?<!\bno )\b(?:ya )?estan? (?:bien|mejor)\b|\bya se (?:recupero|levanto|siente mejor)\b/g;

/** A fall that ends its clause, told after the last "ya está bien" in its sentence. */
const closeWentDownIn = (said: string): boolean => {
  let explained = -1;
  for (const later of said.matchAll(RECOVERED)) explained = Math.max(explained, later.index);
  for (const down of said.matchAll(CLOSE_WENT_DOWN))
    if (down.index + down[0].length > explained) return true;
  return false;
};
const downAndOut = (said: string): boolean => DOWN_NOT_UP.test(said) || OUT_COLD.test(said);

/** Everyday words built from the same ones: a laughing fit, or not answering messages. */
const EVERYDAY =
  /\bse (?:cayo|desmayo) de (?:la )?risa\b|\bno (?:responde|contesta) (?:a )?(?:mis|sus|los|las|mi|su|el|la) (?:mensajes?|llamadas?|textos?|whatsapps?|correos?|telefono|celular)\b/g;
/** A word that keeps it an emergency, whatever everyday words the sentence also holds. */
const STILL = new RegExp(String.raw`\b${NOT_BREATHING}\b`);

/** Each sentence read with the everyday words masked, and again whole when a breathing word is left. */
const readsIn = (text: string, read: (said: string) => boolean): boolean =>
  foldSpanish(text)
    .split(/[.!?¿¡]+/)
    .some((said) => {
      const masked = said.replace(EVERYDAY, ' _ ');
      return read(masked) || (STILL.test(masked) && read(said));
    });

/** Someone close went down, in Spanish: 911 for them first (owner, 2026-11-07). */
export const closeWentDownEs = (text: string): boolean => readsIn(text, closeWentDownIn);
/** Someone is down and not getting up, or not breathing, in Spanish: 911 for them. */
export const emergencyEs = (text: string): boolean => readsIn(text, downAndOut);
