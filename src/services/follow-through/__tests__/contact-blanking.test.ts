/**
 * withoutContactDetails, case by case: every phone number and email address a
 * person might type or say is blanked, and dates, times, money, short
 * reference numbers and ordinary prose come back exactly as written. It feeds
 * the follow-through list (toHeldItem) and the "on it" view, so a miss here
 * shows someone's number in the app. All data is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { MAX_TEXT, withoutContactDetails } from '../holding.js';

const SHOULD_BLANK: ReadonlyArray<readonly [string, string]> = [
  // Brackets: the area code goes with the number, and no stray bracket is left.
  ['call (555) 0132 now', 'call a number now'],
  ['call (415) 555 0132', 'call a number'],
  ['The number is (415)555-0132', 'The number is a number'],
  ['call (415) 555-0132 today', 'call a number today'],
  ['call me (415 555 0132)', 'call me (a number)'],
  ['ring (+44) 20 7946 0958', 'ring a number'],
  ['call +1 (415) 555-0132.', 'call a number.'],
  // Extensions go with the number.
  ['call 415.555.0132x99 please', 'call a number please'],
  ['call 415-555-0132 ext. 99', 'call a number'],
  ['call 415-555-0132 ext 12 today', 'call a number today'],
  ['ring +44 20 7946 0958 ext 12', 'ring a number'],
  ['dial 415 555 0132 extension 4410', 'dial a number'],
  ['dial 415 555 0132 X 7', 'dial a number'],
  ['dial 4155550132 ext:301', 'dial a number'],
  // A date that stays doesn't carry a number written straight after it.
  ['on 2026-11-01 x 415 555 0132', 'on 2026-11-01 x a number'],
  // Any script's digits.
  ['call ４１５５５５０１３２', 'call a number'],
  ['call ４１５－５５５－０１３２ now', 'call a number now'],
  ['call （４１５）５５５－０１３２', 'call a number'],
  ['call ٤١٥٥٥٥٠١٣٢', 'call a number'],
  ['call ٤١٥ ٥٥٥ ٠١٣٢ please', 'call a number please'],
  ['call ۴۱۵۵۵۵۰۱۳۲', 'call a number'],
  ['call ४१५५५५०१३२', 'call a number'],
  ['ring ＋４４ ２０ ７９４６ ０９５８', 'ring a number'],
  // The plain shapes the old pattern already caught still go.
  ['call +1 415-555-0132 about the car', 'call a number about the car'],
  ['call 555-0132', 'call a number'],
  ['call 1-800-555-0199 tomorrow', 'call a number tomorrow'],
  ['call 415 555 0132 or 415 555 0199', 'call a number or a number'],
  // Spelled-out numbers, 7+ digits.
  ['four one five five five five zero one seven seven', 'a number'],
  ['call four one five five five five zero one seven seven', 'call a number'],
  ['her number is five five five, oh one three two', 'her number is a number'],
  ['Call Four-One-Five Five-Five-Five Zero-One-Three-Two now', 'Call a number now'],
  ['call 415 five five five 0132', 'call a number'],
  ['call four one five 555 0132', 'call a number'],
  ['call eight six seven five three oh nine.', 'call a number.'],
  // Emails said out loud.
  ['email name at example dot com', 'email an email address'],
  ['email jo dot lee at example dot com today', 'email an email address today'],
  ['write to Jo AT Example DOT Com', 'write to an email address'],
  ['email jo (at) example (dot) com', 'email an email address'],
  ['email jo [at] example [dot] org', 'email an email address'],
  ['email jo(at)example.com', 'email an email address'],
  ['email jo at mail dot example dot co dot uk', 'email an email address'],
  ['email jo_lee99 at example dot io please', 'email an email address please'],
  ['email jo@example.com the form', 'email an email address the form'],
  ['call 415 555 0132 or Vet@Example.COM', 'call a number or an email address'],
  // A match kept as prose doesn't hide the address after it.
  ['email her at jo dot me at gmail dot com', 'email an email address'],
  ['met Sarah at jo dot kim at gmail dot com', 'met an email address'],
  // A dotted or many-part name is always an address.
  ['jo.kim at example dot org', 'an email address'],
  // An "@" with a said domain, any width.
  ['email jo ＠ acme dot io', 'email an email address'],
  ['email jo @ acme dot io', 'email an email address'],
  ['ana dot ruiz ﹫ gmail dot com', 'an email address'],
  ['email jane＠gmail．com', 'email an email address'],
  ['email ana at dot dot org', 'email an email address'],
  ['email ana (at) dot dot dev', 'email an email address'],
  ['ask the jo dot kim at example dot org', 'ask the an email address'],
  // A mailbox word is a name like any other.
  ['contact at acme dot com', 'an email address'],
  ['write to info at acme dot io', 'write to an email address'],
  ['email us at acme dot com', 'email an email address'],
  ['jobs at acme dot com is open', 'an email address is open'],
  ['hello at acme dot dev', 'an email address'],
  ['support at acme.com', 'an email address'],
  // Sending something to a name at a domain makes it an address, written dot or not.
  ['email kofi at acme.com', 'email an email address'],
  ['reach kofi at acme.com today', 'reach an email address today'],
  ['send the deck to kofi at acme.com', 'send the deck to an email address'],
  ['jane at acme.com', 'an email address'],
  ['email interns at apple.com', 'email an email address'],
  ['write to staff at acme.com', 'write to an email address'],
  ['met jane at gmail.com', 'met an email address'],
  // A phone number shaped like a date range is a number.
  ['call 2026-2027-1234', 'call a number'],
  ['call 2026-2027', 'call a number'],
  ['call 2026/2040', 'call a number'],
  ['call 2027/2026', 'call a number'],
  ['call 1999/2000/2001', 'call a number'],
  ['call 555/555/0199', 'call a number'],
  ['call 04/15/5550', 'call a number'],
  ['call 2026-10-24–2032-12-30', 'call a number'],
  ['call 2026-10-24-2026-10-25-2026-10-26', 'call a number'],
  // Seven said digits are a number, counting or not.
  ['one two three four five six seven', 'a number'],
  ['five five five one two one two', 'a number'],
  // Emails: a written dot after a plain "at", a spaced or fullwidth "@", any ending.
  ['email jane at gmail.com', 'email an email address'],
  ['email jane at mail.example.co.uk today', 'email an email address today'],
  ['email jane @ gmail.com today', 'email an email address today'],
  ['email jane@ gmail.com', 'email an email address'],
  ['email jane＠gmail.com', 'email an email address'],
  ['email jane ＠ gmail．com', 'email an email address'],
  ['email jo at example dot tv', 'email an email address'],
  ['email jo at example dot xyz', 'email an email address'],
  ['email jo at example dot app', 'email an email address'],
  ['email jo at example dot ai', 'email an email address'],
  ['email jo at example dot dev', 'email an email address'],
  ['email jo at example dot studio', 'email an email address'],
  ['email jane at acme dot io', 'email an email address'],
  ['email jane at acme dot co dot uk', 'email an email address'],
  ['email jo at example dot co', 'email an email address'],
  ['email jo (at) example (dot) shop', 'email an email address'],
  ["email o'brien at gmail dot com", 'email an email address'],
  ['email Sarah at google dot com', 'email an email address'],
  // Phones: any dash, a slash, an underscore or a backslash between the groups.
  ['call 415/555/0132', 'call a number'],
  ['call 415–555–0132', 'call a number'],
  ['call 415—555—0132 now', 'call a number now'],
  ['call 415‐555‐0132', 'call a number'],
  ['call 415−555−0132', 'call a number'],
  ['call 415_555_0132', 'call a number'],
  ['call 415 \\ 555 \\ 0132', 'call a number'],
  ['call 415\\555\\0132', 'call a number'],
  ['call (415)/555/0132', 'call a number'],
  // Said digits: "o" for zero, and groups split by ";" or a dash.
  ['four one five five five five o one seven seven', 'a number'],
  ['call four one five; five five five; oh one three two', 'call a number'],
  ['call four one five – five five five – o one three two', 'call a number'],
  // A year counts when the said digits aren't a count.
  ['call five five five 2026', 'call a number'],
  ['call four one five 555 2026', 'call a number'],
];

/**
 * The leak floor: each of these was blanked by #2716 (bee3589df) and must stay
 * blanked. The first ones were let through by a guard or a match that used up
 * the name ("her at ana dot ruiz" hid "ana dot ruiz at gmail dot com").
 */
