/**
 * A stated age under 18, in Spanish (#4060, CRISIS_SPANISH_READERS): "tengo 14 años", "tengo
 * catorce años", "soy menor de edad", "soy menor". Joined to statesUnder18 (minor-care-detect.ts),
 * so every reader of a caller's age reads these too.
 *
 * Never a time ("tengo 15 años trabajando aquí", "tengo 14 años de casada"), someone else's age
 * ("mi hijo tiene 14 años", "mi hijo es menor de edad"), a past age ("cuando tenía 15 años"),
 * someone else's words ("mi mamá dice que tengo 14 años"), a denial ("no soy menor de edad"), a
 * comparison ("soy menor que mi hermana") or a joke ("jaja"). Read on folded words (foldSpanish).
 * A Spanish speaker reviews these before the flag is promoted.
 *
 * @module utils/minor-care-detect-es
 */
import { foldSpanish } from './fold-spanish.js';

const WORD_AGES: Record<string, number> = {
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
};
const AGE = `(\\d{1,2}|${Object.keys(WORD_AGES).join('|')})`;
/** What may follow a stated age or "menor": the end, a pause, or a joining word. Never "de casada". */
const AFTER = String.raw`(?=\s*(?:$|[.,!?;:]|(?:y|pero|ahora|ahorita|nomas|apenas|asi que|pues|todavia|aun)\b))`;
/** Someone else's words about the caller: "dice que tengo 14 años". */
const NOT_REPORTED = String.raw`(?<!\b(?:dice|dijo|dicen|dijeron|cree|creen|piensa|piensan) que )`;
/** "Tengo 14 años", "tengo apenas quince años y...": the caller's own age now. */
const TENGO = new RegExp(
  String.raw`${NOT_REPORTED}\btengo (?:apenas |solo |nomas |ya )?${AGE} anos\b(?: y medio)?${AFTER}`,
  'g'
);
/** "Soy menor de edad", "soy menor de 18 años", "soy menor": never "no soy menor", never "menor que". */
const SOY_MENOR = new RegExp(
  String.raw`(?<!\bno )\bsoy (?:todavia |aun |apenas )?menor(?: de (?:edad|18|dieciocho)(?: anos)?)?${AFTER}`
);
/** Joking, so not a stated age: "jaja", "es broma", "en años de perro". */
const LAUGH = /\b(?:ja(?:ja)+h?|je(?:je)+|es broma|de broma|en anos de perro)\b/;

/** The caller says, in Spanish and about themselves, that they are under 18. */
export function statesUnder18Es(text: string): boolean {
  const said = foldSpanish(text);
  if (LAUGH.test(said)) return false;
  if (SOY_MENOR.test(said)) return true;
  for (const m of said.matchAll(TENGO)) {
    const age = WORD_AGES[m[1] ?? ''] ?? Number(m[1]);
    if (age >= 6 && age < 18) return true;
  }
  return false;
}
