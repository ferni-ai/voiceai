# Tool grounding: known gaps

`tool-grounding.mjs` checks the numbers and names in a lookup reply against that turn's tool
output, word by word. The nightly reports it only (`capabilities.json` `tool-grounding`, never
exit 1). Four rounds of held-out fixtures on #3143 kept finding new phrasings that get past
lexical rules, which is the usual pattern for word-list classifiers. The way to make it blocking
is a model-judge grounding check, which is a separate piece of work. Until then, these are the
gaps we know about. All examples are fictional.

## Inventions it misses

**Cents or minutes without the dollars or hours.** A price's cents back a number said as cents.
A duration's minutes past the hour back a number said as minutes. Neither the dollars nor the
hours part is checked, so a wrong amount gets through when its leftover part matches.

- Tool `"Desk lamp $12.95"`, reply "That lamp costs ninety-five cents." or "It's a dollar and
  ninety-five cents." Both pass.
- Tool `"Runtime: 134 minutes"`, reply "The movie is only fourteen minutes long." or "It runs an
  hour and fourteen minutes." Both pass.

The fix is to read the whole spoken amount ("an hour and fourteen minutes" is 74, "a dollar and
ninety-five cents" is 195) and require that value in the tool output.

**Word quantities aren't numbers.** Words like "half", "quarter", "couple" and "dozen" are never
read as numbers, so the reply can't be wrong about them. Tool `"Runtime: 134 minutes"`, reply
"It runs about an hour and a half." passes (134 minutes is closer to two and a quarter hours).

**A rounded number near a real one, when hedged.** After "about", "around", "roughly", "nearly",
"almost", "approximately" or "~", the number straight after the hedge may be within 5% of a tool
number. "about four hundred and thirty" passes against 412. A number with no hedge must match
exactly.

## Faithful replies it flags (false positives)

**A hedge that lands on a code doesn't carry on to the number after it.** A hedge covers the
number straight after it (one "a" or "an" and a unit suffix are fine: "about a forty-minute
drive"), and never a code number ("about a 1530 flight"). Tool `UA 1549, 41 min`,
reply "It's about UA 1549, forty minutes." flags 40, because "about" is followed by "UA", so
nothing is hedged and 40 isn't 41.

**Spoken decimals.** "point" isn't read, so a decimal's parts are graded as whole numbers. Tool
`"Market size: 6.3 billion"`, reply "The market is about six-point-three billion dollars." flags 3.

**General-knowledge names and the time of day.** Names that aren't in the tool output (an event,
a mountain range), and a clock time Ferni adds, are flagged. Tool `"Rivertown Otters 5, Bay Gulls
3, final"`, reply "The Otters won the World Series final." flags World Series. "It was nearly two
in the morning when it ended." flags 2.

**Broken caption fragments.** A capitalised fragment left mid-sentence by a cut or restarted
caption reads as a name. Reply "Okay so Hang on, it is thirty-nine." flags Hang.

**ISO datetimes with a time.** A date backs its weekday only when written as `YYYY-MM-DD` on its
own. Tool `{"start":"2026-11-06T10:00"}`, reply "Your appointment is on Friday." flags Friday,
although 2026-11-06 is a Friday. Real calendar tool output hasn't been checked for this form yet.

**Months from ISO dates.** An ISO date backs its weekday but not its month. Tool
`"date":"2026-04-15"`, reply "Registration opens in April." flags April.

**Airline names against codes.** Tool `{"flight":"B6 1188","depart":"21:05"}`, reply "The JetBlue one, B6 1188,
leaves at nine oh five." flags JetBlue. Nothing maps carrier codes to airline names.

**Sentence-first subjects read as names.** A capitalised first word followed by "is", "are",
"was" or "has" is graded as a name, so that an invented "Nopalito is a great pick." is caught.
A noun in that position that the tool doesn't use gets flagged too. Tool `"Nuggets vs Lakers,
19:00 local"`, reply "Tipoff is at seven PM tonight." flags Tipoff (the time is backed).

**A name used to address someone.** Only the eval caller (`EVAL_CALLER_NAME`, default Sam) is
skipped. "Morning, Robin." flags Robin. Skipping every ", Name." would let "a Thai spot, Lotus."
through.

## Fixed (kept here so it isn't re-reported)

**Two hedges in one sentence.** Each hedge is now read on its own. "It's about forty minutes and
around three hundred dollars." against 41 minutes and $312 grades clean, and "around four hundred
dollars" is flagged.