const LEAK_FLOOR: ReadonlyArray<readonly [string, string]> = [
  ['send the deck to anna and kofi at gmail dot com', 'send the deck to anna and an email address'],
  ['cc with kofi at gmail dot com', 'cc with an email address'],
  ['lunch with kofi at gmail dot com', 'lunch with an email address'],
  ['email her at ana dot ruiz at gmail dot com', 'email an email address'],
  ['call him at jo dot kim at yahoo dot com', 'call an email address'],
  ['write to us at sales dot team at acme dot com', 'write to an email address'],
  ['reach me at jo at gmail dot com', 'reach me at an email address'],
  ['contact us at info at acme dot com today', 'contact us at an email address today'],
  ['look at jo dot lee at example dot com', 'an email address'],
  // Said digits that don't count up from one (or down to one) are a number, year or not.
  ['four five six 2026', 'a number'],
  ['nine eight seven 2024', 'a number'],
  ['two three four five six seven 2026', 'a number'],
  ['zero one two 2026', 'a number'],
  ['five four three 2026', 'a number'],
  ['one two three 2026 0132', 'a number'],
  // A said digit is never a domain ending, so the number before "(at)" still goes whole.
  ['call 415 555 0132 (at) six dot two', 'call a number (at) six dot two'],
  // A year counts after any count: "one two three 2026" is seven digits.
  ['one two three 2026', 'a number'],
  ['one two three 1999', 'a number'],
  // Round 3's verify: #2716 blanked each of these, and 5852dc045's prose
  // exemptions (a determiner before the name, a spoken mail host, a group noun,
  // a count with a year) let them through.
  ['staff at acme dot com', 'an email address'],
  ['people at acme dot com', 'an email address'],
  ['friends at acme dot org', 'an email address'],
  ['kids at acme dot org', 'an email address'],
  ['students at acme dot edu', 'an email address'],
  ['engineers at acme dot io', 'an email address'],
  ['employees at acme dot com', 'an email address'],
  ['interns at acme dot com', 'an email address'],
  ['folks at acme dot com', 'an email address'],
  ['student at acme dot edu', 'an email address'],
  ['intern at acme dot io', 'an email address'],
  ['staff at gmail dot com', 'an email address'],
  ['friends at gmail dot com', 'an email address'],
  ['kids at yahoo dot com', 'an email address'],
  ['people at hotmail dot com', 'an email address'],
  ['the staff at acme dot com', 'the an email address'],
  ['ask staff at acme dot com', 'ask an email address'],
  ['ask the staff at acme dot com', 'ask the an email address'],
  ['write to the staff at acme dot com', 'write to the an email address'],
  ['contact the staff at acme dot com', 'contact the an email address'],
  ['email the staff at acme dot com', 'email the an email address'],
  ['email the team at acme dot io', 'email the an email address'],
  ['contact the team at acme dot com', 'contact the an email address'],
  ['email their support at acme dot io', 'email their an email address'],
  ['contact their support at acme dot io', 'contact their an email address'],
  ['write to our sales at acme dot com', 'write to our an email address'],
  ['cc my landlord at gmail dot com', 'cc my an email address'],
  ['send it to the jobs at acme dot io', 'send it to the an email address'],
  ['message your hr at acme dot com', 'message your an email address'],
  ['email our billing at acme dot com', 'email our an email address'],
  ['reach their team at acme dot co dot uk', 'reach their an email address'],
  ['contact my cousin at netflix dot com', 'contact my an email address'],
  ['forward it to the people at acme dot com', 'forward it to the an email address'],
  ['send the invite to the interns at acme dot com', 'send the invite to the an email address'],
  ['email your friends at acme dot org', 'email your an email address'],
  ['email the support at acme dot io', 'email the an email address'],
  ['email our team at acme dot io', 'email our an email address'],
  ['send it to our support at acme dot io', 'send it to our an email address'],
  ['email a team at acme dot io', 'email a an email address'],
  ['send this to their office at acme dot com', 'send this to their an email address'],
  ['reply to their info at acme dot io', 'reply to their an email address'],
  ['my jo at gmail dot com', 'my an email address'],
  ['met jane at gmail dot com', 'met an email address'],
  ['the jane at gmail dot com', 'the an email address'],
  ['paid jane at gmail dot com', 'paid an email address'],
  ['paid sam at gmail dot com 40 on zelle', 'paid an email address 40 on zelle'],
  ['saw kofi at hotmail dot com', 'saw an email address'],
  ['found kofi at yahoo dot com', 'found an email address'],
  ['got kofi at yahoo dot com', 'got an email address'],
  ['visit jo at acme dot io', 'visit an email address'],
  ['paid jane at icloud dot com', 'paid an email address'],
  ['met kofi at outlook dot com', 'met an email address'],
  ['booked jo at gmail dot com', 'booked an email address'],
  ['ordered jo at gmail dot com', 'ordered an email address'],
  ['my sam at gmail dot com', 'my an email address'],
  ['this jo at gmail dot com', 'this an email address'],
  ['their kofi at yahoo dot com', 'their an email address'],
  ['paid jane at proton dot me', 'paid an email address'],
  ['met jo at hey dot com', 'met an email address'],
  ['met jo at me dot com', 'met an email address'],
  ["jane's at gmail dot com", 'an email address'],
  ["jo's at acme dot io", 'an email address'],
  ['kofi’s at gmail dot com', 'an email address'],
  ["i'm at gmail dot com", 'an email address'],
  ['lunch at gmail dot com', 'an email address'],
  ['coffee at gmail dot com', 'an email address'],
  ['one two three four five six 2026', 'a number'],
  ['six five four three two one 2026', 'a number'],
  ['one two three four 2026', 'a number'],
  ['four three two one 2026', 'a number'],
  ['three two one 2026', 'a number'],
  ['one two three four five six 1999', 'a number'],
  ['one two three, 2026, four five six', 'a number'],
  ['one 2026 two 2027 three 2028', 'a number'],
  ['one two three 2026 four', 'a number'],
  ['one 2015 two 2019 three 89', 'a number'],
  ['five four three two one 2026 ext 12', 'a number ext 12'],
];

