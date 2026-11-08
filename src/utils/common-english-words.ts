/**
 * The 1,000 most common English words: words a line can share with almost anything
 * without being about it ("new", "life", "work", "long").
 *
 * Source: wordfreq 3.1.1 by Robyn Speer, `top_n_list('en', 2000)` filtered to [a-z]+ and cut
 * to the first 1,000. wordfreq's data is licensed CC BY-SA 4.0
 * (https://creativecommons.org/licenses/by-sa/4.0/); this list is an adaptation of it and is
 * shared under the same licence. wordfreq's data includes Google Books Ngram Viewer data,
 * OpenSubtitles (http://www.opensubtitles.org/) and SUBTLEX word lists by Marc Brysbaert et
 * al. Upstream: https://github.com/rspeer/wordfreq
 *
 * One list for the whole codebase: import it rather than copying words out of it.
 *
 * @module utils/common-english-words
 */

const WORDS = `
  the to and of a in i is for that you it on with this was be as are have at he not by but from my
  or we an your all so his they me if one can will just like about up out what has when more do no
  were who had their there her which time get been would she new people how some also them now
  other its our than good only after first him into know see two make over think any then could
  back these us want because go well said way most much very where even should may here need
  really did right work year years being day too going before off why made still take got many
  never those life say world down great through last s while best such love man home long look
  something use same used both every am come part state three around between always better find
  help high little old since another does own things under during game thing give house place
  school again next each mr without against end found must show big feel sure team ever family
  keep might please put money free second someone away left number city days lot name night play
  until company doing few let real called different having set thought done however getting god
  government group looking public top women business care start system times week already anything
  case nothing person today change enough everything full live making point read told yet bad four
  hard mean once support tell including music power seen states stop water based believe call head
  men national small took white came far job side though try went yes actually american later less
  line order party run says service country open season shit thank children everyone general
  trying united using area black d following law makes together war whole car face five kind maybe
  per president story working course games health hope important least means news within able book
  early friends information local oh post t thanks video young ago others social talk court fact
  given guys half hand level mind often single become body coming control death food guy hours
  office pay problem south true almost fuck history known large lost m research room several
  started taking university win wrong along anyone else girl john matter pretty remember air bit
  friend hit needs nice playing probably saying understand yeah york class close comes idea
  international looks past possible wanted b cause due happy human members months move question r
  series wait woman ask community data late leave north saw special watch c either fucking future
  light low million morning police short stay taken age buy deal rather reason red report soon
  third turn whether among check development form further heart minutes myself services yourself
  act although asked child fire fun living major media phone players art behind building easy
  gonna market near non plan political quite six talking west works according available e
  education final former front kids list ready sometimes son street bring college current example
  experience heard london meet program type baby chance father march process song study word
  across action clear gave gets himself month outside self students words board cost cut dr field
  held instead main moment mother road seems thinking town wants de department energy fight fine
  force hear issue played points price re rest results running shows space summer term wife
  america beautiful date goes killed land miss project sex shot site strong account co especially
  eyes include june parents period position record similar total w above club common died film
  happened knew lead likely military perfect personal security share st tv won x april center
  county couple dead english happen hold industry inside issues online player private problems
  return rights sense star test view weeks break british companies event higher hour l member
  middle needed present result sorry takes training wish answer boy design finally girls gold gone
  guess interest july king learn policy society added al alone average bank brought certain church
  east hands hot longer medical movie original park performance press received role sent
  themselves tried worked worth areas became bill books cool director exactly giving ground
  meeting n provide questions relationship september sound source usually value evidence follow
  lives official ok production rate reading round save stand stuff tax whatever amount blue
  countries david drive eat fall fast federal feeling felt green league management match model p
  picture size step trust central changes england forward groups hey key mom o page paid range
  review science trade uk upon various attention brother cannot character chief cup football hate
  james led looked lower natural october property quality send style u vote amazing august blood
  china complete dog economic hell involved itself language lord november oil related serious
  stage terms title add article attack born damn decided decision enjoy entire french january kill
  met perhaps poor release situation technology turned website written choice code considered
  continue council cover currently door election european events f financial foreign hair increase
  legal lose michael pick race seem seven sign simple simply staff super union walk washington bed
  began built career changed crazy daily daughter december die difficult figure hospital knows
  loss modern ones paper parts popular published safe starting systems version voice whose writing
  army australia earth forget goal h huge internet listen okay practice rules sea sir success
  towards v waiting ways access base below created deep followed la lol mark missing offer pass
  professional released risk schools sleep table ten truth ball box build card cases dark district
  europe george india mine minister note percent piece products recent seeing straight visit wall
  wanna wrote allowed boys culture etc fans february gives growth included married officer pain
  paul places respect response river rock shall speak specific standard tonight write y album
  century charge cold create effect eight except eye funny ii limited moving network peace
  provided recently required sales spent store student tomorrow track via watching weight addition
  ahead allow
`;

/** Lower-case, letters only. */
export const COMMON_ENGLISH_WORDS: ReadonlySet<string> = new Set(
  WORDS.split(/\s+/).filter(Boolean)
);

/** Endings to take off before looking a word up: "planned" ~ "plan", "kids" ~ "kid". */
const INFLECTIONS: ReadonlyArray<[RegExp, string]> = [
  [/([b-df-hj-np-tv-z])\1(?:ed|ing)$/, '$1'],
  [/ies$/, 'y'],
  [/(?:es|s|ed|ing|ly)$/, ''],
  [/(?:ed|ing)$/, 'e'],
];

/**
 * True when `word` (any case), a plain inflection of it or its plural is one of the common
 * words. The plural, because callers often singularise first ("kids" -> "kid").
 */
export function isCommonEnglishWord(word: string): boolean {
  const w = word.toLowerCase();
  if (COMMON_ENGLISH_WORDS.has(w) || COMMON_ENGLISH_WORDS.has(`${w}s`)) return true;
  return INFLECTIONS.some(([ending, to]) => {
    const base = w.replace(ending, to);
    return base !== w && base.length >= 3 && COMMON_ENGLISH_WORDS.has(base);
  });
}
