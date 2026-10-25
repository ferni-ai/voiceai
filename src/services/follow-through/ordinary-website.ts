/**
 * When "<word> at <domain>" is a shop, a school or a workplace written as a
 * website ("bought shoes at zappos.com", "my son at harvard.edu", "sold out at
 * target.com") and not an email address said out loud.
 *
 * Contact blanking (holding.ts) treats every "<word> at <domain>" as an address,
 * because any word before "at" can be a mailbox (team@, sales@, info@, me@...)
 * and every earlier exemption keyed on that word leaked a real one. This lets
 * one back only when every guard holds:
 *
 * 1. The domain is written with a "." (never a said "dot": that is how
 *    speech-to-text writes a dictated address), is one plain ASCII label with a
 *    .com/.org/.net/.edu/.gov ending, is not a mail host, and nothing but a
 *    space, the end, or sentence punctuation then a space comes after it
 *    ("acme.com.br", "acme.com/x" blank).
 * 2. The word before "at", exactly as written (so never a capitalised name),
 *    fits one small frame: goods from a closed list after a purchase verb
 *    ("bought shoes", "ordered a lamp"), "it" after one, a relative at a .edu
 *    ("my son"), a word that only reads as a place ("sold out", "on sale",
 *    "works", "is"). No frame word is a mailbox name (team@, info@...).
 * 3. Fail closed on what comes before: the frame starts the text or follows a
 *    space, and every word before it is on a short list (pronouns, articles,
 *    the frame verbs, a few time words). Any other word, "email", "cc'd",
 *    "whatsapp", "loop in", a name, a lookalike letter, could take a person as
 *    its object, so the match blanks. A relative needs its possessive to be
 *    the whole text before it ("my son at harvard.edu", never "email my son ...").
 *    A text longer than 120 characters before the frame blanks.
 *
 * holding.ts then searches the kept domain again: an address that starts in it
 * ("my son at harvard.edu at gmail.com", "zappos.com (at) gmail.com") blanks the
 * whole website with it.
 *
 * Anything else blanks: an odd blank only hides text, a leak shows an address.
 *
 * @module services/follow-through/ordinary-website
 */

const set = (words: string): ReadonlySet<string> => new Set(words.split(/\s+/u));

/** One ASCII label, a generic ending. No `u` flag, so `i` folds only ASCII letters. */
const SITE = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.(com|org|net|edu|gov)$/i;
/** What may follow a kept site (callers pass at most 2 chars): the end, a space, or one mark then either. */
const AFTER_SITE = /^(?:$|\s|[.,;:!?](?:$|\s))/u;
/** More text than this before the frame blanks; callers may pass just the last MAX_BEFORE + 1 chars. */
export const MAX_BEFORE = 120;

const MAIL_HOSTS = set(`gmail googlemail yahoo ymail rocketmail hotmail outlook live msn
  icloud me mac aol aim proton protonmail pm hey mail email gmx zoho yandex fastmail tutanota
  tuta comcast att verizon sbcglobal cox earthlink charter optonline qq naver inbox hushmail
  posteo mailbox duck mailfence rediffmail web libero seznam laposte orange`);

const BUY = set('bought buy buying ordered order ordering purchased purchase');
const FIND = set('saw seen found got get grabbed picked read watch watched');
const DETERMINER = set('a an the some new');
/**
 * Things bought at a shop. A closed list: a determiner alone ("ordered a kofi at ...") is no
 * frame, and words that are also shop mailboxes (tickets@, gifts@, orders@) stay out.
 */
const GOODS = set(`shoes sneakers boots clothes shirt shirts jeans dress dresses flowers groceries
  presents toys toy furniture glasses sunglasses snacks coffee plants
  paint vitamins food pizza lamp lamps couch sofa chair chairs desk rug bed mattress laptop phone
  tv bike headphones charger case jacket coat`);