/**
 * Declared over-blanks: main before #2716 left each of these as written, and
 * each is blanked now, on purpose. Any "<word> at <domain>" shape is an address,
 * whatever comes before it (a name-side exemption always let a real one
 * through), unless it is an ordinary website (WEBSITE_KEPT): a said "dot", a
 * mailbox word ("team", "info", "us", "jobs", "deals") or a word with no
 * allow-listed frame ("apply", "reviews", "details") still blanks. An "@" with a domain is never prose, seven said digits are a number,
 * a year's included ("one, two, three, 2026"), and two bare years joined by
 * a dash are a number. An over-blank only hides text from the app; a leak
 * shows someone's address.
 */
const OVER_BLANKED: ReadonlyArray<readonly [string, string]> = [
  ['steps one, two, three, 2026 plan', 'steps a number plan'],
  ['steps one, two, three, 2026', 'steps a number'],
  ['remember steps three two one, 2027 kickoff', 'remember steps a number kickoff'],
  ['one, two, three, 2026, 2027', 'a number'],
  ['got tickets at ticketmaster.com for friday', 'got an email address for friday'],
  ['found deals at target.com', 'found an email address'],
  ['We grabbed tea at bluebottle dot cafe', 'We grabbed an email address'],
  ['Tom’s at amazon dot com now', 'an email address now'],
  ['My cousin at netflix dot com said hi', 'My an email address said hi'],
  ['lunch @ cafe.co tomorrow', 'an email address tomorrow'],
  ['the team at google.com shipped it', 'the an email address shipped it'],
  ['interns at apple.com start monday', 'an email address start monday'],
  ['the 2019–2020 season', 'the a number season'],
  ['she bought shoes at nordstrom dot com', 'she bought an email address'],
  ['check prices at walmart.com', 'check an email address'],
  ['tickets at stubhub.com', 'an email address'],
  ['deals at bestbuy.com', 'an email address'],
  ['more info at acme.com', 'more an email address'],
  ['details at acme.com', 'an email address'],
  ['visit us at acme.com', 'visit an email address'],
  ['apply at acme.com', 'an email address'],
  ['donate at redcross.org', 'an email address'],
  ['register at acme.org', 'an email address'],
  ['listen at npr.org', 'an email address'],
  ['order at acme.com', 'an email address'],
  ['shop at etsy.com', 'an email address'],
  ['her team at nasa.gov won', 'her an email address won'],
  ['best at chess dot com', 'an email address'],
  ['deals at amazon dot com', 'an email address'],
  ['news at cnn dot com', 'an email address'],
  ['tickets at stubhub dot com', 'an email address'],
  ['available at amazon dot com', 'an email address'],
  ['more info at acme dot com', 'more an email address'],
  ['learn more at acme dot com', 'learn an email address'],
  ['sign up at acme dot com', 'sign an email address'],
  ["she's at amazon dot com now", 'an email address now'],
  ['he works at google dot com', 'he an email address'],
  ['my brother at microsoft dot com', 'my an email address'],
  ['the guy at apple dot com', 'the an email address'],
  ['his team at nasa.gov won', 'his an email address won'],
  ['prices at walmart dot com', 'an email address'],
  ['recipes at allrecipes dot com', 'an email address'],
  ['courses at coursera dot org', 'an email address'],
  ['jobs at google dot com', 'an email address'],
  ['careers at acme.com', 'an email address'],
  ['events at eventbrite.com', 'an email address'],
  ['renew at dmv.ca.gov', 'an email address'],
  ['more at nytimes.com', 'an email address'],
  ['photos at flickr.com', 'an email address'],
  ['reviews at yelp.com', 'an email address'],
  ['she posted at instagram.com', 'she an email address'],
  ['dinner @ noodle.bar friday', 'an email address friday'],
  ['the 1999–2000 season', 'the a number season'],
  ['seven six five four three two one liftoff', 'a number liftoff'],
  ['one two three four five six seven eight', 'a number'],
  ['look at google dot com later', 'an email address later'],
  ['the deal at example.com ends friday', 'the an email address ends friday'],
  ["he's at amazon dot com", 'an email address'],
  ['she’s at google dot com now', 'an email address now'],
  ["mom's at work dot com today", 'an email address today'],
  ['lunch at netflix dot com', 'an email address'],
  ['job interview at google dot com', 'job an email address'],
  ['met Sarah at google dot com', 'met an email address'],
  ['saw Jo at example dot com', 'saw an email address'],
  ['look at jane dot com', 'an email address'],
  ['three two one, 2026 here we go', 'a number here we go'],
  ['students at mit.edu got in', 'an email address got in'],
  ['find us online or at acme dot com', 'find us online an email address'],
  ['tickets are sold here and at acme dot com', 'tickets are sold here an email address'],
];

