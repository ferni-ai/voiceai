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
 *    speech-to-text writes a dictated address), is one plain label with a
 *    .com/.org/.net/.edu/.gov ending, and is not a mail host.
 * 2. The word before "at" (exactly as written, so never a capitalised name)
 *    fits one small frame below: goods from a closed list after a
 *    purchase verb ("bought shoes", "ordered a lamp"), a relative at a .edu
 *    ("my son"), a word that only reads as a place ("sold out", "on sale",
 *    "works", "is"), and so on. A small explicit list, not a guess about what a
 *    mailbox looks like, and no frame word is a mailbox name (team@, info@...).
 * 3. No contact word ("email", "send", "to", "cc"...) comes in the five words
 *    before it.
 *
 * holding.ts adds one more: no " at <domain>" may follow ("my son at
 * harvard.edu at gmail.com" is one address).
 *
 * Anything else blanks: an odd blank only hides text, a leak shows an address.
 *
 * @module services/follow-through/ordinary-website
 */

const set = (words: string): ReadonlySet<string> => new Set(words.split(/\s+/u));

/** One label, a generic ending; "jo.smith.com", "acme.io" and "dmv.ca.gov" don't qualify. */
const SITE = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.(com|org|net|edu|gov)$/iu;

const MAIL_HOSTS = set(`gmail googlemail yahoo ymail rocketmail hotmail outlook live msn
  icloud me mac aol aim proton protonmail pm hey mail email gmx zoho yandex fastmail tutanota
  tuta comcast att verizon sbcglobal cox earthlink charter optonline qq naver inbox hushmail
  posteo mailbox`);

/** A word that makes the next "at <domain>" a contact: "email my boss at ...", "send it to ...". */
const CONTACT = set(`email e-mail emailed emailing mail mailed write wrote writing text texted
  texting message messaged dm cc bcc ping pinged contact contacted reach reached forward
  forwarded send sent sending reply replied respond ask asked tell told notify invite invited
  call called ring rang address addresses to from via inbox handle venmo zelle paypal cashapp`);

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
/** Only at a school: "son@family.com" can be a real family address. */
const RELATIVE = set('son daughter kid sister brother cousin niece nephew');
const COLLEAGUE = set('boss friend coworker colleague roommate');
/** Words that only read as a place, wherever they come. */
const PLACE = set(`available works worked working interned studies studied studying teaches
  taught look looked looking is are was were it's she's he's they're we're that's`);
const CHEAPER = set('lower cheaper higher less pricier');
const BEFORE_CHEAPER = set("is are was were much way even lot bit it's they're that's");
const BEFORE_UP = set(`sign signed signing apply applied pay paid register registered order
  ordered shop shopped book booked buy bought check checked log logged renew renewed`);
const BEFORE_MORE = set('learn read see out');

const WORD = /[\p{L}\p{N}'-]+/gu;

/** Does `local` fit a frame, with `p1` the word right before it and `p2` the one before that? */
function fitsFrame(local: string, p1: string, p2: string, ending: string): boolean {
  if (PLACE.has(local)) return true;
  if (RELATIVE.has(local)) return POSSESSIVE.has(p1) && ending === 'edu';
  if (COLLEAGUE.has(local)) return POSSESSIVE.has(p1);
  if (local === 'it' || local === 'them') return BUY.has(p1) || FIND.has(p1);
  if (BOOKABLE.has(local) && BOOK.has(p1)) return true;
  if (GOODS.has(local)) {
    const verb = DETERMINER.has(p1) ? p2 : p1;
    if (BUY.has(verb) || FIND.has(verb)) return true;
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
 * True when "<local> at <domain>" reads as a website, not an address. `before`
 * is the text before `local` (only its last few words are read); `domain` is the
 * part after "at", written with a literal ".".
 */
export function isOrdinaryWebsite(before: string, local: string, domain: string): boolean {
  const site = SITE.exec(domain);
  if (!site || MAIL_HOSTS.has(site[1]!.toLowerCase())) return false;
  // Exact, case-sensitive lookups in closed lists: "Sarah", "Shoes", "team", "jo.lee" fit no frame.
  const word = local.replace(/’/gu, "'");
  const tail = before.slice(-80);
  const words = tail.replace(/’/gu, "'").toLowerCase().match(WORD) ?? [];
  // A word cut by the slice is only part of one.
  if (before.length > tail.length) words.shift();
  const last = words.slice(-5);
  if (last.some((w) => CONTACT.has(w))) return false;
  return fitsFrame(word, last.at(-1) ?? '', last.at(-2) ?? '', site[2]!.toLowerCase());
}
