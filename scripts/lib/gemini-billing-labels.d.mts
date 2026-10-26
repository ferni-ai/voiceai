export type BillingLabels = Record<string, string>;
export function sanitizeLabelValue(value: string): string;
export function jobFromEntry(entry: string | undefined): string | undefined;
export function scriptBillingLabels(
  env?: Readonly<Record<string, string | undefined>>,
  entry?: string
): BillingLabels;
export function withBillingLabels<T extends object>(
  body: T,
  labels?: BillingLabels
): T & { labels: BillingLabels };