/**
 * Ordinary websites, kept (ordinary-website.ts): a written "." domain of one
 * label with a .com/.org/.net/.edu/.gov ending, no mail host, a plain lower-case
 * word before "at" that is no mailbox name, in an allow-listed frame, and no
 * contact word just before. 27 of #2756's 96 declared over-blanks and the 3 its
 * verifier found are here.
 */
const WEBSITE_KEPT: readonly string[] = [
  'Bought shoes at zappos.com',
  'booked rooms at hotels.com',
  'ordered flowers at ftd.com for mom',
  'my sister at stanford.edu called',
  'I saw it at amazon.com',
  'ordered a lamp at target.com',
  'he works at microsoft.com',
  "she's at netflix.com now",
  'sign up at eventbrite.com',
  'read it at nytimes.com',
  'watch it at youtube.com',
  'available at amazon.com',
  'learn more at acme.com',
  'find out more at acme.com',
  'on sale at target.com',
  'the recipe is at bonappetit.com',
  "it's on sale at macys.com",
  'available now at apple.com',
  'tickets on sale at ticketmaster.com',
  'she interned at google.com',
  'her friend at google.com',
  'her boss at acme.com',
  'his boss at acme.com',
  'apply online at acme.com',
  'pay online at pge.com',
  'found it at ebay.com',
  'look at example.com for the form',
  'sold out at target.com',
  'prices are lower at costco.com',
  'my son at harvard.edu',
  'My son at Harvard.edu',
  'bought a lamp at ikea.com',
  'my daughter at smith.edu',
  'she works at acme.com',
  'sneakers are on sale at nike.com',
  'sold out at Target.com',
];