const BOOK = set('booked book booking reserved');
const BOOKABLE = set('room rooms flight flights seats table hotel');
const POSSESSIVE = set('my his her our their your');
/** Only at a school, and only right after a possessive that starts the text. */
const RELATIVE = set('son daughter kid sister brother cousin niece nephew');
/** Words that only read as a place. These carry their subject, or need none. */
const PLACE = set(`available look looked looking it's she's he's they're we're that's`);
/** Place verbs: kept only after a subject ("he works at", never a bare "works at kimfamily.com"). */
const PLACE_VERB = set(`works worked working interned studies studied studying teaches taught
  is are was were`);
const CHEAPER = set('lower cheaper higher less pricier');
const BEFORE_CHEAPER = set("is are was were much way even lot bit it's they're that's");
const BEFORE_UP = set(`sign signed signing apply applied pay paid register registered order
  ordered shop shopped book booked buy bought check checked log logged renew renewed`);
const BEFORE_MORE = set('learn read see out');

/**
 * Every word allowed before a frame: none takes a person as its object except through a
 * frame that rules that out ("bought shoes", never "bought my son").
 */
const SAFE_BEFORE = new Set([
  ...set(`i he she we they you it it's he's she's they're we're the a an some new
    just also finally today yesterday already prices recipe tickets sneakers on in
    is are was were out find learn see sign apply pay register check log renew shop sold
    available`),
  ...BUY,
  ...FIND,
  ...BOOK,
]);

/** Does `local` fit a frame, with `p1` the word right before it and `p2` the one before that? */
function fitsFrame(local: string, p1: string, p2: string, ending: string): boolean {
  if (PLACE.has(local)) return true;
  if (PLACE_VERB.has(local)) return p1 !== '';
  // A possessive is allowed only as the first word, so this is "my son" with nothing before it.
  if (RELATIVE.has(local)) return POSSESSIVE.has(p1) && ending === 'edu';
  if (local === 'it') return BUY.has(p1) || FIND.has(p1);
  if (BOOKABLE.has(local)) return BOOK.has(p1);
  if (GOODS.has(local)) {
    const verb = DETERMINER.has(p1) ? p2 : p1;
    return BUY.has(verb) || FIND.has(verb);
  }
  if (CHEAPER.has(local)) return BEFORE_CHEAPER.has(p1);
  if (local === 'sale') return p1 === 'on';
  if (local === 'out') return p1 === 'sold';
  if (local === 'stock') return p1 === 'in';
  if (local === 'more') return BEFORE_MORE.has(p1);
  if (local === 'up' || local === 'online') return BEFORE_UP.has(p1);
  if (local === 'now') return p1 === 'available';
  return false;
}

/**
 * True when "<local> at <domain>" reads as a website, not an address. `before` is
 * the text before `local`, `after` the next 2 chars after the domain, `domain` the part
 * after "at", written with a literal ".".
 */
export function isOrdinaryWebsite(
  before: string,
  local: string,
  domain: string,
  after: string
): boolean {
  const site = SITE.exec(domain);
  if (!site || MAIL_HOSTS.has(site[1]!.toLowerCase()) || !AFTER_SITE.test(after)) return false;
  if (before.length > MAX_BEFORE || (before !== '' && !/\s$/u.test(before))) return false;
  const words: string[] = [];
  for (const raw of before.split(/\s+/u)) {
    if (raw === '') continue;
    const w = raw.replace(/’/gu, "'").replace(/,$/u, '').toLowerCase();
    if (!SAFE_BEFORE.has(w) && !(POSSESSIVE.has(w) && words.length === 0)) return false;
    words.push(w);
  }
  // Exact, case-sensitive lookups in closed lists: "Sarah", "Shoes", "team", "jo.lee" fit no frame.
  const word = local.replace(/’/gu, "'");
  return fitsFrame(word, words.at(-1) ?? '', words.at(-2) ?? '', site[2]!.toLowerCase());
}
