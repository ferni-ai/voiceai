/**
 * Remove Cartesia speech-markup guidance from a prompt.
 *
 * The cascade prompts teach the LLM to write Cartesia tags (<emotion/>,
 * <break/>, <speed/>, [laughter]) because Cartesia renders them. When Gemini
 * Live speaks the reply itself, those instructions are wrong: the model would
 * say the syntax aloud or imitate it instead of the emotion. Sections about
 * SSML/markup are dropped whole, and any remaining line that still shows tag
 * syntax is dropped too.
 *
 * @module agents/personas/strip-speech-markup
 */

const MARKUP = /<\/?(?:emotion|break|speed|volume|spell|prosody|speak)\b|\[\s*laugh(?:ter|s|ing)?\s*\]/i;
const MARKUP_HEADING = /\b(?:ssml|markup|emotion tags?|nonverbal|laughter)\b/i;
const HEADING = /^(#{1,6})\s+(.*)$/;

export function hasSpeechMarkup(text: string): boolean {
  return MARKUP.test(text);
}

export function stripSpeechMarkupGuidance(prompt: string): string {
  if (!hasSpeechMarkup(prompt) && !MARKUP_HEADING.test(prompt)) return prompt;

  const out: string[] = [];
  let skipDepth = 0; // heading level of the section being dropped, 0 = keeping

  for (const line of prompt.split('\n')) {
    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (skipDepth && level > skipDepth) continue; // subsection of a dropped section
      skipDepth = MARKUP_HEADING.test(heading[2]) ? level : 0;
      if (skipDepth) continue;
    } else if (skipDepth) {
      continue;
    }
    if (MARKUP.test(line)) continue;
    out.push(line);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}