/**
 * Each guard of the website exception, pinned: a role word, a name (any case),
 * a said "dot", a mail host, a dotted or non-generic domain, an "@", a contact
 * word before it, a lookalike letter, a determiner standing in for goods, a
 * chain of "at"s. Each blanks as #2756 did; the last three blank where #2756 didn't.
 */
const WEBSITE_STILL_BLANKED: ReadonlyArray<readonly [string, string]> = [
  ['ordered from sales at acme.com', 'ordered from an email address'],
  ['ordered the team at acme.com', 'ordered the an email address'],
  ['my team at acme.com', 'my an email address'],
  ['the boss at acme.com', 'the an email address'],
  ['boss at acme.com', 'an email address'],
  ['bought team at acme.com', 'bought an email address'],
  ['bought tickets at acme.com', 'bought an email address'],
  ['ordered gifts at acme.com', 'ordered an email address'],
  ['on sale at sales at target.com', 'on sale at an email address'],
  ['met Sarah at acme.com', 'met an email address'],
  ['ordered a Kofi at acme.com', 'ordered a an email address'],
  ['ordered a kofi at acme.com', 'ordered a an email address'],
  // A capitalised word before "at" is a name, even a frame word.
  ['my Son at harvard.edu', 'my an email address'],
  ['ordered a Lamp at target.com', 'ordered a an email address'],
  ['bought kofi at acme.com', 'bought an email address'],
  ['bought shoes at zappos dot com', 'bought an email address'],
  ['my son at harvard dot edu', 'my an email address'],
  ['her boss at gmail.com', 'her an email address'],
  ['bought shoes at mail.com', 'bought an email address'],
  ['my son at jo.smith.com', 'my an email address'],
  ['my son at mail.harvard.edu', 'my an email address'],
  ['her boss at acme.io', 'her an email address'],
  ['my son at smithfamily.com', 'my an email address'],
  ['my daughter at smith.com', 'my an email address'],
  ['bought it at sam@acme.com', 'bought it at an email address'],
  ['email my son at harvard.edu', 'email my an email address'],
  ['send it to my boss at acme.com', 'send it to my an email address'],
  ['venmo her boss at acme.com', 'venmo her an email address'],
  ['bought shoеs at zappos.com', 'bought an email address'],
  ["ordered a o'brien at acme.com", 'ordered a an email address'],
  ['ordered a jo-ann at acme.com', 'ordered a an email address'],
  ['my son at harvard.edu at gmail.com', 'my an email address'],
  ['bought shoes at zappos.com at gmail.com', 'bought an email address'],
  // A fullwidth or ideographic dot is a written dot: these blank now (#2756 left them).
  ['jo at gmail．com', 'an email address'],
  ['sales at acme。com', 'an email address'],
  ['bought shoes at zappos．com', 'bought an email address'],
];

