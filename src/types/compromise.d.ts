/**
 * Type declarations for compromise NLP library and plugins
 *
 * The compromise library is a JavaScript natural language processing library.
 * These declarations provide minimal types needed for our NER engine.
 *
 * @see https://github.com/spencermountain/compromise
 */

declare module 'compromise' {
  interface Term {
    text: string;
    normal: string;
    tags: Record<string, boolean>;
  }

  interface View {
    text(): string;
    json(): Array<{
      text: string;
      normal?: string;
      terms?: Term[];
      [key: string]: unknown;
    }>;
    found: boolean;
    length: number;
    docs: Array<Array<{ text: string; normal?: string; tags?: Record<string, boolean> }>>;
  }

  interface Document extends View {
    // Matching
    match(pattern: string): View;
    not(pattern: string): Document;
    has(pattern: string): boolean;

    // POS tagging
    nouns(): View;
    verbs(): View;
    adjectives(): View;
    adverbs(): View;
    people(): View;
    places(): View;
    organizations(): View;
    values(): View;
    dates(): View;
    numbers(): View;

    // Transformation
    normalize(): Document;
    toLowerCase(): Document;
    toUpperCase(): Document;

    // Output
    text(): string;
    json(): Array<{ text: string; [key: string]: unknown }>;
    out(format?: string): unknown;

    // Plugin extension
    extend(plugin: unknown): void;
  }

  interface CompromiseStatic {
    (text: string): Document;
    extend(plugin: unknown): CompromiseStatic;
  }

  const nlp: CompromiseStatic;
  export default nlp;
  export type { Document, View, Term };
}

declare module 'compromise-dates' {
  import type { Document } from 'compromise';

  type DatesPlugin = (Doc: unknown) => void;

  interface DatesView {
    dates(): {
      get(): Array<{
        start?: Date;
        end?: Date;
        text?: string;
      }>;
      json(): Array<{
        start?: string;
        end?: string;
        text?: string;
        duration?: { years?: number; months?: number; days?: number };
      }>;
    };
    durations(): {
      get(): Array<{
        hours?: number;
        minutes?: number;
        seconds?: number;
      }>;
    };
    times(): {
      get(): Array<{
        hour?: number;
        minute?: number;
        second?: number;
      }>;
    };
  }

  const plugin: DatesPlugin;
  export default plugin;
}

declare module 'compromise-numbers' {
  type NumbersPlugin = (Doc: unknown) => void;

  interface NumbersView {
    numbers(): {
      get(): number[];
      json(): Array<{
        text: string;
        number: number;
        ordinal?: boolean;
      }>;
      toNumber(): this;
      toText(): this;
      toOrdinal(): this;
      toCardinal(): this;
    };
  }

  const plugin: NumbersPlugin;
  export default plugin;
}