/**
 * The keep floor: main before #2716 left each of these as written, and none is
 * a contact, so they stay as written.
 */
const KEEP_FLOOR: readonly string[] = [
  // A said "dot" that isn't a domain.
  'She looked great at polka dot night',
  'mortgage rates at six dot two percent',
  'we upgrade at three dot oh',
  'release at two dot one dot three',
  'good at math dot period',
  'kids at grandma dot dot dot',
  'kids at grandma dot dot dot later',
  'good at math dot dot dot later',
  // Years and date ranges.
  'the 2026/2027 school year',
  'fiscal 2025/2026 budget',
  'trip 2026-10-24–2026-10-30',
  'trip 10/24/2026-10/30/2026',
  'trip 10/24/2026 – 10/30/2026',
];

const MUST_NOT_BLANK: readonly string[] = [
  // Dates.
  'rent due 2026-11-01',
  'rent due (2026-11-01)',
  'dentist 2026-10-22 8:30',
  'dentist 2026-10-22T08:30',
  'meet (2026-11-01 8:30) sharp',
  'from 2026-11-01 to 2026-11-05',
  'renew by 11/05',
  'on 11/05/2026',
  'pick up (2) prescriptions on 2026-11-01',
  // Times.
  'call at 3:30',
  'call at (3pm)',
  'pick up 2 bags at 10:30',
  'between 9:00 and 17:30',
  // Money.
  'pay $1,250.00 for the deposit',
  'pay $12,500 by friday',
  'refund of 1,250,000.00 pending',
  // Short reference numbers.
  'room (12)',
  'flight 1234',
  'order 123456 shipped',
  'page (12) of (30)',
  'zip 94107 and (12)',
  'gate 23 at terminal 4',
  'set the thermostat to 68',
  'room ١٢',
  'order ١٢٣٤٥٦',
  // Prose with "at", "dot" and digit words.
  'meet at the dot com party',
  'look at that',
  'stare at the dot on the map',
  'she works at google',
  'meet at noon dot',
  'one two three four five six',
  'one or two of them',
  'take two pills at nine',
  'oh, one more thing',
  'someone oneself ohio',
  'I have five kids and two dogs',
  'the x-ray at 3pm',
  'buy 2 x 4 boards',
  'meet at my dot com office',
  'the party at the dot com launch',
  'dinner at my dot com friends place',
  'chapter 7 of nine',
  'call mom at 7',
  // A company at a domain is where someone is, not an address.
  'polka dot dress at the shop',
  'meet at noon dot then lunch',
  'meet @ 5.30',
  // A count with a year after it.
  'at five o’clock',
  "at five o'clock",
  // Slashed dates and ranges with dashes.
  'on 11/05/2026',
  'from 11/05/2026 to 11/12/2026',
  'on 2026/11/05',
  'dentist 2026–10–22',
  'pages 100–250',
  'tickets 3/4',
];

describe('withoutContactDetails', () => {
  it('has enough cases on both sides', () => {
    expect(SHOULD_BLANK.length).toBeGreaterThanOrEqual(40);
    expect(MUST_NOT_BLANK.length).toBeGreaterThanOrEqual(40);
  });

  it.each(SHOULD_BLANK)('blanks %j', (input, expected) => {
    expect(withoutContactDetails(input)).toBe(expected);
  });

  it.each(MUST_NOT_BLANK)('leaves %j as written', (input) => {
    expect(withoutContactDetails(input)).toBe(input);
  });

  it.each(LEAK_FLOOR)('still blanks %j, as #2716 did', (input, expected) => {
    expect(withoutContactDetails(input)).toBe(expected);
  });

  it.each(KEEP_FLOOR)('leaves %j as main did', (input) => {
    expect(withoutContactDetails(input)).toBe(input);
  });

  it.each(OVER_BLANKED)('blanks %j, on purpose', (input, expected) => {
    expect(withoutContactDetails(input)).toBe(expected);
  });

  it.each(WEBSITE_KEPT)('leaves the website in %j as written', (input) => {
    expect(withoutContactDetails(input)).toBe(input);
  });

  it.each(WEBSITE_STILL_BLANKED)('still blanks %j, website or not', (input, expected) => {
    expect(withoutContactDetails(input)).toBe(expected);
  });

  // A contact near the MAX_TEXT cut never shows, whatever surrounds it (words,
  // emoji, CJK with no gap): the cut lands well clear of it, or the text is dropped.
  it.each([
    ['words', 'we talked about the garden and the weather for a while '],
    ['emoji', '🙂🌿🙂🌿'],
    ['cjk', '中さんによろしく'],
    ['dashes', '— – — '],
    ['caps', 'OK! SURE! '],
  ])('blanks a contact at any offset in a long text of %s', (_name, filler) => {
    for (const contact of [
      '415 555 0132',
      'jo dot lee at example dot com',
      'jane @ gmail.com',
      'four one five five five five o one seven seven',
    ]) {
      for (let pad = 1_900; pad <= 2_110; pad += 5) {
        const lead = filler.repeat(Math.ceil(pad / filler.length)).slice(0, pad);
        const out = withoutContactDetails(`${lead} call ${contact} soon`);
        expect(out).not.toMatch(/\p{Nd}/u);
        expect(out).not.toMatch(/\b(?:jo|lee|example|jane|gmail|seven)\b/);
      }
    }
  });

  // At most MAX_TEXT chars are blanked, so a long text costs the same as a short one.
  it.each([
    ['said dots', 'dot '.repeat(100_000)],
    ['one run of letters', 'a'.repeat(400_000)],
    ['dotted letters', 'a.'.repeat(200_000)],
    ['brackets after a digit', `1${'('.repeat(399_999)}`],
    ['at and dot', 'x at y dot '.repeat(36_400)],
    ['a dotted name', 'jo dot '.repeat(57_200)],
    ['repeated addresses', 'lunch at netflix dot com '.repeat(16_000)],
    ['a chain of addresses', 'jo at x dot com '.repeat(25_000)],
    ['websites', 'bought shoes at zappos.com '.repeat(15_000)],
    ['websites and an address', 'my son at harvard.edu at x.com '.repeat(13_000)],
    ['spaced @', 'a @ '.repeat(100_000)],
    ['said digits', 'one '.repeat(100_000)],
  ])('blanks 400k chars of %s in under 100 ms', (_name, text) => {
    withoutContactDetails(text.slice(0, 5_000));
    const start = performance.now();
    withoutContactDetails(text);
    expect(performance.now() - start).toBeLessThan(100);
  });

  it('cuts a long text at a gap well clear of any contact, and drops the rest', () => {
    const words = 'we talked about the garden and the weather for a while '.repeat(40);
    const text = `${words.slice(0, MAX_TEXT - 6)} call 415 555 0132 or jo at gmail dot com`;
    const out = withoutContactDetails(text);
    expect(out.endsWith(' …')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(MAX_TEXT + 2);
    expect(out).not.toMatch(/\p{Nd}|\bjo\b|gmail/u);
    expect(out.startsWith('we talked about the garden')).toBe(true);
  });

  // A contact can span any run of space or punctuation; the cut never falls inside one.
  const SPANNING: readonly string[] = [
    `five five five${' '.repeat(200)}0199`,
    `ana at${' '.repeat(200)}gmail dot com`,
    `ana${'\n'.repeat(150)}at gmail dot com`,
    `jo dot${'\t'.repeat(120)}lee at gmail dot com`,
    `four one five;${' '.repeat(300)}five five five; oh one three two`,
    `415 ${' - '.repeat(80)} 555 ${'.'.repeat(100)} 0132`,
    `kofi ＠${' '.repeat(100)}acme dot io`,
    `jo (at)${' '.repeat(100)}acme dot io`,
  ];
  it.each(SPANNING)('never shows any part of %j at any offset around MAX_TEXT', (contact) => {
    const filler = 'we talked about the garden and the weather for a while '.repeat(60);
    for (let pad = MAX_TEXT - 450; pad <= MAX_TEXT + 20; pad++) {
      const out = withoutContactDetails(`${filler.slice(0, pad)} call ${contact} soon`);
      expect(out).not.toMatch(/\p{N}/u);
      expect(out).not.toMatch(/\b(?:ana|jo|lee|kofi|gmail|acme|four|five|one|three|two|oh)\b/iu);
    }
  });

  it('shows only "…" for a long text with no clear gap', () => {
    expect(withoutContactDetails('415 555 0132 '.repeat(400))).toBe('…');
    expect(withoutContactDetails(`call ${'٤١٥٥٥٥٠١٣٢'.repeat(300)}`)).toBe('…');
  });

  it('blanks a text right at MAX_TEXT whole', () => {
    const text = `${'x'.repeat(MAX_TEXT - 13)} 415 555 0132`;
    expect(text).toHaveLength(MAX_TEXT);
    expect(withoutContactDetails(text)).toBe(`${'x'.repeat(MAX_TEXT - 13)} a number`);
  });
});
